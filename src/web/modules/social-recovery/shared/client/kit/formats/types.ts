import type { Address, Credential, Hex } from '@web/modules/social-recovery/sdk-interfaces'

/**
 * One credential at its place: the flat place number in body order across
 * every clause, the clause it sits in, the credential, and the salt its
 * commitment uses, the supplied one or the default.
 */
export interface PlacedCredential {
  place: number
  clause: number
  credential: Credential
  salt: Hex
}

/** The passkey method's config fields: the P-256 point and the hash of the relying-party id. */
export interface PasskeyConfigFields {
  x: Hex
  y: Hex
  rpIdHash: Hex
}

/** The fields of one `commitSetup` call on the manager. */
export interface CommitSetupCall {
  action: Address
  setupCommitment: Hex
  nonce: bigint
  publicMetadata: Hex
  privateMetadata: Hex
}
