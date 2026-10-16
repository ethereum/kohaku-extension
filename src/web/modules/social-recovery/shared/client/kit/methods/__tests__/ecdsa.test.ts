/**
 * The kit's guardian method: the wallet's typed-data signature over the place's
 * input is the raw signature over the digest the module recovers, the reply
 * carries it in the one form the module accepts, and the local verdict is
 * satisfied only for that form by the config's own key.
 */
import {
  bytesToHex,
  type Hex,
  hexToBigInt,
  numberToHex,
  parseSignature,
  serializeSignature,
  size,
  type TypedDataDefinition
} from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

import { replyLineOf, replyOfLine } from '@web/modules/social-recovery/recovery/checklist/paste'
import { MethodsOrchestratorDouble } from '@web/modules/social-recovery/sdk-doubles'
import type { ApproverReply, MethodContext } from '@web/modules/social-recovery/sdk-interfaces'
import { ecdsaConfigOf } from '@web/modules/social-recovery/shared/client/kit/formats'
import { createEcdsaMethod } from '@web/modules/social-recovery/shared/client/kit/methods'
import {
  approverRequestAt,
  guardianAt,
  METHOD_ECDSA
} from '@web/modules/social-recovery/shared/client/kit/setup-client/__tests__/harness'

const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n

const randomHex = (bytes: number): Hex => bytesToHex(crypto.getRandomValues(new Uint8Array(bytes)))

const setting = () => {
  const guardian = privateKeyToAccount(generatePrivateKey())
  const method = createEcdsaMethod()
  const orchestrator = new MethodsOrchestratorDouble(
    new Map([[METHOD_ECDSA.toLowerCase(), method]]),
    []
  )
  const request = approverRequestAt(guardianAt(0, { config: ecdsaConfigOf(guardian.address) }), 2)
  const ctx: MethodContext = orchestrator.contextOf(request)
  const signTyped = () => guardian.signTypedData(method.signingInput(ctx) as TypedDataDefinition)
  return { guardian, method, orchestrator, request, ctx, signTyped }
}

const highSOf = (signature: Hex): Hex => {
  const { r, s, yParity } = parseSignature(signature)
  return serializeSignature({
    r,
    s: numberToHex(N - hexToBigInt(s), { size: 32 }),
    yParity: yParity === 0 ? 1 : 0
  })
}

const withRecoveryByte = (signature: Hex, byte: number): Hex =>
  `${signature.slice(0, -2)}${byte.toString(16).padStart(2, '0')}` as Hex

describe('the signature a guardian returns', () => {
  it("is the same 65 bytes from the wallet's typed-data signing and from a raw signature over the digest", async () => {
    const { guardian, ctx, signTyped } = setting()
    const typed = await signTyped()
    expect(typed).toBe(await guardian.sign({ hash: ctx.digest }))
    expect(size(typed)).toBe(65)
  })

  it('becomes the proof as it is, and the local verdict is satisfied', async () => {
    const { method, ctx, signTyped } = setting()
    const signature = await signTyped()
    expect(await method.replyFrom(ctx, undefined, { signature })).toBe(signature)
    expect(await method.verify(ctx, signature)).toBe('satisfied')
  })

  it('makes a reply record carrying the digest and the signature, which the pasted line round-trips', async () => {
    const { orchestrator, request, ctx, signTyped } = setting()
    const signature = await signTyped()
    const reply = (await orchestrator.replyFrom(request, undefined, { signature })) as ApproverReply

    expect(reply.kind).toBe('recovery-proof-reply')
    expect(reply.digest).toBe(ctx.digest)
    expect(reply.proof).toBe(signature)
    expect(reply.place).toBe(request.place)
    expect(replyOfLine(replyLineOf(reply))).toEqual(reply)
    expect(await orchestrator.verify(request, request.place, reply.proof)).toBe('satisfied')
  })
})

