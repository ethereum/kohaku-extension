/** What the identity row suites know of one kind: its slug, its test ids and the keys it reads. */
export interface IdentityRowCase {
  /** The slot kind, which is also the ceremony route's method slug. */
  slug: 'zkpassport' | 'aadhaar'
  /** The prefix of the row's test ids. */
  row: 'passport' | 'aadhaar'
  title: string
  lead: string
  deviceLine: string
  noneYet: string
  action: string
  actionLine: string
  enrolledLine: string
  testLead: string
  testPassed: string
  /** The note a refused ceremony reads on the row. */
  refusedNote: string
  /** The lines of the disclosure card, in order. */
  disclosures: string[]
}
