import path from 'node:path'
import type { AdminLocale, AdminPostPayload, PublishResult } from '@/types/admin'
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
import { adminPostWriteSchema, buildPostMarkdownPath, serializeMarkdownFile } from '@/lib/admin/post-serializer'
import { slugSchema } from '@/lib/content/schema'

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

  return {
    branch: params.branch,
    prNumber: pr.number,
    prUrl: pr.html_url,
    merged,
    mergeMessage
  }
}

export async function publishPostChanges(input: {
  slug: string
  changes: Array<AdminPostPayload>
  actor: string
  requestId: string
}): Promise<{ result: PublishResult; changedPaths: string[] }> {
  const parsed = adminPostWriteSchema.parse({
    slug: input.slug,
    changes: input.changes
  })

  const uniqueChanges = new Map<AdminLocale, AdminPostPayload>()
  for (const change of parsed.changes) {
    uniqueChanges.set(change.locale, change)
  }

  const changes = Array.from(uniqueChanges.values())
  const env = getAdminGithubEnv()

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
    const serialized = serializeMarkdownFile(state.change.frontmatter, state.change.markdown)

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
    })
  })

  return {
    result,
    changedPaths
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
    })
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
    })
  })

  const url = filePath.replace(/^public/, '')

  return {
    url,
    markdown: `![${safeBase}](${url})`,
    result,
    path: filePath
  }
}
