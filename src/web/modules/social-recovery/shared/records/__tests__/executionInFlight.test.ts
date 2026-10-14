/**
 * The landed recovery session: the attempt it keeps from the landed request
 * (its attempt id, its setup nonce and the keccak256 of its payload), and the
 * execution in flight it carries: the claim one device writes before it sends
 * the execution, the hash it adds once the wallet broadcast it, and its
 * release. A reload or another tab that finds the claim follows it and sends
 * nothing; the end of the countdown drops it with the session.
 *
 * The records run against the rich JSON storage double, whose `calls` list
 * every storage write, so a test sees each write an accessor call makes.
 */
import { keccak256 } from 'viem'

import type {
  Address,
  ApproverReply,
  Gathering,
  Hex
} from '@web/modules/social-recovery/sdk-interfaces'
import {
  CountdownRead,
  createWalletRecords,
  DirectWipeEvent,
  ExecutionInFlightClaim,
  ExpectedRevision,
  recordKeys,
  revisionOf,
  SessionRevisionConflict,
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

const PAYLOAD: Hex = `0x${'0123456789abcdef'.repeat(4)}`
const HASH_A: Hex = `0x${'aa'.repeat(32)}`
const HASH_B: Hex = `0x${'bb'.repeat(32)}`

const CLAIM: ExecutionInFlightClaim = {
  requestId: 'social-recovery-execute:first',
  startBlock: 7_000_000,
  claimedAt: T0
}
const OTHER_CLAIM: ExecutionInFlightClaim = {
  requestId: 'social-recovery-execute:second',
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
  attemptId: '42',
  purpose: 'approval',
  place,
  method: METHOD,
  config: '0xabcd',
  salt: '0x01',
  digest: '0x0badc0de',
  proof: place === 0 ? '0xdeadbeefdeadbeef' : '0xfeedfacefeedface'
})

