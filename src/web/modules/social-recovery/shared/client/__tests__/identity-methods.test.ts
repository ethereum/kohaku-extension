/**
 * The two identity methods on the build with no deployment: the client
 * registers the SDK's own zkPassport and Aadhaar methods over the stand-in's
 * scripted stacks, the approving side enrolls and claims through them with
 * the material the ceremony's devices hand over, and the fake node judges
 * their replies through the module's `verify` view as the deployed verifiers
 * would bind them: the zkPassport identifier, the Aadhaar nullifier, seed,
 * window, disclosures, digest and the QR code's age. The scripted stacks'
 * scripts make the phone and the prover fail in each way a holder meets.
 */
import { approvalDigest } from '@kohaku-eth/social-recovery'
import type { Address, ApproverRequest, Hex, Material, Reply } from '@kohaku-eth/social-recovery'
import { anonAadhaarMethod, zkPassportMethod } from '@kohaku-eth/social-recovery/recovery-methods'
import type { AadhaarPcd } from '@kohaku-eth/social-recovery/recovery-methods'
import { keccak256, numberToHex, zeroAddress } from 'viem'

import { getRpcProvider } from '@ambire-common/services/provider/getRpcProvider'
import type {
  CeremonyStep,
  CeremonyView,
  DeviceResult,
  ZkPassportRequestWithResult
} from '@web/modules/social-recovery/shared/ceremony'
import { externalAppDevice } from '@web/modules/social-recovery/shared/ceremony/externalAppDevice'
import { inBrowserProverDevice } from '@web/modules/social-recovery/shared/ceremony/inBrowserProverDevice'
import {
  buildRecoveryClient,
  CHAIN_IDS,
  createWorld,
  extensionClientFor,
  networkRecord,
  sameAddress,
  sdkStandIn
} from '@web/modules/social-recovery/shared/client/__tests__/harness'
import { sepoliaDeploymentVariable } from '@web/modules/social-recovery/shared/client/deployment-env'
import {
  createScriptedAadhaarStack,
  createScriptedZkPassportStack
} from '@web/modules/social-recovery/shared/client/scripted'
import type {
  Followed,
  Heard,
  IdentityWorld
} from '@web/modules/social-recovery/shared/client/__fixtures__/types'
import type { ApprovalRequest } from '@web/modules/social-recovery/shared/client/scripted/__fixtures__/types'
import type { RecoveryKitClient } from '@web/modules/social-recovery/shared/client/types'

jest.mock('@ambire-common/services/provider/getRpcProvider', () => ({
  getRpcProvider: jest.fn()
}))
jest.mock('@web/modules/social-recovery/shared/client/deployment-env', () => ({
  ...jest.requireActual('@web/modules/social-recovery/shared/client/deployment-env'),
  sepoliaDeploymentVariable: jest.fn()
}))

const buildProvider = getRpcProvider as jest.Mock
const variable = sepoliaDeploymentVariable as jest.MockedFunction<typeof sepoliaDeploymentVariable>

const QR_DATA = '123456789012345678901234567890'
const DAY_MS = 24 * 3600 * 1000

beforeEach(() => {
  variable.mockReturnValue(undefined)
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
  buildProvider.mockReset()
  variable.mockReset()
})

// Jest 29.7 runs the async advance; the repository's Jest types predate it.
const advanceTimers = (ms: number): Promise<void> =>
  (
    jest as unknown as { advanceTimersByTimeAsync: (ms: number) => Promise<void> }
  ).advanceTimersByTimeAsync(ms)

/** Runs `work` with the stand-in's stacks answering on fake timers, until it settles. */
const settle = async <T>(work: Promise<T>): Promise<T> => {
  let done = false
  work.then(
    () => {
      done = true
    },
    () => {
      done = true
    }
  )
  for (let round = 0; round < 100 && !done; round += 1) {
    // eslint-disable-next-line no-await-in-loop
    await advanceTimers(100)
  }
  return work
}

