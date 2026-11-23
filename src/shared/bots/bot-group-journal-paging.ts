import type { AgentJournalRenderItem } from '../agent-session/journal/agent-session-journal-types'
import { botGroupOperationSubmission, type GroupJournal } from './bot-group'

/** The most older pages a room reader asks for an ended turn's rows: its saved reply already shows,
 *  so the room never reads a long chat's whole history for it. */
export const BOT_GROUP_ENDED_PAGE_LIMIT = 5

/** Why a turn's rows the room needs are further back: `admitted`, one with no loaded rows whose send
 *  was admitted on this page; `ended`, one that ended (a long turn's send can be older than the page)
 *  with no loaded rows, or with a reply but none of its text loaded yet; null when none is. Queued or
 *  refused ones have none. `ended` maps each ended turn to whether it left a reply. */
export function botGroupTurnsOlderThanPage(
  snapshot: GroupJournal,
  operationIds: readonly string[],
  ended: ReadonlyMap<string, boolean>,
  loaded: (operationId: string) => readonly AgentJournalRenderItem[]
): 'admitted' | 'ended' | null {
  let reason: 'ended' | null = null
  for (const id of operationIds) {
    const rows = loaded(id)
    if (rows.length > 0) {
      if (ended.get(id) === true && !holdsText(rows)) {
        reason = 'ended'
      }
    } else if (botGroupOperationSubmission(snapshot, id)?.dispatchState === 'accepted') {
      return 'admitted'
    } else if (ended.has(id)) {
      reason = 'ended'
    }
  }
  return reason
}

// A turn's rows keep their array while unchanged (the journal indexer retains them), so each is
// scanned for text once, not on every journal update.
const textOf = new WeakMap<readonly AgentJournalRenderItem[], boolean>()

function holdsText(rows: readonly AgentJournalRenderItem[]): boolean {
  let found = textOf.get(rows)
  if (found === undefined) {
    found = rows.some(isAssistantText)
    textOf.set(rows, found)
  }
  return found
}

function isAssistantText(item: AgentJournalRenderItem): boolean {
  return (
    item.body.kind === 'message' &&
    item.body.role === 'assistant' &&
    item.body.blocks.some((block) => block.type === 'text' && block.text.trim() !== '')
  )
}
