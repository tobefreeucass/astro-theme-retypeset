import type { Language } from '@/i18n/config'
import { getPinnedPosts, getRegularPosts } from '@/utils/content'

const pageSize = 20

export async function getHomePages(lang: Language) {
  const [pinned, regular] = await Promise.all([getPinnedPosts(lang), getRegularPosts(lang)])
  const total = Math.max(1, Math.ceil((pinned.length + regular.length) / pageSize))

  const pages = Array.from({ length: total }, (_, index) => {
    const start = index * pageSize
    const end = start + pageSize

    return {
      lang,
      page: index + 1,
      total,
      pinned: pinned.slice(start, end),
      regular: regular.slice(Math.max(0, start - pinned.length), Math.max(0, end - pinned.length)),
    }
  })

  const timeline = pages.map((entry) => {
    // Pinned posts may be older than the articles they precede.
    const datedPosts = entry.regular.length ? entry.regular : entry.pinned
    const dates = datedPosts.map(post => post.data.published.getTime())

    return {
      page: entry.page,
      latest: dates.length ? Math.max(...dates) : undefined,
      earliest: dates.length ? Math.min(...dates) : undefined,
    }
  })

  return pages.map(entry => ({ ...entry, timeline }))
}

export type HomePage = Awaited<ReturnType<typeof getHomePages>>[number]
