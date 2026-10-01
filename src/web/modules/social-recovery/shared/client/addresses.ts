/**
 * The address book of the kit's two deployments: the manager, the four method
 * modules, the action and the account implementation the action serves.
 *
 * `servedImplementation` is the one real address: it is the implementation
 * the account library already deploys behind every account proxy, so no
 * deployment of the kit changes it. Every other address is a placeholder, and
 * no contract is deployed at any of them. Replace them in this one file with
 * the deployed addresses of the manager, the methods and the action once each
 * deployment lands. Each reads as `c7`, one byte for the chain (`01` Sepolia,
 * `02` mainnet) and one byte for the field, behind seventeen zero bytes, so
 * nobody mistakes one for a deployment.
 */
import { isAddress, isAddressEqual } from 'viem'

import { PROXY_AMBIRE_ACCOUNT } from '@ambire-common/consts/deploy'

import type { AddressBook, RecoveryChain } from './types'

/** Both deployments' addresses by chain: placeholders to replace once deployed, and the real served implementation. */
export const PLACEHOLDER_ADDRESSES = {
  sepolia: {
    // Placeholder: the Sepolia policy manager.
    manager: '0x0000000000000000000000000000000000c70101',
    // Placeholder: the Sepolia guardian (ECDSA) method.
    methodEcdsa: '0x0000000000000000000000000000000000c70102',
    // Placeholder: the Sepolia passkey method.
    methodPasskey: '0x0000000000000000000000000000000000c70103',
    // Placeholder: the Sepolia Anon Aadhaar method.
    methodAadhaar: '0x0000000000000000000000000000000000c70104',
    // Placeholder: the Sepolia zkPassport method.
    methodZkpassport: '0x0000000000000000000000000000000000c70105',
    // Placeholder: the Sepolia recovery action.
    action: '0x0000000000000000000000000000000000c70106',
    // The account library's implementation, the one the Sepolia action serves.
    servedImplementation: PROXY_AMBIRE_ACCOUNT
  },
  mainnet: {
    // Placeholder: the mainnet policy manager.
    manager: '0x0000000000000000000000000000000000c70201',
    // Placeholder: the mainnet guardian (ECDSA) method.
    methodEcdsa: '0x0000000000000000000000000000000000c70202',
    // Placeholder: the mainnet passkey method.
    methodPasskey: '0x0000000000000000000000000000000000c70203',
    // Placeholder: the mainnet Anon Aadhaar method.
    methodAadhaar: '0x0000000000000000000000000000000000c70204',
    // Placeholder: the mainnet zkPassport method.
    methodZkpassport: '0x0000000000000000000000000000000000c70205',
    // Placeholder: the mainnet recovery action.
    action: '0x0000000000000000000000000000000000c70206',
    // The account library's implementation, the one the mainnet action serves.
    servedImplementation: PROXY_AMBIRE_ACCOUNT
  }
} as const

/** The address book of one chain's shipped deployment, as a fresh record. */
export const addressBookOf = (chain: RecoveryChain): AddressBook => {
  const a = PLACEHOLDER_ADDRESSES[chain]
  return {
    manager: a.manager,
    methods: {
      ecdsa: a.methodEcdsa,
      passkey: a.methodPasskey,
      aadhaar: a.methodAadhaar,
      zkpassport: a.methodZkpassport
    },
    action: a.action
  }
}

/**
 * Two addresses name the same account or contract, whatever their case. A
 * value that is not an address matches nothing.
 */
export const sameAddress = (a: string | undefined, b: string | undefined): boolean =>
  !!a &&
  !!b &&
  isAddress(a, { strict: false }) &&
  isAddress(b, { strict: false }) &&
  isAddressEqual(a, b)
