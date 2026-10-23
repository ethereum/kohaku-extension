/**
 * The device call a host runs between the method's options and the method's
 * packaging: the extension calls the authenticator, the phone or the prover
 * itself and hands the method the material.
 *
 * A device returns the material, or a stop read before the method runs: the
 * cancelled or refused note, a relying party the extension does not serve, a
 * phone that never connected. A host never calls the method's packaging after
 * a stop.
 */
import type { Material } from '@kohaku-eth/social-recovery'

import type { CeremonyDevice } from './types'

/**
 * The steps a host renders while it runs: the five every binding shares, the
 * phone's three answers to a zkPassport request, and the in-page prover's
 * download of its files and its proof.
 */
export const CEREMONY_STEPS = [
  'preparing',
  'waitingForDevice',
  'waitingForPhone',
  'packaging',
  'checking',
  'requestReceived',
  'generating',
  'resultReceived',
  'fetchingFiles',
  'proving'
] as const

/**
 * A device whose material the caller already holds: the guardian's address at
 * enrollment, the signature the guardian's wallet returned, the proofs a
 * zkPassport bridge delivered or the QR data an Aadhaar upload decoded. The
 * device asks nothing of anyone.
 */
export const providedMaterialDevice = (material: {
  enroll?: Material
  sign?: Material
}): CeremonyDevice => ({
  enroll: async () => ({ ok: true, material: material.enroll }),
  sign: async () => ({ ok: true, material: material.sign })
})
