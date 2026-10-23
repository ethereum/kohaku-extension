/**
 * @jest-environment jsdom
 *
 * The band of an attempt already running against the looked-up account, on
 * the account step after the confirmation. The registry's reads are a fake
 * the page opens in place of its own provider; every other edge is the
 * harness's.
 */
import type { ActionState, Address, Hex } from '@kohaku-eth/social-recovery'
import type { AttemptEvents, AttemptScan } from '@web/modules/social-recovery/shared/client'
import {
  advanceClock,
  BASIC,
  CHAIN_ID,
  confirmLost,
  DAILY,
  DEPLOYMENT,
  DESCRIPTOR,
  gatheringFor,
  keyOf,
  kit,
  LOST,
  LOST_KEY,
  mountAccountStep,
  navigate,
  outside,
  records,
  resetEdges,
  searchOf,
  setupStateOf,
  setWallet,
  smartAccount,
  SMART_KEY,
  storage,
  storedEntry,
  t,
  useLiveFakeClock,
  VAULT
} from '@web/modules/social-recovery/recovery/entry/__tests__/harness'
import type {
  FakeAttemptReads,
  HeldDecisionCase,
  Mounted
} from '@web/modules/social-recovery/recovery/entry/__tests__/harness'
import { deferred } from '@web/modules/social-recovery/shared/chrome/__fixtures__/deferred'

// Loaded after the harness, which gives jsdom the `TextEncoder` viem reads when it loads.
/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const { getAddress, keccak256 }: typeof import('viem') = require('viem')
const {
  cancelPathOf
}: typeof import('@web/modules/social-recovery/cancel') = require('@web/modules/social-recovery/cancel')
const {
  waitPathOf
}: typeof import('@web/modules/social-recovery/recovery/checklist/search') = require('@web/modules/social-recovery/recovery/checklist/search')
const {
  CONFIRMED_READ_LIMIT_MS_STAND_IN: LIMIT_MS
}: typeof import('@web/modules/social-recovery/recovery/entry/constants') = require('@web/modules/social-recovery/recovery/entry/constants')
const {
  CHECKLIST_POLL_MS: POLL_MS
}: typeof import('@web/modules/social-recovery/recovery/checklist/constants') = require('@web/modules/social-recovery/recovery/checklist/constants')
const {
  renderDateTimeInZone
}: typeof import('@web/modules/social-recovery/shared/display') = require('@web/modules/social-recovery/shared/display')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const mockReads: FakeAttemptReads = {
  latestBlock: jest.fn(),
  stateOf: jest.fn(),
  attemptEventsOf: jest.fn(),
  blockTime: jest.fn(),
  handoverOf: jest.fn()
}
const mockClose = jest.fn()
/** Whether the build reads a deployed registry, and whether the wallet holds the chain's network. */
const mockEdges = { deployed: true, network: true }

jest.mock('@web/modules/social-recovery/shared/client/watcher-reads', () => ({
  ...jest.requireActual('@web/modules/social-recovery/shared/client/watcher-reads'),
  // The page only asks whether the build reads a deployed registry; the connection below is the fake.
  watchedDeploymentOf: () => (mockEdges.deployed ? {} : undefined),
  watcherConnectionFor: () => ({
    reads: {
      latestBlock: () => mockReads.latestBlock(),
      stateOf: (account: Address, block: number) => mockReads.stateOf(account, block),
      attemptEventsOf: (account: Address, attemptId: bigint, scan: AttemptScan) =>
        mockReads.attemptEventsOf(account, attemptId, scan),
      blockTime: (block: number) => mockReads.blockTime(block),
      handoverOf: (payload: Hex) => mockReads.handoverOf(payload)
    },
    providerKey: 'sepolia',
    destroy: () => mockClose()
  })
}))
jest.mock('@web/modules/social-recovery/shared/client/extension-provider', () => ({
  ...jest.requireActual('@web/modules/social-recovery/shared/client/extension-provider'),
  networkOf: () =>
    mockEdges.network
      ? { chainId: 11155111n, name: 'Sepolia', rpcUrls: ['https://rpc.test'] }
      : undefined,
  providerKeyOf: () => 'sepolia'
}))

const LOGGED_IN = searchOf('logged-in', BASIC)
const FRESH_INSTALL = searchOf('fresh-install', BASIC)

/** A key neither this wallet nor its fast track holds. */
const STRANGER: Address = getAddress('0x5e7a000000000000000000000000000000000031')
/** Another account, recovered here earlier, whose entry names a receiving account the wallet no longer lists. */
const OTHER: Address = getAddress('0x07e4000000000000000000000000000000000032')

const PAYLOAD: Hex = '0x1234'
const ATTEMPT_ID = 7n
const SETUP_NONCE = 1n
const CONSUMABLE_AFTER = 1_800_432_000
const OPENED_AT = 1_800_000_000
const OPENING_BLOCK = 250

