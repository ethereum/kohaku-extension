/**
 * @jest-environment jsdom
 *
 * Start recovery pressed on the mounted confirmation: the claim on the live
 * session before the one send from the sending key, the failed readings in
 * the submission's own words, the refusal for an attempt already running, and
 * the landing, which waits for the attempt read to agree with this request.
 */
import type { Mounted, World } from '@web/modules/social-recovery/recovery/submit/__tests__/harness'
import {
  attemptActiveRefusal,
  attemptOf,
  hasButton,
  landedSession,
  PAYLOAD_HASH,
  minedAndReverted,
  mockWallet,
  mountSubmit,
  openWorld,
  rawStorage,
  RIVAL_PAYLOAD,
  recoveryStateOf,
  sendPort,
  sessionOf,
  settle,
  START_CALL,
  t,
  TX_HASH
} from '@web/modules/social-recovery/recovery/submit/__tests__/harness'
import { deferred } from '@web/modules/social-recovery/shared/chrome/__fixtures__/deferred'

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const { keccak256 }: typeof import('viem') = require('viem')
const {
  checklistPathOf,
  waitPathOf
}: typeof import('@web/modules/social-recovery/recovery/checklist') = require('@web/modules/social-recovery/recovery/checklist')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const SUBMIT = 'socialRecovery.submit'
const TRY_AGAIN = t('socialRecovery.writes.tryAgain')

