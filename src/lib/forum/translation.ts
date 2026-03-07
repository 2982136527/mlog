import { z } from 'zod'
import { AdminHttpError } from '@/lib/admin/errors'
import type { ForumContentLocale } from '@/types/forum'

const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
const DEFAULT_MODEL = 'gemini-2.5-pro'

const translatedPayloadSchema = z.object({
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(10).max(20000)
})

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>
    }
  }>
  error?: {
    message?: string
  }
}

function extractJsonPayload(raw: string): unknown {
  const trimmed = raw.trim()
  const fenceRemoved = trimmed.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()
  try {
    return JSON.parse(fenceRemoved)
  } catch {
    const start = fenceRemoved.indexOf('{')
    const end = fenceRemoved.lastIndexOf('}')
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(fenceRemoved.slice(start, end + 1))
    }
    throw new Error('Model response is not valid JSON.')
  }
}

function getLanguageName(locale: ForumContentLocale): string {
  return locale === 'zh' ? 'Simplified Chinese' : 'English'
}

export async function translateForumThreadWithGemini(input: {
  apiKey: string
  model?: string
  sourceLocale: ForumContentLocale
  targetLocale: ForumContentLocale
  title: string
  body: string
}): Promise<{
  title: string
  body: string
  model: string
}> {
  const model = (input.model || '').trim() || DEFAULT_MODEL
  const endpoint = `${DEFAULT_GEMINI_BASE_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(input.apiKey)}`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      systemInstruction: {
        role: 'system',
        parts: [
          {
            text: 'You are a professional bilingual forum editor. Return strict JSON only. Keep original meaning and markdown formatting.'
          }
        ]
      },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: [
                `Task: translate a forum thread from ${getLanguageName(input.sourceLocale)} to ${getLanguageName(input.targetLocale)}.`,
                'Output JSON schema:',
                '{"title":"string","body":"string"}',
                'Rules:',
                '- Keep markdown structure, code blocks and links unchanged where possible.',
                '- Keep technical terms accurate and natural.',
                '- Do not add extra sections or explanations.',
                '',
                `Source title:\n${input.title}`,
                '',
                `Source body:\n${input.body}`
              ].join('\n')
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json'
      }
    })
  })

  const raw = await response.text()
  let parsed: GeminiResponse | null = null
  try {
    parsed = raw ? (JSON.parse(raw) as GeminiResponse) : null
  } catch {
    parsed = null
  }

  if (!response.ok) {
    const message = parsed?.error?.message || raw || `Gemini request failed (${response.status})`
    throw new AdminHttpError(502, 'FORUM_TRANSLATION_FAILED', message, {
      status: response.status
    })
  }

  const text = (parsed?.candidates?.[0]?.content?.parts || [])
    .map(item => (typeof item?.text === 'string' ? item.text : ''))
    .join('\n')
    .trim()

  if (!text) {
    throw new AdminHttpError(502, 'FORUM_TRANSLATION_FAILED', 'Gemini returned empty content.')
  }

  let jsonPayload: unknown
  try {
    jsonPayload = extractJsonPayload(text)
  } catch (error) {
    throw new AdminHttpError(502, 'FORUM_TRANSLATION_FAILED', error instanceof Error ? error.message : 'Invalid translation output.')
  }

  const parsedPayload = translatedPayloadSchema.safeParse(jsonPayload)
  if (!parsedPayload.success) {
    throw new AdminHttpError(502, 'FORUM_TRANSLATION_FAILED', parsedPayload.error.issues[0]?.message || 'Invalid translation output schema.')
  }

  return {
    title: parsedPayload.data.title,
    body: parsedPayload.data.body,
    model
  }
}
