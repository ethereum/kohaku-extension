/**
 * The key that authorised a transaction for an account, read from the
 * account's own signature in the transaction's input, so a batch a relayer
 * sent names the key that signed it rather than the relayer.
 *
 * Two shapes are read. A call to the account's factory that deploys the
 * account and runs its first batches (`deployAndExecute`,
 * `deployAndExecuteMultiple`) counts only where the factory, the code and the
 * salt produce that account; its batches run at nonces 0, 1, and so on. A
 * call to the account itself (`execute`, `executeMultiple`) runs its batches
 * from the nonce the account held at the block before the transaction.
 *
 * Each batch signed by one key in the standard mode (the typed `AmbireOperation`
 * over the hash of the account, the chain, the nonce and the calls) or in the
 * unprotected mode (that hash signed as it is) names its signer. Any other
 * shape, a signature in another mode, a nonce the node refuses to read at an
 * old block, or an input that does not decode names nobody, and the sender
 * of the transaction stands in.
 *
 * A key named here is only a candidate: the reads that use it still check
 * that the key holds a privilege and authority on the account.
 */
import { creationPrivileges, isProviderRevert } from '@kohaku-eth/social-recovery'
import type {
  Address,
  Hex,
  IProvider,
  ISignerRecovery,
  RawTransaction
} from '@kohaku-eth/social-recovery'
import {
  type Abi,
  bytesToHex,
  decodeFunctionData,
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  hexToNumber,
  isAddress,
  isAddressEqual,
  isHex,
  numberToHex,
  recoverAddress,
  size,
  slice,
  zeroAddress
} from 'viem'

import { callToTuple, getSignableHash } from '@ambire-common/libs/accountOp/accountOp'
import type { Call } from '@ambire-common/libs/accountOp/types'
import { getTypedData } from '@ambire-common/libs/signMessage/signMessage'
import AmbireAccount from '@contracts/compiled/AmbireAccount.json'
import AmbireFactory from '@contracts/compiled/AmbireFactory.json'

import { recoveredSignerOf } from './signer'
import type { NoncedBatch, SignedBatch } from './types'
import { historyRefused } from './wallet-reads/history-refusal'
import { distinctKeys } from './wallet-reads/privilege-reads'

const ACCOUNT_ABI = AmbireAccount.abi as Abi
const FACTORY_ABI = AmbireFactory.abi as Abi

const UNPROTECTED_MODE = 0
const STANDARD_MODE = 1
// A 65-byte ECDSA signature and the mode byte the account reads last.
const SIGNATURE_SIZE = 65
const WRAPPED_SIGNATURE_SIZE = SIGNATURE_SIZE + 1

const callOf = (value: unknown): Call | undefined => {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  const { to, value: amount, data } = value as Record<string, unknown>
  return typeof to === 'string' &&
    isAddress(to) &&
    typeof amount === 'bigint' &&
    typeof data === 'string' &&
    isHex(data)
    ? { to, value: amount, data }
    : undefined
}

const batchOf = (calls: unknown, signature: unknown): SignedBatch | undefined => {
  if (!Array.isArray(calls) || typeof signature !== 'string' || !isHex(signature)) {
    return undefined
  }
  const decoded = calls.map(callOf)
  return decoded.every((call): call is Call => call !== undefined)
    ? { calls: decoded, signature }
    : undefined
}

const batchesOf = (toExec: unknown): SignedBatch[] => {
  if (!Array.isArray(toExec)) {
    return []
  }
  const batches = toExec.map((entry: unknown) =>
    typeof entry === 'object' && entry !== null
      ? batchOf(
          (entry as Record<string, unknown>).calls,
          (entry as Record<string, unknown>).signature
        )
      : undefined
  )
  return batches.every((batch): batch is SignedBatch => batch !== undefined) ? batches : []
}

const withNonces = (batches: readonly SignedBatch[], first: bigint): NoncedBatch[] =>
  batches.map((batch, index) => ({ ...batch, nonce: first + BigInt(index) }))

// An input that does not decode, or creation code of another layout, names no batch.
const decodedOrNone = <T>(decode: () => T[]): T[] => {
  try {
    return decode()
  } catch {
    return []
  }
}

/** The batches a factory call deploys the account with, or none where it deploys another. */
const factoryBatchesOf = (to: Address, input: Hex, account: Address): NoncedBatch[] => {
  const { functionName, args = [] } = decodeFunctionData({ abi: FACTORY_ABI, data: input })
  const [code, salt] = args
  if (typeof code !== 'string' || !isHex(code) || typeof salt !== 'bigint') {
    return []
  }
  const created = creationPrivileges(to, code, numberToHex(salt, { size: 32 }))
  if (!isAddressEqual(created.account, account)) {
    return []
  }
  if (functionName === 'deployAndExecute') {
    const batch = batchOf(args[2], args[3])
    return batch ? withNonces([batch], 0n) : []
  }
  if (functionName === 'deployAndExecuteMultiple') {
    return withNonces(batchesOf(args[2]), 0n)
  }
  return []
}

