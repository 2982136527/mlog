import path from 'node:path'
import type {
  AdminAiResult,
  AdminLocale,
  AdminPostFrontmatterInput,
  AdminPostPayload,
  AdminSubmitMode,
  FrontmatterEnrichPayload,
  PublishResult
} from '@/types/admin'
import type { AdminRepoCardsInput, RepoCardsConfig } from '@/types/repo-cards'
import { getAdminGithubEnv } from '@/lib/admin/env'
import { AdminHttpError } from '@/lib/admin/errors'
import {
  buildBranchName,
  createBranch,
  deleteFile,
  encodeBufferBase64,
  encodeTextBase64,
  getRepoTextFile,
  hashBuffer,
  upsertFile,
  type GithubRepoTarget
} from '@/lib/admin/github-client'
import { getActiveShardEnv, findShardForPost, invalidateSlugShardCache } from '@/lib/admin/shard-manager'
import { checkAndRotateShard } from '@/lib/admin/shard-rotation'
import {
  adminPostWriteSchema,
  buildPostMarkdownPath,
  normalizeAdminFrontmatterInput,
  parseMarkdownFile,
  resolvePublishedAt,
  serializeMarkdownFile
} from '@/lib/admin/post-serializer'
import { AiRunnerError, runAiFrontmatterEnrich, runAiTranslate } from '@/lib/ai/runner'
import { slugSchema } from '@/lib/content/schema'
import { createAndMaybeMergePR } from '@/lib/admin/pr-publish'
import { assertPublicationMediaReady } from '@/lib/media/publication-guard'
import {
  buildRepoCardsPath,
  normalizeAdminRepoCardsInput,
  parseGithubRepoUrl,
  parseRepoCardsConfigOrDefault,
  serializeRepoCardsConfig
} from '@/lib/blog/repo-cards-config'
import { fetchGithubRepoLiveSnapshot } from '@/lib/automation/github-hot/evidence'

function buildPrBody(input: {
  actor: string
  requestId: string
  slug: string
  changedPaths: string[]
  action: string
}): string {
  return [
    `管理员：@${input.actor}`,
    `请求ID：${input.requestId}`,
    `操作：${input.action}`,
    `Slug：${input.slug}`,
    '',
    '变更文件：',
    ...input.changedPaths.map(p => `- ${p}`)
  ].join('\n')
}

function oppositeLocale(locale: AdminLocale): AdminLocale {
  return locale === 'zh' ? 'en' : 'zh'
}

function normalizeText(value: string | undefined): string | undefined {
  const trimmed = (value || '').trim()
  return trimmed || undefined
}

function normalizeTags(tags: string[] | undefined): string[] {
  return Array.from(new Set((tags || []).map(tag => tag.trim()).filter(Boolean)))
}

function hasMissingFrontmatterFields(frontmatter: AdminPostFrontmatterInput): boolean {
  if (!normalizeText(frontmatter.summary)) {
    return true
  }
  if (!normalizeText(frontmatter.category)) {
    return true
  }
  if (normalizeTags(frontmatter.tags).length === 0) {
    return true
  }
  return false
}

function applyFrontmatterSuggestion(frontmatter: AdminPostFrontmatterInput, suggestion: FrontmatterEnrichPayload): AdminPostFrontmatterInput {
  const summary = normalizeText(frontmatter.summary)
  const category = normalizeText(frontmatter.category)
  const tags = normalizeTags(frontmatter.tags)

  return {
    ...frontmatter,
    summary: summary || suggestion.summary,
    category: category || suggestion.category,
    tags: tags.length > 0 ? tags : normalizeTags(suggestion.tags)
  }
}

function mergeForcedTags(frontmatter: AdminPostFrontmatterInput, forcedTags: string[]): AdminPostFrontmatterInput {
  if (forcedTags.length === 0) {
    return frontmatter
  }

  return {
    ...frontmatter,
    tags: normalizeTags([...(frontmatter.tags || []), ...forcedTags])
  }
}

