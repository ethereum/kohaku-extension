/**
 * The closed vocabularies of the recovery screens: the status chips, the screen
 * words of the kit's nouns, the two password names and the names of the values
 * a guardian checks.
 *
 * Every word here is a key of the `socialRecovery.status` or
 * `socialRecovery.display` block of en.json; no screen spells one on its own.
 * No chip says the account is protected: a status speaks of the recovery setup,
 * never of the account's safety from a stolen key.
 */
import i18n from '@common/config/localization'

import type {
  ApprovalValue,
  Chip,
  ChipSetName,
  Noun,
  PasswordName,
  Translate,
  ValueLabel,
  WalletWord
} from './types'

// ---------------------------------------------------------------------------
// Status chips
// ---------------------------------------------------------------------------

/**
 * A method in setup. Each test outcome keeps its own chip: a skipped
 * test reads not tested, a failed one test failed, one that could not run
 * test unavailable, a document the method cannot serve not supported.
 */
export const METHOD_CHIPS = [
  'notStarted',
  'inProgress',
  'tested',
  'notTested',
  'testFailed',
  'testUnavailable',
  'notSupported',
  'notYetActive',
  'saved',
  'live'
] as const

/**
 * A row in collection. `didNotAnswer` and `stopped` belong to a later release:
 * they stay in the set, and no screen of the first release selects them.
 * Unanswered and did not answer never share a row.
 */
export const COLLECTION_CHIPS = [
  'notAsked',
  'waiting',
  'declined',
  'unanswered',
  'complete',
  'notNeeded',
  'didNotAnswer',
  'stopped'
] as const

/**
 * A running attempt and its terminal. `stopped` belongs to a later release. A
 * session before submission is no attempt and reads `SESSION_CHIPS`.
 */
export const ATTEMPT_CHIPS = [
  'recoveryInProgress',
  'waiting',
  'executionDue',
  'stopped',
  'cancelled'
] as const

/** The two recovery states on the overview. */
export const RECOVERY_STATES = ['setUp', 'notSetUp'] as const

/**
 * The three chips that render beside the recovery status: path locked
 * beside set up where this device cannot read the path, not active where the
 * account no longer authorizes the setup, cannot recover where the wallet
 * refuses to recover the account.
 */
export const RECOVERY_ASIDE_CHIPS = ['pathLocked', 'notActive', 'cannotRecover'] as const

/** The recovery status set whole: the two states and the three chips beside them. */
export const RECOVERY_STATUS_CHIPS = [...RECOVERY_STATES, ...RECOVERY_ASIDE_CHIPS] as const

/** A session before submission. Recovery in progress never renders for it. */
export const SESSION_CHIPS = ['notSubmitted'] as const

/** The three chips that end a whole request and drop every row to not asked. */
export const REQUEST_CHIPS = ['expired', 'void', 'setupChanged'] as const

/** The editor's chip on a member the path cannot lose. */
export const EDITOR_CHIPS = ['stillNeeded'] as const

/** Every chip set by name. */
export const CHIP_SETS = {
  method: METHOD_CHIPS,
  collection: COLLECTION_CHIPS,
  attempt: ATTEMPT_CHIPS,
  recovery: RECOVERY_STATUS_CHIPS,
  session: SESSION_CHIPS,
  request: REQUEST_CHIPS,
  editor: EDITOR_CHIPS
} as const

// The en.json block under `socialRecovery.status` each set reads. A session's
// one chip sits in the attempt block of en.json.
const CHIP_SET_BLOCK: { readonly [S in ChipSetName]: string } = {
  method: 'method',
  collection: 'collection',
  attempt: 'attempt',
  recovery: 'recovery',
  session: 'attempt',
  request: 'request',
  editor: 'editor'
}

/** The i18n key of one chip, `socialRecovery.status.<block>.<chip>`. */
export const chipKey = <S extends ChipSetName>(set: S, chip: Chip<S>): string =>
  `socialRecovery.status.${CHIP_SET_BLOCK[set]}.${chip}`

/** The screen word of one chip. */
export const renderChip = <S extends ChipSetName>(
  set: S,
  chip: Chip<S>,
  t: Translate = i18n.t
): string => t(chipKey(set, chip))

