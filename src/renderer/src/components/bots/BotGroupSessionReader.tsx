import { memo, useEffect, useMemo, useRef } from 'react'
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
  // rows change or the read restarts. Ended turns pull a bounded number of pages.
  const pagedAt = useRef<unknown>(null)
  const endedPages = useRef(0)
  useEffect(() => {
    if (!readCurrent) {
      pagedAt.current = null
      endedPages.current = 0
      return
    }
    if (!hasOlder || loadingOlder || pagedAt.current === controller.journalItems) {
      return
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
      return
    }
    endedPages.current += reason === 'admitted' ? 0 : 1
    pagedAt.current = controller.journalItems
    void loadOlder()
  }, [
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
