import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import MarkdownIt from 'markdown-it'
import { parse } from 'node-html-parser'
import sharp from 'sharp'

const run = promisify(execFile)
const agent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.34(0x16082222) NetType/WIFI Language/zh_CN'
const albumURL = 'https://mp.weixin.qq.com/mp/appmsgalbum?action=getalbum&__biz=Mzg2MjcwNzQ1Mw==&album_id=2132825092492492801&count=20'
const markdown = new MarkdownIt()
const blockTags = new Set(['div', 'section', 'p', 'article', 'header', 'footer', 'blockquote', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'figure', 'figcaption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
const blockSelector = [...blockTags].join(',')
const ignoredTags = 'script, style, template, noscript, mp-style-type'

async function download(url, bytes = false) {
  const args = ['--fail', '--silent', '--show-error', '--location', '--proto', '=https', '--proto-redir', '=https', '--compressed', '--connect-timeout', '8', '--max-time', '25', '--retry', '2', '--retry-max-time', '55', '-A', agent, url]
  try {
    return (await run('curl', args, { encoding: bytes ? 'buffer' : 'utf8', maxBuffer: 26 * 1024 * 1024 })).stdout
  }
  catch (cause) {
    throw new Error(`Public WeChat resource request failed (curl exit ${cause.code ?? 'unknown'})`)
  }
}

function articleSource(value) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.host !== 'mp.weixin.qq.com'
    || url.username || url.password || url.pathname !== '/s'
    || !url.searchParams.get('mid') || !url.searchParams.get('idx')) {
    throw new Error('Unexpected article URL in WeChat album')
  }
  url.protocol = 'https:'
  url.hash = ''
  return url
}

function sourceKey(url) {
  return [url.searchParams.get('__biz'), url.searchParams.get('mid'), url.searchParams.get('idx')].join('/')
}

