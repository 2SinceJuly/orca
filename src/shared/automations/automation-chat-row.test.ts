import { describe, expect, it } from 'vitest'
import { waitHostRead, waitRowState, waitRowStatus, waitRowThen } from './automation-chat-row'
import { sayAutomationRunEnglish } from './automation-run-row-copy'

const made = (by?: number) => ({
  automationSaved: { automation: { id: 'auto-1', once: by === undefined ? {} : { by } } }
})

describe("a wait's creation row", () => {
  it('waits until its deadline, then reads as over without claiming how it ended', () => {
    expect(waitRowState(made(100), undefined, 99)).toEqual({ kind: 'waiting', once: { by: 100 } })
    expect(waitRowState(made(100), undefined, 100)).toEqual({ kind: 'past', at: 100 })
    expect(waitRowState(made(), undefined, 10_000)).toEqual({ kind: 'waiting', once: {} })
  })

  it('ends as its run or card in the chat says, before a cancel or the deadline', () => {
    const ending = { kind: 'event' as const, at: 50, actor: 'Nora' }
    expect(waitRowState({ ...made(100), savedWaitEnded: ending }, [], 200)).toEqual({
      kind: 'ended',
      ending
    })
    expect(waitRowState(made(100), [{ automationId: 'auto-1', at: 40 }], 200)).toEqual({
      kind: 'cancelled',
      at: 40
    })
  })

  // Its run or ending can land in another chat (--runs-in elsewhere, a closed chat, Home): the row
  // then follows its host's list of waits still waiting.
  it('reads as over once its host, read after it was made, no longer lists it', () => {
    const card = {
      automationSaved: { automation: { id: 'auto-1', once: {}, bot: { botId: 'bot-1' } } },
      timestamp: 1_000
    }
    const read = (readAt: number, ids: string[], botId = 'bot-1') =>
      waitHostRead(botId, { readAt, waits: ids.map((id) => ({ automation: { id } })) })
    expect(waitRowState(card, [], 2_000, read(1_500, []))).toEqual({ kind: 'over' })
    expect(waitRowState(card, [], 2_000, read(1_500, ['auto-1']))).toEqual({
      kind: 'waiting',
      once: {}
    })
    // A read from before the card, another bot's waits, or an older host's: still waiting.
    expect(waitRowState(card, [], 2_000, read(900, []))).toEqual({ kind: 'waiting', once: {} })
    expect(waitRowState(card, [], 2_000, read(1_500, [], 'bot-2'))).toEqual({
      kind: 'waiting',
      once: {}
    })
    expect(waitHostRead('bot-1', { waits: [] })).toBeNull()
    expect(
      waitRowState(card, [{ automationId: 'auto-1', at: 1_200 }], 2_000, read(1_500, []))
    ).toEqual({ kind: 'cancelled', at: 1_200 })
  })
})

describe("a reminder's row (a deadline and no event)", () => {
  const wording = { say: sayAutomationRunEnglish, formatTime: () => '5:10 PM', schedule: '' }
  const reminder = { on: [] }
  const reply = { on: [{ id: 'r1', source: 'slack' as const, event: 'message' as const }] }

  it('says only when it runs, never that something could come first', () => {
    expect(waitRowThen(reminder, { by: 100 }, wording)).toBe('Runs once at 5:10 PM')
    expect(waitRowThen(reply, { by: 100 }, wording)).toBe('Runs once; at 5:10 PM if nothing came')
  })

  it('does not read as nothing came when its time comes', () => {
    const ended = { kind: 'ended' as const, ending: { kind: 'deadline' as const, at: 100 } }
    expect(waitRowStatus(reminder, ended, wording)).toBe('')
    expect(waitRowStatus(reply, ended, wording)).toBe('No reply by 5:10 PM')
  })
})
