import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { AdminPostPayload, PublishResult } from '@/types/admin'
import { TUTORIAL_SLUG, type TutorialSyncResult, type TutorialSyncState } from '@/types/tutorial'
import { getAdminGithubEnv, getContentGithubReadEnv, getContentGithubWriteEnv, getPublicGithubWriteEnv, type GithubRepoEnv } from '@/lib/admin/env'
import { AdminHttpError } from '@/lib/admin/errors'
import {
  buildBranchName,
  createBranch,
  createPullRequest,
  encodeTextBase64,
  getBranchHeadSha,
  getRepoTextFile,
  mergePullRequest,
  upsertFile,
  type GithubRepoTarget
} from '@/lib/admin/github-client'
import { parseMarkdownFile, serializeMarkdownFile } from '@/lib/admin/post-serializer'
import { publishPostChanges } from '@/lib/admin/publish-service'
import { triggerVercelDeployHook } from '@/lib/deploy/vercel-hook'
import { applyPrivacyGuard } from '@/lib/tutorial/privacy-guard'

const TUTORIAL_SYNC_STATE_PATH = 'content/system/tutorial-sync.json'
const TUTORIAL_ZH_PATH = `content/posts/${TUTORIAL_SLUG}/zh.md`
const TUTORIAL_EN_PATH = `content/posts/${TUTORIAL_SLUG}/en.md`
const MIRROR_ZH_PATH = `docs/tutorials/${TUTORIAL_SLUG}.zh.md`
const MIRROR_EN_PATH = `docs/tutorials/${TUTORIAL_SLUG}.en.md`

export const PUBLIC_MIRROR_ALLOWLIST = [TUTORIAL_SLUG] as const

const tutorialSyncStateSchema = z.object({
  slug: z.literal(TUTORIAL_SLUG),
  sourceHash: z.string().trim().min(1),
  lastSyncedAt: z.string().trim().min(1),
  lastSyncedBy: z.enum(['admin', 'system']),
  lastPublicMirrorCommit: z.string().trim().optional()
})

type EnsureTutorialResult = {
  zhRaw: string
  enRaw: string
  contentPublish?: PublishResult
  aiSteps: TutorialSyncResult['aiSteps']
}

type TutorialUpdatedSyncResult = {
  zhRaw: string
  enRaw: string
  updatedDateApplied: string
  updatedDateChanged: boolean
  contentPublish?: PublishResult
}

function hashSource(input: { zhRaw: string; enRaw: string }): string {
  return createHash('sha256').update(`${input.zhRaw}\n\n---\n\n${input.enRaw}`).digest('hex')
}

function getShanghaiYmd(now = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })

  return formatter.format(now)
}

function buildPrBody(input: {
  actor: 'admin' | 'system'
  requestId: string
  action: string
  paths: string[]
}): string {
  return [`操作者：${input.actor}`, `请求ID：${input.requestId}`, `操作：${input.action}`, '', '变更文件：', ...input.paths.map(path => `- ${path}`)].join('\n')
}

async function createAndMaybeMergePR(input: {
  target: GithubRepoTarget
  branch: string
  title: string
  body: string
}): Promise<PublishResult> {
  const { autoMerge } = getAdminGithubEnv()

  const pr = await createPullRequest(
    {
      title: input.title,
      body: input.body,
      head: input.branch,
      base: input.target.baseBranch
    },
    input.target
  )

  let merged = false
  let mergeMessage = 'Auto merge disabled'

  if (autoMerge) {
    const result = await mergePullRequest(pr.number, input.target)
    merged = result.merged
    mergeMessage = result.message
  }

  return {
    branch: input.branch,
    prNumber: pr.number,
    prUrl: pr.html_url,
    merged,
    mergeMessage
  }
}

function isMergedOrMissing(result: PublishResult | undefined): boolean {
  return !result || result.merged
}