const waitingState = (): ActionState => ({
  setupCommitment: `0x${'ab'.repeat(32)}`,
  setupNonce: SETUP_NONCE,
  nextAttemptId: ATTEMPT_ID + 1n,
  setupCommittedAtBlock: 100,
  attempt: {
    state: 'Waiting',
    attemptId: ATTEMPT_ID,
    setupNonce: SETUP_NONCE,
    consumableAfter: CONSUMABLE_AFTER,
    payloadHash: keccak256(PAYLOAD),
    order: { token: LOST_KEY, amount: 0n, payee: LOST_KEY },
    usedMethods: [],
    ignoresPause: false
  }
})

const opening = (): AttemptEvents => ({
  started: {
    kind: 'attempt-started',
    account: LOST,
    action: DESCRIPTOR.action,
    attemptId: ATTEMPT_ID,
    setupNonce: SETUP_NONCE,
    setupBody: '0x00',
    usedPlaces: [],
    usedMethods: [],
    payload: PAYLOAD,
    order: { token: LOST_KEY, amount: 0n, payee: LOST_KEY },
    consumableAfter: CONSUMABLE_AFTER,
    at: {
      blockNumber: OPENING_BLOCK,
      blockHash: `0x${'01'.repeat(32)}`,
      logIndex: 0,
      transactionHash: `0x${'02'.repeat(32)}`,
      removed: false
    }
  }
})

/** The registry holds no attempt waiting any more: the one it held was cancelled. */
const attemptCancelled = () => {
  mockReads.stateOf.mockImplementation(async () => ({
    ...waitingState(),
    attempt: { ...waitingState().attempt, state: 'Cancelled' }
  }))
}

/** The registry holds a newer attempt, with another payload, whose opening hands the account to the key. */
const NEXT_ID = ATTEMPT_ID + 1n
const NEXT_PAYLOAD: Hex = '0x5678'
const nextAttemptTo = (newKey: Address) => {
  mockReads.stateOf.mockImplementation(async () => ({
    ...waitingState(),
    nextAttemptId: NEXT_ID + 1n,
    attempt: { ...waitingState().attempt, attemptId: NEXT_ID, payloadHash: keccak256(NEXT_PAYLOAD) }
  }))
  mockReads.attemptEventsOf.mockImplementation(async () => {
    const events = opening()
    return events.started
      ? { started: { ...events.started, attemptId: NEXT_ID, payload: NEXT_PAYLOAD } }
      : events
  })
  mockReads.handoverOf.mockImplementation(() => ({
    newAuthority: newKey,
    removedAuthority: LOST_KEY
  }))
}

/** The registry answers an attempt waiting whose opening hands the account to the key. */
const attemptTo = (newKey: Address) => {
  mockReads.latestBlock.mockImplementation(async () => ({
    number: 300,
    timestamp: OPENED_AT + 100,
    hash: `0x${'cd'.repeat(32)}`
  }))
  mockReads.stateOf.mockImplementation(async () => waitingState())
  mockReads.attemptEventsOf.mockImplementation(async () => opening())
  mockReads.blockTime.mockImplementation(async () => OPENED_AT)
  mockReads.handoverOf.mockImplementation(() => ({
    newAuthority: newKey,
    removedAuthority: LOST_KEY
  }))
}

const finishes = () => {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const { date } = renderDateTimeInZone(CONSUMABLE_AFTER * 1000, timeZone)
  return t('socialRecovery.entry.runningAttempt.lead', { date })
}

/** Opens the account step, looks up the lost account with an attempt running, and confirms it. */
const openRunning = async (search: string = LOGGED_IN): Promise<Mounted> => {
  kit.setupState.mockImplementation(async () => setupStateOf({ attemptActive: true }))
  const page = await mountAccountStep(search)
  await confirmLost(page)
  return page
}

beforeEach(() => {
  resetEdges()
  Object.values(mockReads).forEach((read) => read.mockReset())
  mockClose.mockReset()
  mockEdges.deployed = true
  mockEdges.network = true
  attemptTo(STRANGER)
})

afterEach(() => {
  jest.useRealTimers()
})

