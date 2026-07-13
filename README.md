中文 | [English](./README.en.md)

# MLog

MLog 是一个基于 Next.js 16 App Router 的双语博客系统（`/zh`、`/en`），支持 AI 写作增强、前台管理发布、自动化发文与严格双仓隔离。

## 技术栈

- Next.js 16 + React 19 + TypeScript
- Tailwind CSS v4
- Markdown 内容模型：`content/posts/<slug>/{zh,en}.md`
- Remark/Rehype 渲染管线
- Giscus 评论（可选）
- Umami 统计（可选，生产环境启用）

## 环境要求

- Node.js 24+
- pnpm 10+

## 本地启动

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)，根路径会重定向到 `/zh`。

生产构建时，`pnpm build` 会先执行 `pnpm content:pull`（配置了内容仓变量时）。同步按内容分片下载单个 GitHub tarball，以一致快照完成首次预渲染；迁移完成前，它仍会安装历史 `public/images/uploads` 静态资源，保证已有 `/images/uploads/**` URL 不失效。后续文章更新不依赖重新构建。运行时一旦配置远端内容仓，读取、鉴权或解析失败会直接 fail closed，不会回退到可能重新公开已删除或已撤稿文章的构建快照。

公开页面统一读取带 60 秒兜底缓存的 GitHub 运行时内容快照；快照在 Data Cache 中压缩存储，并受下载、解压、文件数和总时长上限保护。普通文章、草稿状态和 `repo-cards.json` 的 PR 通过应用合并成功后会立即失效首页、列表、详情、RSS 与 sitemap 缓存；在 GitHub 手动合并或从站外改内容时，缓存过期后的首次访问会触发后台刷新，随后请求读取新内容。新草稿仍不会出现在公开页面，把已发布文章改为草稿则会在刷新后隐藏。

上述内容变更不会调用 Vercel Deploy Hook，也不需要重新构建。新的 Admin/Agent 图片上传会直接写入 `IMAGE_GITHUB_*` 指定的公开图仓，使用内容哈希不可变路径；它们不创建图片 PR、不修改内容仓，也不调用 Deploy Hook。`VERCEL_DEPLOY_HOOK_URL` 仅为迁移期历史 `public/images/uploads/**` 流程保留，不能用于新媒体链路。Vercel 项目只应绑定代码仓，内容仓和图仓都不能绑定为自动部署来源。教程 docs 镜像也不主动调用 Hook；如果公开镜像仓就是 Vercel 绑定的代码仓，Git 集成仍可能因镜像 PR 合并创建一次部署，建议把镜像迁到不绑定 Vercel 的独立公开仓。

## 主题切换（前台）

- 默认主题：`classic`（当前暖色玻璃态）
- 可选主题：`ornate`（同风格下更华丽、更重质感）
- 作用范围：仅公开站点（`/[locale]`），`/admin` 保持不变
- 开关位置：顶部导航右侧（语言切换旁）
- 持久化：浏览器本地存储键 `mlog_theme_v1`

## 路由

- `/` -> 重定向到 `/zh`
- `/zh` `/en`
- `/zh/about` `/en/about`
- `/zh/blog` `/en/blog`
- `/zh/blog/[slug]` `/en/blog/[slug]`
- `/zh/rss.xml` `/en/rss.xml`
- `/sitemap.xml`
- `/admin`（隐藏入口）
- `/admin/new`
- `/admin/edit/[slug]`
- `/me`
- `/me/login`
- `/studio`（兼容重定向到 `/me`）
- `/studio/login`（兼容重定向到 `/me/login`）
- `/api/cron/github-hot-daily`（Vercel Cron 入口）
- `/api/cron/github-hot-daily-fallback`（Vercel Cron 兜底入口）
- `/api/cron/ai-paper-daily`（AI 论文速读 Cron）
- `/api/cron/tutorial-sync`（教程镜像 Cron）
- `/api/cron/daily-blog`（每日主题文章 Cron）
- `/api/agent`、`/api/agent/post`、`/api/agent/upload`、`/api/agent/media/[id]`（仅管理员密钥可写/读媒体状态）
- `/api/blog/live-card?locale=zh|en&slug=<slug>`（文章实时快照 API）
- `/api/user/history`（读取用户云端历史）
- `/api/user/history/sync`（同步本地历史到私有 Gist）