async function ensureTutorialLocales(input: {
  actor: 'admin' | 'system'
  requestId: string
  contentRead: GithubRepoEnv
}): Promise<EnsureTutorialResult> {
  const zhFile = await getRepoTextFile(TUTORIAL_ZH_PATH, undefined, input.contentRead)
  if (!zhFile) {
    throw new AdminHttpError(404, 'TUTORIAL_SOURCE_MISSING', `Tutorial source is missing: ${TUTORIAL_ZH_PATH}`)
  }

  const enFile = await getRepoTextFile(TUTORIAL_EN_PATH, undefined, input.contentRead)
  if (enFile?.content?.trim()) {
    return {
      zhRaw: zhFile.content,
      enRaw: enFile.content,
      aiSteps: []
    }
  }

  const parsedZh = parseMarkdownFile(zhFile.content, TUTORIAL_ZH_PATH)
  const zhChange: AdminPostPayload = {
    locale: 'zh',
    baseSha: zhFile.sha,
    frontmatter: {
      title: parsedZh.frontmatter.title,
      date: parsedZh.frontmatter.date,
      summary: parsedZh.frontmatter.summary,
      tags: parsedZh.frontmatter.tags,
      category: parsedZh.frontmatter.category,
      cover: parsedZh.frontmatter.cover,
      draft: Boolean(parsedZh.frontmatter.draft),
      updated: parsedZh.frontmatter.updated
    },
    markdown: parsedZh.markdown
  }

  const publish = await publishPostChanges({
    slug: TUTORIAL_SLUG,
    mode: 'publish',
    changes: [zhChange],
    actor: input.actor,
    requestId: input.requestId
  })

  const refreshedEn = await getRepoTextFile(TUTORIAL_EN_PATH, undefined, input.contentRead)
  if (!refreshedEn?.content?.trim()) {
    throw new AdminHttpError(502, 'TUTORIAL_EN_MISSING', 'Failed to generate tutorial EN translation during sync.')
  }

  return {
    zhRaw: zhFile.content,
    enRaw: refreshedEn.content,
    contentPublish: publish.result,
    aiSteps: publish.ai.steps
  }
}

async function refreshTutorialUpdatedDate(input: {
  actor: 'admin' | 'system'
  requestId: string
  zhRaw: string
  enRaw: string
  contentWrite: GithubRepoEnv
}): Promise<TutorialUpdatedSyncResult> {
  const updatedDateApplied = getShanghaiYmd()
  const parsedZh = parseMarkdownFile(input.zhRaw, TUTORIAL_ZH_PATH)
  const parsedEn = parseMarkdownFile(input.enRaw, TUTORIAL_EN_PATH)

  const nextZhRaw = serializeMarkdownFile(
    {
      ...parsedZh.frontmatter,
      updated: updatedDateApplied
    },
    parsedZh.markdown
  )
  const nextEnRaw = serializeMarkdownFile(
    {
      ...parsedEn.frontmatter,
      updated: updatedDateApplied
    },
    parsedEn.markdown
  )

  const changedPaths: string[] = []
  if (nextZhRaw !== input.zhRaw) {
    changedPaths.push(TUTORIAL_ZH_PATH)
  }
  if (nextEnRaw !== input.enRaw) {
    changedPaths.push(TUTORIAL_EN_PATH)
  }

  if (changedPaths.length === 0) {
    return {
      zhRaw: input.zhRaw,
      enRaw: input.enRaw,
      updatedDateApplied,
      updatedDateChanged: false
    }
  }

  const zhFile = await getRepoTextFile(TUTORIAL_ZH_PATH, undefined, input.contentWrite)
  const enFile = await getRepoTextFile(TUTORIAL_EN_PATH, undefined, input.contentWrite)
  if (!zhFile || !enFile) {
    throw new AdminHttpError(404, 'TUTORIAL_SOURCE_MISSING', 'Tutorial source files are missing while refreshing updated date.')
  }

  const branch = buildBranchName('tutorial', 'updated-date')
  await createBranch(branch, input.contentWrite)

  if (changedPaths.includes(TUTORIAL_ZH_PATH)) {
    await upsertFile(
      {
        path: TUTORIAL_ZH_PATH,
        contentBase64: encodeTextBase64(nextZhRaw),
        branch,
        message: `update ${TUTORIAL_ZH_PATH}`,
        sha: zhFile.sha
      },
      input.contentWrite
    )
  }

  if (changedPaths.includes(TUTORIAL_EN_PATH)) {
    await upsertFile(
      {
        path: TUTORIAL_EN_PATH,
        contentBase64: encodeTextBase64(nextEnRaw),
        branch,
        message: `update ${TUTORIAL_EN_PATH}`,
        sha: enFile.sha
      },
      input.contentWrite
    )
  }

  const contentPublish = await createAndMaybeMergePR({
    target: input.contentWrite,
    branch,
    title: `刷新教程更新时间：${TUTORIAL_SLUG}`,
    body: buildPrBody({
      actor: input.actor,
      requestId: input.requestId,
      action: 'tutorial-update-date',
      paths: changedPaths
    })
  })

  return {
    zhRaw: nextZhRaw,
    enRaw: nextEnRaw,
    updatedDateApplied,
    updatedDateChanged: true,
    contentPublish
  }
}

