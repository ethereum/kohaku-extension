/**
 * The key a recovery would remove from a deployed account the wallet holds no
 * creation record for, read over a fake node at one pinned block. The
 * candidates come from the keys the wallet knows, the sender of the
 * account's latest setup commit at the action, the new key of its latest
 * consumed handover and the addresses its privilege writes name. The
 * manager's logs are read from its deployment block, the privilege writes
 * from the first block at which the account has code. The candidates of every source
 * are judged together, each asked about once with the account's `privileges`
 * view and then with the action's `isAuthority`, and every key that passes
 * both counts, whichever source named it.
 */
import { toFunctionSelector, zeroHash } from 'viem'

import type { Address, RawLog } from '@kohaku-eth/social-recovery'
import { eachIt } from '@web/modules/social-recovery/shared/chrome/__fixtures__/table'
import {
  ACCOUNT,
  ACCOUNT_CODE,
  ACTION,
  attemptConsumedLog,
  attemptStartedLog,
  DEPLOYED_AT,
  HEAD,
  KEY_A,
  KEY_B,
  MANAGER,
  OTHER_ACTION
} from '@web/modules/social-recovery/shared/client/__fixtures__/scripted-provider'
import { pastRetryPauses } from '@web/modules/social-recovery/shared/client/events/__fixtures__/retries'
import { providerReadFailure } from '@web/modules/social-recovery/shared/client/provider-adapter'
import {
  ACTION_HOLDER,
  chunksFrom,
  commitAt,
  CONTROLLER,
  ENTRY_POINT,
  handoverTo,
  HOLDS,
  KEY_C,
  named,
  NEW_KEY,
  PRIVILEGE_TOPIC,
  privilegeLog,
  RELAYER,
  same,
  STRANGER,
  worldOf
} from '@web/modules/social-recovery/shared/client/wallet-reads/__fixtures__/world'

describe("the sender of the account's latest setup commit", () => {
  it('is the removed key where no privilege write names it and the wallet knows none, once the action counts it', async () => {
    const commit = commitAt(DEPLOYED_AT + 10)
    const { node, reads, askedAuthority } = worldOf({
      logs: [commit],
      senders: [[commit.transactionHash, CONTROLLER]],
      holders: [CONTROLLER],
      authorities: [CONTROLLER]
    })
    await expect(reads.removedKey()).resolves.toEqual(named(CONTROLLER))
    expect(node.provider.transaction.mock.calls).toEqual([[commit.transactionHash]])
    expect(askedAuthority()).toEqual([[CONTROLLER, HEAD]])
  })

  it('is read from the latest commit at the action, never an earlier one or one at another action', async () => {
    const earlier = commitAt(DEPLOYED_AT + 10)
    const latest = commitAt(DEPLOYED_AT + 20)
    const elsewhere = commitAt(DEPLOYED_AT + 30, OTHER_ACTION)
    const { node, reads } = worldOf({
      logs: [earlier, latest, elsewhere],
      senders: [
        [earlier.transactionHash, KEY_A],
        [latest.transactionHash, CONTROLLER],
        [elsewhere.transactionHash, KEY_B]
      ],
      holders: [KEY_A, KEY_B, CONTROLLER],
      authorities: [KEY_A, KEY_B, CONTROLLER]
    })
    await expect(reads.removedKey()).resolves.toEqual(named(CONTROLLER))
    expect(node.provider.transaction.mock.calls).toEqual([[latest.transactionHash]])
  })

  eachIt<[string, Address | null]>([
    ['a relayer the action does not count', RELAYER],
    ['no sender, the node knowing no such transaction', null]
  ])('is dropped for %s, and the next source answers', async (_, sender) => {
    const commit = commitAt(DEPLOYED_AT + 10)
    const { reads } = worldOf({
      logs: [commit, privilegeLog(KEY_A, HOLDS, DEPLOYED_AT + 5)],
      senders: sender ? [[commit.transactionHash, sender]] : [],
      holders: [KEY_A, RELAYER],
      authorities: [KEY_A]
    })
    await expect(reads.removedKey()).resolves.toEqual(named(KEY_A))
  })

  it('leaves the key unnamed where a later privilege write gave a second key authority', async () => {
    const commit = commitAt(DEPLOYED_AT + 10)
    const { reads } = worldOf({
      logs: [commit, privilegeLog(KEY_C, HOLDS, DEPLOYED_AT + 20)],
      senders: [[commit.transactionHash, CONTROLLER]],
      holders: [CONTROLLER, KEY_C],
      authorities: [CONTROLLER, KEY_C]
    })
    await expect(reads.removedKey()).resolves.toEqual({
      kind: 'unavailable',
      cause: 'several-key-entries'
    })
  })

  it('rejects where the transaction read fails, never answering a refusal', async () => {
    const commit = commitAt(DEPLOYED_AT + 10)
    const failure = providerReadFailure('transaction', new Error('timeout'))
    const { reads } = worldOf({
      logs: [commit, privilegeLog(KEY_A, HOLDS, DEPLOYED_AT + 5)],
      senders: [[commit.transactionHash, failure]],
      holders: [KEY_A],
      authorities: [KEY_A]
    })
    await expect(reads.removedKey()).rejects.toBe(failure)
  })
})

