/**
 * @jest-environment jsdom
 *
 * The Aadhaar row: the ceremony tab takes the QR image and proves it in the
 * browser, and returns here with its report. The row says what the method
 * shows, what a recovery publishes, and that a recovery takes the same QR
 * again; it carries no other warning.
 */
import { describeIdentityRow } from '@web/modules/social-recovery/setup/enroll/__fixtures__/identity-row'

// The spinner's animation needs a native module jsdom lacks; a plain view stands in.
jest.mock('@common/components/Spinner', () => {
  /* eslint-disable @typescript-eslint/no-var-requires, global-require */
  const mockReact: typeof import('react') = require('react')
  const { View: MockView }: typeof import('react-native') = require('react-native')
  /* eslint-enable @typescript-eslint/no-var-requires, global-require */
  return {
    __esModule: true,
    default: () => mockReact.createElement(MockView, { testID: 'spinner' })
  }
})

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
