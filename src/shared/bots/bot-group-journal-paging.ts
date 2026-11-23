import type { AgentJournalRenderItem } from '../agent-session/journal/agent-session-journal-types'
import { botGroupOperationSubmission, type BotGroupTurn, type GroupJournal } from './bot-group'

/** The most older pages a room reader asks for an ended turn's rows: its saved reply already shows,
 *  so the room never reads a long chat's whole history for it. */
export const BOT_GROUP_ENDED_PAGE_LIMIT = 5

/** A room reader's member turn: its operation, and its page marker once it ended. */
export type BotGroupReaderTurn = Pick<BotGroupTurn, 'operationId' | 'ended'>

/** Why a turn's rows the room needs are further back: `admitted`, one with no loaded rows whose send
 *  was admitted on this page; `ended`, one that ended (a long turn's send can be older than the page)
 *  with no loaded rows, or with a reply but none of its text loaded yet; null when none is. Queued or
 *  refused ones have none. With `endedPages` false (the reader spent its pages), only `admitted`. */
export function botGroupTurnsOlderThanPage(
  snapshot: GroupJournal,
  turns: readonly BotGroupReaderTurn[],
  loaded: (operationId: string) => readonly AgentJournalRenderItem[],
  endedPages: boolean
): 'admitted' | 'ended' | null {
  let reason: 'ended' | null = null
  for (const { operationId, ended } of turns) {
    const rows = loaded(operationId)
    if (rows.length > 0) {
      if (endedPages && reason === null && ended?.reply !== undefined && !holdsText(rows)) {
        reason = 'ended'
      }
    } else if (botGroupOperationSubmission(snapshot, operationId)?.dispatchState === 'accepted') {
      return 'admitted'
    } else if (endedPages && ended) {
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
