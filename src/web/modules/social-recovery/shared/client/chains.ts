/**
 * The chains the wallet can read a recovery on, and the one it does read.
 *
 * The SDK ships a default descriptor for two chains, Sepolia and Ethereum
 * mainnet. The wallet reads one of them, named by its configuration, and shows
 * it as a fixed label with no switch.
 */
import { mainnet, sepolia } from 'viem/chains'

import type { RecoveryChain } from './types'

export const RECOVERY_CHAINS = ['sepolia', 'mainnet'] as const

/** The chain id of each recovery chain. */
export const CHAIN_IDS = {
  sepolia: sepolia.id,
  mainnet: mainnet.id
} as const

/**
 * The one chain this build reads. The first release runs on the test network;
 * the mainnet descriptor stays a placeholder until that deployment lands.
 */
export const WALLET_RECOVERY_CHAIN: RecoveryChain = 'sepolia'

/** The recovery chain a chain id names, or undefined for any other chain. */
export const recoveryChainOf = (chainId: number | bigint): RecoveryChain | undefined =>
  RECOVERY_CHAINS.find((chain) => CHAIN_IDS[chain] === Number(chainId))
