import { dedicatedToOneSAPriv } from '@ambire-common/interfaces/keystore'

/**
 * The privilege the recovered account's creation is computed with where no
 * privilege event names an earlier grant of the removed key: the one the
 * wallet's picker gives the key of a smart account it creates. The creation
 * privilege itself emits no event, so this reproduces an account the create
 * door made on its first recovery only. Otherwise the computed creation does
 * not reproduce the deployed account's address and stands in for the
 * account's creation record, which the recovery reads do not carry yet.
 */
export const CREATION_STAND_IN = dedicatedToOneSAPriv

/** How long the add of the recovered account may take before it reads as failed, in ms. */
export const ADD_LIMIT_MS = 20_000

/** The kinds of method that prove an identity, whose identifier stays the same across setups. */
export const IDENTITY_KINDS = ['zkpassport', 'aadhaar'] as const