/** Lets the stacks' timers run for `ms` and every promise they release settle. */
const waitFor = async (ms: number) => {
  await new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

const requestFor = (client: RecoveryKitClient, method: Address, config: Hex, attemptId = '1') => {
  const request: ApprovalRequest = {
    kind: 'recovery-proof-request',
    version: 1,
    purpose: 'approval',
    chainId: String(client.descriptor.chainId),
    manager: client.descriptor.manager,
    digestVersion: '1',
    account: client.account,
    action: client.descriptor.action,
    attemptId,
    setupNonce: '1',
    setupBodyHash: `0x${'dd'.repeat(32)}`,
    validUntil: '1790000000',
    place: 0,
    method,
    config,
    salt: `0x${'00'.repeat(32)}`,
    credentialHoldsCode: false,
    payload: '0x1234',
    order: { token: zeroAddress, amount: '0', payee: zeroAddress }
  }
  return request
}

const digestOf = (request: ApprovalRequest): Hex =>
  approvalDigest(
    {
      chainId: Number(request.chainId),
      manager: request.manager,
      account: request.account,
      action: request.action,
      attemptId: BigInt(request.attemptId),
      setupNonce: BigInt(request.setupNonce),
      setupBodyHash: request.setupBodyHash,
      validUntil: Number(request.validUntil),
      payload: request.payload,
      order: { ...request.order, amount: 0n }
    },
    request.place
  )

const isReply = (value: unknown): value is Reply =>
  typeof value === 'object' && value !== null && 'proof' in value

const replyOf = (value: unknown): Reply => {
  if (!isReply(value)) {
    throw new Error(`no reply: ${JSON.stringify(value)}`)
  }
  return value
}

const materialOf = (result: DeviceResult): Material => {
  if (!result.ok) {
    throw new Error(`the device stopped: ${JSON.stringify(result.stop)}`)
  }
  return result.material
}

const deviceContext = (call: 'enroll' | 'createClaim', followed: Followed) => ({
  call,
  onStep: (step: CeremonyStep) => followed.steps.push(step),
  show: (view: CeremonyView) => followed.views.push(view)
})

const identityWorld = async (): Promise<IdentityWorld> => {
  const world = createWorld({ chain: 'sepolia' })
  const client = await buildRecoveryClient(world.config)
  return {
    world,
    client,
    zkModule: world.descriptor.methodZkpassport,
    aadhaarModule: world.descriptor.methodAadhaar
  }
}

/** A zkPassport enrollment from the phone's request to the config, through the external-app device. */
const enrollPassport = async ({ client, zkModule }: IdentityWorld, followed: Followed) => {
  const params = client.methodParamsFor('zkpassport', 'enroll')
  if (!params) {
    throw new Error('no zkPassport params')
  }
  const input = client.approving.enrollInput(zkModule, params)
  const result = await settle(externalAppDevice().enroll(input, deviceContext('enroll', followed)))
  return client.approving.configFrom(zkModule, input, materialOf(result))
}

/** A zkPassport claim for one request, from the signing input to the reply. */
const claimPassport = async (
  { client }: IdentityWorld,
  request: ApproverRequest,
  followed: Followed
) => {
  const params = client.methodParamsFor('zkpassport', 'createClaim')
  const input = client.approving.signingInput(request, params)
  const result = await settle(
    externalAppDevice().sign(input, deviceContext('createClaim', followed))
  )
  return client.approving.replyFrom(request, input, materialOf(result))
}

/** An Aadhaar enrollment over a QR the holder uploaded, through the in-browser prover device. */
const enrollAadhaar = async ({ client, aadhaarModule }: IdentityWorld, steps: CeremonyStep[]) => {
  const params = client.methodParamsFor('aadhaar', 'enroll')
  if (!params) {
    throw new Error('no Aadhaar params')
  }
  const input = client.approving.enrollInput(aadhaarModule, params)
  const result = await inBrowserProverDevice().enroll(input, {
    call: 'enroll',
    onStep: (step) => steps.push(step),
    ask: async () => ({ kind: 'qrData', qrData: QR_DATA })
  })
  return settle(client.approving.configFrom(aadhaarModule, input, materialOf(result)))
}

const claimAadhaar = async (
  { client }: IdentityWorld,
  request: ApproverRequest,
  material: Material = { qrData: QR_DATA }
) => {
  const params = client.methodParamsFor('aadhaar', 'createClaim')
  const input = client.approving.signingInput(request, params)
  return settle(client.approving.replyFrom(request, input, material))
}

const asConfig = (value: unknown): Hex => {
  if (typeof value !== 'string') {
    throw new Error(`no config: ${JSON.stringify(value)}`)
  }
  return value as Hex
}

describe('the client registers both identity methods', () => {
  ;(
    [
      ['zkpassport', 'methodZkpassport', 'external-app'],
      ['aadhaar', 'methodAadhaar', 'in-browser-prover']
    ] as const
  ).forEach(([slug, field, binding]) =>
    it(`serves ${slug} for the descriptor's ${field} module, bound to the ${binding} device`, async () => {
      const { client, world } = await identityWorld()
      const method = client.methodFor(slug)
      expect(method?.deviceBinding).toBe(binding)
      const served = method?.modules(world.descriptor) ?? []
      expect(served).toHaveLength(1)
      expect(sameAddress(served[0], world.descriptor[field])).toBe(true)
    })
  )

  it("runs the stand-in's scripted stacks, the ones a walker scripts", async () => {
    jest.useFakeTimers()
    const identity = await identityWorld()
    sdkStandIn.zkPassportStackFor(identity.world.descriptor).script({ answer: 'reject' })
    const followed: Followed = { steps: [], views: [] }
    const params = identity.client.methodParamsFor('zkpassport', 'enroll') ?? {}
    const input = identity.client.approving.enrollInput(identity.zkModule, params)
    const result = await settle(
      externalAppDevice().enroll(input, deviceContext('enroll', followed))
    )
    expect(result).toEqual({ ok: false, stop: { kind: 'dismissed', note: 'refused' } })
  })
})

describe('a zkPassport credential from enrollment to a claim the node accepts', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  it('enrolls the identifier the phone proved, following the phone through its steps', async () => {
    const identity = await identityWorld()
    const followed: Followed = { steps: [], views: [] }
    const config = asConfig(await enrollPassport(identity, followed))
    const decoded = zkPassportMethod(createScriptedZkPassportStack()).codec.decodeConfig(config)
    expect(BigInt(decoded.uniqueIdentifier as string)).toBe(123n)
    expect(decoded).toMatchObject({ domain: 'kohaku.stand-in', scope: 'kohaku-recovery' })
    expect(followed.steps).toEqual([
      'waitingForPhone',
      'requestReceived',
      'generating',
      'resultReceived'
    ])
    expect(followed.views).toEqual([
      { kind: 'scanCode', url: expect.stringMatching(/^https:\/\/zkpassport\.stand-in\/r\?/) }
    ])
  })

  it('closes the request once after the enrollment and once after the claim', async () => {
    const identity = await identityWorld()
    const stack = sdkStandIn.zkPassportStackFor(identity.world.descriptor)
    const before = stack.closes()
    const config = asConfig(await enrollPassport(identity, { steps: [], views: [] }))
    await advanceTimers(1)
    expect(stack.closes()).toBe(before + 1)
    const request = requestFor(identity.client, identity.zkModule, config)
    await claimPassport(identity, request, { steps: [], views: [] })
    await advanceTimers(1)
    expect(stack.closes()).toBe(before + 2)
  })

  it('claims with a reply the fake node satisfies, which the method itself does not judge', async () => {
    const identity = await identityWorld()
    const config = asConfig(await enrollPassport(identity, { steps: [], views: [] }))
    const request = requestFor(identity.client, identity.zkModule, config)
    const reply = replyOf(await claimPassport(identity, request, { steps: [], views: [] }))

    expect(reply.digest).toBe(digestOf(request))
    await expect(identity.client.walletReads.verifyReply(request, reply)).resolves.toBe('satisfied')
    await expect(
      identity.client.approving.verify(request, request.place, reply.proof)
    ).resolves.toBe('not-judged')
  })

  it('rejects the reply against a config of another identifier', async () => {
    const identity = await identityWorld()
    const method = zkPassportMethod(createScriptedZkPassportStack())
    const config = asConfig(await enrollPassport(identity, { steps: [], views: [] }))
    const request = requestFor(identity.client, identity.zkModule, config)
    const reply = replyOf(await claimPassport(identity, request, { steps: [], views: [] }))

    const other = method.codec.encodeConfig({
      ...method.codec.decodeConfig(config),
      uniqueIdentifier: numberToHex(456n, { size: 32 })
    })
    await expect(
      identity.client.walletReads.verifyReply(
        { ...request, config: other },
        { ...reply, config: other }
      )
    ).resolves.toBe('rejected')
  })

  it('rejects a proof whose nullifier is not the non-salted one, and bytes that do not decode', async () => {
    const identity = await identityWorld()
    const { codec } = zkPassportMethod(createScriptedZkPassportStack())
    const config = asConfig(await enrollPassport(identity, { steps: [], views: [] }))
    const request = requestFor(identity.client, identity.zkModule, config)
    const reply = replyOf(await claimPassport(identity, request, { steps: [], views: [] }))

    const fields = codec.decodeProof(reply.proof) as {
      proofVerificationData: { vkeyHash: Hex; proof: Hex; publicInputs: Hex[] }
      committedInputs: Hex
    }
    const inputs = [...fields.proofVerificationData.publicInputs]
    inputs[inputs.length - 3] = numberToHex(1n, { size: 32 })
    const salted = codec.encodeProof({
      ...fields,
      proofVerificationData: { ...fields.proofVerificationData, publicInputs: inputs }
    })
    const { verifyReply } = identity.client.walletReads
    await expect(verifyReply(request, { ...reply, proof: salted })).resolves.toBe('rejected')
    await expect(verifyReply(request, { ...reply, proof: '0x1234' })).resolves.toBe('rejected')
  })

  it("answers the verdict a walker seeded for the credential's config", async () => {
    const identity = await identityWorld()
    const config = asConfig(await enrollPassport(identity, { steps: [], views: [] }))
    const request = requestFor(identity.client, identity.zkModule, config)
    const reply = replyOf(await claimPassport(identity, request, { steps: [], views: [] }))
    const node = sdkStandIn.nodeFor(identity.world.descriptor, identity.world.account)

    node.setVerdict(config, 'rejected')
    await expect(identity.client.walletReads.verifyReply(request, reply)).resolves.toBe('rejected')
    await expect(
      identity.client.walletReads.verifyReply(request, { ...reply, proof: '0x1234' })
    ).resolves.toBe('rejected')
    node.setVerdict(config, 'satisfied')
    await expect(
      identity.client.walletReads.verifyReply(request, { ...reply, proof: '0x1234' })
    ).resolves.toBe('satisfied')
  })
})