## 内容合约

每篇文章 frontmatter：

```yaml
title: string
date: ISO date
summary: string
tags: string[]
category: string
cover?: string
draft?: boolean
updated?: ISO date
publishedAt?: ISO timestamp（系统维护）
```

缺少必填字段会在构建阶段失败，并给出具体文件路径。

## 双语行为

- UI 文案由 `src/i18n/dictionaries.ts` 驱动。
- 文章详情页若 `/en/blog/[slug]` 缺失 `en.md`，会回退到 `zh.md` 并显示提示。
- 文章评论固定按 slug 合并（锚点 `/zh/blog/${slug}`），`/zh` 与 `/en` 共用同一评论串。

## SEO / 订阅

- locale metadata（含 `canonical` + `hreflang`）
- `robots.ts`
- `sitemap.ts`
- locale RSS（`app/[locale]/rss.xml/route.ts`）

## 环境变量

| 变量 | 说明 |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | 站点绝对 URL，用于 metadata 与 RSS |
| `NEXTAUTH_URL` | 登录回调基础 URL（本地如 `http://localhost:3000`） |
| `POSTGRES_URL` | Postgres 连接串；Agent 密钥、媒体元数据和上传限流必需，Vercel 环境推荐使用 |
| `DATABASE_URL` | 旧代码路径兼容字段；当前媒体与 Agent 数据链路仍必须配置 `POSTGRES_URL`，不能只填此项 |
| `MEDIA_RATE_LIMIT_HMAC_SECRET` | 媒体限流键的服务端 HMAC 密钥，至少 32 个字符且不得暴露给客户端 |
| `NEXT_PUBLIC_GISCUS_REPO` | Giscus 仓库（`owner/repo`） |
| `NEXT_PUBLIC_GISCUS_REPO_ID` | Giscus repo ID |
| `NEXT_PUBLIC_GISCUS_CATEGORY` | Giscus 分类名 |
| `NEXT_PUBLIC_GISCUS_CATEGORY_ID` | Giscus category ID |
| `NEXT_PUBLIC_GISCUS_MAPPING` | 兼容保留字段（博客评论已固定按 slug 合并） |
| `NEXT_PUBLIC_UMAMI_SCRIPT_URL` | Umami 脚本地址 |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | Umami 网站 ID |
| `UMAMI_API_TOKEN` | 服务端 Umami API token（页脚统计） |
| `UMAMI_API_BASE_URL` | 可选 Umami API 基址 |
| `SITE_START_DATE` | 页脚建站日期（`YYYY-MM-DD`） |
| `AUTH_SECRET` | 登录会话密钥 |
| `AUTH_GITHUB_ID` | GitHub OAuth App client id |
| `AUTH_GITHUB_SECRET` | GitHub OAuth App client secret |
| `ADMIN_GITHUB_ALLOWLIST` | 严格管理员白名单（仅 `2982136527`） |
| `CONTENT_GITHUB_OWNER` | 私有内容仓 owner |
| `CONTENT_GITHUB_REPO` | 私有内容仓 repo |
| `CONTENT_GITHUB_BASE_BRANCH` | 私有内容仓基线分支（默认 `main`） |
| `CONTENT_GITHUB_WRITE_TOKEN` | 私有内容仓写入 token |
| `CONTENT_GITHUB_READ_TOKEN` | 私有内容仓读取 token |
| `IMAGE_GITHUB_OWNER` | 公开图仓 owner，可直接复用 MPic 的图仓配置 |
| `IMAGE_GITHUB_REPO` | 公开图仓 repo |
| `IMAGE_GITHUB_BRANCH` | 图仓分支（默认 `main`） |
| `IMAGE_GITHUB_TOKEN` | 图仓写入 token，仅服务端使用，授予目标仓 Contents 写权限 |
| `IMAGE_GITHUB_PATH_PREFIX` | MLog 在图仓中的隔离前缀（默认 `uploads/blog`） |
| `NEXT_PUBLIC_CDN_BASE_URL` | 可选；映射图仓根目录的公开 HTTPS CDN 基址，未配置时仍会探测 jsDelivr 与 GitHub Raw |
| `PUBLIC_GITHUB_OWNER` | 公开代码/docs 仓 owner |
| `PUBLIC_GITHUB_REPO` | 公开代码/docs 仓 repo |
| `PUBLIC_GITHUB_BASE_BRANCH` | 公开仓基线分支（默认 `main`） |
| `PUBLIC_GITHUB_WRITE_TOKEN` | 公开仓写入 token（教程镜像） |
| `ADMIN_AUTO_MERGE` | 创建 PR 后是否自动尝试合并（默认 `true`） |
| `CRON_SECRET` | Cron Bearer 鉴权密钥 |
| `VERCEL_DEPLOY_HOOK_URL` | 迁移期兼容变量；仅供历史 `public/images/uploads/**` 流程使用，新 Admin/Agent 媒体、文章、草稿、repo-cards 和教程镜像均不调用 |
| `TUTORIAL_SYNC_ENABLED` | 教程镜像定时开关（默认 `false`） |
| `PRIVACY_BLOCKLIST` | 教程镜像隐私拦截词（逗号分隔） |
| `AI_ENABLE` | AI 功能开关（默认 `true`） |
| `AI_PROVIDER_CHAIN` | Provider 主备链路（默认 `gemini,openai,deepseek,qwen`） |
| `AI_TIMEOUT_MS` | AI 总超时预算（默认 `60000`） |
| `AI_RETRY_COUNT` | 全链路重试轮数（默认 `1`） |
| `AI_GEMINI_API_KEY` | Gemini API key |
| `AI_GEMINI_MODEL` | Gemini 模型名 |
| `AI_OPENAI_API_KEY` | OpenAI 兼容 API key |
| `AI_OPENAI_BASE_URL` | OpenAI 兼容 Base URL |
| `AI_OPENAI_MODEL` | OpenAI 兼容模型名 |
| `AI_DEEPSEEK_API_KEY` | DeepSeek API key |
| `AI_DEEPSEEK_BASE_URL` | DeepSeek Base URL（可选） |
| `AI_DEEPSEEK_MODEL` | DeepSeek 模型名 |
| `AI_QWEN_API_KEY` | Qwen API key |
| `AI_QWEN_BASE_URL` | Qwen Base URL（可选） |
| `AI_QWEN_MODEL` | Qwen 模型名 |

