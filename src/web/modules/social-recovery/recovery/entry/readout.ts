/**
 * The readout's pure parts: the account its search names, where continue
 * leads, the setup read before the recovery password, the reading of a
 * refused restore, and the path a setup draws, masked or with its values.
 *
 * No client member answers the setup's privacy level before the recovery
 * password, so the setup read here composes it from the members that exist:
 * a restore with no password opens only a backup kept in the clear, and the
 * setup event's public note carries the shape of a shape-visible setup or the
 * whole configuration of a public one. A configuration read from the note is
 * checked against the commitment before it renders. A failed read of the
 * setup event fails the whole read; it never reads as sealed.
 */
import { decodeAbiParameters, hexToString, isAddress, isHex } from 'viem'

import { WEB_ROUTES } from '@common/modules/router/constants/common'
import { checklistPathOf } from '@web/modules/social-recovery/recovery/checklist/search'
import {
  RESTORE_CAUSE_CODES,
  REQUEST_WINDOW_SECONDS,
  sameAddress
} from '@web/modules/social-recovery/shared/client'
import type {
  Address,
  Clause,
  Configuration,
  Credential,
  Hex,
  KitRefusalError,
  SetupState
} from '@kohaku-eth/social-recovery'
import { renderFullAddress, renderHiddenValue } from '@web/modules/social-recovery/shared/display'
import type { Translate } from '@web/modules/social-recovery/shared/display'
import { isStoredAddress } from '@web/modules/social-recovery/shared/records'
import type { RecoveryRoute } from '@web/modules/social-recovery/shared/records'
import {
  getRuleLines,
  renderRuleLines,
  RULE_LINE_KEYS
} from '@web/modules/social-recovery/shared/rule-lines'
import { kindOfMethodIn } from '@web/modules/social-recovery/setup/privacy/exposure'
import {
  guardianAddressOf,
  kindNameOf,
  renderWait
} from '@web/modules/social-recovery/setup/review/lead'

import { ENTRY_SEARCH_KEYS } from './constants'
import type {
  ReadoutBlock,
  ReadoutClause,
  ReadoutKitClient,
  ReadoutPath,
  ReadoutRow,
  ReadoutRowContext,
  RestoreRefusalReading,
  SetupReading,
  ShapeNote,
  UnlockFailure
} from './types'

/** The readout's stage on the logged-in route. */
export const READOUT_STAGE = 3

/** How long the request lasts from the moment the checklist opens, in hours. */
export const REQUEST_HOURS = REQUEST_WINDOW_SECONDS / 3600

/** The password a restore takes to open a backup kept in the clear, which asks for none. */
const NO_PASSWORD = ''

/**
 * The rule lines the readout leaves out: the offers to add a method, which
 * only the editor can act on, and the warning about losing the key, which the
 * recoverer already lost.
 */
const LINES_LEFT_OUT: readonly string[] = [
  RULE_LINE_KEYS.secondMethodOffer,
  RULE_LINE_KEYS.secondMethodOfferAny,
  RULE_LINE_KEYS.singleMethod
]

const METHOD_NOUN = 'socialRecovery.display.nouns.method'
const SMART_ACCOUNT_LINE = 'socialRecovery.disclosures.smartAccount'
const ORIGIN_MISMATCH_LINE = 'socialRecovery.ceremony.relyingPartyMismatch'

// ---------------------------------------------------------------------------
// The search and the paths
// ---------------------------------------------------------------------------

/** The account the readout's search names, or null where it names none or a malformed one. */
export const readoutAccountOf = (search: string): Address | null => {
  const account = new URLSearchParams(search).get(ENTRY_SEARCH_KEYS.account)
  return account !== null && isAddress(account, { strict: false }) ? account : null
}

/** Where continue leads: the gas step on the fresh install's route, the checklist on the logged-in one. */
export const continuePathOf = (route: RecoveryRoute, account: Address): string => {
  if (route === 'logged-in') {
    return checklistPathOf(account)
  }
  const query = new URLSearchParams()
  query.set(ENTRY_SEARCH_KEYS.account, account)
  return `/${WEB_ROUTES.socialRecoveryFastTrackGas}?${query.toString()}`
}

// ---------------------------------------------------------------------------
// The thrown values a read answers
// ---------------------------------------------------------------------------

