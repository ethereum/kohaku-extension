/**
 * The overview's reads. The setup state and the attempt come first; the path
 * and the logs since the commit follow from them. The path opens from this
 * device's opened setup where it is the committed one, else with the recovery
 * password held in memory, else by its privacy level: a setup kept in the
 * clear opens with none, a hidden one stays locked until the password opens
 * it. An opened setup is kept in the decrypted setup cache, and shown, only
 * where the setup state read after the opening still names the setup the
 * facts read; otherwise the facts are read again. Every read has its loading
 * state and its failed state with retry, and a read that failed or has not
 * returned never renders as an answer. An answer from a block below the last
 * one the facts accepted reads as failed with retry, so a lagging provider
 * never shows an older state; so does an answer whose setup nonce is below
 * one this device has seen for the account at the same manager and action,
 * or one of no setup from a block before the watcher's last reading that
 * found one, so a node that lags or lost its state never shows a setup as
 * gone. A stored record that cannot be read fails the facts with retry; a
 * record that is absent sets no floor. Where the last attempt executed, the
 * facts also ask whether any key this wallet's keystore holds is an
 * authority of the account, and wait for the keystore's keys to ask about; a
 * failed answer fails the facts.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  readSetupReading,
  unlockFailureOf
} from '@web/modules/social-recovery/recovery/entry/readout'
import { holdsAuthority } from '@web/modules/social-recovery/recovery/entry/running'
import type { EntryRead, UnlockState } from '@web/modules/social-recovery/recovery/entry/types'
import type { Configuration, SetupState } from '@kohaku-eth/social-recovery'
import {
  readRecoveryPassword,
  recordDeploymentOf,
  setRecoveryPassword
} from '@web/modules/social-recovery/shared/records'
import { readWatcherRecord } from '@web/modules/social-recovery/watcher'

import { COMMITMENT_DISAGREEMENT_LIMIT } from './constants'
import {
  attemptOpenOf,
  isBelowFloor,
  isCacheCurrent,
  isSameSetup,
  knownFloorOf,
  movedByOf,
  noticesOf
} from './readings'
import type {
  OverviewFactsRead,
  OverviewNotices,
  OverviewReads,
  OverviewReadsInput,
  PathStep
} from './types'

const PENDING = { status: 'pending' } as const
const IDLE: UnlockState = { status: 'idle' }
const NONE: PathStep = { kind: 'none' }

export const useOverviewReads = ({
  client,
  records,
  watcherStorage,
  chainId,
  account,
  heldKeys
}: OverviewReadsInput): OverviewReads => {
  const kit = client.status === 'ready' ? client.client : null
  const [facts, setFacts] = useState<OverviewFactsRead>(PENDING)
  const [path, setPath] = useState<PathStep>(NONE)
  const [ask, setAsk] = useState<UnlockState>(IDLE)
  const [notices, setNotices] = useState<EntryRead<OverviewNotices>>(PENDING)
  const [factsRound, setFactsRound] = useState(0)
  const [pathRound, setPathRound] = useState(0)
  const [noticesRound, setNoticesRound] = useState(0)
  // The password of an unlock whose setup event read failed, kept in memory for its retry.
  const typed = useRef<string | null>(null)
  // Each unlock answers only while the setup it was typed for is still the one read.
  const unlockRound = useRef(0)
  // The block of the last facts answer accepted for this client.
  const floor = useRef<number | undefined>(undefined)
  // The opened setups in a row whose commitment disagreed with the facts read.
  const disagreements = useRef(0)

  const setup: SetupState | null = facts.status === 'answered' ? facts.value.setup : null

  useEffect(() => {
    floor.current = undefined
    disagreements.current = 0
  }, [kit])

  useEffect(() => {
    if (client.status === 'update-the-wallet') {
      setFacts({ status: 'update-the-wallet' })
      return undefined
    }
    if (client.status === 'failed') {
      setFacts({ status: 'failed' })
      return undefined
    }
    setFacts(PENDING)
    if (!kit) {
      return undefined
    }
    let live = true
    const known = Promise.all([
      records
        .decryptedSetupCache(chainId, account)
        .read()
        .then((cached) => (cached.status === 'present' ? cached.value : undefined)),
      watcherStorage ? readWatcherRecord(watcherStorage, chainId, account) : undefined
    ]).then(([cached, watched]) => knownFloorOf(cached, watched, kit.descriptor))
    const read = async () => {
      const [state, attempt, seen] = await Promise.all([
        kit.setup.setupState(),
        kit.walletReads.attemptState(),
        known
      ])
      if (attempt.attempt.state !== 'Consumed') {
        return { state, attempt, seen, heldAuthority: false }
      }
      if (!heldKeys) {
        return null
      }
      const heldAuthority = await holdsAuthority((key) => kit.action.isAuthority(key), heldKeys)
      return { state, attempt, seen, heldAuthority }
    }
    read().then(
      (answer) => {
        if (!live || !answer) {
          return
        }
        const { state, attempt, seen, heldAuthority } = answer
        if (
          (floor.current !== undefined && state.block.number < floor.current) ||
          isBelowFloor(state, seen)
        ) {
          setFacts({ status: 'failed' })
          return
        }
        floor.current = state.block.number
        const movedBy = movedByOf(attempt, heldAuthority)
        setFacts({
          status: 'answered',
          value: {
            setup: state,
            attemptOpen: attemptOpenOf(state, attempt),
            ...(movedBy !== undefined ? { movedBy } : {})
          }
        })
      },
      () => {
        if (live) {
          setFacts({ status: 'failed' })
        }
      }
    )
    return () => {
      live = false
    }
  }, [client.status, kit, records, watcherStorage, chainId, account, heldKeys, factsRound])

  /**
   * Keeps the opened setup on this device where it is the setup the facts read,
   * its commitment at their nonce being theirs, and the setup state read now
   * still names that setup; answers whether both hold. A node behind the one
   * the facts came from can open an older setup, which this refuses; one that
   * keeps doing so throws at the limit, so the path reads as failed with retry
   * instead of reading the facts again with no end. A refused write leaves the
   * path shown.
   */
  const keep = useCallback(
    async (state: SetupState, configuration: Configuration): Promise<boolean> => {
      if (!kit) {
        return false
      }
      const committed = kit.walletReads.commitmentOf(state.setupNonce, configuration)
      if (committed.toLowerCase() !== state.setupCommitment.toLowerCase()) {
        disagreements.current += 1
        if (disagreements.current >= COMMITMENT_DISAGREEMENT_LIMIT) {
          throw new Error('The opened setup keeps disagreeing with the committed one.')
        }
        return false
      }
      if (!isSameSetup(await kit.setup.setupState(), state)) {
        return false
      }
      await records
        .decryptedSetupCache(chainId, account)
        .write({
          configuration,
          setupNonce: state.setupNonce,
          setupCommitment: state.setupCommitment,
          deployment: recordDeploymentOf(kit.descriptor)
        })
        .catch(() => undefined)
      return true
    },
    [kit, records, chainId, account]
  )

  const readFactsAgain = useCallback(() => setFactsRound((round) => round + 1), [])

  useEffect(() => {
    unlockRound.current += 1
    typed.current = null
    setAsk(IDLE)
    if (!kit || !setup || !setup.hasSetup) {
      setPath(NONE)
      return undefined
    }
    setPath({ kind: 'reading' })
    let live = true
    // Null where the setup moved after the facts read, so the facts read again.
    const run = async (): Promise<PathStep | null> => {
      const cached = await records
        .decryptedSetupCache(chainId, account)
        .read()
        .catch(() => null)
      if (cached?.status === 'present' && isCacheCurrent(cached.value, setup, kit.descriptor)) {
        return { kind: 'readable', configuration: cached.value.configuration }
      }
      const held = readRecoveryPassword(chainId, account)
      if (held !== undefined) {
        const opened = await kit.setup.getSetup({ password: held }).catch(() => null)
        if (opened) {
          return (await keep(setup, opened)) ? { kind: 'readable', configuration: opened } : null
        }
      }
      const reading = await readSetupReading(kit, setup)
      switch (reading.kind) {
        case 'readable':
          return (await keep(setup, reading.configuration))
            ? { kind: 'readable', configuration: reading.configuration }
            : null
        case 'shape-readable':
          return { kind: 'locked', level: 'shape-visible', shape: reading.shape }
        case 'sealed':
          return { kind: 'locked', level: 'private' }
        default:
          return { kind: reading.kind }
      }
    }
    run().then(
      (step) => {
        if (!live) {
          return
        }
        if (step) {
          disagreements.current = 0
          setPath(step)
        } else {
          readFactsAgain()
        }
      },
      () => {
        if (live) {
          setPath({ kind: 'read-failed' })
        }
      }
    )
    return () => {
      live = false
    }
  }, [kit, setup, records, chainId, account, keep, readFactsAgain, pathRound])

  useEffect(() => {
    if (!kit || !setup || !setup.hasSetup) {
      setNotices(PENDING)
      return undefined
    }
    setNotices(PENDING)
    let live = true
    const { events } = kit.setup
    const range = { from: setup.setupCommittedAtBlock, to: setup.block.number }
    Promise.all([
      Promise.resolve().then(() => events.fetch(events.accountFilter(), range)),
      Promise.resolve().then(() => events.fetch(events.methodFilter(), range))
    ]).then(
      ([own, methods]) => {
        if (live) {
          setNotices({ status: 'answered', value: noticesOf([...own, ...methods]) })
        }
      },
      () => {
        if (live) {
          setNotices({ status: 'failed' })
        }
      }
    )
    return () => {
      live = false
    }
  }, [kit, setup, noticesRound])

  const check = useCallback(
    (password: string) => {
      if (!kit || !setup || !setup.hasSetup) {
        return
      }
      unlockRound.current += 1
      const mine = unlockRound.current
      setAsk({ status: 'checking' })
      kit.setup.getSetup({ password }).then(
        (configuration) => {
          if (unlockRound.current !== mine) {
            return
          }
          typed.current = null
          setRecoveryPassword(chainId, account, password)
          // The password stays held, so the facts read again open the setup they name with it.
          keep(setup, configuration).then(
            (agrees) => {
              if (unlockRound.current !== mine) {
                return
              }
              setAsk(IDLE)
              if (agrees) {
                disagreements.current = 0
                setPath({ kind: 'readable', configuration })
              } else {
                readFactsAgain()
              }
            },
            () => {
              if (unlockRound.current !== mine) {
                return
              }
              setAsk(IDLE)
              setPath({ kind: 'read-failed' })
            }
          )
        },
        (error: unknown) => {
          if (unlockRound.current !== mine) {
            return
          }
          const failure = unlockFailureOf(error)
          typed.current = failure === 'event-failed' ? password : null
          if (failure === 'wrong' || failure === 'event-failed') {
            setAsk({ status: failure })
            return
          }
          setAsk(IDLE)
          setPath({ kind: failure })
        }
      )
    },
    [kit, setup, chainId, account, keep, readFactsAgain]
  )

  const unlock = useCallback(
    (password: string) => {
      if (password && ask.status === 'idle') {
        check(password)
      }
    },
    [ask.status, check]
  )

  const askAgain = useCallback(() => {
    if (ask.status !== 'checking') {
      typed.current = null
      setAsk(IDLE)
    }
  }, [ask.status])

  const retryPath = useCallback(() => {
    disagreements.current = 0
    if (ask.status === 'event-failed' && typed.current) {
      check(typed.current)
      return
    }
    setPathRound((round) => round + 1)
  }, [ask.status, check])

  const retry = useCallback(() => {
    disagreements.current = 0
    if (client.status === 'failed') {
      client.retry()
      return
    }
    readFactsAgain()
  }, [client, readFactsAgain])

  const retryNotices = useCallback(() => setNoticesRound((round) => round + 1), [])

  return { facts, path, ask, notices, retry, retryPath, retryNotices, unlock, askAgain }
}
