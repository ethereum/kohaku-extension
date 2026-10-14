/**
 * The submission in flight on the live recovery session: the claim one device
 * writes before it sends the submission, the hash it adds once the wallet
 * broadcast it, and its release. A reload or another tab that finds the claim
 * follows it and sends nothing; a new gathering, every wipe and the landing
 * drop it with the gathering.
 *
 * The records run against the rich JSON storage double, whose `calls` list
 * every storage write, so a test sees each write an accessor call makes.
 */
import type {
  Address,
  ApproverReply,
  Gathering,
  Hex
} from '@web/modules/social-recovery/sdk-interfaces'
import {
  createWalletRecords,
  DirectWipeEvent,
  ExpectedRevision,
  recordKeys,
  revisionOf,
  SessionRead,
  SessionRevisionConflict,
  SubmissionInFlightClaim,
  WalletRecords
} from '@web/modules/social-recovery/shared/records'
import { makeStorage } from '@web/modules/social-recovery/shared/records/__fixtures__/storage'
import type { RichJsonStorageDouble } from '@web/modules/social-recovery/shared/records/__fixtures__/types'

const ACCOUNT: Address = '0x1111111111111111111111111111111111111111'
const METHOD: Address = '0x3333333333333333333333333333333333333333'
const MANAGER: Address = '0x4444444444444444444444444444444444444444'
const ACTION: Address = '0x5555555555555555555555555555555555555555'
const CHAIN_ID = 11155111n
const T0 = 1_700_000_000_000
const SESSION_KEY = recordKeys.recoverySession(CHAIN_ID, ACCOUNT)

const HASH_A: Hex = `0x${'aa'.repeat(32)}`
const HASH_B: Hex = `0x${'bb'.repeat(32)}`

const CLAIM: SubmissionInFlightClaim = {
  requestId: 'social-recovery-submit:first',
  startBlock: 7_000_000,
  claimedAt: T0
}
const OTHER_CLAIM: SubmissionInFlightClaim = {
  requestId: 'social-recovery-submit:second',
  startBlock: 7_000_005,
  claimedAt: T0 + 1000
}

const reply = (place: number): ApproverReply => ({
  kind: 'recovery-proof-reply',
  version: 1,
  chainId: CHAIN_ID.toString(),
  manager: MANAGER,
  account: ACCOUNT,
  action: ACTION,
  attemptId: '7',
  purpose: 'approval',
  place,
  method: METHOD,
  config: '0xabcd',
  salt: '0x01',
  digest: '0x0badc0de',
  proof: place === 0 ? '0xdeadbeefdeadbeef' : '0xfeedfacefeedface'
})

const gathering = (replies: ApproverReply[]): Gathering => ({
  kind: 'gathering',
  version: 1,
  purpose: 'approval',
  request: {
    chainId: CHAIN_ID.toString(),
    manager: MANAGER,
    digestVersion: '1',
    account: ACCOUNT,
    action: ACTION,
    attemptId: '7',
    setupNonce: '3',
    setupBody: '0x00',
    validUntil: '1700086400',
    block: { number: 1, timestamp: '1700000000', hash: '0x01' }
  },
  places: [0, 1].map((place) => ({
    place,
    method: METHOD,
    config: '0xabcd',
    salt: '0x01',
    standing: 'not-stopped',
    stoppable: false
  })),
  replies
})

const ONE_REPLY = gathering([reply(0)])
const TWO_REPLIES = gathering([reply(0), reply(1)])

const DIRECT_EVENTS: DirectWipeEvent[] = [
  'deadline-passed',
  'another-attempt-opened',
  'setup-changed',
  'recoverer-abandoned'
]

const setup = () => {
  const storage = makeStorage()
  const records = createWalletRecords({ storage, now: () => T0 })
  return { storage, records }
}

const session = (records: WalletRecords) => records.recoverySession(CHAIN_ID, ACCOUNT)

const fresh = async (records: WalletRecords): Promise<ExpectedRevision> =>
  revisionOf(await session(records).read())

const writeGathering = async (records: WalletRecords, value: Gathering) =>
  session(records).write(value, await fresh(records))

const claim = async (records: WalletRecords, value: SubmissionInFlightClaim = CLAIM) =>
  session(records).claimSubmission(value, await fresh(records))

const setHash = async (records: WalletRecords, requestId: string, hash: Hex) =>
  session(records).setSubmissionHash(requestId, hash, await fresh(records))

const release = async (records: WalletRecords, requestId: string) =>
  session(records).releaseSubmission(requestId, await fresh(records))

