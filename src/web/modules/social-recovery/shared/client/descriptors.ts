/**
 * The two deployment descriptors the SDK ships, Sepolia and Ethereum mainnet,
 * as plain data this build carries.
 *
 * Every field of both is a placeholder until each deployment lands: the
 * addresses (addresses.ts), the deployment block, the digest version and the
 * release string. The digest version is the domain version this build derives
 * typed data under, the manager contract's `DIGEST_VERSION`;
 * `buildRecoveryClient` refuses a manager that publishes another one.
 *
 * The two audited sets are the kit's claim, not the address fields read back:
 * `shippedMethods` are the four shipped modules and `auditedActions` come from
 * the one audited-actions table (audited-actions.ts).
 */
import type { DeploymentDescriptor } from '@web/modules/social-recovery/sdk-interfaces'

import { PLACEHOLDER_ADDRESSES } from './addresses'
import { auditedActionsOn } from './audited-actions'
import { CHAIN_IDS } from './chains'
import type { AddressBook, RecoveryChain } from './types'

/** The fields of a shipped descriptor that are not addresses, all placeholders until deployment. */
export const DEPLOYMENT_FACTS = {
  sepolia: {
    // Placeholder until the Sepolia deployment lands.
    deployedAt: 0,
    // The digest version this build derives under; a placeholder until the contract's is final.
    digestVersion: '1',
    // Placeholder release string until the Sepolia deployment lands.
    managerVersion: '1.0.0'
  },
  mainnet: {
    // Placeholder until the mainnet deployment lands.
    deployedAt: 0,
    // The digest version this build derives under; a placeholder until the contract's is final.
    digestVersion: '1',
    // Placeholder release string until the mainnet deployment lands.
    managerVersion: '1.0.0'
  }
} as const

/** The shipped descriptor of one chain, as a fresh record every call. */
export const deploymentDescriptor = (chain: RecoveryChain): DeploymentDescriptor => {
  const a = PLACEHOLDER_ADDRESSES[chain]
  const facts = DEPLOYMENT_FACTS[chain]
  return {
    chainId: CHAIN_IDS[chain],
    manager: a.manager,
    methodEcdsa: a.methodEcdsa,
    methodPasskey: a.methodPasskey,
    methodAadhaar: a.methodAadhaar,
    methodZkpassport: a.methodZkpassport,
    action: a.action,
    servedImplementation: a.servedImplementation,
    deployedAt: facts.deployedAt,
    digestVersion: facts.digestVersion,
    managerVersion: facts.managerVersion,
    shippedMethods: [a.methodEcdsa, a.methodPasskey, a.methodAadhaar, a.methodZkpassport],
    auditedActions: auditedActionsOn(chain).map((row) => row.action)
  }
}

/**
 * The descriptor a client is built with: the chain's shipped descriptor with
 * the configuration's address book in its address fields. The two audited
 * sets stay the shipped ones, so an address book naming another action or
 * method gets the unaudited and unshipped warnings rather than silencing them.
 */
export const descriptorOf = (chain: RecoveryChain, book: AddressBook): DeploymentDescriptor => ({
  ...deploymentDescriptor(chain),
  manager: book.manager,
  methodEcdsa: book.methods.ecdsa,
  methodPasskey: book.methods.passkey,
  methodAadhaar: book.methods.aadhaar,
  methodZkpassport: book.methods.zkpassport,
  action: book.action
})
