/**
 * What the extension builds one client from, and the SDK client configuration
 * it derives.
 *
 * The configuration names one chain, the address book of the manager, the
 * methods and the action, the provider adapter, and the account the client
 * binds. It has no field for a signer, a storage or a sponsor rail: the SDK
 * stores nothing and holds no signer, so the extension keeps both outside the
 * client, and the first release configures no rail.
 */
import { BUILDER_DEFAULT_CONFIGURATION, BUILDER_REQUEST_WINDOW } from '@kohaku-eth/social-recovery'
import type { ClientConfiguration } from '@kohaku-eth/social-recovery'

import type { RecoveryClientConfiguration } from './types'

/**
 * The width of a request's validity window: the wallet's own 24 hours, counted
 * from the moment the request is created. The client configuration's width
 * entry is set to the same value so the SDK's window check never fires under
 * it.
 */
export const REQUEST_WINDOW_SECONDS = 24 * 3600

/**
 * The widest block range one log query asks for, since a node may cap the
 * range: the wallet's own, set on the SDK's event manager and on the scans
 * the wallet runs beside it.
 */
export const LOG_CHUNK_SIZE = 10_000

/**
 * The SDK client configuration of one extension configuration: the SDK's
 * shipped numbers, the wallet's own request window and log chunk size, no
 * token allowlist (the first release names no payment order) and the account
 * facts where the wallet has them. No creation record is passed: the SDK
 * builds nothing on it.
 */
export const clientConfigurationOf = (
  config: RecoveryClientConfiguration
): ClientConfiguration => ({
  ...BUILDER_DEFAULT_CONFIGURATION,
  tokens: [],
  candidateKeys: [...(config.candidateKeys ?? [])],
  requestWindow: { ...BUILDER_REQUEST_WINDOW, default: REQUEST_WINDOW_SECONDS },
  logChunkSize: LOG_CHUNK_SIZE,
  ...(config.accountImplementation ? { accountImplementation: config.accountImplementation } : {})
})
