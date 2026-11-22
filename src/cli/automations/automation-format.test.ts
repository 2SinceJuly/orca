import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Automation } from '../../shared/automations/automation-definition'
import { formatAutomationList, formatAutomationShow } from './automation-format'

const by = Date.parse('2026-12-01T15:10:00Z')
const slack = { id: 'r1', source: 'slack', event: 'message' } as const

function wait(on: Automation['on']): Automation {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the formatters read only these fields.
  return {
    id: 'a1',
    name: 'Stretch break',
    agentId: 'claude',
    enabled: true,
    once: { by },
    on,
    rrule: 'FREQ=DAILY',
    dtstart: 0,
    nextRunAt: by
  } as Automation
}

beforeEach(() => {
  vi.stubEnv('TZ', 'America/New_York')
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('a wait in automations list and show', () => {
  it('shows a reminder as only its time, in local time with the offset', () => {
    for (const text of [
      formatAutomationList({ automations: [wait([])] }),
      formatAutomationShow({ automation: wait([]) })
    ]) {
      expect(text).toContain('runs once at 2026-12-01 10:10 (-05:00)')
      expect(text).not.toContain('on an event')
    }
  })

  it('keeps the event-or-deadline wording when a wait also has an event', () => {
    for (const text of [
      formatAutomationList({ automations: [wait([slack])] }),
      formatAutomationShow({ automation: wait([slack]) })
    ]) {
      expect(text).toContain('runs once, on an event or at 2026-12-01T15:10:00.000Z')
    }
  })
})
