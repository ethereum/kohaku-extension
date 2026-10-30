/**
 * @jest-environment jsdom
 *
 * The editor's two writes over the save's own run on the stand-in's chain:
 * the edit loaded from the committed configuration, saved through the
 * account's batch, reading as saved only once it landed and the check agreed,
 * and then wiping the setup records, rewriting this device's opened setup
 * and ending the session; a refused send that changes nothing on this device;
 * a setup moved past the edit's start that sends nothing; the refusal of a
 * dormant setup's commit while an attempt is open, and of an attempt the
 * screen did not show, on every path to the send and again after the claim;
 * the new password sealed only where the session marks it; the recovery
 * password kept with no read where this tab's own write landed, and after a
 * followed write only where the landed backup opens with it; the removal's
 * one batch of the clear and the zero write, its check, its wipe, its stop
 * over an attempt the screen did not show, before the gas check and after the
 * claim, and an end that already stands; and a write that meets another
 * write of the editor stored by
 * another tab, which it never takes up nor releases.
 */
import type { EditWorld } from '@web/modules/social-recovery/management/editor/__fixtures__/types'
import type { AttemptRead, EditSession } from '@web/modules/social-recovery/management/editor/types'
import type { PreparedSave, SaveSteps } from '@web/modules/social-recovery/setup/arm'
import type { LastAttempt } from '@web/modules/social-recovery/shared/records'

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const fixture: typeof import('@web/modules/social-recovery/management/editor/__fixtures__/world') = require('@web/modules/social-recovery/management/editor/__fixtures__/world')
const {
  editStepsOf,
  removalStepsOf,
  removalStands,
  wipeRemovedSetup
}: typeof import('@web/modules/social-recovery/management/editor/steps') = require('@web/modules/social-recovery/management/editor/steps')
const {
  intentOfRequest,
  MANAGE_INTENT_MARKS
}: typeof import('@web/modules/social-recovery/shared/writes') = require('@web/modules/social-recovery/shared/writes')
const {
  newSendRequestId
}: typeof import('@web/modules/social-recovery/shared/client') = require('@web/modules/social-recovery/shared/client')
const {
  configurationOfDraft,
  openEditSession
}: typeof import('@web/modules/social-recovery/management/editor/load') = require('@web/modules/social-recovery/management/editor/load')
const {
  holdNewPassword,
  readNewPassword
}: typeof import('@web/modules/social-recovery/management/editor/session') = require('@web/modules/social-recovery/management/editor/session')
const {
  createArmStore,
  isSaved,
  recheckGas,
  startSave
}: typeof import('@web/modules/social-recovery/setup/arm') = require('@web/modules/social-recovery/setup/arm')
const {
  chainReadsFor
}: typeof import('@web/modules/social-recovery/setup/arm/__tests__/harness') = require('@web/modules/social-recovery/setup/arm/__tests__/harness')
const {
  readRecoveryPassword,
  recordDeploymentOf,
  setRecoveryPassword,
  SETUP_RECORD_NAMES
}: typeof import('@web/modules/social-recovery/shared/records') = require('@web/modules/social-recovery/shared/records')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const { CHAIN_ID, CONFIGURATION, KEY, PASSWORD, NEW_PASSWORD, guardianOf, SECOND_GUARDIAN } =
  fixture

/** Opens the edit over the committed setup and adds a second guardian to its one group. */
const openAndEdit = async (world: EditWorld): Promise<EditSession> => {
  const state = await world.client.setup.setupState()
  const setup = world.records.setup(CHAIN_ID, world.account)
  const session = await openEditSession({
    setup,
    session: world.session,
    state,
    configuration: CONFIGURATION,
    level: 'private'
  })
  const draft = await setup.setupDraft.read()
  if (draft.status !== 'present') {
    throw new Error('the edit loaded no draft')
  }
  await setup.writeDraftAndPath({
    ...draft.value,
    clauses: [
      {
        threshold: 1,
        credentials: [...draft.value.clauses[0].credentials, guardianOf(SECOND_GUARDIAN)]
      }
    ]
  })
  return session
}

const editSteps = async (
  world: EditWorld,
  baseline: EditSession,
  onAttempt?: (read: AttemptRead) => void,
  showsCancelLine?: () => boolean
) => {
  const draft = await world.records.setup(CHAIN_ID, world.account).setupDraft.read()
  if (draft.status !== 'present') {
    throw new Error('no draft to save')
  }
  return {
    draft: draft.value,
    steps: editStepsOf({
      ...world,
      chainId: CHAIN_ID,
      key: KEY,
      baseline,
      draft: draft.value,
      password: readRecoveryPassword(CHAIN_ID, world.account),
      newPassword: readNewPassword(CHAIN_ID, world.account),
      onAttempt,
      showsCancelLine
    })
  }
}

