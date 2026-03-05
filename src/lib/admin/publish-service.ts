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
import { getAdminGithubEnv } from '@/lib/admin/env'
import { AdminHttpError } from '@/lib/admin/errors'
import {
  buildBranchName,
  createBranch,
  createPullRequest,
  deleteFile,
  encodeBufferBase64,
  encodeTextBase64,
  getRepoTextFile,
  hashBuffer,
  mergePullRequest,
  upsertFile
} from '@/lib/admin/github-client'
import {
  adminPostWriteSchema,
  buildPostMarkdownPath,
  normalizeAdminFrontmatterInput,
  parseMarkdownFile,
  serializeMarkdownFile
} from '@/lib/admin/post-serializer'
import { AiRunnerError, runAiFrontmatterEnrich, runAiTranslate } from '@/lib/ai/runner'
import { slugSchema } from '@/lib/content/schema'
import { triggerVercelDeployHook } from '@/lib/deploy/vercel-hook'

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

async function createAndMaybeMergePR(params: {
  branch: string
  title: string
  body: string
  deployContext: {
    requestId: string
    action: string
    changedPaths: string[]
  }
}): Promise<PublishResult> {
  const env = getAdminGithubEnv()

  const pr = await createPullRequest({
    title: params.title,
    body: params.body,
    head: params.branch,
    base: env.baseBranch
  })

  let merged = false
  let mergeMessage = 'Auto merge disabled'

  if (env.autoMerge) {
    const mergeResult = await mergePullRequest(pr.number)
    merged = mergeResult.merged
    mergeMessage = mergeResult.message
  }

  let deploy: PublishResult['deploy']
  if (merged) {
    deploy = await triggerVercelDeployHook({
      requestId: params.deployContext.requestId,
      reason: params.deployContext.action,
      changedPaths: params.deployContext.changedPaths
    })
  }

  return {
    branch: params.branch,
    prNumber: pr.number,
    prUrl: pr.html_url,
    merged,
    mergeMessage,
    deploy
  }
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

function toSerializableFrontmatter(locale: AdminLocale, frontmatter: AdminPostFrontmatterInput): {
  title: string
  date: string
  summary: string
  tags: string[]
  category: string
  cover?: string
  draft?: boolean
  updated?: string
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
    updated: normalizeText(normalized.updated)
  }
}

function parseExistingMarkdownOrNull(raw: string | undefined): { markdown: string } | null {
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
  actor: string
  requestId: string
  forcedTags?: string[]
}): Promise<{ result: PublishResult; changedPaths: string[]; ai: AdminAiResult }> {
  const parsed = adminPostWriteSchema.parse({
    slug: input.slug,
    mode: input.mode,
    changes: input.changes
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
      frontmatter: normalizedFrontmatter,
      markdown: change.markdown.trim()
    })
  }

  const env = getAdminGithubEnv()
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
    const existingTarget = await getRepoTextFile(targetPath, env.baseBranch)
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
            updated: source.frontmatter.updated
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

  const existingStates = await Promise.all(
    changes.map(async change => {
      const targetPath = buildPostMarkdownPath(parsed.slug, change.locale)
      const existing = await getRepoTextFile(targetPath, env.baseBranch)
      return { change, targetPath, existing }
    })
  )

  for (const state of existingStates) {
    if (state.change.baseSha && state.existing?.sha !== state.change.baseSha) {
      throw new AdminHttpError(409, 'SHA_CONFLICT', `File changed remotely: ${state.targetPath}`)
    }
  }

  const action: 'create' | 'update' = existingStates.every(state => !state.existing) ? 'create' : 'update'
  const branch = buildBranchName(action, parsed.slug)
  await createBranch(branch)

  const changedPaths: string[] = []
  for (const state of existingStates) {
    const serialized = serializeMarkdownFile(toSerializableFrontmatter(state.change.locale, state.change.frontmatter), state.change.markdown)

    if (state.existing && state.existing.content === serialized) {
      continue
    }

    await upsertFile({
      path: state.targetPath,
      contentBase64: encodeTextBase64(serialized),
      branch,
      message: `${action === 'create' ? 'create' : 'update'} ${state.targetPath}`,
      sha: state.existing?.sha
    })

    changedPaths.push(state.targetPath)
  }

  if (changedPaths.length === 0) {
    throw new AdminHttpError(400, 'NO_CHANGES', 'No file changes detected.')
  }

  const mainTitle = changes[0]?.frontmatter.title || parsed.slug
  const prTitle = action === 'create' ? `发布文章：${mainTitle}` : `更新文章：${mainTitle}`

  const result = await createAndMaybeMergePR({
    branch,
    title: prTitle,
    body: buildPrBody({
      actor: input.actor,
      requestId: input.requestId,
      slug: parsed.slug,
      changedPaths,
      action
    }),
    deployContext: {
      requestId: input.requestId,
      action: `post-${action}`,
      changedPaths
    }
  })

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
  const env = getAdminGithubEnv()

  const targets = await Promise.all(
    targetLocales.map(async locale => {
      const targetPath = buildPostMarkdownPath(slug, locale)
      const existing = await getRepoTextFile(targetPath, env.baseBranch)
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

  const branch = buildBranchName('delete', slug)
  await createBranch(branch)

  for (const target of deletable) {
    await deleteFile({
      path: target.targetPath,
      branch,
      sha: target.existing!.sha,
      message: `delete ${target.targetPath}`
    })
  }

  const prTitle = `删除文章：${slug}`

  const result = await createAndMaybeMergePR({
    branch,
    title: prTitle,
    body: buildPrBody({
      actor: input.actor,
      requestId: input.requestId,
      slug,
      changedPaths: deletable.map(item => item.targetPath),
      action: `delete-${input.locale}`
    }),
    deployContext: {
      requestId: input.requestId,
      action: `post-delete-${input.locale}`,
      changedPaths: deletable.map(item => item.targetPath)
    }
  })

  return {
    result,
    deletedPaths: deletable.map(item => item.targetPath)
  }
}

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg'
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

  const date = new Date()
  const yyyy = String(date.getFullYear())
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const slugSource = input.slugHint || sanitizeFileBase(path.basename(input.originalName)) || 'asset'
  const safeBase = sanitizeFileBase(slugSource) || 'asset'
  const fingerprint = hashBuffer(input.buffer)
  const filePath = `public/images/uploads/${yyyy}/${mm}/${safeBase}-${fingerprint}.${ext}`
  const branch = buildBranchName('media', safeBase)

  await createBranch(branch)

  await upsertFile({
    path: filePath,
    contentBase64: encodeBufferBase64(input.buffer),
    branch,
    message: `upload media ${filePath}`
  })

  const result = await createAndMaybeMergePR({
    branch,
    title: `上传图片：${path.basename(input.originalName)}`,
    body: buildPrBody({
      actor: input.actor,
      requestId: input.requestId,
      slug: safeBase,
      changedPaths: [filePath],
      action: 'upload-media'
    }),
    deployContext: {
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