describe('an Aadhaar credential from enrollment to a claim the node accepts', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  it("enrolls the proof's nullifier under the chain's seed, showing the prover's progress", async () => {
    const identity = await identityWorld()
    const steps: CeremonyStep[] = []
    const config = asConfig(await enrollAadhaar(identity, steps))
    const decoded = anonAadhaarMethod({ stack: createScriptedAadhaarStack() }).codec.decodeConfig(
      config
    )
    expect(decoded).toEqual({ nullifier: 22n, nullifierSeed: 1n, freshnessWindow: 86400n })
    expect(steps).toEqual(['fetchingFiles', 'fetchingFiles', 'proving', 'checking'])
  })

  it('claims with a reply the method and the fake node both satisfy', async () => {
    const identity = await identityWorld()
    const config = asConfig(await enrollAadhaar(identity, []))
    const request = requestFor(identity.client, identity.aadhaarModule, config)
    const reply = replyOf(await claimAadhaar(identity, request))

    expect(reply.digest).toBe(digestOf(request))
    await expect(identity.client.walletReads.verifyReply(request, reply)).resolves.toBe('satisfied')
    await expect(
      identity.client.approving.verify(request, request.place, reply.proof)
    ).resolves.toBe('satisfied')
  })

  const CONFIG_CHANGES: [
    string,
    { nullifier: bigint; nullifierSeed: bigint; freshnessWindow: bigint }
  ][] = [
    ['another nullifier', { nullifier: 23n, nullifierSeed: 1n, freshnessWindow: 86400n }],
    ['another seed', { nullifier: 22n, nullifierSeed: 2n, freshnessWindow: 86400n }],
    ['a window under an hour', { nullifier: 22n, nullifierSeed: 1n, freshnessWindow: 3599n }]
  ]
  CONFIG_CHANGES.forEach(([what, fields]) =>
    it(`rejects the reply against a config of ${what}`, async () => {
      const identity = await identityWorld()
      const { codec } = anonAadhaarMethod({ stack: createScriptedAadhaarStack() })
      const config = asConfig(await enrollAadhaar(identity, []))
      const request = requestFor(identity.client, identity.aadhaarModule, config)
      const reply = replyOf(await claimAadhaar(identity, request))
      const other = codec.encodeConfig(fields)
      await expect(
        identity.client.walletReads.verifyReply(
          { ...request, config: other },
          { ...reply, config: other }
        )
      ).resolves.toBe('rejected')
    })
  )

  it('fails the claim with the material rejected where the QR code was signed more than a day ago', async () => {
    const identity = await identityWorld()
    const config = asConfig(await enrollAadhaar(identity, []))
    const request = requestFor(identity.client, identity.aadhaarModule, config)
    sdkStandIn.aadhaarStackFor(identity.world.descriptor).script({ stale: true })
    await expect(claimAadhaar(identity, request)).resolves.toEqual({
      kind: 'reply-failure',
      cause: 'material-rejected'
    })
  })

  it("rejects on the chain a proof whose QR code is more than a day older than the latest block's time", async () => {
    jest.setSystemTime(new Date('2026-10-22T12:00:00Z'))
    const identity = await identityWorld()
    const config = asConfig(await enrollAadhaar(identity, []))
    const request = requestFor(identity.client, identity.aadhaarModule, config)
    const reply = replyOf(await claimAadhaar(identity, request))
    jest.setSystemTime(Date.now() + DAY_MS - 60_000)
    await expect(identity.client.walletReads.verifyReply(request, reply)).resolves.toBe('satisfied')
    jest.setSystemTime(Date.now() + 120_000)
    await expect(identity.client.walletReads.verifyReply(request, reply)).resolves.toBe('rejected')
  })

  it("rejects a proof bound to another request's digest", async () => {
    const identity = await identityWorld()
    const config = asConfig(await enrollAadhaar(identity, []))
    const first = requestFor(identity.client, identity.aadhaarModule, config, '1')
    const second = requestFor(identity.client, identity.aadhaarModule, config, '2')
    const reply = replyOf(await claimAadhaar(identity, first))
    const moved: Reply = { ...reply, attemptId: second.attemptId, digest: digestOf(second) }
    await expect(identity.client.walletReads.verifyReply(second, moved)).resolves.toBe('rejected')
    await expect(identity.client.walletReads.verifyReply(first, reply)).resolves.toBe('satisfied')
  })

  it("answers the verdict a walker seeded for the credential's config", async () => {
    const identity = await identityWorld()
    const config = asConfig(await enrollAadhaar(identity, []))
    const request = requestFor(identity.client, identity.aadhaarModule, config)
    const reply = replyOf(await claimAadhaar(identity, request))
    sdkStandIn
      .nodeFor(identity.world.descriptor, identity.world.account)
      .setVerdict(config, 'rejected')
    await expect(identity.client.walletReads.verifyReply(request, reply)).resolves.toBe('rejected')
  })
})