describe('the running attempt band', () => {
  it('names the attempt with its end and its key, and offers no continue to the readout', async () => {
    const page = await openRunning()
    expect(page.textOf('entry-running-title')).toBe(t('socialRecovery.entry.runningAttempt.title'))
    expect(page.textOf('entry-running-lead')).toBe(finishes())
    expect(page.textOf('entry-running-key')).toContain(STRANGER)
    expect(page.has('entry-continue')).toBe(false)
    expect(page.text()).not.toMatch(/guardian/i)
    expect(mockReads.attemptEventsOf).toHaveBeenCalledWith(
      LOST,
      ATTEMPT_ID,
      expect.objectContaining({ from: 100, to: 300, until: 'opening' })
    )
    page.unmount()
    expect(mockClose).toHaveBeenCalled()
  })

  it('reads your own recovery where the new key is one the wallet holds', async () => {
    attemptTo(SMART_KEY)
    const page = await openRunning()
    expect(page.textOf('entry-running-yours')).toBe(
      t('socialRecovery.entry.runningAttempt.yoursWallet')
    )
    expect(page.has('entry-running-continue')).toBe(true)
    expect(page.has('entry-running-not-yours')).toBe(false)
    expect(page.has('entry-running-cancel')).toBe(false)
    page.unmount()
  })

  it('reads your own recovery by the fast track where the new key is the one the fast track made', async () => {
    attemptTo(BASIC)
    const page = await openRunning(FRESH_INSTALL)
    expect(page.textOf('entry-running-yours')).toBe(
      t('socialRecovery.entry.runningAttempt.yoursSeed')
    )
    page.unmount()
  })

  it('reads the key of a logged-in account as the wallet own, not the fast track', async () => {
    attemptTo(BASIC)
    const page = await openRunning(LOGGED_IN)
    expect(page.textOf('entry-running-yours')).toBe(
      t('socialRecovery.entry.runningAttempt.yoursWallet')
    )
    page.unmount()
  })

  it('reads wait it out for a key that is not this wallet and no key of the account is held', async () => {
    const page = await openRunning()
    expect(page.textOf('entry-running-not-yours')).toBe(
      t('socialRecovery.entry.runningAttempt.notYours')
    )
    expect(page.textOf('entry-running-wait-it-out')).toBe(
      t('socialRecovery.entry.runningAttempt.waitItOut')
    )
    expect(page.has('entry-running-cancel')).toBe(false)
    expect(page.has('entry-running-yours')).toBe(false)
    page.unmount()
  })

  it('offers the cancel only where a key the keystore holds is an authority of the account, and opens its tab', async () => {
    setWallet({
      accounts: [DAILY, VAULT, smartAccount(LOST, LOST_KEY, 'Lost')],
      keys: [keyOf(BASIC), keyOf(SMART_KEY), keyOf(LOST_KEY)]
    })
    const page = await openRunning()
    expect(kit.isAuthority).toHaveBeenCalledWith(LOST_KEY)
    expect(page.has('entry-running-wait-it-out')).toBe(false)
    expect(page.textOf('entry-running-cancel-body')).toBe(
      t('socialRecovery.entry.runningAttempt.cancelExitBody')
    )
    await page.press('entry-running-cancel')
    expect(navigate).toHaveBeenCalledWith(cancelPathOf(LOST))
    page.unmount()
  })

  it('offers no cancel where the held key of the account is not an authority', async () => {
    setWallet({
      accounts: [DAILY, VAULT, smartAccount(LOST, LOST_KEY, 'Lost')],
      keys: [keyOf(BASIC), keyOf(SMART_KEY), keyOf(LOST_KEY)]
    })
    kit.isAuthority.mockImplementation(async () => false)
    const page = await openRunning()
    expect(page.has('entry-running-cancel')).toBe(false)
    expect(page.has('entry-running-wait-it-out')).toBe(true)
    page.unmount()
  })

  it('lets the dormant reading win: no band, no own recovery claim and no cancel', async () => {
    attemptTo(SMART_KEY)
    kit.isAuthorized.mockResolvedValueOnce(false)
    const page = await openRunning()
    expect(page.has('entry-dormant-running')).toBe(true)
    expect(page.has('entry-running')).toBe(false)
    expect(page.has('entry-running-yours')).toBe(false)
    expect(page.has('entry-running-cancel')).toBe(false)
    expect(mockReads.stateOf).not.toHaveBeenCalled()
    page.unmount()
  })

  it('draws the end and no key and no claim while the opening has not returned', async () => {
    attemptTo(SMART_KEY)
    const held = deferred<AttemptEvents>()
    mockReads.attemptEventsOf.mockImplementation(() => held.promise)
    const page = await openRunning()
    expect(page.textOf('entry-running-lead')).toBe(finishes())
    expect(page.textOf('entry-running-key-pending')).toBe(
      t('socialRecovery.watcher.banner.newKeyPending')
    )
    expect(page.has('entry-running-key')).toBe(false)
    expect(page.has('entry-running-yours')).toBe(false)
    expect(page.has('entry-running-not-yours')).toBe(false)
    await outside(() => held.resolve(opening()))
    expect(page.has('entry-running-yours')).toBe(true)
    page.unmount()
  })

  it('draws a failed opening read with retry, never a key; the retry that answers names it', async () => {
    mockReads.attemptEventsOf.mockRejectedValueOnce(new Error('rpc down'))
    const page = await openRunning()
    expect(page.textOf('entry-running-lead')).toBe(finishes())
    expect(page.has('entry-running-opening-failed')).toBe(true)
    expect(page.has('entry-running-key')).toBe(false)
    expect(page.has('entry-running-not-yours')).toBe(false)
    await page.press('entry-running-opening-failed-retry')
    expect(page.textOf('entry-running-key')).toContain(STRANGER)
    page.unmount()
  })

  it('names no key for an opening whose payload does not hash to the attempt', async () => {
    mockReads.attemptEventsOf.mockImplementation(async () => {
      const events = opening()
      return events.started ? { started: { ...events.started, payload: '0x99' } } : events
    })
    const page = await openRunning()
    expect(page.has('entry-running-opening-failed')).toBe(true)
    expect(page.has('entry-running-key')).toBe(false)
    page.unmount()
  })

  it('says it reads the recovery in progress while the registry read has not answered, with no lead and no continue', async () => {
    mockReads.stateOf.mockImplementation(() => new Promise<never>(() => {}))
    const page = await openRunning()
    expect(page.textOf('entry-running-loading')).toBe(t('socialRecovery.loading.attempt'))
    expect(
      page.byTestId('entry-running-loading')?.querySelector('[data-testid="loading-block"]')
    ).not.toBeNull()
    expect(page.has('entry-running-lead')).toBe(false)
    expect(page.has('entry-continue')).toBe(false)
    page.unmount()
  })

  it('draws a failed registry read with retry, never as no attempt', async () => {
    mockReads.stateOf.mockRejectedValueOnce(new Error('rpc down'))
    const page = await openRunning()
    expect(page.textOf('entry-running-failed')).toContain(
      t('socialRecovery.entry.runningAttempt.readFailed')
    )
    expect(page.has('entry-running-lead')).toBe(false)
    expect(page.has('entry-continue')).toBe(false)
    await page.press('entry-running-failed-retry')
    expect(page.textOf('entry-running-lead')).toBe(finishes())
    page.unmount()
  })

  it('says the attempt ended, offers continue to the readout and releases the reads once the registry holds no attempt waiting', async () => {
    mockReads.stateOf.mockImplementation(async () => ({
      ...waitingState(),
      attempt: { ...waitingState().attempt, state: 'Cancelled' }
    }))
    const page = await openRunning()
    expect(page.textOf('entry-running-ended')).toBe(t('socialRecovery.entry.runningAttempt.ended'))
    expect(page.has('entry-running-loading')).toBe(false)
    expect(page.has('entry-continue')).toBe(true)
    expect(mockClose).toHaveBeenCalledTimes(1)
    page.unmount()
    expect(mockClose).toHaveBeenCalledTimes(1)
  })

  it('continues with that key: keeps the countdown the chain describes and opens the wait', async () => {
    attemptTo(SMART_KEY)
    const page = await openRunning()
    await page.press('entry-running-continue')
    const countdown = await records().countdown(CHAIN_ID, LOST).read()
    expect(countdown.status === 'present' && countdown.value).toEqual({
      account: LOST,
      attemptId: ATTEMPT_ID.toString(),
      setupNonce: SETUP_NONCE.toString(),
      payloadHash: keccak256(PAYLOAD),
      executableAt: CONSUMABLE_AFTER,
      deployment: DEPLOYMENT
    })
    expect(countdown.status === 'present' && countdown.savedAt).toBe(OPENED_AT * 1000)
    expect(await storedEntry(LOST)).toEqual({
      account: LOST,
      route: 'logged-in',
      receivingAccount: VAULT.addr,
      deployment: DEPLOYMENT
    })
    expect(navigate).toHaveBeenCalledWith(waitPathOf(LOST))
    page.unmount()
  })

  it('keeps a live gathering of the account and its entry rather than overwriting them, and still opens the wait', async () => {
    attemptTo(SMART_KEY)
    const page = await openRunning()
    const entryBefore = await storedEntry(LOST)
    await records().recoverySession(CHAIN_ID, LOST).write(gatheringFor(LOST), null)
    await page.press('entry-running-continue')
    const session = await records().recoverySession(CHAIN_ID, LOST).read()
    expect(session.status === 'present' && session.value.state).toBe('live')
    expect(await storedEntry(LOST)).toEqual(entryBefore)
    expect(navigate).toHaveBeenCalledWith(waitPathOf(LOST))
    page.unmount()
  })

  it('says the countdown was not saved where the write fails, and opens no wait', async () => {
    attemptTo(SMART_KEY)
    const page = await openRunning()
    storage.refuse = true
    await page.press('entry-running-continue')
    expect(page.textOf('entry-running-continue-failed')).toBe(
      t('socialRecovery.entry.runningAttempt.writeFailed')
    )
    expect(navigate).not.toHaveBeenCalledWith(waitPathOf(LOST))
    expect((await records().countdown(CHAIN_ID, LOST).read()).status).toBe('absent')
    storage.refuse = false
    await page.press('entry-running-continue')
    expect(navigate).toHaveBeenCalledWith(waitPathOf(LOST))
    page.unmount()
  })

  it('reads a stale fast-track entry whose key the keystore does not hold as not yours, with the cancel', async () => {
    setWallet({
      accounts: [DAILY, VAULT, smartAccount(LOST, LOST_KEY, 'Lost')],
      keys: [keyOf(BASIC), keyOf(SMART_KEY), keyOf(LOST_KEY)]
    })
    await records()
      .recoveryEntry(CHAIN_ID, OTHER)
      .write({ account: OTHER, route: 'fresh-install', receivingAccount: STRANGER })
    const page = await openRunning()
    expect(page.textOf('entry-running-not-yours')).toBe(
      t('socialRecovery.entry.runningAttempt.notYours')
    )
    expect(page.has('entry-running-yours')).toBe(false)
    expect(page.has('entry-running-cancel')).toBe(true)
    page.unmount()
  })

  it('draws a failed authority read with its own line and retry, never as no cancel', async () => {
    setWallet({
      accounts: [DAILY, VAULT, smartAccount(LOST, LOST_KEY, 'Lost')],
      keys: [keyOf(BASIC), keyOf(SMART_KEY), keyOf(LOST_KEY)]
    })
    // Every read of the account's key fails until the node comes back.
    let down = true
    kit.isAuthority.mockImplementation(async (address) => {
      if (address === LOST_KEY && down) {
        throw new Error('rpc down')
      }
      return address === LOST_KEY
    })
    const page = await openRunning()
    expect(page.textOf('entry-running-authority-failed')).toContain(
      t('socialRecovery.entry.runningAttempt.authorityFailed')
    )
    expect(page.has('entry-running-wait-it-out')).toBe(false)
    expect(page.has('entry-running-cancel')).toBe(false)
    down = false
    await page.press('entry-running-authority-failed-retry')
    expect(page.has('entry-running-authority-failed')).toBe(false)
    expect(page.has('entry-running-cancel')).toBe(true)
    page.unmount()
  })

  it('offers no cancel on your own recovery, even where the wallet holds the account own key', async () => {
    attemptTo(SMART_KEY)
    setWallet({
      accounts: [DAILY, VAULT, smartAccount(LOST, LOST_KEY, 'Lost')],
      keys: [keyOf(BASIC), keyOf(SMART_KEY), keyOf(LOST_KEY)]
    })
    const page = await openRunning()
    expect(page.has('entry-running-yours')).toBe(true)
    expect(page.has('entry-running-continue')).toBe(true)
    expect(page.has('entry-running-cancel')).toBe(false)
    expect(page.has('entry-running-cancel-body')).toBe(false)
    page.unmount()
  })

  it('names no key for an opening whose payload does not decode', async () => {
    mockReads.handoverOf.mockImplementation(() => undefined)
    const page = await openRunning()
    expect(page.textOf('entry-running-opening-failed')).toContain(
      t('socialRecovery.entry.runningAttempt.readFailed')
    )
    expect(page.has('entry-running-key')).toBe(false)
    expect(page.has('entry-running-not-yours')).toBe(false)
    page.unmount()
  })

  const unreadable: [string, () => void][] = [
    [
      'the wallet holds no network for the chain',
      () => {
        mockEdges.network = false
      }
    ],
    [
      'the build reads no deployed registry',
      () => {
        mockEdges.deployed = false
      }
    ]
  ]
  unreadable.forEach(([name, arrange]) => {
    it(`draws the band as failed, never as no attempt, where ${name}`, async () => {
      arrange()
      const page = await openRunning()
      expect(page.textOf('entry-running-failed')).toContain(
        t('socialRecovery.entry.runningAttempt.readFailed')
      )
      expect(page.has('entry-running-ended')).toBe(false)
      expect(page.has('entry-continue')).toBe(false)
      expect(mockReads.stateOf).not.toHaveBeenCalled()
      page.unmount()
    })
  })

  it('releases the registry reads once when the band goes', async () => {
    const page = await openRunning()
    expect(page.has('entry-running-lead')).toBe(true)
    expect(mockClose).not.toHaveBeenCalled()
    page.unmount()
    expect(mockClose).toHaveBeenCalledTimes(1)
  })

  it('stops the opening scan at the limit, and a retry scans again from the setup block', async () => {
    useLiveFakeClock()
    const scans: AttemptScan[] = []
    mockReads.attemptEventsOf.mockImplementationOnce((_account, _attemptId, scan) => {
      scans.push(scan)
      return new Promise<never>(() => {})
    })
    const page = await openRunning()
    expect(scans[0].stop?.()).toBe(false)
    await advanceClock(LIMIT_MS)
    expect(scans[0].stop?.()).toBe(true)
    expect(page.has('entry-running-opening-failed')).toBe(true)
    await page.press('entry-running-opening-failed-retry')
    expect(mockReads.attemptEventsOf).toHaveBeenLastCalledWith(
      LOST,
      ATTEMPT_ID,
      expect.objectContaining({ from: 100, to: 300, until: 'opening' })
    )
    expect(page.textOf('entry-running-key')).toContain(STRANGER)
    page.unmount()
  })
})

