/**
 * @jest-environment jsdom
 *
 * The overview's writes over the save's steps on the stand-in's chain: the
 * end each write reads as already standing, the re-authorize refused while an
 * attempt is open, the removals prepared through the account's own door, a
 * removal's check that agrees once its end stands, and the path the cache
 * keeps after a re-authorize, under the setup its own check agreed on.
 */
import type { OverviewIntent } from '@web/modules/social-recovery/management/overview/types'
import type { SetupDraft } from '@web/modules/social-recovery/sdk-interfaces'
import type {
  ChainReads,
  ListedAccountFacts,
  ReceiptReads,
  SendPort,
  SendRequestPort
} from '@web/modules/social-recovery/shared/client'

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const harness: typeof import('@web/modules/social-recovery/management/overview/__fixtures__/harness') = require('@web/modules/social-recovery/management/overview/__fixtures__/harness')
const {
  overviewStepsOf
}: typeof import('@web/modules/social-recovery/management/overview/writeSteps') = require('@web/modules/social-recovery/management/overview/writeSteps')
const {
  REMOVAL_DRAFT
}: typeof import('@web/modules/social-recovery/management/overview/constants') = require('@web/modules/social-recovery/management/overview/constants')
const {
  isCacheCurrent,
  reauthorizeDraftOf
}: typeof import('@web/modules/social-recovery/management/overview/readings') = require('@web/modules/social-recovery/management/overview/readings')
const {
  intentOfRequest,
  requestIdOf
}: typeof import('@web/modules/social-recovery/shared/writes') = require('@web/modules/social-recovery/shared/writes')
const {
  CHAIN_IDS,
  WALLET_RECOVERY_CHAIN
}: typeof import('@web/modules/social-recovery/shared/client') = require('@web/modules/social-recovery/shared/client')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const { worldAt, ACCOUNT, CONFIGURATION } = harness
const CHAIN_ID = CHAIN_IDS[WALLET_RECOVERY_CHAIN]
const KEY = { addr: ACCOUNT, type: 'internal' as const }

const stepsOver = (
  world: Awaited<ReturnType<typeof worldAt>>,
  intent: OverviewIntent,
  draft: SetupDraft = intent === 'reauthorize'
    ? reauthorizeDraftOf(CONFIGURATION, 'public')
    : REMOVAL_DRAFT,
  onAttemptOpen: () => void = () => {}
) =>
  overviewStepsOf({
    intent,
    client: world.client,
    // The gas check, the send and the receipt waits are not reached here.
    reads: {} as ChainReads,
    receipts: {} as ReceiptReads,
    port: {} as SendPort,
    requests: {} as SendRequestPort,
    records: world.records,
    chainId: CHAIN_ID,
    account: ACCOUNT,
    facts: {} as ListedAccountFacts,
    key: KEY,
    draft,
    password: undefined,
    onAttemptOpen
  })

