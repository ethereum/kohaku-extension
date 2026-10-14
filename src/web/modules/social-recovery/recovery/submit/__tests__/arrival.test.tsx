/**
 * @jest-environment jsdom
 *
 * Where the confirmation sends a recoverer who arrives with nothing to
 * confirm: no entry record, no live session, a session whose rule is not
 * satisfied, or a submission that already landed.
 */
import type { Mounted } from '@web/modules/social-recovery/recovery/submit/__tests__/harness'
import {
  CHAIN_ID,
  mountSubmit,
  openWorld,
  START_BLOCK,
  t,
  tick,
  TX_HASH
} from '@web/modules/social-recovery/recovery/submit/__tests__/harness'
import { deferred } from '@web/modules/social-recovery/shared/chrome/__fixtures__/deferred'

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const {
  DROPPED_AFTER_MS,
  DROPPED_RECHECK_MS
}: typeof import('@web/modules/social-recovery/shared/writes') = require('@web/modules/social-recovery/shared/writes')
const {
  accountStepPath,
  checklistPathOf,
  waitPathOf
}: typeof import('@web/modules/social-recovery/recovery/checklist') = require('@web/modules/social-recovery/recovery/checklist')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

describe('the confirmation’s arrival', () => {
  let view: Mounted | undefined

  afterEach(() => {
    view?.unmount()
    view = undefined
    jest.useRealTimers()
  })

  it('goes to the account step where the account has no entry record', async () => {
    const world = await openWorld({ seed: false })
    view = await mountSubmit(world.account)
    expect(view.paths()).toEqual([accountStepPath()])
    expect(view.byTestId('submit')).toBeNull()
  })

  it('goes back to the checklist where no session is stored', async () => {
    const world = await openWorld({ seed: false })
    await world.records.recoveryEntry(CHAIN_ID, world.account).write(world.entry)
    await world.records
      .decryptedSetupCache(CHAIN_ID, world.account)
      .write({ configuration: world.configuration, setupNonce: 1n })
    view = await mountSubmit(world.account)
    expect(view.paths()).toEqual([checklistPathOf(world.account)])
    expect(view.byTestId('submit')).toBeNull()
  })

  it('goes back to the checklist where the session was wiped', async () => {
    const world = await openWorld()
    const read = await world.records.recoverySession(CHAIN_ID, world.account).read()
    if (read.status !== 'present') {
      throw new Error('no session seeded')
    }
    await world.records.wipeRecoverySession(
      CHAIN_ID,
      world.account,
      'another-attempt-opened',
      read.revision
    )
    view = await mountSubmit(world.account)
    expect(view.paths()).toEqual([checklistPathOf(world.account)])
  })

  it('goes back to the checklist where the live session does not satisfy the rule', async () => {
    const world = await openWorld({ replied: [0, 1, 2] })
    view = await mountSubmit(world.account)
    expect(view.paths()).toEqual([checklistPathOf(world.account)])
    expect(world.kit.verifyReply).not.toHaveBeenCalled()
    expect(view.byTestId('submit-action')).toBeNull()
  })

  it('goes on to the wait where the submission already landed', async () => {
    const world = await openWorld()
    const read = await world.records.recoverySession(CHAIN_ID, world.account).read()
    if (read.status !== 'present') {
      throw new Error('no session seeded')
    }
    await world.records.landSubmission(CHAIN_ID, world.account, read.revision)
    view = await mountSubmit(world.account)
    expect(view.paths()).toEqual([waitPathOf(world.account)])
    expect(view.byTestId('submit-action')).toBeNull()
  })

  it('says the start was dropped and offers Start recovery and Back again once a second reading a minute later finds the hash unknown', async () => {
    jest.useFakeTimers()
    const world = await openWorld()
    const accessor = world.records.recoverySession(CHAIN_ID, world.account)
    const read = await accessor.read()
    if (read.status !== 'present') {
      throw new Error('no session seeded')
    }
    const claimed = await accessor.claimSubmission(
      {
        requestId: 'page-that-went',
        startBlock: START_BLOCK,
        claimedAt: Date.now() - DROPPED_AFTER_MS - 1
      },
      read.revision
    )
    if (!claimed.claimed) {
      throw new Error('no claim written')
    }
    await accessor.setSubmissionHash('page-that-went', TX_HASH, claimed.record.revision)
    world.kit.receipts.transactionKnown.mockResolvedValue('unknown')
    world.kit.receipts.wait.mockImplementation(() => deferred<never>().promise)
    view = await mountSubmit(world.account, { useTimers: true })
    const claimNow = async () => {
      const session = await world.records.recoverySession(CHAIN_ID, world.account).read()
      return session.status === 'present' && session.value.state === 'live'
        ? session.value.submission
        : undefined
    }
    expect((await claimNow())?.transactionHash).toBe(TX_HASH)
    expect(view.byTestId('submit-action')).toBeNull()
    expect(view.byTestId('submit-dropped')).toBeNull()

    await tick(DROPPED_RECHECK_MS)
    expect(await claimNow()).toBeUndefined()
    expect(view.byTestId('submit-action')).not.toBeNull()
    expect(view.byTestId('submit-back')).not.toBeNull()
    expect(view.textOf('submit-dropped')).toBe(
      t('socialRecovery.submit.droppedTitle') + t('socialRecovery.submit.droppedBody')
    )
    await view.press('submit-verify-details')
    expect(view.isDisabled('submit-action')).toBe(false)
    expect(world.port.sendAccountBatch).not.toHaveBeenCalled()
  })

  it('stays where the live session satisfies the rule', async () => {
    const world = await openWorld()
    view = await mountSubmit(world.account)
    expect(view.paths()).toEqual([])
    expect(view.byTestId('submit-action')).not.toBeNull()
  })
})

describe('the confirmation’s entry record read', () => {
  let view: Mounted | undefined

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  it('shows a spinner and nothing else while the entry record read has not answered', async () => {
    const world = await openWorld()
    world.storage.get = () => new Promise<never>(() => {})
    view = await mountSubmit(world.account)
    expect(view.byTestId('submit-entry-loading')).not.toBeNull()
    expect(view.byTestId('submit-entry-failed')).toBeNull()
    expect(view.byTestId('submit-action')).toBeNull()
    expect(view.paths()).toEqual([])
  })

  it('renders failed with a retry where the entry record read fails, and the confirmation once the retry reads it', async () => {
    const world = await openWorld()
    const { get } = world.storage
    world.storage.get = async () => {
      throw new Error('storage unavailable')
    }
    view = await mountSubmit(world.account)
    expect(view.textOf('submit-entry-failed')).toContain(t('socialRecovery.wait.readFailedTitle'))
    expect(view.byTestId('submit-action')).toBeNull()
    expect(view.paths()).toEqual([])

    world.storage.get = get
    await view.press('submit-entry-retry')
    expect(view.byTestId('submit-entry-failed')).toBeNull()
    expect(view.byTestId('submit-action')).not.toBeNull()
    expect(view.paths()).toEqual([])
  })
})