describe('the scripted zkPassport stack', () => {
  const ARGS = {
    scope: 'kohaku-recovery',
    mode: 'compressed-evm',
    devMode: false
  } as const

  const listen = async (
    stack: ReturnType<typeof createScriptedZkPassportStack>,
    customData?: string
  ) => {
    const client = await stack('kohaku.stand-in')
    const builder = await client.request(ARGS)
    const request = (
      customData === undefined ? builder : builder.bind('custom_data', customData)
    ).done()
    const heard: Heard = { events: [], proofs: [], results: [], errors: [] }
    request.onRequestReceived(() => heard.events.push('received'))
    request.onGeneratingProof(() => heard.events.push('generating'))
    request.onProofGenerated((proof) => {
      heard.events.push('generated')
      heard.proofs.push(proof)
    })
    request.onSuccess(() => {
      heard.events.push('success')
    })
    request.onReject(() => heard.events.push('reject'))
    request.onError((error) => {
      heard.events.push('error')
      heard.errors.push(error)
    })
    const withResult = request as typeof request & {
      onResult: (callback: (response: unknown) => void) => void
    }
    withResult.onResult((response) => {
      heard.events.push('result')
      heard.results.push(response)
    })
    return { client, request, heard }
  }

  it('answers a request itself, in the order the phone does, with the default identifier', async () => {
    const { request, heard } = await listen(createScriptedZkPassportStack({ stepMs: 1 }))
    expect(request.url).toMatch(/^https:\/\/zkpassport\.stand-in\/r\?/)
    expect(heard.events).toEqual([])
    await waitFor(20)
    expect(heard.events).toEqual(['received', 'generating', 'generated', 'success', 'result'])
    expect(heard.results).toEqual([
      { verified: true, uniqueIdentifier: '123', proofs: [heard.proofs[0]] }
    ])
    expect(heard.proofs[0]).toMatchObject({ name: 'outer_evm_count_4' })
  })

  it('gives each request an id of its own', async () => {
    const stack = createScriptedZkPassportStack({ stepMs: 1 })
    const first = await listen(stack)
    const second = await listen(stack)
    expect(first.request.requestId).not.toBe(second.request.requestId)
    await waitFor(20)
  })

  it('binds the custom data a claim names into the outer proof', async () => {
    const { heard } = await listen(createScriptedZkPassportStack({ stepMs: 1 }), '0xabc')
    await waitFor(20)
    expect(heard.proofs[0]).toMatchObject({
      committedInputs: { bind_evm: { data: { custom_data: '0xabc' } } }
    })
  })

  it("answers the verifier parameters with the non-salted nullifier type and the proof's identifier where the SDK reads them", async () => {
    const stack = createScriptedZkPassportStack({ stepMs: 1, identifier: 777n })
    const { client, heard } = await listen(stack)
    await waitFor(20)
    const params = client.getSolidityVerifierParameters({
      proof: heard.proofs[0] as never,
      domain: 'kohaku.stand-in',
      scope: 'kohaku-recovery',
      devMode: false
    })
    const inputs = params.proofVerificationData.publicInputs
    expect(BigInt(inputs[inputs.length - 3])).toBe(0n)
    expect(BigInt(inputs[inputs.length - 2])).toBe(777n)
    expect(params.serviceConfig).toMatchObject({
      domain: 'kohaku.stand-in',
      scope: 'kohaku-recovery',
      devMode: false
    })
  })

  it('declines a request where scripted to', async () => {
    const stack = createScriptedZkPassportStack({ stepMs: 1 })
    stack.script({ answer: 'reject' })
    const { heard } = await listen(stack)
    await waitFor(20)
    expect(heard.events).toEqual(['received', 'reject'])
  })

  it("reports the phone's error where scripted to, with the scripted message or its own", async () => {
    const stack = createScriptedZkPassportStack({ stepMs: 1 })
    stack.script({ answer: 'error', error: 'The chip did not answer.' })
    const scripted = await listen(stack)
    stack.script({ answer: 'error' })
    const own = await listen(stack)
    await waitFor(20)
    expect(scripted.heard.events).toEqual(['received', 'error'])
    expect(scripted.heard.errors).toEqual(['The chip did not answer.'])
    expect(own.heard.errors).toHaveLength(1)
    expect(own.heard.errors[0]).not.toBe('')
  })

  it('never answers where scripted silent', async () => {
    const stack = createScriptedZkPassportStack({ stepMs: 1 })
    stack.script({ answer: 'silent' })
    const { heard } = await listen(stack)
    await waitFor(30)
    expect(heard.events).toEqual([])
  })

  it('proves another identifier where scripted to, and the defaults again after an empty script', async () => {
    const stack = createScriptedZkPassportStack({ stepMs: 1 })
    stack.script({ identifier: 456n })
    const other = await listen(stack)
    const again = await listen(stack)
    stack.script({})
    const restored = await listen(stack)
    await waitFor(20)
    expect(other.heard.results).toEqual([expect.objectContaining({ uniqueIdentifier: '456' })])
    expect(again.heard.results).toEqual([expect.objectContaining({ uniqueIdentifier: '456' })])
    expect(restored.heard.results).toEqual([expect.objectContaining({ uniqueIdentifier: '123' })])
  })

  it('stops the answers still to come once a request is closed, and counts each close', async () => {
    const stack = createScriptedZkPassportStack({ stepMs: 20 })
    const { request, heard } = await listen(stack)
    expect(stack.closes()).toBe(0)
    await waitFor(30)
    ;(request as ZkPassportRequestWithResult).close?.()
    await waitFor(100)
    expect(heard.events).toEqual(['received'])
    expect(stack.closes()).toBe(1)
  })

  it('keeps the script a request was opened under, whatever is scripted after', async () => {
    const stack = createScriptedZkPassportStack({ stepMs: 1 })
    const opened = await listen(stack)
    stack.script({ answer: 'reject' })
    await waitFor(20)
    expect(opened.heard.events).toContain('result')
  })
})

