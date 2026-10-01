import { PasskeyMethodDouble } from '@web/modules/social-recovery/sdk-doubles'
import type {
  ApproverReply,
  ApproverRequest,
  Hex
} from '@web/modules/social-recovery/sdk-interfaces'
import {
  createClaimHost,
  enrollHost,
  testAccessHost
} from '@web/modules/social-recovery/shared/ceremony'
import {
  authenticatorData,
  EXTENSION_ORIGIN,
  fakeAttestation,
  FLAGS,
  ORIGIN_HASH,
  P256_N,
  SYNCED_FLAGS,
  toBuffer
} from '@web/modules/social-recovery/shared/ceremony/__tests__/harness'
import { normalizeP256S, parseDerSignature } from '@web/modules/social-recovery/shared/webauthn'
import {
  bytesToHex,
  concat,
  hexToBigInt,
  hexToBytes,
  numberToHex,
  sha256,
  slice,
  stringToHex
} from 'viem'

import {
  type Assertion,
  clientDataOf,
  generateKey,
  openRecovery,
  type Setup,
  setUp,
  signedAssertion
} from './harness'

const challengeOf = (options?: CredentialRequestOptions): Uint8Array =>
  new Uint8Array(options?.publicKey?.challenge as ArrayBuffer)

const enroll = async (setup: Setup) =>
  enrollHost({
    ...setup.context,
    methodAddress: setup.world.descriptor.methodPasskey,
    params: { userName: 'holder' }
  })

const enrolledRequest = async (setup: Setup): Promise<ApproverRequest> => {
  const outcome = await enroll(setup)
  if (outcome.kind !== 'verdict' || outcome.verdict !== 'passed') {
    throw new Error(`the enrollment did not pass: ${JSON.stringify(outcome)}`)
  }
  return {
    ...setup.request,
    method: setup.world.descriptor.methodPasskey,
    config: outcome.value.config
  }
}

/** The request's challenge, as the method asks the device to sign it. */
const challengeFor = (setup: Setup, request: ApproverRequest): Uint8Array => {
  const input = setup.orchestrator.signingInput(request, { relyingPartyId: EXTENSION_ORIGIN }) as {
    challenge: Hex
  }
  return hexToBytes(input.challenge)
}

/** The proof an assertion packages into, built without the method's own checks. */
const packaged = (setup: Setup, assertion: Assertion): Hex => {
  const { r, s } = parseDerSignature(new Uint8Array(assertion.response.signature as ArrayBuffer))
  return setup.world.methods.passkey.codec.encodeProof({
    authenticatorData: bytesToHex(new Uint8Array(assertion.response.authenticatorData)),
    clientDataJSON: bytesToHex(new Uint8Array(assertion.response.clientDataJSON)),
    r: numberToHex(r, { size: 32 }),
    s: numberToHex(normalizeP256S(s), { size: 32 })
  })
}

/** The method's own answer to an assertion, and the verdict on the same bytes packaged. */
const judged = async (setup: Setup, request: ApproverRequest, assertion: Assertion) => {
  const input = setup.orchestrator.signingInput(request, { relyingPartyId: EXTENSION_ORIGIN })
  return {
    reply: await setup.orchestrator.replyFrom(request, input, { assertion }),
    verdict: await setup.orchestrator.verify(request, request.place, packaged(setup, assertion))
  }
}

const REFUSED = {
  reply: { kind: 'reply-failure', cause: 'material-rejected' },
  verdict: 'rejected'
} as const

/** Authenticator flags that each lack one of the two an approval needs. */
const FLAGS_SHORT_OF_APPROVAL = [
  { lacking: 'the user verified', flags: FLAGS.UP },
  { lacking: 'the user present', flags: FLAGS.UV }
]

const claim = async (setup: Setup, request: ApproverRequest): Promise<ApproverReply> => {
  const outcome = await createClaimHost({ ...setup.context, request })
  if (outcome.kind !== 'verdict' || outcome.verdict !== 'passed') {
    throw new Error(`the claim did not pass: ${JSON.stringify(outcome)}`)
  }
  return outcome.value.reply
}