function createSnapshotFromLive(live: Awaited<ReturnType<typeof fetchGithubRepoLiveSnapshot>>): RepoCardsConfig['staticSnapshot'] {
  return {
    stars: live.stars,
    forks: live.forks,
    openIssues: live.openIssues,
    snapshotAt: live.fetchedAt,
    language: live.language || null,
    license: live.license,
    pushedAt: live.pushedAt,
    updatedAt: live.updatedAt
  }
}

function isSameStaticSnapshot(a: RepoCardsConfig['staticSnapshot'], b: RepoCardsConfig['staticSnapshot']): boolean {
  if (!a && !b) {
    return true
  }
  if (!a || !b) {
    return false
  }
  return JSON.stringify(a) === JSON.stringify(b)
}

async function resolveNextRepoCardsConfig(input: {
  mode: AdminSubmitMode
  actor: string
  requestRepoCards: AdminRepoCardsInput | undefined
  existingRepoCards: RepoCardsConfig
}): Promise<RepoCardsConfig | null> {
  const requestRepoCards = normalizeAdminRepoCardsInput(input.requestRepoCards)
  if (!requestRepoCards) {
    return null
  }

  const nowIso = new Date().toISOString()
  if (!requestRepoCards.enabled) {
    if (!input.existingRepoCards.enabled && !input.existingRepoCards.repoUrl && !input.existingRepoCards.staticSnapshot) {
      return input.existingRepoCards
    }

    return {
      enabled: false,
      repoUrl: '',
      repoFullName: null,
      staticSnapshot: null,
      updatedAt: nowIso,
      updatedBy: input.actor === 'system:cron' ? 'system' : 'admin'
    }
  }

  if (!requestRepoCards.repoUrl) {
    throw new AdminHttpError(400, 'INVALID_INPUT', 'Repo cards enabled but repoUrl is empty.')
  }

  const parsed = parseGithubRepoUrl(requestRepoCards.repoUrl)
  const existingParsedRepo = input.existingRepoCards.repoUrl
    ? (() => {
        try {
          return parseGithubRepoUrl(input.existingRepoCards.repoUrl)
        } catch {
          return null
        }
      })()
    : null

  const shouldRefreshStaticSnapshot =
    input.mode === 'publish' &&
    (!input.existingRepoCards.staticSnapshot || !existingParsedRepo || existingParsedRepo.fullName !== parsed.fullName)

  let staticSnapshot = input.existingRepoCards.staticSnapshot
  if (shouldRefreshStaticSnapshot) {
    try {
      const live = await fetchGithubRepoLiveSnapshot(parsed.owner, parsed.repo)
      staticSnapshot = createSnapshotFromLive(live)
    } catch (error) {
      throw new AdminHttpError(
        503,
        'GITHUB_UPSTREAM_FAILED',
        error instanceof Error ? error.message : 'Failed to fetch GitHub snapshot for repo cards.'
      )
    }
  }

  const unchanged =
    input.existingRepoCards.enabled &&
    existingParsedRepo?.normalizedUrl === parsed.normalizedUrl &&
    (input.existingRepoCards.repoFullName || parsed.fullName) === parsed.fullName &&
    isSameStaticSnapshot(input.existingRepoCards.staticSnapshot, staticSnapshot)

  if (unchanged) {
    return {
      ...input.existingRepoCards,
      repoUrl: parsed.normalizedUrl,
      repoFullName: parsed.fullName
    }
  }

  return {
    enabled: true,
    repoUrl: parsed.normalizedUrl,
    repoFullName: parsed.fullName,
    staticSnapshot,
    updatedAt: nowIso,
    updatedBy: input.actor === 'system:cron' ? 'system' : 'admin'
  }
}

