import { describe, expect, it } from 'vitest'
import { getDateIsoInTimeZone } from '@/lib/date'

describe('getDateIsoInTimeZone', () => {
  it('uses the Shanghai calendar date across the UTC day boundary', () => {
    const now = new Date('2026-07-12T16:30:00.000Z')
    expect(getDateIsoInTimeZone(now)).toBe('2026-07-13')
  })
})
