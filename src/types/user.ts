import type { AiProvider } from '@/types/admin'

export type UserAiProvider = {
  id: string
  provider: AiProvider
  model: string
  baseUrl: string | null
  keyFingerprint: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export type UserAiProviderInput = {
  provider: AiProvider
  model: string
  baseUrl?: string
  apiKey: string
  enabled?: boolean
}

export type UserAutomationJob = {
  id: string
  providerId: string
  topic: string
  cronExpr: string
  timezone: string
  enabled: boolean
  nextRunAt: string | null
  lastRunAt: string | null
  createdAt: string
  updatedAt: string
}

export type UserAutomationJobInput = {
  providerId: string
  topic: string
  cronExpr: string
  timezone?: string
  enabled?: boolean
}

export type UserAutomationRunStatus = 'PUBLISHED_DRAFT' | 'FAILED' | 'SKIPPED'

export type UserAutomationRun = {
  id: string
  jobId: string
  status: UserAutomationRunStatus
  requestId: string
  slug: string | null
  provider: string
  model: string
  message: string | null
  errorCode: string | null
  errorMessage: string | null
  publishPrUrl: string | null
  publishMerged: boolean | null
  startedAt: string
  finishedAt: string | null
}

