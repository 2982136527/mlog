import { describe, expect, it } from 'vitest'
import {
  buildDefaultDailyBlogConfig,
  parseDailyBlogConfigUpdate
} from '@/lib/automation/daily-blog/config'

describe('daily blog config', () => {
  it('rejects an inverted article length range', () => {
    const current = buildDefaultDailyBlogConfig()

    expect(() => parseDailyBlogConfigUpdate({
      enabled: true,
      minLength: 3_000,
      maxLength: 2_000
    }, current)).toThrow(/maxLength/)
  })
})
