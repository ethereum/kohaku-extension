/**
 * The watcher's start: the extension's browser alarm, every 30 minutes while
 * the browser is open, whether the popup is open or not and whether the keystore
 * is locked or not, and one poll once the accounts have loaded. A poll needs
 * the listed accounts and the recovery chain's network record, never a key.
 *
 * The alarm's listener is registered before the background's first await,
 * so an alarm that wakes a stopped worker finds it; it runs the tick the start
 * installs, and skips an alarm that fires before the start. Every poll waits
 * for the accounts to load, within the tick's limit, and a tick whose wait
 * ran out polls nothing and leaves the next tick free. A build whose recovery
 * chain runs no deployed kit keeps no alarm and writes no record. A tick while
 * the previous one still runs is skipped, and a tick runs within its own
 * limit, its storage reads and writes included; a poll that does not finish
 * within it badges every account it watched.
 */
import type { Network } from '@ambire-common/interfaces/network'
import { browser } from '@web/constants/browserapi'
import type { Address } from '@kohaku-eth/social-recovery'
import { CHAIN_IDS, WALLET_RECOVERY_CHAIN } from '@web/modules/social-recovery/shared/client/chains'
import {
  networkOf,
  providerKeyOf
} from '@web/modules/social-recovery/shared/client/extension-provider'
import { readWithin, within } from '@web/modules/social-recovery/shared/client/limits'
import type { WatcherConnection } from '@web/modules/social-recovery/shared/client/types'
import {
  watchedDeploymentOf,
  watcherConnectionFor
} from '@web/modules/social-recovery/shared/client/watcher-reads'
import { recordDeploymentOf } from '@web/modules/social-recovery/shared/records/deployment'
import { extensionRecordStorage } from '@web/modules/social-recovery/shared/records/extensionStorage'

import {
  POLL_LIMIT_MS,
  SCAN_LIMIT_MS,
  TICK_LIMIT_MS,
  WATCH_PERIOD_MINUTES,
  WATCHER_ALARM
} from './constants'
import { messageOf, pollAccounts, watchedAccountsOf } from './poll'
import { updateWatcherRecord } from './record'
import type { RecoveryWatcher, RecoveryWatcherOptions, WatcherAlarms } from './types'

/** The network record of the chain the watcher reads, among the extension's networks. */
export const watchedNetworkOf = (networks: readonly Network[] | undefined): Network | undefined =>
  networkOf(networks, WALLET_RECOVERY_CHAIN)

// The tick of the watcher started on each alarm API, which its listener runs; none before the start.
const startedTicks = new WeakMap<WatcherAlarms, () => Promise<void>>()
const listening = new WeakSet<WatcherAlarms>()

/**
 * Registers the listener of the watcher's alarm, once per alarm API. The
 * background calls it before its first await, since an alarm that wakes a
 * stopped worker reaches only the listeners registered in that first turn.
 */
export const registerRecoveryWatcherAlarm = (
  alarms: WatcherAlarms | undefined = browser?.alarms
): void => {
  if (!alarms || listening.has(alarms)) {
    return
  }
  listening.add(alarms)
  alarms.onAlarm.addListener((alarm) => {
    const tick = startedTicks.get(alarms)
    if (alarm.name === WATCHER_ALARM && tick) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      tick()
    }
  })
}

const buildDeployment = () => {
  try {
    return watchedDeploymentOf(WALLET_RECOVERY_CHAIN)
  } catch {
    // A malformed deployment variable leaves the build with no kit to watch.
    return undefined
  }
}

