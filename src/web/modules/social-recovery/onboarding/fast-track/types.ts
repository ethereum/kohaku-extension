import type { KeystoreSeed } from '@ambire-common/interfaces/keystore'
import type useKeyStoreSetup from '@web/modules/keystore/components/KeyStoreSetupForm/hooks/useKeyStoreSetup'
import type { Address } from '@web/modules/social-recovery/sdk-interfaces'
import type { ChainReads } from '@web/modules/social-recovery/shared/client'
import type { RecoveryEntryRecord } from '@web/modules/social-recovery/shared/records'
import type { DepositStep, GasNetwork } from '@web/modules/social-recovery/shared/writes'

/** The router state the warning hands the fast track once the holder acknowledged it. */
export interface FastTrackNavigationState {
  acknowledged: true
}

/** The recovery phrase the keystore holds before the account is added, as it sends it to the page. */
export type TempSeed = Omit<KeystoreSeed, 'id' | 'label'>

// ---------------------------------------------------------------------------
// Step 2, the extension password
// ---------------------------------------------------------------------------

/** What the wallet's keystore setup hook hands the form. */
export type KeyStoreSetup = ReturnType<typeof useKeyStoreSetup>

export interface PasswordStepViewProps {
  setup: KeyStoreSetup
  /** Goes back to the warning. */
  onBack: () => void
}

// ---------------------------------------------------------------------------
// Step 3, the key and its recovery phrase
// ---------------------------------------------------------------------------

/**
 * Where the key step stands:
 * - `creating`: the keystore has not confirmed the new recovery phrase yet;
 * - `createFailed`: it did not within the limit;
 * - `words`: the words are on screen, waiting for the acknowledgment and continue;
 * - `adding`: the wallet is adding the slot's basic account;
 * - `addFailed`: the picker is idle again and added nothing, so nothing was saved;
 * - `listed`: the wallet lists the basic account and the keystore holds its key.
 */
export type KeyStepPhase = 'creating' | 'createFailed' | 'words' | 'adding' | 'addFailed' | 'listed'

export interface FastTrackKey {
  phase: KeyStepPhase
  /** The recovery phrase's words, in order; empty until the keystore confirmed the phrase. */
  words: readonly string[]
  /**
   * The key that will control the account, derived from the phrase: the key
   * of the slot's basic account; null until derived.
   */
  controllingKey: Address | null
  /** The slot's basic account once listed, the account that receives control. */
  listed: Address | null
  /**
   * Whether an add that ran before this mount, which this mount waited for,
   * ended with the wallet listing accounts and an account selected.
   */
  listedByEarlierAdd: boolean
  /**
   * Whether the add passed its limit while the picker still runs it, or after
   * it reported success with the slot not listed yet: nothing is sent again,
   * and the holder may go back.
   */
  pending: boolean
  /** Adds the slot's basic account; runs only from `words` or `addFailed`. */
  add: () => void
  /**
   * Starts the failed part again: the phrase from `createFailed`, the add from
   * `addFailed`, or a new phrase where the failed add ran before this mount.
   */
  retry: () => void
}

export interface KeyStepViewProps {
  phase: KeyStepPhase
  words: readonly string[]
  controllingKey: Address | null
  acknowledged: boolean
  onAcknowledge: (acknowledged: boolean) => void
  onContinue: () => void
  onRetry: () => void
  /** Whether the add passed its limit without an answer; Back is enabled again. */
  pending: boolean
  /** Goes back to the warning; disabled while the wallet adds the account, until the limit. */
  onBack: () => void
}

/** The phrase this mount made, with the run that made it. */
export interface MadePhrase {
  run: number
  phrase: string
}

/** What the picker went through since the last add started. */
export interface AddProgress {
  started: boolean
  loading: boolean
  success: boolean
}

// ---------------------------------------------------------------------------
// The gas step
// ---------------------------------------------------------------------------

/** The recovery entry's read, as the gas step holds it. */
export type EntryReading =
  | { status: 'loading' }
  | { status: 'absent' }
  | { status: 'present'; entry: RecoveryEntryRecord }
  | { status: 'failed' }

/** What the submission's gas check takes on the fast track. */
export interface SubmissionCheckInput {
  reads: Pick<ChainReads, 'gasPrice' | 'nativeBalance'>
  /** The sending key: the slot's basic account, which also receives control. */
  key: Address
  network: GasNetwork
  /** The gas the check assumes for the submission. */
  gas?: bigint
}

/**
 * Where the gas step stands: reading, a failed read with retry, no key in this
 * wallet that can send the recovery (no retry), the deposit step while the key
 * holds too little, or enough, so the step moves on.
 */
export type GasStepState =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'noSendingKey' }
  | { kind: 'deposit'; step: DepositStep }
  | { kind: 'enough' }

export interface SubmissionGas {
  state: GasStepState
  retry: () => void
}

export interface GasStepViewProps {
  state: GasStepState
  onRetry: () => void
  /** Goes back to the readout. */
  onBack: () => void
  /** Goes back to the account step, where no key in this wallet can send the recovery. */
  onBackToAccount: () => void
}
