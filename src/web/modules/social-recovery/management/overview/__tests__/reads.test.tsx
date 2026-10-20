/**
 * @jest-environment jsdom
 *
 * The overview over its own reads on a client built over the stand-in's
 * chain: the locked path's password flow, the path a public setup shows with
 * no password, the dormant reading over an open attempt, a failed setup
 * read and an answer from an older block that read as failed with retry,
 * never as not set up, an unlock that meets a newer setup and keeps only
 * the setup the chain names, and an older setup opened beside the newer
 * state, which is refused and read again, and read as failed with retry
 * where the node keeps answering it.
 */
import type {
  ReadsProbeProps,
  World
} from '@web/modules/social-recovery/management/overview/__fixtures__/types'

jest.mock('viem', () => {
  // eslint-disable-next-line global-require
  const { TextDecoder, TextEncoder } = require('util')
  Object.assign(globalThis, { TextDecoder, TextEncoder })
  return jest.requireActual('viem')
})

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const harness: typeof import('@web/modules/social-recovery/management/overview/__fixtures__/harness') = require('@web/modules/social-recovery/management/overview/__fixtures__/harness')
const {
  CHAIN_IDS,
  WALLET_RECOVERY_CHAIN
}: typeof import('@web/modules/social-recovery/shared/client') = require('@web/modules/social-recovery/shared/client')
const {
  readRecoveryPassword,
  wipeRecoveryPassword
}: typeof import('@web/modules/social-recovery/shared/records') = require('@web/modules/social-recovery/shared/records')
const {
  notServedRefusal
}: typeof import('@web/modules/social-recovery/shared/client/kit/setup-client') = require('@web/modules/social-recovery/shared/client/kit/setup-client')
const OverviewView: typeof import('@web/modules/social-recovery/management/overview/OverviewView').default =
  require('@web/modules/social-recovery/management/overview/OverviewView').default
const {
  useOverviewReads
}: typeof import('@web/modules/social-recovery/management/overview/useOverviewReads') = require('@web/modules/social-recovery/management/overview/useOverviewReads')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const {
  mount,
  act,
  t,
  worldAt,
  readyOver,
  viewPropsOf,
  ReadsProbe,
  typeInto,
  ACCOUNT,
  PASSWORD,
  CONFIGURATION
} = harness
const CHAIN_ID = CHAIN_IDS[WALLET_RECOVERY_CHAIN]
const O = 'socialRecovery.management.overview'

// The facts read's retry of the last render, which the view offers only after a failed read.
let retryFacts: () => void = () => {}

const RetryProbe = ({ client, records, chainId, onOpen }: ReadsProbeProps) => {
  const reads = useOverviewReads({ client, records, chainId, account: ACCOUNT })
  retryFacts = reads.retry
  return <OverviewView {...viewPropsOf({ reads, onOpen })} />
}