describe('the passkey device into the passkey method double', () => {
  it('enrolls a config that holds the credential key beside the relying party hash', async () => {
    const key = await generateKey()
    const setup = await setUp({
      create: async () => fakeAttestation({ flags: SYNCED_FLAGS, point: key.point }).credential,
      get: async () => null
    })
    const outcome = await enroll(setup)
    expect(outcome).toMatchObject({ kind: 'verdict', verdict: 'passed' })
    if (outcome.kind !== 'verdict' || outcome.verdict !== 'passed') {
      return
    }
    expect(setup.world.methods.passkey.codec.decodeConfig(outcome.value.config)).toEqual({
      x: bytesToHex(key.point.x),
      y: bytesToHex(key.point.y),
      rpIdHash: sha256(stringToHex(EXTENSION_ORIGIN))
    })
    expect(sha256(stringToHex(EXTENSION_ORIGIN))).toBe(ORIGIN_HASH)
  })

  it('reads the key from the authenticator data where the browser offers no getPublicKey', async () => {
    const key = await generateKey()
    const setup = await setUp({
      create: async () => {
        const { credential } = fakeAttestation({ flags: SYNCED_FLAGS, point: key.point })
        const response = credential.response as AuthenticatorAttestationResponse
        return {
          ...credential,
          response: {
            clientDataJSON: response.clientDataJSON,
            attestationObject: response.attestationObject,
            getTransports: () => ['internal']
          }
        }
      },
      get: async () => null
    })
    const outcome = await enroll(setup)
    if (outcome.kind !== 'verdict' || outcome.verdict !== 'passed') {
      throw new Error(`the enrollment did not pass: ${JSON.stringify(outcome)}`)
    }
    expect(setup.world.methods.passkey.codec.decodeConfig(outcome.value.config)).toMatchObject({
      x: bytesToHex(key.point.x),
      y: bytesToHex(key.point.y)
    })
  })

  it('ends material-rejected for a credential without a readable key', async () => {
    const setup = await setUp({
      create: async () => ({
        id: 'AQID',
        rawId: toBuffer(Uint8Array.from([1, 2, 3])),
        type: 'public-key',
        authenticatorAttachment: 'platform',
        response: {
          getAuthenticatorData: () => toBuffer(authenticatorData({ flags: SYNCED_FLAGS })),
          getPublicKey: () => null,
          getTransports: () => ['internal']
        },
        getClientExtensionResults: () => ({})
      }),
      get: async () => null
    })
    expect(await enroll(setup)).toMatchObject({
      kind: 'verdict',
      verdict: 'failed',
      cause: 'material-rejected'
    })
  })

  it('refuses a credential minted under another relying party', async () => {
    const { world } = await openRecovery()
    const method = world.methods.passkey
    const { credential } = fakeAttestation({
      flags: SYNCED_FLAGS,
      point: (await generateKey()).point,
      rpIdHash: sha256(stringToHex('chrome-extension://another'))
    })
    const input = method.enrollInput({ relyingPartyId: EXTENSION_ORIGIN })
    await expect(method.configFrom(input, { credential })).resolves.toEqual({
      kind: 'enroll-failure',
      cause: 'material-rejected'
    })
  })

  it('refuses a credential whose key algorithm is not ES256', async () => {
    const { world } = await openRecovery()
    const method = world.methods.passkey
    const { credential } = fakeAttestation({
      flags: SYNCED_FLAGS,
      point: (await generateKey()).point
    })
    const response = credential.response as AuthenticatorAttestationResponse
    const input = method.enrollInput({ relyingPartyId: EXTENSION_ORIGIN })
    const withAlgorithm = (algorithm: number) => ({
      credential: {
        response: {
          getAuthenticatorData: () => response.getAuthenticatorData(),
          getPublicKey: () => response.getPublicKey(),
          getPublicKeyAlgorithm: () => algorithm
        }
      }
    })
    await expect(method.configFrom(input, withAlgorithm(-8))).resolves.toEqual({
      kind: 'enroll-failure',
      cause: 'material-rejected'
    })
    await expect(method.configFrom(input, withAlgorithm(-7))).resolves.toMatch(/^0x/)
  })

  it('packages a reply the double verifies satisfied, and the access test passes', async () => {
    const key = await generateKey()
    const setup = await setUp({
      create: async () => fakeAttestation({ flags: SYNCED_FLAGS, point: key.point }).credential,
      get: async (options) => signedAssertion(key, challengeOf(options))
    })
    const request = await enrolledRequest(setup)
    const reply = await claim(setup, request)
    await expect(setup.orchestrator.verify(request, request.place, reply.proof)).resolves.toBe(
      'satisfied'
    )
    expect(await testAccessHost({ ...setup.context, request })).toMatchObject({
      kind: 'verdict',
      verdict: 'passed'
    })
  })

  it('satisfies with a high s the device lowers before the method runs', async () => {
    const key = await generateKey()
    const setup = await setUp({
      create: async () => fakeAttestation({ flags: SYNCED_FLAGS, point: key.point }).credential,
      get: async (options) => signedAssertion(key, challengeOf(options), { highS: true })
    })
    const request = await enrolledRequest(setup)
    const reply = await claim(setup, request)
    await expect(setup.orchestrator.verify(request, request.place, reply.proof)).resolves.toBe(
      'satisfied'
    )
  })

  it('refuses a reply whose client data was changed after signing', async () => {
    const key = await generateKey()
    const setup = await setUp({
      create: async () => fakeAttestation({ flags: SYNCED_FLAGS, point: key.point }).credential,
      get: async (options) => {
        const challenge = challengeOf(options)
        return signedAssertion(key, challenge, {
          clientData: clientDataOf(challenge, 'chrome-extension://another'),
          signedClientData: clientDataOf(challenge)
        })
      }
    })
    const request = await enrolledRequest(setup)
    expect(await createClaimHost({ ...setup.context, request })).toMatchObject({
      verdict: 'failed',
      cause: 'material-rejected'
    })
    const challenge = challengeFor(setup, request)
    const assertion = await signedAssertion(key, challenge, {
      clientData: clientDataOf(challenge, 'chrome-extension://another'),
      signedClientData: clientDataOf(challenge)
    })
    expect(await judged(setup, request, assertion)).toEqual(REFUSED)
  })

  it('refuses a reply signed by a key other than the enrolled one', async () => {
    const enrolled = await generateKey()
    const other = await generateKey()
    const setup = await setUp({
      create: async () =>
        fakeAttestation({ flags: SYNCED_FLAGS, point: enrolled.point }).credential,
      get: async (options) => signedAssertion(other, challengeOf(options))
    })
    const request = await enrolledRequest(setup)
    expect(await createClaimHost({ ...setup.context, request })).toMatchObject({
      verdict: 'failed',
      cause: 'material-rejected'
    })
    const assertion = await signedAssertion(other, challengeFor(setup, request))
    expect(await judged(setup, request, assertion)).toEqual(REFUSED)
  })

  it('refuses a reply signed over another challenge', async () => {
    const key = await generateKey()
    const setup = await setUp({
      create: async () => fakeAttestation({ flags: SYNCED_FLAGS, point: key.point }).credential,
      get: async () => signedAssertion(key, new Uint8Array(32).fill(0x5a))
    })
    const request = await enrolledRequest(setup)
    expect(await createClaimHost({ ...setup.context, request })).toMatchObject({
      verdict: 'failed',
      cause: 'material-rejected'
    })
    const assertion = await signedAssertion(key, new Uint8Array(32).fill(0x5a))
    expect(await judged(setup, request, assertion)).toEqual(REFUSED)
  })

  it('refuses a reply whose authenticator data holds another relying party hash', async () => {
    const key = await generateKey()
    const setup = await setUp({
      create: async () => fakeAttestation({ flags: SYNCED_FLAGS, point: key.point }).credential,
      get: async () => null
    })
    const request = await enrolledRequest(setup)
    const assertion = await signedAssertion(key, challengeFor(setup, request), {
      rpIdHash: sha256(stringToHex('chrome-extension://another'))
    })
    expect(await judged(setup, request, assertion)).toEqual(REFUSED)
  })

  FLAGS_SHORT_OF_APPROVAL.forEach(({ lacking, flags }) => {
    it(`refuses a reply whose authenticator data lacks ${lacking} flag`, async () => {
      const key = await generateKey()
      const setup = await setUp({
        create: async () => fakeAttestation({ flags: SYNCED_FLAGS, point: key.point }).credential,
        get: async () => null
      })
      const request = await enrolledRequest(setup)
      const assertion = await signedAssertion(key, challengeFor(setup, request), { flags })
      expect(await judged(setup, request, assertion)).toEqual(REFUSED)
    })
  })

  it('answers the device unavailable where the runtime cannot check the reply', async () => {
    const key = await generateKey()
    const setup = await setUp({
      create: async () => fakeAttestation({ flags: SYNCED_FLAGS, point: key.point }).credential,
      get: async () => null
    })
    const request = await enrolledRequest(setup)
    const input = setup.orchestrator.signingInput(request, { relyingPartyId: EXTENSION_ORIGIN })
    const assertion = await signedAssertion(key, challengeFor(setup, request))
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true })
    try {
      await expect(setup.orchestrator.replyFrom(request, input, { assertion })).resolves.toEqual({
        kind: 'reply-failure',
        cause: 'device-unavailable'
      })
    } finally {
      if (saved) {
        Object.defineProperty(globalThis, 'crypto', saved)
      } else {
        delete (globalThis as { crypto?: unknown }).crypto
      }
    }
  })

  it('ends material-rejected for an assertion without a signature', async () => {
    const key = await generateKey()
    const setup = await setUp({
      create: async () => fakeAttestation({ flags: SYNCED_FLAGS, point: key.point }).credential,
      get: async (options) => signedAssertion(key, challengeOf(options), { withSignature: false })
    })
    const request = await enrolledRequest(setup)
    expect(await createClaimHost({ ...setup.context, request })).toMatchObject({
      kind: 'verdict',
      verdict: 'failed',
      cause: 'material-rejected'
    })
  })

  it('refuses an assertion without a signature when it reaches the method itself', async () => {
    const key = await generateKey()
    const setup = await setUp({
      create: async () => fakeAttestation({ flags: SYNCED_FLAGS, point: key.point }).credential,
      get: async () => null
    })
    const request = await enrolledRequest(setup)
    const input = setup.orchestrator.signingInput(request, { relyingPartyId: EXTENSION_ORIGIN })
    const assertion = await signedAssertion(key, new Uint8Array(32), { withSignature: false })
    await expect(setup.orchestrator.replyFrom(request, input, { assertion })).resolves.toEqual({
      kind: 'reply-failure',
      cause: 'material-rejected'
    })
  })

  it('packages a high s the method receives as its low half', async () => {
    const key = await generateKey()
    const setup = await setUp({
      create: async () => fakeAttestation({ flags: SYNCED_FLAGS, point: key.point }).credential,
      get: async () => null
    })
    const request = await enrolledRequest(setup)
    const input = setup.orchestrator.signingInput(request, {
      relyingPartyId: EXTENSION_ORIGIN
    }) as { challenge: Hex }
    const assertion = await signedAssertion(key, hexToBytes(input.challenge), { highS: true })
    const reply = (await setup.orchestrator.replyFrom(request, input, {
      assertion
    })) as ApproverReply
    const { s } = setup.world.methods.passkey.codec.decodeProof(reply.proof) as { s: Hex }
    expect(BigInt(s) <= P256_N / BigInt(2)).toBe(true)
    await expect(setup.orchestrator.verify(request, request.place, reply.proof)).resolves.toBe(
      'satisfied'
    )
  })
})

