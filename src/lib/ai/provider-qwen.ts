import type { AiRuntimeConfig } from '@/lib/ai/config'
import { requestOpenAiCompatible } from '@/lib/ai/provider-openai-compatible'

type ProviderPromptInput = {
  systemPrompt: string
  userPrompt: string
  signal: AbortSignal
}

export async function runQwenProvider(config: AiRuntimeConfig, input: ProviderPromptInput): Promise<{ text: string; model: string }> {
  if (!config.qwen) {
    throw new Error('Qwen provider is not configured.')
  }

  return requestOpenAiCompatible({
    apiKey: config.qwen.apiKey,
    baseUrl: config.qwen.baseUrl,
    model: config.qwen.model,
    systemPrompt: input.systemPrompt,
    userPrompt: input.userPrompt,
    signal: input.signal
  })
}

