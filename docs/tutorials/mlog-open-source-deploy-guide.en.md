---
title: MLog Open-Source Deployment Guide (Next.js + Vercel + Bilingual Blog)
date: '2026-03-04'
summary: This guide walks through deploying MLog end to end, including strict dual-repo isolation, admin publishing, AI writing enhancement, daily hot-project automation, and public tutorial mirroring.
tags:
  - MLog
  - Next.js
  - Vercel
  - Bilingual
  - DevOps
category: Deployment Guide
cover: /images/covers/ship-mlog.svg
draft: false
updated: '2026-03-05'
---

## 1. What MLog Is

MLog is a bilingual engineering blog system built on Next.js App Router. Core capabilities:

- `zh/en` locale routing with fallback behavior
- Git + Markdown content publishing
- In-browser admin editing with PR-based publishing
- Built-in RSS, sitemap, and SEO metadata
- Optional Giscus comments and Umami analytics

It is designed for long-term maintainability, not a one-off template demo.

## 2. Recommended Repository Layout (Strict Dual-Repo Isolation)

Run MLog with two repositories:

- Public code repo: source code and public docs only
- Private content repo: `content/posts`, `content/system`, `public/images/uploads`

Use `pnpm content:pull` during build to sync private content. This keeps regular articles out of public history.

## 3. Prerequisites

Prepare the following:

1. GitHub account (hosting, admin login, comments)
2. Vercel account (Next.js hosting)
3. A domain with editable DNS records (optional but recommended)
4. Local Node.js 20 and pnpm 10

Local bootstrap:

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

The root route redirects to `/zh` by default.

## 4. Environment Variables

Configure these in local env files and Vercel environments:

- Site basics: `NEXT_PUBLIC_SITE_URL`, `NEXTAUTH_URL`
- Auth: `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`
- Admin allowlist: `ADMIN_GITHUB_ALLOWLIST`
- Private content repo: `CONTENT_GITHUB_OWNER`, `CONTENT_GITHUB_REPO`, `CONTENT_GITHUB_READ_TOKEN`, `CONTENT_GITHUB_WRITE_TOKEN`
- Public mirror repo: `PUBLIC_GITHUB_OWNER`, `PUBLIC_GITHUB_REPO`, `PUBLIC_GITHUB_WRITE_TOKEN`
- Comments and analytics: `NEXT_PUBLIC_GISCUS_*`, `NEXT_PUBLIC_UMAMI_*`
- Automation: `CRON_SECRET`, `TUTORIAL_SYNC_ENABLED`
- AI settings: `AI_*`
- Deploy trigger: `VERCEL_DEPLOY_HOOK_URL`

Before deploy:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## 5. Deploy on Vercel

1. Import your GitHub repository into Vercel
2. Keep framework as Next.js and package manager as pnpm
3. Configure Production / Preview / Development env vars
4. Bind your domain (for example `blog.your-domain.com`)
5. Add DNS records as instructed by Vercel

Verify these routes after deployment:

- `/zh` `/en`
- `/zh/blog` `/en/blog`
- `/admin`
- `/zh/rss.xml` `/en/rss.xml`
- `/sitemap.xml`

## 6. Admin Publishing Flow

Admins sign in at `/admin/login` with GitHub and must be in `ADMIN_GITHUB_ALLOWLIST`.

Publish flow:

1. Create or edit a post
2. Save draft or publish
3. System creates a PR and attempts auto-merge
4. After merge, Vercel deployment is triggered

If auto-merge is blocked by branch protection, use the returned PR URL for manual merge.

## 7. AI Writing Enhancement and Trigger Rules

`POST /api/admin/posts` supports two modes:

- `mode=draft`: fills empty fields in current locale only
- `mode=publish`: fills missing fields and auto-completes the counterpart locale (`zh <-> en`)

Rules:

- Fill empty fields only; never overwrite non-empty manual fields
- Required AI step failure blocks submission
- Multi-provider failover chain: Gemini -> OpenAI-compatible -> DeepSeek -> Qwen

## 8. Daily Auto Publishing (GitHub Hot Daily)

A scheduled task runs at `Asia/Shanghai 08:00`:

1. Fetch candidates from Trending Daily
2. Filter by preset/keywords/exclude rules
3. Apply dedupe to avoid repeating repositories
4. Generate ZH article, then auto-complete EN during publish

Auto-generated posts always include fixed tags:

- `ai-auto`
- `github-hot`

And deployment is auto-triggered after merge when `VERCEL_DEPLOY_HOOK_URL` is configured.

## 9. Published Snapshot Card and Live Snapshot Card

For hot-daily posts (and normal posts with manual repo cards enabled), post pages show two cards:

- Published Snapshot: static baseline at publish time
- Live Snapshot: near real-time GitHub data (10-minute cache)

To avoid duplicate information, the frontend hides the markdown section `已确认事实（数据卡）` when cards are enabled.

## 10. Public Tutorial Mirroring

The tutorial slug is fixed: `mlog-open-source-deploy-guide`.

Sync flow:

1. Update tutorial source in blog content
2. Trigger `/api/admin/tutorials/mlog-open-source/sync`
3. Mirror to public docs:
   - `docs/tutorials/mlog-open-source-deploy-guide.zh.md`
   - `docs/tutorials/mlog-open-source-deploy-guide.en.md`

Only this whitelist tutorial is mirrored. Other posts remain private.

## 11. Troubleshooting

### 1) `/admin/login?error=github`

Check whether your GitHub OAuth callback URL exactly matches the deployed domain.

### 2) Publish succeeds but site content is stale

Verify `VERCEL_DEPLOY_HOOK_URL` and check whether deployment was triggered.

### 3) Daily post missing

Check admin "last run" status first. It may be `SKIPPED_ALREADY_PUBLISHED_TODAY` or an upstream/AI failure.

### 4) Live snapshot shows unavailable

Usually caused by GitHub rate limit or upstream fetch failure. The article body remains available.

## 12. Maintenance Checklist

1. Run `lint/typecheck/build` after dependency upgrades
2. Rotate OAuth and GitHub tokens regularly
3. Validate admin and automation in Preview before Production
4. Update this tutorial source and run mirror sync after feature changes
