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
updated: '2026-07-13'
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
4. A Postgres database for Agent keys, durable media state, and upload rate limiting
5. Local Node.js 24 and pnpm 10

Local bootstrap:

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

The root route redirects to `/zh` by default.

## 3. Recommended Repository Layout

Separate code, content, and media:

- Public code repository: source code + public docs only
- Private content repository: `content/posts` and `content/system`; retain historical `public/images/uploads` during migration
- Public image repository: content-addressed new uploads; you can reuse the repository already used by MPic

Connect only the public code repository to Vercel. Do not import or connect the private content or image repository, and do not enable Vercel automatic deployments for them; Markdown commits and image writes are not application deployment events.

The first deployment and later code builds run `pnpm content:pull` to install a consistent private-content snapshot for initial prerendering. Until media migration is complete and verified, it also places historical `public/images/uploads` into the static output so existing `/images/uploads/**` URLs keep working. Later article changes are read from the runtime GitHub content snapshot and do not depend on another build. Once remote runtime content is configured, read failures fail closed instead of falling back to an old build snapshot that could re-expose a deleted or withdrawn post.

## 4. Environment Variables

Configure these in local env files and in Vercel:

- Site basics: `NEXT_PUBLIC_SITE_URL`, `NEXTAUTH_URL`
- Auth: `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`
- Admin allowlist: `ADMIN_GITHUB_ALLOWLIST`
- Content repo write: `CONTENT_GITHUB_OWNER`, `CONTENT_GITHUB_REPO`, `CONTENT_GITHUB_WRITE_TOKEN`
- Content repo read: `CONTENT_GITHUB_READ_TOKEN`
- New-media repository: `IMAGE_GITHUB_OWNER`, `IMAGE_GITHUB_REPO`, `IMAGE_GITHUB_BRANCH`, `IMAGE_GITHUB_TOKEN`
- Media path/CDN: `IMAGE_GITHUB_PATH_PREFIX` (default `uploads/blog`) and optional `NEXT_PUBLIC_CDN_BASE_URL`
- Data/rate limiting: Postgres `POSTGRES_URL` and a `MEDIA_RATE_LIMIT_HMAC_SECRET` of at least 32 characters. The legacy `DATABASE_URL` field alone is insufficient; allow the database role to create media tables and indexes on first use
- Public mirror repo: `PUBLIC_GITHUB_OWNER`, `PUBLIC_GITHUB_REPO`, `PUBLIC_GITHUB_WRITE_TOKEN`
- Comments/analytics: `NEXT_PUBLIC_GISCUS_*`, `NEXT_PUBLIC_UMAMI_*`
- Automation: `CRON_SECRET`, `TUTORIAL_SYNC_ENABLED`
- AI features: `AI_*` (at least Gemini config)
- Migration-period Deploy Hook: retain `VERCEL_DEPLOY_HOOK_URL` only for the legacy `public/images/uploads/**` workflow; new Admin/Agent media, posts, drafts, repo cards, and tutorial mirrors never call it

Before deploying, verify:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## 5. Deploy to Vercel

1. Import only the public code repository in Vercel; do not connect the private content or image repository
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
4. When the application completes the merge, it immediately invalidates the runtime GitHub content snapshot cache so home, list, detail, RSS, and sitemap read the new content
5. A manual GitHub merge or out-of-band content edit is picked up by the 60-second fallback cache cycle

Normal posts, draft state, and `repo-cards.json` all use this runtime path. They do not call the Deploy Hook and do not require a rebuild. New drafts remain absent from public routes; changing a published post to draft hides it after the cache refresh.

New Admin/Agent uploads write directly to the public repository configured by `IMAGE_GITHUB_*`. They create no image PR, do not modify the content repository, and never trigger the Deploy Hook. The API returns a usable `url/markdown` only with `status=ready` and `available=true`. For HTTP `202 processing`, call the returned `poll.url` with the same authentication according to `Retry-After` or `poll.afterMs`; do not publish a body or cover that references the asset before it is `ready`.

Historical `/images/uploads/**` and build-time `content:pull` remain supported until migration finishes and a full-site zero-404 check passes. Do not delete old images or disable legacy asset sync early.

AI can assist during save/publish by filling missing fields and generating missing locale content.

## 7. Daily Automation and Tutorial Mirroring

MLog can auto-publish a daily "hot GitHub project" post at 08:00 Asia/Shanghai.

Automated posts use the same runtime snapshot and cache-invalidation path as manually authored posts; they do not trigger a Vercel build.

This tutorial post is whitelisted for mirroring into a public repository (`docs/tutorials/`). Other blog posts remain private in the content repository. The tutorial source refreshes through the runtime snapshot, and the docs mirror does not call the Deploy Hook. `docs/tutorials/**` is not a site build input. If the public mirror repository is also the Vercel-connected code repository, its Git integration may still create a deployment when the mirror PR merges. Use a separate public mirror repository to eliminate that build.

## 8. Troubleshooting

### 1) `/admin/login?error=github`

Verify your GitHub OAuth callback URL exactly matches your deployed domain.

### 2) PR created but not merged

This is usually caused by branch protection rules. Use the returned PR URL and merge manually.

### 3) A merged article has not refreshed yet

Merges completed by the application invalidate the cache immediately. For a direct GitHub merge, the first request after the 60-second TTL expires starts a background refresh, and subsequent requests read the new content. Do not solve content freshness by connecting the content repository to Vercel or rebuilding for every post.

### 4) An upload remains `202 processing`

Confirm the image repository is public, all `IMAGE_GITHUB_*` values target the same repository and branch, the optional CDN base maps the repository root, and Postgres plus `MEDIA_RATE_LIMIT_HMAC_SECRET` are configured. Keep using the returned polling interval; never insert a candidate URL before the API reports `ready`.

### 5) `next/font` build failures

Use local fonts or ensure build network access to your font source.

## 9. Maintenance Checklist

1. Run `lint/typecheck/build` after dependency upgrades
2. Rotate OAuth and GitHub tokens regularly
3. Validate admin and automation behavior in Preview before promoting
4. Keep this tutorial updated whenever release behavior changes
5. After legacy migration, run a full-site zero-404 check and retain the rollback map before removing `/images/uploads/**` or legacy Deploy Hook compatibility

Fork MLog, replace branding and domain, and you can launch a maintainable bilingual engineering blog quickly.
