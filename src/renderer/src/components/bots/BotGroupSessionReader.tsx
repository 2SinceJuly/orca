import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { RuntimeClientTarget } from '../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import { useStructuredAgentSession } from '../native-chat/session/structured/use-structured-agent-session'
import {
  createBotGroupJournalIndexer,
  type indexBotGroupJournal,
  type BotGroupTurn
} from '../../../../shared/bots/bot-group'
import {
  BOT_GROUP_ENDED_PAGE_LIMIT,
  BOT_GROUP_HIDDEN_PAGE_LIMIT,
  BOT_GROUP_PAGE_RETRY_MS,
  type BotGroupReaderTurn,
  botGroupTurnsOlderThanPage
} from '../../../../shared/bots/bot-group-journal-paging'
export type BotGroupSession = ReturnType<typeof useStructuredAgentSession> & {
  groupTurnItems: ReturnType<typeof indexBotGroupJournal>
}
export const BotGroupSessionReader = memo(function BotGroupSessionReader({
  target,
  turn,
  visible,
  report
}: {
  /** The group's host, which runs its members' sessions. */
  target: RuntimeClientTarget
  turn: Pick<BotGroupTurn, 'sessionId' | 'agent'> & {
    operationIds: readonly string[]
    turns: readonly BotGroupReaderTurn[]
  }
  visible: boolean
  report: (sessionId: string, session: BotGroupSession | null) => void
}): null {
  const controller = useStructuredAgentSession({
    sessionId: turn.sessionId,
    agent: turn.agent,
    target,
    isVisible: visible,
    queueFollowUps: true
  })
  const indexJournal = useMemo(() => createBotGroupJournalIndexer(), [])
  const groupTurnItems = useMemo(
    () =>
      indexJournal(
        { items: controller.journalItems, submissions: controller.submissions },
        turn.operationIds
      ),
    [indexJournal, controller.journalItems, controller.submissions, turn.operationIds]
  )
  const { readCurrent, hasOlder, loadingOlder, loadOlder } = controller
  // The rows a page was last asked for at: a read that failed or added nothing asks again once the
  // rows change or the read restarts. Ended turns pull a bounded number of pages per reader, which a
  // restart does not refill, so reopening a room never reads further back.
  const pagedAt = useRef<unknown>(null)
  const endedPages = useRef(0)
  const retries = useRef<{ rows: unknown; count: number }>({ rows: null, count: 0 })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!readCurrent || !visible) {
      pagedAt.current = null
      return undefined
    }
    if (retries.current.rows !== controller.journalItems) {
      retries.current = { rows: controller.journalItems, count: 0 }
    }
    if (!hasOlder || loadingOlder) {
      return undefined
    }
    const reason = botGroupTurnsOlderThanPage(
      { items: controller.journalItems, submissions: controller.submissions },
      turn.turns,
      groupTurnItems,
      {
        ended: endedPages.current < BOT_GROUP_ENDED_PAGE_LIMIT,
        hidden: endedPages.current < BOT_GROUP_HIDDEN_PAGE_LIMIT
      }
    )
    if (!reason) {
      return undefined
    }
    if (pagedAt.current === controller.journalItems) {
      const delay = BOT_GROUP_PAGE_RETRY_MS[retries.current.count]
      if (delay === undefined) {
        return undefined
      }
      const timer = setTimeout(() => {
        retries.current.count += 1
        pagedAt.current = null
        setRetry((count) => count + 1)
      }, delay)
      return () => clearTimeout(timer)
    }
    endedPages.current += reason === 'admitted' ? 0 : 1
    pagedAt.current = controller.journalItems
    void loadOlder()
    return undefined
  }, [
    retry,
    visible,
    readCurrent,
    hasOlder,
    loadingOlder,
    loadOlder,
    turn.operationIds,
    turn.turns,
    groupTurnItems,
    controller.journalItems,
    controller.submissions
  ])
  const session = useMemo(() => ({ ...controller, groupTurnItems }), [controller, groupTurnItems])
  useEffect(() => {
    report(turn.sessionId, session)
  }, [turn.sessionId, report, session])
  useEffect(() => () => report(turn.sessionId, null), [turn.sessionId, report])
  return null
})