const wipe = async (records: WalletRecords, event: DirectWipeEvent) =>
  records.wipeRecoverySession(CHAIN_ID, ACCOUNT, event, await fresh(records))

const land = async (records: WalletRecords) =>
  records.landSubmission(CHAIN_ID, ACCOUNT, await fresh(records))

const liveOf = (read: SessionRead) => {
  if (read.status !== 'present' || read.value.state !== 'live') {
    throw new Error('expected a live session')
  }
  return read.value
}

const submissionOf = async (records: WalletRecords) =>
  liveOf(await session(records).read()).submission

const storedSession = (storage: RichJsonStorageDouble) => storage.raw.get(SESSION_KEY) ?? ''

const writesOf = (storage: RichJsonStorageDouble) => [
  ...storage.calls.set,
  ...storage.calls.remove,
  ...storage.calls.setEntries.flat(),
  ...storage.calls.removeKeys.flat()
]

// The storage writes made after this call, and whether the stored session is
// still the string it was.
const watchWrites = (storage: RichJsonStorageDouble) => {
  const earlier = writesOf(storage).length
  const before = storedSession(storage)
  return () => ({
    writes: writesOf(storage).slice(earlier),
    unchanged: storedSession(storage) === before
  })
}

const liveWithClaim = async () => {
  const { storage, records } = setup()
  await writeGathering(records, ONE_REPLY)
  await claim(records)
  return { storage, records }
}

describe('the claim of a submission in flight', () => {
  it('a claim on a live session is read back by a new set of records on the same storage', async () => {
    const { storage, records } = setup()
    await writeGathering(records, ONE_REPLY)
    const result = await claim(records)
    expect(result.claimed).toBe(true)
    expect(result.submission).toEqual(CLAIM)
    const reopened = createWalletRecords({ storage, now: () => T0 })
    const read = await session(reopened).read()
    expect(liveOf(read)).toEqual({ state: 'live', gathering: ONE_REPLY, submission: CLAIM })
    expect(revisionOf(read)).toBe(result.record.revision)
  })

  it('a second claim that names the revision the first claim read conflicts and writes nothing', async () => {
    const { storage, records } = setup()
    await writeGathering(records, ONE_REPLY)
    const read = await fresh(records)
    await session(records).claimSubmission(CLAIM, read)
    const other = createWalletRecords({ storage, now: () => T0 })
    const watch = watchWrites(storage)
    await expect(session(other).claimSubmission(OTHER_CLAIM, read)).rejects.toBeInstanceOf(
      SessionRevisionConflict
    )
    expect(watch()).toEqual({ writes: [], unchanged: true })
    expect(await submissionOf(records)).toEqual(CLAIM)
  })

  it('a second claim after a fresh read follows the first claim and writes nothing', async () => {
    const { storage, records } = await liveWithClaim()
    await setHash(records, CLAIM.requestId, HASH_A)
    const stored = await session(records).read()
    const other = createWalletRecords({ storage, now: () => T0 })
    const watch = watchWrites(storage)
    const result = await claim(other, OTHER_CLAIM)
    expect(result.claimed).toBe(false)
    expect(result.submission).toEqual({ ...CLAIM, transactionHash: HASH_A })
    expect(result.record.revision).toBe(revisionOf(stored))
    expect(watch()).toEqual({ writes: [], unchanged: true })
  })

  it('two claims from one read at once: one claims, the other conflicts', async () => {
    const { storage, records } = setup()
    await writeGathering(records, ONE_REPLY)
    const read = await fresh(records)
    const other = createWalletRecords({ storage, now: () => T0 })
    const outcomes = await Promise.allSettled([
      session(records).claimSubmission(CLAIM, read),
      session(other).claimSubmission(OTHER_CLAIM, read)
    ])
    expect(outcomes[0]).toMatchObject({ status: 'fulfilled', value: { claimed: true } })
    expect(outcomes[1]).toMatchObject({
      status: 'rejected',
      reason: expect.any(SessionRevisionConflict)
    })
    expect(await submissionOf(other)).toEqual(CLAIM)
  })
})

