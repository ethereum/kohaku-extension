import type { ProviderKind, ReviewWaitChip, TrustReadName } from './types'

/** The picker's fixed lengths with their chip words, so the review names a length as the picker did. */
export const REVIEW_WAIT_CHIPS: readonly ReviewWaitChip[] = [
  { id: 'hours24', hours: 24 },
  { id: 'hours48', hours: 48 },
  { id: 'hours72', hours: 72 },
  { id: 'days7', hours: 7 * 24 }
]

/** The provider kinds that read through a light client with its prover; any other is a plain node. */
export const LIGHT_CLIENT_PROVIDERS: readonly ProviderKind[] = ['helios', 'colibri']

/** The two declarations the trust list reads for every method of the path. */
export const TRUST_READ_NAMES: readonly TrustReadName[] = ['trustedParties', 'moduleInfo']
