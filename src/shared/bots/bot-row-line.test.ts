import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { botWaitTimeFormat } from './bot-row-line'

beforeEach(() => {
  vi.stubEnv('TZ', 'America/New_York')
})
afterEach(() => {
  vi.unstubAllEnvs()
})

const read = (at: number, now: number) =>
  new Intl.DateTimeFormat('en-US', botWaitTimeFormat(at, now)).format(at)

describe('botWaitTimeFormat', () => {
  it("names the day of a short timer that runs past midnight, so it doesn't read as today", () => {
    // Set at 11:58 PM on Tue Dec 1 for seven minutes later.
    const now = Date.parse('2026-12-02T04:58:00Z')
    expect(read(Date.parse('2026-12-02T05:05:00Z'), now)).toBe('Wed 12:05 AM')
    expect(read(Date.parse('2026-12-02T04:59:00Z'), now)).toBe('11:59 PM')
  })
})
