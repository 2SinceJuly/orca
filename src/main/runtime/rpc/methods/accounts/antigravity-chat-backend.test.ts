import { expect, it } from 'vitest'
import { switchedAgyAccount } from './antigravity-chat-backend'
import { agentModelCatalogStore } from '../../../../native-chat/agent-model-catalog/agent-model-catalog-store'
import { parseAgyModelListing } from '../../../../antigravity/antigravity-model-listing'

const probe = (rows: string[]) => ({
  models: parseAgyModelListing(rows.join('\n')),
  origin: 'probe' as const
})

it("a switched agy account keeps none of the previous account's rows and fences its chats", () => {
  const store = agentModelCatalogStore
  store.recordSuccess(
    'agy-home',
    'antigravity',
    probe(['gemini-4-neon-high\tGemini 4 Neon (high)', 'gpt-oss-120b-medium\tGPT-OSS 120B']),
    'discovery'
  )
  const revision = store.retirementRevision('antigravity')
  switchedAgyAccount({ runtime: 'host' })
  // Chats captured before the switch check this revision before saving what they list.
  expect(store.retirementRevision('antigravity')).not.toBe(revision)
  store.recordSuccess(
    'agy-home',
    'antigravity',
    probe(['gpt-oss-120b-medium\tGPT-OSS 120B']),
    'discovery'
  )
  expect(store.get('agy-home')?.models.map((model) => model.id)).toEqual(['gpt-oss-120b-medium'])
})