function toSerializableFrontmatter(locale: AdminLocale, frontmatter: AdminPostFrontmatterInput): {
  title: string
  date: string
  summary: string
  tags: string[]
  category: string
  cover?: string
  draft?: boolean
  updated?: string
  publishedAt?: string
} {
  const normalized = normalizeAdminFrontmatterInput(frontmatter)
  const summary = normalizeText(normalized.summary)
  const tags = normalizeTags(normalized.tags)
  const category = normalizeText(normalized.category)

  if (!summary || !category || tags.length === 0) {
    throw new AdminHttpError(400, 'AI_GENERATION_FAILED', `${locale.toUpperCase()} frontmatter is incomplete after AI generation.`)
  }

  return {
    title: normalized.title,
    date: normalized.date,
    summary,
    tags,
    category,
    cover: normalizeText(normalized.cover),
    draft: normalized.draft,
    updated: normalizeText(normalized.updated),
    publishedAt: normalizeText(normalized.publishedAt)
  }
}

function parseExistingMarkdownOrNull(raw: string | undefined): ReturnType<typeof parseMarkdownFile> | null {
  if (!raw) {
    return null
  }

  try {
    return parseMarkdownFile(raw, 'existing')
  } catch {
    return null
  }
}

function mapAiError(error: AiRunnerError, mode: AdminSubmitMode, previousSteps: AdminAiResult['steps']): AdminHttpError {
  const statusByCode: Record<AiRunnerError['code'], number> = {
    AI_CONFIG_ERROR: 500,
    AI_PROVIDER_UNAVAILABLE: 503,
    AI_OUTPUT_INVALID: 502,
    AI_GENERATION_FAILED: 502,
    AI_TIMEOUT: 504
  }

  return new AdminHttpError(statusByCode[error.code], error.code, error.message, {
    ai: {
      triggered: true,
      mode,
      steps: [...previousSteps, ...error.steps]
    }
  })
}

