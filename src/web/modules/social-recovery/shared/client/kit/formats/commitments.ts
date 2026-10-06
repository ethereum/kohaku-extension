/**
 * The setup commitment the manager stores for an account and an action, and
 * the dead commitment it refuses.
 */
import { encodeAbiParameters, keccak256 } from 'viem'

import type { Address, Hex } from '@web/modules/social-recovery/sdk-interfaces'

/** `keccak256(abi.encode(account, action, nonce, setupBody))`. */
export const setupCommitmentOf = (
  account: Address,
  action: Address,
  nonce: bigint,
  setupBody: Hex
): Hex =>
  keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'address' }, { type: 'uint64' }, { type: 'bytes' }],
      [account, action, nonce, setupBody]
    )
  )

/**
 * The commitment over an empty body, which the manager refuses like the zero
 * commitment, so a setup never commits to it.
 */
export const deadCommitmentOf = (account: Address, action: Address, nonce: bigint): Hex =>
  setupCommitmentOf(account, action, nonce, '0x')
