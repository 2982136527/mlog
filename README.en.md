[中文](./README.md) | English

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

- Node.js 24+
- pnpm 10+

## Quick Start

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), it redirects to `/zh`.

For production builds, `pnpm build` runs `pnpm content:pull` first. Each content shard is downloaded as one GitHub tarball and installed as a consistent snapshot for initial prerendering. Until media migration is verified, it also installs historical `public/images/uploads` assets so existing `/images/uploads/**` URLs keep working. Later article updates do not depend on another build. Once runtime remote content is configured, read, authentication, or parsing failures fail closed instead of falling back to a build snapshot that could re-expose a deleted or withdrawn post.

Public routes read a runtime GitHub content snapshot with a 60-second fallback cache. The Data Cache payload is compressed and guarded by aggregate download, expansion, file-count, and wall-clock budgets. When the application merges a PR for a normal post, draft state, or `repo-cards.json`, it immediately invalidates home, list, detail, RSS, and sitemap caches. For a manual GitHub merge or out-of-band edit, the first request after cache expiry starts a background refresh and subsequent requests read the new snapshot. New drafts remain excluded from public routes; changing a published post to draft hides it after refresh.

These content changes do not call a Vercel Deploy Hook and do not require a rebuild. New Admin/Agent uploads write immutable, content-addressed files directly to the public repository configured by `IMAGE_GITHUB_*`; they create no image PR, do not modify the content repository, and never call the Deploy Hook. `VERCEL_DEPLOY_HOOK_URL` remains only for the migration-period legacy `public/images/uploads/**` workflow. Connect only the code repository to Vercel; never connect the content or image repository as an automatic deployment source. Tutorial docs mirroring does not call the Hook either. If the public mirror repository is also the Vercel-connected code repository, its Git integration may still create a deployment when the mirror PR merges; use a separate public mirror repository to eliminate that build.

## Theme Toggle (Public Site)

- Default theme: `classic` (current warm glassmorphism style)
- Optional theme: `ornate` (same design language, richer visual layers)
- Scope: public site routes only (`/[locale]`), admin stays unchanged
- Toggle location: right side of top navigation, next to language switcher
- Persistence: browser local storage key `mlog_theme_v1`

## Routes