/** The restore cause a thrown value carries, if it is a restore refusal. */
export const restoreRefusalOf = (error: unknown): RestoreRefusalReading | null => {
  if (typeof error !== 'object' || error === null || !('restoreCause' in error)) {
    return null
  }
  const { restoreCause: cause } = error as Partial<KitRefusalError>
  if (typeof cause !== 'object' || cause === null) {
    return null
  }
  const known = RESTORE_CAUSE_CODES.find((restore) => restore === cause.code)
  return known ? { cause: known } : null
}

/**
 * Why a restore with the recovery password failed. A backup the password does
 * not open is a wrong password, a damaged backup too, since the restore
 * refuses both alike; a failure that is no refusal is a failed read
 * of the setup event, which the restore makes before it can judge the password.
 */
export const unlockFailureOf = (error: unknown): UnlockFailure => {
  const refusal = restoreRefusalOf(error)
  if (!refusal) {
    return 'event-failed'
  }
  if (refusal.cause === 'restore.no-backup') {
    return 'no-details'
  }
  if (refusal.cause === 'restore.commitment-mismatch') {
    return 'mismatch'
  }
  return 'wrong'
}

// ---------------------------------------------------------------------------
// The public note
// ---------------------------------------------------------------------------

/** The JSON a public note carries after its leading mark, with its bigints restored; null where it holds none. */
const noteBodyOf = (note: Hex): unknown => {
  let text: string
  try {
    text = hexToString(note)
  } catch {
    return null
  }
  const start = text.indexOf('{')
  if (start < 0) {
    return null
  }
  try {
    return JSON.parse(text.slice(start), (_key, value: unknown) => {
      if (typeof value !== 'object' || value === null) {
        return value
      }
      const { $bigint: digits } = value as Record<string, unknown>
      if (typeof digits !== 'string' || Object.keys(value).length !== 1 || !/^\d+$/.test(digits)) {
        return value
      }
      return BigInt(digits)
    })
  } catch {
    return null
  }
}

const isThreshold = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

const isNoteCredential = (value: unknown): value is Credential => {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const { method, config, salt } = value as Record<string, unknown>
  return (
    isStoredAddress(method) &&
    typeof config === 'string' &&
    isHex(config) &&
    (salt === undefined || (typeof salt === 'string' && isHex(salt)))
  )
}

const clausesOfBody = (body: unknown): unknown[] | null => {
  if (typeof body !== 'object' || body === null) {
    return null
  }
  const { clauses } = body as Record<string, unknown>
  return Array.isArray(clauses) && clauses.length > 0 ? clauses : null
}

const isShapeClause = (value: unknown): value is ShapeNote['clauses'][number] => {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const { threshold, methods } = value as Record<string, unknown>
  return isThreshold(threshold) && Array.isArray(methods) && methods.every(isStoredAddress)
}

const isNoteClause = (value: unknown): value is Clause => {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const { threshold, credentials } = value as Record<string, unknown>
  return isThreshold(threshold) && Array.isArray(credentials) && credentials.every(isNoteCredential)
}

/** The shape a public note carries, or null where the note holds no shape this build reads. */
export const shapeOfNote = (note: Hex): ShapeNote | null => {
  const clauses = clausesOfBody(noteBodyOf(note))
  if (!clauses || !clauses.every(isShapeClause)) {
    return null
  }
  return {
    clauses: clauses.map(({ threshold, methods }) => ({ threshold, methods: [...methods] }))
  }
}

/**
 * The whole configuration a public setup's note carries, or null where the
 * note holds none this build reads. The chain carries the note, so a caller
 * checks it against the commitment before trusting it.
 */
export const configurationOfNote = (note: Hex): Configuration | null => {
  const body = noteBodyOf(note)
  const clauses = clausesOfBody(body)
  if (!clauses || !clauses.every(isNoteClause)) {
    return null
  }
  const { wait, ignoresPause } = body as Record<string, unknown>
  if (
    typeof wait !== 'bigint' ||
    wait < 0n ||
    wait > BigInt(Number.MAX_SAFE_INTEGER) ||
    typeof ignoresPause !== 'boolean'
  ) {
    return null
  }
  return {
    wait: Number(wait),
    ignoresPause,
    clauses: clauses.map(({ threshold, credentials }) => ({
      threshold,
      credentials: credentials.map(({ method, config, salt }) =>
        salt ? { method, config, salt } : { method, config }
      )
    }))
  }
}