function mediaURL(value) {
  if (!value) {
    return undefined
  }
  const url = new URL(value.replace(/^\/\//, 'https://').replaceAll('&amp;', '&'))
  if (!['http:', 'https:'].includes(url.protocol) || !url.host.endsWith('.qpic.cn') || url.username || url.password) {
    throw new Error('Unexpected image URL in WeChat article')
  }
  url.protocol = 'https:'
  return url.href
}

function albumPage(html) {
  const details = new Map(Array.from(
    html.matchAll(/create_time:\s*'(\d+)',\s*cover_img_1_1:\s*'([^']*)',\s*url:\s*'[^']*',[\s\S]*?msgid:\s*'(\d+)',\s*itemidx:\s*'(\d+)'/g),
    item => [`${item[3]}:${item[4]}`, { timestamp: Number(item[1]), cover: item[2] }],
  ))
  return parse(html).querySelectorAll('li.js_album_item').map((node) => {
    const mid = node.getAttribute('data-msgid')
    const idx = node.getAttribute('data-itemidx')
    const position = Number(node.getAttribute('data-pos_num'))
    const source = articleSource(node.getAttribute('data-link'))
    if (!/^\d+$/.test(mid ?? '') || !/^\d+$/.test(idx ?? '') || !Number.isSafeInteger(position) || position < 1
      || source.searchParams.get('mid') !== mid || source.searchParams.get('idx') !== idx) {
      throw new Error('Invalid WeChat album entry')
    }
    return {
      position,
      mid,
      idx,
      source,
      title: node.getAttribute('data-title')?.trim(),
      ...details.get(`${mid}:${idx}`),
    }
  })
}

async function newArticles(catalog, get) {
  const latest = Object.keys(catalog)
    .filter(key => /^sddx-\d+$/.test(key) && !catalog[key].unavailable)
    .sort((a, b) => Number(b.slice(5)) - Number(a.slice(5)))[0]
  if (!latest) {
    throw new Error('No verified WeChat archive baseline')
  }
  const baseline = Number(latest.slice(5))
  const baselineKey = sourceKey(articleSource(catalog[latest].source))
  const knownSources = new Set(Object.values(catalog).map(entry => sourceKey(articleSource(entry.source))))
  const pending = []
  let expected
  let url = albumURL
  for (let page = 0; page < 30; page++) {
    const rows = albumPage(await get(url))
    if (!rows.length) {
      throw new Error('Public WeChat album returned no entries')
    }

    for (const entry of rows) {
      expected ??= entry.position
      if (entry.position !== expected || entry.position < baseline) {
        throw new Error('WeChat album numbering changed or contains gaps above the archive baseline')
      }
      expected--
      const key = sourceKey(entry.source)
      if (entry.position === baseline) {
        if (key !== baselineKey) {
          throw new Error('WeChat album baseline no longer matches the archived source')
        }
        return pending.reverse()
      }
      if (knownSources.has(key) || !entry.title || !Number.isSafeInteger(entry.timestamp)
        || entry.timestamp < 1 || entry.timestamp * 1000 > Date.now() + 86_400_000) {
        throw new Error(`Duplicate source or missing publication data at album position ${entry.position}`)
      }
      knownSources.add(key)
      pending.push(entry)
    }
    const tail = rows.at(-1)
    url = `${albumURL}&begin_msgid=${tail.mid}&begin_itemidx=${tail.idx}`
  }
  throw new Error('Archive baseline was not found within 30 album pages')
}

function textKey(text) {
  return text.replace(/[\s\u200B]+/gu, '')
}

function escapeMarkdown(text) {
  return text.replace(/[\u00A0\u200B]/gu, ' ').replace(/[\\!#*+./<=>[\]_~:-]/g, '\\$&').replaceAll(String.fromCharCode(96), `\\${String.fromCharCode(96)}`)
}

function imageSource(node) {
  const raw = node.getAttribute('data-src') || node.getAttribute('src')
  if (!raw) {
    throw new Error('An article image is missing its source')
  }
  return mediaURL(raw)
}

function externalLink(value) {
  try {
    const url = new URL(value?.replace(/^\/\//, 'https://'))
    if ((url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password) {
      return url.href.replaceAll('(', '%28').replaceAll(')', '%29')
    }
  }
  catch {}
}

function convertBody(body, images) {
  const blocks = []

  function inline(node) {
    if (!node.rawTagName) {
      return node.nodeType === 3 ? escapeMarkdown(node.text) : ''
    }
    if (node.rawTagName === 'br') {
      return '  \n'
    }
    if (node.rawTagName === 'img') {
      return `\n\n![_](${images.get(imageSource(node))})\n\n`
    }
    const text = node.childNodes.map(inline).join('')
    if (!text.trim() || text.includes('\n\n')) {
      return text
    }
    if (node.rawTagName === 'a') {
      const url = externalLink(node.getAttribute('href'))
      return url ? `[${text.trim()}](${url})` : text
    }
    if (['strong', 'b'].includes(node.rawTagName)) {
      return text.replace(/\S(?:[\s\S]*\S)?/u, '**$&**')
    }
    if (['em', 'i'].includes(node.rawTagName)) {
      return text.replace(/\S(?:[\s\S]*\S)?/u, '*$&*')
    }
    return text
  }

  function collect(node) {
    if (!node.rawTagName || !node.childNodes.some(child => blockTags.has(child.rawTagName) || child.querySelector?.(blockSelector))) {
      const formatted = inline(node).trim()
      if (!formatted) {
        return
      }
      const raw = node.text.replace(/\u00A0/gu, ' ').trim()
      const number = /^(\d{1,2})\s+(\S.{0,105})$/u.exec(raw)
      const numberedHeading = number && node.querySelectorAll?.('[style]').some(span => /font-size:\s*(?:1[89]|2\d)px/u.test(span.getAttribute('style')))
      if (numberedHeading) {
        blocks.push(`## ${number[1]} ${escapeMarkdown(number[2])}`)
      }
      else if (/^h[1-6]$/.test(node.rawTagName)) {
        blocks.push(`## ${formatted}`)
      }
      else if (/^(?:“.+”|「.+」)$/su.test(raw) && !formatted.includes('![_](')) {
        blocks.push(formatted.split('\n').map(line => `> ${line}`).join('\n'))
      }
      else {
        blocks.push(formatted)
      }
      return
    }

    let line = ''
    for (const child of node.childNodes) {
      if (blockTags.has(child.rawTagName) || child.querySelector?.(blockSelector)) {
        if (line.trim()) {
          blocks.push(line.trim())
        }
        line = ''
        collect(child)
      }
      else {
        line += inline(child)
      }
    }
    if (line.trim()) {
      blocks.push(line.trim())
    }
  }

  collect(body)
  const output = `${blocks.join('\n\n')}\n`
  const rendered = parse(markdown.render(output))
  if (textKey(rendered.text) !== textKey(body.text)
    || rendered.querySelectorAll('img').length !== body.querySelectorAll('img').length) {
    throw new Error('Converted text or image count does not match the WeChat source')
  }
  return output
}

async function optimizedImage(url, width, get) {
  const source = await get(url, true)
  return sharp(source, { animated: true })
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 84 })
    .toBuffer()
}

async function prepareArticle(entry, get, files) {
  const html = await get(entry.source.href)
  const document = parse(html)
  const body = document.querySelector('#js_content')
  const meta = name => document.querySelector(`meta[property="${name}"]`)?.getAttribute('content')?.trim()
  const title = meta('og:title')
  const summary = meta('og:description')
  if (!body || !title || textKey(title) !== textKey(entry.title) || summary === undefined) {
    throw new Error('Public article body or metadata unavailable, or title differs from the album')
  }
  for (const node of body.querySelectorAll(ignoredTags)) {
    node.remove()
  }
  if (!textKey(body.text)) {
    throw new Error('The public article body is empty')
  }

  const id = `sddx-${String(entry.position).padStart(4, '0')}`
  const images = new Map()
  for (const image of body.querySelectorAll('img')) {
    const url = imageSource(image)
    if (images.has(url)) {
      continue
    }
    const name = `${id}-${String(images.size + 1).padStart(2, '0')}.webp`
    files.set(`src/content/posts/_images/${name}`, await optimizedImage(url, 1600, get))
    images.set(url, `_images/${name}`)
  }
  const content = convertBody(body, images)

  async function storeCover(value, kind, width) {
    const url = mediaURL(value)
    if (!url) {
      return undefined
    }
    const buffer = await optimizedImage(url, width, get)
    const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 20)
    const path = `/wechat/${kind}-${hash}.webp`
    files.set(`public${path}`, buffer)
    const size = await sharp(buffer).metadata()
    return { path, width: size.width, height: size.pageHeight ?? size.height }
  }

  const head = await storeCover(meta('og:image'), 'head', 1100)
  const square = entry.cover || /\bcdn_url_1_1:\s*'([^']+)'/u.exec(html)?.[1]
  const cover = await storeCover(square, 'cover', 320)
  const tagged = /^【(读者投稿|社论|汇总)】/u.exec(title)
  const published = new Date(entry.timestamp * 1000 + 8 * 3_600_000)
    .toISOString()
    .replace('.000Z', '+08:00')
  const fields = {
    title,
    description: summary,
    tags: tagged ? [tagged[1], '社科大'] : ['社科大'],
    abbrlink: id,
    toc: true,
  }
  const frontmatter = Object.entries(fields).map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
  files.set(`src/content/posts/${id}.md`, ['---', ...frontmatter, `published: ${published}`, '---', '', content].join('\n'))
  return [id, {
    source: entry.source.href,
    ...(summary ? { summary } : {}),
    ...(head ? { head: head.path, headWidth: head.width, headHeight: head.height } : {}),
    ...(cover ? { cover: cover.path } : {}),
  }]
}

async function exists(path) {
  try {
    await access(path)
    return true
  }
  catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
    return false
  }
}

