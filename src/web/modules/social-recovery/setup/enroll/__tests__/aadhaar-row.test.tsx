/**
 * @jest-environment jsdom
 *
 * The Aadhaar row: the ceremony tab takes the QR image and proves it in the
 * browser, and returns here with its report. The row says what the method
 * shows, what a recovery publishes, and that a recovery takes the same QR
 * again; it carries no other warning.
 */
import { describeIdentityRow } from '@web/modules/social-recovery/setup/enroll/__fixtures__/identity-row'

const AADHAAR = 'socialRecovery.enroll.aadhaar'

describeIdentityRow({
  slug: 'aadhaar',
  row: 'aadhaar',
  title: `${AADHAAR}.title`,
  lead: `${AADHAAR}.lead`,
  deviceLine: `${AADHAAR}.takesTime`,
  noneYet: `${AADHAAR}.noneYet`,
  action: `${AADHAAR}.uploadAction`,
  actionLine: `${AADHAAR}.uploadLine`,
  enrolledLine: `${AADHAAR}.enrolledLine`,
  testLead: `${AADHAAR}.testLead`,
  testPassed: `${AADHAAR}.testPassed`,
  refusedNote: 'socialRecovery.ceremony.refusedNote',
  disclosures: [
    'socialRecovery.disclosures.identity',
    'socialRecovery.disclosures.aadhaarPublication',
    `${AADHAAR}.sameQr`
  ]
})
