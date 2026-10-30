import type { Account } from '@ambire-common/interfaces/account'
import type { Network } from '@ambire-common/interfaces/network'
import { providerKeyOf } from '@web/modules/social-recovery/shared/client/extension-provider'
import type { DeploymentDescriptor } from '@kohaku-eth/social-recovery'
import {
  readWatcherRecord,
  registerRecoveryWatcherAlarm,
  startRecoveryWatcher,
  WATCHER_ALARM
} from '@web/modules/social-recovery/watcher'

import {
  ACCOUNT,
  BASIC_ACCOUNT,
  DEPLOYMENT as SCRIPTED_DEPLOYMENT,
  fakeAlarms,
  listed,
  memoryStorage,
  OTHER_ACCOUNT,
  scriptedChain,
  SEPOLIA,
  settle,
  stateWith
} from '@web/modules/social-recovery/watcher/__fixtures__/harness'

const NETWORK = {
  chainId: BigInt(SEPOLIA),
  rpcUrls: ['https://sepolia.example'],
  selectedRpcUrl: 'https://sepolia.example'
} as unknown as Network

const DEPLOYMENT = { deployedAt: 0, ...SCRIPTED_DEPLOYMENT } as DeploymentDescriptor

const setUp = ({
  accounts = (): readonly Account[] => [listed(ACCOUNT)],
  deployed = true,
  networked = true,
  ready = Promise.resolve() as Promise<unknown>,
  storage = memoryStorage(),
  connectThrows = false,
  tickLimitMs = 2_000,
  now = (): number => 1_000,
  fake = fakeAlarms()
} = {}) => {
  const deployment = deployed ? DEPLOYMENT : undefined
  const network = networked ? NETWORK : undefined
  const chain = scriptedChain()
  ;[ACCOUNT, OTHER_ACCOUNT, BASIC_ACCOUNT].forEach((account) => {
    chain.deploy(account)
    chain.setState(account, stateWith())
  })
  const { alarms, fire } = fake
  const onBadge = jest.fn()
  const destroy = jest.fn()
  const connect = jest.fn((record: Network) => {
    if (connectThrows) {
      throw new Error('provider refused')
    }
    return { reads: chain.reads, providerKey: providerKeyOf(record), destroy }
  })
  const watcher = startRecoveryWatcher({
    accounts,
    network: () => network,
    ready,
    onBadge,
    deployment: () => deployment,
    alarms,
    storage,
    connect,
    now,
    limitMs: 1_000,
    scanLimitMs: 1_000,
    tickLimitMs
  })
  return { chain, storage, alarms, fire, onBadge, connect, destroy, watcher }
}

