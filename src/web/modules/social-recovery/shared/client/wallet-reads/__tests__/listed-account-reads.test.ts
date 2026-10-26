/**
 * The key a recovery would remove from an account the wallet lists, read over
 * a fake node at one pinned block. Where the account has code, the keys the
 * wallet knows for it (its creation privileges, its associated keys and the
 * keys the wallet holds) are judged together with the sender of its latest
 * setup commit, the new key of its latest consumed handover and the
 * addresses its privilege writes name, so a key another wallet's recovery
 * handed the account to is found. Where it has none, its creation
 * privileges are its keys.
 */
import { zeroHash } from 'viem'

import type { Address, RawLog } from '@kohaku-eth/social-recovery'
import { eachIt } from '@web/modules/social-recovery/shared/chrome/__fixtures__/table'
import {
  ACCOUNT,
  attemptConsumedLog,
  attemptStartedLog,
  DEPLOYED_AT,
  HEAD,
  KEY_A,
  KEY_B,
  MANAGER
} from '@web/modules/social-recovery/shared/client/__fixtures__/scripted-provider'
import {
  chunksFrom,
  commitAt,
  CREATION,
  ENTRY_POINT,
  handoverTo,
  HOLDS,
  KEY_C,
  named,
  NEW_KEY,
  privilegeLog,
  RELAYER,
  worldOf
} from '@web/modules/social-recovery/shared/client/wallet-reads/__fixtures__/world'
import type { LogsCase } from '@web/modules/social-recovery/shared/client/wallet-reads/__fixtures__/types'

const listedWorldOf = (options: Parameters<typeof worldOf>[0] = {}) =>
  worldOf({
    creation: CREATION,
    initialPrivileges: [[KEY_A, HOLDS]],
    associatedKeys: [KEY_A, KEY_B],
    ...options
  })

/** A handover to `key` the manager consumed after the account's setup was saved by its creation key. */
const recoveredTo = (key: Address): RawLog[] => {
  const commit = commitAt(DEPLOYED_AT + 10)
  return [
    commit,
    attemptStartedLog(3n, handoverTo(key), DEPLOYED_AT + 20),
    attemptConsumedLog(3n, DEPLOYED_AT + 30)
  ]
}

describe('a listed account another wallet recovered', () => {
  eachIt<LogsCase>([
    [
      'the consumed handover and the privilege write',
      (key) => [
        ...recoveredTo(key),
        privilegeLog(KEY_A, zeroHash, DEPLOYED_AT + 30),
        privilegeLog(key, HOLDS, DEPLOYED_AT + 30)
      ]
    ],
    ['the consumed handover alone', recoveredTo],
    ['the privilege write alone', (key) => [privilegeLog(key, HOLDS, DEPLOYED_AT + 30)]]
  ])(
    'names the key the wallet never saw, found through %s, where no key the wallet knows holds',
    async (_, logsOf) => {
      const commit = commitAt(DEPLOYED_AT + 10)
      const { reads, askedPrivileges, askedAuthority } = listedWorldOf({
        logs: logsOf(NEW_KEY),
        senders: [[commit.transactionHash, KEY_A]],
        holders: [NEW_KEY],
        authorities: [KEY_A, KEY_B, NEW_KEY]
      })
      await expect(reads.removedKey()).resolves.toEqual(named(NEW_KEY))
      expect(askedPrivileges()).toEqual(
        expect.arrayContaining([KEY_A, KEY_B, NEW_KEY].map((key) => key.toLowerCase()))
      )
      expect(askedAuthority()).toEqual([[NEW_KEY.toLowerCase(), HEAD]])
    }
  )

  it('leaves the key unnamed where its creation key still holds beside the new one', async () => {
    const { reads } = listedWorldOf({
      logs: recoveredTo(NEW_KEY),
      holders: [KEY_A, NEW_KEY],
      authorities: [KEY_A, NEW_KEY]
    })
    await expect(reads.removedKey()).resolves.toEqual({
      kind: 'unavailable',
      cause: 'several-key-entries'
    })
  })

  it('leaves the key unnamed where nothing names the key that holds', async () => {
    const { reads } = listedWorldOf({ holders: [KEY_C], authorities: [KEY_C] })
    await expect(reads.removedKey()).resolves.toEqual({
      kind: 'unavailable',
      cause: 'not-a-key'
    })
  })
})