describe('the blessed signing vector', () => {
  // The well-known test key whose 32 bytes are the value 1; public test data.
  const TEST_KEY: Hex = `0x${'00'.repeat(31)}01`
  const SIGNER = '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf'
  const DIGEST: Hex = '0x45da43ac350a49f946b432051597379c9c780adb797231750744a4bcc6df4f87'
  const PROOF: Hex =
    '0x9cc23b364d1bc8c5cc2100a486709fbeb2e4328cf3635788903fb1b4b92a8e590ae8eda1f77fa8c62365613c80e78b243fe4b5269607974473eed59e631fb6db1b'

  const vectorSetting = () => {
    const { method, ctx } = setting()
    const vectorCtx: MethodContext = {
      ...ctx,
      digest: DIGEST,
      request: { ...ctx.request, config: ecdsaConfigOf(SIGNER) }
    }
    return { method, ctx: vectorCtx }
  }

  it('is the raw signature of the test key over the digest, 65 bytes with v = 27', async () => {
    const key = privateKeyToAccount(TEST_KEY)
    expect(key.address).toBe(SIGNER)
    const signature = await key.sign({ hash: DIGEST })
    expect(signature).toBe(PROOF)
    expect(size(PROOF)).toBe(65)
    expect(parseInt(PROOF.slice(-2), 16)).toBe(27)
  })

  it("is the method's proof for that digest, byte for byte", async () => {
    const { method, ctx } = vectorSetting()
    const signature = await privateKeyToAccount(TEST_KEY).sign({ hash: DIGEST })
    expect(await method.replyFrom(ctx, undefined, { signature })).toBe(PROOF)
  })

  it('verifies locally against the signer of the vector', async () => {
    const { method, ctx } = vectorSetting()
    expect(await method.verify(ctx, PROOF)).toBe('satisfied')
  })

  it('reads the empty proof of the vector as not verified', async () => {
    const { method, ctx } = vectorSetting()
    expect(await method.verify(ctx, '0x')).toBe('not-judged')
  })

  it('does not verify the personal-message signature of the same key over the digest', async () => {
    const { method, ctx } = vectorSetting()
    const personal = await privateKeyToAccount(TEST_KEY).signMessage({ message: { raw: DIGEST } })
    expect(personal).not.toBe(PROOF)
    expect(await method.verify(ctx, personal)).not.toBe('satisfied')
  })
})

describe('the form the module accepts', () => {
  it('turns a high s into the low form, and the result still recovers to the guardian', async () => {
    const { method, ctx, signTyped } = setting()
    const signature = await signTyped()
    const high = highSOf(signature)
    expect(high).not.toBe(signature)

    const proof = await method.replyFrom(ctx, undefined, { signature: high })
    expect(proof).toBe(signature)
    expect(await method.verify(ctx, proof as Hex)).toBe('satisfied')
  })

  it('turns a recovery byte of zero or one into 27 or 28', async () => {
    const { method, ctx, signTyped } = setting()
    const signature = await signTyped()
    const v = parseInt(signature.slice(-2), 16)
    const zeroOrOne = withRecoveryByte(signature, v - 27)

    const proof = await method.replyFrom(ctx, undefined, { signature: zeroOrOne })
    expect(proof).toBe(signature)
    expect(await method.verify(ctx, proof as Hex)).toBe('satisfied')
  })

  it('does not judge locally a signature by the guardian in a form the module refuses', async () => {
    const { method, ctx, signTyped } = setting()
    const signature = await signTyped()
    const v = parseInt(signature.slice(-2), 16)
    expect(await method.verify(ctx, highSOf(signature))).toBe('not-judged')
    expect(await method.verify(ctx, withRecoveryByte(signature, v - 27))).toBe('not-judged')
  })
})