export async function syncWechat({ root = '.', get = download } = {}) {
  const index = join(root, 'src/data/wechat-archive.json')
  const catalog = JSON.parse(await readFile(index, 'utf8'))
  const pending = await newArticles(catalog, get)
  if (!pending.length) {
    console.log('No new WeChat articles.')
    return 0
  }

  const files = new Map()
  for (const entry of pending) {
    try {
      const [id, metadata] = await prepareArticle(entry, get, files)
      if (catalog[id]) {
        throw new Error('Archive entry already exists')
      }
      catalog[id] = metadata
    }
    catch (error) {
      throw new Error(`WeChat album position ${entry.position}: ${error.message}`, { cause: error })
    }
  }

  for (const [path, contents] of files) {
    if (await exists(join(root, path))) {
      if (!path.startsWith('public/wechat/') || !contents.equals(await readFile(join(root, path)))) {
        throw new Error(`Output would overwrite an existing file: ${path}`)
      }
      files.delete(path)
    }
  }

  await mkdir(join(root, 'src/content/posts/_images'), { recursive: true })
  await mkdir(join(root, 'public/wechat'), { recursive: true })
  const written = []
  const stagedIndex = `${index}.sync-${process.pid}`
  try {
    for (const [path, contents] of files) {
      const target = join(root, path)
      await writeFile(target, contents, { flag: 'wx' })
      written.push(target)
    }

    await writeFile(stagedIndex, `${JSON.stringify(catalog, null, 2)}\n`, { flag: 'wx' })
    written.push(stagedIndex)
    await rename(stagedIndex, index)
  }
  catch (error) {
    await Promise.allSettled(written.map(path => unlink(path)))
    throw error
  }
  console.log(`Synchronized ${pending.length} WeChat article(s).`)
  return pending.length
}

if (import.meta.main) {
  await syncWechat()
}
