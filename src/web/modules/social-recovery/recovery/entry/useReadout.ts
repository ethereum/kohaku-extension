/**
 * The readout's reads and its unlock. A live session of the account sends the
 * holder to the checklist, unless this device holds no opened setup for it:
 * then the readout reads the setup, opens it, keeps it and sends the holder
 * on. Otherwise it reads the setup state, then the setup by its privacy level:
 * sealed asks the recovery password, a readable shape renders masked and asks
 * it too, a setup kept in the clear opens with none. An opened setup is kept
 * in the decrypted setup cache under the account being recovered, and the
 * password in memory under the same account. Every read has its loading state
 * and its failed state with retry; a read that failed never renders as an
 * answer, and a wrong password never renders the setup. At Public no password
 * is kept, so the cache is the only way the checklist opens the setup: the
 * readout moves on there only once the cache write succeeded, and a refused
 * write renders its failure with retry.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { checklistPathOf } from '@web/modules/social-recovery/recovery/checklist/search'
import type {
  Address,
  Configuration,
  PrivacyLevel,
  SetupState
} from '@web/modules/social-recovery/sdk-interfaces'
import { setRecoveryPassword } from '@web/modules/social-recovery/shared/records'
import type { ChainId, WalletRecords } from '@web/modules/social-recovery/shared/records'

import { continuePathOf, readSetupReading, unlockFailureOf } from './readout'
import { accountStepPathOf } from './search'
import type {
  EntryRecordRead,
  HiddenLevel,
  ReadoutEntryState,
  ReadoutOptions,
  ReadoutState,
  ReadoutStep,
  ShapeNote,
  UnlockState
} from './types'

const READING: ReadoutStep = { kind: 'reading' }
const IDLE: UnlockState = { status: 'idle' }

/** The recovery entry record of the account being recovered, with its retry. */
export const useReadoutEntry = (
  records: Pick<WalletRecords, 'recoveryEntry'>,
  chainId: ChainId,
  account: Address | null
): ReadoutEntryState => {
  const [read, setRead] = useState<EntryRecordRead>({ status: 'pending' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    setRead({ status: 'pending' })
    if (!account) {
      return undefined
    }
    let live = true
    records
      .recoveryEntry(chainId, account)
      .read()
      .then(
        (stored) => {
          if (live) {
            setRead(
              stored.status === 'present'
                ? { status: 'present', entry: stored.value }
                : { status: 'absent' }
            )
          }
        },
        () => {
          if (live) {
            setRead({ status: 'failed' })
          }
        }
      )
    return () => {
      live = false
    }
  }, [records, chainId, account, attempt])

  const retry = useCallback(() => setAttempt((count) => count + 1), [])
  return { read, retry }
}

