/**
 * The card's recovery password for the selected account: the one the holder
 * keeps in memory, else one a check opened here. At the hidden level with none,
 * the account's setup is read: a saved setup lets the holder type the password
 * again, checked by opening the saved backup with it; no saved setup leads back
 * to the privacy step. A setup read that fails, or a client that cannot be
 * built, still shows the ask, since the check itself says whether a setup
 * answers: a check that finds no saved backup leads back to the privacy step,
 * and a client ready after one that could not be built reads the setup once
 * more. The typed password goes to the check and, once it opens the backup,
 * to the in-memory holder; nothing else keeps it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isAddressEqual } from 'viem'

import { RESTORE_CAUSES } from '@web/modules/social-recovery/sdk-interfaces'
import type {
  Address,
  RestoreCause,
  RestoreRefusal
} from '@web/modules/social-recovery/sdk-interfaces'
import { CHAIN_IDS, WALLET_RECOVERY_CHAIN } from '@web/modules/social-recovery/shared/client'
import { useRecoveryClient } from '@web/modules/social-recovery/shared/client/useRecoveryClient'
import {
  readRecoveryPassword,
  setRecoveryPassword
} from '@web/modules/social-recovery/shared/records'

import type {
  CardLevel,
  CardPassword,
  MissingPasswordRow,
  OpenedPassword,
  RecoveryPasswordCheck,
  SetupReading
} from './types'

const chainId = CHAIN_IDS[WALLET_RECOVERY_CHAIN]

const READING: MissingPasswordRow = { kind: 'reading' }
const GONE: MissingPasswordRow = { kind: 'gone' }

const sameAccount = (a: Address | null, b: Address): boolean => !!a && isAddressEqual(a, b)

/** The restore cause a refused setup read carries, if the thrown value is a restore refusal. */
const restoreCauseOf = (error: unknown): RestoreCause | undefined => {
  if (typeof error !== 'object' || error === null || !('cause' in error)) {
    return undefined
  }
  const { cause } = error as Partial<RestoreRefusal>
  if (typeof cause !== 'object' || cause === null) {
    return undefined
  }
  return RESTORE_CAUSES.find((known) => known === cause.code)
}

export const useCardPassword = (address: Address | null, level: CardLevel | null): CardPassword => {
  const held = useMemo(
    () => (address ? readRecoveryPassword(chainId, address) : undefined),
    [address]
  )
  const [opened, setOpened] = useState<OpenedPassword | null>(null)
  const password =
    held ?? (opened && sameAccount(address, opened.address) ? opened.password : undefined)

  // The client is built only while the card has no password to show.
  const needed = !!address && level === 'hidden' && !password
  const clientState = useRecoveryClient(needed && address ? address : undefined)
  const { retry } = clientState
  const kit = clientState.status === 'ready' ? clientState.client : null
  const clientFailed = clientState.status === 'failed' || clientState.status === 'update-the-wallet'

  const [reading, setReading] = useState<SetupReading | null>(null)
  const ownReading = reading && sameAccount(address, reading.address) ? reading : null
  const readRow = ownReading ? ownReading.row : null
  // A row the failed client made is read once more when a client is ready.
  const readAgain = ownReading?.source === 'failed-client'

  useEffect(() => {
    if (!needed || !address || (readRow && !readAgain)) {
      return
    }
    if (clientFailed) {
      if (!readRow) {
        setReading({ address, row: 'ask', source: 'failed-client' })
      }
      return
    }
    if (!kit) {
      return
    }
    let live = true
    Promise.resolve()
      .then(() => kit.setup.setupState())
      .then((state) => {
        if (live) {
          setReading({ address, row: state.hasSetup ? 'ask' : 'gone', source: 'setup' })
        }
      })
      .catch(() => {
        if (live) {
          setReading({ address, row: 'ask', source: 'setup' })
        }
      })
    return () => {
      live = false
    }
  }, [needed, address, readRow, readAgain, clientFailed, kit])

  // An answer counts only for the account still selected on a mounted screen,
  // and only for the latest check since the selection last changed.
  const current = useRef(address)
  const generation = useRef(0)
  if (current.current !== address) {
    generation.current += 1
  }
  current.current = address
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const check = useCallback(
    async (typed: string): Promise<RecoveryPasswordCheck> => {
      if (!address) {
        return 'stale'
      }
      if (!kit) {
        if (clientFailed) {
          retry()
        }
        return 'unchecked'
      }
      const mine = ++generation.current
      const stillHere = () =>
        mounted.current && generation.current === mine && sameAccount(current.current, address)
      try {
        await kit.setup.getSetup({ password: typed })
      } catch (error: unknown) {
        if (!stillHere()) {
          return 'stale'
        }
        const cause = restoreCauseOf(error)
        if (cause === 'restore.no-backup') {
          setReading({ address, row: 'gone', source: 'setup' })
          return 'no-backup'
        }
        return cause === 'restore.backup-unopened' ? 'wrong' : 'unchecked'
      }
      if (!stillHere()) {
        return 'stale'
      }
      setRecoveryPassword(chainId, address, typed)
      setOpened({ address, password: typed })
      return 'opened'
    },
    [address, kit, clientFailed, retry]
  )

  const missingPassword = useMemo<MissingPasswordRow>(() => {
    if (readRow === 'gone') {
      return GONE
    }
    if (readRow === 'ask') {
      return { kind: 'ask', check }
    }
    return READING
  }, [readRow, check])

  return { password, missingPassword }
}
