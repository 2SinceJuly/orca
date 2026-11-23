// How a room page tells readers a member turn ended, with enough of its saved reply to show at once.
import type { BotGroupMessage } from '../../shared/bots/bot-group'

const ROOM_PAGE_REPLY_CHARS = 4_000
/** All of a page's reply tails, so a page of 32-member posts, with the page's answers, stays far
 *  under the reply limit even in 3-byte characters. */
const ROOM_PAGE_REPLY_BUDGET = 64_000

/** The least of a reply a turn gets while the page's budget lasts. */
const ROOM_PAGE_REPLY_MIN_CHARS = 500

/** Each ended turn's marker: its saved reply's tail, enough to read until its own rows load. The
 *  page's budget is shared evenly among the turns still to place, newest posts first, so one post of
 *  many long replies shows each of them; past the budget an empty reply still says it left one. */
export function withEndedTurns(messages: readonly BotGroupMessage[]): BotGroupMessage[] {
  let budget = ROOM_PAGE_REPLY_BUDGET
  let left = messages.reduce(
    (count, message) => count + message.turns.filter((turn) => turn.reply).length,
    0
  )
  const tail = (reply: string) => {
    const share = Math.floor(budget / Math.max(left, 1))
    left -= 1
    const kept = Math.min(
      ROOM_PAGE_REPLY_CHARS,
      budget,
      Math.max(share, Math.min(ROOM_PAGE_REPLY_MIN_CHARS, budget))
    )
    budget -= Math.min(reply.length, kept)
    return reply.length <= kept ? reply : kept > 0 ? `…${reply.slice(-kept)}` : ''
  }
  return messages
    .toReversed()
    .map((message) => ({
      ...message,
      turns: message.turns.map(({ reply, ...turn }) =>
        reply === undefined ? turn : { ...turn, ended: reply ? { reply: tail(reply) } : {} }
      )
    }))
    .toReversed()
}
