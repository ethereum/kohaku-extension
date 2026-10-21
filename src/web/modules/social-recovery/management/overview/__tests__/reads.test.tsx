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
  buildRecoveryClient,
  CHAIN_IDS,
  descriptorOf,
  WALLET_RECOVERY_CHAIN
}: typeof import('@web/modules/social-recovery/shared/client') = require('@web/modules/social-recovery/shared/client')
const {
  sdkStandIn
}: typeof import('@web/modules/social-recovery/shared/client/stand-in') = require('@web/modules/social-recovery/shared/client/stand-in')
const {
  readRecoveryPassword,
  wipeRecoveryPassword
}: typeof import('@web/modules/social-recovery/shared/records') = require('@web/modules/social-recovery/shared/records')
const OverviewView: typeof import('@web/modules/social-recovery/management/overview/OverviewView').default =
  require('@web/modules/social-recovery/management/overview/OverviewView').default
const {
  useOverviewReads
}: typeof import('@web/modules/social-recovery/management/overview/useOverviewReads') = require('@web/modules/social-recovery/management/overview/useOverviewReads')
const {
  makeStorage
}: typeof import('@web/modules/social-recovery/shared/records/__fixtures__/storage') = require('@web/modules/social-recovery/shared/records/__fixtures__/storage')
const {
  updateWatcherRecord
}: typeof import('@web/modules/social-recovery/watcher') = require('@web/modules/social-recovery/watcher')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const {
  mount,
  act,
  t,
  worldAt,
  freshClientOf,
  readyOver,
  viewPropsOf,
  ReadsProbe,
  typeInto,
  ACCOUNT,
  PASSWORD,
  CONFIGURATION,
  ADDRESS_BOOK
} = harness
const CHAIN_ID = CHAIN_IDS[WALLET_RECOVERY_CHAIN]
const O = 'socialRecovery.management.overview'
// The manager and action the clients read, and a manager this build no longer reads.
const DEPLOYMENT = { manager: ADDRESS_BOOK.manager, action: ADDRESS_BOOK.action }
const RETIRED = {
  manager: '0x00000000000000000000000000000000000Dead1' as const,
  action: ADDRESS_BOOK.action
}

/** Stores the watcher's reading of an attempt opened under a setup nonce, read from a deployment. */
const watchAttemptAt = (
  storage: ReturnType<typeof makeStorage>,
  setupNonce: bigint,
  deployment: typeof DEPLOYMENT
) =>
  updateWatcherRecord(storage, CHAIN_ID, ACCOUNT, () => ({
    reading: {
      account: ACCOUNT,
      block: { number: 1000, timestamp: 1 },
      hasSetup: true,
      dormant: false,
      attempt: {
        attemptId: 1n,
        setupNonce,
        payloadHash: `0x${'11'.repeat(32)}`,
        consumableAfter: 2,
        executionDue: false
      },
      deployment
    },
    dismissed: []
  }))

/** Stores the watcher's reading of a setup with no attempt open, at a block, read from a deployment. */
const watchSetupAt = (
  storage: ReturnType<typeof makeStorage>,
  block: number,
  deployment: typeof DEPLOYMENT
) =>
  updateWatcherRecord(storage, CHAIN_ID, ACCOUNT, () => ({
    reading: {
      account: ACCOUNT,
      block: { number: block, timestamp: 1 },
      hasSetup: true,
      dormant: false,
      deployment
    },
    dismissed: []
  }))