const gathering = (payload?: Hex): Gathering => ({
  kind: 'gathering',
  version: 1,
  purpose: 'approval',
  request: {
    chainId: CHAIN_ID.toString(),
    manager: MANAGER,
    digestVersion: '1',
    account: ACCOUNT,
    action: ACTION,
    attemptId: '42',
    setupNonce: '9',
    setupBody: '0x00',
    ...(payload === undefined ? {} : { payload }),
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
  replies: [reply(0), reply(1)]
})

// What the landing of `gathering(PAYLOAD)` keeps beside the account.
const ATTEMPT = { attemptId: '42', setupNonce: '9', payloadHash: keccak256(PAYLOAD) }

const setup = () => {
  const storage = makeStorage()
  const records = createWalletRecords({ storage, now: () => T0 })
  return { storage, records }
}

const session = (records: WalletRecords) => records.recoverySession(CHAIN_ID, ACCOUNT)
const countdown = (records: WalletRecords) => records.countdown(CHAIN_ID, ACCOUNT)

const fresh = async (records: WalletRecords): Promise<ExpectedRevision> =>
  revisionOf(await session(records).read())

const writeGathering = async (records: WalletRecords, value: Gathering) =>
  session(records).write(value, await fresh(records))

const land = async (records: WalletRecords) =>
  records.landSubmission(CHAIN_ID, ACCOUNT, await fresh(records))

const wipe = async (records: WalletRecords, event: DirectWipeEvent) =>
  records.wipeRecoverySession(CHAIN_ID, ACCOUNT, event, await fresh(records))

const claim = async (records: WalletRecords, value: ExecutionInFlightClaim = CLAIM) =>
  countdown(records).claimExecution(value, await fresh(records))

const setHash = async (records: WalletRecords, requestId: string, hash: Hex) =>
  countdown(records).setExecutionHash(requestId, hash, await fresh(records))

const release = async (records: WalletRecords, requestId: string) =>
  countdown(records).releaseExecution(requestId, await fresh(records))

const presentOf = (read: CountdownRead) => {
  if (read.status !== 'present') {
    throw new Error('expected a countdown')
  }
  return read
}

const executionOf = async (records: WalletRecords) =>
  presentOf(await countdown(records).read()).value.execution

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

const landed = async (value: Gathering = gathering(PAYLOAD)) => {
  const { storage, records } = setup()
  await writeGathering(records, value)
  await land(records)
  return { storage, records }
}

const landedWithClaim = async () => {
  const ctx = await landed()
  await claim(ctx.records)
  return ctx
}

// A landed session as an earlier version of the extension, or a damaged
// storage, left it.
const storeLanded = (storage: RichJsonStorageDouble, value: Record<string, unknown>) =>
  storage.set(SESSION_KEY, {
    value: { state: 'landed', account: ACCOUNT, ...value },
    savedAt: T0,
    revision: 'a'.repeat(24)
  })

describe('the landed session keeps the attempt of the landed request', () => {
  it('the attempt id, the setup nonce and the payload hash are read back after a reload, by the countdown and its list', async () => {
    const { storage } = await landed()
    const reopened = createWalletRecords({ storage, now: () => T0 })
    const read = presentOf(await countdown(reopened).read())
    expect(read.value).toEqual({ account: ACCOUNT, ...ATTEMPT })
    expect(read.value.payloadHash).toBe(keccak256(PAYLOAD))
    const listed = await reopened.listCountdowns(CHAIN_ID)
    expect(listed).toHaveLength(1)
    expect(listed[0].record.value).toEqual({ account: ACCOUNT, ...ATTEMPT })
    expect(listed[0].record.revision).toBe(read.revision)
    expect(storedSession(storage)).not.toContain(PAYLOAD.slice(2))
  })

  it('the landing answers the countdown it wrote, with the attempt', async () => {
    const { storage, records } = setup()
    await writeGathering(records, gathering(PAYLOAD))
    const written = await land(records)
    expect(written.value).toEqual({ account: ACCOUNT, ...ATTEMPT })
    const reopened = createWalletRecords({ storage, now: () => T0 })
    expect(presentOf(await countdown(reopened).read())).toEqual({ status: 'present', ...written })
  })

  it('a request with no payload lands with its attempt id and setup nonce and no payload hash', async () => {
    const { storage, records } = await landed(gathering())
    expect(presentOf(await countdown(records).read()).value).toEqual({
      account: ACCOUNT,
      attemptId: '42',
      setupNonce: '9'
    })
    expect(storedSession(storage)).not.toContain('payloadHash')
  })

  it('a stored request whose payload is not hex lands with no payload hash', async () => {
    const { storage, records } = setup()
    const live = gathering()
    await storage.set(SESSION_KEY, {
      value: { state: 'live', gathering: { ...live, request: { ...live.request, payload: 'zz' } } },
      savedAt: T0,
      revision: 'b'.repeat(24)
    })
    await land(records)
    expect(presentOf(await countdown(records).read()).value).toEqual({
      account: ACCOUNT,
      attemptId: '42',
      setupNonce: '9'
    })
  })

  it('a landed session stored with the account alone reads with no attempt, and its list too', async () => {
    const { storage, records } = setup()
    await storeLanded(storage, {})
    const read = presentOf(await countdown(records).read())
    expect(read.value).toEqual({ account: ACCOUNT })
    expect(read.revision).toBe('a'.repeat(24))
    const listed = await records.listCountdowns(CHAIN_ID)
    expect(listed.map((c) => c.record.value)).toEqual([{ account: ACCOUNT }])
  })

  const damaged: [string, Record<string, unknown>, Record<string, unknown>][] = [
    ['an attempt id that is a number', { attemptId: 42 }, { attemptId: undefined }],
    ['an empty attempt id', { attemptId: '' }, { attemptId: undefined }],
    ['a hex attempt id', { attemptId: '0x2a' }, { attemptId: undefined }],
    ['a negative setup nonce', { setupNonce: '-9' }, { setupNonce: undefined }],
    ['a fractional setup nonce', { setupNonce: '9.5' }, { setupNonce: undefined }],
    ['a payload hash that is not a string', { payloadHash: 5 }, { payloadHash: undefined }],
    ['a payload hash that is null', { payloadHash: null }, { payloadHash: undefined }]
  ]

  damaged.forEach(([name, member, absent]) =>
    it(`a stored landed session with ${name} reads without that member and keeps the others`, async () => {
      const { storage, records } = setup()
      await storeLanded(storage, { ...ATTEMPT, ...member })
      const kept = Object.fromEntries(
        Object.entries(ATTEMPT).filter(([field]) => !(field in absent))
      )
      const want = { account: ACCOUNT, ...kept }
      expect(presentOf(await countdown(records).read()).value).toEqual(want)
      expect((await records.listCountdowns(CHAIN_ID))[0].record.value).toEqual(want)
      expect(await session(records).read()).toMatchObject({
        status: 'present',
        value: { state: 'landed', ...want }
      })
    })
  )
})

describe('the claim of an execution in flight', () => {
  it('a claim on a landed session is read back by a new set of records on the same storage, beside the attempt', async () => {
    const { storage, records } = await landed()
    const result = await claim(records)
    expect(result.claimed).toBe(true)
    expect(result.execution).toEqual(CLAIM)
    expect(result.record.value).toEqual({ account: ACCOUNT, ...ATTEMPT, execution: CLAIM })
    const reopened = createWalletRecords({ storage, now: () => T0 })
    const read = presentOf(await countdown(reopened).read())
    expect(read.value).toEqual({ account: ACCOUNT, ...ATTEMPT, execution: CLAIM })
    expect(read.revision).toBe(result.record.revision)
    expect((await reopened.listCountdowns(CHAIN_ID))[0].record.value.execution).toEqual(CLAIM)
  })

  it('a second claim that names the revision the first claim read conflicts and writes nothing', async () => {
    const { storage, records } = await landed()
    const read = await fresh(records)
    await countdown(records).claimExecution(CLAIM, read)
    const other = createWalletRecords({ storage, now: () => T0 })
    const watch = watchWrites(storage)
    await expect(countdown(other).claimExecution(OTHER_CLAIM, read)).rejects.toBeInstanceOf(
      SessionRevisionConflict
    )
    expect(watch()).toEqual({ writes: [], unchanged: true })
    expect(await executionOf(records)).toEqual(CLAIM)
  })

  it('a second claim after a fresh read follows the first claim and writes nothing', async () => {
    const { storage, records } = await landedWithClaim()
    await setHash(records, CLAIM.requestId, HASH_A)
    const stored = await countdown(records).read()
    const other = createWalletRecords({ storage, now: () => T0 })
    const watch = watchWrites(storage)
    const result = await claim(other, OTHER_CLAIM)
    expect(result.claimed).toBe(false)
    expect(result.execution).toEqual({ ...CLAIM, transactionHash: HASH_A })
    expect(result.record.revision).toBe(revisionOf(stored))
    expect(result.record.value).toEqual(presentOf(stored).value)
    expect(watch()).toEqual({ writes: [], unchanged: true })
  })

  it('two claims from one read at once: one claims, the other conflicts', async () => {
    const { storage, records } = await landed()
    const read = await fresh(records)
    const other = createWalletRecords({ storage, now: () => T0 })
    const outcomes = await Promise.allSettled([
      countdown(records).claimExecution(CLAIM, read),
      countdown(other).claimExecution(OTHER_CLAIM, read)
    ])
    expect(outcomes[0]).toMatchObject({ status: 'fulfilled', value: { claimed: true } })
    expect(outcomes[1]).toMatchObject({
      status: 'rejected',
      reason: expect.any(SessionRevisionConflict)
    })
    expect(await executionOf(other)).toEqual(CLAIM)
  })
})

describe('the transaction hash of the execution in flight', () => {
  it('a hash set under the claim request id is read back after a reload', async () => {
    const { storage, records } = await landedWithClaim()
    const written = await setHash(records, CLAIM.requestId, HASH_A)
    expect(written.value.execution).toEqual({ ...CLAIM, transactionHash: HASH_A })
    const reopened = createWalletRecords({ storage, now: () => T0 })
    const read = presentOf(await countdown(reopened).read())
    expect(read.value).toEqual({
      account: ACCOUNT,
      ...ATTEMPT,
      execution: { ...CLAIM, transactionHash: HASH_A }
    })
    expect(read.revision).toBe(written.revision)
  })

  it('a hash under another request id is refused and writes nothing', async () => {
    const { storage, records } = await landedWithClaim()
    const watch = watchWrites(storage)
    await expect(setHash(records, OTHER_CLAIM.requestId, HASH_A)).rejects.toThrow(
      /No execution in flight under request/
    )
    expect(watch()).toEqual({ writes: [], unchanged: true })
    expect(await executionOf(records)).toEqual(CLAIM)
  })

  it('a hash with no claim on the landed session is refused and writes nothing', async () => {
    const { storage, records } = await landed()
    const watch = watchWrites(storage)
    await expect(setHash(records, CLAIM.requestId, HASH_A)).rejects.toThrow(
      /No execution in flight under request/
    )
    expect(watch()).toEqual({ writes: [], unchanged: true })
  })

  it('a second, different hash replaces the first, and the same hash again writes nothing', async () => {
    const { storage, records } = await landedWithClaim()
    await setHash(records, CLAIM.requestId, HASH_A)
    await setHash(records, CLAIM.requestId, HASH_B)
    expect(await executionOf(records)).toEqual({ ...CLAIM, transactionHash: HASH_B })
    const stored = await countdown(records).read()
    const watch = watchWrites(storage)
    const again = await setHash(records, CLAIM.requestId, HASH_B)
    expect(again.revision).toBe(revisionOf(stored))
    expect(watch()).toEqual({ writes: [], unchanged: true })
  })

  it('a hash that names a stale revision conflicts and writes nothing', async () => {
    const { storage, records } = await landed()
    const read = await fresh(records)
    await countdown(records).claimExecution(CLAIM, read)
    const watch = watchWrites(storage)
    await expect(
      countdown(records).setExecutionHash(CLAIM.requestId, HASH_A, read)
    ).rejects.toBeInstanceOf(SessionRevisionConflict)
    expect(watch()).toEqual({ writes: [], unchanged: true })
  })
})

describe('the release of the execution in flight', () => {
  it('a release under the claim request id removes the member, keeps the attempt and answers the new read', async () => {
    const { storage, records } = await landedWithClaim()
    await setHash(records, CLAIM.requestId, HASH_A)
    const released = await release(records, CLAIM.requestId)
    const read = await countdown(records).read()
    expect(released).toEqual(read)
    expect(presentOf(read).value).toEqual({ account: ACCOUNT, ...ATTEMPT })
    expect(storedSession(storage)).not.toMatch(/execution|requestId|transactionHash/)
    // The released session takes a new claim.
    expect((await claim(records, OTHER_CLAIM)).claimed).toBe(true)
  })

  it('a release with no claim, or under another request id, writes nothing and never conflicts', async () => {
    const none = await landed()
    const noneRead = await countdown(none.records).read()
    const noneWatch = watchWrites(none.storage)
    expect(await countdown(none.records).releaseExecution(CLAIM.requestId, 'stale')).toEqual(
      noneRead
    )
    expect(noneWatch()).toEqual({ writes: [], unchanged: true })

    const other = await landedWithClaim()
    const otherRead = await countdown(other.records).read()
    const otherWatch = watchWrites(other.storage)
    expect(await countdown(other.records).releaseExecution(OTHER_CLAIM.requestId, null)).toEqual(
      otherRead
    )
    expect(otherWatch()).toEqual({ writes: [], unchanged: true })
    expect(await executionOf(other.records)).toEqual(CLAIM)
  })

  it('a release under the claim request id that names a stale revision conflicts and writes nothing', async () => {
    const { storage, records } = await landed()
    const read = await fresh(records)
    await countdown(records).claimExecution(CLAIM, read)
    const watch = watchWrites(storage)
    await expect(countdown(records).releaseExecution(CLAIM.requestId, read)).rejects.toBeInstanceOf(
      SessionRevisionConflict
    )
    expect(watch()).toEqual({ writes: [], unchanged: true })
    expect(await executionOf(records)).toEqual(CLAIM)
  })
})

describe('the execution in flight keeps the time of the landing', () => {
  it('after a claim, a hash and a release the countdown keeps the savedAt and the age the landing wrote', async () => {
    const storage = makeStorage()
    const clock = { t: T0 }
    const records = createWalletRecords({ storage, now: () => clock.t })
    await writeGathering(records, gathering(PAYLOAD))
    clock.t = T0 + 1000
    await land(records)
    const landedAt = presentOf(await countdown(records).read()).savedAt
    expect(landedAt).toBe(T0 + 1000)

    clock.t = T0 + 60_000
    const claimed = await claim(records)
    expect(claimed.record.savedAt).toBe(landedAt)
    clock.t = T0 + 120_000
    expect((await setHash(records, CLAIM.requestId, HASH_A)).savedAt).toBe(landedAt)
    clock.t = T0 + 180_000
    const released = presentOf(await release(records, CLAIM.requestId))
    expect(released.savedAt).toBe(landedAt)

    const reopened = createWalletRecords({ storage, now: () => clock.t })
    expect(presentOf(await countdown(reopened).read()).savedAt).toBe(landedAt)
    expect((await reopened.listCountdowns(CHAIN_ID))[0].record.savedAt).toBe(landedAt)
    expect(await countdown(reopened).age()).toBe(T0 + 180_000 - landedAt)
  })
})

describe('the execution in flight ends with the countdown', () => {
  it('the end of the countdown removes the claim with the session, and a new gathering starts with none', async () => {
    const { storage, records } = await landedWithClaim()
    await setHash(records, CLAIM.requestId, HASH_A)
    expect(await records.endCountdown(CHAIN_ID, ACCOUNT, await fresh(records))).toBe(true)
    expect(storage.raw.has(SESSION_KEY)).toBe(false)
    expect(await countdown(records).read()).toEqual({ status: 'absent' })
    expect(await records.listCountdowns(CHAIN_ID)).toEqual([])
    await writeGathering(records, gathering(PAYLOAD))
    expect(storedSession(storage)).not.toMatch(/execution|transactionHash/)
  })
})

describe('a session that is not landed takes no execution in flight', () => {
  const states: [string, (records: WalletRecords) => Promise<unknown>][] = [
    ['an absent', async () => undefined],
    ['a live', async (records) => writeGathering(records, gathering(PAYLOAD))],
    [
      'a wiped',
      async (records) => {
        await writeGathering(records, gathering(PAYLOAD))
        await wipe(records, 'setup-changed')
      }
    ]
  ]

  states.forEach(([state, prepare]) =>
    it(`on ${state} session a claim and a hash are refused, a release answers no countdown, and none writes`, async () => {
      const { storage, records } = setup()
      await prepare(records)
      const before = await session(records).read()
      const watch = watchWrites(storage)
      await expect(claim(records)).rejects.toThrow(/No landed recovery session/)
      await expect(setHash(records, CLAIM.requestId, HASH_A)).rejects.toThrow(
        /No landed recovery session/
      )
      expect(await release(records, CLAIM.requestId)).toEqual({ status: 'absent' })
      expect(watch()).toEqual({ writes: [], unchanged: true })
      expect(await session(records).read()).toEqual(before)
    })
  )
})

describe('a damaged stored execution in flight', () => {
  const damaged: [string, unknown][] = [
    ['null', null],
    ['a string', 'social-recovery-execute:first'],
    ['an empty request id', { ...CLAIM, requestId: '' }],
    ['no request id', { startBlock: CLAIM.startBlock, claimedAt: CLAIM.claimedAt }],
    ['a negative start block', { ...CLAIM, startBlock: -1 }],
    ['a fractional start block', { ...CLAIM, startBlock: 1.5 }],
    ['a claim time that is not a number', { ...CLAIM, claimedAt: 'yesterday' }],
    ['a hash that is not a string', { ...CLAIM, transactionHash: 5 }]
  ]

  damaged.forEach(([name, execution]) =>
    it(`a stored member with ${name} reads as no claim, the countdown still reads, and a claim replaces it`, async () => {
      const { storage, records } = setup()
      await storeLanded(storage, { ...ATTEMPT, execution })
      const read = presentOf(await countdown(records).read())
      expect(read.value).toEqual({ account: ACCOUNT, ...ATTEMPT })
      expect(read.revision).toBe('a'.repeat(24))
      expect((await records.listCountdowns(CHAIN_ID))[0].record.value).toEqual({
        account: ACCOUNT,
        ...ATTEMPT
      })
      const result = await claim(records)
      expect(result).toMatchObject({ claimed: true, execution: CLAIM })
      expect(await executionOf(records)).toEqual(CLAIM)
    })
  )
})
