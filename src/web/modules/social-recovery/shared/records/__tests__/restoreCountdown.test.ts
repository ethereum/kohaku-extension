/**
 * The countdown of an attempt found running on chain, restored where the wait
 * reads it: what it keeps, what it replaces, and when the recovery entry is
 * written beside it.
 *
 * The records run against the rich JSON storage double, whose `calls` list
 * every storage write, so a test sees each write the restore makes.
 */
import { keccak256 } from 'viem'

import type { Address, Gathering, Hex } from '@kohaku-eth/social-recovery'
import {
  ChainCountdown,
  createWalletRecords,
  ExpectedRevision,
  RecoveryEntryRecord,
  recordKeys,
  revisionOf,
  WalletRecords
} from '@web/modules/social-recovery/shared/records'
import { makeStorage } from '@web/modules/social-recovery/shared/records/__fixtures__/storage'
import type { RichJsonStorageDouble } from '@web/modules/social-recovery/shared/records/__fixtures__/types'

const ACCOUNT: Address = '0x1111111111111111111111111111111111111111'
const RECEIVING: Address = '0x2222222222222222222222222222222222222222'
const EARLIER_RECEIVING: Address = '0x6666666666666666666666666666666666666666'
const MANAGER: Address = '0x4444444444444444444444444444444444444444'
const ACTION: Address = '0x5555555555555555555555555555555555555555'
const CHAIN_ID = 11155111n
const T0 = 1_700_000_000_000
const OPENED_AT_MS = 1_699_990_000_000
const SESSION_KEY = recordKeys.recoverySession(CHAIN_ID, ACCOUNT)
const ENTRY_KEY = recordKeys.recoveryEntry(CHAIN_ID, ACCOUNT)

const PAYLOAD: Hex = `0x${'0123456789abcdef'.repeat(4)}`

const gathering = (): Gathering => ({
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
    payload: PAYLOAD,
    order: { token: ACCOUNT, amount: '0', payee: ACCOUNT },
    validUntil: '1700086400',
    block: { number: 1, timestamp: '1700000000', hash: '0x01' }
  },
  places: [],
  replies: []
})

// The deployment `gathering()` names and the chain's attempts are read from.
const DEPLOYMENT = { manager: MANAGER, action: ACTION }

// The attempt the landing of `gathering()` keeps, as the chain describes it.
const SAME_ATTEMPT: ChainCountdown = {
  attemptId: 42n,
  setupNonce: 9n,
  payloadHash: keccak256(PAYLOAD),
  openedAtMs: OPENED_AT_MS,
  deployment: DEPLOYMENT
}
const ANOTHER_ATTEMPT: ChainCountdown = {
  attemptId: 43n,
  setupNonce: 9n,
  payloadHash: `0x${'bb'.repeat(32)}`,
  openedAtMs: OPENED_AT_MS,
  deployment: DEPLOYMENT
}
const ENTRY: Omit<RecoveryEntryRecord, 'account'> = {
  route: 'logged-in',
  receivingAccount: RECEIVING
}
const EARLIER_ENTRY: RecoveryEntryRecord = {
  account: ACCOUNT,
  route: 'fresh-install',
  receivingAccount: EARLIER_RECEIVING
}
// What the countdown of `ANOTHER_ATTEMPT` reads once restored.
const ANOTHER_COUNTDOWN = {
  account: ACCOUNT,
  attemptId: '43',
  setupNonce: '9',
  payloadHash: ANOTHER_ATTEMPT.payloadHash,
  deployment: DEPLOYMENT
}

const setup = () => {
  const storage = makeStorage()
  const records = createWalletRecords({ storage, now: () => T0 })
  return { storage, records }
}

const fresh = async (records: WalletRecords): Promise<ExpectedRevision> =>
  revisionOf(await records.recoverySession(CHAIN_ID, ACCOUNT).read())

const live = async (records: WalletRecords) => {
  await records.recoverySession(CHAIN_ID, ACCOUNT).write(gathering(), await fresh(records))
}

const landed = async (records: WalletRecords) => {
  await live(records)
  await records.landSubmission(CHAIN_ID, ACCOUNT, await fresh(records))
}

const restore = (records: WalletRecords, countdown: ChainCountdown) =>
  records.restoreCountdown(CHAIN_ID, ACCOUNT, countdown, ENTRY)

const countdownOf = (records: WalletRecords) => records.countdown(CHAIN_ID, ACCOUNT).read()

const entryOf = async (records: WalletRecords) => {
  const read = await records.recoveryEntry(CHAIN_ID, ACCOUNT).read()
  return read.status === 'present' ? read.value : null
}

// The keys of the storage writes made after `earlier` writes.
const writesSince = (storage: RichJsonStorageDouble, earlier: number) =>
  storage.calls.set.slice(earlier)

