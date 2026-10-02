/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "chrome-extension://cgjhdpkjghcgpplimocodhjgcceglpoj/tab.html#/social-recovery/ceremony"}
 */
/**
 * A Google Password Manager assertion can carry a high `s`, which a verifier
 * that rejects high `s` refuses, so the module normalizes the signature before
 * the method receives it. With the P-256 order n, `s > n/2` becomes `n - s`,
 * and `s <= n/2` stays as it is.
 */
import {
  asBytes,
  ceremony,
  derSignature,
  fakeAssertion,
  fakeMethod,
  fakeOrchestrator,
  hexToBytes,
  hosts,
  installCredentials,
  normalizeSignature,
  P256_HALF_N,
  P256_N,
  parseSignature,
  signaturesIn
} from '@web/modules/social-recovery/shared/ceremony/__tests__/harness'

const R = BigInt('0x1c2e8b4f5a6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9011223344556677')
// A high s with its top bit set, as a real one has, so its DER needs a 0x00 pad.
const HIGH_S = BigInt('0xf1e2d3c4b5a697887766554433221100ffeeddccbbaa99887766554433221100')

const normalized = (r: bigint, s: bigint) => {
  const out = normalizeSignature(derSignature(r, s))
  const parsed = parseSignature(out)
  if (!parsed) {
    throw new Error(`the normalization returned no signature: ${String(out)}`)
  }
  return { out, parsed }
}

describe('the high-s normalization', () => {
  it('rewrites s > n/2 as n - s and keeps r', () => {
    const { parsed } = normalized(R, HIGH_S)
    expect(parsed.r).toBe(R)
    expect(parsed.s).toBe(P256_N - HIGH_S)
    expect(parsed.s <= P256_HALF_N).toBe(true)
  })

  it('rewrites the largest s, n - 1, as 1', () => {
    expect(normalized(R, P256_N - BigInt(1)).parsed.s).toBe(BigInt(1))
  })

  it('rewrites the smallest high s, (n + 1) / 2, as (n - 1) / 2', () => {
    expect(normalized(R, P256_HALF_N + BigInt(1)).parsed.s).toBe(P256_HALF_N)
  })

  const LOW: [string, bigint][] = [
    ['the largest low s, (n - 1) / 2', P256_HALF_N],
    ['a low s with its top byte clear', P256_N - HIGH_S],
    ['s = 1', BigInt(1)]
  ]
  LOW.forEach(([title, s]) =>
    it(`leaves ${title} unchanged`, () => {
      const input = derSignature(R, s)
      const { out, parsed } = normalized(R, s)
      expect(parsed).toMatchObject({ r: R, s })
      // Unchanged means unchanged: a DER answer is the same bytes.
      if (parsed.form === 'der') {
        expect(Array.from(asBytes(out) ?? [])).toEqual(Array.from(input))
      }
    })
  )
})

describe('the DER encoding of a re-encoded signature', () => {
  const encoded = (r: bigint, s: bigint) => Array.from(ceremony().encodeDerSignature({ r, s }))

  it('prefixes a zero byte to an integer whose top bit is set, and none below it', () => {
    expect(encoded(BigInt(0x80), BigInt(0xff))).toEqual([
      0x30, 0x08, 0x02, 0x02, 0x00, 0x80, 0x02, 0x02, 0x00, 0xff
    ])
    expect(encoded(BigInt(0x7f), BigInt(0x0100))).toEqual([
      0x30, 0x07, 0x02, 0x01, 0x7f, 0x02, 0x02, 0x01, 0x00
    ])
  })

  it('encodes 0 as the one byte 0', () => {
    expect(encoded(BigInt(0), BigInt(0))).toEqual([0x30, 0x06, 0x02, 0x01, 0x00, 0x02, 0x01, 0x00])
  })

  it('refuses a negative r or s', () => {
    const message = 'A DER integer of a signature is never negative.'
    expect(() => encoded(BigInt(-1), BigInt(1))).toThrow(message)
    expect(() => encoded(BigInt(1), BigInt(-1))).toThrow(message)
  })

  it('encodes the RFC 6979 P-256 SHA-256 signature of "sample" to its known bytes', () => {
    const r = BigInt('0xEFD48B2AACB6A8FD1140DD9CD45E81D69D2C877B56AAF991C34D0EA84EAF3716')
    const s = BigInt('0xF7CB1C942D657C41D436C7A1B6E29F65F3E900DBB9AFF4064DC4AB2F843ACDA8')
    const der = hexToBytes(
      '0x3046022100efd48b2aacb6a8fd1140dd9cd45e81d69d2c877b56aaf991c34d0ea84eaf3716022100f7cb1c942d657c41d436c7a1b6e29f65f3e900dbb9aff4064dc4ab2f843acda8'
    )
    expect(encoded(r, s)).toEqual(Array.from(der))
  })

  it('pads only the integer whose top bit is set in a full-size pair, and reads back the pair', () => {
    const der = ceremony().encodeDerSignature({ r: R, s: HIGH_S })
    expect(Array.from(der.slice(0, 4))).toEqual([0x30, 0x45, 0x02, 0x20])
    expect(Array.from(der.slice(36, 39))).toEqual([0x02, 0x21, 0x00])
    expect(ceremony().parseDerSignature(der)).toEqual({ r: R, s: HIGH_S })
  })
})
;(['createClaim', 'testAccess'] as const).forEach((host) =>
  describe(`the ${host} host normalizes before the method receives the assertion`, () => {
    let creds: ReturnType<typeof installCredentials>

    afterEach(() => creds.restore())

    const handedOn = async (s: bigint) => {
      creds = installCredentials({ get: async () => fakeAssertion({ r: R, s }).credential })
      const method = fakeMethod()
      const orchestrator = fakeOrchestrator(method)
      await hosts[host]({ method, orchestrator })
      const packaged = [
        ...method.replyFrom.mock.calls.map((c) => c[2]),
        ...orchestrator.replyFrom.mock.calls.map((c) => c[2])
      ]
      expect(packaged.length).toBeGreaterThan(0)
      return packaged.flatMap((material) => signaturesIn(material)).filter((sig) => sig.r === R)
    }

    it('hands on n - s for a high s, and never the high s', async () => {
      const signatures = await handedOn(HIGH_S)
      expect(signatures.length).toBeGreaterThan(0)
      signatures.forEach((sig) => expect(sig.s).toBe(P256_N - HIGH_S))
    })

    it('hands on a low s as it came', async () => {
      const low = P256_N - HIGH_S
      const signatures = await handedOn(low)
      expect(signatures.length).toBeGreaterThan(0)
      signatures.forEach((sig) => expect(sig.s).toBe(low))
    })
  })
)
