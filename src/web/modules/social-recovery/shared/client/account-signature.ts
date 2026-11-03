/**
 * A contract account's EIP-1271 answer for a signature, read over the
 * extension's own provider: the account accepts the signature where its
 * `isValidSignature` answers the magic value.
 */
import { Interface } from 'ethers'

import type { Address, Hex } from '@kohaku-eth/social-recovery'

import type { ContractCallProvider } from './types'

/** The magic value `isValidSignature` answers for a signature the contract accepts. */
const EIP1271_MAGIC_VALUE = '0x1626ba7e'

const EIP1271 = new Interface([
  'function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)'
])

/**
 * Whether the contract at the address accepts the signature over the digest.
 * Any answer but the magic value, a revert among them, is a refusal; a read
 * the node did not answer throws.
 */
export const isValidAccountSignature = async (
  provider: ContractCallProvider,
  address: Address,
  digest: Hex,
  signature: Hex
): Promise<boolean> => {
  const data = EIP1271.encodeFunctionData('isValidSignature', [digest, signature]) as Hex
  let answer: string
  try {
    answer = await provider.call({ to: address, data })
  } catch (error: unknown) {
    // A contract that reverts refuses the signature; any other failure is the node's.
    if ((error as { code?: unknown } | null)?.code === 'CALL_EXCEPTION') {
      return false
    }
    throw error
  }
  try {
    const [magic] = EIP1271.decodeFunctionResult('isValidSignature', answer)
    return String(magic).toLowerCase() === EIP1271_MAGIC_VALUE
  } catch {
    return false
  }
}
