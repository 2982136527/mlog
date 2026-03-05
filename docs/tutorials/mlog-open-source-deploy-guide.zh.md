---
title: MLog 开源部署教程（Next.js + Vercel + 双语博客）
date: '2026-03-04'
summary: 这篇教程从零演示如何把 MLog 部署到线上，并覆盖严格双仓隔离、管理后台发布、AI 写作增强、每日自动发文与教程公开镜像。
tags:
  - MLog
  - Next.js
  - Vercel
  - Bilingual
  - DevOps
category: 部署教程
cover: /images/covers/ship-mlog.svg
draft: false
updated: '2026-03-05'
---

## 一、MLog 是什么

MLog 是一个基于 Next.js App Router 的双语工程博客系统，核心能力包括：

- `zh/en` 双语路由与内容回退
- Git + Markdown 内容发布
- 管理后台前台编辑 + PR 发布
- RSS、sitemap、SEO 元信息默认可用
- Giscus 评论与 Umami 统计可选接入

它不是一次性模板，而是面向长期迭代的内容工程架构。

## 二、推荐仓库结构（严格双仓隔离）

建议按以下结构运行：

- 公开代码仓：只放代码与公开文档（`docs/`）
- 私有内容仓：`content/posts`、`content/system`、`public/images/uploads`

构建时通过 `pnpm content:pull` 拉取私有内容，这样普通文章不会进入公开仓历史。

## 三、准备工作

你需要准备：

1. GitHub 账号（代码托管 + 管理员登录 + 评论）
2. Vercel 账号（部署 Next.js）
3. 可管理 DNS 的域名（可选但推荐）
4. 本地 Node.js 20 与 pnpm 10

本地启动：

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

默认会从根路径重定向到 `/zh`。

## 四、环境变量配置

至少补齐以下变量（本地和 Vercel 环境都要配）：

- 站点基础：`NEXT_PUBLIC_SITE_URL`、`NEXTAUTH_URL`
- 鉴权：`AUTH_SECRET`、`AUTH_GITHUB_ID`、`AUTH_GITHUB_SECRET`
- 后台权限：`ADMIN_GITHUB_ALLOWLIST`
- 私有内容仓：`CONTENT_GITHUB_OWNER`、`CONTENT_GITHUB_REPO`、`CONTENT_GITHUB_READ_TOKEN`、`CONTENT_GITHUB_WRITE_TOKEN`
- 公开仓镜像：`PUBLIC_GITHUB_OWNER`、`PUBLIC_GITHUB_REPO`、`PUBLIC_GITHUB_WRITE_TOKEN`
- 评论与统计：`NEXT_PUBLIC_GISCUS_*`、`NEXT_PUBLIC_UMAMI_*`
- 自动任务：`CRON_SECRET`、`TUTORIAL_SYNC_ENABLED`
- AI：`AI_*`
- 自动部署触发：`VERCEL_DEPLOY_HOOK_URL`

建议部署前先跑：

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## 五、部署到 Vercel

1. 在 Vercel 导入 GitHub 仓库
2. 保持框架为 Next.js，包管理器为 pnpm
3. 设置 Production / Preview / Development 三套环境变量
4. 绑定域名（如 `blog.your-domain.com`）
5. 按 Vercel 指引配置 DNS

上线后重点检查：

- `/zh` `/en`
- `/zh/blog` `/en/blog`
- `/admin`
- `/zh/rss.xml` `/en/rss.xml`
- `/sitemap.xml`

## 六、管理后台发布链路

管理员从 `/admin/login` 用 GitHub 登录，且账号必须在白名单。

发布流程：

1. 新建或编辑文章
2. 点击“保存草稿”或“发布”
3. 系统创建 PR 并尝试自动合并
4. 合并成功后触发 Vercel 部署

若自动合并失败（比如分支保护），会保留 PR 链接供人工处理。

## 七、AI 写作增强与触发规则

`POST /api/admin/posts` 支持两种模式：

- `mode=draft`：仅补齐当前语言空字段（摘要/标签/分类）
- `mode=publish`：补齐缺失字段并自动补齐另一语言（`zh <-> en`）

规则：

- 仅填空，不覆盖人工已有内容
- 必要 AI 步骤失败会阻断提交，避免半成品上线
- 多 Provider 主备：Gemini -> OpenAI 兼容 -> DeepSeek -> Qwen

## 八、每日自动发文（GitHub 爆火日报）

默认每天 `Asia/Shanghai 08:00` 执行自动任务：

1. 从 Trending Daily 抓取候选
2. 按预设主题/关键词/排除词筛选
3. 通过去重规则避免同仓库重复发布
4. AI 生成中文主稿，发布时自动补齐英文

自动文会附加固定标签：

- `ai-auto`
- `github-hot`

并且发布后自动触发部署（若 `VERCEL_DEPLOY_HOOK_URL` 已配置）。

## 九、发布快照卡与实时快照卡

对爆火日报（以及手动启用双卡的普通文章）会展示两张卡：

- 发布快照卡：发布时静态基线
- 实时快照卡：GitHub API 近实时数据（10 分钟缓存）

为避免重复，启用双卡时前台会隐藏正文中的“已确认事实（数据卡）”章节。

## 十、教程公开镜像机制

教程 slug 固定为：`mlog-open-source-deploy-guide`。

同步规则：

1. 先更新博客源文（本教程）
2. 触发 `/api/admin/tutorials/mlog-open-source/sync`
3. 自动镜像到公开仓：
   - `docs/tutorials/mlog-open-source-deploy-guide.zh.md`
   - `docs/tutorials/mlog-open-source-deploy-guide.en.md`

除白名单教程外，其他文章不会公开同步。

## 十一、常见问题排查

### 1) `/admin/login?error=github`

优先检查 GitHub OAuth Callback URL 是否与线上域名完全一致。

### 2) 发布成功但前台没更新

检查 `VERCEL_DEPLOY_HOOK_URL` 是否有效，以及部署是否被触发。

### 3) 自动发文未出现新文章

先看后台“最近一次执行结果”，确认是 `SKIPPED_ALREADY_PUBLISHED_TODAY` 还是上游抓取/AI 失败。

### 4) 实时快照显示“暂不可用”

一般是 GitHub 上游限流或仓库解析失败。正文不会受影响，可稍后重试。

## 十二、维护建议

1. 每次升级依赖后执行 `lint/typecheck/build`
2. 定期轮换 OAuth 与 GitHub Token
3. 在 Preview 先验证后台和自动任务，再进入 Production
4. 功能更新后同步更新本教程源文并执行镜像
