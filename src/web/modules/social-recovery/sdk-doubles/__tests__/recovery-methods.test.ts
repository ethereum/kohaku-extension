import { addressOf } from '@web/modules/social-recovery/sdk-doubles'
import { DEVICE_KINDS, type Address, type Hex } from '@web/modules/social-recovery/sdk-interfaces'
import { concat, getAddress, hexToBytes, keccak256, sha256, slice, stringToHex } from 'viem'

import {
  METHOD_KINDS,
  MethodKind,
  createWorld,
  eachDescribe,
  isHex
} from '@web/modules/social-recovery/sdk-doubles/__tests__/harness'

eachDescribe(METHOD_KINDS)('the %s method double', (kind) => {
  it('serves the module the descriptor names for its kind', () => {
    const world = createWorld()
    const expected: Record<MethodKind, Address> = {
      wallet: world.descriptor.methodEcdsa,
      passkey: world.descriptor.methodPasskey,
      zkPassport: world.descriptor.methodZkpassport,
      aadhaar: world.descriptor.methodAadhaar
    }
    const modules = world.methods[kind].modules(world.descriptor)
    expect(modules.map((m) => m.toLowerCase())).toContain(expected[kind].toLowerCase())
  })

  it('states a device kind from a context alone', async () => {
    const world = createWorld()
    const ctx = {
      request: {} as never,
      place: 0,
      digest: `0x${'33'.repeat(32)}` as const,
      typedData: {}
    }
    const facts = world.methods[kind].describe(ctx)
    expect(DEVICE_KINDS).toContain(facts.kind)
    const proof = await world.methods[kind].replyFrom(ctx, {}, `0x${'ab'.repeat(65)}`)
    expect(isHex(proof) || (proof as { kind: string }).kind === 'reply-failure').toBe(true)
  })
})

it('enrolls a passkey whose rpIdHash is the SHA-256 of the relying party id', async () => {
  const world = createWorld()
  const orchestrator = world.orchestrator()
  const method = world.descriptor.methodPasskey
  const input = orchestrator.enrollInput(method, { relyingPartyId: 'wallet.example' })
  const x: Hex = `0x${'11'.repeat(32)}`
  const y: Hex = `0x${'22'.repeat(32)}`
  const spki = hexToBytes(
    concat(['0x3059301306072a8648ce3d020106082a8648ce3d030107034200', '0x04', x, y])
  )
  const config = await orchestrator.configFrom(method, input, {
    credential: { response: { getPublicKey: () => spki.buffer } }
  })
  expect(isHex(config)).toBe(true)
  expect(world.methods.passkey.codec.decodeConfig(config as Hex)).toEqual({
    x,
    y,
    rpIdHash: sha256(stringToHex('wallet.example'))
  })
})

it('binds the wallet and the passkey to different devices', () => {
  const { methods } = createWorld()
  expect(methods.wallet.deviceBinding).not.toBe(methods.passkey.deviceBinding)
})

const ANA = getAddress(addressOf('ana'))

/** One config's fields per method kind, as its decoder returns them. */
const CONFIG_FIELDS: Record<MethodKind, unknown> = {
  wallet: { address: ANA },
  passkey: {
    x: `0x${'11'.repeat(32)}`,
    y: `0x${'22'.repeat(32)}`,
    rpIdHash: sha256(stringToHex('wallet.example'))
  },
  zkPassport: { uniqueIdentifier: keccak256(stringToHex('passport-holder')) },
  aadhaar: { nullifier: keccak256(stringToHex('aadhaar-holder')) }
}

eachDescribe(METHOD_KINDS)('the %s config codec', (kind) => {
  const { codec } = createWorld().methods[kind]
  const config = codec.encodeConfig(CONFIG_FIELDS[kind])

  it('round-trips a canonical config', () => {
    expect(codec.decodeConfig(config)).toEqual(CONFIG_FIELDS[kind])
    expect(codec.encodeConfig(codec.decodeConfig(config))).toBe(config)
  })

  it('decodes the canonical config written in upper-case hex to the same fields', () => {
    expect(codec.decodeConfig(`0x${config.slice(2).toUpperCase()}`)).toEqual(CONFIG_FIELDS[kind])
  })

  it('refuses a config with four bytes appended', () => {
    expect(() => codec.decodeConfig(concat([config, '0xdeadbeef']))).toThrow()
  })

  it('refuses a config with a whole word appended', () => {
    expect(() => codec.decodeConfig(concat([config, `0x${'00'.repeat(32)}`]))).toThrow()
  })
})

describe('the wallet config codec', () => {
  const { methods } = createWorld()
  const config = methods.wallet.codec.encodeConfig({ address: ANA })

  it('refuses an address word whose padding is not zero', () => {
    const dirty = concat(['0x01', slice(config, 1)])
    expect(() => methods.wallet.codec.decodeConfig(dirty)).toThrow()
  })

  it('names no address for a request under a config with bytes appended', () => {
    const ctx = {
      request: { config: concat([config, '0xdeadbeef']) } as never,
      place: 0,
      digest: `0x${'33'.repeat(32)}` as const,
      typedData: {}
    }
    expect(methods.wallet.describe({ ...ctx, request: { config } as never })).toMatchObject({
      address: ANA
    })
    expect(methods.wallet.describe(ctx)).toMatchObject({ address: undefined })
  })
})
