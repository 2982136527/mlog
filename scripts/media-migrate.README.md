# Legacy media migration planner

`pnpm media:migrate` scans every `content/posts/**/zh.md` and
`content/posts/**/en.md`. It reads `cover` through YAML and body images through
the Markdown AST, validates local `public/images/uploads/**` files by magic
bytes, and groups identical binaries by SHA-256.

Every unique binary uses the same immutable namespace as new uploads:
`uploads/blog/<first-two-sha256-characters>/<sha256>.<detected-extension>`.
Post dates and source filenames never affect the object key.

The default command is a dry run. It writes only these local artifacts under
`.media-migration/`:

- `plan.json`: deterministic file inventory, occurrences, content hashes,
  source-to-target mappings, validation results, and parser-derived edit ranges.
- `checkpoint.json`: resumable state for each unique asset. A new plan carries
  forward only states whose source hash and target path still match.
- `rollback.json`: original and migrated URL mappings. After article apply it
  also contains before/after file hashes, exact reverse edits, and per-file
  `prepared`/`applied` recovery state.

An applied rollback manifest is not overwritten by a different dry-run plan.
`--fresh` bypasses that protection and should only be used after the rollback
artifact has been archived or the migration has been intentionally finalized.

Use `--stdout` when no local artifact files should be created:

```bash
pnpm media:migrate --stdout
```

For an executable migration, generate the plan from the same authoritative
checkout that will later be passed to `--content-checkout`:

```bash
pnpm media:migrate --root /path/to/content-repository
```

Set the same GitHub owner/repository used by the application to include the
jsDelivr and GitHub Raw candidates in the plan. The optional CDN flag is the CLI
equivalent of `NEXT_PUBLIC_CDN_BASE_URL`:

```bash
IMAGE_GITHUB_OWNER=example-owner \
IMAGE_GITHUB_REPO=example-images \
pnpm media:migrate --cdn-base-url https://images.example.com
```

Absolute image URLs are skipped unless their origin is explicitly identified as
the legacy MLog origin:

```bash
pnpm media:migrate \
  --cdn-base-url https://images.example.com \
  --legacy-origin https://blog.example.com
```

`--strict` returns a non-zero exit code for missing files, invalid URLs,
unsupported image bytes, malformed frontmatter, or unresolved Markdown image
references. External images and raw HTML `<img>` nodes remain manual-review
warnings.

## Provider adapter

This script intentionally contains no GitHub, MPic, or other production upload
implementation. A provider wrapper can import `prepareAssetsWithProvider()` from
`media-migrate-lib.mjs` and supply this interface:

```js
const provider = {
  async put({ asset, bytes, sourcePath }) {
    // Store bytes at asset.targetPath and return an opaque remote checksum.
    return { remoteSha: '...' }
  },
  async verify({ asset, stored }) {
    // Check the public URL. available must not be true before it is reachable.
    return { available: true, remoteSha: stored.remoteSha, url: asset.candidates[0].url }
  }
}
```

Pass an `onCheckpoint` callback and persist every `uploaded` and `verified`
transition. The helper rechecks local SHA-256 and image type before invoking the
adapter. It never receives repository credentials; the wrapper owns those. The
wrapper must pass `apply: true`; omitting it fails before `put()` is called.

## Article apply and rollback

Article rewriting is separate from upload. It is blocked unless all assets in
the checkpoint are `verified`, the plan has no validation errors, content hashes
still match, and all of these environment variables are present:

```text
IMAGE_GITHUB_OWNER
IMAGE_GITHUB_REPO
IMAGE_GITHUB_TOKEN
```

`IMAGE_GITHUB_BRANCH` defaults to `main`, `IMAGE_GITHUB_PATH_PREFIX` defaults to
`uploads/blog`, and `NEXT_PUBLIC_CDN_BASE_URL` is optional. When provided, their
values at apply time must exactly match those used to generate the plan.

The CLI does not load an env file. After the provider has persisted a verified
checkpoint, run the explicit apply command against the authoritative content
repository checkout:

```bash
pnpm media:migrate \
  --content-checkout /path/to/content-repository \
  --apply
```

`--apply` and `--rollback` reject the local MLog content cache. The checkout
must be a Git worktree root with tracked `content/posts/**/zh.md` or `en.md`
files. This is especially important when `CONTENT_GITHUB_*` is configured:
MLog's pulled files are ignored snapshots, not the authoritative content
source. The migration CLI never commits, pushes, opens a PR, or updates a
remote content shard; review the resulting checkout diff and use the content
repository's normal PR workflow.

Apply replaces only parser-selected URL ranges. Plain text that happens to
contain the same URL is not changed. A repeated apply verifies the applied file
hashes and exits without rewriting again. Before each article rename, apply
atomically persists a `prepared` rollback record; after the rename it persists
`applied`. A restart can therefore distinguish an untouched file from an
already migrated file and safely resume.

To restore the exact pre-apply article contents:

```bash
pnpm media:migrate \
  --content-checkout /path/to/content-repository \
  --rollback
```

Rollback stops if any migrated article changed after apply. Review and resolve
that drift manually rather than overwriting newer edits.

Run unit tests without any network or production repository access:

```bash
pnpm exec vitest run scripts/media-migrate-lib.test.mjs
```
