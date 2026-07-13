import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyArticleRewrites,
  buildMigrationPlan,
  createCheckpoint,
  createRollbackManifest,
  detectImageType,
  prepareAssetsWithProvider,
  resolveLegacySource,
  rollbackArticleRewrites,
  serializeManifest,
  validateApplyConfiguration,
  writePlanArtifacts
} from './media-migrate-lib.mjs'

const temporaryDirectories = []
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x00, 0x00, 0x00, 0x00, 0x3a, 0x7e, 0x9b,
  0x55, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x63, 0x60, 0x00, 0x00, 0x00,
  0x02, 0x00, 0x01, 0x48, 0xaf, 0xa4, 0x71, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82
])
const APPLY_ENV = {
  IMAGE_GITHUB_BRANCH: 'main',
  IMAGE_GITHUB_OWNER: 'owner',
  IMAGE_GITHUB_REPO: 'images',
  IMAGE_GITHUB_TOKEN: 'secret-not-logged',
  NEXT_PUBLIC_CDN_BASE_URL: 'https://img.example.test'
}

function planningOptions(projectRoot, overrides = {}) {
  return {
    cdnBaseUrl: APPLY_ENV.NEXT_PUBLIC_CDN_BASE_URL,
    githubBranch: APPLY_ENV.IMAGE_GITHUB_BRANCH,
    githubOwner: APPLY_ENV.IMAGE_GITHUB_OWNER,
    githubRepo: APPLY_ENV.IMAGE_GITHUB_REPO,
    projectRoot,
    ...overrides
  }
}

