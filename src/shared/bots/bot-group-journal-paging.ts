import type { AgentJournalRenderItem } from '../agent-session/journal/agent-session-journal-types'
import { botGroupOperationSubmission, type BotGroupTurn, type GroupJournal } from './bot-group'

/** The most older pages a room reader asks for an ended turn's rows: its saved reply already shows,
 *  so the room never reads a long chat's whole history for it. */
export const BOT_GROUP_ENDED_PAGE_LIMIT = 5
/** The waits before a room reader asks again for a page whose last read added no rows (it may have
 *  failed): a few spaced retries, then none until the rows change. */
export const BOT_GROUP_PAGE_RETRY_MS: readonly number[] = [5_000, 20_000, 60_000]
/** The same for an ended turn whose reply the page had no room to carry: nothing of it shows yet. */
export const BOT_GROUP_HIDDEN_PAGE_LIMIT = 20

/** A room reader's member turn: its operation, and its page marker once it ended. */
export type BotGroupReaderTurn = Pick<BotGroupTurn, 'operationId' | 'ended'>

/** Why a turn's rows the room needs are further back: `admitted`, one with no loaded rows whose send
 *  was admitted on this page; `hidden`, an ended one (a long turn's send can be older than the page)
 *  showing nothing yet: no rows, or a reply none of whose text is loaded, and no saved reply on the
 *  page; `ended`, the same but its saved reply shows; null when none is. Queued or refused ones have
 *  none. `pages` says which of the ended kinds the reader still pages for. */
export function botGroupTurnsOlderThanPage(
  snapshot: GroupJournal,
  turns: readonly BotGroupReaderTurn[],
  loaded: (operationId: string) => readonly AgentJournalRenderItem[],
  pages: { ended: boolean; hidden: boolean }
): 'admitted' | 'hidden' | 'ended' | null {
  let reason: 'hidden' | 'ended' | null = null
  for (const { operationId, ended } of turns) {
    const rows = loaded(operationId)
    const needs =
      rows.length > 0
        ? ended?.reply !== undefined && reason !== 'hidden' && !holdsText(rows)
        : botGroupOperationSubmission(snapshot, operationId)?.dispatchState === 'accepted'
          ? 'admitted'
          : ended !== undefined && reason !== 'hidden'
    if (needs === 'admitted') {
      return 'admitted'
    }
    if (needs && ended) {
      const kind = ended.reply === '' ? 'hidden' : 'ended'
      if (pages[kind]) {
        reason = kind
      }
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
