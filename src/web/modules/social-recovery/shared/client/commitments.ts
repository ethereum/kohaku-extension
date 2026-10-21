/**
 * The dead commitment: the setup commitment over an empty body, which the
 * manager refuses like the zero commitment, so a setup never commits to it.
 */
import { setupCommitment } from '@kohaku-eth/social-recovery'
import type { Address, Hex } from '@kohaku-eth/social-recovery'

export const deadCommitmentOf = (account: Address, action: Address, nonce: bigint): Hex =>
  setupCommitment(account, action, nonce, '0x')