/** The steps of a tab that holds its own new password in memory. */
const editStepsHolding = async (
  world: EditWorld,
  baseline: EditSession,
  newPassword: string | undefined
) => {
  const draft = await world.records.setup(CHAIN_ID, world.account).setupDraft.read()
  if (draft.status !== 'present') {
    throw new Error('no draft to save')
  }
  return editStepsOf({
    ...world,
    chainId: CHAIN_ID,
    key: KEY,
    baseline,
    draft: draft.value,
    password: PASSWORD,
    newPassword
  })
}

/**
 * Lands tab A's own save, runs `between` once it landed, then has tab B check
 * and settle that write as a follower does, from the stored write.
 */
const followsLanding = async (tabA: SaveSteps, tabB: SaveSteps, between: () => void) => {
  let sent: PreparedSave | undefined
  const { prepare } = tabA
  // eslint-disable-next-line no-param-reassign
  tabA.prepare = async () => {
    sent = await prepare()
    return sent
  }
  await startSave(createArmStore(), tabA)
  if (!sent) {
    throw new Error('tab A prepared nothing')
  }
  between()
  const followed = tabB.followedSave({
    draft: sent.draft,
    prepared: sent.prepared,
    requestId: newSendRequestId(),
    claimedAt: Date.now()
  })
  expect((await tabB.confirm(followed)).landed).toBe(true)
  await tabB.wipe()
}

/** Runs `afterClaim` once the run's first claim of its write resolved. */
const onceClaimed = (steps: SaveSteps, afterClaim: () => void) => {
  const { claim } = steps
  let done = false
  // eslint-disable-next-line no-param-reassign
  steps.claim = async (...args) => {
    const claimed = await claim(...args)
    if (!done) {
      done = true
      afterClaim()
    }
    return claimed
  }
}

const storedWrite = async (world: EditWorld) =>
  (await world.records.saveInFlight(CHAIN_ID, world.account).read()).status

const opensWith = (world: EditWorld, password: string) =>
  world.client.setup.getSetup({ password }).then(
    () => true,
    () => false
  )

const removalSteps = (
  world: EditWorld,
  onAttempt?: (read: AttemptRead) => void,
  showsCancelLine?: () => boolean
) => removalStepsOf({ ...world, chainId: CHAIN_ID, key: KEY, onAttempt, showsCancelLine })

/** The world whose key holds too little for the gas check, and the funding that ends it. */
const shortAtFirst = (world: EditWorld) => {
  const reads = chainReadsFor('deposit')
  return {
    short: { ...world, reads },
    funded: () => reads.nativeBalance.mockImplementation(async () => 1_000_000_000_000_000_000n)
  }
}

/** Stores a write of the editor as another tab claims it, with no hash yet. */
const claimedElsewhere = async (world: EditWorld, mark: string): Promise<string> => {
  const requestId = `${newSendRequestId()}${mark}`
  const prepared = await world.client.setup.prepareRemoveSetup()
  const claim = await world.records.saveInFlight(CHAIN_ID, world.account).claim({
    draft: (await removalSteps(world).prepare()).draft,
    prepared,
    requestId,
    claimedAt: Date.now()
  })
  if (!claim.claimed) {
    throw new Error('another write was already stored')
  }
  return requestId
}

const setupRecordsHeld = async (world: EditWorld): Promise<number> => {
  const setup = world.records.setup(CHAIN_ID, world.account)
  const reads = await Promise.all(SETUP_RECORD_NAMES.map((name) => setup[name].read()))
  return reads.filter(({ status }) => status === 'present').length
}

