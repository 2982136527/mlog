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
- `/api/cron/github-hot-daily` (Vercel cron entry, bearer protected)

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
| `CRON_SECRET` | bearer secret for cron route `/api/cron/github-hot-daily` |
| `AI_ENABLE` | enable server-side AI generation, default `true` |
| `AI_PROVIDER_CHAIN` | provider fallback chain, default `gemini,openai,deepseek,qwen` |
| `AI_TIMEOUT_MS` | total AI timeout budget, default `60000` |
| `AI_RETRY_COUNT` | full-chain retry rounds, default `1` |
| `AI_GEMINI_API_KEY` | Gemini API key |
| `AI_GEMINI_MODEL` | Gemini model name |
| `AI_OPENAI_API_KEY` | OpenAI-compatible API key |
| `AI_OPENAI_BASE_URL` | OpenAI-compatible base URL |
| `AI_OPENAI_MODEL` | OpenAI-compatible model name |
| `AI_DEEPSEEK_API_KEY` | DeepSeek API key |
| `AI_DEEPSEEK_BASE_URL` | DeepSeek base URL (optional override) |
| `AI_DEEPSEEK_MODEL` | DeepSeek model name |
| `AI_QWEN_API_KEY` | Qwen API key |
| `AI_QWEN_BASE_URL` | Qwen base URL (optional override) |
| `AI_QWEN_MODEL` | Qwen model name |

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
- `GET /api/admin/automation/github-hot-daily`
- `PUT /api/admin/automation/github-hot-daily`
- `POST /api/admin/automation/github-hot-daily/run`

### Common Admin Failures

- `401 UNAUTHORIZED`: not signed in.
- `403 FORBIDDEN`: signed in account is not in `ADMIN_GITHUB_ALLOWLIST`.
- `409 SHA_CONFLICT`: remote file changed after editor loaded; refresh editor and retry.
- `GITHUB_API_ERROR` with merge failure message: PR created but auto-merge blocked.
- `AI_CONFIG_ERROR`: AI required for this submission but provider config is missing or disabled.
- `AI_PROVIDER_UNAVAILABLE`: no configured provider found in runtime chain.
- `AI_OUTPUT_INVALID`: provider responded, but structured JSON output is invalid.
- `AI_GENERATION_FAILED`: all providers failed to generate valid output.
- `AI_TIMEOUT`: AI execution exceeded the timeout budget.
- `INVALID_AUTOMATION_CONFIG`: auto-publish config JSON is invalid.
- `CRON_SECRET_MISSING`: cron secret is not configured.

## AI Writing Flow

- AI runs on server side only (`/api/admin/posts`), never in browser.
- Submit mode:
  - `mode=publish`: auto-translate missing locale (`zh <-> en`) and fill empty `summary/tags/category`.
  - `mode=draft`: fill empty `summary/tags/category` for submitted locale only, no cross-locale translation.
- Overwrite policy: only fill empty fields, never overwrite non-empty manual values.
- Failure policy: if an AI-required step fails, submit is blocked (no partial publish).

## Daily GitHub Hot Automation

- Trigger schedule: every day at `Asia/Shanghai 08:00` (Vercel cron schedule `0 0 * * *` in UTC).
- Source: GitHub Trending Daily.
- Topic strategy:
  - first pass by OR-matching configured keywords against repo name/description/language/topics
  - if no keyword match, fallback to whole trending list
- De-duplication:
  - never repeat the same repository across history
  - publish at most one auto post per day
- Auto article slug format:
  - `gh-hot-YYYYMMDD-<repo-key>-<repoHash8>`
- Auto flow:
  1. fetch candidates from Trending
  2. apply topic filter and de-duplication
  3. AI generates ZH article (`title/summary/tags/category/markdown`)
  4. publish with existing admin publish pipeline (`mode=publish`)
  5. EN content is auto-generated by existing translation flow

### Automation Control Panel

- Location: top card in `/admin`.
- Controls:
  - enable/disable auto publish
  - topic keywords (comma-separated)
  - run now (manual one-shot, bypasses `enabled` switch)
- Config file written to repo:
  - `content/system/automation/github-hot-daily.json`

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
4. Add `CRON_SECRET` to Production environment.
5. Keep `vercel.json` committed so cron schedule is registered.
6. Set production domain to `https://blog.<your-domain>`:
   - add domain in Vercel
   - add DNS records in your DNS provider (usually CNAME)
7. Trigger first production deployment from `main`.

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
5. Verify cron auth: `/api/cron/github-hot-daily` returns `401` without bearer token

### Post-release checks

1. Confirm `https://blog.<your-domain>` serves HTTPS cert successfully.
2. Confirm admin login/authorization:
   - unauthenticated users redirect to `/admin/login`
   - non-allowlisted users receive `403`
3. Publish one test draft and one published post from admin panel.
4. Verify Giscus renders on post detail pages.
5. Verify Umami script is present only in production.
6. Trigger `/admin` -> auto publish card -> `立即执行` once and verify one new `gh-hot-*` post appears.

## Rollback

1. Rollback application:
   - In Vercel dashboard, promote a previous successful deployment to Production.
2. Rollback content:
   - Revert the corresponding Git commit/PR in GitHub and redeploy.
3. Rollback secrets:
   - Rotate `AUTH_SECRET`, `AUTH_GITHUB_SECRET`, and `GITHUB_WRITE_TOKEN` if leakage is suspected.