export async function publishPostChanges(input: {
  slug: string
  mode: AdminSubmitMode
  changes: Array<AdminPostPayload>
  repoCards?: AdminRepoCardsInput
  actor: string
  requestId: string
  forcedTags?: string[]
  expectedAction?: 'create' | 'update'
}): Promise<{ result: PublishResult; changedPaths: string[]; ai: AdminAiResult }> {
  const parsed = adminPostWriteSchema.parse({
    slug: input.slug,
    mode: input.mode,
    changes: input.changes,
    repoCards: input.repoCards
  })

  const uniqueChanges = new Map<AdminLocale, AdminPostPayload>()
  for (const change of parsed.changes) {
    const normalizedFrontmatter = normalizeAdminFrontmatterInput(change.frontmatter)
    if (!normalizedFrontmatter.title || !normalizedFrontmatter.date) {
      throw new AdminHttpError(400, 'INVALID_INPUT', `${change.locale.toUpperCase()} title/date is required.`)
    }
    if (!change.markdown.trim()) {
      throw new AdminHttpError(400, 'INVALID_INPUT', `${change.locale.toUpperCase()} markdown is required.`)
    }

    uniqueChanges.set(change.locale, {
      ...change,
      frontmatter: {
        ...normalizedFrontmatter,
        draft: parsed.mode === 'draft'
      },
      markdown: change.markdown.trim()
    })
  }

  // Check if shard rotation is needed, then resolve the active shard
  await checkAndRotateShard()
  const activeShard = await getActiveShardEnv()
  // For new posts, check slug doesn't exist in any shard
  const existingInActive = await getRepoTextFile(buildPostMarkdownPath(parsed.slug, 'zh'), activeShard.baseBranch, activeShard)
  let writeTarget: GithubRepoTarget = activeShard
  let existingShard: GithubRepoTarget | null = existingInActive ? activeShard : null

  if (!existingInActive) {
    // Not in active shard — check if it exists in another shard
    existingShard = await findShardForPost(parsed.slug)
    if (existingShard) {
      // Post exists in another shard — use that shard for updates
      writeTarget = existingShard
    }
  }

  if (input.expectedAction === 'create' && existingShard) {
    throw new AdminHttpError(409, 'POST_ALREADY_EXISTS', `Post already exists: ${parsed.slug}`)
  }
  if (input.expectedAction === 'update' && !existingShard) {
    throw new AdminHttpError(404, 'NOT_FOUND', `Post not found: ${parsed.slug}`)
  }

  const repoCardsPath = buildRepoCardsPath(parsed.slug)
  const existingRepoCardsFile = await getRepoTextFile(repoCardsPath, writeTarget.baseBranch, writeTarget)
  const existingRepoCards = parseRepoCardsConfigOrDefault(existingRepoCardsFile?.content)
  const nextRepoCards = await resolveNextRepoCardsConfig({
    mode: parsed.mode,
    actor: input.actor,
    requestRepoCards: parsed.repoCards,
    existingRepoCards
  })
  const aiSteps: AdminAiResult['steps'] = []

  const enrichLocaleChange = async (change: AdminPostPayload) => {
    if (!hasMissingFrontmatterFields(change.frontmatter)) {
      return
    }

    try {
      const enrich = await runAiFrontmatterEnrich({
        locale: change.locale,
        title: change.frontmatter.title,
        markdown: change.markdown,
        summary: change.frontmatter.summary,
        tags: change.frontmatter.tags,
        category: change.frontmatter.category
      })

      aiSteps.push(...enrich.steps)
      change.frontmatter = applyFrontmatterSuggestion(change.frontmatter, enrich.payload)
    } catch (error) {
      if (error instanceof AiRunnerError) {
        throw mapAiError(error, parsed.mode, aiSteps)
      }
      throw new AdminHttpError(502, 'AI_GENERATION_FAILED', error instanceof Error ? error.message : 'AI frontmatter enrichment failed.')
    }
  }

  for (const change of uniqueChanges.values()) {
    await enrichLocaleChange(change)
  }

  if (parsed.mode === 'publish' && uniqueChanges.size === 1) {
    const source = Array.from(uniqueChanges.values())[0]
    const targetLocale = oppositeLocale(source.locale)
    const targetPath = buildPostMarkdownPath(parsed.slug, targetLocale)
    const existingTarget = await getRepoTextFile(targetPath, writeTarget.baseBranch, writeTarget)
    const parsedExisting = parseExistingMarkdownOrNull(existingTarget?.content)
    const targetMissing = !existingTarget || !parsedExisting?.markdown.trim()

    if (targetMissing) {
      try {
        const translation = await runAiTranslate({
          sourceLocale: source.locale,
          targetLocale,
          title: source.frontmatter.title,
          summary: source.frontmatter.summary,
          tags: source.frontmatter.tags,
          category: source.frontmatter.category,
          markdown: source.markdown
        })

        aiSteps.push(...translation.steps)
        uniqueChanges.set(targetLocale, {
          locale: targetLocale,
          baseSha: existingTarget?.sha || null,
          markdown: translation.payload.markdown,
          frontmatter: {
            title: translation.payload.title,
            date: source.frontmatter.date,
            summary: translation.payload.summary,
            tags: translation.payload.tags,
            category: translation.payload.category,
            cover: source.frontmatter.cover,
            draft: source.frontmatter.draft,
            updated: source.frontmatter.updated,
            publishedAt: source.frontmatter.publishedAt
          }
        })
      } catch (error) {
        if (error instanceof AiRunnerError) {
          throw mapAiError(error, parsed.mode, aiSteps)
        }
        throw new AdminHttpError(502, 'AI_GENERATION_FAILED', error instanceof Error ? error.message : 'AI translation failed.')
      }
    }
  }

  const forcedTags = normalizeTags(input.forcedTags)
  if (forcedTags.length > 0) {
    for (const change of uniqueChanges.values()) {
      change.frontmatter = mergeForcedTags(change.frontmatter, forcedTags)
    }
  }

  const changes = Array.from(uniqueChanges.values())
  await assertPublicationMediaReady(changes)

  const existingStates = await Promise.all(
    changes.map(async change => {
      const targetPath = buildPostMarkdownPath(parsed.slug, change.locale)
      const existing = await getRepoTextFile(targetPath, writeTarget.baseBranch, writeTarget)
      return { change, targetPath, existing }
    })
  )

  for (const state of existingStates) {
    if (state.change.baseSha && state.existing?.sha !== state.change.baseSha) {
      throw new AdminHttpError(409, 'SHA_CONFLICT', `File changed remotely: ${state.targetPath}`)
    }
  }

  const action: 'create' | 'update' = existingShard ? 'update' : 'create'
  const publishedAt = new Date().toISOString()
  const branch = buildBranchName(action, parsed.slug)
  await createBranch(branch, writeTarget)

  const changedPaths: string[] = []
  for (const state of existingStates) {
    const existingFrontmatter = parseExistingMarkdownOrNull(state.existing?.content)?.frontmatter
    const serializedFrontmatter = {
      ...state.change.frontmatter,
      publishedAt: resolvePublishedAt({
        mode: parsed.mode,
        existing: existingFrontmatter || null,
        incoming: state.change.frontmatter.publishedAt,
        now: publishedAt
      })
    }
    const serialized = serializeMarkdownFile(toSerializableFrontmatter(state.change.locale, serializedFrontmatter), state.change.markdown)

    if (state.existing && state.existing.content === serialized) {
      continue
    }

    await upsertFile({
      path: state.targetPath,
      contentBase64: encodeTextBase64(serialized),
      branch,
      message: `${action === 'create' ? 'create' : 'update'} ${state.targetPath}`,
      sha: state.existing?.sha
    }, writeTarget)

    changedPaths.push(state.targetPath)
  }

  if (nextRepoCards) {
    const nextRepoCardsContent = serializeRepoCardsConfig(nextRepoCards)
    if (!existingRepoCardsFile || existingRepoCardsFile.content !== nextRepoCardsContent) {
      await upsertFile({
        path: repoCardsPath,
        contentBase64: encodeTextBase64(nextRepoCardsContent),
        branch,
        message: `update ${repoCardsPath}`,
        sha: existingRepoCardsFile?.sha
      }, writeTarget)

      changedPaths.push(repoCardsPath)
    }
  }

  if (changedPaths.length === 0) {
    throw new AdminHttpError(400, 'NO_CHANGES', 'No file changes detected.')
  }

  const mainTitle = changes[0]?.frontmatter.title || parsed.slug
  const prTitle = action === 'create' ? `发布文章：${mainTitle}` : `更新文章：${mainTitle}`

  const result = await createAndMaybeMergePR({
    target: writeTarget,
    branch,
    title: prTitle,
    body: buildPrBody({
      actor: input.actor,
      requestId: input.requestId,
      slug: parsed.slug,
      changedPaths,
      action
    }),
    publishContext: {
      requestId: input.requestId,
      action: `post-${action}`,
      changedPaths
    }
  })

  // Invalidate slug-shard cache on create so new slugs are discoverable
  if (action === 'create') {
    invalidateSlugShardCache()
  }

  return {
    result,
    changedPaths,
    ai: {
      triggered: aiSteps.length > 0,
      mode: parsed.mode,
      steps: aiSteps
    }
  }
}

