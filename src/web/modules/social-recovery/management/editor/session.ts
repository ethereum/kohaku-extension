/**
 * The edit session, in the extension's local storage under
 * `socialRecovery:manageEdit:<chainId>:<account>`, stored as
 * `{ value, savedAt }` like every record of the wallet: the configuration the
 * edit started from, the setup nonce and commitment it was read under, the
 * committed privacy level, and whether a new recovery password was typed. It
 * is the baseline the review of changes reads against.
 *
 * The passwords never reach storage. The committed recovery password this tab
 * verified lives in the shared holder; a new one the holder typed lives here,
 * in memory, until the save seals the backup under it.
 */
import { isHex } from 'viem'

import { PRIVACY_LEVELS } from '@web/modules/social-recovery/shared/client'
import type { Address, Clause, Configuration } from '@kohaku-eth/social-recovery'
import { isStoredCredential, RECORDS_KEY_PREFIX } from '@web/modules/social-recovery/shared/records'
import type { ChainId } from '@web/modules/social-recovery/shared/records'

import { PASSWORD_MARKS } from './constants'
import type { EditSession, EditSessionAccessor, EditSessionStorage } from './types'

export const editSessionKeyOf = (chainId: ChainId, account: Address): string =>
  `${RECORDS_KEY_PREFIX}:manageEdit:${String(chainId)}:${account.toLowerCase()}`

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isClause = (value: unknown): value is Clause =>
  isObject(value) &&
  Number.isSafeInteger(value.threshold) &&
  Array.isArray(value.credentials) &&
  value.credentials.every(isStoredCredential)

/** A stored wait in seconds: a number, or the bigint an earlier build stored. */
const waitOf = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : undefined
  }
  if (typeof value === 'bigint' && value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(value)
  }
  return undefined
}

const isConfiguration = (value: unknown): value is Configuration =>
  isObject(value) &&
  Array.isArray(value.clauses) &&
  value.clauses.every(isClause) &&
  waitOf(value.wait) !== undefined &&
  typeof value.ignoresPause === 'boolean'

/** The session a stored value holds; a storage read is a boundary, so every field is checked. */
export const editSessionFrom = (stored: unknown): EditSession | undefined => {
  if (!isObject(stored) || !isObject(stored.value)) {
    return undefined
  }
  const { configuration, setupNonce, setupCommitment, level, password } = stored.value
  const wait = isObject(configuration) ? waitOf(configuration.wait) : undefined
  if (
    wait === undefined ||
    !isConfiguration(configuration) ||
    typeof setupNonce !== 'bigint' ||
    !isHex(setupCommitment) ||
    !PRIVACY_LEVELS.some((known) => known === level) ||
    !PASSWORD_MARKS.some((known) => known === password)
  ) {
    return undefined
  }
  const session = stored.value as unknown as EditSession
  return { ...session, configuration: { ...configuration, wait } }
}

export const editSessionOf = (
  storage: EditSessionStorage,
  chainId: ChainId,
  account: Address,
  now: () => number = Date.now
): EditSessionAccessor => {
  const key = editSessionKeyOf(chainId, account)
  return {
    read: async () => editSessionFrom(await storage.get(key, undefined)),
    write: async (session) => {
      await storage.set(key, { value: session, savedAt: now() })
    },
    wipe: async () => {
      await storage.remove(key)
    }
  }
}

const holderKey = (chainId: ChainId, account: Address): string =>
  `${String(chainId)}:${account.toLowerCase()}`

const newPasswords = new Map<string, string>()

/** Keeps the new recovery password the holder typed, in this tab's memory alone. */
export const holdNewPassword = (chainId: ChainId, account: Address, password: string): void => {
  newPasswords.set(holderKey(chainId, account), password)
}

export const readNewPassword = (chainId: ChainId, account: Address): string | undefined =>
  newPasswords.get(holderKey(chainId, account))

export const dropNewPassword = (chainId: ChainId, account: Address): void => {
  newPasswords.delete(holderKey(chainId, account))
}
