/**
 * The passkey row's logic: the ceremony requests it stores before it opens the
 * ceremony tab, what it reads back from them and from the tab's report, and
 * the enrollment a passed creation makes.
 *
 * A report and a stored request are read from storage, so their values are
 * checked here before the row uses them.
 */
import { isHex } from 'viem'

import type { Address, ApproverRequest } from '@web/modules/social-recovery/sdk-interfaces'
import {
  AUTHENTICATOR_PLACES,
  deviceOf,
  PASSKEY_KINDS
} from '@web/modules/social-recovery/shared/ceremony'
import type {
  EnrollValue,
  PasskeyFacts,
  Platform,
  TestAccessValue
} from '@web/modules/social-recovery/shared/ceremony'
import { sameAddress } from '@web/modules/social-recovery/shared/client'
import { NAME_MAX_LENGTH } from '@web/modules/social-recovery/shared/display'
import type { Translate } from '@web/modules/social-recovery/shared/display'
import type {
  CeremonyRequestRecord,
  ChainId,
  Enrollment
} from '@web/modules/social-recovery/shared/records'

import type { PasskeyCeremonyRequest, PasskeyMemory, RowTarget } from './types'

/** The slug the ceremony tab's route and the ceremony request carry for a passkey. */
export const PASSKEY_SLUG = 'passkey'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** A name cut to the most characters a method name renders with. */
export const clipName = (name: string): string => name.slice(0, NAME_MAX_LENGTH)

/** The name the field starts with: the device this page runs on, `this Mac passkey`. */
export const defaultPasskeyName = (platform: Platform, t: Translate): string =>
  clipName(
    t('socialRecovery.enroll.passkey.defaultName', {
      device: t(`socialRecovery.ceremony.devices.${deviceOf({ place: 'this-device' }, platform)}`)
    })
  )

/** The kind name a row reads: a passkey a phone created over the hand-off is one on your phone. */
export const kindNameKeyOf = (facts: Pick<PasskeyFacts, 'place'> | undefined): string =>
  facts?.place === 'phone'
    ? 'socialRecovery.methodNames.passkeyOnYourPhone'
    : 'socialRecovery.methodNames.passkeyOnThisDevice'

/** The creation's ceremony request: the name the holder typed, the relying party the tab's own. */
export const enrollRequestOf = (input: {
  account: Address
  chainId: ChainId
  methodAddress: Address
  userName: string
  handOff: boolean
}): CeremonyRequestRecord => ({
  call: 'enroll',
  method: PASSKEY_SLUG,
  account: input.account,
  chainId: input.chainId,
  methodAddress: input.methodAddress,
  params: { userName: input.userName, handOff: input.handOff }
})

/**
 * The access test's ceremony request, naming the credential where the row
 * knows its id, with the creation's facts and route for the row to read back.
 */
export const testRequestRecordOf = (input: {
  account: Address
  chainId: ChainId
  request: ApproverRequest
  credentialId?: string
  facts?: PasskeyFacts
  handOff: boolean
}): CeremonyRequestRecord => ({
  call: 'testAccess',
  method: PASSKEY_SLUG,
  account: input.account,
  chainId: input.chainId,
  request: input.request,
  params: {
    ...(input.credentialId ? { credentialId: input.credentialId } : {}),
    ...(input.facts ? { facts: input.facts } : {}),
    handOff: input.handOff
  }
})

const stringOf = (params: unknown, key: string): string | undefined => {
  if (!isRecord(params)) {
    return undefined
  }
  const value = params[key]
  return typeof value === 'string' && value !== '' ? value : undefined
}

const handOffOf = (params: unknown): { handOff?: boolean } =>
  isRecord(params) && typeof params.handOff === 'boolean' ? { handOff: params.handOff } : {}

/** The ceremony's facts as a report carries them, or undefined where they are malformed. */
export const factsOf = (value: unknown): PasskeyFacts | undefined => {
  if (!isRecord(value)) {
    return undefined
  }
  const { kind, backedUp, place, attachment, transports, aaguid } = value
  if (!PASSKEY_KINDS.some((k) => k === kind)) {
    return undefined
  }
  if (!AUTHENTICATOR_PLACES.some((p) => p === place)) {
    return undefined
  }
  if (typeof backedUp !== 'boolean') {
    return undefined
  }
  if (attachment !== null && attachment !== 'platform' && attachment !== 'cross-platform') {
    return undefined
  }
  if (!Array.isArray(transports) || !transports.every((t) => typeof t === 'string')) {
    return undefined
  }
  if (aaguid !== undefined && typeof aaguid !== 'string') {
    return undefined
  }
  return value as unknown as PasskeyFacts
}

/** A passed creation's value as a report carries it, or null where it names no config. */
export const enrollValueOf = (value: unknown): EnrollValue | null => {
  if (!isRecord(value) || !isHex(value.config) || value.config === '0x') {
    return null
  }
  const facts = factsOf(value.facts)
  const credentialId = typeof value.credentialId === 'string' ? value.credentialId : undefined
  return {
    config: value.config,
    ...(facts ? { facts } : {}),
    ...(credentialId ? { credentialId } : {})
  }
}

/** A passed test's value as a report carries it, or null where it carries no proof. */
export const testValueOf = (value: unknown): TestAccessValue | null => {
  if (!isRecord(value) || !isHex(value.proof)) {
    return null
  }
  const facts = factsOf(value.facts)
  return { proof: value.proof, ...(facts ? { facts } : {}) }
}

/**
 * The enrollment a passed creation makes: not tested, with the backup kind,
 * the credential id and the facts the ceremony read.
 */
export const passkeyEnrollmentOf = (
  value: EnrollValue,
  method: Address,
  label: string
): Enrollment => ({
  credential: { method, config: value.config, label: clipName(label) },
  test: 'not-tested',
  ...(value.facts ? { backup: value.facts.kind, facts: value.facts } : {}),
  ...(value.credentialId ? { credentialId: value.credentialId } : {})
})

/**
 * Whether a stored request is this row's own: the requests live under one key
 * for every account, so a request another account or chain stored, or one for
 * another passkey method, is not this row's to take.
 */
const isRequestFor = (record: CeremonyRequestRecord, target: RowTarget): boolean => {
  if (!sameAddress(record.account, target.account)) {
    return false
  }
  if (BigInt(record.chainId) !== BigInt(target.chainId)) {
    return false
  }
  if (record.call === 'enroll') {
    return sameAddress(record.methodAddress, target.methodAddress)
  }
  if (record.call === 'testAccess') {
    return sameAddress(record.request.method, target.methodAddress)
  }
  return false
}

/**
 * What a stored passkey ceremony request asked for, or null for any other
 * request and for a request another account, chain or method stored.
 */
export const passkeyRequestOf = (
  record: CeremonyRequestRecord,
  target: RowTarget
): PasskeyCeremonyRequest | null => {
  if (record.method !== PASSKEY_SLUG || !isRequestFor(record, target)) {
    return null
  }
  if (record.call === 'enroll') {
    const userName = stringOf(record.params, 'userName')
    return {
      call: 'enroll',
      ...(userName ? { userName: clipName(userName) } : {}),
      ...handOffOf(record.params)
    }
  }
  if (record.call === 'testAccess') {
    return { call: 'testAccess', request: record.request, ...handOffOf(record.params) }
  }
  return null
}

/** The row's memory once a stored request is read back: the route the holder chose. */
export const recalledMemory = (
  held: PasskeyMemory,
  asked: PasskeyCeremonyRequest
): PasskeyMemory => ({
  ...held,
  ...(asked.handOff !== undefined ? { handOff: asked.handOff } : {})
})