### 页脚统计说明

- 显示：累计 UV、累计 PV、平均阅读时长、建站日期
- 优先统计 `/zh/blog/*` 与 `/en/blog/*`
- 不支持路径过滤时自动降级全站统计，并显示口径提示

## 管理后台

- 使用 GitHub OAuth（`next-auth`）+ 白名单授权。
- `/admin` 与 `/api/admin/*` 全部仅管理员可访问。
- 内容发布链路：编辑 -> 新分支改动 -> 创建 PR -> 尝试自动合并 -> 运行时内容快照缓存立即失效。普通文章、草稿状态和 repo-cards 不触发 Vercel 构建。
- 新媒体链路：Admin/Agent -> 校验与处理图片 -> 直接写入专用图仓 -> 可用性探测 -> `ready`。它不创建图片 PR、不触发 Vercel 构建；只有 `ready` 且 `available=true` 的 URL 才能写入正文或封面。

## 用户中心（登录 + 记录）

- 任意 GitHub 登录用户可访问 `/me`。
- 只有严格管理员可以创建 Agent API 密钥和调用写接口。
- 默认记录方式：浏览器本地存储（`localStorage`）。
- 用户中心展示“最近阅读历史”和“最近评论交互记录”。
- 可选启用云同步：用户授权 `gist` 后，同步到自己的私有 Gist（无需数据库）。
- 若拒绝 `gist` 授权，自动降级本地模式，后续可在 `/me` 再次授权并上传本地历史。
- 评论系统继续使用 Giscus；站内仅记录交互事件，不抓取评论正文。
- 旧 `Studio` 路由保留重定向，BYOK/用户自动发文能力已下线。