async function loadTutorialSyncState(contentRead: GithubRepoEnv): Promise<TutorialSyncState | null> {
  const stateFile = await getRepoTextFile(TUTORIAL_SYNC_STATE_PATH, undefined, contentRead)
  if (!stateFile) {
    return null
  }

  try {
    return tutorialSyncStateSchema.parse(JSON.parse(stateFile.content))
  } catch (error) {
    throw new AdminHttpError(500, 'INVALID_TUTORIAL_SYNC_STATE', error instanceof Error ? error.message : 'Invalid tutorial sync state file.')
  }
}

function serializeTutorialSyncState(state: TutorialSyncState): string {
  return `${JSON.stringify(state, null, 2)}\n`
}

async function mirrorTutorialToPublic(input: {
  actor: 'admin' | 'system'
  requestId: string
  zhRaw: string
  enRaw: string
  publicWrite: GithubRepoEnv
}): Promise<{ docsPaths: string[]; publish?: PublishResult; lastMirrorCommitSha?: string }> {
  const guardedZh = applyPrivacyGuard({
    text: input.zhRaw,
    label: MIRROR_ZH_PATH
  })
  const guardedEn = applyPrivacyGuard({
    text: input.enRaw,
    label: MIRROR_EN_PATH
  })

  const existingZh = await getRepoTextFile(MIRROR_ZH_PATH, undefined, input.publicWrite)
  const existingEn = await getRepoTextFile(MIRROR_EN_PATH, undefined, input.publicWrite)
  const changedPaths: string[] = []

  if (existingZh?.content !== guardedZh.sanitized || !existingZh) {
    changedPaths.push(MIRROR_ZH_PATH)
  }
  if (existingEn?.content !== guardedEn.sanitized || !existingEn) {
    changedPaths.push(MIRROR_EN_PATH)
  }

  if (changedPaths.length === 0) {
    return {
      docsPaths: [MIRROR_ZH_PATH, MIRROR_EN_PATH]
    }
  }

  const branch = buildBranchName('mirror', TUTORIAL_SLUG)
  await createBranch(branch, input.publicWrite)

  if (changedPaths.includes(MIRROR_ZH_PATH)) {
    await upsertFile(
      {
        path: MIRROR_ZH_PATH,
        contentBase64: encodeTextBase64(guardedZh.sanitized),
        branch,
        message: `update ${MIRROR_ZH_PATH}`,
        sha: existingZh?.sha
      },
      input.publicWrite
    )
  }

  if (changedPaths.includes(MIRROR_EN_PATH)) {
    await upsertFile(
      {
        path: MIRROR_EN_PATH,
        contentBase64: encodeTextBase64(guardedEn.sanitized),
        branch,
        message: `update ${MIRROR_EN_PATH}`,
        sha: existingEn?.sha
      },
      input.publicWrite
    )
  }

  const publish = await createAndMaybeMergePR({
    target: input.publicWrite,
    branch,
    title: '同步教程文档镜像：mlog-open-source-deploy-guide',
    body: buildPrBody({
      actor: input.actor,
      requestId: input.requestId,
      action: 'tutorial-public-mirror',
      paths: changedPaths
    })
  })

  const lastMirrorCommitSha = await getBranchHeadSha(branch, input.publicWrite).catch(() => undefined)

  return {
    docsPaths: [MIRROR_ZH_PATH, MIRROR_EN_PATH],
    publish,
    lastMirrorCommitSha
  }
}

async function saveTutorialSyncState(input: {
  actor: 'admin' | 'system'
  requestId: string
  state: TutorialSyncState
  contentWrite: GithubRepoEnv
}): Promise<PublishResult | undefined> {
  const nextRaw = serializeTutorialSyncState(input.state)
  const existing = await getRepoTextFile(TUTORIAL_SYNC_STATE_PATH, undefined, input.contentWrite)
  if (existing?.content === nextRaw) {
    return undefined
  }

  const branch = buildBranchName('tutorial', 'sync-state')
  await createBranch(branch, input.contentWrite)
  await upsertFile(
    {
      path: TUTORIAL_SYNC_STATE_PATH,
      contentBase64: encodeTextBase64(nextRaw),
      branch,
      message: `update ${TUTORIAL_SYNC_STATE_PATH}`,
      sha: existing?.sha
    },
    input.contentWrite
  )

  return createAndMaybeMergePR({
    target: input.contentWrite,
    branch,
    title: '更新教程同步状态',
    body: buildPrBody({
      actor: input.actor,
      requestId: input.requestId,
      action: 'tutorial-sync-state',
      paths: [TUTORIAL_SYNC_STATE_PATH]
    })
  })
}