describe('the passkey method double without WebCrypto', () => {
  it('judges nothing where the runtime has no crypto.subtle', async () => {
    const key = await generateKey()
    const setup = await setUp({
      create: async () => fakeAttestation({ flags: SYNCED_FLAGS, point: key.point }).credential,
      get: async (options) => signedAssertion(key, challengeOf(options))
    })
    const request = await enrolledRequest(setup)
    const reply = await claim(setup, request)
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true })
    try {
      await expect(setup.orchestrator.verify(request, request.place, reply.proof)).resolves.toBe(
        'not-judged'
      )
    } finally {
      if (saved) {
        Object.defineProperty(globalThis, 'crypto', saved)
      } else {
        delete (globalThis as { crypto?: unknown }).crypto
      }
    }
    await expect(setup.orchestrator.verify(request, request.place, reply.proof)).resolves.toBe(
      'satisfied'
    )
  })
})

describe("the passkey double's willing device", () => {
  it('returns material that satisfies the config it commits', async () => {
    const { world, requests } = await openRecovery()
    const double = new PasskeyMethodDouble()
    const request: ApproverRequest = {
      ...requests[0]!,
      method: world.descriptor.methodPasskey,
      config: await double.satisfyingConfig(EXTENSION_ORIGIN)
    }
    const orchestrator = world.orchestrator()
    const input = orchestrator.signingInput(request, { relyingPartyId: EXTENSION_ORIGIN })
    const reply = (await orchestrator.replyFrom(
      request,
      input,
      await double.satisfyingMaterial(request)
    )) as ApproverReply
    await expect(orchestrator.verify(request, request.place, reply.proof)).resolves.toBe(
      'satisfied'
    )
    const elsewhere = { ...request, config: await double.satisfyingConfig('wallet.example') }
    await expect(orchestrator.verify(elsewhere, request.place, reply.proof)).resolves.toBe(
      'rejected'
    )
  })
})

