import { maxUint256 } from 'viem'

import type { Address, Hex } from '@web/modules/social-recovery/sdk-interfaces'

import {
  checksumAddress,
  ellipsizeName,
  renderApproval,
  renderFullAddress,
  renderHash,
  renderHiddenValue,
  renderMemberList,
  renderPaymentOrder,
  renderShortAddress,
  renderTokenAmount,
  Translate
} from '@web/modules/social-recovery/shared/display'

const expectRefusal = (fn: () => unknown, message: string) => {
  expect(fn).toThrow(TypeError)
  expect(fn).toThrow(new TypeError(message))
}

const CHECKSUMMED = '0x2b0F5E98Ee98ADC9865745e98802F333f72F6ef5'
const LOWER = '0x2b0f5e98ee98adc9865745e98802f333f72f6ef5'
const UPPER = '0x2B0F5E98EE98ADC9865745E98802F333F72F6EF5'
// One letter's case flipped: mixed case with a checksum that does not hold.
const BAD_CHECKSUM = '0x2B0F5E98Ee98ADC9865745e98802F333f72F6ef5'

describe('address checksum: one case is checksummed, a mixed case must hold', () => {
  it('checksums a lowercase address', () => {
    expect(checksumAddress(LOWER)).toBe(CHECKSUMMED)
  })

  it('returns a mixed-case address whose checksum holds as it is', () => {
    expect(checksumAddress(CHECKSUMMED)).toBe(CHECKSUMMED)
  })

  it('checksums an all-uppercase address', () => {
    expect(checksumAddress(UPPER)).toBe(CHECKSUMMED)
  })

  it('refuses a mixed-case address whose checksum does not hold', () => {
    expectRefusal(() => checksumAddress(BAD_CHECKSUM), `Bad address checksum: ${BAD_CHECKSUM}`)
  })

  it('refuses the forty digits without the 0x prefix', () => {
    const bare = LOWER.slice(2) as Address
    expectRefusal(() => checksumAddress(bare), `Not an address: ${bare}`)
  })

  it('refuses 39 or 41 hex digits', () => {
    const short = LOWER.slice(0, -1) as Address
    const long = `${LOWER}0` as Address
    expectRefusal(() => checksumAddress(short), `Not an address: ${short}`)
    expectRefusal(() => checksumAddress(long), `Not an address: ${long}`)
  })

  it('refuses forty digits with one that is not hex', () => {
    const nonHex = `${LOWER.slice(0, -1)}g` as Address
    expectRefusal(() => checksumAddress(nonHex), `Not an address: ${nonHex}`)
  })

  it('refuses an address with a space before it or a newline after it', () => {
    const leadingSpace = ` ${LOWER}` as Address
    const trailingNewline = `${LOWER}\n` as Address
    expectRefusal(() => checksumAddress(leadingSpace), `Not an address: ${leadingSpace}`)
    expectRefusal(() => checksumAddress(trailingNewline), `Not an address: ${trailingNewline}`)
  })
})

describe('short address: four and four hex digits after the prefix', () => {
  it('renders 0x2b0F…6ef5', () => {
    expect(renderShortAddress(CHECKSUMMED)).toBe('0x2b0F…6ef5')
  })

  it('checksums a lowercase or an all-uppercase address', () => {
    expect(renderShortAddress(LOWER)).toBe('0x2b0F…6ef5')
    expect(renderShortAddress(UPPER)).toBe('0x2b0F…6ef5')
  })

  it('rejects a mixed-case address whose checksum does not hold', () => {
    expect(() => renderShortAddress(BAD_CHECKSUM)).toThrow()
  })
})

describe('full address: whole, no grouping', () => {
  it('renders the checksummed address whole', () => {
    expect(renderFullAddress(LOWER)).toBe('0x2b0F5E98Ee98ADC9865745e98802F333f72F6ef5')
    expect(renderFullAddress(UPPER)).toBe('0x2b0F5E98Ee98ADC9865745e98802F333f72F6ef5')
  })

  it('rejects a mixed-case address whose checksum does not hold', () => {
    expect(() => renderFullAddress(BAD_CHECKSUM)).toThrow()
  })

  it('rejects a value that is not a 20-byte address', () => {
    expect(() => renderFullAddress('0x2b0f')).toThrow()
  })
})