### 管理接口

- `GET /api/admin/posts?locale=zh|en&keyword=&status=draft|published|all`
- `GET /api/admin/posts/[slug]`
- `POST /api/admin/posts`
- `DELETE /api/admin/posts/[slug]?locale=zh|en|all`
- `GET|POST /api/admin/media`
- `GET|DELETE /api/admin/media/[id]`
- `GET /api/admin/automation/github-hot-daily`
- `PUT /api/admin/automation/github-hot-daily`
- `POST /api/admin/automation/github-hot-daily/run`
- `GET /api/admin/automation/github-hot-daily/candidates`
- `GET|PUT /api/admin/automation/daily-blog`
- `POST /api/admin/automation/daily-blog/run`
- `GET|PUT /api/admin/automation/ai-paper-daily`
- `POST /api/admin/automation/ai-paper-daily/run`
- `POST /api/admin/tutorials/mlog-open-source/sync`

`POST /api/admin/posts` 支持普通文章手动启用 repo 双卡：

```json
{
  "slug": "post-slug",
  "mode": "publish",
  "expectedAction": "create",
  "changes": [],
  "repoCards": {
    "enabled": true,
    "repoUrl": "https://github.com/owner/repo"
  }
}
```

`expectedAction` 必须是 `create` 或 `update`：创建已有 slug 返回 `409`，更新不存在的 slug 返回 `404`。Agent 发文只有在 merge SHA 已出现在基线分支且公开缓存失效成功后才返回 `200/published`；否则返回 `202/pending_review` 或 `202/refresh_pending`。

媒体上传使用 `multipart/form-data`，`file` 必填、`alt` 可选。上传接口在媒体已经可公开读取时返回 `200/201`、`status=ready`、`available=true` 和非空 `url/markdown`；CDN 尚未可用时返回 `202 processing`、`available=false`、`url=null` 及 `poll.url`。调用方必须携带原认证信息，按 `Retry-After` 或 `poll.afterMs` 请求该轮询地址；只有最终得到 `ready + available=true` 后才能引用图片。媒体状态与限流计数保存在 Postgres，首次运行会创建所需表和索引，因此数据库角色需要相应 DDL 权限；数据库或限流不可用时上传会 fail closed。

迁移完成并通过全站零 404 验证前，历史 `/images/uploads/**` 和构建期 `content:pull` 保持兼容；不要提前删除旧文件或关闭旧资源拉取。

## AI 写作增强

- AI 仅在服务端执行，不下发密钥。
- `mode=publish`：补齐另一语言 + 补齐空的摘要/标签/分类。
- `mode=draft`：仅补齐当前语言空字段，不生成另一语言。
- 仅填空，不覆盖人工非空字段。
- 必要步骤失败则阻断发布，避免半成品。

## GitHub 爆火日报自动化

- 执行时间：主任务 `Asia/Shanghai 08:00`（Cron UTC `0 0 * * *`）+ 兜底检查 `Asia/Shanghai 09:10`（Cron UTC `10 1 * * *`）
- 数据源：GitHub Trending Daily
- 选题策略：13 个预设主题 + 叠加关键词 + 排除词 + 最小星标 + 候选窗口
- 空叠加词时：按预设主题池“同日固定随机”
- 同日唯一 + 历史仓库去重
- 自动标签：`ai-auto`、`github-hot`
- 文章合并后通过运行时 GitHub 内容快照和缓存失效上线，不触发 Deploy Hook

## 每日主题文章自动化

- 执行时间：`Asia/Shanghai 09:00`（Cron UTC `0 1 * * *`）
- 默认关闭，配置存放于 `content/system/automation/daily-blog.json`
- 可在 `/admin` 启用、编辑主题池/排除项/长度范围并手动执行
- 支持主题池、排除主题、正文长度范围、同日去重和一次质量重写
- 配置与运行状态写入均遵循内容仓基线分支和 SHA 并发控制
- 自动文章合并后使用同一运行时内容快照发布链路，无需重新构建

