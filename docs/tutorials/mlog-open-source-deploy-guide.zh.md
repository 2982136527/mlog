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
updated: '2026-03-26'
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
4. Node.js 20 + pnpm 10 本地环境

安装依赖并启动本地：

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

默认会从根路径重定向到 `/zh`。

## 三、创建并配置仓库

推荐使用“两仓隔离”模式：

- 公开代码仓：只放代码与文档
- 私有内容仓：存放 `content/posts`、`content/system`、`public/images/uploads`

部署时通过 `pnpm content:pull` 拉取私有内容，避免普通文章被公开同步。

## 四、配置环境变量

先在 `.env.local` 与 Vercel 项目中补齐变量：

- 站点基础：`NEXT_PUBLIC_SITE_URL`、`NEXTAUTH_URL`
- 登录鉴权：`AUTH_SECRET`、`AUTH_GITHUB_ID`、`AUTH_GITHUB_SECRET`
- 后台权限：`ADMIN_GITHUB_ALLOWLIST`
- 内容仓写入：`CONTENT_GITHUB_OWNER`、`CONTENT_GITHUB_REPO`、`CONTENT_GITHUB_WRITE_TOKEN`
- 内容仓读取：`CONTENT_GITHUB_READ_TOKEN`
- 公开镜像：`PUBLIC_GITHUB_OWNER`、`PUBLIC_GITHUB_REPO`、`PUBLIC_GITHUB_WRITE_TOKEN`
- 评论统计：`NEXT_PUBLIC_GISCUS_*`、`NEXT_PUBLIC_UMAMI_*`
- 自动任务：`CRON_SECRET`、`TUTORIAL_SYNC_ENABLED`
- AI 能力：`AI_*`（至少配置 Gemini）

建议先本地运行：

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## 五、接入 Vercel 与域名

1. 在 Vercel 导入 GitHub 仓库
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
4. 合并成功后 Vercel 自动部署上线

AI 可以在发布阶段自动补齐：

- 双语翻译（`zh <-> en`）
- 摘要、标签、分类

## 七、自动发文与教程镜像

MLog 支持每天 08:00（Asia/Shanghai）自动生成“GitHub 爆火项目”文章。

此外，本教程文章会作为白名单内容同步到公开仓 `docs/tutorials/`，用于项目传播；其余文章仍保留在私有内容仓。

## 八、常见问题排查

### 1) GitHub 登录后回到 `/admin/login?error=github`

优先检查 GitHub OAuth App 的 Callback URL 是否与站点域名完全一致。

### 2) 发布成功但自动合并失败

通常是分支保护策略阻断。保留返回的 PR 链接，手动合并即可。

### 3) 构建报错 `next/font` 拉取失败

将外部字体改为本地字体或确保构建网络可访问字体源。

## 九、后续维护建议

1. 每次升级依赖后跑一次 `lint/typecheck/build`
2. 定期轮换 OAuth 与 GitHub Token
3. 用 Preview 环境先验证管理后台与自动任务
4. 将教程更新纳入版本发布流程，保证文档与功能一致

你可以直接 fork MLog，再按本文步骤替换站点名称与域名，即可拥有一套可持续迭代的博客系统。
