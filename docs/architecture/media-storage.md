# MLog Media Storage Architecture

Status: Accepted (implementation in progress)

## Context

MLog currently commits new uploads to `public/images/uploads/**` in the content repository. The image becomes public only after a content PR merge, a Vercel Deploy Hook, and a full application rebuild. This couples media availability to deployment quotas and can leave an article referencing an image that is not public yet.

MPic already stores image binaries in a dedicated public GitHub repository and exposes Raw GitHub, jsDelivr, and optional custom-CDN links. Its storage client and image-processing ideas are useful, but the full MPic application must not be copied into MLog: it contains a second authentication system, gallery/crawler features outside the blog domain, and known privacy, quota, ownership, and multi-file consistency gaps.

## Decision

MLog remains the only application shell and authentication authority. It owns a small media domain behind a provider interface; the first provider writes immutable, content-addressed images to a dedicated image repository through server-only `IMAGE_GITHUB_*` credentials.

The default namespace is:

```text
uploads/blog/<sha256-prefix>/<sha256>.<ext>
```

New media uploads do not create a content PR, modify `public/images/uploads/**`, or call a Vercel Deploy Hook. Article Markdown stores an absolute HTTPS media URL only after the provider confirms that at least one approved public candidate is available.

MLog uses a dedicated image repository, not MPic's repo. Two separately deployed applications must not manage capacity or evolve the same index schema from different codebases. If MLog images must later appear in the MPic gallery, MPic will expose a scoped, rate-limited, idempotent internal API and remain the single writer for its index.

## Invariants

- Article Markdown is stored only in the content repositories.
- New image binaries are stored only in the configured image repository.
- The image and content repositories are not Vercel deployment sources for MLog.
- Upload success never means "GitHub accepted the write" alone; public availability is a separate, explicit state.
- The provider returns only approved HTTPS hosts and path prefixes.
- Image paths are immutable. A different binary always receives a different SHA-256 path.
- Duplicate uploads are idempotent and do not disclose another user's private metadata.
- MLog does not claim that a URL in a public Git repository is private.
- Existing `/images/uploads/**` URLs remain valid until migration and full-site verification finish.

## Upload Pipeline

1. Authenticate the Admin session or scoped Agent API key.
2. Apply actor and IP rate limits before buffering the request.
3. Enforce request, file, decoded-pixel, dimension, and animation limits.
4. Verify the declared MIME type, magic bytes, and real decoder output; reject SVG.
5. Auto-rotate, normalize, compress when needed, and remove EXIF/GPS metadata.
6. Compute SHA-256 from the final bytes and derive the immutable storage path.
7. Check for an existing object and create it idempotently with bounded GitHub retries.
8. Probe approved custom-CDN, Raw GitHub, and jsDelivr candidates with timeouts.
9. Return `available` only when a candidate is readable; otherwise return `processing` plus a pollable media identifier.

## Failure And Consistency

Provider errors map to stable API codes for invalid input, rate limit, GitHub conflict, upstream timeout, unavailable CDN, and configuration failure. Logs include a request ID and non-secret provider metadata only.

Any optional media manifest uses optimistic concurrency, a reconciliation command, and an orphan report. A binary write followed by a metadata failure must be safely retryable. Hard deletion is blocked while an article references the asset; deletion is never used as a substitute for fixing a failed migration.

## Migration

Migration is staged:

1. Switch all new Admin and Agent uploads to the media provider while retaining the old static directory.
2. Produce a dry-run mapping for every legacy body image and `cover` field across all content shards.
3. Upload by hash, confirm public availability, and rewrite Markdown through parsers in small reviewable PRs.
4. Verify all public article, RSS, sitemap, cover, and media URLs and retain a rollback mapping.
5. Only then stop pulling old uploads during builds and remove the image Deploy Hook path.

The migration command defaults to dry-run, is resumable and idempotent, and cannot write production data without explicit apply flags and complete media configuration.

## Deferred Features

Public gallery, albums, random-image APIs, multi-user uploads, and automatic crawling are separate product features. They remain disabled until their authorization, quota, privacy, abuse, storage-cost, and operational requirements are implemented and tested.

## Configuration