describe("the new key of the account's latest consumed handover", () => {
  it('is the removed key where the setup commit names none, never an earlier consumed or a later unconsumed one', async () => {
    const commit = commitAt(DEPLOYED_AT + 1)
    const { reads } = worldOf({
      logs: [
        commit,
        attemptStartedLog(5n, handoverTo(KEY_B), DEPLOYED_AT + 10),
        attemptConsumedLog(5n, DEPLOYED_AT + 20),
        attemptStartedLog(7n, handoverTo(NEW_KEY), DEPLOYED_AT + 30),
        attemptConsumedLog(7n, DEPLOYED_AT + 40),
        attemptStartedLog(8n, handoverTo(KEY_C), DEPLOYED_AT + 50)
      ],
      senders: [[commit.transactionHash, RELAYER]],
      holders: [KEY_B, KEY_C, NEW_KEY],
      authorities: [KEY_B, KEY_C, NEW_KEY]
    })
    await expect(reads.removedKey()).resolves.toEqual(named(NEW_KEY))
  })

  it('is dropped where its payload does not decode, and the privilege writes answer', async () => {
    const { reads } = worldOf({
      logs: [
        attemptStartedLog(7n, '0x1234', DEPLOYED_AT + 10),
        attemptConsumedLog(7n, DEPLOYED_AT + 20),
        privilegeLog(KEY_A, HOLDS, DEPLOYED_AT + 30)
      ],
      holders: [KEY_A],
      authorities: [KEY_A]
    })
    await expect(reads.removedKey()).resolves.toEqual(named(KEY_A))
  })

  it('is no candidate where the consumed attempt started before the scanned range', async () => {
    const { reads, askedPrivileges } = worldOf({
      logs: [
        attemptStartedLog(7n, handoverTo(NEW_KEY), DEPLOYED_AT - 5),
        attemptStartedLog(6n, handoverTo(KEY_B), DEPLOYED_AT + 10),
        attemptConsumedLog(7n, DEPLOYED_AT + 20)
      ],
      holders: [KEY_B, NEW_KEY],
      authorities: [KEY_B, NEW_KEY]
    })
    await expect(reads.removedKey()).resolves.toEqual({
      kind: 'unavailable',
      cause: 'no-source'
    })
    expect(askedPrivileges()).toEqual([])
  })
})

describe('the logs a node answers beyond the filter', () => {
  /** Answers the manager's and the account's one-chunk scans with the same logs, whichever comes first. */
  const answerBothScans = (world: ReturnType<typeof worldOf>, logs: RawLog[]) => {
    world.node.provider.logs.mockResolvedValueOnce(logs).mockResolvedValueOnce(logs)
  }

  it('leave out a privilege write another address emitted', async () => {
    const world = worldOf({ holders: [KEY_A, KEY_B], authorities: [KEY_A, KEY_B] })
    answerBothScans(world, [
      { ...privilegeLog(KEY_B, HOLDS, DEPLOYED_AT + 5), address: STRANGER },
      privilegeLog(KEY_A, HOLDS, DEPLOYED_AT + 10)
    ])
    await expect(world.reads.removedKey()).resolves.toEqual(named(KEY_A))
    expect(world.askedPrivileges()).toEqual([KEY_A])
  })

  it('leave out a manager log another address emitted, and a commit at another action', async () => {
    const commit = commitAt(DEPLOYED_AT + 10)
    const foreign = { ...commitAt(DEPLOYED_AT + 20), address: STRANGER }
    const elsewhere = commitAt(DEPLOYED_AT + 30, OTHER_ACTION)
    const world = worldOf({
      senders: [
        [commit.transactionHash, KEY_A],
        [foreign.transactionHash, KEY_B],
        [elsewhere.transactionHash, KEY_C]
      ],
      holders: [KEY_A, KEY_B, KEY_C, NEW_KEY],
      authorities: [KEY_A, KEY_B, KEY_C, NEW_KEY]
    })
    answerBothScans(world, [
      commit,
      foreign,
      elsewhere,
      { ...attemptStartedLog(9n, handoverTo(NEW_KEY), DEPLOYED_AT + 40), address: STRANGER },
      { ...attemptConsumedLog(9n, DEPLOYED_AT + 50), address: STRANGER }
    ])
    await expect(world.reads.removedKey()).resolves.toEqual(named(KEY_A))
    expect(world.node.provider.transaction.mock.calls).toEqual([[commit.transactionHash]])
    expect(world.askedPrivileges()).toEqual([KEY_A])
  })
})

