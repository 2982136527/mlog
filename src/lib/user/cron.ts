import { CronExpressionParser } from 'cron-parser'
import { AdminHttpError } from '@/lib/admin/errors'

function assertTimezoneSupported(timezone: string): void {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date())
  } catch {
    throw new AdminHttpError(400, 'INVALID_INPUT', `Unsupported timezone: ${timezone}`)
  }
}

export function normalizeTimezone(input: string | undefined): string {
  const timezone = (input || 'Asia/Shanghai').trim() || 'Asia/Shanghai'
  assertTimezoneSupported(timezone)
  return timezone
}

export function normalizeCronExpr(input: string): string {
  const value = input.trim().replace(/\s+/g, ' ')
  if (!value) {
    throw new AdminHttpError(400, 'INVALID_INPUT', 'cronExpr is required.')
  }
  const parts = value.split(' ')
  if (parts.length !== 5) {
    throw new AdminHttpError(400, 'INVALID_INPUT', 'cronExpr must use 5 fields (minute hour day month weekday).')
  }
  return value
}

export function getNextRunAt(input: { cronExpr: string; timezone: string; from?: Date }): string {
  const cronExpr = normalizeCronExpr(input.cronExpr)
  const timezone = normalizeTimezone(input.timezone)

  try {
    const interval = CronExpressionParser.parse(cronExpr, {
      currentDate: input.from || new Date(),
      tz: timezone
    })
    const next = interval.next().toISOString()
    if (!next) {
      throw new Error('Unable to compute next run time.')
    }
    return next
  } catch (error) {
    throw new AdminHttpError(400, 'INVALID_INPUT', error instanceof Error ? error.message : 'Invalid cron expression.')
  }
}
