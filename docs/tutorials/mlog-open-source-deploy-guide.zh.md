---
title: MLog 开源部署教程（Next.js + Vercel + 双语博客）
date: '2026-03-04'
summary: >-
  这篇教程从零演示如何把 MLog 部署到线上：准备 GitHub 与
  Vercel、配置双语内容与管理员后台、接入评论和统计、启用自动发文与教程镜像。文中提供可直接复用的环境变量清单与排障思路，适合第一次自建博客的开发者快速落地。
tags:
  - MLog
  - Next.js
  - Vercel
  - Bilingual
  - DevOps
category: 部署教程
cover: /images/covers/ship-mlog.svg
draft: false
updated: '2026-07-13'
---

## 一、MLog 是什么

MLog 是一个基于 Next.js App Router 的双语博客模板，核心特点是：

- `zh/en` 双语路由与内容回退
- Git + Markdown 内容发布
- 管理后台支持前台编辑、PR 发布
- RSS、sitemap、SEO 元信息默认可用
- Giscus 评论与 Umami 统计可选接入

如果你想快速搭建“可持续维护”的个人技术博客，这个项目适合作为起点。

## 二、部署前准备

你需要准备以下账号与基础能力：

1. GitHub 账号（用于代码托管、管理员登录、评论系统）
2. Vercel 账号（用于托管 Next.js）
3. 一个可管理 DNS 的域名（可选，但推荐）
4. 一个 Postgres 数据库（保存 Agent 密钥、媒体状态和持久化上传限流）
5. Node.js 24 + pnpm 10 本地环境

安装依赖并启动本地：

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

默认会从根路径重定向到 `/zh`。

## 三、创建并配置仓库

推荐把代码、内容和媒体分开：

- 公开代码仓：只放代码与文档
- 私有内容仓：存放 `content/posts`、`content/system`；迁移期继续保留历史 `public/images/uploads`
- 公开图仓：存放新的内容哈希图片，可直接复用 MPic 当前使用的图仓

Vercel 项目只绑定公开代码仓。不要导入或绑定私有内容仓、图仓，也不要为它们启用 Vercel 自动部署；Markdown 提交和图片写入都不是应用部署事件。

首次部署和后续代码构建会通过 `pnpm content:pull` 拉取一致的私有内容快照，用于首次预渲染。媒体迁移完成并验证前，它仍会把历史 `public/images/uploads` 放入静态构建产物，确保已有 `/images/uploads/**` URL 不失效。普通文章的后续更新由运行时 GitHub 内容快照读取，不依赖再次构建。配置远端内容仓后，运行时读取失败会直接 fail closed，不会回退到可能重新公开已删除或已撤稿文章的旧构建快照。

## 四、配置环境变量

先在 `.env.local` 与 Vercel 项目中补齐变量：

- 站点基础：`NEXT_PUBLIC_SITE_URL`、`NEXTAUTH_URL`
- 登录鉴权：`AUTH_SECRET`、`AUTH_GITHUB_ID`、`AUTH_GITHUB_SECRET`
- 后台权限：`ADMIN_GITHUB_ALLOWLIST`
- 内容仓写入：`CONTENT_GITHUB_OWNER`、`CONTENT_GITHUB_REPO`、`CONTENT_GITHUB_WRITE_TOKEN`
- 内容仓读取：`CONTENT_GITHUB_READ_TOKEN`
- 新媒体图仓：`IMAGE_GITHUB_OWNER`、`IMAGE_GITHUB_REPO`、`IMAGE_GITHUB_BRANCH`、`IMAGE_GITHUB_TOKEN`
- 媒体路径/CDN：`IMAGE_GITHUB_PATH_PREFIX`（默认 `uploads/blog`）、可选 `NEXT_PUBLIC_CDN_BASE_URL`
- 数据与限流：Postgres `POSTGRES_URL` 以及至少 32 字符的 `MEDIA_RATE_LIMIT_HMAC_SECRET`；仅配置旧兼容字段 `DATABASE_URL` 不够，数据库角色还需允许首次运行创建媒体表与索引
- 公开镜像：`PUBLIC_GITHUB_OWNER`、`PUBLIC_GITHUB_REPO`、`PUBLIC_GITHUB_WRITE_TOKEN`
- 评论统计：`NEXT_PUBLIC_GISCUS_*`、`NEXT_PUBLIC_UMAMI_*`
- 自动任务：`CRON_SECRET`、`TUTORIAL_SYNC_ENABLED`
- AI 能力：`AI_*`（至少配置 Gemini）
- 迁移期 Deploy Hook：`VERCEL_DEPLOY_HOOK_URL` 只为历史 `public/images/uploads/**` 流程保留；新 Admin/Agent 媒体、文章、草稿、repo-cards 和教程 docs 镜像都不调用