describe('the transaction hash of the submission in flight', () => {
  it('a hash set under the claim request id is read back after a reload', async () => {
    const { storage, records } = await liveWithClaim()
    const written = await setHash(records, CLAIM.requestId, HASH_A)
    const reopened = createWalletRecords({ storage, now: () => T0 })
    const read = await session(reopened).read()
    expect(liveOf(read).submission).toEqual({ ...CLAIM, transactionHash: HASH_A })
    expect(revisionOf(read)).toBe(written.revision)
  })

  it('a hash under another request id is refused and writes nothing', async () => {
    const { storage, records } = await liveWithClaim()
    const watch = watchWrites(storage)
    await expect(setHash(records, OTHER_CLAIM.requestId, HASH_A)).rejects.toThrow(
      /No submission in flight under request/
    )
    expect(watch()).toEqual({ writes: [], unchanged: true })
    expect(await submissionOf(records)).toEqual(CLAIM)
  })

  it('a hash with no claim on the live session is refused and writes nothing', async () => {
    const { storage, records } = setup()
    await writeGathering(records, ONE_REPLY)
    const watch = watchWrites(storage)
    await expect(setHash(records, CLAIM.requestId, HASH_A)).rejects.toThrow(
      /No submission in flight under request/
    )
    expect(watch()).toEqual({ writes: [], unchanged: true })
  })

  it('a second, different hash replaces the first, and the same hash again writes nothing', async () => {
    const { storage, records } = await liveWithClaim()
    await setHash(records, CLAIM.requestId, HASH_A)
    await setHash(records, CLAIM.requestId, HASH_B)
    expect(await submissionOf(records)).toEqual({ ...CLAIM, transactionHash: HASH_B })
    const stored = await session(records).read()
    const watch = watchWrites(storage)
    const again = await setHash(records, CLAIM.requestId, HASH_B)
    expect(again.revision).toBe(revisionOf(stored))
    expect(watch()).toEqual({ writes: [], unchanged: true })
  })

  it('a hash that names a stale revision conflicts and writes nothing', async () => {
    const { storage, records } = setup()
    await writeGathering(records, ONE_REPLY)
    const read = await fresh(records)
    await session(records).claimSubmission(CLAIM, read)
    const watch = watchWrites(storage)
    await expect(
      session(records).setSubmissionHash(CLAIM.requestId, HASH_A, read)
    ).rejects.toBeInstanceOf(SessionRevisionConflict)
    expect(watch()).toEqual({ writes: [], unchanged: true })
  })
})

describe('the release of the submission in flight', () => {
  it('a release under the claim request id removes the member and answers the new read', async () => {
    const { storage, records } = await liveWithClaim()
    await setHash(records, CLAIM.requestId, HASH_A)
    const released = await release(records, CLAIM.requestId)
    const read = await session(records).read()
    expect(released).toEqual(read)
    expect(liveOf(read)).toEqual({ state: 'live', gathering: ONE_REPLY })
    expect(storedSession(storage)).not.toMatch(/submission|requestId|transactionHash/)
    // The released session takes a new claim.
    expect((await claim(records, OTHER_CLAIM)).claimed).toBe(true)
  })

  it('a release with no claim, or under another request id, writes nothing and never conflicts', async () => {
    const none = setup()
    await writeGathering(none.records, ONE_REPLY)
    const noneRead = await session(none.records).read()
    const noneWatch = watchWrites(none.storage)
    expect(await session(none.records).releaseSubmission(CLAIM.requestId, 'stale')).toEqual(
      noneRead
    )
    expect(noneWatch()).toEqual({ writes: [], unchanged: true })

    const other = await liveWithClaim()
    const otherRead = await session(other.records).read()
    const otherWatch = watchWrites(other.storage)
    expect(await session(other.records).releaseSubmission(OTHER_CLAIM.requestId, null)).toEqual(
      otherRead
    )
    expect(otherWatch()).toEqual({ writes: [], unchanged: true })
    expect(await submissionOf(other.records)).toEqual(CLAIM)
  })

  it('a release under the claim request id that names a stale revision conflicts and writes nothing', async () => {
    const { storage, records } = setup()
    await writeGathering(records, ONE_REPLY)
    const read = await fresh(records)
    await session(records).claimSubmission(CLAIM, read)
    const watch = watchWrites(storage)
    await expect(session(records).releaseSubmission(CLAIM.requestId, read)).rejects.toBeInstanceOf(
      SessionRevisionConflict
    )
    expect(watch()).toEqual({ writes: [], unchanged: true })
    expect(await submissionOf(records)).toEqual(CLAIM)
  })
})