export async function deletePostBySlug(input: {
  slug: string
  locale: AdminLocale | 'all'
  actor: string
  requestId: string
}): Promise<{ result: PublishResult; deletedPaths: string[] }> {
  const slug = slugSchema.parse(input.slug)
  const targetLocales: AdminLocale[] = input.locale === 'all' ? ['zh', 'en'] : [input.locale]

  // Find which shard contains this post
  const postShard = await findShardForPost(slug)
  if (!postShard) {
    throw new AdminHttpError(404, 'NOT_FOUND', `Post not found in any shard: ${slug}`)
  }

  const targets = await Promise.all(
    targetLocales.map(async locale => {
      const targetPath = buildPostMarkdownPath(slug, locale)
      const existing = await getRepoTextFile(targetPath, postShard.baseBranch, postShard)
      return {
        locale,
        targetPath,
        existing
      }
    })
  )

  const deletable = targets.filter(target => Boolean(target.existing))
  if (deletable.length === 0) {
    throw new AdminHttpError(404, 'NOT_FOUND', `No deletable files found for slug: ${slug}`)
  }

  const repoCardsPath = buildRepoCardsPath(slug)
  const repoCardsFile = await getRepoTextFile(repoCardsPath, postShard.baseBranch, postShard)

  let shouldDeleteRepoCards = false
  if (repoCardsFile) {
    if (input.locale === 'all') {
      shouldDeleteRepoCards = true
    } else {
      const otherLocale: AdminLocale = input.locale === 'zh' ? 'en' : 'zh'
      const otherPath = buildPostMarkdownPath(slug, otherLocale)
      const otherFile = await getRepoTextFile(otherPath, postShard.baseBranch, postShard)
      shouldDeleteRepoCards = !otherFile
    }
  }

  const branch = buildBranchName('delete', slug)
  await createBranch(branch, postShard)

  const deletedPaths = deletable.map(item => item.targetPath)
  for (const target of deletable) {
    await deleteFile({
      path: target.targetPath,
      branch,
      sha: target.existing!.sha,
      message: `delete ${target.targetPath}`
    }, postShard)
  }

  if (shouldDeleteRepoCards && repoCardsFile) {
    await deleteFile({
      path: repoCardsPath,
      branch,
      sha: repoCardsFile.sha,
      message: `delete ${repoCardsPath}`
    }, postShard)
    deletedPaths.push(repoCardsPath)
  }

  const prTitle = `删除文章：${slug}`

  const result = await createAndMaybeMergePR({
    target: postShard,
    branch,
    title: prTitle,
    body: buildPrBody({
      actor: input.actor,
      requestId: input.requestId,
      slug,
      changedPaths: deletedPaths,
      action: `delete-${input.locale}`
    }),
    publishContext: {
      requestId: input.requestId,
      action: `post-delete-${input.locale}`,
      changedPaths: deletedPaths
    }
  })

  invalidateSlugShardCache()

  return {
    result,
    deletedPaths
  }
}

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
}