describe('the keys the wallet knows', () => {
  it('rank no higher than the setup commit: a wallet key and another commit sender, both signers, leave the key unnamed', async () => {
    const commit = commitAt(DEPLOYED_AT + 10)
    const { reads, askedPrivileges } = worldOf({
      knownKeys: [KEY_A],
      logs: [commit],
      senders: [[commit.transactionHash, KEY_B]],
      holders: [KEY_A, KEY_B],
      authorities: [KEY_A, KEY_B]
    })
    await expect(reads.removedKey()).resolves.toEqual({
      kind: 'unavailable',
      cause: 'several-key-entries'
    })
    expect(askedPrivileges()).toEqual([KEY_A, KEY_B])
  })

  it('name a wallet key where the commit sender is no signer', async () => {
    const commit = commitAt(DEPLOYED_AT + 10)
    const { reads } = worldOf({
      knownKeys: [KEY_A],
      logs: [commit],
      senders: [[commit.transactionHash, RELAYER]],
      holders: [KEY_A, RELAYER],
      authorities: [KEY_A]
    })
    await expect(reads.removedKey()).resolves.toEqual(named(KEY_A))
  })

  it('leave the key unnamed where two of them are signers', async () => {
    const { reads } = worldOf({
      knownKeys: [KEY_A],
      associatedKeys: [KEY_B],
      holders: [KEY_A, KEY_B],
      authorities: [KEY_A, KEY_B]
    })
    await expect(reads.removedKey()).resolves.toEqual({
      kind: 'unavailable',
      cause: 'several-key-entries'
    })
  })
})

describe('the candidates of every source', () => {
  it('ask once about a key several sources name', async () => {
    const commit = commitAt(DEPLOYED_AT + 10)
    const { reads, askedPrivileges, askedAuthority } = worldOf({
      knownKeys: [KEY_A],
      logs: [commit, privilegeLog(KEY_A, HOLDS, DEPLOYED_AT + 20)],
      senders: [[commit.transactionHash, KEY_A]],
      holders: [KEY_A],
      authorities: [KEY_A]
    })
    await expect(reads.removedKey()).resolves.toEqual(named(KEY_A))
    expect(askedPrivileges()).toEqual([KEY_A])
    expect(askedAuthority()).toEqual([[KEY_A, HEAD]])
  })

  it('leave the key unnamed, with no key read, where no source names one', async () => {
    const { reads, askedPrivileges } = worldOf({ holders: [KEY_A], authorities: [KEY_A] })
    await expect(reads.removedKey()).resolves.toEqual({
      kind: 'unavailable',
      cause: 'no-source'
    })
    expect(askedPrivileges()).toEqual([])
  })
})