/** A client over a fake node that holds no setup for the account and stands still at one block. */
const clearedClientAt = (block: number) => {
  sdkStandIn.reset()
  const time = Math.floor(Date.now() / 1000)
  const chain = sdkStandIn.nodeFor(descriptorOf(WALLET_RECOVERY_CHAIN, ADDRESS_BOOK), ACCOUNT, {
    firstBlock: block,
    clock: () => time
  })
  return buildRecoveryClient({
    chain: WALLET_RECOVERY_CHAIN,
    account: ACCOUNT,
    addressBook: ADDRESS_BOOK,
    provider: sdkStandIn.providerFor(chain)
  })
}

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

  // A sealed backup's open runs on the real clock: each render and press waits for the reads it starts.
  const renderOver = async (world: World, onOpen = jest.fn()) => {
    const mounted = await mount(
      <ReadsProbe
        client={readyOver(world.client)}
        records={world.records}
        chainId={CHAIN_ID}
        onOpen={onOpen}
      />
    )
    await harness.settleReads()
    return {
      ...mounted,
      press: async (id: string) => {
        await mounted.press(id)
        await harness.settleReads()
      }
    }
  }

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
    world.chain.failRead('stateOf')
    view = await renderOver(world)
    expect(view.byTestId('overview-read-failed')).not.toBeNull()
    expect(view.byTestId('overview-chip-not-set-up')).toBeNull()

    world.chain.restoreRead('stateOf')
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

  it('reads a fresh node below the setup this device opened as failed with retry, never as not set up', async () => {
    const world = await worldAt('public')
    view = await renderOver(world)
    expect(view.byTestId('overview-chip-set-up')).not.toBeNull()
    view.unmount()

    view = await renderOver({ ...world, client: await freshClientOf() })

    expect(view.byTestId('overview-read-failed')).not.toBeNull()
    expect(view.byTestId('overview-empty')).toBeNull()
    expect((await world.records.decryptedSetupCache(CHAIN_ID, ACCOUNT).read()).status).toBe(
      'present'
    )
  })

  it('reads a fresh node below the attempt the watcher read as failed with retry, never as not set up', async () => {
    const storage = makeStorage()
    const world = await worldAt('private', ACCOUNT, storage)
    await watchAttemptAt(storage, 1n, DEPLOYMENT)
    const client = await freshClientOf()

    view = await mount(
      <ReadsProbe
        client={readyOver(client)}
        records={world.records}
        watcherStorage={storage}
        chainId={CHAIN_ID}
        onOpen={jest.fn()}
      />
    )
    await harness.settleReads()

    expect(view.byTestId('overview-read-failed')).not.toBeNull()
    expect(view.byTestId('overview-empty')).toBeNull()
  })

  it('reads a fresh node as failed with retry where the stored cache cannot be read, never as not set up', async () => {
    const storage = makeStorage()
    const world = await worldAt('public', ACCOUNT, storage)
    await world.records
      .decryptedSetupCache(CHAIN_ID, ACCOUNT)
      .write({ configuration: CONFIGURATION, setupNonce: 1n, deployment: DEPLOYMENT })
    jest.spyOn(storage, 'get').mockRejectedValue(new Error('storage unavailable'))

    view = await renderOver({ ...world, client: await freshClientOf() })

    expect(view.byTestId('overview-read-failed')).not.toBeNull()
    expect(view.byTestId('overview-chip-not-set-up')).toBeNull()
    expect(view.byTestId('overview-empty')).toBeNull()
  })

  it("reads no setup from a block before the watcher's reading of one as failed with retry, and from a later block as not set up", async () => {
    const storage = makeStorage()
    const world = await worldAt('public', ACCOUNT, storage)
    await watchSetupAt(storage, 1001, DEPLOYMENT)
    const mountAt = async (block: number) => {
      const mounted = await mount(
        <ReadsProbe
          client={readyOver(await clearedClientAt(block))}
          records={world.records}
          watcherStorage={storage}
          chainId={CHAIN_ID}
          onOpen={jest.fn()}
        />
      )
      await harness.settleReads()
      return mounted
    }

    view = await mountAt(1000)
    expect(view.byTestId('overview-read-failed')).not.toBeNull()
    expect(view.byTestId('overview-chip-not-set-up')).toBeNull()
    expect(view.byTestId('overview-empty')).toBeNull()
    view.unmount()

    view = await mountAt(1002)
    expect(view.byTestId('overview-read-failed')).toBeNull()
    expect(view.byTestId('overview-empty')).not.toBeNull()
  })

  it('reads a new manager at nonce zero as not set up beside a cache of a retired manager at a higher nonce, and keeps the cache', async () => {
    const world = await worldAt('public')
    const cache = world.records.decryptedSetupCache(CHAIN_ID, ACCOUNT)
    await cache.write({ configuration: CONFIGURATION, setupNonce: 2n, deployment: RETIRED })

    view = await renderOver({ ...world, client: await freshClientOf() })

    expect(view.byTestId('overview-read-failed')).toBeNull()
    expect(view.byTestId('overview-chip-not-set-up')).not.toBeNull()
    const kept = await cache.read()
    expect(kept.status === 'present' && kept.value.setupNonce).toBe(2n)
  })

  it('reads a fresh node as not set up beside a cache an earlier build wrote with no deployment', async () => {
    const world = await worldAt('public')
    await world.records
      .decryptedSetupCache(CHAIN_ID, ACCOUNT)
      .write({ configuration: CONFIGURATION, setupNonce: 2n })

    view = await renderOver({ ...world, client: await freshClientOf() })

    expect(view.byTestId('overview-read-failed')).toBeNull()
    expect(view.byTestId('overview-chip-not-set-up')).not.toBeNull()
  })

  it('keeps a private path locked beside a cache of a retired manager at the same nonce with no commitment', async () => {
    const world = await worldAt('private')
    const { setupNonce } = await world.client.setup.setupState()
    await world.records
      .decryptedSetupCache(CHAIN_ID, ACCOUNT)
      .write({ configuration: CONFIGURATION, setupNonce, deployment: RETIRED })

    view = await renderOver(world)

    expect(view.byTestId('overview-chip-path-locked')).not.toBeNull()
    expect(view.byTestId('readout-path')).toBeNull()
  })

  it("reads a new manager at nonce zero as not set up beside the watcher's attempt on a retired manager", async () => {
    const storage = makeStorage()
    const world = await worldAt('private', ACCOUNT, storage)
    await watchAttemptAt(storage, 2n, RETIRED)
    const client = await freshClientOf()

    view = await mount(
      <ReadsProbe
        client={readyOver(client)}
        records={world.records}
        watcherStorage={storage}
        chainId={CHAIN_ID}
        onOpen={jest.fn()}
      />
    )
    await harness.settleReads()

    expect(view.byTestId('overview-read-failed')).toBeNull()
    expect(view.byTestId('overview-chip-not-set-up')).not.toBeNull()
  })

  it('keeps no opened setup under the nonce of an older facts read where a newer setup was committed before the unlock', async () => {
    const world = await worldAt('private')
    view = await renderOver(world)
    const first = await world.client.setup.setupState()
    const newer = { ...CONFIGURATION, wait: CONFIGURATION.wait + 1 }
    await harness.commitAt(world.chain, 'private', newer)

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
    const newer = { ...CONFIGURATION, wait: CONFIGURATION.wait + 1 }
    await harness.commitAt(world.chain, 'private', newer)
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
    const newer = { ...CONFIGURATION, wait: CONFIGURATION.wait + 1 }
    await harness.commitAt(world.chain, 'private', newer)
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

  it('still shows the setup and its notices for an account the action does not serve', async () => {
    const world = await worldAt('public')
    world.chain.supportsAccount = false
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

  describe('after a recovery executed', () => {
    const HELD = '0x00000000000000000000000000000000000000e1' as const
    const NEW_KEY = '0x00000000000000000000000000000000000000e2' as const
    const OTHER = '0x00000000000000000000000000000000000000e3' as const
    const NO_PRIVILEGE = `0x${'00'.repeat(32)}` as const

    const renderHolding = async (world: World, heldKeys?: readonly `0x${string}`[]) => {
      const mounted = await mount(
        <ReadsProbe
          client={readyOver(world.client)}
          records={world.records}
          chainId={CHAIN_ID}
          heldKeys={heldKeys}
          onOpen={jest.fn()}
        />
      )
      await harness.settleReads()
      return mounted
    }

    it('reads the account as no longer controlled from here once no held key signs', async () => {
      const world = await worldAt('public')
      world.chain.setAuthorities([HELD])
      world.chain.openAttempt({ handover: { newAuthority: NEW_KEY, removedAuthority: OTHER } })
      world.chain.consume()
      world.chain.setPrivilege(HELD, NO_PRIVILEGE)
      view = await renderHolding(world, [HELD])
      expect(view.textOf('overview-title')).toBe(t(`${O}.controlMoved.title`))
      expect(view.text()).toContain(t(`${O}.controlMoved.noTime`))
      expect(view.byTestId('readout-path')).not.toBeNull()
      expect(view.byTestId('overview-edit-path')).toBeNull()
      expect(view.byTestId('overview-remove-recovery')).toBeNull()
    })

    it('stays set up where the recovery handed control to a key this wallet holds', async () => {
      const world = await worldAt('public')
      world.chain.setAuthorities([HELD])
      world.chain.openAttempt({ handover: { newAuthority: NEW_KEY, removedAuthority: HELD } })
      world.chain.consume()
      view = await renderHolding(world, [HELD, NEW_KEY])
      expect(view.byTestId('overview-chip-set-up')).not.toBeNull()
      expect(view.byTestId('overview-control-moved-notice')).toBeNull()
      expect(view.byTestId('overview-edit-path')).not.toBeNull()
    })

    it('reads nothing as an answer until the wallet named its keys', async () => {
      const world = await worldAt('public')
      world.chain.openAttempt({ handover: { newAuthority: NEW_KEY, removedAuthority: HELD } })
      world.chain.consume()
      view = await mount(
        <ReadsProbe
          client={readyOver(world.client)}
          records={world.records}
          chainId={CHAIN_ID}
          onOpen={jest.fn()}
        />
      )
      await harness.settle()
      expect(view.byTestId('overview-reading')).not.toBeNull()
      expect(view.byTestId('overview-chip-set-up')).toBeNull()
      expect(view.byTestId('overview-control-moved-notice')).toBeNull()
    })
  })
})
