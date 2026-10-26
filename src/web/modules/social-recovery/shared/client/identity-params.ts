/**
 * The identity methods' parameters on a chain. They must be the same on every
 * device for the life of a credential, since a different zkPassport scope
 * derives a different identifier for the same document and a different
 * Aadhaar seed a different nullifier, so they are build data per chain: the
 * deployment's facts on a deployed chain, fixed values on the stand-in chain.
 */
import type { Params } from '@kohaku-eth/social-recovery'

import i18n from '@common/config/localization'
import type { CeremonyCall } from '@web/modules/social-recovery/shared/ceremony'

import { deploymentOf } from './deployments'
import type { DeploymentFacts, IdentityParams, IdentityParamsReading, RecoveryChain } from './types'

/** The parameters of the stand-in chain, where the scripted stacks read none of them. */
export const STAND_IN_IDENTITY_PARAMS: IdentityParams = {
  zkPassport: { domain: 'kohaku.stand-in', scope: 'kohaku-recovery', testnetTree: false },
  aadhaar: {
    nullifierSeed: 1n,
    issuerCertificate: '-----BEGIN CERTIFICATE-----\nstand-in\n-----END CERTIFICATE-----'
  }
}

const factsOf = (chain: RecoveryChain): DeploymentFacts | undefined => {
  const deployment = deploymentOf(chain)
  return deployment.kind === 'deployed' ? deployment.facts : undefined
}

/**
 * The identity parameters of a chain: the facts' fields where the chain is
 * deployed, a method whose module address or fields the facts omit having
 * none, since the deployment does not serve it, and the fixed
 * values of the stand-in chain otherwise. `facts` are the chain's own
 * deployment facts unless given.
 */
export const identityParamsOf = (
  chain: RecoveryChain,
  facts: DeploymentFacts | undefined = factsOf(chain)
): IdentityParamsReading => {
  if (!facts) {
    return STAND_IN_IDENTITY_PARAMS
  }
  const reading: IdentityParamsReading = {}
  if (
    facts.methodZkpassport !== undefined &&
    facts.zkPassportDomain !== undefined &&
    facts.zkPassportScope !== undefined
  ) {
    reading.zkPassport = {
      domain: facts.zkPassportDomain,
      scope: facts.zkPassportScope,
      testnetTree: facts.zkPassportTestnetTree ?? false
    }
  }
  if (
    facts.methodAadhaar !== undefined &&
    facts.aadhaarNullifierSeed !== undefined &&
    facts.aadhaarCertificate !== undefined
  ) {
    reading.aadhaar = {
      nullifierSeed: BigInt(facts.aadhaarNullifierSeed),
      issuerCertificate: facts.aadhaarCertificate
    }
  }
  return reading
}

const purposeKeyOf = (call: CeremonyCall): string => {
  switch (call) {
    case 'createClaim':
      return 'socialRecovery.ceremony.phoneRequestPurposeClaim'
    case 'testAccess':
      return 'socialRecovery.ceremony.phoneRequestPurposeTest'
    default:
      return 'socialRecovery.ceremony.phoneRequestPurposeEnroll'
  }
}

/**
 * The params an identity method takes for one call: the zkPassport domain and
 * scope with the name and the purpose the app shows on the phone, one purpose
 * per call so the holder reads on the phone whether the request recovers an
 * account, tests that the passport can, or enrolls it; the Aadhaar seed and
 * certificate. Undefined for any other slug, and for a method the reading
 * holds no parameters of.
 */
export const methodParamsOf = (
  reading: IdentityParamsReading,
  slug: string,
  call: CeremonyCall
): Params | undefined => {
  if (slug === 'zkpassport' && reading.zkPassport) {
    const { domain, scope } = reading.zkPassport
    return {
      domain,
      scope,
      name: i18n.t('socialRecovery.ceremony.phoneRequestName'),
      purpose: i18n.t(purposeKeyOf(call))
    }
  }
  if (slug === 'aadhaar' && reading.aadhaar) {
    const { nullifierSeed, issuerCertificate } = reading.aadhaar
    return { nullifierSeed, issuerCertificate }
  }
  return undefined
}