describe('user-typed method name: caps at 24 characters', () => {
  it('leaves a 24-character name unchanged', () => {
    expect(ellipsizeName('Abcdefghijklmnopqrstuvwx')).toBe('Abcdefghijklmnopqrstuvwx')
  })

  it('leaves a short name unchanged', () => {
    expect(ellipsizeName('My passkey')).toBe('My passkey')
  })

  it('caps a 25-character name at 24, the ellipsis the last of them', () => {
    expect(ellipsizeName('Abcdefghijklmnopqrstuvwxy')).toBe('Abcdefghijklmnopqrstuvw…')
  })

  it('caps a long name at the same 24', () => {
    expect(ellipsizeName('x'.repeat(80))).toBe(`${'x'.repeat(23)}…`)
  })

  it('counts a joined emoji as one character and never splits it', () => {
    const family = '\u{1F468}‍\u{1F469}‍\u{1F467}'
    // 24 graphemes, many more code points: unchanged.
    expect(ellipsizeName(`${'a'.repeat(23)}${family}`)).toBe(`${'a'.repeat(23)}${family}`)
    // 25 graphemes: the emoji is the 23rd and stays whole before the ellipsis.
    expect(ellipsizeName(`${'a'.repeat(22)}${family}bb`)).toBe(`${'a'.repeat(22)}${family}…`)
  })

  it('counts a flag as one character and never splits it', () => {
    const flag = '\u{1F1E9}\u{1F1EA}'
    expect(ellipsizeName(`${'a'.repeat(22)}${flag}cc`)).toBe(`${'a'.repeat(22)}${flag}…`)
  })

  it('leaves an empty name empty', () => {
    expect(ellipsizeName('')).toBe('')
  })
})

describe('transaction hash or challenge: twelve and six', () => {
  // A 32-byte hash.
  const HASH: Hex = `0x0123456789ab${'c'.repeat(46)}fedcba`

  it('renders 0x, twelve leading hex digits, an ellipsis and six trailing', () => {
    expect(renderHash(HASH)).toBe('0x0123456789ab…fedcba')
  })
})

describe('approval blob: twelve and eight', () => {
  // A 65-byte signature-shaped blob.
  const BLOB: Hex = `0xa1b2c3d4e5f6${'0'.repeat(110)}9876fedc`

  it('renders 0x, twelve leading hex digits, an ellipsis and eight trailing', () => {
    expect(renderApproval(BLOB)).toBe('0xa1b2c3d4e5f6…9876fedc')
  })
})

describe('hash and approval: only 0x and hex digits render', () => {
  const NOT_HEX = [
    '',
    'hash',
    ' 0xab',
    '0123456789abcdef',
    '0X0123456789abcdef',
    '0x0123456789abcdeg'
  ] as Hex[]
  const SHORT_HEX: Hex[] = ['0x', '0xabc', '0xABCdef']

  it('refuses a value that is not 0x and hex digits, naming the value', () => {
    NOT_HEX.forEach((value) => {
      expectRefusal(() => renderHash(value), `Not hex: ${value}`)
      expectRefusal(() => renderApproval(value), `Not hex: ${value}`)
    })
  })

  it('renders a short hex value whole: empty, odd length or uppercase digits', () => {
    SHORT_HEX.forEach((value) => {
      expect(renderHash(value)).toBe(value)
      expect(renderApproval(value)).toBe(value)
    })
  })

  it('renders eighteen digits of a hash whole and truncates nineteen', () => {
    expect(renderHash(`0x${'a'.repeat(18)}`)).toBe(`0x${'a'.repeat(18)}`)
    expect(renderHash(`0x${'a'.repeat(19)}`)).toBe(`0x${'a'.repeat(12)}…${'a'.repeat(6)}`)
  })
})

describe('hidden value: sixteen dots beside a hidden chip', () => {
  it('renders exactly sixteen dots and the Hidden chip', () => {
    expect(renderHiddenValue()).toEqual({
      dots: '••••••••••••••••',
      chip: 'Hidden'
    })
  })
})

describe('member list: three members then a count of the rest', () => {
  const members = ['alice.eth', 'bob.eth', 'carol.eth', 'dave.eth', 'erin.eth']

  it('renders a list of three with no count', () => {
    expect(renderMemberList(members.slice(0, 3))).toEqual({
      shown: ['alice.eth', 'bob.eth', 'carol.eth'],
      restCount: 0,
      more: null
    })
  })

  it('renders a list of four as three then "1 more member"', () => {
    expect(renderMemberList(members.slice(0, 4))).toEqual({
      shown: ['alice.eth', 'bob.eth', 'carol.eth'],
      restCount: 1,
      more: '1 more member'
    })
  })

  it('renders a list of five as three then "2 more members"', () => {
    expect(renderMemberList(members)).toEqual({
      shown: ['alice.eth', 'bob.eth', 'carol.eth'],
      restCount: 2,
      more: '2 more members'
    })
  })

  it('renders a list of one or two whole with no count', () => {
    expect(renderMemberList(['alice.eth'])).toEqual({
      shown: ['alice.eth'],
      restCount: 0,
      more: null
    })
    expect(renderMemberList(['alice.eth', 'bob.eth'])).toEqual({
      shown: ['alice.eth', 'bob.eth'],
      restCount: 0,
      more: null
    })
  })

  it('renders every member when asked to show all', () => {
    expect(renderMemberList(members, { showAll: true })).toEqual({
      shown: members,
      restCount: 0,
      more: null
    })
  })
})

