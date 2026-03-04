import type { AiRuntimeConfig } from '@/lib/ai/config'
import { requestOpenAiCompatible } from '@/lib/ai/provider-openai-compatible'

type ProviderPromptInput = {
  systemPrompt: string
  userPrompt: string
  signal: AbortSignal
}

export async function runDeepseekProvider(config: AiRuntimeConfig, input: ProviderPromptInput): Promise<{ text: string; model: string }> {
  if (!config.deepseek) {
    throw new Error('DeepSeek provider is not configured.')
  }

  return requestOpenAiCompatible({
    apiKey: config.deepseek.apiKey,
    baseUrl: config.deepseek.baseUrl,
    model: config.deepseek.model,
    systemPrompt: input.systemPrompt,
    userPrompt: input.userPrompt,
    signal: input.signal
  })
}

