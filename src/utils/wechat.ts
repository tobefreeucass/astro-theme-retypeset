import records from '@/data/wechat-archive.json'

interface WechatArticle {
  source: string
  summary?: string
  head?: string
  headWidth?: number
  headHeight?: number
  cover?: string
}

const archive: Record<string, WechatArticle | undefined> = records

export function getWechatArticle(slug: string) {
  return archive[slug]
}
