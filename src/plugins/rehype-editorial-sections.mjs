import { EXIT, visit } from 'unist-util-visit'

function moveOpeningQuote(quote) {
  const firstParagraph = quote.children.find(child => child.type === 'element' && child.tagName === 'p')
  if (!firstParagraph) {
    return
  }

  visit(firstParagraph, 'text', (node, index, parent) => {
    if (!node.value.trim()) {
      return
    }

    const opening = /^\s*([“「])/u.exec(node.value)
    if (opening && parent && index !== undefined) {
      node.value = node.value.slice(opening[0].length).trimStart()
      parent.children.splice(index, 0, {
        type: 'element',
        tagName: 'span',
        properties: { className: ['editorial-opening-quote'] },
        children: [{ type: 'text', value: opening[1] }],
      })
    }
    return EXIT
  })
}

export function rehypeEditorialSections() {
  return (tree) => {
    const blocks = tree.children.filter(node => node.type === 'element')

    for (const block of blocks) {
      if (block.tagName === 'blockquote' && block.properties.className?.includes('editorial-quote')) {
        moveOpeningQuote(block)
      }

      if (block.tagName !== 'h2' && block.tagName !== 'h3') {
        continue
      }

      const first = block.children[0]
      const match = first?.type === 'text' && /^(\d{1,2})([、.．]?\s*)(?=[\p{Script=Han}A-Z])/u.exec(first.value)
      if (!match) {
        continue
      }

      const [, number, gap] = match
      first.value = first.value.slice(match[0].length)
      block.children.unshift(
        { type: 'element', tagName: 'span', properties: { className: ['editorial-section-number'] }, children: [{ type: 'text', value: number }] },
        { type: 'text', value: gap },
      )
    }

    const [lead, heading] = blocks
    if (lead?.tagName === 'p'
      && heading?.children?.[0]?.properties?.className?.includes('editorial-section-number')) {
      const first = lead.children[0]
      const text = first?.type === 'text' ? first.value : first?.children?.[0]?.value
      if (typeof text === 'string' && /^(?:请[^。！？]{1,80}(?:关注|跟进)|编者按|由于近段时间投稿)/u.test(text)) {
        lead.properties.className = [...(lead.properties.className ?? []), 'editorial-lead']
      }
    }
  }
}
