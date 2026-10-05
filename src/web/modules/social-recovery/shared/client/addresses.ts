/**
 * The address book of the kit's two deployments: the manager, the four method
 * modules, the action and the account implementation the action serves.
 *
 * Every address below is a placeholder, and no contract is deployed at any of
 * them. Replace them in this one file with the deployed addresses of the
 * manager, the methods and the action once each deployment lands. Each reads
 * as `c7`, one byte for the chain (`01` Sepolia, `02` mainnet) and one byte for
 * the field, behind seventeen zero bytes, so nobody mistakes one for a
 * deployment.
 */
import { isAddress, isAddressEqual } from 'viem'

import type { AddressBook, RecoveryChain } from './types'

/** The placeholder addresses of both deployments, by chain, to replace once deployed. */
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
    // Placeholder: the account implementation the Sepolia action serves.
    servedImplementation: '0x0000000000000000000000000000000000c70107'
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
    // Placeholder: the account implementation the mainnet action serves.
    servedImplementation: '0x0000000000000000000000000000000000c70207'
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