describe('the scans of an account with no creation record', () => {
  it("read the privilege writes from the account's first block with code, the manager's logs from its deployment block", async () => {
    const deployedAt = HEAD - 25_000
    const createdAt = deployedAt - 10_000
    const { reads, scans, scansOf } = worldOf({
      deployedAt,
      createdAt,
      logs: [privilegeLog(KEY_B, HOLDS, deployedAt - 1), privilegeLog(KEY_A, HOLDS, deployedAt)],
      holders: [KEY_A, KEY_B],
      authorities: [KEY_A, KEY_B]
    })
    await expect(reads.removedKey()).resolves.toEqual({
      kind: 'unavailable',
      cause: 'several-key-entries'
    })
    expect(
      scans()
        .filter(({ filter }) => same(filter.address[0], ACCOUNT))
        .map(({ filter, range }) => [filter, range])
    ).toEqual(
      chunksFrom(createdAt).map((range) => [
        { address: [ACCOUNT], topics: [[PRIVILEGE_TOPIC]] },
        range
      ])
    )
    expect(scansOf(MANAGER)).toEqual(chunksFrom(deployedAt))
    expect(scans()).toHaveLength(chunksFrom(createdAt).length + chunksFrom(deployedAt).length)
  })

  it('name a key written before the manager existed, where it is the one signer', async () => {
    const createdAt = DEPLOYED_AT - 3_000
    const { reads, scansOf } = worldOf({
      createdAt,
      logs: [privilegeLog(KEY_B, HOLDS, createdAt)],
      holders: [KEY_B],
      authorities: [KEY_B]
    })
    await expect(reads.removedKey()).resolves.toEqual(named(KEY_B))
    expect(Math.min(...scansOf(ACCOUNT).map(({ from }) => from))).toBe(createdAt)
  })

  it('find the first block with code by the search, and never ask for logs below it', async () => {
    const createdAt = DEPLOYED_AT - 123_457
    const { node, reads, scansOf } = worldOf({
      createdAt,
      logs: [privilegeLog(KEY_A, HOLDS, createdAt - 1), privilegeLog(KEY_B, HOLDS, createdAt + 1)],
      holders: [KEY_A, KEY_B],
      authorities: [KEY_A, KEY_B]
    })
    await expect(reads.removedKey()).resolves.toEqual(named(KEY_B))
    expect(scansOf(ACCOUNT)[0].from).toBe(createdAt)
    expect(Math.min(...scansOf(ACCOUNT).map(({ from }) => from))).toBe(createdAt)
    const searched = node.provider.code.mock.calls.map(([, block]) => block)
    expect(searched).toContain(createdAt)
    expect(searched).toContain(createdAt - 1)
  })

  it("read the privilege writes from the account's creation where the account came after the manager", async () => {
    const createdAt = DEPLOYED_AT + 50
    const { reads, scansOf } = worldOf({
      createdAt,
      logs: [privilegeLog(KEY_A, HOLDS, createdAt)],
      holders: [KEY_A],
      authorities: [KEY_A]
    })
    await expect(reads.removedKey()).resolves.toEqual(named(KEY_A))
    expect(scansOf(ACCOUNT)).toEqual(chunksFrom(createdAt))
    expect(scansOf(MANAGER)).toEqual(chunksFrom(DEPLOYED_AT))
  })

  eachIt<[string, number]>([
    ['the first block', 0],
    ['the second block', 1],
    ['a block long before the manager', DEPLOYED_AT - 123_457],
    ["the manager's deployment block", DEPLOYED_AT],
    ['the block before the pinned head', HEAD - 1],
    ['the pinned head', HEAD]
  ])(
    'search for an account created at %s with at most one code read per halving of the blocks up to the pinned head',
    async (_, createdAt) => {
      const { node, reads, scansOf } = worldOf({ createdAt })
      await expect(reads.removedKey()).resolves.toEqual({
        kind: 'unavailable',
        cause: 'no-source'
      })
      const blocks = node.provider.code.mock.calls.map(([, block]) => block)
      expect(blocks[0]).toBe(HEAD)
      expect(blocks.length - 1).toBeLessThanOrEqual(Math.floor(Math.log2(HEAD)) + 1)
      expect(scansOf(ACCOUNT)[0].from).toBe(createdAt)
    }
  )

  it('pin every read at the block of the configured read tag', async () => {
    const commit = commitAt(DEPLOYED_AT + 10)
    const { node, reads, scans } = worldOf({
      logs: [commit],
      senders: [[commit.transactionHash, KEY_A]],
      holders: [KEY_A],
      authorities: [KEY_A],
      blockTags: { read: 'finalized', watch: 'finalized' }
    })
    await expect(reads.removedKey()).resolves.toEqual(named(KEY_A))
    expect(node.provider.block.mock.calls).toEqual([['finalized']])
    const codeBlocks = node.provider.code.mock.calls.map(([, block]) => block)
    expect(codeBlocks[0]).toBe(HEAD)
    expect(codeBlocks.every((block) => typeof block === 'number' && block <= HEAD)).toBe(true)
    expect(new Set(scans().map(({ range }) => range.to))).toEqual(new Set([HEAD]))
    expect(new Set(node.calls.map(({ block }) => block))).toEqual(new Set([HEAD]))
  })
})