function markVerified(plan, checkpoint) {
  for (const state of checkpoint.assets) {
    const asset = plan.assets.find(item => item.id === state.assetId)
    state.publicUrl = asset.targetUrl
    state.status = 'verified'
  }
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlog-media-migrate-'))
  temporaryDirectories.push(root)
  await fs.mkdir(path.join(root, 'content/posts/example'), { recursive: true })
  await fs.mkdir(path.join(root, 'public/images/uploads'), { recursive: true })
  await fs.writeFile(path.join(root, 'public/images/uploads/demo.png'), PNG)
  return root
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

describe('media migration planner', () => {
  it('uses YAML and Markdown AST data to plan cover, inline, and reference images', async () => {
    const root = await fixture()
    await fs.writeFile(path.join(root, 'content/posts/example/zh.md'), `---
title: Example
date: '2024-05-09'
cover: /images/uploads/demo.png
---
![inline](/images/uploads/demo.png)

![reference][hero]

[hero]: /images/uploads/demo.png
`)
    await fs.writeFile(path.join(root, 'content/posts/example/en.md'), `---
title: Example
date: '2024-05-10'
---
![external](https://example.com/image.png)
`)

    const first = await buildMigrationPlan(planningOptions(root, { cdnBaseUrl: 'https://img.example.test/base' }))
    const second = await buildMigrationPlan(planningOptions(root, { cdnBaseUrl: 'https://img.example.test/base' }))

    expect(serializeManifest(second)).toBe(serializeManifest(first))
    expect(first.summary).toMatchObject({
      externalOccurrences: 1,
      plannedAssets: 1,
      readyOccurrences: 3,
      scannedFiles: 2,
      totalOccurrences: 4
    })
    expect(first.assets[0]).toMatchObject({
      extension: 'png',
      mime: 'image/png',
      targetPath: `uploads/blog/${first.assets[0].sha256.slice(0, 2)}/${first.assets[0].sha256}.png`,
      targetUrl: `https://img.example.test/base/uploads/blog/${first.assets[0].sha256.slice(0, 2)}/${first.assets[0].sha256}.png`
    })
    expect(first.assets[0].candidates.map(candidate => candidate.kind)).toEqual([
      'custom-cdn',
      'jsdelivr',
      'github-raw'
    ])
    expect(first.occurrences.filter(item => item.status === 'ready').map(item => item.kind)).toEqual([
      'frontmatter-cover',
      'markdown-image',
      'markdown-reference'
    ])
    expect(first.occurrences.find(item => item.kind === 'markdown-reference').definition.line).toBe(10)
    expect(first.validation.warnings[0].code).toBe('external-image-skipped')
  })

  it('fails validation for missing or non-image legacy files without reading remote URLs', async () => {
    const root = await fixture()
    await fs.writeFile(path.join(root, 'public/images/uploads/not-image.png'), 'not an image')
    await fs.writeFile(path.join(root, 'content/posts/example/zh.md'), `---
title: Broken
date: '2024-05-09'
cover: /images/uploads/missing.png
---
![bad](/images/uploads/not-image.png)
`)
    await fs.writeFile(path.join(root, 'content/posts/example/en.md'), '---\ntitle: Empty\n---\n')

    const plan = await buildMigrationPlan({ projectRoot: root })

    expect(plan.validation.valid).toBe(false)
    expect(plan.validation.errors.map(item => item.code)).toEqual([
      'source-file-missing',
      'unsupported-image-content'
    ])
    expect(plan.assets).toEqual([])
  })

  it('resolves encoded Chinese filenames and enforces the offline source budget', async () => {
    const root = await fixture()
    const filename = '中文 封面.png'
    await fs.writeFile(path.join(root, 'public/images/uploads', filename), PNG)
    await fs.writeFile(path.join(root, 'content/posts/example/zh.md'), `---
title: Example
cover: /images/uploads/${encodeURIComponent(filename)}
---
`)
    await fs.writeFile(path.join(root, 'content/posts/example/en.md'), '---\ntitle: Empty\n---\n')

    const plan = await buildMigrationPlan(planningOptions(root))
    expect(plan.assets[0].sourcePaths).toEqual([`public/images/uploads/${filename}`])

    const limited = await buildMigrationPlan(planningOptions(root, { maxSourceBytes: PNG.length - 1 }))
    expect(limited.validation.errors[0].code).toBe('source-file-too-large')
  })

  it('carries verified checkpoint work only while source hash and target stay unchanged', async () => {
    const root = await fixture()
    await fs.writeFile(path.join(root, 'content/posts/example/zh.md'), `---
title: Example
date: '2024-05-09'
cover: /images/uploads/demo.png
---
`)
    await fs.writeFile(path.join(root, 'content/posts/example/en.md'), '---\ntitle: Empty\n---\n')
    const plan = await buildMigrationPlan(planningOptions(root))
    const initial = createCheckpoint(plan)
    markVerified(plan, initial)
    initial.assets[0].remoteSha = 'remote-commit-sha'

    const resumed = createCheckpoint(plan, initial)
    expect(resumed.assets[0]).toMatchObject({
      remoteSha: 'remote-commit-sha',
      status: 'verified'
    })

    initial.assets[0].sourceSha256 = 'changed'
    expect(createCheckpoint(plan, initial).assets[0]).toMatchObject({
      remoteSha: null,
      status: 'pending'
    })
  })

  it('writes deterministic plan, resumable checkpoint, and forward/reverse rollback data', async () => {
    const root = await fixture()
    await fs.writeFile(path.join(root, 'content/posts/example/zh.md'), `---
title: Example
date: '2024-05-09'
cover: /images/uploads/demo.png
---
`)
    await fs.writeFile(path.join(root, 'content/posts/example/en.md'), '---\ntitle: Empty\n---\n')
    const plan = await buildMigrationPlan(planningOptions(root))
    const outputDirectory = path.join(root, 'artifacts')
    const first = await writePlanArtifacts({ outputDirectory, plan })
    first.checkpoint.assets[0].status = 'uploaded'
    await fs.writeFile(first.checkpointPath, serializeManifest(first.checkpoint))
    const second = await writePlanArtifacts({ outputDirectory, plan })
    const rollback = createRollbackManifest(plan)

    expect(second.checkpoint.assets[0].status).toBe('uploaded')
    expect(JSON.parse(await fs.readFile(second.planPath, 'utf8'))).toEqual(plan)
    expect(rollback.mappings[0]).toMatchObject({
      migratedUrl: plan.assets[0].targetUrl,
      originalUrl: '/images/uploads/demo.png',
      targetPath: plan.assets[0].targetPath
    })
  })

  it('does not overwrite applied rollback state with a different dry-run plan', async () => {
    const root = await fixture()
    await fs.writeFile(path.join(root, 'content/posts/example/zh.md'), `---
title: Example
cover: /images/uploads/demo.png
---
`)
    await fs.writeFile(path.join(root, 'content/posts/example/en.md'), '---\ntitle: Empty\n---\n')
    const plan = await buildMigrationPlan(planningOptions(root))
    const outputDirectory = path.join(root, 'artifacts')
    const artifacts = await writePlanArtifacts({ outputDirectory, plan })
    markVerified(plan, artifacts.checkpoint)
    artifacts.checkpoint.assets[0].status = 'rewritten'
    artifacts.rollback.files = [{ path: 'content/posts/example/zh.md' }]
    await Promise.all([
      fs.writeFile(artifacts.checkpointPath, serializeManifest(artifacts.checkpoint)),
      fs.writeFile(artifacts.rollbackPath, serializeManifest(artifacts.rollback))
    ])

    const resumed = await writePlanArtifacts({ outputDirectory, plan })
    expect(resumed.rollback.files).toEqual([{ path: 'content/posts/example/zh.md' }])

    const differentPlan = await buildMigrationPlan(planningOptions(root, {
      legacyOrigins: ['https://legacy.example.test']
    }))
    await expect(writePlanArtifacts({ outputDirectory, plan: differentPlan }))
      .rejects.toThrow(/rollback data would be replaced/)
  })

  it('rewrites only parser-selected URL ranges, is idempotent, and rolls back exactly', async () => {
    const root = await fixture()
    const original = `---
title: Example
date: '2024-05-09'
cover: '/images/uploads/demo.png'
---
The literal /images/uploads/demo.png must stay.

![inline](/images/uploads/demo.png "caption")

![reference][hero]

[hero]: </images/uploads/demo.png> "hero"
`
    const articlePath = path.join(root, 'content/posts/example/zh.md')
    await fs.writeFile(articlePath, original)
    await fs.writeFile(path.join(root, 'content/posts/example/en.md'), '---\ntitle: Empty\n---\n')
    const plan = await buildMigrationPlan(planningOptions(root))
    const checkpoint = createCheckpoint(plan)
    markVerified(plan, checkpoint)
    const rollback = createRollbackManifest(plan)

    const applied = await applyArticleRewrites({
      apply: true,
      checkpoint,
      environment: APPLY_ENV,
      plan,
      projectRoot: root,
      rollback
    })
    const migrated = await fs.readFile(articlePath, 'utf8')

    expect(applied.changedFiles).toEqual(['content/posts/example/zh.md'])
    expect(migrated).toContain('The literal /images/uploads/demo.png must stay.')
    expect(migrated).toContain(`cover: "${plan.assets[0].targetUrl}"`)
    expect(migrated.match(new RegExp(plan.assets[0].sha256, 'g'))).toHaveLength(3)

    const repeated = await applyArticleRewrites({
      apply: true,
      checkpoint: applied.checkpoint,
      environment: APPLY_ENV,
      plan,
      projectRoot: root,
      rollback: applied.rollback
    })
    expect(repeated.alreadyApplied).toBe(true)

    await rollbackArticleRewrites({
      apply: true,
      contentRoot: plan.contentRoot,
      environment: APPLY_ENV,
      projectRoot: root,
      rollback: applied.rollback
    })
    expect(await fs.readFile(articlePath, 'utf8')).toBe(original)
  })

  it('derives body offsets from delimiters when frontmatter contains the same body text', async () => {
    const root = await fixture()
    const original = `---
title: Offset regression
summary: |
  ![hero](/images/uploads/demo.png)
---
  ![hero](/images/uploads/demo.png)
`
    const articlePath = path.join(root, 'content/posts/example/zh.md')
    await fs.writeFile(articlePath, original)
    await fs.writeFile(path.join(root, 'content/posts/example/en.md'), '---\ntitle: Empty\n---\n')
    const plan = await buildMigrationPlan(planningOptions(root))
    const checkpoint = createCheckpoint(plan)
    markVerified(plan, checkpoint)

    expect(plan.occurrences[0].edit.start).toBeGreaterThan(original.lastIndexOf('---'))
    await applyArticleRewrites({
      apply: true,
      checkpoint,
      environment: APPLY_ENV,
      plan,
      projectRoot: root
    })
    const migrated = await fs.readFile(articlePath, 'utf8')
    expect(migrated.match(/\/images\/uploads\/demo\.png/g)).toHaveLength(1)
    expect(migrated).toContain(plan.assets[0].targetUrl)
  })

  it('resumes from write-ahead rollback state after interruption following an article rename', async () => {
    const root = await fixture()
    const original = `---
title: Crash recovery
cover: /images/uploads/demo.png
---
`
    const articlePath = path.join(root, 'content/posts/example/zh.md')
    await fs.writeFile(articlePath, original)
    await fs.writeFile(path.join(root, 'content/posts/example/en.md'), '---\ntitle: Empty\n---\n')
    const plan = await buildMigrationPlan(planningOptions(root))
    const checkpoint = createCheckpoint(plan)
    markVerified(plan, checkpoint)
    let durableState

    await expect(applyArticleRewrites({
      apply: true,
      checkpoint,
      environment: APPLY_ENV,
      onState(state) {
        if (state.phase === 'prepared') durableState = structuredClone(state)
        if (state.phase === 'applied') throw new Error('simulated process interruption')
      },
      plan,
      projectRoot: root
    })).rejects.toThrow(/simulated process interruption/)

    expect(await fs.readFile(articlePath, 'utf8')).toContain(plan.assets[0].targetUrl)
    expect(durableState.checkpoint.assets[0].status).toBe('verified')
    expect(durableState.rollback.files[0].status).toBe('prepared')

    const resumed = await applyArticleRewrites({
      apply: true,
      checkpoint: durableState.checkpoint,
      environment: APPLY_ENV,
      plan,
      projectRoot: root,
      rollback: durableState.rollback
    })
    expect(resumed.alreadyApplied).toBe(true)
    expect(resumed.checkpoint.assets[0].status).toBe('rewritten')
    expect(resumed.rollback.files[0].status).toBe('applied')
  })

  it('uses an injected provider adapter and checkpoints only verified target URLs', async () => {
    const root = await fixture()
    await fs.writeFile(path.join(root, 'content/posts/example/zh.md'), `---
title: Example
date: '2024-05-09'
cover: /images/uploads/demo.png
---
`)
    await fs.writeFile(path.join(root, 'content/posts/example/en.md'), '---\ntitle: Empty\n---\n')
    const plan = await buildMigrationPlan(planningOptions(root))
    const checkpoint = createCheckpoint(plan)
    const persisted = []
    const provider = {
      async put({ asset, bytes, sourcePath }) {
        expect(asset.sha256).toBe(plan.assets[0].sha256)
        expect(bytes).toEqual(PNG)
        expect(sourcePath).toBe('public/images/uploads/demo.png')
        return { remoteSha: 'commit-sha' }
      },
      async verify({ asset }) {
        return { available: true, remoteSha: 'commit-sha', url: asset.candidates[1].url }
      }
    }

    await prepareAssetsWithProvider({
      apply: true,
      checkpoint,
      environment: APPLY_ENV,
      onCheckpoint(value) {
        persisted.push(structuredClone(value))
      },
      plan,
      projectRoot: root,
      provider
    })

    expect(persisted.map(value => value.assets[0].status)).toEqual(['uploaded', 'verified'])
    expect(checkpoint.assets[0]).toMatchObject({
      publicUrl: plan.assets[0].candidates[1].url,
      remoteSha: 'commit-sha',
      status: 'verified'
    })

    await applyArticleRewrites({
      apply: true,
      checkpoint,
      environment: APPLY_ENV,
      plan,
      projectRoot: root
    })
    expect(await fs.readFile(path.join(root, 'content/posts/example/zh.md'), 'utf8'))
      .toContain(plan.assets[0].candidates[1].url)
  })

  it('resumes an uploaded checkpoint at verification without uploading twice', async () => {
    const root = await fixture()
    await fs.writeFile(path.join(root, 'content/posts/example/zh.md'), `---
title: Example
cover: /images/uploads/demo.png
---
`)
    await fs.writeFile(path.join(root, 'content/posts/example/en.md'), '---\ntitle: Empty\n---\n')
    const plan = await buildMigrationPlan(planningOptions(root))
    const checkpoint = createCheckpoint(plan)
    checkpoint.assets[0].status = 'uploaded'
    checkpoint.assets[0].remoteSha = 'existing-remote-sha'
    let putCalls = 0

    await prepareAssetsWithProvider({
      apply: true,
      checkpoint,
      environment: APPLY_ENV,
      plan,
      projectRoot: root,
      provider: {
        async put() {
          putCalls += 1
          throw new Error('put must not run for an uploaded checkpoint')
        },
        async verify({ asset, stored }) {
          expect(stored).toMatchObject({ remoteSha: 'existing-remote-sha', resumed: true })
          return { available: true, remoteSha: stored.remoteSha, url: asset.targetUrl }
        }
      }
    })

    expect(putCalls).toBe(0)
    expect(checkpoint.assets[0].status).toBe('verified')
  })

  it('requires an explicit mutation flag before provider or article writes', async () => {
    const root = await fixture()
    await fs.writeFile(path.join(root, 'content/posts/example/zh.md'), `---
title: Example
cover: /images/uploads/demo.png
---
`)
    await fs.writeFile(path.join(root, 'content/posts/example/en.md'), '---\ntitle: Empty\n---\n')
    const plan = await buildMigrationPlan(planningOptions(root))
    const checkpoint = createCheckpoint(plan)
    markVerified(plan, checkpoint)
    const put = async () => { throw new Error('must not run') }
    const verify = async () => { throw new Error('must not run') }

    await expect(prepareAssetsWithProvider({
      checkpoint,
      environment: APPLY_ENV,
      plan,
      projectRoot: root,
      provider: { put, verify }
    })).rejects.toThrow(/explicit apply/)
    await expect(applyArticleRewrites({
      checkpoint,
      environment: APPLY_ENV,
      plan,
      projectRoot: root
    })).rejects.toThrow(/explicit apply/)
    expect(await fs.readFile(path.join(root, 'content/posts/example/zh.md'), 'utf8'))
      .toContain('/images/uploads/demo.png')
  })
})

describe('media migration safety helpers', () => {
  it('rejects traversal and recognizes supported image magic bytes', () => {
    expect(resolveLegacySource('/images/uploads/../secret.png')).toMatchObject({
      classification: 'invalid',
      reason: 'unsafe-local-path'
    })
    expect(resolveLegacySource('https://example.test/images/uploads/demo.png')).toMatchObject({
      classification: 'external'
    })
    expect(detectImageType(PNG)).toEqual({ extension: 'png', mime: 'image/png' })
    expect(detectImageType(Buffer.from('fake'))).toBeNull()
  })

  it('requires every remote setting before apply can be considered', () => {
    expect(() => validateApplyConfiguration({})).toThrow(/IMAGE_GITHUB_OWNER/)
    expect(validateApplyConfiguration(APPLY_ENV)).toEqual({
      branch: 'main',
      cdnBaseUrl: 'https://img.example.test',
      owner: 'owner',
      pathPrefix: 'uploads/blog',
      repo: 'images'
    })
  })

  it('rejects a forged verified checkpoint without an available provider URL', async () => {
    const root = await fixture()
    await fs.writeFile(path.join(root, 'content/posts/example/zh.md'), `---
title: Example
cover: /images/uploads/demo.png
---
`)
    await fs.writeFile(path.join(root, 'content/posts/example/en.md'), '---\ntitle: Empty\n---\n')
    const plan = await buildMigrationPlan(planningOptions(root))
    const checkpoint = createCheckpoint(plan)
    checkpoint.assets[0].status = 'verified'

    await expect(applyArticleRewrites({
      apply: true,
      checkpoint,
      environment: APPLY_ENV,
      plan,
      projectRoot: root
    })).rejects.toThrow(/no provider-verified public URL/)
  })

  it('fails closed before CLI apply when no authoritative content checkout is supplied', async () => {
    const root = await fixture()
    const result = spawnSync(process.execPath, [path.resolve('scripts/media-migrate.mjs'), '--apply'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, CONTENT_GITHUB_REPO: 'configured-content-repo' }
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('CONTENT_GITHUB_* is configured')
    expect(result.stderr).toContain('--content-checkout')
  })
})