// ---------------------------------------------------------------------------
// The setup read before the recovery password
// ---------------------------------------------------------------------------

/**
 * The public note of the setup the state names, read from its setup event at
 * the block the state pins it to; null where the block holds no event of this
 * setup. A failed read rejects.
 */
const committedNoteOf = async (
  setup: ReadoutKitClient['setup'],
  state: SetupState
): Promise<Hex | null> => {
  const block = state.setupCommittedAtBlock
  const found = await setup.events.fetch(setup.events.accountFilter(), {
    from: block,
    to: block
  })
  const commit = found.find(
    (notification) =>
      notification.kind === 'setup-committed' &&
      notification.nonce === state.setupNonce &&
      notification.setupCommitment.toLowerCase() === state.setupCommitment.toLowerCase()
  )
  return commit && commit.kind === 'setup-committed' ? commit.publicMetadata : null
}

/** What a refused restore says about the setup, or null where it only says the password is missing. */
const readingOfRefusal = (error: unknown): SetupReading | null => {
  const refusal = restoreRefusalOf(error)
  if (!refusal) {
    throw error
  }
  if (refusal.cause === 'restore.no-backup') {
    return { kind: 'no-details' }
  }
  if (refusal.cause === 'restore.commitment-mismatch') {
    return { kind: 'mismatch' }
  }
  return null
}

/**
 * The setup read before the recovery password. A thrown value that is no
 * restore refusal, or a failed read of the setup event, throws: the caller
 * renders it as a read that failed, never as an answer.
 */
export const readSetupReading = async (
  client: ReadoutKitClient,
  state: SetupState
): Promise<SetupReading> => {
  try {
    const configuration = await client.setup.getSetup({ password: NO_PASSWORD })
    return { kind: 'readable', configuration }
  } catch (error: unknown) {
    const reading = readingOfRefusal(error)
    if (reading) {
      return reading
    }
  }
  const note = await committedNoteOf(client.setup, state)
  if (!note) {
    return { kind: 'sealed' }
  }
  const carried = configurationOfNote(note)
  if (carried) {
    try {
      const configuration = await client.setup.getSetup(carried)
      return { kind: 'readable', configuration }
    } catch (error: unknown) {
      return readingOfRefusal(error) ?? { kind: 'mismatch' }
    }
  }
  const shape = shapeOfNote(note)
  return shape ? { kind: 'shape-readable', shape } : { kind: 'sealed' }
}

// ---------------------------------------------------------------------------
// The path
// ---------------------------------------------------------------------------

const kindNameOfMethod = (method: Address, context: ReadoutRowContext, t: Translate): string => {
  const kind = kindOfMethodIn(context.addressBook)(method)
  return kind ? kindNameOf(kind, t) : t(METHOD_NOUN)
}

/** Whether a clause reads as a required row: one credential at a threshold of one. */
const isRequired = (threshold: number, members: number): boolean => threshold === 1 && members === 1

/** Whether some group lets the holder pick which of its members answer. */
const hasChoice = (clauses: readonly ReadoutClause[]): boolean =>
  clauses.some(
    ({ required, threshold, rows }) => !required && threshold > 0 && threshold < rows.length
  )

const ruleLinesOf = (clauses: readonly Clause[], context: ReadoutRowContext, t: Translate) =>
  renderRuleLines(
    getRuleLines(clauses, { kindOfMethod: kindOfMethodIn(context.addressBook) }).filter(
      (line) => !LINES_LEFT_OUT.includes(line.key)
    ),
    (key, params) => t(key, { ...params })
  )

const maskedRowOf = (method: Address, context: ReadoutRowContext, t: Translate): ReadoutRow => {
  const hidden = renderHiddenValue(t)
  const guardian = sameAddress(method, context.addressBook.methods.ecdsa)
  return {
    name: hidden.dots,
    aside: kindNameOfMethod(method, context, t),
    chip: hidden.chip,
    lines: guardian ? [t(SMART_ACCOUNT_LINE)] : [],
    answerable: true
  }
}

const PASSKEY_CONFIG_WORDS = [
  { type: 'bytes32' },
  { type: 'bytes32' },
  { type: 'bytes32' }
] as const