describe("the account's privilege writes", () => {
  it('name the one signer', async () => {
    const { reads } = worldOf({
      logs: [privilegeLog(KEY_A, HOLDS, DEPLOYED_AT + 10)],
      holders: [KEY_A],
      authorities: [KEY_A]
    })
    await expect(reads.removedKey()).resolves.toEqual(named(KEY_A))
  })

  it('exclude a key whose privilege dropped to zero, without asking the action about it', async () => {
    const { reads, askedAuthority } = worldOf({
      logs: [
        privilegeLog(KEY_A, HOLDS, DEPLOYED_AT + 10),
        privilegeLog(KEY_B, HOLDS, DEPLOYED_AT + 11),
        privilegeLog(KEY_B, zeroHash, DEPLOYED_AT + 12)
      ],
      holders: [KEY_A],
      authorities: [KEY_A, KEY_B]
    })
    await expect(reads.removedKey()).resolves.toEqual(named(KEY_A))
    expect(askedAuthority()).toEqual([[KEY_A, HEAD]])
  })

  it('exclude a holder the action does not count as a signer', async () => {
    const { reads } = worldOf({
      logs: [
        privilegeLog(KEY_A, HOLDS, DEPLOYED_AT + 10),
        privilegeLog(ACTION_HOLDER, HOLDS, DEPLOYED_AT + 11)
      ],
      holders: [KEY_A, ACTION_HOLDER],
      authorities: [KEY_A]
    })
    await expect(reads.removedKey()).resolves.toEqual(named(KEY_A))
  })

  it('drop a log a reorg removed and never ask about the entry point', async () => {
    const { reads, askedPrivileges } = worldOf({
      logs: [
        privilegeLog(ENTRY_POINT, HOLDS, DEPLOYED_AT + 10),
        privilegeLog(KEY_A, HOLDS, DEPLOYED_AT + 11),
        privilegeLog(KEY_C, HOLDS, DEPLOYED_AT + 12, true)
      ],
      holders: [KEY_A, KEY_C, ENTRY_POINT],
      authorities: [KEY_A, KEY_C, ENTRY_POINT]
    })
    await expect(reads.removedKey()).resolves.toEqual(named(KEY_A))
    expect(askedPrivileges()).toEqual([KEY_A])
  })

  it('leave the key unnamed where two signers remain', async () => {
    const { reads } = worldOf({
      logs: [
        privilegeLog(KEY_A, HOLDS, DEPLOYED_AT + 10),
        privilegeLog(KEY_B, HOLDS, DEPLOYED_AT + 20)
      ],
      holders: [KEY_A, KEY_B],
      authorities: [KEY_A, KEY_B]
    })
    await expect(reads.removedKey()).resolves.toEqual({
      kind: 'unavailable',
      cause: 'several-key-entries'
    })
  })
})

describe('an account with no creation record and no code', () => {
  it('is unavailable for want of a creation record, with no scan, no transaction read and no key read', async () => {
    const commit = commitAt(DEPLOYED_AT + 10)
    const { node, reads } = worldOf({
      code: '0x',
      logs: [commit, privilegeLog(KEY_A, HOLDS, DEPLOYED_AT + 20)],
      senders: [[commit.transactionHash, KEY_A]],
      holders: [KEY_A],
      authorities: [KEY_A]
    })
    await expect(reads.removedKey()).resolves.toEqual({
      kind: 'unavailable',
      cause: 'no-source'
    })
    expect(node.provider.logs).not.toHaveBeenCalled()
    expect(node.provider.transaction).not.toHaveBeenCalled()
    expect(node.calls).toEqual([])
  })
})

