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

const PROVIDER_FALLBACK_MODELS: Record<AiProvider, DiscoverableModel[]> = {
  gemini: [
    { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro', writingCapable: true },
    { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash', writingCapable: true },
    { id: 'gemini-2.0-flash', label: 'gemini-2.0-flash', writingCapable: true }
  ],
  openai: [
    { id: 'gpt-4o', label: 'gpt-4o', writingCapable: true },
    { id: 'gpt-4o-mini', label: 'gpt-4o-mini', writingCapable: true }
  ],
  deepseek: [
    { id: 'deepseek-chat', label: 'deepseek-chat', writingCapable: true },
    { id: 'deepseek-reasoner', label: 'deepseek-reasoner', writingCapable: true }
  ],
  qwen: [
    { id: 'qwen-plus', label: 'qwen-plus', writingCapable: true },
    { id: 'qwen-turbo', label: 'qwen-turbo', writingCapable: true },
    { id: 'qwen-max', label: 'qwen-max', writingCapable: true }
  ]
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

export function getProviderFallbackModels(provider: AiProvider): DiscoverableModel[] {
  return PROVIDER_FALLBACK_MODELS[provider].map(item => ({ ...item }))
}

export function isWritingCapableModelId(modelId: string): boolean {
  const value = modelId.trim()
  if (!value) {
    return false
  }
  return !NON_WRITING_MODEL_PATTERNS.some(pattern => pattern.test(value))
}
