import type { AiProvider } from '@/types/admin'
import { getProviderDefaultBaseUrl } from '@/lib/user/provider-catalog'

const DEFAULT_CHAIN: AiProvider[] = ['gemini', 'openai', 'deepseek', 'qwen']
const VALID_PROVIDERS = new Set<AiProvider>(DEFAULT_CHAIN)

type GeminiConfig = {
  apiKey: string
  model: string
  baseUrl: string
}

type OpenAICompatibleConfig = {
  apiKey: string
  model: string
  baseUrl: string
}

export type AiRuntimeConfig = {
  enabled: boolean
  providerChain: AiProvider[]
  timeoutMs: number
  retryCount: number
  gemini: GeminiConfig | null
  openai: OpenAICompatibleConfig | null
  deepseek: OpenAICompatibleConfig | null
  qwen: OpenAICompatibleConfig | null
}

function normalizeBaseUrl(value: string | undefined, fallback: string): string {
  const picked = (value || fallback).trim()
  return picked.replace(/\/+$/, '')
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback
  }
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function parseIntRange(value: string | undefined, fallback: number, min: number, max: number): number {
  const num = Number.parseInt(value || '', 10)
  if (Number.isNaN(num)) return fallback
  return Math.min(max, Math.max(min, num))
}

function parseProviderChain(value: string | undefined): AiProvider[] {
  const raw = (value || '')
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)

  const chain = raw.filter((item): item is AiProvider => VALID_PROVIDERS.has(item as AiProvider))
  if (chain.length === 0) {
    return [...DEFAULT_CHAIN]
  }

  return Array.from(new Set(chain))
}

function readGeminiConfig(): GeminiConfig | null {
  const apiKey = (process.env.AI_GEMINI_API_KEY || '').trim()
  const model = (process.env.AI_GEMINI_MODEL || 'gemini-2.0-flash').trim()
  const baseUrl = normalizeBaseUrl(process.env.AI_GEMINI_BASE_URL, getProviderDefaultBaseUrl('gemini'))
  if (!apiKey || !model) {
    return null
  }
  return { apiKey, model, baseUrl }
}

function readOpenAiConfig(): OpenAICompatibleConfig | null {
  const apiKey = (process.env.AI_OPENAI_API_KEY || '').trim()
  const model = (process.env.AI_OPENAI_MODEL || 'gpt-4o-mini').trim()
  const baseUrl = normalizeBaseUrl(process.env.AI_OPENAI_BASE_URL, getProviderDefaultBaseUrl('openai'))
  if (!apiKey || !model) {
    return null
  }
  return { apiKey, model, baseUrl }
}

function readDeepseekConfig(): OpenAICompatibleConfig | null {
  const apiKey = (process.env.AI_DEEPSEEK_API_KEY || '').trim()
  const model = (process.env.AI_DEEPSEEK_MODEL || 'deepseek-chat').trim()
  const baseUrl = normalizeBaseUrl(process.env.AI_DEEPSEEK_BASE_URL, getProviderDefaultBaseUrl('deepseek'))
  if (!apiKey || !model) {
    return null
  }
  return { apiKey, model, baseUrl }
}

function readQwenConfig(): OpenAICompatibleConfig | null {
  const apiKey = (process.env.AI_QWEN_API_KEY || '').trim()
  const model = (process.env.AI_QWEN_MODEL || 'qwen-plus').trim()
  const baseUrl = normalizeBaseUrl(process.env.AI_QWEN_BASE_URL, getProviderDefaultBaseUrl('qwen'))
  if (!apiKey || !model) {
    return null
  }
  return { apiKey, model, baseUrl }
}

export function getAiRuntimeConfig(): AiRuntimeConfig {
  return {
    enabled: parseBoolean(process.env.AI_ENABLE, true),
    providerChain: parseProviderChain(process.env.AI_PROVIDER_CHAIN),
    timeoutMs: parseIntRange(process.env.AI_TIMEOUT_MS, 60_000, 5_000, 180_000),
    retryCount: parseIntRange(process.env.AI_RETRY_COUNT, 1, 0, 3),
    gemini: readGeminiConfig(),
    openai: readOpenAiConfig(),
    deepseek: readDeepseekConfig(),
    qwen: readQwenConfig()
  }
}