describe('a node that refuses code reads at past blocks for its pruned history', () => {
  const PRUNED = { code: 4444, message: 'pruned history unavailable' }
  const refusals: [string, Error][] = [
    [
      'the node error ethers keeps',
      providerReadFailure(
        'code',
        Object.assign(new Error('could not coalesce error'), { error: PRUNED })
      )
    ],
    ['the node error itself', providerReadFailure('code', PRUNED)],
    ['a plain error naming the pruned history', new Error('pruned history unavailable')],
    [
      "a geth node's missing trie node",
      providerReadFailure('code', new Error('missing trie node 5a3c9e1f (path ) <nil>'))
    ]
  ]

  const prunedWorld = (
    refusal: Error,
    refuseHead = false,
    logs = [privilegeLog(KEY_A, HOLDS, DEPLOYED_AT + 10)]
  ) => {
    const world = worldOf({
      createdAt: DEPLOYED_AT - 3_000,
      logs,
      holders: [KEY_A],
      authorities: [KEY_A]
    })
    const answer = world.node.provider.code.getMockImplementation()
    world.node.provider.code.mockImplementation(async (address, block) => {
      if (refuseHead || (typeof block === 'number' && block < HEAD)) {
        throw refusal
      }
      return answer!(address, block)
    })
    return world
  }

  refusals.forEach(([name, refusal]) => {
    it(`reads the privilege writes from the manager's deployment block and names the bound, where ${name} refuses`, async () => {
      const { reads, scansOf } = prunedWorld(refusal)
      await expect(reads.removedKey()).resolves.toEqual({
        ...named(KEY_A),
        privilegeScanBoundedAt: DEPLOYED_AT
      })
      expect(scansOf(ACCOUNT)).toEqual(chunksFrom(DEPLOYED_AT))
      expect(scansOf(MANAGER)).toEqual(chunksFrom(DEPLOYED_AT))
    })
  })

  it('rejects where the node refuses the code read at the pinned block too', async () => {
    const [[, refusal]] = refusals
    const { reads, scans } = prunedWorld(refusal, true)
    await expect(reads.removedKey()).rejects.toBe(refusal)
    expect(scans()).toEqual([])
  })

  it("rejects with the node's refusal, never answering, where the bounded scan finds no key", async () => {
    const [[, refusal]] = refusals
    const { reads, scansOf } = prunedWorld(refusal, false, [
      privilegeLog(KEY_A, HOLDS, DEPLOYED_AT - 100)
    ])
    await expect(reads.removedKey()).rejects.toBe(refusal)
    expect(scansOf(ACCOUNT)).toEqual(chunksFrom(DEPLOYED_AT))
  })

  it("rejects with the node's refusal, never answering, where the bounded scan finds no candidate", async () => {
    const [[, refusal]] = refusals
    const { reads, scansOf } = prunedWorld(refusal, false, [])
    await expect(reads.removedKey()).rejects.toBe(refusal)
    expect(scansOf(ACCOUNT)).toEqual(chunksFrom(DEPLOYED_AT))
  })

  it('rejects with no scan where a past-block failure says pruned in another sense', async () => {
    const failure = providerReadFailure('code', new Error('request pruned by the gateway queue'))
    const { reads, scans } = prunedWorld(failure)
    await expect(reads.removedKey()).rejects.toBe(failure)
    expect(scans()).toEqual([])
  })

  it('names no bound where the node answers every past block', async () => {
    const createdAt = DEPLOYED_AT - 3_000
    const { reads, scansOf } = worldOf({
      createdAt,
      logs: [privilegeLog(KEY_A, HOLDS, DEPLOYED_AT + 10)],
      holders: [KEY_A],
      authorities: [KEY_A]
    })
    const reading = await reads.removedKey()
    expect(reading).toEqual(named(KEY_A))
    expect(reading).not.toHaveProperty('privilegeScanBoundedAt')
    expect(scansOf(ACCOUNT)).toEqual(chunksFrom(createdAt))
  })
})

describe('a failed read of an account with no creation record', () => {
  const failure = providerReadFailure('call', new Error('timeout'))
  eachIt<[string, (world: ReturnType<typeof worldOf>) => void]>([
    ['the pinned block', ({ node }) => node.provider.block.mockRejectedValueOnce(failure)],
    ['the code', ({ node }) => node.provider.code.mockRejectedValueOnce(failure)],
    [
      'the code at a past block',
      ({ node }) =>
        node.provider.code.mockResolvedValueOnce(ACCOUNT_CODE).mockRejectedValueOnce(failure)
    ],
    ['a log chunk, on every try,', ({ node }) => node.provider.logs.mockRejectedValue(failure)],
    [
      'a privileges view',
      ({ node }) =>
        node.answerWith(ACCOUNT, toFunctionSelector('privileges(address)'), () => failure)
    ],
    [
      'an authority',
      ({ node }) =>
        node.answerWith(ACTION, toFunctionSelector('isAuthority(address,address)'), () => failure)
    ]
  ])('rejects where %s read fails, never answering a refusal', async (_, fail) => {
    const world = worldOf({
      logs: [privilegeLog(KEY_A, HOLDS, DEPLOYED_AT + 10)],
      holders: [KEY_A],
      authorities: [KEY_A]
    })
    fail(world)
    jest.useFakeTimers()
    await expect(pastRetryPauses(world.reads.removedKey())).rejects.toBe(failure)
  })

  afterEach(() => {
    jest.useRealTimers()
  })
})
