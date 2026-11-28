import { expect, it } from 'vitest'
import { createHookListenerState } from '../../listener-state'
import { normalizeHermesEvent } from './hermes-events'

const send = (
  state: ReturnType<typeof createHookListenerState>,
  eventName: string,
  payload: Record<string, unknown> = {}
) => normalizeHermesEvent(state, eventName, '', 'pane', { hook_event_name: eventName, ...payload })

it('does not report Hermes smart approvals as waiting on a human', () => {
  const state = createHookListenerState()

  expect(send(state, 'pre_llm_call', { session_id: 's1' })).toMatchObject({ state: 'working' })
  // Hermes' guardian decides by itself; nobody is shown a prompt.
  expect(send(state, 'pre_approval_request', { surface: 'smart' })).toBeNull()
  expect(
    send(state, 'post_approval_response', { surface: 'smart', choice: 'smart_approve' })
  ).toBeNull()
  expect(send(state, 'pre_tool_call', { tool_name: 'bash' })).toMatchObject({ state: 'working' })
})

it('still reports an approval that reaches a person', () => {
  const state = createHookListenerState()

  expect(
    send(state, 'pre_approval_request', { surface: 'interactive', command: 'sed -i s/a/b/ f' })
  ).toMatchObject({ state: 'waiting', toolName: 'approval' })
  expect(
    send(state, 'post_approval_response', { surface: 'interactive', choice: 'approve' })
  ).toMatchObject({
    state: 'working'
  })
})

it('still reports an approval hook that carries no surface', () => {
  const state = createHookListenerState()

  expect(send(state, 'pre_approval_request', { command: 'rm -rf build' })).toMatchObject({
    state: 'waiting'
  })
})