describe('the overview writes', () => {
  it('reads the re-authorize as standing once the setup is committed and authorized', async () => {
    const world = await worldAt('public')
    world.chain.setAuthorized(false)
    const steps = stepsOver(world, 'reauthorize')
    expect(await steps.hasSetup()).toBe(false)
    world.chain.setAuthorized(true)
    expect(await steps.hasSetup()).toBe(true)
  })

  it('refuses to prepare the re-authorize while an attempt is open, and tells its step', async () => {
    const world = await worldAt('public')
    world.chain.openAttempt()
    world.chain.setAuthorized(false)
    const onAttemptOpen = jest.fn()
    const steps = stepsOver(
      world,
      'reauthorize',
      reauthorizeDraftOf(CONFIGURATION, 'public'),
      onAttemptOpen
    )
    await expect(steps.prepare()).rejects.toThrow(
      'does not re-authorize while a recovery is in progress'
    )
    expect(onAttemptOpen).toHaveBeenCalledTimes(1)
  })

  it('tells nothing to its step where the re-authorize prepares with no attempt open', async () => {
    const world = await worldAt('public')
    world.chain.setAuthorized(false)
    const onAttemptOpen = jest.fn()
    await stepsOver(
      world,
      'reauthorize',
      reauthorizeDraftOf(CONFIGURATION, 'public'),
      onAttemptOpen
    ).prepare()
    expect(onAttemptOpen).not.toHaveBeenCalled()
  })

  it('keeps the committed path in the cache after a followed re-authorize with no draft of its own', async () => {
    const world = await worldAt('public')
    world.chain.setAuthorized(false)
    const sent = await stepsOver(world, 'reauthorize').prepare()
    const inFlight = world.records.saveInFlight(CHAIN_ID, ACCOUNT)
    await inFlight.claim({
      draft: sent.draft,
      prepared: sent.prepared,
      requestId: requestIdOf('reauthorize'),
      claimedAt: Date.now()
    })
    world.chain.setAuthorized(true)

    const followed = stepsOver(world, 'reauthorize', REMOVAL_DRAFT)
    await followed.confirm(sent)
    await followed.wipe()

    const cache = await world.records.decryptedSetupCache(CHAIN_ID, ACCOUNT).read()
    expect(cache.status === 'present' && cache.value.configuration).toEqual(CONFIGURATION)
    expect((await inFlight.read()).status).toBe('absent')
  })

  it('leaves the cache untouched where a re-authorize with no draft finds no stored write', async () => {
    const world = await worldAt('public')
    await stepsOver(world, 'reauthorize', REMOVAL_DRAFT).wipe()
    const cache = await world.records.decryptedSetupCache(CHAIN_ID, ACCOUNT).read()
    expect(cache.status).toBe('absent')
  })

  it('stamps the cache with the setup its own check agreed on where another setup was committed before the wipe', async () => {
    const world = await worldAt('public')
    world.chain.setAuthorized(false)
    const steps = stepsOver(world, 'reauthorize')
    const sent = await steps.prepare()
    world.chain.land(sent.prepared)
    const agreed = await steps.confirm(sent)
    expect(agreed.landed && agreed.isAuthorized).toBe(true)
    world.chain.commitSetup({
      level: 'public',
      configuration: { ...CONFIGURATION, wait: CONFIGURATION.wait + 1n }
    })

    await steps.wipe()

    const cache = await world.records.decryptedSetupCache(CHAIN_ID, ACCOUNT).read()
    expect(cache.status === 'present' && cache.value.setupNonce).toBe(agreed.nonce)
    const now = await world.client.setup.setupState()
    expect(now.setupNonce).not.toBe(agreed.nonce)
    expect(cache.status === 'present' && isCacheCurrent(cache.value, now)).toBe(false)
  })

  it('leaves the cache untouched where a re-authorize wipes with no check of its own', async () => {
    const world = await worldAt('public')
    await stepsOver(world, 'reauthorize').wipe()
    const cache = await world.records.decryptedSetupCache(CHAIN_ID, ACCOUNT).read()
    expect(cache.status).toBe('absent')
  })

  it('neither releases nor caches a stored write of another intent', async () => {
    const world = await worldAt('public')
    world.chain.setAuthorized(false)
    const steps = stepsOver(world, 'reauthorize', REMOVAL_DRAFT)
    const sent = await stepsOver(world, 'reauthorize').prepare()
    const inFlight = world.records.saveInFlight(CHAIN_ID, ACCOUNT)
    const otherId = requestIdOf('clear')
    await inFlight.claim({
      draft: sent.draft,
      prepared: sent.prepared,
      requestId: otherId,
      claimedAt: Date.now()
    })
    world.chain.setAuthorized(true)
    await steps.confirm(sent)

    await steps.wipe()

    const held = await inFlight.read()
    expect(held.status === 'present' && held.value.requestId).toBe(otherId)
    const cache = await world.records.decryptedSetupCache(CHAIN_ID, ACCOUNT).read()
    expect(cache.status).toBe('absent')
  })

  it('refuses to prepare a re-authorize with no path to commit', async () => {
    const world = await worldAt('public')
    world.chain.setAuthorized(false)
    await expect(stepsOver(world, 'reauthorize', REMOVAL_DRAFT).prepare()).rejects.toThrow(
      'no path to commit'
    )
  })

  it('prepares the re-authorize as the same body committed again', async () => {
    const world = await worldAt('public')
    world.chain.setAuthorized(false)
    const save = await stepsOver(world, 'reauthorize').prepare()
    expect(save.draft.clauses).toEqual(CONFIGURATION.clauses)
    expect(save.calls.length).toBeGreaterThan(0)
  })

  it('prepares the clear and names it in its request id', async () => {
    const world = await worldAt('public')
    world.chain.setAuthorized(false)
    const steps = stepsOver(world, 'clear')
    const save = await steps.prepare()
    expect(save.calls.length).toBeGreaterThan(0)
    expect(intentOfRequest(steps.newRequestId())).toBe('clear')
  })

  it('agrees with a clear only once the setup is gone', async () => {
    const world = await worldAt('public')
    world.chain.setAuthorized(false)
    const steps = stepsOver(world, 'clear')
    const save = await steps.prepare()
    expect((await steps.confirm(save)).landed).toBe(false)
    world.chain.clearSetup()
    const after = await steps.confirm(save)
    expect(after.landed).toBe(true)
    expect(after.isAuthorized).toBe(true)
    expect(await steps.hasSetup()).toBe(true)
  })

  it('reads the removal of the authorization as standing once the account no longer authorizes', async () => {
    const world = await worldAt('public')
    world.chain.clearSetup()
    world.chain.setAuthorized(true)
    const steps = stepsOver(world, 'removeAuthorization')
    expect(await steps.hasSetup()).toBe(false)
    world.chain.setAuthorized(false)
    expect(await steps.hasSetup()).toBe(true)
  })
})
