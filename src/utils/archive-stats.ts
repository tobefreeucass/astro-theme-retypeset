import type { Language } from '@/i18n/config'
import MarkdownIt from 'markdown-it'
import { getPosts } from '@/utils/content'
import { shanghaiDay } from '@/utils/shanghai-time'

const markdown = new MarkdownIt()
const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' })
const stopwords = new Set(`
的 了 在 是 与 和 或 及 而 也 于 就 又 被 从 到 对 为 有 都 之 把 将 让 给 向
我们 你们 他们 她们 大家 自己 本人 有人 同学 同学们 同时 还有 以及 因为 由于 所以 如果 然后 但是 不过 因此 并且 目前 最近 之前 之后 当时 今天 昨天 明天 现在 以后 已经 一直 依然 其实 只是 就是 本来 根本 明明 咱们 确实 干嘛 应该 可能 可以 不能 需要 觉得 感觉 认为 看来 来说 这样 那样 如何 怎么 什么 为什么 这个 那个 这些 那些 这里 那里 其中 一些 一点 一个 一下 一次 一定 一种 这种 那种 很多 比较 真的 非常 当然 还是 很是 只能 只要 而且 甚至 只会 这么 那么 多少 有些 是否 不会 不是 没有 不知道 第一次 第二次 各位 不太 太多 不少 不同 其他 直接 确实 实际 一般 比如 例如 总之 反正 至少 基本 只能 仍然 无法 获得 看到 发现 表示 提到 关于 相关 部分 情况 问题 事情 方面 时间 地方 时候 原因 影响 应该 建议 希望 负责 进行 采取 提供 请问 您好 你好 谢谢
投稿 来稿 读者 读者投稿 汇总 整理 社论 原文 公众号 本站 编辑 编者 作者 说明 回复 反馈 提醒 文中 文章 正文 标题 小节 第三 第一 第二 第四 第五 目录 图片 图一 见图 以及 参考 链接 附件 笔者 了解 关注 跟进 及时 相关部门 欢迎 人文之光 社科大 社科 学校
`.trim().split(/\s+/))

const dayMs = 86_400_000
const fixedTopics = new Set(['图书馆', '望京校区', '良乡校区', '奖助学金', '学工处', '教务处', '后勤处', '校医院', '医务室', '奖学金'])
const topicPhrases = new RegExp(`(${[...fixedTopics].join('|')})`, 'gu')

function* paragraphWords(paragraph: string) {
  for (const part of paragraph.split(topicPhrases)) {
    if (fixedTopics.has(part)) {
      yield part
      continue
    }

    for (const { segment, isWordLike } of segmenter.segment(part)) {
      if (isWordLike) {
        yield segment
      }
    }
  }
}

function countDays(from: string, to: string) {
  return (Date.parse(to) - Date.parse(from)) / dayMs + 1
}

function articleText(source: string) {
  const blocks = markdown.parse(source, {})
  const paragraphs: string[] = []
  const body: string[] = []

  for (const [index, block] of blocks.entries()) {
    if (block.type !== 'inline') {
      continue
    }

    const text = (block.children ?? []).map(child =>
      child.type === 'text' || child.type === 'code_inline' ? child.content : '',
    ).join('')
    if (text) {
      body.push(text)
      if (blocks[index - 1]?.type !== 'heading_open'
        && !/^(?:请[^。！？]{1,80}(?:关注|跟进)|(?:读者)?投稿[：:]?\s*$|编者按)/u.test(text.trim())) {
        paragraphs.push(text.replace(/^(?:[“「]\s*)?(?:读者)?投稿\s*[:：]/u, ''))
      }
    }
  }

  return { body: body.join(' '), paragraphs }
}

function getMonths(year: number, first: string, today: string, days: Map<string, number>) {
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1
    const prefix = [year, String(month).padStart(2, '0')].join('-')
    const count = new Date(Date.UTC(year, month, 0)).getUTCDate()
    const cells = Array.from({ length: count }, (_, index) => {
      const date = [prefix, String(index + 1).padStart(2, '0')].join('-')
      return { date, count: days.get(date) ?? 0, available: date >= first && date <= today }
    })
    return {
      month,
      leading: (new Date(Date.UTC(year, index, 1)).getUTCDay() + 6) % 7,
      cells,
      count: cells.reduce((sum, cell) => sum + cell.count, 0),
    }
  }).filter(month => month.cells.some(cell => cell.available))
}

export async function getArchiveStats(lang: Language) {
  const posts = await getPosts(lang)
  const today = shanghaiDay(new Date())
  const first = posts.at(-1) ? shanghaiDay(posts.at(-1)!.data.published) : today
  const latest = posts[0] ? shanghaiDay(posts[0].data.published) : today
  const end = today < latest ? latest : today
  const days = new Map<string, number>()
  const terms = new Map<string, number>()
  const years = new Map<number, { posts: number, words: number, submissions: number }>()
  let words = 0
  let submissions = 0
  let readerPosts = 0

  for (const post of posts) {
    const date = shanghaiDay(post.data.published)
    const year = Number(date.slice(0, 4))
    const { body, paragraphs } = articleText(post.body ?? '')
    const length = body.match(/\p{Script=Han}|[\p{Script=Latin}\p{N}]+|\p{L}/gu)?.length ?? 0
    const contributions = post.remarkPluginFrontmatter.submissionCount ?? 0
    const yearly = years.get(year) ?? { posts: 0, words: 0, submissions: 0 }
    years.set(year, {
      posts: yearly.posts + 1,
      words: yearly.words + length,
      submissions: yearly.submissions + contributions,
    })
    days.set(date, (days.get(date) ?? 0) + 1)
    words += length
    submissions += contributions
    if (post.data.tags?.includes('读者投稿')) {
      readerPosts++
    }

    for (const paragraph of paragraphs) {
      for (const segment of paragraphWords(paragraph)) {
        const word = segment.normalize('NFKC').toLowerCase()
        if (/^\p{Script=Han}{2,10}$/u.test(word) && !stopwords.has(word)) {
          terms.set(word, (terms.get(word) ?? 0) + 1)
        }
      }
    }
  }

  const firstYear = Number(first.slice(0, 4))
  const endYear = Number(end.slice(0, 4))
  const series = Array.from({ length: endYear - firstYear + 1 }, (_, index) => {
    const year = firstYear + index
    const from = year === firstYear ? first : `${year}-01-01`
    const to = year === endYear ? end : `${year}-12-31`
    const months = getMonths(year, first, end, days)
    return {
      year,
      months,
      span: countDays(from, to),
      active: months.reduce((sum, month) => sum + month.cells.filter(cell => cell.count > 0).length, 0),
      ...(years.get(year) ?? { posts: 0, words: 0, submissions: 0 }),
    }
  })

  const cloud = [...terms.entries()]
    .filter(([, count]) => count >= 4)
    .sort(([a, aCount], [b, bCount]) => bCount - aCount || a.localeCompare(b, 'zh-CN'))
    .slice(0, 48)

  return {
    posts: posts.length,
    words,
    submissions,
    readerPosts,
    activeDays: days.size,
    span: posts.length ? countDays(first, end) : 0,
    first,
    latest,
    today,
    series,
    cloud,
  }
}
