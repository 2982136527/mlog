import type { AiExecutionStep, PublishResult } from '@/types/admin'

export const TUTORIAL_SLUG = 'mlog-open-source-deploy-guide'

export type TutorialSyncState = {
  slug: typeof TUTORIAL_SLUG
  sourceHash: string
  lastSyncedAt: string
  lastSyncedBy: 'admin' | 'system'
  lastPublicMirrorCommit?: string
}

export type TutorialSyncStatus = 'SYNCED' | 'SKIPPED_NO_SOURCE_CHANGE'

export type TutorialSyncResult = {
  status: TutorialSyncStatus
  slug: typeof TUTORIAL_SLUG
  sourceHash: string
  blogPaths: string[]
  docsPaths: string[]
  updatedDateApplied?: string
  updatedDateChanged?: boolean
  contentPublish?: PublishResult
  publicMirrorPublish?: PublishResult
  statePublish?: PublishResult
  aiSteps?: AiExecutionStep[]
}
