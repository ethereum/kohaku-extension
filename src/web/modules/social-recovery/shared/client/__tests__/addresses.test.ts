/**
 * Two addresses name the same account or contract whatever their case. A value
 * that is not an address names nothing, so it matches nothing, itself included,
 * and the comparison answers rather than throws.
 */
import { sameAddress } from './harness'

const CHECKSUMMED = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'
const LOWER = CHECKSUMMED.toLowerCase()
const UPPER = `0x${CHECKSUMMED.slice(2).toUpperCase()}`
/** The checksummed address with the case of its first three letters changed, so its checksum is wrong. */
const BAD_CHECKSUM = '0x5AaEb6053F3E94C9b9A09f33669435E7Ef1BeAed'
const OTHER = '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359'

describe('sameAddress', () => {
  it('matches an address in lower case, in upper case and checksummed', () => {
    expect(sameAddress(LOWER, CHECKSUMMED)).toBe(true)
    expect(sameAddress(CHECKSUMMED, LOWER)).toBe(true)
    expect(sameAddress(UPPER, LOWER)).toBe(true)
    expect(sameAddress(CHECKSUMMED, CHECKSUMMED)).toBe(true)
  })

  it('matches a mixed-case address whose checksum is wrong by its value', () => {
    expect(sameAddress(BAD_CHECKSUM, LOWER)).toBe(true)
  })

  it('does not match two different addresses', () => {
    expect(sameAddress(CHECKSUMMED, OTHER)).toBe(false)
    expect(sameAddress(LOWER, OTHER.toLowerCase())).toBe(false)
  })

  it('matches nothing where either side is missing', () => {
    expect(sameAddress(undefined, CHECKSUMMED)).toBe(false)
    expect(sameAddress(CHECKSUMMED, undefined)).toBe(false)
    expect(sameAddress(undefined, undefined)).toBe(false)
    expect(sameAddress('', '')).toBe(false)
  })

  const NOT_ADDRESSES = ['not an address', '0x1234', `0x${'ab'.repeat(32)}`, CHECKSUMMED.slice(2)]
  NOT_ADDRESSES.forEach((text) =>
    it(`matches nothing with ${text}, not even the same text`, () => {
      expect(sameAddress(text, text)).toBe(false)
      expect(sameAddress(text, CHECKSUMMED)).toBe(false)
      expect(sameAddress(CHECKSUMMED, text)).toBe(false)
    })
  )
})
