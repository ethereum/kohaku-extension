/**
 * Two addresses name the same account or contract whatever their case. A value
 * that is not an address names nothing, so it matches nothing, itself included,
 * and the comparison answers rather than throws.
 *
 * A method module address reads as the kind of method it serves, by the same
 * comparison; the zero address a deployment leaves for a method it omits
 * serves no kind.
 */
import { zeroAddress } from 'viem'

import {
  addressBookOf,
  credentialKindIn,
  methodKindIn,
  sameAddress
} from '@web/modules/social-recovery/shared/client/__tests__/harness'
import { emptySlot } from '@web/modules/social-recovery/shared/records/slots'

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

describe('methodKindIn', () => {
  const { methods } = addressBookOf('sepolia')
  const omitted = { ...methods, aadhaar: zeroAddress }

  it('reads each module as the kind it serves', () => {
    expect(methodKindIn(methods, methods.ecdsa)).toBe('ecdsa')
    expect(methodKindIn(methods, methods.passkey)).toBe('passkey')
    expect(methodKindIn(methods, methods.zkpassport)).toBe('zkpassport')
    expect(methodKindIn(methods, methods.aadhaar)).toBe('aadhaar')
  })

  it('matches a module whatever its case', () => {
    expect(methodKindIn(methods, methods.passkey.toUpperCase().replace('0X', '0x'))).toBe('passkey')
    expect(methodKindIn(methods, methods.passkey.toLowerCase())).toBe('passkey')
  })

  it('reads the zero address as no kind, even where an omitted method holds it', () => {
    expect(methodKindIn(methods, zeroAddress)).toBeUndefined()
    expect(methodKindIn(omitted, zeroAddress)).toBeUndefined()
    expect(methodKindIn(omitted, methods.passkey)).toBe('passkey')
  })

  it('reads an address that is no module of the deployment as no kind', () => {
    expect(methodKindIn(methods, OTHER)).toBeUndefined()
  })

  it('reads a value that is not an address as no kind, rather than throwing', () => {
    expect(methodKindIn(methods, 'not an address')).toBeUndefined()
    expect(methodKindIn(methods, '0x1234')).toBeUndefined()
  })
})

describe('credentialKindIn', () => {
  const { methods } = addressBookOf('sepolia')
  const omitted = { ...methods, aadhaar: zeroAddress }

  it('reads an empty slot as the kind it waits for, even where that method is omitted', () => {
    expect(credentialKindIn(emptySlot('aadhaar'), omitted)).toBe('aadhaar')
    expect(credentialKindIn(emptySlot('ecdsa'), methods)).toBe('ecdsa')
  })

  it("reads an enrolled credential as its method module's kind", () => {
    expect(
      credentialKindIn({ method: methods.zkpassport, config: '0x01', label: 'p' }, methods)
    ).toBe('zkpassport')
  })

  it('reads a credential at the zero address that is no empty slot as no kind', () => {
    expect(
      credentialKindIn({ method: zeroAddress, config: '0x01', label: 'aadhaar' }, omitted)
    ).toBeUndefined()
  })
})