describe('the countdown restored from the chain', () => {
  it('writes the countdown, saved at the opening, and then the entry, where no session is stored', async () => {
    const { storage, records } = setup()
    const result = await restore(records, ANOTHER_ATTEMPT)
    const countdown = await countdownOf(records)
    expect(result).toEqual({ outcome: 'written', countdown })
    expect(countdown.status === 'present' && countdown.value).toEqual(ANOTHER_COUNTDOWN)
    expect(countdown.status === 'present' && countdown.savedAt).toBe(OPENED_AT_MS)
    expect(storage.calls.set).toEqual([SESSION_KEY, ENTRY_KEY])
    expect(await entryOf(records)).toEqual({ account: ACCOUNT, ...ENTRY, deployment: DEPLOYMENT })
  })

  it('writes no entry where none is given', async () => {
    const { storage, records } = setup()
    await records.restoreCountdown(CHAIN_ID, ACCOUNT, ANOTHER_ATTEMPT)
    expect(storage.calls.set).toEqual([SESSION_KEY])
    expect(await entryOf(records)).toBeNull()
  })

  it('keeps a countdown of the same attempt as it is, and writes the entry beside it', async () => {
    const { storage, records } = setup()
    await landed(records)
    await records.recoveryEntry(CHAIN_ID, ACCOUNT).write(EARLIER_ENTRY)
    const before = await countdownOf(records)
    const earlier = storage.calls.set.length
    const result = await restore(records, SAME_ATTEMPT)
    expect(result).toEqual({ outcome: 'kept', countdown: before })
    expect(writesSince(storage, earlier)).toEqual([ENTRY_KEY])
    expect(await entryOf(records)).toEqual({ account: ACCOUNT, ...ENTRY, deployment: DEPLOYMENT })
  })

  it('reads the same attempt whatever the case of its payload hash', async () => {
    const { records } = setup()
    await landed(records)
    const upper: Hex = `0x${SAME_ATTEMPT.payloadHash.slice(2).toUpperCase()}`
    const result = await restore(records, { ...SAME_ATTEMPT, payloadHash: upper })
    expect(result.outcome).toBe('kept')
  })

  it('keeps a countdown with an execution in flight, even of another attempt, and leaves the entry', async () => {
    const { storage, records } = setup()
    await landed(records)
    await records
      .countdown(CHAIN_ID, ACCOUNT)
      .claimExecution(
        { requestId: 'social-recovery-execute:first', startBlock: 7_000_000, claimedAt: T0 },
        await fresh(records)
      )
    await records.recoveryEntry(CHAIN_ID, ACCOUNT).write(EARLIER_ENTRY)
    const before = await countdownOf(records)
    const earlier = storage.calls.set.length
    const result = await restore(records, ANOTHER_ATTEMPT)
    expect(result).toEqual({ outcome: 'kept', countdown: before })
    expect(writesSince(storage, earlier)).toEqual([])
    expect(await entryOf(records)).toEqual(EARLIER_ENTRY)
  })

  it('replaces a countdown of a retired manager with an execution in flight, and writes the entry', async () => {
    const { storage, records } = setup()
    await storage.set(SESSION_KEY, {
      value: {
        state: 'landed',
        account: ACCOUNT,
        attemptId: '42',
        setupNonce: '9',
        payloadHash: ANOTHER_ATTEMPT.payloadHash,
        deployment: { ...DEPLOYMENT, manager: EARLIER_RECEIVING },
        execution: {
          requestId: 'social-recovery-execute:first',
          startBlock: 7_000_000,
          claimedAt: T0
        }
      },
      savedAt: T0,
      revision: 'c'.repeat(24)
    })
    await records.recoveryEntry(CHAIN_ID, ACCOUNT).write(EARLIER_ENTRY)
    const result = await restore(records, ANOTHER_ATTEMPT)
    expect(result.outcome).toBe('written')
    const countdown = await countdownOf(records)
    expect(countdown.status === 'present' && countdown.value).toEqual(ANOTHER_COUNTDOWN)
    expect(await entryOf(records)).toEqual({ account: ACCOUNT, ...ENTRY, deployment: DEPLOYMENT })
  })

  it('replaces a live session of a retired manager with the countdown, and writes the entry', async () => {
    const { records } = setup()
    const old = gathering()
    await records
      .recoverySession(CHAIN_ID, ACCOUNT)
      .write({ ...old, request: { ...old.request, manager: EARLIER_RECEIVING } } as Gathering, null)
    const result = await restore(records, ANOTHER_ATTEMPT)
    expect(result.outcome).toBe('written')
    const countdown = await countdownOf(records)
    expect(countdown.status === 'present' && countdown.value).toEqual(ANOTHER_COUNTDOWN)
    expect(await entryOf(records)).toEqual({ account: ACCOUNT, ...ENTRY, deployment: DEPLOYMENT })
  })

  it('keeps a live session and leaves the entry untouched', async () => {
    const { storage, records } = setup()
    await live(records)
    await records.recoveryEntry(CHAIN_ID, ACCOUNT).write(EARLIER_ENTRY)
    const earlier = storage.calls.set.length
    const result = await restore(records, SAME_ATTEMPT)
    expect(result).toEqual({ outcome: 'kept', countdown: { status: 'absent' } })
    expect(writesSince(storage, earlier)).toEqual([])
    const session = await records.recoverySession(CHAIN_ID, ACCOUNT).read()
    expect(session.status === 'present' && session.value.state).toBe('live')
    expect(await entryOf(records)).toEqual(EARLIER_ENTRY)
  })

  it('replaces a wiped session with the countdown and writes the entry', async () => {
    const { records } = setup()
    await live(records)
    await records.wipeRecoverySession(CHAIN_ID, ACCOUNT, 'deadline-passed', await fresh(records))
    const result = await restore(records, ANOTHER_ATTEMPT)
    expect(result.outcome).toBe('written')
    const countdown = await countdownOf(records)
    expect(countdown.status === 'present' && countdown.value).toEqual(ANOTHER_COUNTDOWN)
    expect(await entryOf(records)).toEqual({ account: ACCOUNT, ...ENTRY, deployment: DEPLOYMENT })
  })

  it('replaces the countdown of another attempt with no execution in flight, and writes the entry', async () => {
    const { records } = setup()
    await landed(records)
    await records.recoveryEntry(CHAIN_ID, ACCOUNT).write(EARLIER_ENTRY)
    const result = await restore(records, ANOTHER_ATTEMPT)
    expect(result.outcome).toBe('written')
    const countdown = await countdownOf(records)
    expect(countdown.status === 'present' && countdown.value).toEqual(ANOTHER_COUNTDOWN)
    expect(countdown.status === 'present' && countdown.savedAt).toBe(OPENED_AT_MS)
    expect(await entryOf(records)).toEqual({ account: ACCOUNT, ...ENTRY, deployment: DEPLOYMENT })
  })

  it('replaces the countdown of a greater attempt id on another manager, and one that names no deployment', async () => {
    const retired = { ...DEPLOYMENT, manager: EARLIER_RECEIVING }
    const cases = [{ deployment: retired }, {}]
    await cases.reduce(async (before, fields) => {
      await before
      const { storage, records } = setup()
      await storage.set(SESSION_KEY, {
        value: {
          state: 'landed',
          account: ACCOUNT,
          attemptId: '44',
          setupNonce: '9',
          payloadHash: ANOTHER_ATTEMPT.payloadHash,
          ...fields
        },
        savedAt: T0,
        revision: 'c'.repeat(24)
      })
      const result = await restore(records, ANOTHER_ATTEMPT)
      expect(result.outcome).toBe('written')
      const countdown = await countdownOf(records)
      expect(countdown.status === 'present' && countdown.value).toEqual(ANOTHER_COUNTDOWN)
    }, Promise.resolve())
  })

  it('reads an entry an earlier build wrote with no deployment', async () => {
    const { records } = setup()
    await records.recoveryEntry(CHAIN_ID, ACCOUNT).write(EARLIER_ENTRY)
    expect(await entryOf(records)).toEqual(EARLIER_ENTRY)
  })

  it('keeps the countdown of a newer attempt and its entry when an older attempt is restored after it', async () => {
    const { storage, records } = setup()
    await restore(records, ANOTHER_ATTEMPT)
    const earlier = storage.calls.set.length
    const result = await records.restoreCountdown(CHAIN_ID, ACCOUNT, SAME_ATTEMPT, {
      route: EARLIER_ENTRY.route,
      receivingAccount: EARLIER_ENTRY.receivingAccount
    })
    expect(result.outcome).toBe('kept')
    expect(result.countdown.status === 'present' && result.countdown.value).toEqual(
      ANOTHER_COUNTDOWN
    )
    expect(writesSince(storage, earlier)).toEqual([])
    const countdown = await countdownOf(records)
    expect(countdown.status === 'present' && countdown.value).toEqual(ANOTHER_COUNTDOWN)
    expect(await entryOf(records)).toEqual({ account: ACCOUNT, ...ENTRY, deployment: DEPLOYMENT })
  })

  it('runs after an update of the session that started before it, and reads what that update wrote', async () => {
    const { records } = setup()
    await live(records)
    const landing = records.landSubmission(CHAIN_ID, ACCOUNT, await fresh(records))
    const result = await restore(records, SAME_ATTEMPT)
    await landing
    expect(result.outcome).toBe('kept')
    expect(result.countdown.status).toBe('present')
  })
})