describe('a deployed listed account its creation key still controls', () => {
  it('names the creation key, judged at the pinned block', async () => {
    const commit = commitAt(DEPLOYED_AT + 10)
    const { reads, askedAuthority } = listedWorldOf({
      logs: [commit],
      senders: [[commit.transactionHash, KEY_A]],
      holders: [KEY_A],
      authorities: [KEY_A, KEY_B]
    })
    await expect(reads.removedKey()).resolves.toEqual(named(KEY_A))
    expect(askedAuthority()).toEqual([[KEY_A.toLowerCase(), HEAD]])
  })

  it('judges a creation key by the chain, whatever privilege the record gives it', async () => {
    const { reads } = listedWorldOf({
      initialPrivileges: [[KEY_C, zeroHash]],
      associatedKeys: [],
      holders: [KEY_C],
      authorities: [KEY_C]
    })
    await expect(reads.removedKey()).resolves.toEqual(named(KEY_C))
  })

  it('asks about each key once whatever its spelling, and never about the entry point', async () => {
    const { reads, askedPrivileges } = listedWorldOf({
      initialPrivileges: [
        [ENTRY_POINT, HOLDS],
        [KEY_A, HOLDS]
      ],
      associatedKeys: [KEY_A.toLowerCase() as Address],
      holders: [KEY_A],
      authorities: [KEY_A]
    })
    await expect(reads.removedKey()).resolves.toEqual(named(KEY_A))
    expect(askedPrivileges()).toEqual([KEY_A.toLowerCase()])
  })

  it('names a relayer-saved account by its creation key, the relayer dropped', async () => {
    const commit = commitAt(DEPLOYED_AT + 10)
    const { reads } = listedWorldOf({
      logs: [commit],
      senders: [[commit.transactionHash, RELAYER]],
      holders: [KEY_A, RELAYER],
      authorities: [KEY_A]
    })
    await expect(reads.removedKey()).resolves.toEqual(named(KEY_A))
  })
})

describe('the scans of a deployed listed account', () => {
  it("read the privilege writes from the account's first block with code, found by the search, and the manager's logs from its deployment block", async () => {
    const createdAt = DEPLOYED_AT - 3_000
    const { node, reads, scansOf } = listedWorldOf({
      createdAt,
      logs: [privilegeLog(KEY_C, HOLDS, createdAt)],
      holders: [KEY_C],
      authorities: [KEY_C]
    })
    await expect(reads.removedKey()).resolves.toEqual(named(KEY_C))
    expect(scansOf(ACCOUNT)).toEqual(chunksFrom(createdAt))
    expect(scansOf(MANAGER)).toEqual(chunksFrom(DEPLOYED_AT))
    const searched = node.provider.code.mock.calls.map(([, block]) => block)
    expect(searched[0]).toBe(HEAD)
    expect(searched).toContain(createdAt)
    expect(searched).toContain(createdAt - 1)
  })
})

describe('a listed account with no code', () => {
  it('takes its creation privileges as its keys, with no scan, no transaction read and no key read', async () => {
    const { node, reads } = listedWorldOf({
      code: '0x',
      logs: recoveredTo(NEW_KEY),
      holders: [NEW_KEY],
      authorities: [NEW_KEY]
    })
    await expect(reads.removedKey()).resolves.toEqual(named(KEY_A))
    expect(node.provider.logs).not.toHaveBeenCalled()
    expect(node.provider.transaction).not.toHaveBeenCalled()
    expect(node.calls).toEqual([])
    expect(node.provider.code.mock.calls.map(([, block]) => block)).toEqual([HEAD])
  })
})
