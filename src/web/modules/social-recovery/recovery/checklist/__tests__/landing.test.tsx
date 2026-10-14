/**
 * @jest-environment jsdom
 *
 * The request's own submission found on the chain, on Jest's fake clock: the
 * attempt that carries the request's predicted id, its setup nonce and the
 * hash of its payload lands the session and the holder goes on to the wait,
 * whatever state that attempt is in. An attempt that differs in the id or the
 * payload hash is another holder's and voids the request; one opened under
 * another setup is not this request's either. The landing leaves no claim
 * request and no report of the request that landed.
 */
import type { Gathering, Hex } from '@web/modules/social-recovery/sdk-interfaces'

import type {
  FakeDeps,
  FakeKit,
  Mounted,
  ScriptedRecoveryState,
  TestRecords
} from '@web/modules/social-recovery/recovery/checklist/__tests__/harness'
import {
  ACCOUNT,
  CHAIN_ID,
  depsOf,
  fakeKit,
  gatheringOf,
  MIXED_PATH,
  mountChecklist,
  NOW,
  outside,
  recoveryStateOf,
  requestOf,
  seedCache,
  seedEntry,
  seedSession,
  settle,
  storedSession,
  t,
  testRecords,
  withReplies
} from '@web/modules/social-recovery/recovery/checklist/__tests__/harness'

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const { keccak256 }: typeof import('viem') = require('viem')
const {
  ceremonyResultKey,
  failed
}: typeof import('@web/modules/social-recovery/shared/ceremony') = require('@web/modules/social-recovery/shared/ceremony')
const {
  stringify
}: typeof import('@ambire-common/libs/richJson/richJson') = require('@ambire-common/libs/richJson/richJson')
const {
  WEB_ROUTES
}: typeof import('@common/modules/router/constants/common') = require('@common/modules/router/constants/common')
const {
  CHECKLIST_POLL_MS
}: typeof import('@web/modules/social-recovery/recovery/checklist/constants') = require('@web/modules/social-recovery/recovery/checklist/constants')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const PAYLOAD: Hex = '0xabcdef'
const OTHER_PAYLOAD: Hex = '0x123456'

/** The gathering of attempt one, with the payload its submission would carry. */
const withPayload = (gathering: Gathering, payload: Hex = PAYLOAD): Gathering => ({
  ...gathering,
  request: { ...gathering.request, payload }
})

const WAIT_PATH = `/${WEB_ROUTES.socialRecoveryRecoveryWait}?account=${ACCOUNT}`

/**
 * What the landed session keeps of the request that landed, each member where
 * the records keep it: the attempt id and the setup nonce as the request
 * carries them, and the hash of its payload. Nothing else of the gathering.
 */
const LANDED_REQUEST = { attemptId: '1', setupNonce: '1', payloadHash: keccak256(PAYLOAD) }