describe('the zkPassport method over a scripted phone that fails', () => {
  const method = (stack: ReturnType<typeof createScriptedZkPassportStack>) =>
    zkPassportMethod(stack)
  const PARAMS = { domain: 'kohaku.stand-in', scope: 'kohaku-recovery' }
  /** A screen that draws the request's code, which the device needs to run. */
  const SCREEN = { show: () => undefined }

  it('reads a declined request as the refused note', async () => {
    const stack = createScriptedZkPassportStack({ stepMs: 1 })
    stack.script({ answer: 'reject' })
    const result = await externalAppDevice().enroll(method(stack).enrollInput(PARAMS), SCREEN)
    expect(result).toEqual({ ok: false, stop: { kind: 'dismissed', note: 'refused' } })
  })

  it("reads the phone's error as failed with its message", async () => {
    const stack = createScriptedZkPassportStack({ stepMs: 1 })
    stack.script({ answer: 'error', error: 'The chip did not answer.' })
    const result = await externalAppDevice().enroll(method(stack).enrollInput(PARAMS), SCREEN)
    expect(result).toEqual({
      ok: false,
      stop: expect.objectContaining({
        verdict: 'failed',
        cause: 'phone-error',
        detail: 'The chip did not answer.'
      })
    })
  })

  it('waits on a silent phone until the holder aborts, then reads cancelled', async () => {
    const stack = createScriptedZkPassportStack({ stepMs: 1 })
    stack.script({ answer: 'silent' })
    const controller = new AbortController()
    let settled = false
    const running = externalAppDevice()
      .enroll(method(stack).enrollInput(PARAMS), { ...SCREEN, signal: controller.signal })
      .finally(() => {
        settled = true
      })
    await waitFor(30)
    expect(settled).toBe(false)
    controller.abort()
    await expect(running).resolves.toEqual({
      ok: false,
      stop: { kind: 'dismissed', note: 'cancelled', detail: 'AbortError' }
    })
  })

  it('refuses a claim proved for another identifier than the enrolled one', async () => {
    const stack = createScriptedZkPassportStack({ stepMs: 1 })
    const passport = method(stack)
    const enrollInput = passport.enrollInput(PARAMS)
    const enrolled = await externalAppDevice().enroll(enrollInput, SCREEN)
    const config = await passport.configFrom(enrollInput, materialOf(enrolled))
    stack.script({ identifier: 456n })
    const ctx = {
      request: { config } as ApproverRequest,
      place: 0,
      digest: `0x${'ab'.repeat(32)}` as Hex,
      typedData: {} as never
    }
    const input = passport.signingInput(ctx, PARAMS)
    const signed = await externalAppDevice().sign(input, SCREEN)
    await expect(passport.replyFrom(ctx, input, materialOf(signed))).resolves.toEqual({
      kind: 'reply-failure',
      cause: 'material-rejected'
    })
  })
})

