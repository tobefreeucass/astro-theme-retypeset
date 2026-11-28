import { toString } from 'mdast-util-to-string'

const pairs = { '“': '”', '「': '」' }
const submissionLabel = /^(?:读者)?投稿\s*[:：]/
const editorLabel = /^[（(【[]?\s*(?:编者按|编者注|编辑按|编者说明|小编按|编者回复|作者注|注[:：])/u

function startsQuote(text) {
  return text[0] in pairs
}

function isQuoteHeading(node, text) {
  if (node.type !== 'heading' || !startsQuote(text)) {
    return false
  }

  const end = text.lastIndexOf(pairs[text[0]])
  if (end !== -1 && end !== text.length - 1) {
    return false
  }

  const body = text.slice(1, end === -1 ? undefined : -1).trim()
  return end === -1 || body.length > 22 || /[。？！：]/u.test(body) || submissionLabel.test(body)
}

function quoteEnd(nodes, start, opening, allowUnclosed) {
  const closing = pairs[opening]
  let depth = startsQuote(toString(nodes[start]).trim()) ? 0 : 1
  let last = start

  for (let index = start; index < nodes.length; index++) {
    const node = nodes[index]
    const text = toString(node).trim()
    if (index > start && (node.type === 'heading' || node.type === 'blockquote' || node.type === 'thematicBreak'
      || startsQuote(text) || submissionLabel.test(text) || editorLabel.test(text))) {
      break
    }

    last = index
    for (const character of text) {
      if (character === opening) {
        depth++
      }
      else if (character === closing) {
        depth--
      }
    }
    if (depth <= 0) {
      return index
    }
  }

  return allowUnclosed ? last : start
}

function styleQuote(node) {
  node.data = {
    ...node.data,
    hProperties: { ...node.data?.hProperties, className: ['editorial-quote'] },
  }

  const first = node.children[0]
  const second = node.children[1]
  if (first?.type === 'paragraph' && second?.type === 'paragraph' && /^[“「]$/u.test(toString(first).trim())) {
    second.children.unshift(...first.children)
    node.children.shift()
  }

  const last = node.children.at(-1)
  const previous = node.children.at(-2)
  if (last?.type === 'paragraph' && previous?.type === 'paragraph' && /^[”」]$/u.test(toString(last).trim())) {
    previous.children.push(...last.children)
    node.children.pop()
  }
}

export function remarkEditorialQuotes() {
  return (tree, file) => {
    if (file.data.astro.frontmatter.editorial !== true && !/[\\/]sddx-\d+\.mdx?$/i.test(file.path ?? '')) {
      return
    }

    const nodes = tree.children.map((node) => {
      const text = toString(node).trim()
      return isQuoteHeading(node, text)
        ? { type: 'paragraph', children: node.children, position: node.position }
        : node
    })

    const output = []
    let submissionCount = 0
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index]
      if (node.type === 'blockquote' && !/^\[!\w+\]/.test(toString(node).trim())) {
        styleQuote(node)
        output.push(node)
        submissionCount++
        continue
      }

      const text = node.type === 'paragraph' ? toString(node).trim() : ''
      if (!startsQuote(text) && !submissionLabel.test(text)) {
        output.push(node)
        continue
      }

      const end = quoteEnd(nodes, index, startsQuote(text) ? text[0] : '“', /^(?:读者)?投稿\s*[:：]$/.test(text))
      const quote = { type: 'blockquote', children: nodes.slice(index, end + 1) }
      styleQuote(quote)
      output.push(quote)
      index = end
      submissionCount++
    }

    tree.children = output
    file.data.astro.frontmatter.submissionCount = submissionCount
  }
}