describe('the running attempt band while it stands', () => {
  it('says the attempt ended once a later read finds none waiting, offers continue to the readout and releases the reads', async () => {
    useLiveFakeClock()
    const page = await openRunning()
    expect(page.textOf('entry-running-key')).toContain(STRANGER)
    expect(page.has('entry-continue')).toBe(false)
    attemptCancelled()
    await advanceClock(POLL_MS)
    expect(page.textOf('entry-running-ended')).toBe(t('socialRecovery.entry.runningAttempt.ended'))
    expect(page.has('entry-continue')).toBe(true)
    expect(mockClose).toHaveBeenCalledTimes(1)
    const reads = mockReads.stateOf.mock.calls.length
    await advanceClock(POLL_MS)
    expect(mockReads.stateOf.mock.calls.length).toBe(reads)
    page.unmount()
    expect(mockClose).toHaveBeenCalledTimes(1)
  })

  it('reads the registry again when the tab returns to view', async () => {
    const page = await openRunning()
    attemptCancelled()
    await outside(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(page.has('entry-running-ended')).toBe(true)
    page.unmount()
  })

  it('names the newer attempt and its key once a later read finds it in place of the first', async () => {
    useLiveFakeClock()
    const page = await openRunning()
    expect(page.has('entry-running-not-yours')).toBe(true)
    nextAttemptTo(SMART_KEY)
    await advanceClock(POLL_MS)
    expect(mockReads.attemptEventsOf).toHaveBeenLastCalledWith(
      LOST,
      NEXT_ID,
      expect.objectContaining({ until: 'opening' })
    )
    expect(page.textOf('entry-running-key')).toContain(SMART_KEY)
    expect(page.has('entry-running-yours')).toBe(true)
    expect(page.has('entry-running-not-yours')).toBe(false)
    page.unmount()
  })

  it('draws a later read that fails as failed with retry beside the attempt last read; the retry that answers clears it without scanning again', async () => {
    useLiveFakeClock()
    const page = await openRunning()
    mockReads.stateOf.mockRejectedValueOnce(new Error('rpc down'))
    await advanceClock(POLL_MS)
    expect(page.textOf('entry-running-refresh-failed')).toContain(
      t('socialRecovery.entry.runningAttempt.readFailed')
    )
    expect(page.has('entry-running-failed')).toBe(false)
    expect(page.textOf('entry-running-lead')).toBe(finishes())
    expect(page.textOf('entry-running-key')).toContain(STRANGER)
    expect(page.has('entry-running-ended')).toBe(false)
    const scans = mockReads.attemptEventsOf.mock.calls.length
    const reads = mockReads.stateOf.mock.calls.length
    await page.press('entry-running-refresh-failed-retry')
    expect(mockReads.stateOf.mock.calls.length).toBe(reads + 1)
    expect(page.has('entry-running-refresh-failed')).toBe(false)
    expect(page.has('entry-running-loading')).toBe(false)
    expect(page.textOf('entry-running-key')).toContain(STRANGER)
    expect(mockReads.attemptEventsOf.mock.calls.length).toBe(scans)
    page.unmount()
  })

  it('draws a later read that does not answer within the limit as failed with retry, keeping the attempt', async () => {
    useLiveFakeClock()
    const page = await openRunning()
    mockReads.stateOf.mockImplementationOnce(() => new Promise<never>(() => {}))
    await advanceClock(POLL_MS)
    expect(page.has('entry-running-refresh-failed')).toBe(false)
    await advanceClock(LIMIT_MS)
    expect(page.has('entry-running-refresh-failed')).toBe(true)
    expect(page.textOf('entry-running-key')).toContain(STRANGER)
    expect(page.has('entry-running-ended')).toBe(false)
    page.unmount()
  })

  it('keeps the attempt last read beside a line that says it is read again while a later read runs', async () => {
    useLiveFakeClock()
    const page = await openRunning()
    expect(page.has('entry-running-refreshing')).toBe(false)
    mockReads.stateOf.mockImplementationOnce(() => new Promise<never>(() => {}))
    await advanceClock(POLL_MS)
    expect(page.textOf('entry-running-refreshing')).toBe(
      t('socialRecovery.loading.refreshingAttempt')
    )
    expect(
      page.byTestId('entry-running-refreshing')?.querySelector('[data-testid="loading-row"]')
    ).not.toBeNull()
    expect(page.textOf('entry-running-lead')).toBe(finishes())
    expect(page.textOf('entry-running-key')).toContain(STRANGER)
    await advanceClock(LIMIT_MS)
    expect(page.has('entry-running-refreshing')).toBe(false)
    expect(page.has('entry-running-refresh-failed')).toBe(true)
    page.unmount()
  })

  const decisions: HeldDecisionCase[] = [
    [
      'cancel',
      'entry-running-cancel',
      () => {
        setWallet({
          accounts: [DAILY, VAULT, smartAccount(LOST, LOST_KEY, 'Lost')],
          keys: [keyOf(BASIC), keyOf(SMART_KEY), keyOf(LOST_KEY)]
        })
      },
      cancelPathOf(LOST)
    ],
    [
      'continue',
      'entry-running-continue',
      () => {
        attemptTo(SMART_KEY)
      },
      waitPathOf(LOST)
    ]
  ]
  decisions.forEach(([name, button, arrange, path]) => {
    it(`holds the ${name} while a later read runs, and takes it again once that read answers`, async () => {
      useLiveFakeClock()
      arrange()
      const page = await openRunning()
      expect(page.isDisabled(button)).toBe(false)
      const held = deferred<ActionState>()
      mockReads.stateOf.mockImplementationOnce(() => held.promise)
      await advanceClock(POLL_MS)
      expect(page.textOf('entry-running-refreshing')).toBe(
        t('socialRecovery.loading.refreshingAttempt')
      )
      expect(page.isDisabled(button)).toBe(true)
      const navigations = navigate.mock.calls.length
      const writes = storage.set.mock.calls.length
      await page.press(button)
      await page.press(button)
      expect(navigate.mock.calls.length).toBe(navigations)
      expect(storage.set.mock.calls.length).toBe(writes)
      expect((await records().countdown(CHAIN_ID, LOST).read()).status).toBe('absent')
      await outside(() => held.resolve(waitingState()))
      expect(page.has('entry-running-refreshing')).toBe(false)
      expect(page.isDisabled(button)).toBe(false)
      expect(navigate).not.toHaveBeenCalledWith(path)
      await page.press(button)
      expect(navigate).toHaveBeenCalledWith(path)
      page.unmount()
    })
  })

  it('reads a later read from an older block with no attempt as failed, never as the end; a newer block with none ends it', async () => {
    useLiveFakeClock()
    const page = await openRunning()
    attemptCancelled()
    mockReads.latestBlock.mockImplementation(async () => ({
      number: 200,
      timestamp: OPENED_AT + 50,
      hash: `0x${'cd'.repeat(32)}`
    }))
    await advanceClock(POLL_MS)
    expect(page.has('entry-running-ended')).toBe(false)
    expect(page.has('entry-running-refresh-failed')).toBe(true)
    expect(page.textOf('entry-running-key')).toContain(STRANGER)
    expect(page.has('entry-continue')).toBe(false)
    expect(mockClose).not.toHaveBeenCalled()
    mockReads.latestBlock.mockImplementation(async () => ({
      number: 301,
      timestamp: OPENED_AT + 200,
      hash: `0x${'cd'.repeat(32)}`
    }))
    await advanceClock(POLL_MS)
    expect(page.textOf('entry-running-ended')).toBe(t('socialRecovery.entry.runningAttempt.ended'))
    expect(page.has('entry-continue')).toBe(true)
    expect(mockClose).toHaveBeenCalledTimes(1)
    page.unmount()
    expect(mockClose).toHaveBeenCalledTimes(1)
  })

  it('reads the first read after a retry from an older block with no attempt as failed, never as the end', async () => {
    mockReads.attemptEventsOf.mockRejectedValueOnce(new Error('rpc down'))
    const page = await openRunning()
    expect(page.has('entry-running-opening-failed')).toBe(true)
    attemptCancelled()
    mockReads.latestBlock.mockImplementation(async () => ({
      number: 200,
      timestamp: OPENED_AT + 50,
      hash: `0x${'cd'.repeat(32)}`
    }))
    await page.press('entry-running-opening-failed-retry')
    expect(page.has('entry-running-ended')).toBe(false)
    expect(page.has('entry-running-failed')).toBe(true)
    expect(page.has('entry-continue')).toBe(false)
    expect(mockClose).not.toHaveBeenCalled()
    page.unmount()
  })

  it('reads a first read from a block older than the setup read with no attempt as failed, never as the end', async () => {
    attemptCancelled()
    mockReads.latestBlock.mockImplementation(async () => ({
      number: 150,
      timestamp: OPENED_AT,
      hash: `0x${'cd'.repeat(32)}`
    }))
    const page = await openRunning()
    expect(page.has('entry-running-ended')).toBe(false)
    expect(page.has('entry-running-failed')).toBe(true)
    expect(mockClose).not.toHaveBeenCalled()
    page.unmount()
  })

  it('reads a later read of the same attempt from an older block as failed', async () => {
    useLiveFakeClock()
    const page = await openRunning()
    mockReads.latestBlock.mockImplementation(async () => ({
      number: 250,
      timestamp: OPENED_AT + 50,
      hash: `0x${'cd'.repeat(32)}`
    }))
    await advanceClock(POLL_MS)
    expect(page.has('entry-running-refresh-failed')).toBe(true)
    expect(page.textOf('entry-running-key')).toContain(STRANGER)
    page.unmount()
  })

  it('reads the registry before keeping the countdown, and an attempt that ended meanwhile keeps none and says it ended', async () => {
    attemptTo(SMART_KEY)
    const page = await openRunning()
    attemptCancelled()
    await page.press('entry-running-continue')
    expect(page.has('entry-running-ended')).toBe(true)
    expect(page.has('entry-continue')).toBe(true)
    expect((await records().countdown(CHAIN_ID, LOST).read()).status).toBe('absent')
    expect(navigate).not.toHaveBeenCalledWith(waitPathOf(LOST))
    page.unmount()
  })

  it('keeps no countdown where the registry holds another attempt when continue is pressed, and names the newer one', async () => {
    attemptTo(SMART_KEY)
    const page = await openRunning()
    nextAttemptTo(STRANGER)
    await page.press('entry-running-continue')
    expect((await records().countdown(CHAIN_ID, LOST).read()).status).toBe('absent')
    expect(navigate).not.toHaveBeenCalledWith(waitPathOf(LOST))
    expect(page.textOf('entry-running-key')).toContain(STRANGER)
    expect(page.has('entry-running-not-yours')).toBe(true)
    page.unmount()
  })

  it('takes no continue while a later read runs, and keeps no countdown once that read finds another attempt in place of the shown one', async () => {
    useLiveFakeClock()
    attemptTo(SMART_KEY)
    const page = await openRunning()
    nextAttemptTo(SMART_KEY)
    const nextState = await mockReads.stateOf(LOST, 300)
    const held = deferred<ActionState>()
    mockReads.stateOf.mockImplementationOnce(() => held.promise)
    await advanceClock(POLL_MS)
    expect(page.isDisabled('entry-running-continue')).toBe(true)
    await page.press('entry-running-continue')
    await outside(() => held.resolve(nextState))
    expect(mockReads.attemptEventsOf).toHaveBeenLastCalledWith(
      LOST,
      NEXT_ID,
      expect.objectContaining({ until: 'opening' })
    )
    expect((await records().countdown(CHAIN_ID, LOST).read()).status).toBe('absent')
    expect(navigate).not.toHaveBeenCalledWith(waitPathOf(LOST))
    page.unmount()
  })
})

describe('whose recovery the running attempt is', () => {
  /** A key the wallet holds as the second key of the smart account, and of no other listed account. */
  const SECOND_KEY: Address = getAddress('0x5ec0000000000000000000000000000000000033')

  it('offers continue to the readout, not with the key, where a listed account holds the key only as its second key', async () => {
    setWallet({
      accounts: [DAILY, { ...VAULT, associatedKeys: [SMART_KEY, SECOND_KEY] }],
      keys: [keyOf(BASIC), keyOf(SMART_KEY), keyOf(SECOND_KEY)]
    })
    attemptTo(SECOND_KEY)
    const page = await openRunning()
    expect(page.textOf('entry-running-yours')).toBe(
      t('socialRecovery.entry.runningAttempt.yoursWallet')
    )
    expect(page.has('entry-running-continue')).toBe(false)
    expect(page.has('entry-continue')).toBe(true)
    expect((await records().countdown(CHAIN_ID, LOST).read()).status).toBe('absent')
    page.unmount()
  })

  it('offers continue to the readout for a held key no listed account names', async () => {
    setWallet({
      accounts: [DAILY, VAULT],
      keys: [keyOf(BASIC), keyOf(SMART_KEY), keyOf(SECOND_KEY)]
    })
    attemptTo(SECOND_KEY)
    const page = await openRunning()
    expect(page.textOf('entry-running-yours')).toBe(
      t('socialRecovery.entry.runningAttempt.yoursWallet')
    )
    expect(page.has('entry-running-continue')).toBe(false)
    expect(page.has('entry-continue')).toBe(true)
    page.unmount()
  })

  it('draws a failed listing of the recovery entries with retry and no claim; the retry that answers names the fast track', async () => {
    attemptTo(BASIC)
    let down = true
    const getAll = storage.getAll?.bind(storage)
    const listing = jest.spyOn(storage, 'getAll').mockImplementation(async () => {
      if (down || !getAll) {
        throw new Error('storage unavailable')
      }
      return getAll()
    })
    const page = await openRunning(FRESH_INSTALL)
    expect(page.textOf('entry-running-entries-failed')).toContain(
      t('socialRecovery.entry.runningAttempt.readFailed')
    )
    expect(page.has('entry-running-yours')).toBe(false)
    expect(page.has('entry-running-continue')).toBe(false)
    expect(page.has('entry-running-cancel')).toBe(false)
    down = false
    await page.press('entry-running-entries-failed-retry')
    expect(page.textOf('entry-running-yours')).toBe(
      t('socialRecovery.entry.runningAttempt.yoursSeed')
    )
    expect(page.has('entry-running-continue')).toBe(true)
    listing.mockRestore()
    page.unmount()
  })

  it('draws a listing of the recovery entries that does not answer as loading, then failed with retry after the limit', async () => {
    useLiveFakeClock()
    attemptTo(BASIC)
    let hang = true
    const getAll = storage.getAll?.bind(storage)
    const listing = jest.spyOn(storage, 'getAll').mockImplementation(async () => {
      if (hang || !getAll) {
        return new Promise<never>(() => {})
      }
      return getAll()
    })
    const page = await openRunning(FRESH_INSTALL)
    expect(page.textOf('entry-running-entries-loading')).toBe(t('socialRecovery.loading.entries'))
    expect(
      page.byTestId('entry-running-entries-loading')?.querySelector('[data-testid="loading-row"]')
    ).not.toBeNull()
    expect(page.has('entry-running-yours')).toBe(false)
    expect(page.has('entry-running-continue')).toBe(false)
    expect(page.has('entry-running-not-yours')).toBe(false)
    await advanceClock(LIMIT_MS)
    expect(page.has('entry-running-entries-loading')).toBe(false)
    expect(page.textOf('entry-running-entries-failed')).toContain(
      t('socialRecovery.entry.runningAttempt.readFailed')
    )
    hang = false
    await page.press('entry-running-entries-failed-retry')
    expect(page.textOf('entry-running-yours')).toBe(
      t('socialRecovery.entry.runningAttempt.yoursSeed')
    )
    listing.mockRestore()
    page.unmount()
  })
})