describe('the passkey codec against bytes its encoder would not produce', () => {
  const FOUR_BYTES: Hex = '0xdeadbeef'

  /** A request under a config the willing device satisfies, and that device's proof. */
  const willingReply = async () => {
    const { world, requests } = await openRecovery()
    const double = new PasskeyMethodDouble()
    const request: ApproverRequest = {
      ...requests[0]!,
      method: world.descriptor.methodPasskey,
      config: await double.satisfyingConfig(EXTENSION_ORIGIN)
    }
    const orchestrator = world.orchestrator()
    const input = orchestrator.signingInput(request, { relyingPartyId: EXTENSION_ORIGIN })
    const reply = (await orchestrator.replyFrom(
      request,
      input,
      await double.satisfyingMaterial(request)
    )) as ApproverReply
    return { codec: world.methods.passkey.codec, orchestrator, request, proof: reply.proof }
  }

  /**
   * The same proof with each dynamic member's offset moved one word further and
   * an unused word placed between the head and the tails.
   */
  const withLooseOffsets = (proof: Hex): Hex => {
    const word = (index: number) => slice(proof, index * 32, (index + 1) * 32)
    const moved = (index: number) =>
      numberToHex(hexToBigInt(word(index)) + BigInt(32), { size: 32 })
    return concat([
      moved(0),
      moved(1),
      word(2),
      word(3),
      numberToHex(0, { size: 32 }),
      slice(proof, 128)
    ])
  }

  it('round-trips a canonical proof and a canonical config', async () => {
    const { codec, orchestrator, request, proof } = await willingReply()
    expect(codec.encodeProof(codec.decodeProof(proof))).toBe(proof)
    expect(codec.encodeConfig(codec.decodeConfig(request.config))).toBe(request.config)
    await expect(orchestrator.verify(request, request.place, proof)).resolves.toBe('satisfied')
  })

  it('refuses a valid proof with four bytes appended, and the verdict is rejected', async () => {
    const { codec, orchestrator, request, proof } = await willingReply()
    const appended = concat([proof, FOUR_BYTES])
    expect(() => codec.decodeProof(appended)).toThrow()
    await expect(orchestrator.verify(request, request.place, appended)).resolves.toBe('rejected')
  })

  it('refuses a valid proof whose offsets point past an unused word', async () => {
    const { codec, orchestrator, request, proof } = await willingReply()
    const loose = withLooseOffsets(proof)
    expect(() => codec.decodeProof(loose)).toThrow()
    await expect(orchestrator.verify(request, request.place, loose)).resolves.toBe('rejected')
  })

  it('refuses a config with four bytes appended, and the verdict on a valid proof is rejected', async () => {
    const { codec, orchestrator, request, proof } = await willingReply()
    const appended = { ...request, config: concat([request.config, FOUR_BYTES]) }
    expect(() => codec.decodeConfig(appended.config)).toThrow()
    await expect(orchestrator.verify(appended, request.place, proof)).resolves.toBe('rejected')
  })
})
