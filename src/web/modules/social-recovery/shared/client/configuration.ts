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
import {
  DEFAULT_REQUEST_WINDOW,
  defaultClientConfiguration
} from '@web/modules/social-recovery/sdk-doubles'
import type { ClientConfiguration } from '@web/modules/social-recovery/sdk-interfaces'

import type { RecoveryClientConfiguration } from './types'

/**
 * The width of a request's validity window: the wallet's own 24 hours, counted
 * from the moment the request is created. The client configuration's width
 * entry is set to the same value so the SDK's window check never fires under
 * it.
 */
export const REQUEST_WINDOW_SECONDS = 24 * 3600

/**
 * The SDK client configuration of one extension configuration: the SDK's
 * shipped numbers, the wallet's own request window, no token allowlist (the
 * first release names no payment order) and the account facts where the wallet
 * has them.
 */
export const clientConfigurationOf = (config: RecoveryClientConfiguration): ClientConfiguration =>
  defaultClientConfiguration({
    tokens: [],
    candidateKeys: [...(config.candidateKeys ?? [])],
    requestWindow: { ...DEFAULT_REQUEST_WINDOW, default: REQUEST_WINDOW_SECONDS },
    ...(config.creation ? { creation: { ...config.creation } } : {}),
    ...(config.accountImplementation ? { accountImplementation: config.accountImplementation } : {})
  })
