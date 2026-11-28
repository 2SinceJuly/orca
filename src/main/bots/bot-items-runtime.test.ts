import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import type { BotItemsHostDeps } from './bot-items-runtime'
import { BotItemsHost } from './bot-items-runtime'
import { botItemsStoreFile } from './bot-items-input'

const state = vi.hoisted(() => ({ directory: '/profile' }))
const directories: string[] = []

vi.mock('../orca-profiles/profile-storage-paths', () => ({
  getProfileUserDataPath: () => state.directory
}))

function hostWithRetentionRead(read: ReturnType<typeof vi.fn>): BotItemsHost {
  const remote = { owedCommentAttachmentUploads: read }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the test exercises only the attachment-retention path, whose dependencies are supplied below.
  const deps = {
    workRuntime: {},
    db: { items: vi.fn(() => remote), dispose: vi.fn() },
    bots: () => [],
    githubCache: () => ({ pr: {}, issue: {} }),
    automations: () => [],
    chatTitle: () => null,
    chatExists: () => true,
    chatRoot: (id: string) => id,
    threadChats: () => [],
    automationRunChats: () => [],
    notify: () => {},
    sendMail: async () => true
  } as unknown as BotItemsHostDeps
  return new BotItemsHost(deps)
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

it('keeps item-mail attachment retention unknown only while an existing store cannot read', async () => {
  const read = vi.fn<() => Promise<string[]>>()
  state.directory = await mkdtemp(join(tmpdir(), 'orca-item-retention-'))
  directories.push(state.directory)
  const host = hostWithRetentionRead(read)

  expect(await host.owedCommentAttachmentUploads(state.directory, '/attachments')).toEqual(
    new Set()
  )

  await writeFile(botItemsStoreFile(state.directory), '')

  read.mockRejectedValueOnce(new Error('items database is temporarily unavailable'))
  expect(await host.owedCommentAttachmentUploads(state.directory, '/attachments')).toBeNull()

  read.mockResolvedValueOnce(['recovered-upload'])
  expect(await host.owedCommentAttachmentUploads(state.directory, '/attachments')).toEqual(
    new Set(['recovered-upload'])
  )
})

/** A bot as the views read it: only the fields `owningChat` looks at. */
function hostForChats(bots: readonly { id: string; chatSessionId: string | null }[]): BotItemsHost {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the test exercises only owningChat, whose dependencies are supplied below.
  const deps = {
    workRuntime: {},
    db: { items: vi.fn(), dispose: vi.fn() },
    bots: () => bots as never,
    githubCache: () => ({ pr: {}, issue: {} }),
    automations: () => [],
    chatTitle: () => null,
    chatExists: () => true,
    chatRoot: (id: string) => id,
    threadChats: () => [],
    automationRunChats: () => [],
    notify: () => {},
    sendMail: async () => true
  } as unknown as BotItemsHostDeps
  return new BotItemsHost(deps)
}

it('shows an item made in a bot’s replaced Home Chat as a plain chat, not Home Chat', () => {
  const host = hostForChats([{ id: 'bo', chatSessionId: 'home-2' }])
  const source = { kind: 'home', title: null } as const

  expect(host.owningChat({ chatId: 'home-1', ownerBotId: 'bo', source }).kind).toBe('chat')
  expect(host.owningChat({ chatId: 'home-2', ownerBotId: 'bo', source }).kind).toBe('home')
})

it('keeps another item kind as it was recorded', () => {
  const host = hostForChats([{ id: 'bo', chatSessionId: 'home-2' }])

  for (const kind of ['chat', 'thread', 'automation'] as const) {
    expect(
      host.owningChat({ chatId: 'c1', ownerBotId: 'bo', source: { kind, title: null } }).kind
    ).toBe(kind)
  }
})
