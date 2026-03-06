import type { AiProvider } from '@/types/admin'

export type DiscoverableModel = {
  id: string
  label: string
  writingCapable: boolean
}

const PROVIDER_DEFAULT_BASE_URL: Record<AiProvider, string> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
}

const NON_WRITING_MODEL_PATTERNS: RegExp[] = [
  /embedding/i,
  /rerank/i,
  /moderation/i,
  /dall-e/i,
  /image/i,
  /vision/i,
  /tts/i,
  /speech/i,
  /audio/i,
  /transcri/i,
  /whisper/i
]

export function getProviderDefaultBaseUrl(provider: AiProvider): string {
  return PROVIDER_DEFAULT_BASE_URL[provider]
}

export function isWritingCapableModelId(modelId: string): boolean {
  const value = modelId.trim()
  if (!value) {
    return false
  }
  return !NON_WRITING_MODEL_PATTERNS.some(pattern => pattern.test(value))
}
