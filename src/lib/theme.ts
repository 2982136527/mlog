import type { Theme } from '@/types/theme'

export const THEME_STORAGE_KEY = 'mlog_theme_v1'
export const DEFAULT_THEME: Theme = 'classic'
export const THEMES: Theme[] = ['classic', 'ornate']

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && THEMES.includes(value as Theme)
}

export function getDefaultTheme(): Theme {
  return DEFAULT_THEME
}
