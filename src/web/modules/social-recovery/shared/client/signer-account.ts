/**
 * The signer facade as a viem account for one key handle, so code written
 * against viem's `LocalAccount` signs through the facade: its refusals, its
 * wait and its first-answer rule all hold.
 *
 * `signMessage` signs the message's bytes with the EIP-191 prefix, as viem's
 * own accounts do: a string's UTF-8 bytes, or the raw bytes given.
 * `signTypedData` signs the EIP-712 typed data. The account signs no
 * transaction and no bare hash.
 */
import { bytesToHex, stringToHex } from 'viem'
import type { LocalAccount, SignableMessage, TypedDataDefinition } from 'viem'
import { toAccount } from 'viem/accounts'

import type { Hex } from '@web/modules/social-recovery/sdk-interfaces'

import type { KeyHandle, SignerFacade, TypedDataToSign } from './types'

const bytesOf = (message: SignableMessage): Hex => {
  if (typeof message === 'string') return stringToHex(message)
  return typeof message.raw === 'string' ? message.raw : bytesToHex(message.raw)
}

const typedDataOf = ({
  domain,
  types,
  primaryType,
  message
}: TypedDataDefinition): TypedDataToSign => ({
  domain: domain ?? {},
  types: Object.fromEntries(Object.keys(types).map((name) => [name, [...types[name]]])),
  primaryType,
  message
})

/** The viem account of one key handle, signing through the facade. */
export const accountFor = (signer: SignerFacade, key: KeyHandle): LocalAccount =>
  toAccount({
    address: key.addr,
    signMessage: ({ message }) => signer.signBytes(key, bytesOf(message)),
    signTypedData: (typedData) =>
      signer.signTypedData(key, typedDataOf(typedData as TypedDataDefinition)),
    signTransaction: () =>
      Promise.reject(new Error('The extension never signs a transaction through this account.'))
  })
