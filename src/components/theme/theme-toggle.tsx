'use client'

import { useSyncExternalStore } from 'react'
import type { Locale } from '@/i18n/config'
import { getDictionary } from '@/i18n/dictionaries'
import { DEFAULT_THEME, THEME_STORAGE_KEY, isTheme } from '@/lib/theme'
import type { Theme } from '@/types/theme'

type ThemeToggleProps = {
  locale: Locale
}

const THEME_CHANGE_EVENT = 'mlog:theme-change'

function nextTheme(theme: Theme): Theme {
  return theme === 'classic' ? 'ornate' : 'classic'
}

function readThemeFromDocument(): Theme {
  if (typeof document === 'undefined') {
    return DEFAULT_THEME
  }

  const current = document.documentElement.dataset.theme
  return isTheme(current) ? current : DEFAULT_THEME
}

function writeThemeToDocument(theme: Theme): void {
  document.documentElement.dataset.theme = theme
}

function subscribeThemeChange(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined
  }

  const onEvent = () => onStoreChange()
  window.addEventListener('storage', onEvent)
  window.addEventListener(THEME_CHANGE_EVENT, onEvent)

  return () => {
    window.removeEventListener('storage', onEvent)
    window.removeEventListener(THEME_CHANGE_EVENT, onEvent)
  }
}

function getThemeServerSnapshot(): Theme {
  return DEFAULT_THEME
}

export function ThemeToggle({ locale }: ThemeToggleProps) {
  const dict = getDictionary(locale)
  const theme = useSyncExternalStore(subscribeThemeChange, readThemeFromDocument, getThemeServerSnapshot)
  const themeLabel = theme === 'ornate' ? dict.common.themeOrnate : dict.common.themeClassic

  const toggleTheme = () => {
    const target = nextTheme(theme)
    writeThemeToDocument(target)

    try {
      localStorage.setItem(THEME_STORAGE_KEY, target)
    } catch {
      // Ignore storage failures (private mode, quota, etc.)
    }

    window.dispatchEvent(new Event(THEME_CHANGE_EVENT))
  }

  return (
    <button
      type='button'
      onClick={toggleTheme}
      aria-label={`${dict.common.theme}: ${themeLabel}`}
      aria-pressed={theme === 'ornate'}
      title={`${dict.common.theme}: ${themeLabel}`}
      className='inline-flex items-center gap-2 rounded-full border border-[var(--glass-border-strong)] bg-[var(--glass-bg-strong)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink-soft)] shadow-sm transition hover:border-[var(--color-brand)] hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]'>
      <span className='text-[10px] uppercase tracking-[0.08em]'>{dict.common.theme}</span>
      <span className='rounded-full bg-white/70 px-2 py-0.5 text-[11px] text-[var(--color-ink)]'>{themeLabel}</span>
    </button>
  )
}