export const useReadout = ({
  client,
  records,
  chainId,
  account,
  entry,
  navigate
}: ReadoutOptions): ReadoutState => {
  const [step, setStep] = useState<ReadoutStep>(READING)
  const [attempt, setAttempt] = useState(0)
  const [continuing, setContinuing] = useState(false)
  const [writeFailed, setWriteFailed] = useState(false)
  const kit = client.status === 'ready' ? client.client : null
  const { route, receivingAccount } = entry

  // The router hands a new navigate on every location change; a read keeps
  // running across that and navigates with the latest one.
  const go = useRef(navigate)
  go.current = navigate

  // Each run of the reads and each unlock answers only while it is the latest.
  const generation = useRef(0)
  const state = useRef<SetupState | null>(null)
  // A live session found with no opened setup: once opened, the setup goes on to the checklist.
  const resumes = useRef(false)
  // The password of an unlock whose setup event read failed, kept in memory for its retry.
  const typed = useRef<string | null>(null)
  const cacheWrite = useRef<Promise<unknown>>(Promise.resolve())
  // The opened setup a public level keeps, for a retry of its refused write.
  const kept = useRef<Configuration | null>(null)
  // Where the readout moves on to once the cache write settles.
  const target = useRef<string | null>(null)
  // The run of the reads whose unlock is being checked; a later run checks its own.
  const checking = useRef<number | null>(null)

  /** Writes the opened setup to the decrypted setup cache of the account being recovered. */
  const writeCache = useCallback(
    (configuration: Configuration): Promise<unknown> => {
      const read = state.current
      return read
        ? records.decryptedSetupCache(chainId, account).write({
            configuration,
            setupNonce: read.setupNonce,
            setupCommitment: read.setupCommitment
          })
        : Promise.resolve()
    },
    [chainId, account, records]
  )

  /**
   * Moves on to the path once the cache write settles. The effect's cleanup
   * moves the generation on a re-run and on unmount, so a write that settles
   * after either navigates nothing. A refused write at Public stops here with
   * its failure; with a password in memory the write never refuses here.
   */
  const leave = useCallback((path: string) => {
    target.current = path
    const mine = generation.current
    cacheWrite.current
      .then(
        () => {
          if (generation.current === mine) {
            go.current(path)
          }
        },
        () => {
          if (generation.current === mine) {
            setContinuing(false)
            setWriteFailed(true)
          }
        }
      )
      .catch(() => undefined)
  }, [])

  /** Keeps the opened setup on this device, then shows it or sends the holder on. */
  const opened = useCallback(
    (configuration: Configuration, level: PrivacyLevel, password: string | null) => {
      if (password !== null) {
        setRecoveryPassword(chainId, account, password)
      }
      const write = writeCache(configuration)
      // A refusal nobody awaits (Back, a new run, a blocked path) must not surface as an
      // unhandled rejection; the raw promise still carries it to the leave that awaits it.
      write.catch(() => undefined)
      // With the password in memory the checklist opens the setup where the
      // cache write failed; at Public the cache is its only way.
      cacheWrite.current = password !== null ? write.catch(() => undefined) : write
      kept.current = password !== null ? null : configuration
      if (resumes.current) {
        setStep({ kind: 'leaving' })
        leave(checklistPathOf(account))
        return
      }
      setStep({ kind: 'readable', level, configuration })
    },
    [chainId, account, writeCache, leave]
  )

  useEffect(() => {
    generation.current += 1
    const mine = generation.current
    const current = () => generation.current === mine
    resumes.current = false
    typed.current = null
    state.current = null
    checking.current = null
    kept.current = null
    target.current = null
    setContinuing(false)
    setWriteFailed(false)
    if (client.status === 'update-the-wallet') {
      setStep({ kind: 'update-the-wallet' })
      return undefined
    }
    setStep(client.status === 'failed' ? { kind: 'read-failed' } : READING)
    if (!kit) {
      return undefined
    }
    const run = async (): Promise<void> => {
      const session = await records.recoverySession(chainId, account).read()
      if (session.status === 'present' && session.value.state === 'live') {
        const cache = await records.decryptedSetupCache(chainId, account).read()
        if (!current()) {
          return
        }
        if (cache.status === 'present') {
          setStep({ kind: 'leaving' })
          go.current(checklistPathOf(account))
          return
        }
        resumes.current = true
      }
      const read = await kit.setup.setupState()
      if (!current()) {
        return
      }
      state.current = read
      if (!read.hasSetup) {
        // The setup is gone since the account step: the account step says so.
        setStep({ kind: 'leaving' })
        go.current(accountStepPathOf({ route, receivingAccount }))
        return
      }
      const reading = await readSetupReading(kit, read)
      if (!current()) {
        return
      }
      switch (reading.kind) {
        case 'readable':
          opened(reading.configuration, 'public', null)
          return
        case 'shape-readable':
          setStep({ kind: 'locked', level: 'shape-visible', shape: reading.shape, unlock: IDLE })
          return
        case 'sealed':
          setStep({ kind: 'locked', level: 'private', unlock: IDLE })
          return
        case 'unreadable':
          setStep({ kind: 'update-the-wallet' })
          return
        default:
          setStep({ kind: reading.kind })
      }
    }
    run().catch(() => {
      if (current()) {
        setStep({ kind: 'read-failed' })
      }
    })
    return () => {
      generation.current += 1
    }
  }, [client.status, kit, records, chainId, account, route, receivingAccount, attempt, opened])

  /** Opens the setup with the recovery password, at the hidden level the step shows. */
  const check = useCallback(
    (password: string, level: HiddenLevel, shape: ShapeNote | undefined) => {
      const mine = generation.current
      if (!kit || checking.current === mine) {
        return
      }
      checking.current = mine
      setStep({ kind: 'locked', level, shape, unlock: { status: 'checking' } })
      kit.setup
        .getSetup({ password })
        .then(
          (configuration) => {
            if (generation.current !== mine) {
              return
            }
            typed.current = null
            opened(configuration, level, password)
          },
          (error: unknown) => {
            if (generation.current !== mine) {
              return
            }
            const failure = unlockFailureOf(error)
            typed.current = failure === 'event-failed' ? password : null
            if (failure === 'wrong' || failure === 'event-failed') {
              setStep({ kind: 'locked', level, shape, unlock: { status: failure } })
            } else if (failure === 'unreadable') {
              setStep({ kind: 'update-the-wallet' })
            } else {
              setStep({ kind: failure })
            }
          }
        )
        .finally(() => {
          if (checking.current === mine) {
            checking.current = null
          }
        })
    },
    [kit, opened]
  )

  const unlock = useCallback(
    (password: string) => {
      if (step.kind === 'locked' && step.unlock.status === 'idle' && password) {
        check(password, step.level, step.shape)
      }
    },
    [step, check]
  )

  const retry = useCallback(() => {
    if (step.kind === 'locked' && step.unlock.status === 'event-failed' && typed.current) {
      check(typed.current, step.level, step.shape)
      return
    }
    if (client.status === 'failed') {
      client.retry()
      return
    }
    setAttempt((count) => count + 1)
  }, [step, check, client])

  const askAgain = useCallback(() => {
    if (step.kind === 'locked' && step.unlock.status !== 'checking') {
      typed.current = null
      setStep({ ...step, unlock: IDLE })
    }
  }, [step])

  const onContinue = useCallback(() => {
    if (step.kind !== 'readable' || continuing || writeFailed) {
      return
    }
    setContinuing(true)
    // With a password in memory continue waits for the cache write to settle,
    // never for it to succeed: the checklist opens the setup with the password.
    // At Public no password is kept, so continue waits for the write to succeed.
    leave(continuePathOf(route, account))
  }, [step, continuing, writeFailed, route, account, leave])

  const retryWrite = useCallback(() => {
    const configuration = kept.current
    const path = target.current
    if (!writeFailed || !configuration || !path) {
      return
    }
    setWriteFailed(false)
    setContinuing(true)
    cacheWrite.current = writeCache(configuration)
    leave(path)
  }, [writeFailed, writeCache, leave])

  return { step, retry, unlock, askAgain, onContinue, continuing, writeFailed, retryWrite }
}