describe('the watcher', () => {
  it('registers an alarm of thirty minutes and polls once at start', async () => {
    const { alarms, chain, onBadge } = setUp()
    await settle()

    expect(alarms.create).toHaveBeenCalledTimes(1)
    expect(alarms.create).toHaveBeenCalledWith(WATCHER_ALARM, { periodInMinutes: 30 })
    expect(chain.reads.latestBlock).toHaveBeenCalledTimes(1)
    expect(onBadge).toHaveBeenCalledWith(0)
  })

  it('polls on its own alarm and on no other', async () => {
    const { chain, fire } = setUp()
    await settle()

    fire('ALARMS_AUTO_LOCK')
    await settle()
    expect(chain.reads.latestBlock).toHaveBeenCalledTimes(1)

    fire(WATCHER_ALARM)
    await settle()
    expect(chain.reads.latestBlock).toHaveBeenCalledTimes(2)
  })

  it('starts no alarm and writes no record in a build with no deployed kit', async () => {
    const { alarms, storage, watcher } = setUp({ deployed: false })
    await settle()

    expect(watcher).toBeUndefined()
    expect(alarms.create).not.toHaveBeenCalled()
    expect(storage.entries.size).toBe(0)
  })

  it('skips the basic accounts and writes one record per smart account', async () => {
    const { chain, storage } = setUp({
      accounts: () => [listed(ACCOUNT), listed(BASIC_ACCOUNT, false), listed(OTHER_ACCOUNT)]
    })
    await settle()

    expect(chain.reads.stateOf.mock.calls.map(([account]) => account)).toEqual([
      ACCOUNT,
      OTHER_ACCOUNT
    ])
    expect(storage.entries.size).toBe(2)
    expect(await readWatcherRecord(storage, SEPOLIA, BASIC_ACCOUNT)).toBeUndefined()
  })

  it('skips a tick while the previous poll runs', async () => {
    const { chain, fire, watcher } = setUp()
    await settle()
    let answer: (() => void) | undefined
    chain.reads.latestBlock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = () => resolve({ ...chain.head })
        })
    )

    const running = watcher?.tick()
    await settle()
    fire(WATCHER_ALARM)
    await settle()
    expect(chain.reads.latestBlock).toHaveBeenCalledTimes(2)

    answer?.()
    await running
    fire(WATCHER_ALARM)
    await settle()
    expect(chain.reads.latestBlock).toHaveBeenCalledTimes(3)
  })

  it('marks every watched account failed and badges it where the recovery chain has no network', async () => {
    const { onBadge, storage } = setUp({ networked: false })
    await settle()

    expect(onBadge).toHaveBeenCalledWith(1)
    expect((await readWatcherRecord(storage, SEPOLIA, ACCOUNT))?.failed?.message).toMatch(
      /no enabled network for chain 11155111/
    )
  })

  it('keeps one provider while the network record keeps its provider fields', async () => {
    const { connect, destroy, watcher } = setUp()
    await settle()
    await watcher?.tick()

    expect(connect).toHaveBeenCalledTimes(1)
    watcher?.stop()
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('builds no provider, writes no record and leaves the badge where it stops while the accounts load', async () => {
    let load: (() => void) | undefined
    const ready = new Promise<void>((resolve) => {
      load = resolve
    })
    const { connect, onBadge, storage, watcher } = setUp({ ready })

    watcher?.stop()
    load?.()
    await settle()

    expect(connect).not.toHaveBeenCalled()
    expect(storage.entries.size).toBe(0)
    expect(onBadge).not.toHaveBeenCalled()
  })

  it('leaves the alarm of a later watcher on the same alarm API running where the first one stops', async () => {
    const fake = fakeAlarms()
    const first = setUp({ fake })
    await settle()
    const second = setUp({ fake })
    await settle()

    first.watcher?.stop()
    expect(fake.alarms.clear).not.toHaveBeenCalled()

    fake.fire(WATCHER_ALARM)
    await settle()
    expect(first.chain.reads.latestBlock).toHaveBeenCalledTimes(1)
    expect(second.chain.reads.latestBlock).toHaveBeenCalledTimes(2)

    second.watcher?.stop()
    expect(fake.alarms.clear).toHaveBeenCalledWith(WATCHER_ALARM)
  })

  it('clears an alarm an earlier build registered where this build has no deployed kit', async () => {
    const { alarms } = setUp({ deployed: false })

    expect(alarms.clear).toHaveBeenCalledWith(WATCHER_ALARM)
    expect(alarms.onAlarm.addListener).not.toHaveBeenCalled()
  })

  it('listens at once and polls only once the accounts have loaded', async () => {
    let load: (() => void) | undefined
    let loadedAccounts: readonly Account[] = []
    const ready = new Promise<void>((resolve) => {
      load = resolve
    })
    const { alarms, chain, fire, onBadge, storage } = setUp({
      accounts: () => loadedAccounts,
      ready
    })

    expect(alarms.onAlarm.addListener).toHaveBeenCalledTimes(1)
    fire(WATCHER_ALARM)
    await settle()
    expect(chain.reads.latestBlock).not.toHaveBeenCalled()
    expect(onBadge).not.toHaveBeenCalled()

    loadedAccounts = [listed(ACCOUNT)]
    load?.()
    await settle()
    expect(chain.reads.latestBlock).toHaveBeenCalledTimes(1)
    expect(onBadge).toHaveBeenCalledWith(0)
    expect((await readWatcherRecord(storage, SEPOLIA, ACCOUNT))?.reading?.account).toBe(ACCOUNT)
  })

  it('polls once the accounts have loaded, even where the load failed', async () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const { chain, onBadge } = setUp({ ready: Promise.reject(new Error('load failed')) })
    await settle()

    expect(chain.reads.latestBlock).toHaveBeenCalledTimes(1)
    expect(onBadge).toHaveBeenCalledWith(0)
    errors.mockRestore()
  })

  it('watches an account listed twice once', async () => {
    const { chain, storage } = setUp({
      accounts: () => [listed(ACCOUNT), listed(ACCOUNT.toLowerCase() as typeof ACCOUNT)]
    })
    await settle()

    expect(chain.reads.stateOf).toHaveBeenCalledTimes(1)
    expect(storage.entries.size).toBe(1)
  })

  it('skips a listed account whose address does not parse', async () => {
    const { chain, onBadge } = setUp({
      accounts: () => [listed('0xnot-an-address' as typeof ACCOUNT), listed(ACCOUNT)]
    })
    await settle()

    expect(chain.reads.stateOf.mock.calls.map(([account]) => account)).toEqual([ACCOUNT])
    expect(onBadge).toHaveBeenCalledWith(0)
  })

  it('marks every watched account failed where the provider cannot be built', async () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const { onBadge, storage } = setUp({ connectThrows: true })
    await settle()

    expect(onBadge).toHaveBeenCalledWith(1)
    expect((await readWatcherRecord(storage, SEPOLIA, ACCOUNT))?.failed?.message).toBe(
      'provider refused'
    )
    expect(errors).toHaveBeenCalled()
    errors.mockRestore()
  })

  it('writes nothing and leaves the badge where the accounts cannot be read and none is known', async () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const { onBadge, storage } = setUp({
      accounts: () => {
        throw new Error('accounts unavailable')
      }
    })
    await settle()

    expect(onBadge).not.toHaveBeenCalled()
    expect(storage.entries.size).toBe(0)
    expect(errors).toHaveBeenCalled()
    errors.mockRestore()
  })

  it('marks the accounts last read failed where the accounts cannot be read again', async () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    let readable = true
    const { onBadge, storage, watcher } = setUp({
      accounts: () => {
        if (!readable) {
          throw new Error('accounts unavailable')
        }
        return [listed(ACCOUNT)]
      }
    })
    await settle()
    expect(onBadge).toHaveBeenLastCalledWith(0)

    readable = false
    await watcher?.tick()
    expect(onBadge).toHaveBeenLastCalledWith(1)
    const record = await readWatcherRecord(storage, SEPOLIA, ACCOUNT)
    expect(record?.failed?.message).toBe('accounts unavailable')
    expect(record?.reading?.account).toBe(ACCOUNT)
    errors.mockRestore()
  })

  it('bounds a tick whose storage never answers, badges its account as failed and runs the next tick', async () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const storage = memoryStorage()
    const hang = jest.fn(
      () =>
        new Promise<never>(() => {
          // never answers
        })
    )
    const { get } = storage
    storage.get = hang as unknown as typeof storage.get
    const { chain, onBadge, watcher } = setUp({ storage, tickLimitMs: 30 })
    await new Promise((resolve) => {
      setTimeout(resolve, 60)
    })

    expect(onBadge).toHaveBeenCalledTimes(1)
    expect(onBadge).toHaveBeenCalledWith(1)
    expect(errors).toHaveBeenCalledWith('The recovery watcher could not poll', expect.any(Error))

    storage.get = get
    await watcher?.tick()
    expect(chain.reads.latestBlock).toHaveBeenCalledTimes(1)
    expect(onBadge).toHaveBeenCalledWith(0)
    errors.mockRestore()
  })

  it('leaves the badge where a tick fails before it knows any account', async () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    let clockReadable = false
    const { onBadge, watcher } = setUp({
      now: () => {
        if (!clockReadable) {
          throw new Error('clock unavailable')
        }
        return 1_000
      }
    })
    await new Promise((resolve) => {
      setTimeout(resolve, 20)
    })

    expect(onBadge).not.toHaveBeenCalled()
    expect(errors).toHaveBeenCalledWith('The recovery watcher could not poll', expect.any(Error))

    clockReadable = true
    await watcher?.tick()
    expect(onBadge).toHaveBeenCalledWith(0)
    errors.mockRestore()
  })

  it('skips an alarm that fires after the registration and before the start, then polls on it once started', async () => {
    const fake = fakeAlarms()
    registerRecoveryWatcherAlarm(fake.alarms)

    expect(() => fake.fire(WATCHER_ALARM)).not.toThrow()
    await settle()

    const { chain, fire } = setUp({ fake })
    await settle()
    expect(fake.alarms.onAlarm.addListener).toHaveBeenCalledTimes(1)
    expect(chain.reads.latestBlock).toHaveBeenCalledTimes(1)

    fire(WATCHER_ALARM)
    await settle()
    expect(chain.reads.latestBlock).toHaveBeenCalledTimes(2)
  })

  it('leaves later ticks free while the accounts never load, and polls once they do', async () => {
    const warnings = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    let load: (() => void) | undefined
    const ready = new Promise<void>((resolve) => {
      load = resolve
    })
    const { chain, fire, onBadge, watcher } = setUp({ ready, tickLimitMs: 20 })
    const wait = () =>
      new Promise((resolve) => {
        setTimeout(resolve, 40)
      })
    await wait()
    fire(WATCHER_ALARM)
    await wait()
    expect(chain.reads.latestBlock).not.toHaveBeenCalled()
    expect(warnings).toHaveBeenCalledTimes(1)

    load?.()
    await watcher?.tick()
    expect(chain.reads.latestBlock).toHaveBeenCalledTimes(1)
    expect(onBadge).toHaveBeenCalledWith(0)
    warnings.mockRestore()
  })
})