function hasValidImageSignature(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === 'image/png') {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  }
  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  }
  if (mimeType === 'image/gif') {
    const signature = buffer.subarray(0, 6).toString('ascii')
    return signature === 'GIF87a' || signature === 'GIF89a'
  }
  if (mimeType === 'image/webp') {
    return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  }
  return false
}

function sanitizeFileBase(input: string): string {
  return input
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

export async function uploadMedia(input: {
  buffer: Buffer
  mimeType: string
  originalName: string
  slugHint?: string
  actor: string
  requestId: string
}): Promise<{ url: string; markdown: string; result: PublishResult; path: string }> {
  const ext = ALLOWED_IMAGE_TYPES[input.mimeType]

  if (!ext) {
    throw new AdminHttpError(400, 'INVALID_MEDIA_TYPE', `Unsupported file type: ${input.mimeType}`)
  }
  if (!hasValidImageSignature(input.buffer, input.mimeType)) {
    throw new AdminHttpError(400, 'INVALID_FILE', `File content does not match media type: ${input.mimeType}`)
  }

  const date = new Date()
  const yyyy = String(date.getFullYear())
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const slugSource = input.slugHint || sanitizeFileBase(path.basename(input.originalName)) || 'asset'
  const safeBase = sanitizeFileBase(slugSource) || 'asset'
  const fingerprint = hashBuffer(input.buffer)
  const filePath = `public/images/uploads/${yyyy}/${mm}/${safeBase}-${fingerprint}.${ext}`
  const branch = buildBranchName('media', safeBase)
  const primaryEnv = getAdminGithubEnv()

  await createBranch(branch, primaryEnv)

  await upsertFile({
    path: filePath,
    contentBase64: encodeBufferBase64(input.buffer),
    branch,
    message: `upload media ${filePath}`
  }, primaryEnv)

  const result = await createAndMaybeMergePR({
    target: primaryEnv,
    branch,
    title: `上传图片：${path.basename(input.originalName)}`,
    body: buildPrBody({
      actor: input.actor,
      requestId: input.requestId,
      slug: safeBase,
      changedPaths: [filePath],
      action: 'upload-media'
    }),
    publishContext: {
      requestId: input.requestId,
      action: 'media-upload',
      changedPaths: [filePath]
    }
  })

  const url = filePath.replace(/^public/, '')

  return {
    url,
    markdown: `![${safeBase}](${url})`,
    result,
    path: filePath
  }
}
