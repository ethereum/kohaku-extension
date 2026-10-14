/**
 * The credentials of a rule as the manager commits to them: the salt each
 * place uses, each credential's commitment, and the config layouts of the
 * two methods the wallet enrolls.
 */
import { decodeAbiParameters, encodeAbiParameters, keccak256 } from 'viem'

import type { Address, Configuration, Hex } from '@web/modules/social-recovery/sdk-interfaces'

import type { PasskeyConfigFields, PlacedCredential } from './types'

/**
 * The salt a place uses when its holder supplied none:
 * `keccak256(abi.encode(account, place))`, never packed.
 */
export const defaultSaltOf = (account: Address, place: number): Hex =>
  keccak256(
    encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [account, BigInt(place)])
  )

/** One credential's commitment, `keccak256(abi.encode(method, config, salt))`. */
export const credentialCommitmentOf = (method: Address, config: Hex, salt: Hex): Hex =>
  keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'bytes' }, { type: 'bytes32' }],
      [method, config, salt]
    )
  )

/**
 * Every credential of a configuration at its place, numbered in body order
 * across every clause, each with the salt its commitment uses.
 */
export const placedCredentialsOf = (
  account: Address,
  configuration: Pick<Configuration, 'clauses'>
): PlacedCredential[] =>
  configuration.clauses.flatMap((clause, clauseIndex, clauses) => {
    const first = clauses
      .slice(0, clauseIndex)
      .reduce((count, earlier) => count + earlier.credentials.length, 0)
    return clause.credentials.map((credential, index) => ({
      place: first + index,
      clause: clauseIndex,
      credential,
      salt: credential.salt ?? defaultSaltOf(account, first + index)
    }))
  })

/** The guardian (ECDSA) method's config: the approver's address, `abi.encode(address)`. */
export const ecdsaConfigOf = (approver: Address): Hex =>
  encodeAbiParameters([{ type: 'address' }], [approver])

const PASSKEY_CONFIG = [{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }] as const

/** The passkey method's config: `abi.encode(bytes32 x, bytes32 y, bytes32 rpIdHash)`. */
export const passkeyConfigOf = ({ x, y, rpIdHash }: PasskeyConfigFields): Hex =>
  encodeAbiParameters(PASSKEY_CONFIG, [x, y, rpIdHash])

/**
 * The fields of a passkey config, or null where the bytes do not decode as
 * three `bytes32` words or are not exactly their encoding.
 */
export const passkeyConfigFieldsOf = (config: Hex): PasskeyConfigFields | null => {
  let fields: PasskeyConfigFields
  try {
    const [x, y, rpIdHash] = decodeAbiParameters(PASSKEY_CONFIG, config)
    fields = { x, y, rpIdHash }
  } catch {
    return null
  }
  return passkeyConfigOf(fields) === config.toLowerCase() ? fields : null
}
