import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { catalogImageFixture, pngImageBytes } from '../media/plugin-image-test-fixture'
import { readMarketplaceSnapshots } from './plugin-marketplace-snapshots'
import type { PluginMarketplaceGitSource } from '../../../shared/plugins/catalog/plugin-marketplace'
import { PluginMarketplaceStore } from './plugin-marketplace-store'

const roots: string[] = []

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'orca-marketplace-store-'))
  roots.push(root)
  return root
}

function source(ref = 'main'): PluginMarketplaceGitSource {
  return { kind: 'git', url: 'https://github.com/community/plugins.git', ref }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('PluginMarketplaceStore', () => {
  it('keeps the previous readable snapshot when the replacement exceeds the read limit', async () => {
    const root = await tempRoot()
    const store = new PluginMarketplaceStore(root)
    const registered = await store.addSource(source())
    const listing = { name: 'Community', owner: 'community', plugins: [] }
    const previous = await store.writeSnapshot({
      source: registered,
      marketplaceCommit: 'a'.repeat(40),
      marketplace: listing
    })
    const cover = catalogImageFixture('cover.png', pngImageBytes(1600, 1000))
    const releases = Array.from({ length: 32 }, (_, index) => ({
      version: `1.0.${index}`,
      commit: 'c'.repeat(40),
      contentHash: 'f'.repeat(64),
      execution: 'data' as const,
      minimumOrca: '1.4.0',
      changelog: 'a'.repeat(2_000),
      images: { cover }
    }))
    const plugins = Array.from({ length: 260 }, (_, index) => ({
      id: `community.plugin-${index}`,
      source: source(),
      categories: [],
      releases
    }))

    await expect(
      store.writeSnapshot({
        source: registered,
        marketplaceCommit: 'b'.repeat(40),
        marketplace: { ...listing, plugins }
      })
    ).rejects.toThrow('marketplace snapshot exceeds its size limit')
    await expect(new PluginMarketplaceStore(root).readSnapshot(registered.id)).resolves.toEqual(
      previous
    )
  })
  it('lists healthy sources when a snapshot written by an older build is unreadable', async () => {
    const root = await tempRoot()
    const store = new PluginMarketplaceStore(root)
    const failed = await store.addSource(source('broken'))
    const healthy = await store.addSource(source('healthy'))
    const snapshot = await store.writeSnapshot({
      source: healthy,
      marketplaceCommit: 'a'.repeat(40),
      marketplace: { name: 'Community', owner: 'community', plugins: [] }
    })
    await writeFile(join(root, 'marketplaces', 'snapshots', `${failed.id}.v2.json`), '{')
    await expect(readMarketplaceSnapshots(new PluginMarketplaceStore(root))).resolves.toEqual([
      { source: healthy, snapshot }
    ])
  })
  it('atomically publishes a strict cached snapshot and removes it with its source', async () => {
    const root = await tempRoot()
    const store = new PluginMarketplaceStore(root)
    const registered = await store.addSource(source(), 123)
    const snapshot = await store.writeSnapshot({
      source: registered,
      marketplaceCommit: 'a'.repeat(40),
      fetchedAt: 456,
      marketplace: {
        name: 'Community',
        owner: 'community',
        plugins: [
          {
            id: 'community.theme',
            source: {
              kind: 'git',
              url: 'https://github.com/community/theme.git',
              ref: 'v1'
            },
            categories: ['themes']
          }
        ]
      }
    })

    await expect(new PluginMarketplaceStore(root).readSnapshot(registered.id)).resolves.toEqual(
      snapshot
    )
    expect(
      (await readdir(join(root, 'marketplaces', 'snapshots'))).filter((entry) =>
        entry.endsWith('.tmp')
      )
    ).toEqual([])
    await expect(store.removeSource(registered.id)).resolves.toBe(true)
    await expect(store.readSnapshot(registered.id)).resolves.toBeNull()
  })

  it('keeps release-bearing snapshots out of the key older builds read', async () => {
    const root = await tempRoot()
    const store = new PluginMarketplaceStore(root)
    const registered = await store.addSource(source(), 123)
    const snapshots = join(root, 'marketplaces', 'snapshots')
    const legacy = {
      schemaVersion: 1,
      sourceId: registered.id,
      source: source(),
      marketplaceCommit: 'a'.repeat(40),
      fetchedAt: 1,
      marketplace: { name: 'Old', owner: 'community', plugins: [] }
    }
    await mkdir(snapshots, { recursive: true })
    await writeFile(join(snapshots, `${registered.id}.json`), JSON.stringify(legacy))
    await expect(store.readSnapshot(registered.id)).resolves.toEqual(legacy)

    await store.writeSnapshot({
      source: registered,
      marketplaceCommit: 'b'.repeat(40),
      marketplace: {
        name: 'New',
        owner: 'community',
        plugins: [
          {
            id: 'community.notes',
            source: { kind: 'git', url: 'https://github.com/community/notes.git', ref: 'v1' },
            categories: [],
            releases: [
              {
                version: '1.0.0',
                commit: 'c'.repeat(40),
                contentHash: 'f'.repeat(64),
                execution: 'data',
                minimumOrca: '1.4.0',
                types: ['interface-language']
              }
            ]
          }
        ]
      }
    })

    await expect(store.readSnapshot(registered.id)).resolves.toMatchObject({
      marketplace: { name: 'New' }
    })
    // An older build reads only `<id>.json`, which still holds v1-shaped data it can parse.
    expect(JSON.parse(await readFile(join(snapshots, `${registered.id}.json`), 'utf8'))).toEqual(
      legacy
    )
    await store.removeSource(registered.id)
    expect(await readdir(snapshots)).toEqual([])
  })
})