- `/` -> redirect to `/zh`
- `/zh` `/en`
- `/zh/about` `/en/about`
- `/zh/blog` `/en/blog`
- `/zh/blog/[slug]` `/en/blog/[slug]`
- `/zh/rss.xml` `/en/rss.xml`
- `/sitemap.xml`
- `/admin` (hidden admin entry)
- `/admin/new`
- `/admin/edit/[slug]`
- `/me`
- `/me/login`
- `/studio` (compat redirect to `/me`)
- `/studio/login` (compat redirect to `/me/login`)
- `/api/cron/github-hot-daily` (Vercel cron entry, bearer protected)
- `/api/cron/github-hot-daily-fallback` (Vercel cron fallback entry, bearer protected)
- `/api/cron/ai-paper-daily` (AI paper digest cron entry, bearer protected)
- `/api/cron/tutorial-sync` (Vercel cron entry, bearer protected)
- `/api/cron/daily-blog` (daily topic post cron entry, bearer protected)
- `/api/agent`, `/api/agent/post`, `/api/agent/upload`, `/api/agent/media/[id]` (an administrator key is required for writes and media-status reads)
- `/api/blog/live-card?locale=zh|en&slug=<slug>` (public read-only live snapshot API for hot-daily posts)
- `/api/user/history` (load user cloud history)
- `/api/user/history/sync` (sync local history to private Gist)

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
publishedAt?: ISO timestamp (system managed)
```

If required fields are missing, build fails with the source file path.

## Localization Behavior

- UI copy is dictionary-driven in `src/i18n/dictionaries.ts`.
- For post detail pages, if `/en/blog/[slug]` has no `en.md`, the app falls back to `zh.md` and shows a notice.
- Blog comments are unified by slug (fixed anchor `/zh/blog/${slug}`), so `/zh` and `/en` share one comment thread.

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
| `POSTGRES_URL` | Postgres connection string required for Agent keys, durable media state, and upload rate limiting; recommended on Vercel |
| `DATABASE_URL` | legacy compatibility for older paths; current media and Agent data still require `POSTGRES_URL` and cannot use this alone |
| `MEDIA_RATE_LIMIT_HMAC_SECRET` | server-only HMAC secret for media rate-limit keys; at least 32 characters |
| `NEXT_PUBLIC_GISCUS_REPO` | giscus repo (`owner/repo`) |
| `NEXT_PUBLIC_GISCUS_REPO_ID` | giscus repo ID |
| `NEXT_PUBLIC_GISCUS_CATEGORY` | giscus category |
| `NEXT_PUBLIC_GISCUS_CATEGORY_ID` | giscus category ID |
| `NEXT_PUBLIC_GISCUS_MAPPING` | legacy compatibility field (blog comments now use fixed slug-based mapping) |
| `NEXT_PUBLIC_UMAMI_SCRIPT_URL` | umami script URL |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | umami website ID |
| `UMAMI_API_TOKEN` | server-side token for Umami API (footer stats) |
| `UMAMI_API_BASE_URL` | optional Umami API base URL (for example `https://api.umami.is/v1`); if empty, derived from script URL origin + `/api` |
| `SITE_START_DATE` | site launch date shown in footer (`YYYY-MM-DD`) |
| `AUTH_SECRET` | auth session secret |
| `AUTH_GITHUB_ID` | GitHub OAuth App client id |
| `AUTH_GITHUB_SECRET` | GitHub OAuth App client secret |
| `ADMIN_GITHUB_ALLOWLIST` | strict admin allowlist (must only be `2982136527`) |
| `CONTENT_GITHUB_OWNER` | private content repository owner |
| `CONTENT_GITHUB_REPO` | private content repository name |
| `CONTENT_GITHUB_BASE_BRANCH` | private content base branch, default `main` |
| `CONTENT_GITHUB_WRITE_TOKEN` | private content repo write token |
| `CONTENT_GITHUB_READ_TOKEN` | private content repo read token |
| `IMAGE_GITHUB_OWNER` | public image-repository owner; the existing MPic repository configuration can be reused |
| `IMAGE_GITHUB_REPO` | public image-repository name |
| `IMAGE_GITHUB_BRANCH` | image-repository branch, default `main` |
| `IMAGE_GITHUB_TOKEN` | server-only image-repository token with Contents write access to the target repository |
| `IMAGE_GITHUB_PATH_PREFIX` | isolated MLog prefix in the image repository, default `uploads/blog` |
| `NEXT_PUBLIC_CDN_BASE_URL` | optional public HTTPS CDN base exposing the image-repository root; jsDelivr and GitHub Raw are also probed |
| `PUBLIC_GITHUB_OWNER` | public code/docs repository owner |
| `PUBLIC_GITHUB_REPO` | public code/docs repository name |
| `PUBLIC_GITHUB_BASE_BRANCH` | public repo base branch, default `main` |
| `PUBLIC_GITHUB_WRITE_TOKEN` | public repo write token (tutorial mirror) |
| `ADMIN_AUTO_MERGE` | auto-merge PR after create, default `true` |
| `CRON_SECRET` | bearer secret shared by cron routes (`/api/cron/github-hot-daily`, `/api/cron/github-hot-daily-fallback`, `/api/cron/ai-paper-daily`, `/api/cron/tutorial-sync`) |
| `VERCEL_DEPLOY_HOOK_URL` | migration compatibility only, for the legacy `public/images/uploads/**` workflow; new media, posts, drafts, repo cards, and tutorial mirrors never call it |
| `TUTORIAL_SYNC_ENABLED` | enable tutorial sync cron, default `false` |
| `PRIVACY_BLOCKLIST` | comma-separated sensitive words/domains for tutorial mirror blocking |
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

### Footer Stats

- Footer shows:
  - total UV
  - total PV
  - average read duration (`totaltime / visits`)
  - site start date (`SITE_START_DATE`)
- Stats scope prefers blog routes (`/zh/blog/*`, `/en/blog/*`) by aggregating Umami path metrics.
- If blog-route aggregation is unavailable, it automatically falls back to site-wide stats and shows a small scope hint in footer.

## Admin Backend

- Admin uses GitHub OAuth (`next-auth`) and allowlist-based authorization.
- All `/admin` pages and `/api/admin/*` APIs are admin-only (single-owner policy).
- Publish flow:
  1. Admin edits content in `/admin/new` or `/admin/edit/[slug]`.
  2. API writes Markdown changes into a new branch.
  3. API creates a PR and tries auto-merge.
  4. After a content merge, the runtime GitHub snapshot cache is invalidated; no Vercel build runs for posts, draft state, or repo cards.
  5. If merge fails (for example branch protection), PR URL is returned for manual handling. Once merged manually, the 60-second fallback refresh applies.
- New media flow: Admin/Agent -> validate and process -> write directly to the dedicated image repository -> availability probe -> `ready`. It creates no image PR and triggers no Vercel build. Only a URL with `status=ready` and `available=true` may be inserted into a body or cover.

### Admin APIs

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