// ---------------------------------------------------------------------------
// Nouns
// ---------------------------------------------------------------------------

/**
 * The kit's nouns under their one screen word each: the registry of setups is
 * the recovery registry, the action the recovery module, its author the
 * publisher, a method's pause a security stop, the setup version the setup
 * number and the attempt's id the attempt number.
 */
export const KIT_NOUNS = [
  'recoveryRegistry',
  'recoveryModule',
  'publisher',
  'securityStop',
  'setupNumber',
  'attemptNumber'
] as const

/** The feature's three concept names and `guardian`, the role's name in prose and help. */
export const CONCEPT_NOUNS = ['recoveryPath', 'method', 'waitingPeriod', 'guardian'] as const

/** A method's key admin and a method's pause holder under their screen words. */
export const PARTY_NOUNS = ['methodAdmin', 'stopHolder'] as const

/** The i18n key of one noun, `socialRecovery.display.nouns.<noun>`. */
export const nounKey = (noun: Noun): string => `socialRecovery.display.nouns.${noun}`

/** The screen word of one noun. */
export const renderNoun = (noun: Noun, t: Translate = i18n.t): string => t(nounKey(noun))

/**
 * The two passwords and their one name each: the extension
 * password unlocks the device, the recovery password decrypts the recovery
 * setup at the two hidden privacy levels. No screen takes both in one field.
 */
export const PASSWORD_NAMES = ['extensionPassword', 'recoveryPassword'] as const

/** The i18n key of one password name, `socialRecovery.display.passwords.<name>`. */
export const passwordKey = (name: PasswordName): string =>
  `socialRecovery.display.passwords.${name}`

/** The screen name of one password. */
export const renderPasswordName = (name: PasswordName, t: Translate = i18n.t): string =>
  t(passwordKey(name))

// ---------------------------------------------------------------------------
// Value names
// ---------------------------------------------------------------------------

/**
 * The four values a guardian's surfaces name, one name each on every screen.
 * The payment renders the words no payment where the request names none,
 * through `renderPaymentOrder`.
 */
export const APPROVAL_VALUES = ['newKey', 'keyBeingRemoved', 'payment', 'deadline'] as const

/**
 * The done screen's one exception to one name per value: the recovery
 * has run, so the new key reads controlled by and the removed key removed.
 */
export const DONE_VALUE_NAMES = {
  newKey: 'controlledBy',
  keyBeingRemoved: 'removed'
} as const

/** Every label of `socialRecovery.display.values`. */
export const VALUE_LABELS = [
  'account',
  'accountBeingRecovered',
  'newKey',
  'keyBeingRemoved',
  'payment',
  'noPayment',
  'deadline',
  'controlledBy',
  'removed'
] as const

/** The i18n key of one value label, `socialRecovery.display.values.<label>`. */
export const valueLabelKey = (label: ValueLabel): string => `socialRecovery.display.values.${label}`

/** The screen name of one value label. */
export const renderValueLabel = (label: ValueLabel, t: Translate = i18n.t): string =>
  t(valueLabelKey(label))

/**
 * The name of one of the four approval values. On the done screen the two keys
 * read controlled by and removed; every other value keeps its one name there.
 */
export const renderApprovalValueName = (
  value: ApprovalValue,
  options: { doneScreen?: boolean } = {},
  t: Translate = i18n.t
): string => {
  if (options.doneScreen && (value === 'newKey' || value === 'keyBeingRemoved')) {
    return renderValueLabel(DONE_VALUE_NAMES[value], t)
  }
  return renderValueLabel(value, t)
}

/**
 * The wallet's words for what the SDK computed or read: a masked value
 * reads none this wallet can see, a returned value as this wallet read it.
 */
export const WALLET_WORDS = ['noneThisWalletCanSee', 'asThisWalletRead'] as const

/** The i18n key of one wallet word, `socialRecovery.display.<word>`. */
export const walletWordKey = (word: WalletWord): string => `socialRecovery.display.${word}`

/** The screen words of one wallet word. */
export const renderWalletWord = (word: WalletWord, t: Translate = i18n.t): string =>
  t(walletWordKey(word))
