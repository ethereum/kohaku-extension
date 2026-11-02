/**
 * The transactions a relayer sends for a smart account, signed the way the
 * wallet signs an account operation: the hash of the account, the chain, the
 * nonce and the calls, signed as the typed `AmbireOperation` with the mode
 * byte `01`, or signed as it is with the mode byte `00` or with none, its
 * last byte then the recovery value 27 or 28. The keys are
 * throwaway; no test reaches a network.
 */
import { Wallet } from 'ethers'
import {
  type Abi,
  bytesToHex,
  encodeFunctionData,
  encodeFunctionResult,
  toFunctionSelector
} from 'viem'

import { dedicatedToOneSAPriv } from '@ambire-common/interfaces/keystore'
import { getSmartAccount } from '@ambire-common/libs/account/account'
import { callToTuple, getSignableHash } from '@ambire-common/libs/accountOp/accountOp'
import type { Call } from '@ambire-common/libs/accountOp/types'
import {
  getTypedData,
  wrapStandard,
  wrapUnprotected
} from '@ambire-common/libs/signMessage/signMessage'
import AmbireAccount from '@contracts/compiled/AmbireAccount.json'
import AmbireFactory from '@contracts/compiled/AmbireFactory.json'
import type { Address, Hex } from '@kohaku-eth/social-recovery'
import type { SignedBatch } from '@web/modules/social-recovery/shared/client/types'

import type { RelayedAccount, SignatureMode } from './types'

const ACCOUNT_ABI = AmbireAccount.abi as Abi
const FACTORY_ABI = AmbireFactory.abi as Abi

export const SIGNING_KEY = new Wallet(`0x${'7a'.repeat(32)}`)
export const OTHER_SIGNING_KEY = new Wallet(`0x${'7b'.repeat(32)}`)
export const RELAYED_CHAIN_ID = 11155111

export const SAMPLE_CALLS: Call[] = [
  { to: '0x00000000000000000000000000000000000000c1', value: 0n, data: '0x1234' },
  { to: '0x00000000000000000000000000000000000000c2', value: 5n, data: '0x' }
]

/** A smart account whose creation code grants `key` the account privilege, as the wallet builds one. */
export const relayedAccount = async (key: Wallet = SIGNING_KEY): Promise<RelayedAccount> => {
  const account = await getSmartAccount([{ addr: key.address, hash: dedicatedToOneSAPriv }], [])
  if (!account.creation) {
    throw new Error('A smart account carries its creation.')
  }
  return {
    addr: account.addr as Address,
    factory: account.creation.factoryAddr as Address,
    code: account.creation.bytecode as Hex,
    salt: BigInt(account.creation.salt)
  }
}

/** A batch of calls on `account` at `nonce`, signed by `key` in `mode`. */
export const signedBatch = async (
  key: Wallet,
  account: Address,
  nonce: bigint,
  mode: SignatureMode = 'standard',
  calls: Call[] = SAMPLE_CALLS,
  chainId: number = RELAYED_CHAIN_ID
): Promise<SignedBatch> => {
  const hash = getSignableHash(account, BigInt(chainId), nonce, calls.map(callToTuple))
  if (mode === 'unprotected') {
    return { calls, signature: wrapUnprotected(key.signingKey.sign(hash).serialized) as Hex }
  }
  if (mode === 'plain') {
    return { calls, signature: key.signingKey.sign(hash).serialized as Hex }
  }
  const typed = getTypedData(BigInt(chainId), account, bytesToHex(hash))
  // ethers derives the domain's type itself and refuses it among the types.
  const types = Object.fromEntries(
    Object.entries(typed.types).filter(([name]) => name !== 'EIP712Domain')
  )
  const signature = await key.signTypedData(typed.domain, types, typed.message)
  return { calls, signature: wrapStandard(signature) as Hex }
}

const txnsOf = (batch: SignedBatch) =>
  batch.calls.map(({ to, value, data }) => ({ to, value, data }))

const toExecOf = (batches: readonly SignedBatch[]) =>
  batches.map((batch) => ({ calls: txnsOf(batch), signature: batch.signature }))

export const deployAndExecuteInput = (relayed: RelayedAccount, batch: SignedBatch): Hex =>
  encodeFunctionData({
    abi: FACTORY_ABI,
    functionName: 'deployAndExecute',
    args: [relayed.code, relayed.salt, txnsOf(batch), batch.signature]
  })

export const deployAndExecuteMultipleInput = (
  relayed: RelayedAccount,
  batches: readonly SignedBatch[]
): Hex =>
  encodeFunctionData({
    abi: FACTORY_ABI,
    functionName: 'deployAndExecuteMultiple',
    args: [relayed.code, relayed.salt, toExecOf(batches)]
  })

export const executeInput = (batch: SignedBatch): Hex =>
  encodeFunctionData({
    abi: ACCOUNT_ABI,
    functionName: 'execute',
    args: [txnsOf(batch), batch.signature]
  })

export const executeMultipleInput = (batches: readonly SignedBatch[]): Hex =>
  encodeFunctionData({
    abi: ACCOUNT_ABI,
    functionName: 'executeMultiple',
    args: [toExecOf(batches)]
  })

export const NONCE_SELECTOR: Hex = toFunctionSelector('nonce()')

/** The account's `nonce()` answer. */
export const nonceAnswer = (nonce: bigint): Hex =>
  encodeFunctionResult({ abi: ACCOUNT_ABI, functionName: 'nonce', result: nonce })
