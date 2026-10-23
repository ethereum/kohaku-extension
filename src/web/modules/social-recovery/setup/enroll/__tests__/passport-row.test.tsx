/**
 * @jest-environment jsdom
 *
 * The passport row: the ceremony tab shows the code the zkPassport app scans
 * on the phone, and returns here with its report. The row says what the
 * method shows, what a recovery publishes, and that renewing the passport
 * ends the method. A refusal reads as the holder's decline on the phone.
 */
import { describeIdentityRow } from '@web/modules/social-recovery/setup/enroll/__fixtures__/identity-row'

const PASSPORT = 'socialRecovery.enroll.passport'

describeIdentityRow({
  slug: 'zkpassport',
  row: 'passport',
  title: `${PASSPORT}.title`,
  lead: `${PASSPORT}.lead`,
  deviceLine: `${PASSPORT}.needsApp`,
  noneYet: `${PASSPORT}.noneYet`,
  action: `${PASSPORT}.scanAction`,
  actionLine: `${PASSPORT}.scanLine`,
  enrolledLine: `${PASSPORT}.enrolledLine`,
  testLead: `${PASSPORT}.testLead`,
  testPassed: `${PASSPORT}.testPassed`,
  refusedNote: 'socialRecovery.ceremony.declinedNote',
  disclosures: [
    'socialRecovery.disclosures.identity',
    'socialRecovery.disclosures.passportPublication',
    'socialRecovery.review.trust.passportRenewal'
  ]
})