## AI 论文速读自动化（非 GitHub）

- 执行时间：`Asia/Shanghai 12:30`（Cron UTC `30 4 * * *`）
- 数据源：arXiv + Papers with Code
- 筛选参数：arXiv 分类、候选窗口、最低信号分、是否优先有代码论文
- 同日唯一 + 历史论文去重
- 自动标签：`ai-paper`、`paper-daily`
- 发布策略：AI 质检 + 低质量自动重写 1 次 + 通过后自动直发
- 文章合并后通过运行时内容快照和缓存失效上线，不触发 Deploy Hook

### 日报质量策略

- 默认深度评测（正文目标 1200-1800 中文字符）
- “事实”与“推断”分区输出
- 文末证据来源卡（URL + 抓取时间）
- 质量门禁失败会阻断发布（含重试）

## 快照卡机制

### 热门日报实时卡

- 仅对同时带 `ai-auto` + `github-hot` 标签文章启用
- 详情页显示两张卡：`发布快照卡` + `实时快照卡`
- 不卡正文：上游失败时仅实时卡降级

### 普通文章手动双卡

- 后台可为普通文章配置 `repo-cards.json`
- 同一 slug 下 `zh/en` 共用一套 repo 双卡配置
- 静态快照首次发布锁定；仅当 repo URL 变更时重抓
- 双卡启用时，前台会隐藏正文中的“已确认事实（数据卡）”章节以避免重复

## 教程公开镜像

- 白名单仅 `mlog-open-source-deploy-guide`
- 教程源文在博客内容仓
- 每次执行教程同步时，会按 `Asia/Shanghai` 刷新教程文章 `updated` 为当天日期
- 教程源文属于普通文章内容，合并后由运行时快照刷新，本身不需要重新构建
- 教程同步还会把白名单文档写入公开仓，但不会显式调用 Deploy Hook。`docs/tutorials/**` 不参与站点构建；如果该公开仓同时是 Vercel 绑定的代码仓，Git 集成仍可能因镜像 PR 合并创建部署。要消除这类无效构建，应把教程镜像迁到不绑定 Vercel 的独立公开仓
- 仓库默认关闭教程镜像 Cron；如需恢复自动检查，可自行重新添加 `/api/cron/tutorial-sync` 的调度并将 `TUTORIAL_SYNC_ENABLED=true`
- 同步后镜像到公开仓：
  - `docs/tutorials/mlog-open-source-deploy-guide.zh.md`
  - `docs/tutorials/mlog-open-source-deploy-guide.en.md`
- 其他文章不会公开同步

## 故障排查（常见错误码）

- `401 UNAUTHORIZED`：未登录
- `403 FORBIDDEN`：账号不在管理员白名单
- `409 SHA_CONFLICT`：编辑基线与远端冲突，刷新后重试
- `429 MEDIA_RATE_LIMITED`：媒体上传超过限额，按 `Retry-After` 重试
- `MEDIA_RATE_LIMIT_UNAVAILABLE`：Postgres 或限流密钥不可用，上传被拒绝
- `MEDIA_CONFIG_INVALID`：专用图仓、CDN 或媒体安全配置不完整
- `GITHUB_API_ERROR`：GitHub 操作失败（常见于 merge 被保护规则阻断）
- `AI_CONFIG_ERROR` / `AI_PROVIDER_UNAVAILABLE` / `AI_OUTPUT_INVALID` / `AI_GENERATION_FAILED` / `AI_TIMEOUT`
- `INVALID_AUTOMATION_CONFIG` / `INVALID_AUTOMATION_LAST_RUN`
- `CRON_SECRET_MISSING`

## 维护建议

1. 每次依赖升级后执行 `pnpm lint && pnpm typecheck && pnpm build`
2. 定期轮换 OAuth 与 GitHub token
3. 优先在 Preview 验证管理后台与自动化链路
4. 功能更新后同步更新教程源文并执行教程镜像
