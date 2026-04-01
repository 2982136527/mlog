---
title: MLog Open-Source Deployment Guide (Next.js + Vercel + Bilingual Blog)
date: '2026-03-04'
summary: >-
  This guide walks through deploying MLog from scratch: repository setup, Vercel
  integration, admin publishing, comments, analytics, AI writing assistance, and
  daily automation. It also explains the private-content/public-code split and
  the tutorial mirroring workflow so you can keep your blog content private
  while still sharing reusable docs publicly.
tags:
  - MLog
  - Next.js
  - Vercel
  - Bilingual
  - DevOps
category: Deployment Guide
cover: /images/covers/ship-mlog.svg
draft: false
updated: '2026-04-01'
---

## 1. What MLog Provides

MLog is a bilingual blog starter built with Next.js App Router. Key capabilities:

- `zh/en` locale routing with fallback behavior
- Git + Markdown publishing workflow
- Admin panel with in-browser editing and PR-based publishing
- Built-in RSS, sitemap, and SEO metadata
- Optional Giscus comments and Umami analytics

It is designed for maintainable long-term blogging instead of one-off demos.

## 2. Prerequisites

Prepare the following:

1. A GitHub account
2. A Vercel account
3. A domain with editable DNS records (optional but recommended)
4. Local Node.js 20 and pnpm 10

Local bootstrap:

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

The root route redirects to `/zh` by default.

## 3. Recommended Repository Layout

Use a dual-repository setup:

- Public code repository: source code + public docs only
- Private content repository: `content/posts`, `content/system`, `public/images/uploads`

During build, run `pnpm content:pull` to sync private content. This keeps regular articles out of the public repository.

## 4. Environment Variables

Configure these in local env files and in Vercel:

- Site basics: `NEXT_PUBLIC_SITE_URL`, `NEXTAUTH_URL`
- Auth: `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`
- Admin allowlist: `ADMIN_GITHUB_ALLOWLIST`
- Content repo write: `CONTENT_GITHUB_OWNER`, `CONTENT_GITHUB_REPO`, `CONTENT_GITHUB_WRITE_TOKEN`
- Content repo read: `CONTENT_GITHUB_READ_TOKEN`
- Public mirror repo: `PUBLIC_GITHUB_OWNER`, `PUBLIC_GITHUB_REPO`, `PUBLIC_GITHUB_WRITE_TOKEN`
- Comments/analytics: `NEXT_PUBLIC_GISCUS_*`, `NEXT_PUBLIC_UMAMI_*`
- Automation: `CRON_SECRET`, `TUTORIAL_SYNC_ENABLED`
- AI features: `AI_*` (at least Gemini config)

Before deploying, verify:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## 5. Deploy to Vercel

1. Import your GitHub repo in Vercel
2. Keep framework as Next.js and package manager as pnpm
3. Set env vars for Production, Preview, and Development
4. Bind your domain (for example `blog.your-domain.com`)
5. Add DNS records as instructed by Vercel

Then check the main routes:

- `/zh` `/en`
- `/zh/blog` `/en/blog`
- `/admin`
- `/zh/rss.xml` `/en/rss.xml`
- `/sitemap.xml`

## 6. Admin Publishing Flow

Admins sign in via `/admin/login` with GitHub (must be allowlisted).

Publishing flow:

1. Create/edit a post
2. Save draft or publish
3. System creates a PR and attempts auto-merge
4. Vercel deploys automatically after merge

AI can assist during save/publish by filling missing fields and generating missing locale content.

## 7. Daily Automation and Tutorial Mirroring

MLog can auto-publish a daily "hot GitHub project" post at 08:00 Asia/Shanghai.

This tutorial post is whitelisted for public docs mirroring (`docs/tutorials/`). Other blog posts remain private in the content repository.

## 8. Troubleshooting

### 1) `/admin/login?error=github`

Verify your GitHub OAuth callback URL exactly matches your deployed domain.

### 2) PR created but not merged

This is usually caused by branch protection rules. Use the returned PR URL and merge manually.

### 3) `next/font` build failures

Use local fonts or ensure build network access to your font source.

## 9. Maintenance Checklist

1. Run `lint/typecheck/build` after dependency upgrades
2. Rotate OAuth and GitHub tokens regularly
3. Validate admin and automation behavior in Preview before promoting
4. Keep this tutorial updated whenever release behavior changes

Fork MLog, replace branding and domain, and you can launch a maintainable bilingual engineering blog quickly.