`POST /api/admin/posts` accepts optional `repoCards`:

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

`expectedAction` is required and must be `create` or `update`. Creating an existing slug returns `409`; updating a missing slug returns `404`. Agent publishing returns `200/published` only after the merge SHA is visible on the base branch and public-cache invalidation succeeds; otherwise it returns `202/pending_review` or `202/refresh_pending`.

Media uploads use `multipart/form-data`: `file` is required and `alt` is optional. The upload endpoint returns `200/201`, `status=ready`, `available=true`, and non-null `url/markdown` only after an approved public URL is readable. While a CDN is propagating it returns `202 processing`, `available=false`, `url=null`, and `poll.url`. Call that URL with the same authentication according to `Retry-After` or `poll.afterMs`; do not reference the asset until the response is `ready + available=true`. Durable media state and rate-limit counters use Postgres. The runtime creates the required tables and indexes on first use, so its database role needs the corresponding DDL privileges; uploads fail closed when the database or limiter is unavailable.

Historical `/images/uploads/**` URLs and build-time `content:pull` remain supported until migration finishes and a full-site zero-404 check passes. Do not remove the old files or disable the legacy asset pull early.

### Common Admin Failures

- `401 UNAUTHORIZED`: not signed in.
- `403 FORBIDDEN`: signed in account is not in `ADMIN_GITHUB_ALLOWLIST`.
- `409 SHA_CONFLICT`: remote file changed after editor loaded; refresh editor and retry.
- `429 MEDIA_RATE_LIMITED`: the media upload limit was exceeded; retry according to `Retry-After`.
- `MEDIA_RATE_LIMIT_UNAVAILABLE`: Postgres or the rate-limit secret is unavailable, so the upload is rejected.
- `MEDIA_CONFIG_INVALID`: dedicated image-repository, CDN, or media security configuration is incomplete.
- `GITHUB_API_ERROR` with merge failure message: PR created but auto-merge blocked.
- `AI_CONFIG_ERROR`: AI required for this submission but provider config is missing or disabled.
- `AI_PROVIDER_UNAVAILABLE`: no configured provider found in runtime chain.
- `AI_OUTPUT_INVALID`: provider responded, but structured JSON output is invalid.
- `AI_GENERATION_FAILED`: all providers failed to generate valid output.
- `AI_TIMEOUT`: AI execution exceeded the timeout budget.
- `INVALID_AUTOMATION_CONFIG`: auto-publish config JSON is invalid.
- `INVALID_AUTOMATION_LAST_RUN`: auto-publish last-run JSON is invalid.
- `CRON_SECRET_MISSING`: cron secret is not configured.

## User Center (Login + Activity)

- Any signed-in GitHub user can access `/me`.
- Only the strict administrator can create Agent API keys or call Agent write endpoints.
- Default storage is browser localStorage.
- The page shows recent reading history and recent comment interactions.
- Optional cloud sync: after granting `gist` scope, history syncs to the user's private Gist (no database required).
- If `gist` permission is declined, the system automatically stays in local-only mode and users can re-authorize later from `/me`.
- Comments remain powered by Giscus; the site records interaction events only (no comment body ingestion).
- Legacy `Studio` routes are kept as redirects; BYOK and user auto-publishing features are sunset.

## AI Writing Flow

- AI runs on server side only (`/api/admin/posts`), never in browser.
- Submit mode:
  - `mode=publish`: auto-translate missing locale (`zh <-> en`) and fill empty `summary/tags/category`.
  - `mode=draft`: fill empty `summary/tags/category` for submitted locale only, no cross-locale translation.
- Overwrite policy: only fill empty fields, never overwrite non-empty manual values.
- Failure policy: if an AI-required step fails, submit is blocked (no partial publish).

## Daily GitHub Hot Automation

- Trigger schedule: primary run at `Asia/Shanghai 08:00` (`0 0 * * *` UTC) + fallback check at `Asia/Shanghai 09:10` (`10 1 * * *` UTC).
- Source: GitHub Trending Daily.
- Interest strategy:
  - preset themes (13 presets total) + optional manual overlay keywords (OR matching)
  - exclude keywords
  - minimum stars
  - candidate window and optional language diversity penalty
  - when overlay keywords are provided: `scored_keyword` mode (`effective = preset + overlay`)
  - when overlay keywords are empty: `theme_random_seeded` mode (theme-pool random with same-day stable seed)
  - if theme pool has no hit, fallback to whole filtered trending pool
- De-duplication:
  - never repeat the same repository across history
  - publish at most one auto post per day
- Auto article slug format:
  - `gh-hot-YYYYMMDD-<repo-key>-<repoHash8>`