describe('the submission in flight lives and dies with its gathering', () => {
  it('a write of the same request with one more reply keeps the claim', async () => {
    const { records } = await liveWithClaim()
    await writeGathering(records, TWO_REPLIES)
    expect(liveOf(await session(records).read())).toEqual({
      state: 'live',
      gathering: TWO_REPLIES,
      submission: CLAIM
    })
  })

  it('a row note keeps the claim', async () => {
    const { records } = setup()
    await writeGathering(records, ONE_REPLY)
    await claim(records)
    await session(records).setNote(1, 'declined', await fresh(records))
    expect(liveOf(await session(records).read())).toEqual({
      state: 'live',
      gathering: ONE_REPLY,
      notes: { 1: 'declined' },
      submission: CLAIM
    })
  })

  DIRECT_EVENTS.forEach((event) =>
    it(`the ${event} wipe leaves no claim in the stored session, and a new gathering after it starts with none`, async () => {
      const { storage, records } = await liveWithClaim()
      await setHash(records, CLAIM.requestId, HASH_A)
      await wipe(records, event)
      expect(storedSession(storage)).not.toMatch(/submission|requestId|transactionHash/)
      await writeGathering(records, ONE_REPLY)
      expect(liveOf(await session(records).read())).toEqual({
        state: 'live',
        gathering: ONE_REPLY
      })
      expect(storedSession(storage)).not.toMatch(/submission|requestId|transactionHash/)
    })
  )

  it('the landing leaves no claim in the stored session', async () => {
    const { storage, records } = await liveWithClaim()
    await setHash(records, CLAIM.requestId, HASH_A)
    await land(records)
    expect(await session(records).read()).toMatchObject({
      status: 'present',
      value: { state: 'landed', account: ACCOUNT }
    })
    expect(storedSession(storage)).not.toMatch(/submission|requestId|transactionHash/)
  })

  it('a new gathering over a cleared session starts with no claim', async () => {
    const { storage, records } = await liveWithClaim()
    await wipe(records, 'deadline-passed')
    await records.clearWipedSession(CHAIN_ID, ACCOUNT, await fresh(records))
    expect(await session(records).read()).toEqual({ status: 'absent' })
    await writeGathering(records, ONE_REPLY)
    expect(liveOf(await session(records).read())).toEqual({ state: 'live', gathering: ONE_REPLY })
    expect(storedSession(storage)).not.toMatch(/submission|requestId/)
  })
})

describe('a session that is not live takes no submission in flight', () => {
  const states: [string, (records: WalletRecords) => Promise<unknown>][] = [
    ['an absent', async () => undefined],
    [
      'a wiped',
      async (records) => {
        await writeGathering(records, ONE_REPLY)
        await claim(records)
        await wipe(records, 'setup-changed')
      }
    ],
    [
      'a landed',
      async (records) => {
        await writeGathering(records, ONE_REPLY)
        await claim(records)
        await land(records)
      }
    ]
  ]

  states.forEach(([state, prepare]) =>
    it(`on ${state} session a claim and a hash are refused, a release answers the read, and none writes`, async () => {
      const { storage, records } = setup()
      await prepare(records)
      const read = await session(records).read()
      const watch = watchWrites(storage)
      await expect(claim(records)).rejects.toThrow(/No live recovery session/)
      await expect(setHash(records, CLAIM.requestId, HASH_A)).rejects.toThrow(
        /No live recovery session/
      )
      expect(await release(records, CLAIM.requestId)).toEqual(read)
      expect(watch()).toEqual({ writes: [], unchanged: true })
      expect(await session(records).read()).toEqual(read)
    })
  )
})

describe('a damaged stored submission in flight', () => {
  const damaged: [string, unknown][] = [
    ['null', null],
    ['a string', 'social-recovery-submit:first'],
    ['an empty request id', { ...CLAIM, requestId: '' }],
    ['no request id', { startBlock: CLAIM.startBlock, claimedAt: CLAIM.claimedAt }],
    ['a negative start block', { ...CLAIM, startBlock: -1 }],
    ['a fractional start block', { ...CLAIM, startBlock: 1.5 }],
    ['a claim time that is not a number', { ...CLAIM, claimedAt: 'yesterday' }],
    ['a hash that is not a string', { ...CLAIM, transactionHash: 5 }]
  ]

  damaged.forEach(([name, submission]) =>
    it(`a stored member with ${name} reads as no claim, the session still reads, and a claim replaces it`, async () => {
      const { storage, records } = setup()
      await storage.set(SESSION_KEY, {
        value: { state: 'live', gathering: ONE_REPLY, submission },
        savedAt: T0,
        revision: 'a'.repeat(24)
      })
      const read = await session(records).read()
      expect(liveOf(read)).toEqual({ state: 'live', gathering: ONE_REPLY })
      expect(revisionOf(read)).toBe('a'.repeat(24))
      expect(await records.listRecoverySessions(CHAIN_ID)).toHaveLength(1)
      const result = await claim(records)
      expect(result).toMatchObject({ claimed: true, submission: CLAIM })
      expect(await submissionOf(records)).toEqual(CLAIM)
    })
  )
})
