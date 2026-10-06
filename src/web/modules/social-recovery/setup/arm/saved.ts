/**
 * Where the saved screen leads: the explorer page of the save's transaction,
 * on the explorer the chain's deployment names or else the chain's own, and
 * the Recovery Card with the level it shows, since the card can no longer read
 * the draft the save wiped.
 */
import { mainnet, sepolia } from 'viem/chains'

import { WEB_ROUTES } from '@common/modules/router/constants/common'
import type { Hex } from '@web/modules/social-recovery/sdk-interfaces'
import { deploymentOf, type RecoveryChain } from '@web/modules/social-recovery/shared/client'
import type { CardLevel } from '@web/modules/social-recovery/setup/card'

const EXPLORERS: { readonly [C in RecoveryChain]: string } = {
  sepolia: sepolia.blockExplorers.default.url,
  mainnet: mainnet.blockExplorers.default.url
}

// A deployment on a node of its own, such as a fork, names the explorer that
// knows its transactions; the chain's public explorer would not find them.
const explorerOf = (chain: RecoveryChain): string => {
  const deployment = deploymentOf(chain)
  const named = deployment.kind === 'deployed' ? deployment.facts.explorerUrl : undefined
  return named ? named.replace(/\/$/, '') : EXPLORERS[chain]
}

/** The explorer page of a transaction on a recovery chain. */
export const explorerTransactionUrlOf = (chain: RecoveryChain, transactionHash: Hex): string =>
  `${explorerOf(chain)}/tx/${transactionHash}`

/** The Recovery Card's path, with the level it shows. */
export const cardPathOf = (level: CardLevel): string => {
  const query = new URLSearchParams()
  query.set('level', level)
  return `/${WEB_ROUTES.socialRecoverySetupCard}?${query.toString()}`
}