describe('the local verdict', () => {
  it('does not judge a personal-message signature over the digest, which recovers to another signer', async () => {
    const { guardian, method, ctx } = setting()
    const personal = await guardian.signMessage({ message: { raw: ctx.digest } })
    expect(await method.verify(ctx, personal)).toBe('not-judged')
  })

  it('does not judge a signature by another key', async () => {
    const { method, ctx } = setting()
    const other = privateKeyToAccount(generatePrivateKey())
    expect(await method.verify(ctx, await other.sign({ hash: ctx.digest }))).toBe('not-judged')
  })

  it('does not judge a signature over another digest by the guardian', async () => {
    const { guardian, method, ctx } = setting()
    expect(await method.verify(ctx, await guardian.sign({ hash: randomHex(32) }))).toBe(
      'not-judged'
    )
  })

  it('rejects 65 bytes with a recovery byte out of range', async () => {
    const { method, ctx } = setting()
    expect(await method.verify(ctx, `${randomHex(64)}05`)).toBe('rejected')
  })

  it('rejects 65 bytes whose r is zero', async () => {
    const { method, ctx } = setting()
    expect(await method.verify(ctx, `0x${'00'.repeat(64)}1b`)).toBe('rejected')
  })

  it('rejects a proof that is not hex', async () => {
    const { method, ctx } = setting()
    expect(await method.verify(ctx, 'not hex' as Hex)).toBe('rejected')
  })

  it("does not judge an empty proof or bytes of another length, a contract wallet's own", async () => {
    const { method, ctx } = setting()
    expect(await method.verify(ctx, '0x')).toBe('not-judged')
    expect(await method.verify(ctx, randomHex(32))).toBe('not-judged')
  })
})

describe('the material a reply takes', () => {
  it('refuses empty or non-hex material, and 65 bytes that are no signature', async () => {
    const { method, ctx } = setting()
    const refused = [
      undefined,
      {},
      { signature: '0x' },
      { signature: 'not hex' },
      { signature: 42 },
      { signature: '0x123' },
      { signature: `${randomHex(64)}05` }
    ]
    const answers = await Promise.all(
      refused.map((material) => method.replyFrom(ctx, undefined, material))
    )
    answers.forEach((answer) =>
      expect(answer).toEqual({ kind: 'reply-failure', cause: 'material-rejected' })
    )
  })

  it('passes bytes of another length through unchanged', async () => {
    const { method, ctx } = setting()
    const bytes = randomHex(32)
    expect(await method.replyFrom(ctx, undefined, { signature: bytes })).toBe(bytes)
  })
})

describe('the enrollment and the codec', () => {
  it('enrolls a typed address as its config', async () => {
    const { guardian, method } = setting()
    const input = method.enrollInput({ address: guardian.address })
    expect(await method.configFrom(input, undefined)).toBe(ecdsaConfigOf(guardian.address))
    expect(method.codec.decodeConfig(ecdsaConfigOf(guardian.address))).toEqual({
      address: guardian.address
    })
  })

  it('refuses a missing address and a mixed-case address with a wrong checksum', async () => {
    const { method } = setting()
    const wrongChecksum = '0x52908400098527886e0F7030069857D2E4169EE7'
    const answers = await Promise.all(
      [{}, { address: 'not an address' }, { address: wrongChecksum }].map((params) =>
        method.configFrom(method.enrollInput(params), undefined)
      )
    )
    answers.forEach((answer) =>
      expect(answer).toEqual({ kind: 'enroll-failure', cause: 'material-rejected' })
    )
  })

  it('refuses config bytes its encode would not reproduce', () => {
    const { guardian, method } = setting()
    expect(() => method.codec.decodeConfig(`${ecdsaConfigOf(guardian.address)}00`)).toThrow()
  })

  it('describes a wallet signing typed data at the config address, key or contract unknown', () => {
    const { guardian, method, ctx } = setting()
    expect(method.describe(ctx)).toEqual({
      kind: 'wallet-typed-data',
      address: guardian.address,
      keyOrContractUnknown: true
    })
  })
})
