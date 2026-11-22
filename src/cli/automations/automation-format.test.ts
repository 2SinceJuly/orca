import { describe, expect, it } from 'vitest'
import type { Automation } from '../../shared/automations/automation-definition'
import { formatAutomationList } from './automation-format'

const by = Date.parse('2099-01-01T09:00:00Z')

function wait(on: Automation['on']): Automation {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the listing reads only these fields.
  return {
    id: 'a1',
    name: 'Stretch break',
    agentId: 'claude',
    enabled: true,
    once: { by },
    on
  } as Automation
}

describe('formatAutomationList', () => {
  it('shows a reminder as only its time, in local time', () => {
    const text = formatAutomationList({ automations: [wait([])] })
    expect(text).toContain(`runs once at ${new Date(by).toLocaleString()}`)
    expect(text).not.toContain('on an event')
  })

  it('keeps the event-or-deadline wording when a wait also has an event', () => {
    const slack = { id: 'r1', source: 'slack', event: 'message' } as const
    const text = formatAutomationList({ automations: [wait([slack])] })
    expect(text).toContain('on an event or at')
  })
})
