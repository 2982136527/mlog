type OpenAICompatibleRequest = {
  apiKey: string
  baseUrl: string
  model: string
  systemPrompt: string
  userPrompt: string
  signal: AbortSignal
}

type OpenAICompatibleResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>
    }
  }>
  error?: {
    message?: string
  }
}

type OpenAICompatibleMessageContent = string | Array<{ type?: string; text?: string }> | undefined

function extractMessageContent(content: OpenAICompatibleMessageContent): string {
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .map(part => (typeof part?.text === 'string' ? part.text : ''))
      .join('\n')
      .trim()
  }
  return ''
}

export async function requestOpenAiCompatible(input: OpenAICompatibleRequest): Promise<{ text: string; model: string }> {
  const response = await fetch(`${input.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.apiKey}`
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: input.systemPrompt
        },
        {
          role: 'user',
          content: input.userPrompt
        }
      ]
    }),
    signal: input.signal
  })

  const raw = await response.text()
  let parsed: OpenAICompatibleResponse | null = null
  try {
    parsed = raw ? (JSON.parse(raw) as OpenAICompatibleResponse) : null
  } catch {
    parsed = null
  }

  if (!response.ok) {
    const message = parsed?.error?.message || raw || `OpenAI compatible provider error (${response.status})`
    throw new Error(message)
  }

  const text = extractMessageContent(parsed?.choices?.[0]?.message?.content).trim()
  if (!text) {
    throw new Error('OpenAI compatible provider returned empty content.')
  }

  return {
    text,
    model: input.model
  }
}