建议先本地运行：

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## 五、接入 Vercel 与域名

1. 在 Vercel 只导入公开代码仓；不要连接私有内容仓或图仓
2. 设置框架为 Next.js，包管理器为 pnpm
3. 填入 Production / Preview / Development 环境变量
4. 绑定域名（例如 `blog.your-domain.com`）
5. 在 DNS 控制台按 Vercel 指引添加记录

完成后验证：

- `/zh` `/en`
- `/zh/blog` `/en/blog`
- `/admin`
- `/zh/rss.xml` `/en/rss.xml`
- `/sitemap.xml`

## 六、管理员后台发布

管理员从 `/admin/login` 使用 GitHub 登录，且必须在白名单中。

发布流程：

1. 新建或编辑文章
2. 点击“保存草稿”或“发布”
3. 系统创建 PR 并自动尝试合并
4. 应用完成合并时立即失效运行时 GitHub 内容快照缓存；首页、列表、详情、RSS 与 sitemap 随即读取新内容
5. 在 GitHub 手动合并或从站外修改内容时，由 60 秒兜底缓存周期刷新

普通文章、草稿状态和 `repo-cards.json` 都走这条运行时链路，不调用 Deploy Hook，也不需要重新构建。新草稿不会出现在公开页面；把已发布文章改为草稿后，文章会在缓存刷新后从公开页面隐藏。

新的 Admin/Agent 图片上传直接写入 `IMAGE_GITHUB_*` 指定的公开图仓，不创建图片 PR、不修改内容仓，也不触发 Deploy Hook。接口只有在可公开读取时才返回 `ready`、`available=true` 和可引用的 `url/markdown`；如果返回 HTTP `202 processing`，按响应中的 `Retry-After` 或 `poll.afterMs`，携带相同认证请求 `poll.url`。发布正文或封面前必须等到 `ready`。

历史 `/images/uploads/**` 和构建期 `content:pull` 在迁移完成、全站资源通过零 404 验证前继续保留；不要为了切换新链路提前删除旧图或关闭旧资源同步。

AI 可以在发布阶段自动补齐：

- 双语翻译（`zh <-> en`）
- 摘要、标签、分类

## 七、自动发文与教程镜像

MLog 支持每天 08:00（Asia/Shanghai）自动生成“GitHub 爆火项目”文章。

自动文章与手工文章相同：合并后通过运行时内容快照和缓存失效上线，不触发 Vercel 构建。

此外，本教程文章会作为白名单内容同步到公开仓 `docs/tutorials/`，用于项目传播；其余文章仍保留在私有内容仓。教程源文通过运行时快照刷新，教程 docs 镜像也不会主动调用 Deploy Hook。`docs/tutorials/**` 不参与站点构建；如果公开镜像仓同时是 Vercel 绑定的代码仓，Git 集成仍可能因镜像 PR 合并创建一次部署。要彻底避免这类无效构建，应把教程镜像迁到不绑定 Vercel 的独立公开仓。

## 八、常见问题排查

### 1) GitHub 登录后回到 `/admin/login?error=github`

优先检查 GitHub OAuth App 的 Callback URL 是否与站点域名完全一致。

### 2) 发布成功但自动合并失败

通常是分支保护策略阻断。保留返回的 PR 链接，手动合并即可。

### 3) 文章已合并但暂时未刷新

通过站内发布接口合并时会立即失效缓存。直接在 GitHub 手动合并时，60 秒 TTL 过期后的首次访问会触发后台刷新，随后请求读取新内容；不要通过绑定内容仓或为每篇文章触发 Vercel 构建来解决刷新问题。

### 4) 图片上传一直返回 `202 processing`

确认图仓为公开仓，`IMAGE_GITHUB_*` 指向同一仓库与分支，CDN 基址映射图仓根目录，并检查 Postgres 和 `MEDIA_RATE_LIMIT_HMAC_SECRET`。继续按响应的轮询间隔查询，不要把尚未 `ready` 的候选 URL 写入文章。

### 5) 构建报错 `next/font` 拉取失败

将外部字体改为本地字体或确保构建网络可访问字体源。

## 九、后续维护建议

1. 每次升级依赖后跑一次 `lint/typecheck/build`
2. 定期轮换 OAuth 与 GitHub Token
3. 用 Preview 环境先验证管理后台与自动任务
4. 将教程更新纳入版本发布流程，保证文档与功能一致
5. 迁移旧图后先做全站零 404 验证并保留回滚映射，再考虑移除 `/images/uploads/**` 与旧 Deploy Hook 兼容

你可以直接 fork MLog，再按本文步骤替换站点名称与域名，即可拥有一套可持续迭代的博客系统。
