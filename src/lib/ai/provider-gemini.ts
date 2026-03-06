import type { AiRuntimeConfig } from '@/lib/ai/config'

type ProviderPromptInput = {
  systemPrompt: string
  userPrompt: string
  signal: AbortSignal
}

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>
    }
  }>
  promptFeedback?: {
    blockReason?: string
  }
  error?: {
    message?: string
  }
}

export async function runGeminiProvider(config: AiRuntimeConfig, input: ProviderPromptInput): Promise<{ text: string; model: string }> {
  if (!config.gemini) {
    throw new Error('Gemini provider is not configured.')
  }

  const endpoint = `${config.gemini.baseUrl}/models/${encodeURIComponent(config.gemini.model)}:generateContent?key=${encodeURIComponent(config.gemini.apiKey)}`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      systemInstruction: {
        role: 'system',
        parts: [{ text: input.systemPrompt }]
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: input.userPrompt }]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json'
      }
    }),
    signal: input.signal
  })

  const raw = await response.text()
  let parsed: GeminiResponse | null = null
  try {
    parsed = raw ? (JSON.parse(raw) as GeminiResponse) : null
  } catch {
    parsed = null
  }

  if (!response.ok) {
    const message = parsed?.error?.message || raw || `Gemini provider error (${response.status})`
    throw new Error(message)
  }

  if (parsed?.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked the request: ${parsed.promptFeedback.blockReason}`)
  }

  const text = (parsed?.candidates?.[0]?.content?.parts || [])
    .map(part => (typeof part?.text === 'string' ? part.text : ''))
    .join('\n')
    .trim()

  if (!text) {
    throw new Error('Gemini provider returned empty content.')
  }

  return {
    text,
    model: config.gemini.model
  }
}