describe('token amount', () => {
  it('refuses a negative amount', () => {
    expectRefusal(() => renderTokenAmount(-12_500_000n, 6), 'Not a token amount: -12500000')
  })

  it('renders a zero amount as 0.00', () => {
    expect(renderTokenAmount(0n, 6)).toBe('0.00')
  })

  it('refuses decimals that are negative, fractional or not a number', () => {
    expectRefusal(() => renderTokenAmount(12n, -2), 'Not token decimals: -2')
    expectRefusal(() => renderTokenAmount(12n, 1.5), 'Not token decimals: 1.5')
    expectRefusal(() => renderTokenAmount(12n, NaN), 'Not token decimals: NaN')
  })

  it('still renders with zero decimals and with six', () => {
    expect(renderTokenAmount(12n, 0)).toBe('12.00')
    expect(renderTokenAmount(12_500_000n, 6)).toBe('12.50')
  })

  it('renders the largest uint256 at 18 decimals with every digit', () => {
    expect(renderTokenAmount(maxUint256, 18)).toBe(
      '115792089237316195423570985008687907853269984665640564039457.584007913129639935'
    )
  })

  it('renders an amount at more than 80 decimals', () => {
    expect(renderTokenAmount(1n, 100)).toBe(`0.${'0'.repeat(99)}1`)
    expect(renderTokenAmount(BigInt(`123${'0'.repeat(98)}`), 100)).toBe('1.23')
  })

  it('renders the largest uint256 at 255 decimals, the most a token declares', () => {
    expect(renderTokenAmount(maxUint256, 255)).toBe(`0.${'0'.repeat(177)}${maxUint256}`)
  })

  it('refuses 256 decimals, one past what a token declares', () => {
    expectRefusal(() => renderTokenAmount(1n, 256), 'Not token decimals: 256')
  })

  it('renders an amount of 2^511 or more whole', () => {
    const amount = BigInt(`0x8${'0'.repeat(127)}`)
    expect(renderTokenAmount(amount, 0)).toBe(`${amount}.00`)
  })
})

describe('payment order: amount, symbol and payee, or no payment, in one form', () => {
  const USDC: Address = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
  const PAYEE: Address = LOWER
  const ZERO: Address = '0x0000000000000000000000000000000000000000'
  const token = { symbol: 'USDC', decimals: 6 }

  it('renders 12.50 USDC to the payee in the full form', () => {
    expect(renderPaymentOrder({ token: USDC, amount: 12_500_000n, payee: PAYEE }, token)).toBe(
      '12.50 USDC to 0x2b0F5E98Ee98ADC9865745e98802F333f72F6ef5'
    )
  })

  it('renders a whole amount with two decimals and a long fraction whole', () => {
    expect(renderPaymentOrder({ token: USDC, amount: 3_000_000n, payee: PAYEE }, token)).toBe(
      '3.00 USDC to 0x2b0F5E98Ee98ADC9865745e98802F333f72F6ef5'
    )
    expect(renderPaymentOrder({ token: USDC, amount: 1_234_567n, payee: PAYEE }, token)).toBe(
      '1.234567 USDC to 0x2b0F5E98Ee98ADC9865745e98802F333f72F6ef5'
    )
  })

  it('renders an open payee as "to whoever executes"', () => {
    expect(renderPaymentOrder({ token: USDC, amount: 12_500_000n, payee: ZERO }, token)).toBe(
      '12.50 USDC to whoever executes'
    )
  })

  it('refuses a zero payee with an uppercase 0X prefix instead of reading it as open', () => {
    const malformedZero = `0X${'0'.repeat(40)}` as Address
    expectRefusal(
      () => renderPaymentOrder({ token: USDC, amount: 12_500_000n, payee: malformedZero }, token),
      `Not an address: ${malformedZero}`
    )
    expect(renderPaymentOrder({ token: USDC, amount: 12_500_000n, payee: ZERO }, token)).toBe(
      '12.50 USDC to whoever executes'
    )
  })

  it('refuses a negative amount', () => {
    expectRefusal(
      () => renderPaymentOrder({ token: USDC, amount: -12_500_000n, payee: PAYEE }, token),
      'Not a token amount: -12500000'
    )
  })

  it('renders a zero amount as the words no payment', () => {
    expect(renderPaymentOrder({ token: USDC, amount: 0n, payee: PAYEE }, token)).toBe('No payment')
  })

  it('renders an absent order as the words no payment', () => {
    expect(renderPaymentOrder(undefined, token)).toBe('No payment')
  })

  it('passes the full payee to a translate function given as the third argument', () => {
    const calls: [string, Record<string, unknown> | undefined][] = []
    const t: Translate = (key, options) => {
      calls.push([key, options])
      return `<${key}>`
    }
    expect(renderPaymentOrder({ token: USDC, amount: 12_500_000n, payee: PAYEE }, token, t)).toBe(
      '<socialRecovery.display.paymentOrder>'
    )
    expect(calls).toEqual([
      [
        'socialRecovery.display.paymentOrder',
        {
          amount: '12.50',
          symbol: 'USDC',
          payee: '0x2b0F5E98Ee98ADC9865745e98802F333f72F6ef5'
        }
      ]
    ])
  })
})