/**
 * The relying-party hash a passkey config commits, read as the chain decodes
 * it: bytes after the three words are ignored. Null where the config is too
 * short to hold them.
 */
const passkeyRpIdHashOf = (config: Hex): Hex | null => {
  try {
    return decodeAbiParameters(PASSKEY_CONFIG_WORDS, config)[2]
  } catch {
    return null
  }
}

const readableRowOf = (
  credential: Credential,
  context: ReadoutRowContext,
  t: Translate
): ReadoutRow => {
  const { methods } = context.addressBook
  const kind = kindOfMethodIn(context.addressBook)(credential.method)
  if (sameAddress(credential.method, methods.ecdsa)) {
    const guardian = guardianAddressOf(credential)
    const kindName = kindNameOfMethod(credential.method, context, t)
    return {
      name: guardian ? renderFullAddress(guardian) : kindName,
      aside: guardian ? kindName : null,
      chip: null,
      lines: [t(SMART_ACCOUNT_LINE)],
      answerable: true
    }
  }
  if (sameAddress(credential.method, methods.passkey)) {
    // The passkey config commits the hash of the origin it was created under;
    // a passkey of another origin cannot answer from this build.
    const committed = passkeyRpIdHashOf(credential.config)
    const mismatch =
      committed !== null && committed.toLowerCase() !== context.ownRpIdHash.toLowerCase()
    return {
      name: credential.label?.trim() || kindNameOfMethod(credential.method, context, t),
      aside: null,
      chip: null,
      lines: mismatch ? [t(ORIGIN_MISMATCH_LINE)] : [],
      answerable: !mismatch
    }
  }
  return {
    name: kind ? kindNameOf(kind, t) : renderFullAddress(credential.method),
    aside: kind ? null : t(METHOD_NOUN),
    chip: null,
    lines: [],
    answerable: !!kind
  }
}

/**
 * Why the rows this device can answer leave the path incomplete, or null
 * where they complete it: every clause needs as many answerable members as
 * its threshold. A short clause with a passkey of another origin names the
 * origin; any other short clause holds a method this build does not know.
 */
const blockOf = (
  clauses: readonly ReadoutClause[],
  configuration: Configuration,
  context: ReadoutRowContext
): ReadoutBlock | null => {
  const short = clauses
    .map((clause, index) => ({ clause, index }))
    .filter(({ clause }) => clause.rows.filter((row) => row.answerable).length < clause.threshold)
  if (short.length === 0) {
    return null
  }
  const otherOrigin = short.some(({ clause, index }) =>
    clause.rows.some(
      (row, member) =>
        !row.answerable &&
        sameAddress(
          configuration.clauses[index].credentials[member].method,
          context.addressBook.methods.passkey
        )
    )
  )
  return otherOrigin ? 'origin' : 'unsupported'
}

/** The path a shape-visible setup publishes, with every value masked. */
export const previewPathOf = (
  shape: ShapeNote,
  context: ReadoutRowContext,
  t: Translate
): ReadoutPath => {
  const clauses = shape.clauses.map(({ threshold, methods }) => ({
    threshold,
    required: isRequired(threshold, methods.length),
    rows: methods.map((method) => maskedRowOf(method, context, t))
  }))
  const hidden = renderHiddenValue(t)
  return {
    clauses,
    ruleLines: ruleLinesOf(
      shape.clauses.map(({ threshold, methods }) => ({
        threshold,
        credentials: methods.map((method) => ({ method, config: '0x' }))
      })),
      context,
      t
    ),
    wait: hidden.dots,
    waitChip: hidden.chip,
    choice: hasChoice(clauses),
    blocked: null
  }
}

/** The path of an opened configuration, with its values, the origin read of each passkey and whether this device can complete it. */
export const readablePathOf = (
  configuration: Configuration,
  context: ReadoutRowContext,
  t: Translate
): ReadoutPath => {
  const clauses = configuration.clauses.map(({ threshold, credentials }) => ({
    threshold,
    required: isRequired(threshold, credentials.length),
    rows: credentials.map((credential) => readableRowOf(credential, context, t))
  }))
  return {
    clauses,
    ruleLines: ruleLinesOf(configuration.clauses, context, t),
    wait: renderWait(configuration.wait, t),
    waitChip: null,
    choice: hasChoice(clauses),
    blocked: blockOf(clauses, configuration, context)
  }
}