describe('the request lands on the chain', () => {
  let view: Mounted | undefined
  let world: TestRecords
  let kit: FakeKit
  let deps: FakeDeps
  let land: jest.SpyInstance
  let wipe: jest.SpyInstance

  const open = async (gathering: Gathering, overrides: Partial<FakeDeps> = {}) => {
    await seedCache(world.records, MIXED_PATH)
    const seeded = await seedSession(world.records, gathering)
    kit = fakeKit(MIXED_PATH)
    deps = depsOf({ now: () => Date.now(), ...overrides })
    view = await mountChecklist({ records: world.records, client: kit.state, deps })
    return seeded
  }

  /** The account's attempt as the next poll reads it. */
  const chainReads = (attempt: ScriptedRecoveryState) => {
    kit.recoveryState.mockResolvedValue(recoveryStateOf(attempt))
  }

  /** The poll reads the request's own submission waiting on the chain. */
  const ownAttemptLands = async () => {
    chainReads({
      state: 'Waiting',
      attemptId: BigInt(1),
      nextAttemptId: BigInt(2),
      payloadHash: keccak256(PAYLOAD)
    })
    await settle(CHECKLIST_POLL_MS)
    await settle()
    expect(view?.navigate).toHaveBeenLastCalledWith(WAIT_PATH, { replace: true })
  }

  const present = async (id: string) =>
    (await world.records.ceremonyRequest(id).read()).status === 'present'
  const reported = async (id: string) =>
    (await deps.reportStore.get(ceremonyResultKey(id), undefined)) !== undefined

  beforeEach(async () => {
    jest.useFakeTimers()
    jest.setSystemTime(NOW)
    world = testRecords()
    await seedEntry(world.records)
    land = jest.spyOn(world.records, 'landSubmission')
    wipe = jest.spyOn(world.records, 'wipeRecoverySession')
  })

  afterEach(() => {
    view?.unmount()
    view = undefined
    jest.useRealTimers()
  })

  const states = ['Waiting', 'Cancelled', 'Consumed'] as const
  states.forEach((state) => {
    it(`lands the session in one records call and goes on to the wait where its own attempt reads ${state}`, async () => {
      const gathering = withPayload(withReplies(gatheringOf(MIXED_PATH), [0, 1, 2, 3]))
      const seeded = await open(gathering)
      expect(view?.byTestId('checklist-rows')).not.toBeNull()

      chainReads({
        state,
        attemptId: BigInt(1),
        nextAttemptId: BigInt(2),
        payloadHash: keccak256(PAYLOAD)
      })
      await settle(CHECKLIST_POLL_MS)

      expect(land).toHaveBeenCalledTimes(1)
      expect(land).toHaveBeenCalledWith(CHAIN_ID, ACCOUNT, seeded.revision)
      expect(wipe).not.toHaveBeenCalled()
      const landed = (await storedSession(world.records))?.value
      const kept = Object.fromEntries(
        Object.entries(LANDED_REQUEST).filter(([field]) => !!landed && field in landed)
      )
      expect(landed).toEqual({ state: 'landed', account: ACCOUNT, ...kept })
      expect(view?.navigate).toHaveBeenLastCalledWith(WAIT_PATH, { replace: true })
      expect(view?.byTestId('checklist-rows')).toBeNull()
      expect(view?.byTestId('checklist-wiped')).toBeNull()

      // The landed session is no live one: nothing reads it again or lands it twice.
      kit.recoveryState.mockClear()
      await settle(CHECKLIST_POLL_MS)
      await settle(CHECKLIST_POLL_MS)
      expect(kit.recoveryState).not.toHaveBeenCalled()
      expect(land).toHaveBeenCalledTimes(1)
    })
  })

  it('voids the request where an attempt with its predicted id carries another payload', async () => {
    const seeded = await open(withPayload(gatheringOf(MIXED_PATH)))

    chainReads({
      state: 'Waiting',
      attemptId: BigInt(1),
      nextAttemptId: BigInt(2),
      payloadHash: keccak256(OTHER_PAYLOAD)
    })
    await settle(CHECKLIST_POLL_MS)

    expect(land).not.toHaveBeenCalled()
    expect(wipe).toHaveBeenCalledTimes(1)
    expect(wipe).toHaveBeenCalledWith(CHAIN_ID, ACCOUNT, 'another-attempt-opened', seeded.revision)
    expect(view?.byTestId('checklist-wiped-title')?.textContent).toBe(
      t('socialRecovery.records.voidTitle')
    )
    expect(view?.byTestId('checklist-void-slot')).not.toBeNull()
    expect(view?.navigate).not.toHaveBeenCalledWith(WAIT_PATH, expect.anything())
  })

  it('voids the request where an ended attempt with its predicted id carries another payload', async () => {
    await open(withPayload(gatheringOf(MIXED_PATH)))

    chainReads({
      state: 'Cancelled',
      attemptId: BigInt(1),
      nextAttemptId: BigInt(2),
      payloadHash: keccak256(OTHER_PAYLOAD)
    })
    await settle(CHECKLIST_POLL_MS)

    expect(land).not.toHaveBeenCalled()
    expect(wipe).toHaveBeenCalledWith(
      CHAIN_ID,
      ACCOUNT,
      'another-attempt-opened',
      expect.anything()
    )
  })

  it('voids the request where an attempt of another id carries the same payload', async () => {
    await open(withPayload(gatheringOf(MIXED_PATH)))

    chainReads({
      state: 'Waiting',
      attemptId: BigInt(2),
      nextAttemptId: BigInt(3),
      payloadHash: keccak256(PAYLOAD)
    })
    await settle(CHECKLIST_POLL_MS)

    expect(land).not.toHaveBeenCalled()
    expect(wipe).toHaveBeenCalledWith(
      CHAIN_ID,
      ACCOUNT,
      'another-attempt-opened',
      expect.anything()
    )
    expect(view?.byTestId('checklist-void-slot')).not.toBeNull()
  })

  const ended = ['Cancelled', 'Consumed'] as const
  ended.forEach((state) => {
    it(`wipes as setup changed and lands nothing where an attempt with its predicted id and payload reads ${state} under another setup`, async () => {
      const seeded = await open(withPayload(withReplies(gatheringOf(MIXED_PATH), [0, 1, 2, 3])))

      chainReads({
        state,
        attemptId: BigInt(1),
        nextAttemptId: BigInt(2),
        setupNonce: BigInt(2),
        payloadHash: keccak256(PAYLOAD)
      })
      await settle(CHECKLIST_POLL_MS)

      expect(land).not.toHaveBeenCalled()
      expect(wipe).toHaveBeenCalledTimes(1)
      expect(wipe).toHaveBeenCalledWith(CHAIN_ID, ACCOUNT, 'setup-changed', seeded.revision)
      expect((await storedSession(world.records))?.value).toMatchObject({
        state: 'wiped',
        reason: 'setup-changed'
      })
      expect(view?.byTestId('checklist-wiped-title')?.textContent).toBe(
        t('socialRecovery.records.setupChangedTitle')
      )
      expect(view?.byTestId('checklist-read-setup-again')).not.toBeNull()
      expect(view?.navigate).not.toHaveBeenCalledWith(WAIT_PATH, expect.anything())
    })
  })

  it('lands nothing where an attempt with its predicted id and payload waits under another setup, and names the slot it holds', async () => {
    const seeded = await open(withPayload(gatheringOf(MIXED_PATH)))

    chainReads({
      state: 'Waiting',
      attemptId: BigInt(1),
      nextAttemptId: BigInt(2),
      setupNonce: BigInt(2),
      payloadHash: keccak256(PAYLOAD)
    })
    await settle(CHECKLIST_POLL_MS)

    expect(land).not.toHaveBeenCalled()
    expect(wipe).toHaveBeenCalledTimes(1)
    expect(wipe).toHaveBeenCalledWith(CHAIN_ID, ACCOUNT, 'another-attempt-opened', seeded.revision)
    expect(view?.byTestId('checklist-void-slot')).not.toBeNull()
    expect(view?.navigate).not.toHaveBeenCalledWith(WAIT_PATH, expect.anything())
  })

  it('holds continue while the landing is being written, then goes on to the wait', async () => {
    await open(withPayload(withReplies(gatheringOf(MIXED_PATH), [0, 1, 2, 3])))
    expect(view?.byTestId('checklist-satisfied')).not.toBeNull()
    expect(view?.isDisabled('checklist-continue')).toBe(false)

    const release = world.storage.hold('recoverySession')
    chainReads({
      state: 'Waiting',
      attemptId: BigInt(1),
      nextAttemptId: BigInt(2),
      payloadHash: keccak256(PAYLOAD)
    })
    await settle(CHECKLIST_POLL_MS)

    expect(land).toHaveBeenCalledTimes(1)
    expect(view?.byTestId('checklist-rows')).not.toBeNull()
    expect(view?.isDisabled('checklist-continue')).toBe(true)
    expect(view?.navigate).not.toHaveBeenCalledWith(WAIT_PATH, expect.anything())

    release()
    await settle()

    expect(view?.navigate).toHaveBeenLastCalledWith(WAIT_PATH, { replace: true })
    expect((await storedSession(world.records))?.value.state).toBe('landed')
  })

  describe('the claims of the request that landed', () => {
    /** A claim request another visit of the checklist stored, under an id this tab never held. */
    const storedClaim = (attempt: number) => ({
      call: 'createClaim' as const,
      method: 'passkey',
      account: ACCOUNT,
      chainId: CHAIN_ID,
      request: requestOf(withPayload(gatheringOf(MIXED_PATH, attempt)), 0),
      params: { handOff: false }
    })

    it('leaves no claim request and no report of the landed request in storage, and keeps those of another request', async () => {
      await open(withPayload(gatheringOf(MIXED_PATH)), {
        storedEntries: () => world.storage.getAll()
      })
      const claims = {
        'landed-one': storedClaim(1),
        'landed-two': storedClaim(1),
        'other-attempt': storedClaim(7)
      }
      await outside(() =>
        Promise.all(
          Object.entries(claims).map(async ([id, claim]) => {
            await world.records.ceremonyRequest(id).write(claim)
            await deps.channel.report(id, 'createClaim', failed('browser-error', 'NotAllowedError'))
          })
        )
      )

      await ownAttemptLands()

      const raw = stringify(await world.storage.getAll())
      expect(raw).not.toContain('landed-one')
      expect(raw).not.toContain('landed-two')
      expect(await present('landed-one')).toBe(false)
      expect(await present('landed-two')).toBe(false)
      expect(await reported('landed-one')).toBe(false)
      expect(await reported('landed-two')).toBe(false)
      expect(await present('other-attempt')).toBe(true)
      expect(await reported('other-attempt')).toBe(true)
    })

    it('removes the claim request the holder came back from, where storage lists no claim', async () => {
      await open(withPayload(gatheringOf(MIXED_PATH)))
      await view?.press('checklist-row-0-phone')
      const [id] = deps.requestIds
      expect(await present(id)).toBe(true)

      // The holder returns from the ceremony tab before its report is written.
      view?.unmount()
      view = await mountChecklist({
        records: world.records,
        client: kit.state,
        deps,
        search: { account: ACCOUNT, ceremony: id }
      })
      expect(view.byTestId('checklist-undelivered')).not.toBeNull()

      await ownAttemptLands()

      expect(await present(id)).toBe(false)
      expect(stringify(await world.storage.getAll())).not.toContain(id)
    })
  })
})
