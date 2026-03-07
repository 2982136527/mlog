import type { AutomationHealth } from '@/types/automation'

export const SHANGHAI_TIMEZONE = 'Asia/Shanghai'

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

export function getShanghaiDateContext(now = new Date()): {
  dateStamp: string
  dateIso: string
  minutesOfDay: number
} {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  })

  const parts = formatter.formatToParts(now)
  const year = Number(parts.find(part => part.type === 'year')?.value || 1970)
  const month = Number(parts.find(part => part.type === 'month')?.value || 1)
  const day = Number(parts.find(part => part.type === 'day')?.value || 1)
  const hour = Number(parts.find(part => part.type === 'hour')?.value || 0)
  const minute = Number(parts.find(part => part.type === 'minute')?.value || 0)

  const dateIso = `${year}-${pad2(month)}-${pad2(day)}`
  return {
    dateIso,
    dateStamp: `${year}${pad2(month)}${pad2(day)}`,
    minutesOfDay: hour * 60 + minute
  }
}

export function parseLocalScheduleTime(value: string): { hour: number; minute: number } {
  const matched = value.match(/^(\d{1,2}):(\d{2})$/)
  if (!matched) {
    return { hour: 0, minute: 0 }
  }

  const hour = Math.min(23, Math.max(0, Number(matched[1])))
  const minute = Math.min(59, Math.max(0, Number(matched[2])))
  return {
    hour,
    minute
  }
}

export function extractPostSlug(path: string): string | null {
  const matched = path.match(/^content\/posts\/([^/]+)\/(zh|en)\.md$/)
  return matched ? matched[1] : null
}

export function hasPublishedTodayByPrefix(paths: string[], slugPrefix: string, dateStamp: string): boolean {
  const slugSet = new Set(paths.map(extractPostSlug).filter(Boolean) as string[])
  return Array.from(slugSet).some(slug => slug.startsWith(`${slugPrefix}${dateStamp}-`))
}

export function buildAutomationHealth(input: {
  enabled: boolean
  dateStamp: string
  dateIso: string
  minutesOfDay: number
  expectedHour: number
  expectedMinute?: number
  backfillHour: number
  backfillMinute?: number
  hasPublishedToday: boolean
}): AutomationHealth {
  const expectedMinute = input.expectedMinute ?? 0
  const backfillMinute = input.backfillMinute ?? 0
  const expectedTotal = input.expectedHour * 60 + expectedMinute

  const state: AutomationHealth['state'] = !input.enabled
    ? 'disabled'
    : input.hasPublishedToday
      ? 'ok'
      : input.minutesOfDay < expectedTotal
        ? 'pending'
        : 'missed'

  return {
    dateStamp: input.dateStamp,
    state,
    expectedRunAtLocal: `${input.dateIso} ${pad2(input.expectedHour)}:${pad2(expectedMinute)}`,
    backfillAtLocal: `${input.dateIso} ${pad2(input.backfillHour)}:${pad2(backfillMinute)}`,
    hasPublishedToday: input.hasPublishedToday
  }
}