describe('the scripted Aadhaar stack', () => {
  const OPTIONS = {
    qrData: QR_DATA,
    certificateFile: 'pem',
    nullifierSeed: 5n,
    fieldsToRevealArray: []
  }
  const DIGEST: Hex = `0x${'ab'.repeat(32)}`

  const prove = async (
    stack: ReturnType<typeof createScriptedAadhaarStack>,
    signal?: AbortSignal,
    signalText?: string
  ) => {
    const progress: string[] = []
    const args = await stack.generateArgs(
      signalText === undefined ? OPTIONS : { ...OPTIONS, signal: signalText }
    )
    const proving = stack.prove(args, (state) => progress.push(state), signal)
    return { progress, proving }
  }

  it('reports its states in order and proves the vector under the seed and the signal it was given', async () => {
    const stack = createScriptedAadhaarStack({ stepMs: 1 })
    const signalText = BigInt(DIGEST).toString()
    const before = Math.floor(Date.now() / 1000)
    const { progress, proving } = await prove(stack, undefined, signalText)
    const pcd: AadhaarPcd = await proving
    const after = Math.floor(Date.now() / 1000)
    expect(progress).toEqual(['fetching-wasm', 'fetching-zkey', 'proving', 'completed'])
    expect(Number(pcd.proof.timestamp)).toBeGreaterThanOrEqual(before)
    expect(Number(pcd.proof.timestamp)).toBeLessThanOrEqual(after)
    expect(pcd.proof).toMatchObject({
      pubkeyHash: '99',
      nullifier: '22',
      ageAbove18: '0',
      gender: '0',
      pincode: '0',
      state: '0',
      nullifierSeed: '5',
      signalHash: (BigInt(keccak256(DIGEST)) / 8n).toString()
    })
    await expect(stack.verify(pcd)).resolves.toBe(true)
  })

  it('fails the proof after its proving state where scripted to', async () => {
    const stack = createScriptedAadhaarStack({ stepMs: 1 })
    stack.script({ prove: 'fail' })
    const { progress, proving } = await prove(stack)
    await expect(proving).rejects.toThrow()
    expect(progress).toEqual(['fetching-wasm', 'fetching-zkey', 'proving'])
  })

  it('hangs until aborted where scripted to, then rejects with an AbortError', async () => {
    const stack = createScriptedAadhaarStack({ stepMs: 1 })
    stack.script({ prove: 'hang' })
    const controller = new AbortController()
    const { progress, proving } = await prove(stack, controller.signal)
    let settled = false
    proving.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      }
    )
    await waitFor(30)
    expect(settled).toBe(false)
    expect(progress).toEqual(['fetching-wasm', 'fetching-zkey'])
    controller.abort()
    await expect(proving).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('stops a running proof at the abort, and refuses to start an aborted one', async () => {
    const stack = createScriptedAadhaarStack({ stepMs: 5 })
    const running = new AbortController()
    const { progress, proving } = await prove(stack, running.signal)
    running.abort()
    await expect(proving).rejects.toMatchObject({ name: 'AbortError' })
    await waitFor(40)
    expect(progress).toEqual([])

    const aborted = new AbortController()
    aborted.abort()
    const late = await prove(stack, aborted.signal)
    await expect(late.proving).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('proves another nullifier where scripted to', async () => {
    const stack = createScriptedAadhaarStack({ stepMs: 1 })
    stack.script({ nullifier: 99n })
    const { proving } = await prove(stack)
    expect((await proving).proof).toMatchObject({ nullifier: '99' })
  })

  it('stamps a QR code signed more than a day ago where scripted stale, and the device clock again after an empty script', async () => {
    const stack = createScriptedAadhaarStack({ stepMs: 1 })
    stack.script({ stale: true })
    const stale = await (await prove(stack)).proving
    const now = Math.floor(Date.now() / 1000)
    expect(now - Number(stale.proof.timestamp)).toBeGreaterThan(24 * 3600)
    stack.script({})
    const fresh = await (await prove(stack)).proving
    expect(Number(fresh.proof.timestamp)).toBeGreaterThanOrEqual(now)
  })

  it('answers the verifier false or throws where scripted to', async () => {
    const stack = createScriptedAadhaarStack({ stepMs: 1 })
    const pcd = await (await prove(stack)).proving
    stack.script({ verify: false })
    await expect(stack.verify(pcd)).resolves.toBe(false)
    stack.script({ verify: 'throw' })
    await expect(stack.verify(pcd)).rejects.toThrow()
    stack.script({})
    await expect(stack.verify(pcd)).resolves.toBe(true)
  })

  it('refuses circuit arguments it did not generate', async () => {
    const stack = createScriptedAadhaarStack({ stepMs: 1 })
    await expect(stack.prove({ nullifierSeed: '5' } as never)).rejects.toThrow()
  })
})

describe('the Aadhaar method over a scripted prover that fails', () => {
  const PARAMS = { nullifierSeed: 1n, issuerCertificate: 'pem' }

  const enrolled = async (stack: ReturnType<typeof createScriptedAadhaarStack>) => {
    const aadhaar = anonAadhaarMethod({ stack })
    const input = aadhaar.enrollInput(PARAMS)
    const config = asConfig(await aadhaar.configFrom(input, { qrData: QR_DATA }))
    const ctx = {
      request: { config } as ApproverRequest,
      place: 0,
      digest: `0x${'ab'.repeat(32)}` as Hex,
      typedData: {} as never
    }
    return { aadhaar, ctx, signing: aadhaar.signingInput(ctx, PARAMS) }
  }

  it('reads a failed proof as rejected material', async () => {
    const stack = createScriptedAadhaarStack({ stepMs: 1 })
    stack.script({ prove: 'fail' })
    const aadhaar = anonAadhaarMethod({ stack })
    await expect(
      aadhaar.configFrom(aadhaar.enrollInput(PARAMS), { qrData: QR_DATA })
    ).resolves.toEqual({ kind: 'reply-failure', cause: 'material-rejected' })
  })

  it('reads a hanging proof the holder stopped as the device refusing', async () => {
    const stack = createScriptedAadhaarStack({ stepMs: 1 })
    stack.script({ prove: 'hang' })
    const aadhaar = anonAadhaarMethod({ stack })
    const controller = new AbortController()
    const running = aadhaar.configFrom(aadhaar.enrollInput(PARAMS), {
      qrData: QR_DATA,
      signal: controller.signal
    })
    await waitFor(20)
    controller.abort()
    await expect(running).resolves.toEqual({ kind: 'reply-failure', cause: 'device-refused' })
  })

  it('refuses a claim proved for another nullifier', async () => {
    const stack = createScriptedAadhaarStack({ stepMs: 1 })
    const { aadhaar, ctx, signing } = await enrolled(stack)
    stack.script({ nullifier: 99n })
    await expect(aadhaar.replyFrom(ctx, signing, { qrData: QR_DATA })).resolves.toEqual({
      kind: 'reply-failure',
      cause: 'material-rejected'
    })
  })

  it('refuses a claim its local verifier rejects', async () => {
    const stack = createScriptedAadhaarStack({ stepMs: 1 })
    const { aadhaar, ctx, signing } = await enrolled(stack)
    stack.script({ verify: false })
    await expect(aadhaar.replyFrom(ctx, signing, { qrData: QR_DATA })).resolves.toEqual({
      kind: 'reply-failure',
      cause: 'material-rejected'
    })
  })

  it('hands a proof its local verifier could not run, which the method then does not judge', async () => {
    const stack = createScriptedAadhaarStack({ stepMs: 1 })
    const { aadhaar, ctx, signing } = await enrolled(stack)
    stack.script({ verify: 'throw' })
    const proof = await aadhaar.replyFrom(ctx, signing, { qrData: QR_DATA })
    expect(typeof proof).toBe('string')
    await expect(aadhaar.verify(ctx as never, proof as Hex)).resolves.toBe('not-judged')
  })
})

describe('the chain verdict the ceremony tab reads', () => {
  const SEPOLIA = networkRecord('sepolia')

  it('judges a reply on the fake node where the chain runs the stand-in', async () => {
    jest.useFakeTimers()
    const identity = await identityWorld()
    buildProvider.mockReturnValue(identity.world.ethers)
    const config = asConfig(await enrollPassport(identity, { steps: [], views: [] }))
    const request = requestFor(identity.client, identity.zkModule, config)
    const reply = replyOf(await claimPassport(identity, request, { steps: [], views: [] }))

    const approving = await extensionClientFor(() => [SEPOLIA])(
      identity.world.account,
      CHAIN_IDS.sepolia
    )
    if (!approving.chainVerdict) {
      throw new Error('no chain verdict')
    }
    await expect(approving.chainVerdict(request, reply)).resolves.toBe('satisfied')
    await expect(approving.chainVerdict(request, { ...reply, proof: '0x1234' })).resolves.toBe(
      'rejected'
    )
  })
})