- Auto flow:
  1. fetch candidates from Trending
  2. apply topic filter and de-duplication
  3. collect evidence (repo facts + latest release + README highlights + source URLs + fetched timestamp)
  4. AI generates ZH article (`title/summary/tags/category/markdown`) with required sections and evidence constraints
  5. quality gate validates generated markdown (required H2 blocks, URL/timestamp presence, min length, fact consistency); one rewrite retry is allowed
  6. publish with existing admin publish pipeline (`mode=publish`) and auto-attach fixed tags `ai-auto`, `github-hot`
  7. EN content is auto-generated by existing translation flow
  8. after merge, invalidate the runtime content snapshot; no Vercel rebuild or Deploy Hook is needed

## Daily Topic Automation

- Trigger schedule: `Asia/Shanghai 09:00` (`0 1 * * *` UTC).
- Disabled by default and configurable from `/admin`.
- Supports category/custom topic pools, exclusions, body-length bounds, same-day de-duplication, and one quality rewrite.
- Config is stored at `content/system/automation/daily-blog.json`.
- Merged generated posts use the runtime content snapshot and do not trigger a Vercel build.

## Daily AI Paper Digest (Non-GitHub)

- Trigger schedule: `Asia/Shanghai 12:30` (`30 4 * * *` UTC).
- Sources: arXiv + Papers with Code.
- Configurable filters:
  - arXiv categories
  - candidate window
  - minimum signals score
  - code-first preference
- De-duplication:
  - publish at most one paper digest per day
  - avoid historical repeats by paper hash (`arXiv id`)
- Auto labels: `ai-paper`, `paper-daily`
- Publish policy: AI quality gate + one rewrite retry + auto-publish on pass
- Merged digests use the runtime content snapshot and do not trigger a Vercel build.

### Daily Writing Quality Strategy

- Default depth: deep review style (target 1200-1800 Chinese characters for markdown body).
- Narrative mode: enhanced narrative, but facts and inference must be separated by section:
  - `已确认事实（数据卡）` for verifiable facts
  - `观点与推断` for interpretation/inference
- Citation format: end-of-article evidence card (`证据来源`) with source URLs and fetched time.
- If quality gate fails after retry, publish is blocked (`AI_OUTPUT_INVALID`) to avoid low-quality half products.

### Hot-Daily Live Card (Near Real Time)

- Scope: only for auto hot-daily posts tagged with both `ai-auto` and `github-hot`.
- Behavior on post detail:
  - show two cards below summary: `Published Snapshot` + `Live Snapshot`
  - keep markdown source unchanged, but hide the markdown section `已确认事实（数据卡）` in frontend when cards are shown (to avoid duplicate content)
- Data source:
  - GitHub repo API (`owner/repo` extracted from post markdown)
  - cached for 10 minutes (`600s`) on server side
- Fallback behavior:
  - if GitHub upstream fails or repo extraction fails, page still renders and only the live card degrades
  - non hot-daily posts never call this API

### Manual Repo Cards for Normal Posts

- Admin editor provides an article-level switch and one GitHub repo URL input (shared by `/zh` and `/en`).
- Config is stored at `content/posts/<slug>/repo-cards.json` in content repo.
- When enabled:
  - page shows two cards below summary:
    - `Published Snapshot` (static baseline)
    - `Live Snapshot` (10-minute cache)
  - markdown source is not rewritten; if `已确认事实（数据卡）` exists in body, frontend hides that section while cards are enabled
- Static baseline lock rule:
  - first publish captures baseline from GitHub API
  - re-publish with same repo keeps baseline unchanged
  - changing `repoUrl` re-captures baseline
- Delete behavior:
  - deleting all locales also deletes `repo-cards.json`
  - deleting one locale keeps `repo-cards.json` only if another locale still exists

### Automation Control Panel

- Location: top card in `/admin`.
- Controls:
  - enable/disable auto publish
  - interest preset
  - manual keywords / exclude keywords
  - strategy visibility: preset keywords / overlay keywords / effective keywords / selection mode
  - minimum stars / candidate window / language diversification
  - candidate preview with score reasons
  - run now (manual one-shot, bypasses `enabled` switch; can be used for same-day backfill if 08:00 run failed)
  - force run now (admin-only, ignores same-day uniqueness limit for manual testing)
  - last-run snapshot (status, reason, selected repo, slug, fixed tags, evidence completeness, quality gate result, merge/cache state)
- Presets:
  - `mixed`, `ai_fun`, `dev_tools`, `creative_coding`, `hardcore_engineering`
  - `security`, `data_ai`, `mobile_dev`, `game_dev`, `design_ux`, `hardware_iot`, `browser_extension`, `productivity`