export const startRecoveryWatcher = ({
  accounts,
  network,
  ready,
  onBadge,
  deployment = buildDeployment,
  alarms = browser?.alarms,
  storage = extensionRecordStorage,
  connect = watcherConnectionFor,
  now = Date.now,
  limitMs = POLL_LIMIT_MS,
  scanLimitMs = SCAN_LIMIT_MS,
  tickLimitMs = TICK_LIMIT_MS
}: RecoveryWatcherOptions): RecoveryWatcher | undefined => {
  if (!alarms) {
    return undefined
  }
  const descriptor = deployment()
  if (!descriptor) {
    // An alarm an earlier build registered outlives the worker; this build has nothing to watch.
    startedTicks.delete(alarms)
    alarms.clear(WATCHER_ALARM)
    // eslint-disable-next-line no-console
    console.info('The recovery watcher does not start: this build holds no recovery contracts')
    return undefined
  }
  const chainId = CHAIN_IDS[WALLET_RECOVERY_CHAIN]
  let connection: WatcherConnection | undefined
  let running = false
  // A stopped watcher starts no poll and leaves the badge.
  let stopped = false
  // The accounts the last poll read, which a poll that cannot read them marks failed.
  let lastKnown: Address[] = []
  let isLoaded = false
  let waitLogged = false
  const loaded = ready.then(
    () => {
      isLoaded = true
    },
    (thrown: unknown) => {
      isLoaded = true
      // eslint-disable-next-line no-console
      console.error('The recovery watcher polls without the loaded accounts', thrown)
    }
  )

  // The provider is kept across polls and built again only when the network
  // record's provider fields change.
  const connectionFor = (record: Network): WatcherConnection => {
    if (connection && connection.providerKey === providerKeyOf(record)) {
      return connection
    }
    connection?.destroy()
    connection = undefined
    connection = connect(record, descriptor)
    return connection
  }

  /**
   * Marks the last reading of each account failed by the poll that started at
   * `polledAt`; answers the number the badge counts.
   */
  const failAll = async (
    watched: readonly Address[],
    thrown: unknown,
    polledAt: number
  ): Promise<number> => {
    const failed = { at: now(), message: messageOf(thrown) }
    await Promise.all(
      watched.map((account) =>
        updateWatcherRecord(
          storage,
          chainId,
          account,
          (current) => ({ ...current, failed, dismissed: current?.dismissed ?? [] }),
          { now, polledAt }
        ).catch(() => undefined)
      )
    )
    return watched.length
  }

  /** One poll; answers the badge's count, or undefined where the badge stays as it is. */
  const poll = async (): Promise<number | undefined> => {
    if (stopped) {
      return undefined
    }
    const polledAt = now()
    let watched: Address[]
    try {
      watched = watchedAccountsOf(accounts())
    } catch (thrown) {
      // eslint-disable-next-line no-console
      console.error('The recovery watcher could not read the accounts', thrown)
      return lastKnown.length === 0 ? undefined : failAll(lastKnown, thrown, polledAt)
    }
    lastKnown = watched
    if (watched.length === 0) {
      // eslint-disable-next-line no-console
      console.info('The recovery watcher found no account to watch')
      return 0
    }
    let reads: WatcherConnection['reads']
    try {
      const record = network()
      if (!record) {
        return await failAll(
          watched,
          new Error(`The extension holds no enabled network for chain ${chainId}.`),
          polledAt
        )
      }
      reads = connectionFor(record).reads
    } catch (thrown) {
      // eslint-disable-next-line no-console
      console.error('The recovery watcher could not reach the recovery chain', thrown)
      return failAll(watched, thrown, polledAt)
    }
    return pollAccounts({
      reads,
      deployment: recordDeploymentOf(descriptor),
      accounts: watched,
      chainId,
      storage,
      now,
      polledAt,
      limitMs,
      scanLimitMs
    })
  }

  const tick = async (): Promise<void> => {
    if (!isLoaded) {
      await within(() => loaded, tickLimitMs)
      if (!isLoaded) {
        if (!waitLogged) {
          waitLogged = true
          // eslint-disable-next-line no-console
          console.warn('The recovery watcher waits for the accounts to load')
        }
        return
      }
    }
    if (running || stopped) {
      return
    }
    running = true
    try {
      const count = await readWithin(poll, tickLimitMs)
      if (count !== undefined && !stopped) {
        onBadge(count)
      }
    } catch (thrown) {
      // eslint-disable-next-line no-console
      console.error('The recovery watcher could not poll', thrown)
      // A poll that did not finish counts every account it watched as failed, with no wait on storage.
      if (lastKnown.length > 0 && !stopped) {
        onBadge(lastKnown.length)
      }
    } finally {
      running = false
    }
  }

  registerRecoveryWatcherAlarm(alarms)
  startedTicks.set(alarms, tick)
  alarms.create(WATCHER_ALARM, { periodInMinutes: WATCH_PERIOD_MINUTES })
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  tick()

  return {
    tick,
    stop: () => {
      stopped = true
      // A later watcher started on the same alarm API owns the alarm and keeps it.
      if (startedTicks.get(alarms) === tick) {
        startedTicks.delete(alarms)
        alarms.clear(WATCHER_ALARM)
      }
      connection?.destroy()
      connection = undefined
    }
  }
}
