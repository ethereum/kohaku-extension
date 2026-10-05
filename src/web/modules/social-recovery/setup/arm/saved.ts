/**
 * Where the saved screen leads: the chain's explorer page of the save's
 * transaction, and the Recovery Card with the level it shows, since the card
 * can no longer read the draft the save wiped.
 */
import { mainnet, sepolia } from 'viem/chains'

import { WEB_ROUTES } from '@common/modules/router/constants/common'
import type { Hex } from '@web/modules/social-recovery/sdk-interfaces'
import type { RecoveryChain } from '@web/modules/social-recovery/shared/client'
import type { CardLevel } from '@web/modules/social-recovery/setup/card'

const EXPLORERS: { readonly [C in RecoveryChain]: string } = {
  sepolia: sepolia.blockExplorers.default.url,
  mainnet: mainnet.blockExplorers.default.url
}

/** The explorer page of a transaction on a recovery chain. */
export const explorerTransactionUrlOf = (chain: RecoveryChain, transactionHash: Hex): string =>
  `${EXPLORERS[chain]}/tx/${transactionHash}`

/** The Recovery Card's path, with the level it shows. */
export const cardPathOf = (level: CardLevel): string => {
  const query = new URLSearchParams()
  query.set('level', level)
  return `/${WEB_ROUTES.socialRecoverySetupCard}?${query.toString()}`
}
