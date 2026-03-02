# MLog

MLog is a bilingual (`/zh`, `/en`) blog built with Next.js 16 App Router.

## Stack

- Next.js 16 + React 19 + TypeScript
- Tailwind CSS v4
- Markdown content from `content/posts/<slug>/{zh,en}.md`
- Remark/Rehype markdown pipeline
- Giscus comments (optional)
- Umami analytics (optional, production only)

## Requirements

- Node.js 20+
- pnpm 10+

## Quick Start

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), it redirects to `/zh`.

## Routes

- `/` -> redirect to `/zh`
- `/zh` `/en`
- `/zh/blog` `/en/blog`
- `/zh/blog/[slug]` `/en/blog/[slug]`
- `/zh/rss.xml` `/en/rss.xml`
- `/sitemap.xml`
- `/admin` (hidden admin entry)
- `/admin/new`
- `/admin/edit/[slug]`

## Content Contract

Each post must contain frontmatter:

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

If required fields are missing, build fails with the source file path.

## Localization Behavior

- UI copy is dictionary-driven in `src/i18n/dictionaries.ts`.
- For post detail pages, if `/en/blog/[slug]` has no `en.md`, the app falls back to `zh.md` and shows a notice.

## SEO / Feed

- Locale metadata with `canonical` + `hreflang`
- `robots.ts`
- `sitemap.ts`
- Locale RSS routes at `app/[locale]/rss.xml/route.ts`

## Environment Variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | absolute site URL for metadata and feeds |
| `NEXTAUTH_URL` | auth callback base URL (local: `http://localhost:3000`) |
| `NEXT_PUBLIC_GISCUS_REPO` | giscus repo (`owner/repo`) |
| `NEXT_PUBLIC_GISCUS_REPO_ID` | giscus repo ID |
| `NEXT_PUBLIC_GISCUS_CATEGORY` | giscus category |
| `NEXT_PUBLIC_GISCUS_CATEGORY_ID` | giscus category ID |
| `NEXT_PUBLIC_GISCUS_MAPPING` | giscus mapping, default `pathname` |
| `NEXT_PUBLIC_UMAMI_SCRIPT_URL` | umami script URL |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | umami website ID |
| `AUTH_SECRET` | auth session secret |
| `AUTH_GITHUB_ID` | GitHub OAuth App client id |
| `AUTH_GITHUB_SECRET` | GitHub OAuth App client secret |
| `ADMIN_GITHUB_ALLOWLIST` | comma-separated GitHub logins with admin access |
| `GITHUB_OWNER` | target repository owner for admin publish |
| `GITHUB_REPO` | target repository name for admin publish |
| `GITHUB_BASE_BRANCH` | base branch, default `main` |
| `GITHUB_WRITE_TOKEN` | GitHub token with repo write permissions |
| `ADMIN_AUTO_MERGE` | auto-merge PR after create, default `true` |

## Admin Backend

- Admin uses GitHub OAuth (`next-auth`) and allowlist-based authorization.
- All `/admin` pages and `/api/admin/*` APIs are protected by middleware.
- Publish flow:
  1. Admin edits content in `/admin/new` or `/admin/edit/[slug]`.
  2. API writes Markdown/image changes into a new branch.
  3. API creates a PR and tries auto-merge.
  4. If merge fails (for example branch protection), PR URL is returned for manual handling.

### Admin APIs

- `GET /api/admin/posts?locale=zh|en&keyword=&status=draft|published|all`
- `GET /api/admin/posts/[slug]`
- `POST /api/admin/posts`
- `DELETE /api/admin/posts/[slug]?locale=zh|en|all`
- `POST /api/admin/media`

### Common Admin Failures

- `401 UNAUTHORIZED`: not signed in.
- `403 FORBIDDEN`: signed in account is not in `ADMIN_GITHUB_ALLOWLIST`.
- `409 SHA_CONFLICT`: remote file changed after editor loaded; refresh editor and retry.
- `GITHUB_API_ERROR` with merge failure message: PR created but auto-merge blocked.

## Deploy (Vercel, Full Launch)

### 1) Repository bootstrap

1. Create a public GitHub repository (recommended name: `mlog`).
2. Push this project to `main`.
3. Enable repository Discussions (required by Giscus).

### 2) Third-party setup

1. Create a GitHub OAuth App:
   - Homepage URL: `https://blog.<your-domain>`
   - Callback URL: `https://blog.<your-domain>/api/auth/callback/github`
2. Configure Giscus in Discussions-enabled repo and collect:
   - `NEXT_PUBLIC_GISCUS_REPO`
   - `NEXT_PUBLIC_GISCUS_REPO_ID`
   - `NEXT_PUBLIC_GISCUS_CATEGORY`
   - `NEXT_PUBLIC_GISCUS_CATEGORY_ID`
3. Prepare Umami:
   - `NEXT_PUBLIC_UMAMI_SCRIPT_URL`
   - `NEXT_PUBLIC_UMAMI_WEBSITE_ID`

### 3) Vercel project

1. Import the GitHub repo in Vercel.
2. Ensure framework is detected as Next.js and package manager is `pnpm`.
3. Configure env vars for all environments (Production/Preview/Development) using `.env.example`.
4. Set production domain to `https://blog.<your-domain>`:
   - add domain in Vercel
   - add DNS records in your DNS provider (usually CNAME)
5. Trigger first production deployment from `main`.

### 4) Publish flow

1. Admin signs in via `/admin/login` using allowlisted GitHub account.
2. Admin edits in `/admin/new` or `/admin/edit/[slug]`.
3. System creates PR and attempts auto-merge.
4. If auto-merge is blocked, use returned PR URL for manual merge.

## Operational Checklist

### Pre-release checks

1. `pnpm lint`
2. `pnpm typecheck`
3. `pnpm build`
4. Verify routes: `/zh`, `/en`, `/admin`, `/zh/rss.xml`, `/en/rss.xml`, `/sitemap.xml`

### Post-release checks

1. Confirm `https://blog.<your-domain>` serves HTTPS cert successfully.
2. Confirm admin login/authorization:
   - unauthenticated users redirect to `/admin/login`
   - non-allowlisted users receive `403`
3. Publish one test draft and one published post from admin panel.
4. Verify Giscus renders on post detail pages.
5. Verify Umami script is present only in production.

## Rollback

1. Rollback application:
   - In Vercel dashboard, promote a previous successful deployment to Production.
2. Rollback content:
   - Revert the corresponding Git commit/PR in GitHub and redeploy.
3. Rollback secrets:
   - Rotate `AUTH_SECRET`, `AUTH_GITHUB_SECRET`, and `GITHUB_WRITE_TOKEN` if leakage is suspected.