describe('the overview reads', () => {
  let view: Awaited<ReturnType<typeof mount>> | undefined

  afterEach(() => {
    view?.unmount()
    view = undefined
    wipeRecoveryPassword(CHAIN_ID, ACCOUNT)
  })

  const renderOver = async (world: World, onOpen = jest.fn()) =>
    mount(
      <ReadsProbe
        client={readyOver(world.client)}
        records={world.records}
        chainId={CHAIN_ID}
        onOpen={onOpen}
      />
    )

  it('keeps a private path locked until the right recovery password, then shows it and keeps it', async () => {
    const world = await worldAt('private')
    view = await renderOver(world)
    expect(view.byTestId('overview-chip-path-locked')).not.toBeNull()
    expect(view.byTestId('readout-path')).toBeNull()

    await view.press('overview-locked-action')
    await typeInto(view.byTestId('overview-locked-field'), 'not the password')
    await view.press('overview-locked-unlock')
    expect(view.textOf('overview-locked-wrong')).toBe(t(`${O}.locked.wrong`))
    expect(view.byTestId('readout-path')).toBeNull()
    const stillEmpty = await world.records.decryptedSetupCache(CHAIN_ID, ACCOUNT).read()
    expect(stillEmpty.status).toBe('absent')

    await typeInto(view.byTestId('overview-locked-field'), PASSWORD)
    await view.press('overview-locked-unlock')
    expect(view.byTestId('readout-path')).not.toBeNull()
    expect(view.byTestId('overview-chip-path-locked')).toBeNull()
    const kept = await world.records.decryptedSetupCache(CHAIN_ID, ACCOUNT).read()
    expect(kept.status).toBe('present')
    expect(kept.status === 'present' && kept.value.configuration.clauses).toEqual(
      CONFIGURATION.clauses
    )
    expect(readRecoveryPassword(CHAIN_ID, ACCOUNT)).toBe(PASSWORD)
  })

  it('opens the kept setup again with no password', async () => {
    const world = await worldAt('private')
    view = await renderOver(world)
    await view.press('overview-locked-action')
    await typeInto(view.byTestId('overview-locked-field'), PASSWORD)
    await view.press('overview-locked-unlock')
    view.unmount()
    wipeRecoveryPassword(CHAIN_ID, ACCOUNT)

    view = await renderOver(world)
    expect(view.byTestId('readout-path')).not.toBeNull()
    expect(view.byTestId('overview-chip-path-locked')).toBeNull()
  })

  it('shows a public path with no password', async () => {
    const world = await worldAt('public')
    view = await renderOver(world)
    expect(view.byTestId('readout-path')).not.toBeNull()
    expect(view.byTestId('overview-chip-set-up')).not.toBeNull()
  })

  it('reads the dormant setup over an open attempt with no re-authorize', async () => {
    const world = await worldAt('public')
    world.chain.openAttempt()
    world.chain.setAuthorized(false)
    view = await renderOver(world)
    expect(view.byTestId('overview-dormant')).not.toBeNull()
    expect(view.byTestId('overview-reauthorize')).toBeNull()
    expect(view.textOf('overview-dormant-refused')).toBe(t(`${O}.dormant.refused`))
    expect(view.textOf('overview-dormant-pending')).toBe(t(`${O}.dormant.pendingLine`))
  })

  it('offers the re-authorize on a dormant setup with no attempt', async () => {
    const world = await worldAt('public')
    world.chain.setAuthorized(false)
    view = await renderOver(world)
    expect(view.byTestId('overview-reauthorize')).not.toBeNull()
  })

  it('reads a failed setup read as failed with retry, never as not set up', async () => {
    const world = await worldAt('public')
    world.chain.failRead('setup.setupState')
    view = await renderOver(world)
    expect(view.byTestId('overview-read-failed')).not.toBeNull()
    expect(view.byTestId('overview-chip-not-set-up')).toBeNull()

    world.chain.restoreRead('setup.setupState')
    await view.press('overview-read-failed-retry')
    expect(view.byTestId('overview-read-failed')).toBeNull()
    expect(view.byTestId('overview-chip-set-up')).not.toBeNull()
  })

  it('reads an answer from a block below the last accepted one as failed with retry, never as not set up', async () => {
    const world = await worldAt('public')
    view = await mount(
      <RetryProbe
        client={readyOver(world.client)}
        records={world.records}
        chainId={CHAIN_ID}
        onOpen={jest.fn()}
      />
    )
    expect(view.byTestId('overview-chip-set-up')).not.toBeNull()

    const accepted = await world.client.setup.setupState()
    jest.spyOn(world.client.setup, 'setupState').mockImplementationOnce(async () => ({
      ...accepted,
      hasSetup: false,
      isAuthorized: false,
      block: { ...accepted.block, number: accepted.block.number - 1 }
    }))
    await act(async () => retryFacts())

    expect(view.byTestId('overview-read-failed')).not.toBeNull()
    expect(view.byTestId('overview-chip-not-set-up')).toBeNull()
    expect(view.byTestId('overview-empty')).toBeNull()

    await view.press('overview-read-failed-retry')
    expect(view.byTestId('overview-read-failed')).toBeNull()
    expect(view.byTestId('overview-chip-set-up')).not.toBeNull()
  })

  it('keeps no opened setup under the nonce of an older facts read where a newer setup was committed before the unlock', async () => {
    const world = await worldAt('private')
    view = await renderOver(world)
    const first = await world.client.setup.setupState()
    const newer = { ...CONFIGURATION, wait: CONFIGURATION.wait + 1n }
    world.chain.commitSetup({ level: 'private', configuration: newer, password: PASSWORD })

    await view.press('overview-locked-action')
    await typeInto(view.byTestId('overview-locked-field'), PASSWORD)
    await view.press('overview-locked-unlock')

    const now = await world.client.setup.setupState()
    expect(now.setupNonce).not.toBe(first.setupNonce)
    const kept = await world.records.decryptedSetupCache(CHAIN_ID, ACCOUNT).read()
    expect(kept.status === 'present' && kept.value.setupNonce).toBe(now.setupNonce)
    expect(kept.status === 'present' && kept.value.configuration.wait).toBe(newer.wait)
    expect(view.byTestId('readout-path')).not.toBeNull()
  })

  it('refuses an older setup opened beside the state of a newer one, keeps none of it, and reads the facts again', async () => {
    const world = await worldAt('private')
    const newer = { ...CONFIGURATION, wait: CONFIGURATION.wait + 1n }
    world.chain.commitSetup({ level: 'private', configuration: newer, password: PASSWORD })
    const attemptState = jest.spyOn(world.client.walletReads, 'attemptState')
    view = await renderOver(world)
    const factsReads = attemptState.mock.calls.length
    // A node behind the one the state reads came from opens the setup before the newer commit, once.
    const getSetup = jest
      .spyOn(world.client.setup, 'getSetup')
      .mockResolvedValueOnce({ ...CONFIGURATION })

    await view.press('overview-locked-action')
    await typeInto(view.byTestId('overview-locked-field'), PASSWORD)
    await view.press('overview-locked-unlock')

    const now = await world.client.setup.setupState()
    expect(getSetup).toHaveBeenCalledTimes(2)
    expect(attemptState.mock.calls.length).toBeGreaterThan(factsReads)
    const kept = await world.records.decryptedSetupCache(CHAIN_ID, ACCOUNT).read()
    expect(kept.status === 'present' && kept.value.setupNonce).toBe(now.setupNonce)
    expect(kept.status === 'present' && kept.value.configuration.wait).toBe(newer.wait)
    expect(view.byTestId('readout-path')).not.toBeNull()
  })

  it('reads the path as failed with retry, keeping nothing, where every opened setup is the older one', async () => {
    const world = await worldAt('private')
    const newer = { ...CONFIGURATION, wait: CONFIGURATION.wait + 1n }
    world.chain.commitSetup({ level: 'private', configuration: newer, password: PASSWORD })
    view = await renderOver(world)
    // A node that stays behind the one the state reads came from opens the older setup every time.
    const getSetup = jest
      .spyOn(world.client.setup, 'getSetup')
      .mockResolvedValue({ ...CONFIGURATION })

    await view.press('overview-locked-action')
    await typeInto(view.byTestId('overview-locked-field'), PASSWORD)
    await view.press('overview-locked-unlock')

    expect(view.byTestId('overview-path-failed')).not.toBeNull()
    expect(view.byTestId('overview-path-reading')).toBeNull()
    expect(getSetup).toHaveBeenCalledTimes(3)
    const kept = await world.records.decryptedSetupCache(CHAIN_ID, ACCOUNT).read()
    expect(kept.status).toBe('absent')
  })

  it('reads a kit that does not serve the method logs as no moved keys, and still shows the setup', async () => {
    const world = await worldAt('public')
    jest.spyOn(world.client.setup.events, 'methodFilter').mockImplementation(() => {
      throw notServedRefusal('events.methodFilter')
    })
    view = await renderOver(world)
    expect(view.byTestId('overview-chip-set-up')).not.toBeNull()
    expect(view.byTestId('readout-path')).not.toBeNull()
    expect(view.byTestId('overview-notices-failed')).toBeNull()
    expect(view.byTestId('overview-notices-reading')).toBeNull()
  })

  it('reads a method filter that fails for another reason as a failed notices read with retry', async () => {
    const world = await worldAt('public')
    const methodFilter = jest
      .spyOn(world.client.setup.events, 'methodFilter')
      .mockImplementation(() => {
        throw new Error('node down')
      })
    view = await renderOver(world)
    expect(view.byTestId('overview-notices-failed')).not.toBeNull()
    expect(view.byTestId('overview-chip-set-up')).not.toBeNull()

    methodFilter.mockRestore()
    await view.press('overview-notices-failed-retry')
    expect(view.byTestId('overview-notices-failed')).toBeNull()
  })

  it('reads an account with no setup as not set up', async () => {
    const world = await worldAt('public')
    world.chain.clearSetup()
    world.chain.setAuthorized(false)
    view = await renderOver(world)
    expect(view.byTestId('overview-empty')).not.toBeNull()
  })
})