describe('the submission', () => {
  let view: Mounted | undefined

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  const startOn = async (world: World) => {
    view = await mountSubmit(world.account)
    await view.press('submit-verify-details')
    expect(view.isDisabled('submit-action')).toBe(false)
    await view.press('submit-action')
    return view
  }

  /** The claim the stored session carries at the moment a send reaches the port. */
  const claimAtSend = (world: World) => {
    const seen: unknown[] = []
    const record = async () => {
      const session = await sessionOf(world.records, world.account)
      seen.push(session?.state === 'live' ? session.submission : 'not live')
    }
    world.port.sendAccountBatch.mockImplementation(async () => {
      await record()
      return TX_HASH
    })
    world.port.send.mockImplementation(async () => {
      await record()
      return TX_HASH
    })
    return seen
  }

  describe('the one send', () => {
    it('claims the session before a smart account sends its own batch, and sends once', async () => {
      const world = await openWorld({ route: 'logged-in', receiving: 'smart' })
      const seen = claimAtSend(world)
      const mounted = await startOn(world)
      expect(world.port.sendAccountBatch).toHaveBeenCalledTimes(1)
      expect(world.port.send).not.toHaveBeenCalled()
      const [account, calls] = world.port.sendAccountBatch.mock.calls[0]
      expect(account).toBe(world.receiving.addr)
      expect(calls).toEqual([START_CALL])
      expect(seen).toEqual([expect.objectContaining({ requestId: expect.any(String) })])
      expect((seen[0] as { transactionHash?: string }).transactionHash).toBeUndefined()
      expect(world.kit.complete).toHaveBeenLastCalledWith(
        expect.objectContaining({ request: world.gathering.request }),
        undefined,
        expect.any(Number)
      )
      expect(mounted.byTestId('submit-action')).toBeNull()
    })

    it('sends from a basic account’s own key on the logged-in route', async () => {
      const world = await openWorld({ route: 'logged-in', receiving: 'basic' })
      const seen = claimAtSend(world)
      await startOn(world)
      expect(world.port.send).toHaveBeenCalledTimes(1)
      expect(world.port.sendAccountBatch).not.toHaveBeenCalled()
      expect(world.port.send.mock.calls[0][0].addr).toBe(world.sendingKey)
      expect(seen).toHaveLength(1)
    })

    it('sends from the receiving basic account’s own key on the fresh install, the key the recovery installs', async () => {
      const world = await openWorld({ route: 'fresh-install' })
      const seen = claimAtSend(world)
      await startOn(world)
      expect(world.port.send).toHaveBeenCalledTimes(1)
      expect(world.port.sendAccountBatch).not.toHaveBeenCalled()
      const [key, transaction] = world.port.send.mock.calls[0]
      expect(key.addr).toBe(world.receiving.addr)
      expect(key.addr).toBe(world.newKey)
      expect(transaction).toEqual(
        expect.objectContaining({ to: START_CALL.target, data: START_CALL.data })
      )
      expect(seen).toHaveLength(1)
    })

    it('does nothing on a second press while the first send waits for the wallet', async () => {
      const world = await openWorld()
      const hash = deferred<`0x${string}`>()
      world.port.sendAccountBatch.mockImplementation(() => hash.promise)
      const mounted = await startOn(world)
      expect(mounted.byTestId('submit-action')).toBeNull()
      expect(mounted.text()).toContain(t('socialRecovery.writes.submittingRecovery'))
      hash.resolve(TX_HASH)
      await settle()
      expect(world.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    })
  })

  describe('the failed readings', () => {
    it('reads nothing was sent for a refused send, releases the claim, and offers the retry', async () => {
      const world = await openWorld()
      const refusing = sendPort('refused')
      mockWallet.port = refusing
      const mounted = await startOn(world)
      expect(refusing.sendAccountBatch).toHaveBeenCalledTimes(1)
      expect(mounted.text()).toContain(t(`${SUBMIT}.failedTitle`))
      expect(mounted.text()).toContain(t(`${SUBMIT}.notSent`))
      const session = await sessionOf(world.records, world.account)
      expect(session?.state).toBe('live')
      expect(session?.state === 'live' && session.submission).toBeFalsy()
      expect(hasButton(mounted, TRY_AGAIN)).toBe(true)

      refusing.sendAccountBatch.mockResolvedValueOnce(TX_HASH)
      await mounted.pressText(TRY_AGAIN)
      expect(refusing.sendAccountBatch).toHaveBeenCalledTimes(2)
      expect(mockWallet.navigate).toHaveBeenLastCalledWith(waitPathOf(world.account), {
        replace: true
      })
    })

    it('reads the gas gone with the cause for a reverted receipt, and releases the claim', async () => {
      const world = await openWorld()
      world.kit.receipts.wait.mockRejectedValueOnce(minedAndReverted())
      const mounted = await startOn(world)
      const text = mounted.text()
      expect(text).toContain(t(`${SUBMIT}.failedTitle`))
      expect(text).toContain(
        t('socialRecovery.writes.revertedSubmit', {
          cause: t('socialRecovery.writes.causes.unnamed')
        })
      )
      const session = await sessionOf(world.records, world.account)
      expect(session?.state).toBe('live')
      expect(session?.state === 'live' && session.submission).toBeFalsy()
      expect(mockWallet.navigate).not.toHaveBeenCalledWith(waitPathOf(world.account), {
        replace: true
      })
    })

    it('reads its own copy with no retry where another attempt already waits on the account', async () => {
      const world = await openWorld()
      world.kit.chain.attempt = attemptOf(world.gathering, { attemptId: 7n })
      const mounted = await startOn(world)
      expect(mounted.textOf('submit-already-running')).toBe(
        [
          t(`${SUBMIT}.failedTitle`),
          t(`${SUBMIT}.alreadyRunning.cannotHelp`),
          t(`${SUBMIT}.alreadyRunning.whatYouCanDo`),
          t(`${SUBMIT}.alreadyRunning.view`)
        ].join('')
      )
      expect(hasButton(mounted, TRY_AGAIN)).toBe(false)
      expect(mounted.byTestId('submit-action')).toBeNull()
      expect(world.port.sendAccountBatch).not.toHaveBeenCalled()
      expect(world.kit.prepareStartAttempt).not.toHaveBeenCalled()
      await mounted.press('submit-back-to-checklist')
      expect(mockWallet.navigate).toHaveBeenLastCalledWith(checklistPathOf(world.account))
    })

    it('reads the same copy where the prepare refuses because an attempt is active', async () => {
      const world = await openWorld()
      world.kit.prepareStartAttempt.mockRejectedValueOnce(attemptActiveRefusal())
      const mounted = await startOn(world)
      expect(mounted.text()).toContain(t(`${SUBMIT}.alreadyRunning.cannotHelp`))
      expect(hasButton(mounted, TRY_AGAIN)).toBe(false)
      expect(world.port.sendAccountBatch).not.toHaveBeenCalled()
      const session = await sessionOf(world.records, world.account)
      expect(session?.state === 'live' && session.submission).toBeFalsy()
    })
  })

  describe('an attempt the manager already holds', () => {
    const CLOSED = ['Cancelled', 'Consumed'] as const

    CLOSED.forEach((state) => {
      it(`lands an attempt of this request that is ${state.toLowerCase()} already, and sends nothing`, async () => {
        const world = await openWorld()
        world.kit.chain.attempt = attemptOf(world.gathering, { state })
        await startOn(world)
        expect(world.port.sendAccountBatch).not.toHaveBeenCalled()
        expect(await sessionOf(world.records, world.account)).toEqual(
          landedSession(world.account, world.gathering)
        )
        expect(mockWallet.navigate).toHaveBeenLastCalledWith(waitPathOf(world.account), {
          replace: true
        })
      })

      it(`reads no attempt running where an earlier attempt under another id is ${state.toLowerCase()}, and sends`, async () => {
        const world = await openWorld()
        world.kit.chain.attempt = attemptOf(world.gathering, { attemptId: 7n, state })
        const mounted = await startOn(world)
        expect(mounted.byTestId('submit-already-running')).toBeNull()
        expect(world.port.sendAccountBatch).toHaveBeenCalledTimes(1)
        expect(mockWallet.navigate).toHaveBeenLastCalledWith(waitPathOf(world.account), {
          replace: true
        })
      })
    })
  })

  describe('the set the start carries', () => {
    it('goes back to the checklist, with nothing sent, where the prepare picks another set than the one verified', async () => {
      const world = await openWorld({ replied: [0, 1, 2, 3, 4], chosen: [0, 1, 2, 3] })
      const mounted = await mountSubmit(world.account)
      view = mounted
      await mounted.press('submit-verify-details')
      const picked = world.kit.complete.getMockImplementation()
      if (!picked) {
        throw new Error('the kit completes nothing')
      }
      world.kit.complete.mockImplementation((...args: Parameters<typeof picked>) => {
        const request = picked(...args)
        return {
          ...request,
          proofs: [...request.proofs.slice(0, 3), { ...request.proofs[3], place: 4n }]
        }
      })
      await mounted.press('submit-action')
      expect(world.kit.prepareStartAttempt).not.toHaveBeenCalled()
      expect(world.port.sendAccountBatch).not.toHaveBeenCalled()
      const session = await sessionOf(world.records, world.account)
      expect(session?.state === 'live' && session.submission).toBeFalsy()
      expect(mockWallet.navigate).toHaveBeenLastCalledWith(checklistPathOf(world.account), {
        replace: true
      })
    })
  })

  describe('the landing', () => {
    it('lands the session, keeps no gathering in storage and goes on to the wait', async () => {
      const world = await openWorld()
      expect(await rawStorage(world.storage)).toContain('"gathering"')
      await startOn(world)
      const session = await sessionOf(world.records, world.account)
      expect(session).toEqual({
        state: 'landed',
        account: world.account,
        attemptId: world.gathering.request.attemptId,
        setupNonce: world.gathering.request.setupNonce,
        payloadHash: PAYLOAD_HASH
      })
      expect(await rawStorage(world.storage)).not.toContain('"gathering"')
      expect(mockWallet.navigate).toHaveBeenLastCalledWith(waitPathOf(world.account), {
        replace: true
      })
    })

    it('lands nothing until the attempt read after the receipt answers', async () => {
      const world = await openWorld()
      const read = deferred<ReturnType<typeof recoveryStateOf>>()
      const mounted = await mountSubmit(world.account)
      await mounted.press('submit-verify-details')
      view = mounted
      world.kit.recoveryState.mockImplementationOnce(async () =>
        recoveryStateOf(world.kit.chain.attempt)
      )
      world.kit.recoveryState.mockImplementationOnce(() => read.promise)
      await mounted.press('submit-action')
      expect(world.port.sendAccountBatch).toHaveBeenCalledTimes(1)
      expect(mounted.byTestId('submit-confirming')).not.toBeNull()
      expect((await sessionOf(world.records, world.account))?.state).toBe('live')
      expect(mockWallet.navigate).not.toHaveBeenCalled()
      read.resolve(recoveryStateOf(attemptOf(world.gathering)))
      await settle()
      expect((await sessionOf(world.records, world.account))?.state).toBe('landed')
      expect(mockWallet.navigate).toHaveBeenLastCalledWith(waitPathOf(world.account), {
        replace: true
      })
    })

    const DISAGREEMENTS = [
      [
        'a rival attempt under the same id with another payload',
        { payloadHash: keccak256(RIVAL_PAYLOAD) }
      ],
      ['an attempt under another setup nonce', { setupNonce: 9n }],
      ['an attempt under another id', { attemptId: 9n }],
      ['no waiting attempt', { state: 'None' as const }]
    ] as const

    DISAGREEMENTS.forEach(([named, overrides]) => {
      it(`keeps the confirming state with a retry where the read after the receipt finds ${named}`, async () => {
        const world = await openWorld()
        world.kit.receipts.wait.mockImplementationOnce(async (hash: `0x${string}`) => {
          world.kit.chain.attempt = attemptOf(world.gathering, overrides)
          return { hash, status: 1, blockNumber: 7_000_001 }
        })
        const mounted = await startOn(world)
        expect(mounted.byTestId('submit-unread')).not.toBeNull()
        const session = await sessionOf(world.records, world.account)
        expect(session?.state).toBe('live')
        expect(await rawStorage(world.storage)).toContain('"gathering"')
        expect(mockWallet.navigate).not.toHaveBeenCalled()
        expect(world.port.sendAccountBatch).toHaveBeenCalledTimes(1)
      })
    })

    it('keeps the confirming state where the read after the receipt fails, and lands on the retry', async () => {
      const world = await openWorld()
      world.kit.recoveryState
        .mockImplementationOnce(async () => recoveryStateOf(world.kit.chain.attempt))
        .mockRejectedValueOnce(new Error('node down'))
      const mounted = await startOn(world)
      expect(mounted.byTestId('submit-unread')).not.toBeNull()
      expect((await sessionOf(world.records, world.account))?.state).toBe('live')
      expect(mockWallet.navigate).not.toHaveBeenCalled()

      await mounted.press('submit-reread')
      expect((await sessionOf(world.records, world.account))?.state).toBe('landed')
      expect(mockWallet.navigate).toHaveBeenLastCalledWith(waitPathOf(world.account), {
        replace: true
      })
      expect(world.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    })
  })
})
