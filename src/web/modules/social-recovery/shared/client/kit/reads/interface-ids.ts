/**
 * The ERC-165 interface ids the deployed contracts report, each the XOR of
 * the selectors of its interface, and the value a method answers for a proof
 * it accepts.
 */

/** A method module's interface: `verify`, `trustedParties`, `supportsInterface`, `name`, `version`. */
export const METHOD_INTERFACE_ID = '0xf057a368' as const

/** A policy action's interface: `supportsAccount`, `isAuthority`, `isAuthorized`, `supportsInterface`, `name`, `version`. */
export const ACTION_INTERFACE_ID = '0x59cd148e' as const

/** The manager's interface: every function of its ABI. */
export const MANAGER_INTERFACE_ID = '0x675e6a4a' as const

/** What `verify` answers for an accepted proof: the selector of `verify(bytes,bytes32,bytes)`. */
export const VERIFY_MAGIC_VALUE = '0x024ad318' as const
