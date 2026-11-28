import type { Language } from '@/i18n/config'

export function getSearchMessages(lang: Language) {
  if (lang === 'zh') {
    return { nav: '搜索', title: '搜索文章', placeholder: '输入标题或正文关键词', pending: '正在搜索…', empty: '没有找到相关文章。', failed: '搜索暂时不可用，请稍后再试。', count: '找到 {count} 篇文章', more: '加载更多', requiresScript: '请启用 JavaScript 后搜索。' }
  }
  if (lang === 'zh-tw') {
    return { nav: '搜尋', title: '搜尋文章', placeholder: '輸入標題或內文關鍵字', pending: '正在搜尋…', empty: '找不到相關文章。', failed: '搜尋暫時無法使用，請稍後再試。', count: '找到 {count} 篇文章', more: '載入更多', requiresScript: '請啟用 JavaScript 後搜尋。' }
  }
  return { nav: 'Search', title: 'Search articles', placeholder: 'Search by title or keyword', pending: 'Searching…', empty: 'No matching articles.', failed: 'Search is temporarily unavailable. Please try again.', count: '{count} matching articles', more: 'Load more', requiresScript: 'Enable JavaScript to search.' }
}