export async function runTutorialSync(input: {
  actor: 'admin' | 'system'
  requestId: string
  force?: boolean
}): Promise<TutorialSyncResult> {
  if (!PUBLIC_MIRROR_ALLOWLIST.includes(TUTORIAL_SLUG)) {
    throw new AdminHttpError(400, 'TUTORIAL_NOT_ALLOWED', 'Tutorial slug is not in PUBLIC_MIRROR_ALLOWLIST.')
  }

  const contentRead = getContentGithubReadEnv()
  const contentWrite = getContentGithubWriteEnv()
  const publicWrite = getPublicGithubWriteEnv()

  const ensured = await ensureTutorialLocales({
    actor: input.actor,
    requestId: input.requestId,
    contentRead
  })

  const refreshed = await refreshTutorialUpdatedDate({
    actor: input.actor,
    requestId: input.requestId,
    zhRaw: ensured.zhRaw,
    enRaw: ensured.enRaw,
    contentWrite
  })

  const sourceHash = hashSource({
    zhRaw: refreshed.zhRaw,
    enRaw: refreshed.enRaw
  })

  const state = await loadTutorialSyncState(contentRead)
  const sourcePublish = refreshed.contentPublish || ensured.contentPublish

  if (!input.force && state?.sourceHash === sourceHash) {
    return {
      status: 'SKIPPED_NO_SOURCE_CHANGE',
      slug: TUTORIAL_SLUG,
      sourceHash,
      blogPaths: [TUTORIAL_ZH_PATH, TUTORIAL_EN_PATH],
      docsPaths: [MIRROR_ZH_PATH, MIRROR_EN_PATH],
      updatedDateApplied: refreshed.updatedDateApplied,
      updatedDateChanged: refreshed.updatedDateChanged,
      contentPublish: sourcePublish,
      aiSteps: ensured.aiSteps
    }
  }

  let mirrorResult: Awaited<ReturnType<typeof mirrorTutorialToPublic>>
  try {
    mirrorResult = await mirrorTutorialToPublic({
      actor: input.actor,
      requestId: input.requestId,
      zhRaw: refreshed.zhRaw,
      enRaw: refreshed.enRaw,
      publicWrite
    })
  } catch (error) {
    if (error instanceof AdminHttpError) {
      throw error
    }
    throw new AdminHttpError(502, 'TUTORIAL_MIRROR_FAILED', error instanceof Error ? error.message : 'Failed to mirror tutorial docs.')
  }

  const now = new Date().toISOString()
  const nextState: TutorialSyncState = {
    slug: TUTORIAL_SLUG,
    sourceHash,
    lastSyncedAt: now,
    lastSyncedBy: input.actor,
    lastPublicMirrorCommit: mirrorResult.lastMirrorCommitSha
  }

  const statePublish = await saveTutorialSyncState({
    actor: input.actor,
    requestId: input.requestId,
    state: nextState,
    contentWrite
  })

  const deploy =
    isMergedOrMissing(ensured.contentPublish) && isMergedOrMissing(refreshed.contentPublish)
      ? await triggerVercelDeployHook({
          requestId: input.requestId,
          reason: 'tutorial-sync',
          changedPaths: [TUTORIAL_ZH_PATH, TUTORIAL_EN_PATH]
        })
      : {
          triggered: false,
          success: false,
          message: 'Tutorial source PR is not merged; deploy skipped.'
        }

  return {
    status: 'SYNCED',
    slug: TUTORIAL_SLUG,
    sourceHash,
    blogPaths: [TUTORIAL_ZH_PATH, TUTORIAL_EN_PATH],
    docsPaths: mirrorResult.docsPaths,
    updatedDateApplied: refreshed.updatedDateApplied,
    updatedDateChanged: refreshed.updatedDateChanged,
    contentPublish: sourcePublish,
    publicMirrorPublish: mirrorResult.publish,
    statePublish,
    deploy,
    aiSteps: ensured.aiSteps
  }
}
