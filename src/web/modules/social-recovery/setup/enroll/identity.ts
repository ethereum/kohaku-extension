/**
 * The identity rows' logic, a passport through zkPassport and an Aadhaar
 * identity: the strings each row reads, the ceremony requests the rows store
 * before they open the ceremony tab, what they read back from them and from
 * the tab's report, and the enrollment a passed creation makes.
 *
 * The method's slug on the address book is the slug the ceremony tab's route
 * carries. The tab runs the document's own flow, the phone or the upload, and
 * the access test's check against the deployed method; the row only stores the
 * request and reads the report.
 */
import { isHex } from 'viem'

import type { Address, ApproverRequest, Credential } from '@kohaku-eth/social-recovery'
import type { CeremonyRequestRecord, Enrollment } from '@web/modules/social-recovery/shared/records'

import { isRequestFor } from './passkey'
import type {
  IdentityCeremonyRequest,
  IdentityCopies,
  IdentityEnrollValue,
  IdentityKind,
  IdentityRequestInput,
  RowTarget
} from './types'

const ENROLL = 'socialRecovery.enroll'
const DISCLOSURES = 'socialRecovery.disclosures'

/** What each identity row reads; the passport row's test ids start `passport-`. */
export const IDENTITY_COPY: IdentityCopies = {
  zkpassport: {
    row: 'passport',
    title: `${ENROLL}.passport.title`,
    lead: `${ENROLL}.passport.lead`,
    deviceLine: `${ENROLL}.passport.needsApp`,
    disclosures: [
      `${DISCLOSURES}.identity`,
      `${DISCLOSURES}.passportPublication`,
      'socialRecovery.review.trust.passportRenewal'
    ],
    noneYet: `${ENROLL}.passport.noneYet`,
    action: `${ENROLL}.passport.scanAction`,
    actionLine: `${ENROLL}.passport.scanLine`,
    enrolledLine: `${ENROLL}.passport.enrolledLine`,
    testLead: `${ENROLL}.passport.testLead`,
    testPassed: `${ENROLL}.passport.testPassed`,
    refusedNote: 'socialRecovery.ceremony.declinedNote',
    cancelledNote: 'socialRecovery.ceremony.stoppedNote'
  },
  aadhaar: {
    row: 'aadhaar',
    title: `${ENROLL}.aadhaar.title`,
    lead: `${ENROLL}.aadhaar.lead`,
    deviceLine: `${ENROLL}.aadhaar.takesTime`,
    disclosures: [
      `${DISCLOSURES}.identity`,
      `${DISCLOSURES}.aadhaarPublication`,
      `${ENROLL}.aadhaar.sameQr`
    ],
    noneYet: `${ENROLL}.aadhaar.noneYet`,
    action: `${ENROLL}.aadhaar.uploadAction`,
    actionLine: `${ENROLL}.aadhaar.uploadLine`,
    enrolledLine: `${ENROLL}.aadhaar.enrolledLine`,
    testLead: `${ENROLL}.aadhaar.testLead`,
    testPassed: `${ENROLL}.aadhaar.testPassed`,
    cancelledNote: 'socialRecovery.ceremony.stoppedNote'
  }
}

/**
 * The creation's ceremony request: the method's module, its params on this
 * chain, and what the slot holds now.
 */
export const enrollRequestOf = (
  input: IdentityRequestInput & { methodAddress: Address; replaces: Credential | null }
): CeremonyRequestRecord => ({
  call: 'enroll',
  method: input.kind,
  account: input.account,
  chainId: input.chainId,
  methodAddress: input.methodAddress,
  params: input.params,
  replaces: input.replaces
})

/** The access test's ceremony request: the test request and the method's params. */
export const testRequestRecordOf = (
  input: IdentityRequestInput & { request: ApproverRequest }
): CeremonyRequestRecord => ({
  call: 'testAccess',
  method: input.kind,
  account: input.account,
  chainId: input.chainId,
  request: input.request,
  params: input.params
})

/** A passed creation's value as a report carries it, or null where it names no config. */
export const enrollValueOf = (value: unknown): IdentityEnrollValue | null => {
  if (typeof value !== 'object' || value === null || !('config' in value)) {
    return null
  }
  const { config } = value
  return isHex(config) && config !== '0x' ? { config } : null
}

/**
 * The enrollment a passed creation makes: not tested, with no name of its
 * own, since the row and the editor name the document by its kind.
 */
export const identityEnrollmentOf = (value: IdentityEnrollValue, method: Address): Enrollment => ({
  credential: { method, config: value.config, label: '' },
  test: 'not-tested'
})

/**
 * What a stored identity ceremony request asked for, or null for any other
 * request and for a request another account, chain or method stored.
 */
export const identityRequestOf = (
  record: CeremonyRequestRecord,
  kind: IdentityKind,
  target: RowTarget
): IdentityCeremonyRequest | null => {
  if (record.method !== kind || !isRequestFor(record, target)) {
    return null
  }
  if (record.call === 'enroll') {
    return {
      call: 'enroll',
      ...(record.replaces !== undefined ? { replaces: record.replaces } : {})
    }
  }
  if (record.call === 'testAccess') {
    return { call: 'testAccess', request: record.request }
  }
  return null
}