- Config file written to repo:
  - `content/system/automation/github-hot-daily.json`
  - last-run state: `content/system/automation/github-hot-daily-last-run.json`

## Tutorial Mirror (Whitelist Only)

- Whitelist slug: `mlog-open-source-deploy-guide` (fixed single item)
- Source of truth: blog content in private content repo
- Every tutorial sync refreshes tutorial frontmatter `updated` to current `Asia/Shanghai` date
- The tutorial source is normal article content: after merge, the runtime snapshot refreshes it without a rebuild.
- Tutorial sync also writes the allowlisted files into a public repository, but it does not call the Deploy Hook. `docs/tutorials/**` is not a site build input. If that public repository is also the Vercel-connected code repository, its Git integration may still create a deployment when the mirror PR merges. Use a separate public mirror repository to eliminate that build.
- Tutorial sync cron is disabled by default in this repo. To restore automation, add a schedule for `/api/cron/tutorial-sync` and set `TUTORIAL_SYNC_ENABLED=true`.
- Mirror targets in public repo:
  - `docs/tutorials/mlog-open-source-deploy-guide.zh.md`
  - `docs/tutorials/mlog-open-source-deploy-guide.en.md`
- Manual trigger:
  - `POST /api/admin/tutorials/mlog-open-source/sync`
- Cron trigger:
  - `GET/POST /api/cron/tutorial-sync` (bearer auth with `CRON_SECRET`)
- Guard rails:
  - `PRIVACY_BLOCKLIST` hit => sync blocked with `PRIVACY_VIOLATION`
  - only allowlisted tutorial slug can be mirrored
  - other articles are never mirrored to public docs

## Deploy (Vercel, Full Launch)

### 1) Repository bootstrap

1. Create a public GitHub code repository (recommended name: `mlog`).
2. Create a private content repository for posts/system; keep historical `public/images/uploads` there during migration.
3. Prepare a public image repository, or reuse the repository currently configured for MPic, for all new uploads.
4. Push this project to `main`.
5. Enable Discussions in the public repository (required by Giscus).

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

1. Import the public code repository in Vercel. Do not import or connect the private content or image repository; content commits and image writes must not create automatic Vercel deployments.
2. Ensure framework is detected as Next.js and package manager is `pnpm`.
3. Configure env vars for all environments (Production/Preview/Development) using `.env.example`.
4. Configure `CONTENT_GITHUB_*`, `PUBLIC_GITHUB_*`, `IMAGE_GITHUB_*`, Postgres, and `MEDIA_RATE_LIMIT_HMAC_SECRET`; keep every token and secret server-only.
5. Add `CRON_SECRET` to Production environment.
6. Keep `VERCEL_DEPLOY_HOOK_URL` only while the legacy `public/images/uploads/**` workflow is still needed. New Admin/Agent uploads do not call it.
7. Keep `vercel.json` committed so cron schedules are registered.
8. Set production domain to `https://blog.<your-domain>`:
   - add domain in Vercel
   - add DNS records in your DNS provider (usually CNAME)
9. Trigger first production deployment from `main`.

### 4) Publish flow

1. Admin signs in via `/admin/login` using allowlisted GitHub account.
2. Admin edits in `/admin/new` or `/admin/edit/[slug]`.
3. System creates PR and attempts auto-merge.
4. A merged post, draft-state, or repo-cards change invalidates the runtime snapshot cache and appears without a rebuild.
5. If auto-merge is blocked, use the returned PR URL for manual merge; the 60-second fallback then picks up the change.
6. Upload media separately; if the API returns `202`, poll until `ready` before inserting the returned URL and publishing the post.

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
7. Trigger `/admin` -> `立即同步教程` once and verify docs mirror PR is created.

## Rollback

1. Rollback application:
   - In Vercel dashboard, promote a previous successful deployment to Production.
2. Rollback content:
   - Revert the corresponding commit/PR in the content repository. Normal Markdown and repo-cards rollbacks propagate through cache invalidation or the 60-second fallback without redeploying.
   - Rebuild only when rolling back legacy `public/images/uploads/**` or application code that changes the build output. New immutable image-repository objects are not rolled back by rebuilding MLog.
3. Rollback secrets:
   - Rotate `AUTH_SECRET`, `AUTH_GITHUB_SECRET`, `CONTENT_GITHUB_WRITE_TOKEN`, `PUBLIC_GITHUB_WRITE_TOKEN`, `IMAGE_GITHUB_TOKEN`, and `MEDIA_RATE_LIMIT_HMAC_SECRET` if leakage is suspected.
