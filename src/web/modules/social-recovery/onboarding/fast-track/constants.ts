import type { RecoveryRoute } from '@web/modules/social-recovery/shared/records'

import type { FastTrackNavigationState } from './types'

/** The extension password's place among the fast track's numbered steps. */
export const PASSWORD_STEP = 2

/** The key's place among the fast track's numbered steps. */
export const KEY_STEP = 3

/** The gas step's recovery stage: it sits between the readout and the checklist. */
export const GAS_STAGE = 3

/** The router state that carries the warning's acknowledgment to the next step. */
export const ACKNOWLEDGED_STATE: FastTrackNavigationState = { acknowledged: true }

/** The route slug of the fresh install, as the recovery entry records it. */
export const FRESH_INSTALL_ROUTE: RecoveryRoute = 'fresh-install'

/** The wallet's own rule for the extension password (`isValidPassword`): at least this many characters. */
export const PASSWORD_MIN_LENGTH = 8

/** The words of the new recovery phrase, as the create door makes it. */
export const RECOVERY_PHRASE_WORDS = 12

/**
 * The slot the new key comes from. A recovery phrase made here has no account
 * imported yet, so the wallet's picker takes its first slot, at index zero.
 */
export const SLOT_INDEX = 0

/**
 * How long the key step waits for the keystore to confirm the new phrase, or
 * for the wallet to list the slot's basic account, before it offers retry.
 */
export const KEY_STEP_LIMIT_MS = 60_000

/**
 * The gas the fast track's check assumes for the submission. The client
 * prepares the submission only once the approvals are gathered, so before the
 * checklist there is no call to estimate; the check prices this amount at the
 * fee the wallet's send pays, with the usual headroom, until the client can
 * estimate the submission without its approvals. A submission on a path of one
 * guardian measured about 400,000 gas; the amount keeps room for longer paths.
 */
export const SUBMISSION_GAS_STAND_IN = 800_000n

/** How often the gas step reads the sending key's balance again while it waits for funds. */
export const BALANCE_POLL_MS = 5_000

/** How long one balance check may take before the gas step reads it as failed. */
export const BALANCE_READ_LIMIT_MS = 15_000