/** The batches a call to the account runs, before their nonces are known. */
const accountCallBatchesOf = (input: Hex): SignedBatch[] => {
  const { functionName, args = [] } = decodeFunctionData({ abi: ACCOUNT_ABI, data: input })
  if (functionName === 'execute') {
    const batch = batchOf(args[0], args[1])
    return batch ? [batch] : []
  }
  return functionName === 'executeMultiple' ? batchesOf(args[0]) : []
}

/** The account's nonce at a block, or undefined where the node refuses that block or the account does not answer. */
const nonceAt = async (
  provider: IProvider,
  account: Address,
  block: number
): Promise<bigint | undefined> => {
  try {
    const answer = await provider.call(
      account,
      encodeFunctionData({ abi: ACCOUNT_ABI, functionName: 'nonce' }),
      zeroAddress,
      block
    )
    // An empty answer: the account had no code yet at that block.
    if (size(answer) === 0) {
      return undefined
    }
    const nonce = decodeFunctionResult({ abi: ACCOUNT_ABI, functionName: 'nonce', data: answer })
    return typeof nonce === 'bigint' ? nonce : undefined
  } catch (thrown) {
    if (historyRefused(thrown) || isProviderRevert(thrown)) {
      return undefined
    }
    throw thrown
  }
}

const signedBatchesOf = async (
  transaction: RawTransaction,
  account: Address,
  provider: IProvider
): Promise<NoncedBatch[]> => {
  const { to, input } = transaction
  if (!to) {
    return []
  }
  if (!isAddressEqual(to, account)) {
    return decodedOrNone(() => factoryBatchesOf(to, input, account))
  }
  const batches = decodedOrNone(() => accountCallBatchesOf(input))
  if (batches.length === 0) {
    return []
  }
  // The account's batches run from the nonce it held before the transaction's block.
  const first = await nonceAt(provider, account, transaction.blockNumber - 1)
  return first === undefined ? [] : withNonces(batches, first)
}

const unprotectedSignerOf = async (hash: Hex, signature: Hex): Promise<Address | undefined> => {
  try {
    return await recoverAddress({ hash, signature })
  } catch {
    return undefined
  }
}

const batchSignerOf = async (
  batch: NoncedBatch,
  account: Address,
  chainId: number
): Promise<Address | undefined> => {
  const hash = bytesToHex(
    getSignableHash(account, BigInt(chainId), batch.nonce, batch.calls.map(callToTuple))
  )
  // The account reads a bare 65-byte signature ending in its recovery value 27 or 28 as unprotected.
  if (size(batch.signature) === SIGNATURE_SIZE) {
    const recovery = hexToNumber(slice(batch.signature, SIGNATURE_SIZE - 1))
    return recovery === 27 || recovery === 28
      ? unprotectedSignerOf(hash, batch.signature)
      : undefined
  }
  if (size(batch.signature) !== WRAPPED_SIGNATURE_SIZE) {
    return undefined
  }
  const mode = hexToNumber(slice(batch.signature, SIGNATURE_SIZE))
  const signature = slice(batch.signature, 0, SIGNATURE_SIZE)
  if (mode === STANDARD_MODE) {
    return recoveredSignerOf(getTypedData(BigInt(chainId), account, hash), signature)
  }
  return mode === UNPROTECTED_MODE ? unprotectedSignerOf(hash, signature) : undefined
}

/**
 * Every distinct key whose signature authorised a batch of the transaction on
 * the account, in the order the batches run; none where the transaction has
 * no shape read here. A nonce read the node fails other than by refusing an
 * old block throws.
 */
export const recoveredSignersOf = async (
  transaction: RawTransaction,
  account: Address,
  chainId: number,
  provider: IProvider
): Promise<Address[]> => {
  const batches = await signedBatchesOf(transaction, account, provider)
  const signers = await Promise.all(batches.map((batch) => batchSignerOf(batch, account, chainId)))
  return distinctKeys(
    signers
      .filter((signer): signer is Address => signer !== undefined)
      .map((signer) => getAddress(signer))
  )
}

/** The first key the transaction's signatures name on the account, or the transaction's sender where they name none. */
export const recoverSigner = async (
  transaction: RawTransaction,
  account: Address,
  chainId: number,
  provider: IProvider
): Promise<Address> => {
  const [signer] = await recoveredSignersOf(transaction, account, chainId, provider)
  return signer ?? transaction.from
}

/** The signer recovery the SDK's removed-key inference reads, over one chain and one provider. */
export const createSignerRecovery = (chainId: number, provider: IProvider): ISignerRecovery => ({
  recoverSigner: (transaction, account) => recoverSigner(transaction, account, chainId, provider)
})
