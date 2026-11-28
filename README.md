# Editorial of the Light of Humanity

「人文之光社论」与读者来稿的备用发布站。基于 [Astro](https://astro.build/) 和 [Retypeset](https://github.com/radishzzz/astro-theme-retypeset)，部署于 GitHub Pages。

- [首页](https://tobefreeucass.github.io/) 每页 20 篇，页底按发布日期跳页。置顶文章计入首屏分页。
- [文章搜索](https://tobefreeucass.github.io/search/) 用 Pagefind 检索标题和中文正文。文章评论使用 Giscus。
- [我要投稿](https://tobefreeucass.github.io/submit/) 提供公众号留言、长稿邮箱和投稿指南。
- [运营统计](https://tobefreeucass.github.io/stats/) 在每次构建时重算文章量、正文字数、可识别投稿条目、发布日历、运营天数和正文词云。
- [运营状态](https://tobefreeucass.github.io/status/) 默认正常。只有显式记录异常或恢复才改变状态，顶部横幅和状态页的日期按北京时间更新。

## 本地开发

~~~bash
pnpm install --frozen-lockfile
pnpm dev
pnpm build
pnpm preview
~~~

搜索索引由生产构建生成，使用 pnpm preview 验证完整搜索流程。站点位于域名根路径，base 为 /。推送至 master 后，[Pages 工作流](.github/workflows/deploy.yml) 构建并发布。

## 内容维护

公众号文章写入 [src/content/posts](src/content/posts)，正文配图与正文同级放在 _images/，按 Markdown 相对路径引用，例如 ![_](_images/sddx-0515-01.webp)。公众号摘要、来源、头图及封面登记在 [归档索引](src/data/wechat-archive.json)。标题、日期、段序和配图以原文为准。公开链接不返回正文时保留可取得的元数据。

手动录入可用维护 skill 的 add-post.mjs，或自行创建 Markdown。为手动稿分配稳定 abbrlink，避免占用公众号合集编号。设置 editorial: true 可使用来稿自动排版，文章设置 pin: 1 可置顶。

运营状态的事件保存在 [site-status.json](src/data/site-status.json)。维护 skill 的 set-status.mjs 提供 incident 和 recovery 操作。日期变化与发布构建本身不会生成运营事件。

## 零点自动同步评估

GitHub Actions 支持以 Asia/Shanghai 为时区配置每日零点计划，整点任务可能延迟。可先从托管运行器手动试抓公开合集和原图，确认来源可访问，再启用按合集位置增量同步。有新增且校验通过时才写入归档并触发部署，无新增时保留当前发布结果。[GitHub 调度文档](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

当前工作流由人工推送和手动触发启动。由 GITHUB_TOKEN 推送的提交不会触发现有的 push 部署。同步工作流可在同一次运行完成构建发布，或显式触发已有的部署工作流。[GitHub 令牌触发规则](https://docs.github.com/en/actions/concepts/security/github_token#when-github_token-triggers-workflow-runs)