### Image Repository Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `IMAGE_GITHUB_REPO_HISTORY` | No | — | Comma-separated `owner/repo` pairs whose assets remain viewable after switching to a new `IMAGE_GITHUB_REPO`. Prevents 404s on cover images and inline references from historical content. |
| `IMAGE_GITHUB_MAX_REPOSITORY_BYTES` | No | ~3.5 GB | Hard capacity limit. Estimated from the repository's Git object data via the GitHub API. New uploads are rejected (fail closed) when this threshold is exceeded. |
| `MEDIA_ACTOR_DAILY_BYTES` | No | 10 485 760 (10 MB) | Per-actor (admin login or Agent API key) daily upload quota, measured in bytes. Resets at UTC midnight. |
| `MEDIA_GLOBAL_DAILY_BYTES` | No | 52 428 800 (50 MB) | Aggregate daily upload quota for all actors combined. |
| `MEDIA_PROCESSING_TIMEOUT_SECONDS` | No | 120 | Maximum wall-clock time for Sharp-based image processing, including decode, auto-rotate, hash computation, metadata extraction, and format validation. |
| `MEDIA_PROBE_LEASE_SECONDS` | No | 30 | Duration a single runtime instance holds an exclusive lease while probing a newly uploaded image's public CDN availability. Prevents redundant probes when multiple instances receive the upload response. |

### Postgres Requirements

Media state (assets, rate limits, leases) requires `POSTGRES_URL`. The legacy `DATABASE_URL` cannot substitute for `POSTGRES_URL` in the media module because `@vercel/postgres` connects to a different connection pool than the generic `DATABASE_URL` driver.

### Capacity & Purge Semantics

- **Soft delete** removes the asset record from the media library. The GitHub object and CDN cache remain accessible. Existing articles are unaffected.
- **Purge** removes the file from the current repository branch. GitHub's Git history and any stale CDN cache can still serve the file. Purge does **not** guarantee privacy erasure or reclaim committed Git storage.
- Purge is a destructive action guarded by a configurable grace period (default 7 days) and a reference scan. It refuses to proceed while any article still references the asset.
- The default block-device size limit (3.5 GB) is a fail-closed protection. When the limit is reached, new uploads are rejected with a clear error. To continue uploading, migrate to a second image repository and add the old one to `IMAGE_GITHUB_REPO_HISTORY`.

### Vercel Deployment Boundary

The media provider is designed to avoid Vercel serverless builds:

- New image uploads write directly to the image repository via the GitHub API. No content branch, no PR, no Deploy Hook call.
- The `requiresVercelDeployment()` policy only returns `true` when changed paths match the static upload pattern (`public/images/uploads/`). Article content changes (`content/posts/`) never trigger a build.
- Runtime content visibility after publishing relies on Next.js ISR via `revalidateTag` and `revalidatePath`. The optional `warmupPublishedPages()` helper fires HTTP requests to the affected paths inside the publish handler, so the first visitor's request is served from a freshly-rendered page instead of triggering a cold ISR re-render.

### Migration Contract

The `media:migrate` script re-writes legacy `/images/uploads/` URLs to provider-verified media URLs. It does **not** register migrated assets into the `media_assets` Postgres table. This means:

- Migrated articles display correct images immediately because the Markdown is rewritten in place.
- If a migrated article is later edited through the Admin UI, a fresh `POST /api/admin/media/…/upload` or manual media library re-selection is needed for the cover and inline images.
- The publication guard (`publication-guard.ts`) grants an explicit exemption for paths that match the legacy `/images/` prefix, so migrated articles are never blocked.
- A future enhancement could import the migration checkpoint as `media_assets` rows, but the current design keeps the migration scope focused on rewriting content files without coupling to the runtime database state.

### Defaults Reference

```text
| Setting | File | Default |
|---|---|---|
| Storage namespace | `uploads/blog/<sha256[:2]>/<sha256>.<ext>` | Immutable |
| Max source image bytes | `MAX_SOURCE_IMAGE_BYTES` (lib) | 4 194 304 (4 MB) |
| Max decoded pixels | implicit in Sharp pipeline | 16.7 MP (~4 096 × 4 096) |
| Max animation frames | implicit in Sharp pipeline | 1 (static) |
| Rate limit window | Postgres window query | 60 s |
| Purge grace period | `PURGE_GRACE_DAYS` | 7 days |
| Probe lease (database) | `MEDIA_PROBE_LEASE_SECONDS` | 30 s |
| Processing timeout | `MEDIA_PROCESSING_TIMEOUT_SECONDS` | 120 s |
| Actor daily bytes | `MEDIA_ACTOR_DAILY_BYTES` | 10 MB |
| Global daily bytes | `MEDIA_GLOBAL_DAILY_BYTES` | 50 MB |
| Fork safety | SHA-256 + dedup | Idempotent |
```