describe('the save of the changes', () => {
  it('reads as saved once it landed, then wipes the records and rewrites the opened setup', async () => {
    const world = await fixture.worldOf('lands')
    setRecoveryPassword(CHAIN_ID, world.account, PASSWORD)
    const baseline = await openAndEdit(world)
    const { draft, steps } = await editSteps(world, baseline)
    const store = createArmStore()

    await startSave(store, steps)

    expect(isSaved(store.state())).toBe(true)
    const state = await world.client.setup.setupState()
    expect(state.setupNonce).toBe(baseline.setupNonce + 1n)
    expect(await setupRecordsHeld(world)).toBe(0)
    expect(await world.session.read()).toBeUndefined()
    const cache = await world.records.decryptedSetupCache(CHAIN_ID, world.account).read()
    expect(cache.status === 'present' && cache.value).toEqual({
      configuration: configurationOfDraft(draft),
      setupNonce: state.setupNonce,
      setupCommitment: state.setupCommitment,
      deployment: {
        manager: world.client.descriptor.manager,
        action: world.client.descriptor.action
      }
    })
    // The committed setup now opens with the password it was sealed under.
    expect(await world.client.setup.getSetup({ password: PASSWORD })).toEqual(
      fixture.asOpened(configurationOfDraft(draft))
    )
  })

  it('seals the backup under a new password and keeps it as the setup own', async () => {
    const world = await fixture.worldOf('lands')
    setRecoveryPassword(CHAIN_ID, world.account, PASSWORD)
    const baseline = await openAndEdit(world)
    holdNewPassword(CHAIN_ID, world.account, NEW_PASSWORD)
    const { draft, steps } = await editSteps(world, { ...baseline, password: 'changed' })

    await startSave(createArmStore(), steps)

    expect(await world.client.setup.getSetup({ password: NEW_PASSWORD })).toEqual(
      fixture.asOpened(configurationOfDraft(draft))
    )
    expect(readRecoveryPassword(CHAIN_ID, world.account)).toBe(NEW_PASSWORD)
    expect(readNewPassword(CHAIN_ID, world.account)).toBeUndefined()
  })

  it('never reads as saved where the send was refused, and keeps the edit', async () => {
    const world = await fixture.worldOf('refused')
    setRecoveryPassword(CHAIN_ID, world.account, PASSWORD)
    const baseline = await openAndEdit(world)
    const { steps } = await editSteps(world, baseline)
    const store = createArmStore()

    await startSave(store, steps)

    expect(isSaved(store.state())).toBe(false)
    expect(store.state().write.status).toBe('failedNotSent')
    expect((await world.client.setup.setupState()).setupNonce).toBe(baseline.setupNonce)
    expect(await setupRecordsHeld(world)).toBeGreaterThan(0)
    expect(await world.session.read()).toEqual(baseline)
  })

  it('sends nothing once the setup moved past the one the edit started from', async () => {
    const world = await fixture.worldOf('lands')
    setRecoveryPassword(CHAIN_ID, world.account, PASSWORD)
    const baseline = await openAndEdit(world)
    await world.chain.commitSetup(CONFIGURATION, fixture.PRIVATE, PASSWORD)
    const { steps } = await editSteps(world, baseline)
    const store = createArmStore()

    await startSave(store, steps)

    expect(store.state().stop).toBe('already-set-up')
    expect(world.port.sendAccountBatch).not.toHaveBeenCalled()
  })

  it('refuses to prepare a sealed save with no password in memory', async () => {
    const world = await fixture.worldOf('lands')
    const baseline = await openAndEdit(world)
    const { steps } = await editSteps(world, { ...baseline, password: 'kept' })
    await expect(
      editStepsOf({
        ...world,
        chainId: CHAIN_ID,
        key: KEY,
        baseline,
        draft: (await editSteps(world, baseline)).draft,
        password: undefined,
        newPassword: undefined
      }).prepare()
    ).rejects.toThrow('needs the recovery password')
    expect(intentOfRequest(steps.newRequestId())).toBe('manageEdit')
  })

  it('stamps the opened setup with the landed commit, not a later one read at the wipe', async () => {
    const world = await fixture.worldOf('lands')
    setRecoveryPassword(CHAIN_ID, world.account, PASSWORD)
    const baseline = await openAndEdit(world)
    const { draft, steps } = await editSteps(world, baseline)
    const { saveSetup } = world.records
    // Another device commits between the check after the landing and this device's wipe.
    world.records.saveSetup = async (...args) => {
      await world.chain.commitSetup(CONFIGURATION, fixture.PRIVATE, PASSWORD)
      return saveSetup(...args)
    }

    await startSave(createArmStore(), steps)

    const cache = await world.records.decryptedSetupCache(CHAIN_ID, world.account).read()
    const state = await world.client.setup.setupState()
    expect(cache.status === 'present' && cache.value.configuration).toEqual(
      configurationOfDraft(draft)
    )
    expect(cache.status === 'present' && cache.value.setupNonce).toBe(baseline.setupNonce + 1n)
    expect(state.setupNonce).toBe(baseline.setupNonce + 2n)
  })

  it('keeps the new password in memory even where a storage write of the wipe fails', async () => {
    const world = await fixture.worldOf('lands')
    setRecoveryPassword(CHAIN_ID, world.account, PASSWORD)
    const baseline = await openAndEdit(world)
    holdNewPassword(CHAIN_ID, world.account, NEW_PASSWORD)
    const { steps } = await editSteps(world, { ...baseline, password: 'changed' })
    world.records.saveSetup = async () => {
      throw new Error('storage refused the wipe')
    }
    const store = createArmStore()

    await startSave(store, steps)

    expect(isSaved(store.state())).toBe(true)
    expect(readRecoveryPassword(CHAIN_ID, world.account)).toBe(NEW_PASSWORD)
    expect(readNewPassword(CHAIN_ID, world.account)).toBeUndefined()
    expect(await world.session.read()).toBeUndefined()
  })

  it('keeps the new password it sealed under with no read, even where a read would fail', async () => {
    const world = await fixture.worldOf('lands')
    setRecoveryPassword(CHAIN_ID, world.account, PASSWORD)
    const baseline = await openAndEdit(world)
    holdNewPassword(CHAIN_ID, world.account, NEW_PASSWORD)
    const { steps } = await editSteps(world, { ...baseline, password: 'changed' })
    const { getSetup } = world.client.setup
    const failingRead = jest.fn(async () => {
      throw new Error('the backup read did not answer')
    })
    world.client.setup.getSetup = failingRead

    await startSave(createArmStore(), steps)

    expect(failingRead).not.toHaveBeenCalled()
    expect(readRecoveryPassword(CHAIN_ID, world.account)).toBe(NEW_PASSWORD)
    world.client.setup.getSetup = getSetup
    expect(await opensWith(world, NEW_PASSWORD)).toBe(true)
  })

  it('holds no stale password after it follows another tab that sealed under a new one', async () => {
    const world = await fixture.worldOf('lands')
    setRecoveryPassword(CHAIN_ID, world.account, PASSWORD)
    const baseline = await openAndEdit(world)
    const tabA = await editStepsHolding(
      world,
      { ...baseline, password: 'changed' },
      'tab A password'
    )
    // Tab B loaded its review while the session still marked the password kept.
    const tabB = await editStepsHolding(world, { ...baseline, password: 'kept' }, undefined)

    await followsLanding(tabA, tabB, () => setRecoveryPassword(CHAIN_ID, world.account, PASSWORD))

    expect(readRecoveryPassword(CHAIN_ID, world.account)).toBeUndefined()
    expect(await opensWith(world, 'tab A password')).toBe(true)
    expect(await opensWith(world, PASSWORD)).toBe(false)
  })

  it('keeps a held new password only where it opens the backup another tab landed', async () => {
    const world = await fixture.worldOf('lands')
    setRecoveryPassword(CHAIN_ID, world.account, PASSWORD)
    const baseline: EditSession = { ...(await openAndEdit(world)), password: 'changed' }
    const tabA = await editStepsHolding(world, baseline, 'tab A password')
    const tabB = await editStepsHolding(world, baseline, 'tab B password')

    await followsLanding(tabA, tabB, () =>
      expect(readRecoveryPassword(CHAIN_ID, world.account)).toBe('tab A password')
    )

    expect(readRecoveryPassword(CHAIN_ID, world.account)).toBeUndefined()
    expect(readNewPassword(CHAIN_ID, world.account)).toBeUndefined()
    expect(await opensWith(world, 'tab A password')).toBe(true)
    expect(await opensWith(world, 'tab B password')).toBe(false)
  })

  it('keeps the password it holds where it opens the backup another tab landed', async () => {
    const world = await fixture.worldOf('lands')
    setRecoveryPassword(CHAIN_ID, world.account, PASSWORD)
    const baseline = await openAndEdit(world)
    const tabA = await editStepsHolding(
      world,
      { ...baseline, password: 'changed' },
      'tab A password'
    )
    const tabB = await editStepsHolding(
      world,
      { ...baseline, password: 'changed' },
      'tab A password'
    )

    await followsLanding(tabA, tabB, () => setRecoveryPassword(CHAIN_ID, world.account, PASSWORD))

    expect(readRecoveryPassword(CHAIN_ID, world.account)).toBe('tab A password')
  })

  it('keeps no password after a followed landing whose backup read does not answer', async () => {
    const world = await fixture.worldOf('lands')
    setRecoveryPassword(CHAIN_ID, world.account, PASSWORD)
    const baseline = await openAndEdit(world)
    const tabA = await editStepsHolding(
      world,
      { ...baseline, password: 'changed' },
      'tab A password'
    )
    const tabB = await editStepsHolding(
      world,
      { ...baseline, password: 'changed' },
      'tab A password'
    )
    const { getSetup } = world.client.setup

    await followsLanding(tabA, tabB, () => {
      world.client.setup.getSetup = async () => {
        throw new Error('the backup read did not answer')
      }
    })

    expect(readRecoveryPassword(CHAIN_ID, world.account)).toBeUndefined()
    world.client.setup.getSetup = getSetup
    expect(await opensWith(world, 'tab A password')).toBe(true)
  })

  it('seals under the committed password where the session never marked a new one', async () => {
    const world = await fixture.worldOf('lands')
    setRecoveryPassword(CHAIN_ID, world.account, PASSWORD)
    const baseline = await openAndEdit(world)
    // The new password reached memory, but the session's mark was never written.
    holdNewPassword(CHAIN_ID, world.account, NEW_PASSWORD)
    const { steps } = await editSteps(world, { ...baseline, password: 'kept' })

    await startSave(createArmStore(), steps)

    expect(world.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(await opensWith(world, PASSWORD)).toBe(true)
    expect(await opensWith(world, NEW_PASSWORD)).toBe(false)
    expect(readRecoveryPassword(CHAIN_ID, world.account)).toBe(PASSWORD)
    expect(readNewPassword(CHAIN_ID, world.account)).toBeUndefined()
  })

  it('sends nothing from the deposit step over an attempt opened since, the screen not showing it', async () => {
    const world = await fixture.worldOf('lands')
    setRecoveryPassword(CHAIN_ID, world.account, PASSWORD)
    const baseline = await openAndEdit(world)
    const { short, funded } = shortAtFirst(world)
    let shown = false
    const { steps } = await editSteps(
      short,
      baseline,
      (read) => {
        shown = read.open
      },
      () => false
    )
    const store = createArmStore()

    await startSave(store, steps)
    expect(store.state().write.status).toBe('needsDeposit')
    world.chain.openAttempt()
    funded()
    await recheckGas(store, steps)

    expect(store.state().write.status).toBe('failedNotSent')
    expect(world.port.sendAccountBatch).not.toHaveBeenCalled()
    expect(shown).toBe(true)
  })

  it('sends nothing from the deposit step where the setup went dormant with an attempt open', async () => {
    const world = await fixture.worldOf('lands')
    setRecoveryPassword(CHAIN_ID, world.account, PASSWORD)
    const baseline = await openAndEdit(world)
    const { short, funded } = shortAtFirst(world)
    const { steps } = await editSteps(short, baseline, undefined, () => true)
    const store = createArmStore()

    await startSave(store, steps)
    expect(store.state().write.status).toBe('needsDeposit')
    world.chain.openAttempt()
    world.chain.setAuthorized(false)
    funded()
    await recheckGas(store, steps)

    expect(store.state().write.status).toBe('failedNotSent')
    expect(world.port.sendAccountBatch).not.toHaveBeenCalled()
  })

  it('refuses to commit a setup the account no longer authorizes while an attempt is open', async () => {
    const world = await fixture.worldOf('lands')
    setRecoveryPassword(CHAIN_ID, world.account, PASSWORD)
    const baseline = await openAndEdit(world)
    world.chain.openAttempt()
    world.chain.setAuthorized(false)
    const heard: AttemptRead[] = []
    const { steps } = await editSteps(world, baseline, (read) => heard.push(read))
    const store = createArmStore()

    await startSave(store, steps)

    expect(store.state().write.status).toBe('failedNotSent')
    expect(world.port.sendAccountBatch).not.toHaveBeenCalled()
    expect(heard).toEqual([{ open: true, dormant: true }])
  })

  it('tells the screen the attempt it read right before the send', async () => {
    const world = await fixture.worldOf('lands')
    setRecoveryPassword(CHAIN_ID, world.account, PASSWORD)
    const baseline = await openAndEdit(world)
    const heard: AttemptRead[] = []
    const { steps } = await editSteps(world, baseline, (read) => heard.push(read))
    world.chain.openAttempt()

    await startSave(createArmStore(), steps)

    expect(heard[heard.length - 1]).toEqual({ open: true, dormant: false })
    expect(world.port.sendAccountBatch).toHaveBeenCalledTimes(1)
  })

  it('sends nothing over an attempt opened right after the claim, and sends once the screen shows it', async () => {
    const world = await fixture.worldOf('lands')
    setRecoveryPassword(CHAIN_ID, world.account, PASSWORD)
    const baseline = await openAndEdit(world)
    let shown = false
    const { steps } = await editSteps(
      world,
      baseline,
      (read) => {
        shown = read.open
      },
      () => shown
    )
    onceClaimed(steps, () => world.chain.openAttempt())
    const store = createArmStore()

    await startSave(store, steps)

    expect(store.state().write.status).toBe('failedNotSent')
    expect(world.port.sendAccountBatch).not.toHaveBeenCalled()
    expect(await storedWrite(world)).toBe('absent')
    expect(shown).toBe(true)

    await startSave(store, steps)

    expect(world.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(isSaved(store.state())).toBe(true)
  })

  it('sends nothing where the setup went dormant with an attempt opened right after the claim', async () => {
    const world = await fixture.worldOf('lands')
    setRecoveryPassword(CHAIN_ID, world.account, PASSWORD)
    const baseline = await openAndEdit(world)
    const { steps } = await editSteps(world, baseline, undefined, () => true)
    onceClaimed(steps, () => {
      world.chain.openAttempt()
      world.chain.setAuthorized(false)
    })
    const store = createArmStore()

    await startSave(store, steps)

    expect(store.state().write.status).toBe('failedNotSent')
    expect(world.port.sendAccountBatch).not.toHaveBeenCalled()
    expect(await storedWrite(world)).toBe('absent')
  })

  it('sends nothing over an attempt the screen did not show, and sends once it shows it', async () => {
    const world = await fixture.worldOf('lands')
    setRecoveryPassword(CHAIN_ID, world.account, PASSWORD)
    const baseline = await openAndEdit(world)
    let shown = false
    const { steps } = await editSteps(
      world,
      baseline,
      (read) => {
        shown = read.open
      },
      () => shown
    )
    world.chain.openAttempt()
    const store = createArmStore()

    await startSave(store, steps)

    expect(store.state().write.status).toBe('failedNotSent')
    expect(world.port.sendAccountBatch).not.toHaveBeenCalled()
    expect(shown).toBe(true)

    await startSave(store, steps)

    expect(world.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(isSaved(store.state())).toBe(true)
  })
})

describe('the removal', () => {
  it('prepares the clear and the zero write of the authorization as one batch of two calls', async () => {
    const world = await fixture.worldOf('lands')
    const steps = removalSteps(world)
    const save = await steps.prepare()
    expect(save.prepared.kind).toBe('batch')
    expect(save.calls).toHaveLength(2)
    expect(intentOfRequest(steps.newRequestId())).toBe('manageRemove')
  })

  it('reads as done once the setup and the authorization are both gone, and wipes this device', async () => {
    const world = await fixture.worldOf('lands')
    setRecoveryPassword(CHAIN_ID, world.account, PASSWORD)
    await openAndEdit(world)
    await world.records.decryptedSetupCache(CHAIN_ID, world.account).write({
      configuration: CONFIGURATION,
      setupNonce: 1n
    })
    const store = createArmStore('ownerWrite')

    await startSave(store, removalSteps(world))

    expect(isSaved(store.state())).toBe(true)
    expect(removalStands(await world.client.setup.setupState())).toBe(true)
    expect(await setupRecordsHeld(world)).toBe(0)
    expect(await world.session.read()).toBeUndefined()
    expect((await world.records.decryptedSetupCache(CHAIN_ID, world.account).read()).status).toBe(
      'absent'
    )
    expect(readRecoveryPassword(CHAIN_ID, world.account)).toBeUndefined()
  })

  it('agrees only once both writes stand', async () => {
    const world = await fixture.worldOf('lands')
    const steps = removalSteps(world)
    const save = await steps.prepare()
    expect((await steps.confirm(save)).landed).toBe(false)
    world.chain.clearSetup()
    expect((await steps.confirm(save)).landed).toBe(false)
    world.chain.setAuthorized(false)
    expect((await steps.confirm(save)).landed).toBe(true)
  })

  it('sends nothing where the end already stands, and the local wipe then keeps nothing', async () => {
    const world = await fixture.worldOf('lands')
    setRecoveryPassword(CHAIN_ID, world.account, PASSWORD)
    await openAndEdit(world)
    await world.records.decryptedSetupCache(CHAIN_ID, world.account).write({
      configuration: CONFIGURATION,
      setupNonce: 1n
    })
    world.chain.clearSetup()
    world.chain.setAuthorized(false)
    const store = createArmStore('ownerWrite')

    await startSave(store, removalSteps(world))

    expect(store.state().stop).toBe('already-set-up')
    expect(isSaved(store.state())).toBe(false)
    expect(world.port.sendAccountBatch).not.toHaveBeenCalled()

    await wipeRemovedSetup({
      records: world.records,
      session: world.session,
      chainId: CHAIN_ID,
      account: world.account
    })
    expect(await setupRecordsHeld(world)).toBe(0)
    expect(await world.session.read()).toBeUndefined()
    expect((await world.records.decryptedSetupCache(CHAIN_ID, world.account).read()).status).toBe(
      'absent'
    )
    expect(readRecoveryPassword(CHAIN_ID, world.account)).toBeUndefined()
  })

  it('removes whatever stands where the attempt read fails, leaving the line as drawn', async () => {
    const world = await fixture.worldOf('lands')
    world.client.walletReads.attemptState = async () => {
      throw new Error('the attempt read failed')
    }
    const heard: AttemptRead[] = []
    const store = createArmStore('ownerWrite')

    await startSave(
      store,
      removalSteps(
        world,
        (read) => heard.push(read),
        () => false
      )
    )

    expect(isSaved(store.state())).toBe(true)
    expect(world.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(heard).toEqual([])
  })

  it('sends nothing over an attempt the screen did not show, and sends once it shows it', async () => {
    const world = await fixture.worldOf('lands')
    let shown = false
    const steps = removalSteps(
      world,
      (read) => {
        shown = read.open
      },
      () => shown
    )
    world.chain.openAttempt()
    const store = createArmStore('ownerWrite')

    await startSave(store, steps)

    expect(store.state().write.status).toBe('failedNotSent')
    expect(world.port.sendAccountBatch).not.toHaveBeenCalled()
    expect(shown).toBe(true)

    await startSave(store, steps)

    expect(world.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(isSaved(store.state())).toBe(true)
  })

  it('sends nothing from the deposit step over an attempt opened since, the screen not showing it', async () => {
    const world = await fixture.worldOf('lands')
    const { short, funded } = shortAtFirst(world)
    const steps = removalSteps(short, undefined, () => false)
    const store = createArmStore('ownerWrite')

    await startSave(store, steps)
    expect(store.state().write.status).toBe('needsDeposit')
    world.chain.openAttempt()
    funded()
    await recheckGas(store, steps)

    expect(store.state().write.status).toBe('failedNotSent')
    expect(world.port.sendAccountBatch).not.toHaveBeenCalled()
  })

  it('sends nothing over an attempt opened right after the claim, and sends once the screen shows it', async () => {
    const world = await fixture.worldOf('lands')
    let shown = false
    const steps = removalSteps(
      world,
      (read) => {
        shown = read.open
      },
      () => shown
    )
    onceClaimed(steps, () => world.chain.openAttempt())
    const store = createArmStore('ownerWrite')

    await startSave(store, steps)

    expect(store.state().write.status).toBe('failedNotSent')
    expect(world.port.sendAccountBatch).not.toHaveBeenCalled()
    expect(await storedWrite(world)).toBe('absent')
    expect(shown).toBe(true)

    await startSave(store, steps)

    expect(world.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(isSaved(store.state())).toBe(true)
  })

  it('never reads as done where the send was refused', async () => {
    const world = await fixture.worldOf('refused')
    const store = createArmStore('ownerWrite')
    await startSave(store, removalSteps(world))
    expect(isSaved(store.state())).toBe(false)
    expect((await world.client.setup.setupState()).hasSetup).toBe(true)
  })
})

describe('two tabs, one write of the editor each', () => {
  it('a removal that loses its claim to an edit another tab stored sends nothing and keeps it', async () => {
    const world = await fixture.worldOf('lands')
    const store = createArmStore('ownerWrite')
    const steps = removalSteps(world)
    // The other tab claims its edit after this tab read no write stored.
    const { claim } = steps
    let edit: string | undefined
    steps.claim = async (...args) => {
      edit = await claimedElsewhere(world, MANAGE_INTENT_MARKS.manageEdit)
      return claim(...args)
    }

    await startSave(store, steps)

    expect(store.state().write.status).toBe('failedNotSent')
    expect(world.port.sendAccountBatch).not.toHaveBeenCalled()
    const stored = await world.records.saveInFlight(CHAIN_ID, world.account).read()
    expect(stored.status === 'present' && stored.value.requestId).toBe(edit)
    expect((await world.client.setup.setupState()).hasSetup).toBe(true)
  })

  it('never follows the other write it finds stored, nor releases it', async () => {
    const world = await fixture.worldOf('lands')
    const edit = await claimedElsewhere(world, MANAGE_INTENT_MARKS.manageEdit)
    const steps = removalSteps(world)
    const store = createArmStore('ownerWrite')

    await expect(steps.readInFlight()).rejects.toThrow('belongs to another screen')
    await startSave(store, steps)
    await steps.release(edit)
    await steps.releaseUnsent(edit)

    expect(world.port.sendAccountBatch).not.toHaveBeenCalled()
    expect(store.state().write.status).toBe('failedNotSent')
    const stored = await world.records.saveInFlight(CHAIN_ID, world.account).read()
    expect(stored.status === 'present' && stored.value.requestId).toBe(edit)
  })

  it('takes up its own write stored by another tab', async () => {
    const world = await fixture.worldOf('lands')
    const own = await claimedElsewhere(world, MANAGE_INTENT_MARKS.manageRemove)
    const read = await removalSteps(world).readInFlight()
    expect(read.status === 'present' && read.value.requestId).toBe(own)
  })
})

describe("a landed write's end of a recovery countdown", () => {
  /** Stores this device's countdown of attempt 4 and has the chain answer `last` as its last attempt. */
  const withCountdown = async (world: EditWorld, last: LastAttempt) => {
    await world.records.restoreCountdown(CHAIN_ID, world.account, {
      attemptId: 4n,
      setupNonce: 1n,
      payloadHash: `0x${'aa'.repeat(32)}`,
      openedAtMs: 1_699_990_000_000,
      executableAt: 1_700_076_400,
      deployment: recordDeploymentOf(world.client.descriptor)
    })
    jest
      .spyOn(world.client.walletReads, 'attemptState')
      .mockResolvedValue({ attempt: last } as never)
  }
  const countdownOf = async (world: EditWorld) =>
    (await world.records.countdown(CHAIN_ID, world.account).read()).status

  it("ends the countdown of a consumed attempt on the save's landing", async () => {
    const world = await fixture.worldOf('lands')
    setRecoveryPassword(CHAIN_ID, world.account, PASSWORD)
    const baseline = await openAndEdit(world)
    await withCountdown(world, { attemptId: 4n, state: 'Consumed' })
    const { steps } = await editSteps(world, baseline)
    const store = createArmStore()

    await startSave(store, steps)

    expect(isSaved(store.state())).toBe(true)
    expect(await countdownOf(world)).toBe('absent')
  })

  it("ends the countdown of a consumed attempt on the removal's landing", async () => {
    const world = await fixture.worldOf('lands')
    await withCountdown(world, { attemptId: 4n, state: 'Consumed' })
    const store = createArmStore('ownerWrite')

    await startSave(store, removalSteps(world))

    expect(isSaved(store.state())).toBe(true)
    expect(await countdownOf(world)).toBe('absent')
  })

  it("keeps the countdown of a waiting attempt on the removal's landing", async () => {
    const world = await fixture.worldOf('lands')
    await withCountdown(world, { attemptId: 4n, state: 'Waiting' })
    const store = createArmStore('ownerWrite')

    await startSave(store, removalSteps(world))

    expect(isSaved(store.state())).toBe(true)
    expect(await countdownOf(world)).toBe('present')
  })
})

describe('the bar the gas check passes at', () => {
  // The default reads: a fee of 0.0006 ETH, a bar to pass of 0.00066 ETH and an amount asked of 0.0009 ETH.
  const BETWEEN = 700_000_000_000_000n
  const ASKED = 900_000_000_000_000n

  const betweenTheBars = (world: EditWorld): EditWorld => {
    const reads = chainReadsFor('enough')
    reads.nativeBalance.mockImplementation(async () => BETWEEN)
    return { ...world, reads }
  }

  const checksOf = async (steps: SaveSteps) => {
    const prepared = await steps.prepare()
    return {
      atBar: await steps.checkGas(prepared),
      atAsked: await steps.checkGas(prepared, 'asked')
    }
  }

  it('the save of the changes: enough at the bar to pass, the deposit step for the rest at the amount asked', async () => {
    const world = await fixture.worldOf('lands')
    setRecoveryPassword(CHAIN_ID, world.account, PASSWORD)
    const baseline = await openAndEdit(world)
    const { steps } = await editSteps(betweenTheBars(world), baseline)

    const { atBar, atAsked } = await checksOf(steps)

    expect(atBar.kind).toBe('enough')
    expect(atAsked.kind === 'deposit' && atAsked.step.shortfall).toBe(ASKED - BETWEEN)
  })

  it('the removal: enough at the bar to pass, the deposit step for the rest at the amount asked', async () => {
    const world = await fixture.worldOf('lands')

    const { atBar, atAsked } = await checksOf(removalSteps(betweenTheBars(world)))

    expect(atBar.kind).toBe('enough')
    expect(atAsked.kind === 'deposit' && atAsked.step.shortfall).toBe(ASKED - BETWEEN)
    expect(atAsked.kind === 'deposit' && atAsked.step.write).toBe('ownerWrite')
  })
})
