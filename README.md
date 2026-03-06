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

- Node.js 20+
- pnpm 10+

## 本地启动

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)，根路径会重定向到 `/zh`。

生产构建时，`pnpm build` 会先执行 `pnpm content:pull`（配置了内容仓变量时），用于拉取私有内容。

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
- `/studio`
- `/studio/login`
- `/api/cron/github-hot-daily`（Vercel Cron 入口）
- `/api/cron/github-hot-daily-fallback`（Vercel Cron 兜底入口）
- `/api/cron/ai-paper-daily`（AI 论文速读 Cron）
- `/api/cron/tutorial-sync`（教程镜像 Cron）
- `/api/cron/user-automation-dispatch`（用户任务分发 Cron，Hobby 为每日一次）
- `/api/blog/live-card?locale=zh|en&slug=<slug>`（文章实时快照 API）

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
```

缺少必填字段会在构建阶段失败，并给出具体文件路径。

## 双语行为

- UI 文案由 `src/i18n/dictionaries.ts` 驱动。
- 文章详情页若 `/en/blog/[slug]` 缺失 `en.md`，会回退到 `zh.md` 并显示提示。

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
| `DATABASE_URL` | Vercel Postgres 连接串（用户 BYOK 与任务调度） |
| `NEXT_PUBLIC_GISCUS_REPO` | Giscus 仓库（`owner/repo`） |
| `NEXT_PUBLIC_GISCUS_REPO_ID` | Giscus repo ID |
| `NEXT_PUBLIC_GISCUS_CATEGORY` | Giscus 分类名 |
| `NEXT_PUBLIC_GISCUS_CATEGORY_ID` | Giscus category ID |
| `NEXT_PUBLIC_GISCUS_MAPPING` | Giscus mapping（默认 `pathname`） |
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
| `PUBLIC_GITHUB_OWNER` | 公开代码/docs 仓 owner |
| `PUBLIC_GITHUB_REPO` | 公开代码/docs 仓 repo |
| `PUBLIC_GITHUB_BASE_BRANCH` | 公开仓基线分支（默认 `main`） |
| `PUBLIC_GITHUB_WRITE_TOKEN` | 公开仓写入 token（教程镜像） |
| `ADMIN_AUTO_MERGE` | 创建 PR 后是否自动尝试合并（默认 `true`） |
| `CRON_SECRET` | Cron Bearer 鉴权密钥 |
| `VERCEL_DEPLOY_HOOK_URL` | 内容合并后触发生产部署的 Hook URL |
| `TUTORIAL_SYNC_ENABLED` | 教程镜像定时开关（默认 `true`） |
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
| `USER_AI_ENCRYPTION_KEY` | 用户 BYOK 密钥加密主密钥（base64 32-byte） |

### 页脚统计说明

- 显示：累计 UV、累计 PV、平均阅读时长、建站日期
- 优先统计 `/zh/blog/*` 与 `/en/blog/*`
- 不支持路径过滤时自动降级全站统计，并显示口径提示

## 管理后台

- 使用 GitHub OAuth（`next-auth`）+ 白名单授权。
- `/admin` 与 `/api/admin/*` 全部仅管理员可访问。
- 发布链路：编辑 -> 新分支改动 -> 创建 PR -> 尝试自动合并 -> 合并后部署。

## 用户 Studio（BYOK + 定时发文）

- 任意 GitHub 登录用户可用 `/studio` 管理自己的模型与任务。
- 用户 API key 仅服务端加密存储，不回传明文。
- 支持用户自定义 5 段 cron + 时区；当前 Vercel Hobby 按平台限制由 `/api/cron/user-automation-dispatch` 每日触发一次（08:20，Asia/Shanghai）。如需高频调度请升级 Vercel Pro 或改用外部调度器。
- 用户任务仅生成草稿（`draft=true`），最终发布需管理员审核。
- 自动追加标签：`ai-user`、`author-<login>`、`provider-<provider>`、`model-<model>`。

### 管理接口

- `GET /api/admin/posts?locale=zh|en&keyword=&status=draft|published|all`
- `GET /api/admin/posts/[slug]`
- `POST /api/admin/posts`
- `DELETE /api/admin/posts/[slug]?locale=zh|en|all`
- `POST /api/admin/media`
- `GET /api/admin/automation/github-hot-daily`
- `PUT /api/admin/automation/github-hot-daily`
- `POST /api/admin/automation/github-hot-daily/run`
- `GET /api/admin/automation/github-hot-daily/candidates`
- `POST /api/admin/tutorials/mlog-open-source/sync`

`POST /api/admin/posts` 支持普通文章手动启用 repo 双卡：

```json
{
  "slug": "post-slug",
  "mode": "publish",
  "changes": [],
  "repoCards": {
    "enabled": true,
    "repoUrl": "https://github.com/owner/repo"
  }
}
```

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
- 合并后可自动触发部署（`VERCEL_DEPLOY_HOOK_URL`）

## AI 论文速读自动化（非 GitHub）

- 执行时间：`Asia/Shanghai 12:30`（Cron UTC `30 4 * * *`）
- 数据源：arXiv + Papers with Code
- 筛选参数：arXiv 分类、候选窗口、最低信号分、是否优先有代码论文
- 同日唯一 + 历史论文去重
- 自动标签：`ai-paper`、`paper-daily`
- 发布策略：AI 质检 + 低质量自动重写 1 次 + 通过后自动直发
- 合并后自动触发部署（`VERCEL_DEPLOY_HOOK_URL`）

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
- 同步状态为 `SYNCED` 且教程源文已合并时，会自动触发 `VERCEL_DEPLOY_HOOK_URL`，前台无需手动重部署
- 默认定时检查频率：每小时第 10 分钟（Vercel Cron UTC）
- 同步后镜像到公开仓：
  - `docs/tutorials/mlog-open-source-deploy-guide.zh.md`
  - `docs/tutorials/mlog-open-source-deploy-guide.en.md`
- 其他文章不会公开同步

## 故障排查（常见错误码）

- `401 UNAUTHORIZED`：未登录
- `403 FORBIDDEN`：账号不在管理员白名单
- `409 SHA_CONFLICT`：编辑基线与远端冲突，刷新后重试
- `GITHUB_API_ERROR`：GitHub 操作失败（常见于 merge 被保护规则阻断）
- `AI_CONFIG_ERROR` / `AI_PROVIDER_UNAVAILABLE` / `AI_OUTPUT_INVALID` / `AI_GENERATION_FAILED` / `AI_TIMEOUT`
- `INVALID_AUTOMATION_CONFIG` / `INVALID_AUTOMATION_LAST_RUN`
- `CRON_SECRET_MISSING`

## 维护建议

1. 每次依赖升级后执行 `pnpm lint && pnpm typecheck && pnpm build`
2. 定期轮换 OAuth 与 GitHub token
3. 优先在 Preview 验证管理后台与自动化链路
4. 功能更新后同步更新教程源文并执行教程镜像
