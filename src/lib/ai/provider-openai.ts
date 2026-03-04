import type { AiRuntimeConfig } from '@/lib/ai/config'
import { requestOpenAiCompatible } from '@/lib/ai/provider-openai-compatible'

type ProviderPromptInput = {
  systemPrompt: string
  userPrompt: string
  signal: AbortSignal
}

export async function runOpenAiProvider(config: AiRuntimeConfig, input: ProviderPromptInput): Promise<{ text: string; model: string }> {
  if (!config.openai) {
    throw new Error('OpenAI provider is not configured.')
  }

  return requestOpenAiCompatible({
    apiKey: config.openai.apiKey,
    baseUrl: config.openai.baseUrl,
    model: config.openai.model,
    systemPrompt: input.systemPrompt,
    userPrompt: input.userPrompt,
    signal: input.signal
  })
}

