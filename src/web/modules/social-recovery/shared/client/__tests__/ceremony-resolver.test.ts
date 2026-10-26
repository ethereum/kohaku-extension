/**
 * The ceremony tab resolves the ceremony a request id names through the
 * client: the request a caller stored under the id in the wallet's records,
 * and the approving side and method implementation of the client built for
 * the account and chain that request names.
 */
import { getRpcProvider } from '@ambire-common/services/provider/getRpcProvider'
import { approvalDigest, passkeyMethod } from '@kohaku-eth/social-recovery'
import type {
  Address,
  ApproverRequest,
  Hex,
  IMethodsOrchestrator,
  IRecoveryMethod,
  Reply,
  Verdict
} from '@kohaku-eth/social-recovery'
import { anonAadhaarMethod } from '@kohaku-eth/social-recovery/recovery-methods'
import {
  CEREMONY_REPORT_CLOCK_SKEW_MS,
  CEREMONY_REPORT_TTL_MS,
  createPasskeyDevice,
  isWithinExpiry,
  relyingPartyOf,
  runCeremony,
  type CeremonyCall,
  type CeremonyParams,
  type CeremonyResolver,
  type ChainVerdict
} from '@web/modules/social-recovery/shared/ceremony'
import {
  ABSENT,
  CeremonyRequestRecord,
  recordKeys
} from '@web/modules/social-recovery/shared/records'

import {
  addressBookOf,
  buildRecoveryClient,
  CHAIN_IDS,
  createCeremonyResolver,
  createDeployedWorld,
  createWorld,
  DEPLOYED_FACTS,
  deploymentDescriptor,
  extensionClientFor,
  failEverything,
  fakeApprovingClient,
  networkRecord,
  recordsInMemory,
  sameAddress,
  sdkStandIn,
  thrownBy,
  World
} from '@web/modules/social-recovery/shared/client/__tests__/harness'
import { addressOf } from '@web/modules/social-recovery/shared/client/__fixtures__/addresses'
import { sepoliaDeploymentVariable } from '@web/modules/social-recovery/shared/client/deployment-env'
import { createScriptedAadhaarStack } from '@web/modules/social-recovery/shared/client/scripted'
import type {
  ChainCase,
  RecordsByCall
} from '@web/modules/social-recovery/shared/client/__fixtures__/types'

jest.mock('@ambire-common/services/provider/getRpcProvider', () => ({
  getRpcProvider: jest.fn()
}))
jest.mock('@web/modules/social-recovery/shared/client/deployment-env', () => ({
  ...jest.requireActual('@web/modules/social-recovery/shared/client/deployment-env'),
  sepoliaDeploymentVariable: jest.fn()
}))

const buildProvider = getRpcProvider as jest.Mock
const deploymentVariable = sepoliaDeploymentVariable as jest.MockedFunction<
  typeof sepoliaDeploymentVariable
>

afterEach(() => {
  jest.restoreAllMocks()
  buildProvider.mockReset()
  deploymentVariable.mockReset()
})

const SLUGS = ['ecdsa', 'passkey', 'aadhaar', 'zkpassport'] as const

describe("the client's method implementation by slug", () => {
  SLUGS.forEach((slug) =>
    it(`hands out for ${slug} the implementation the approving side runs for its module`, async () => {
      const world = createWorld()
      const client = await buildRecoveryClient(world.config)
      const method = client.methodFor(slug)
      if (!method) {
        throw new Error(`no method for ${slug}`)
      }
      const module = world.config.addressBook.methods[slug]
      expect(method.modules(world.descriptor).some((served) => sameAddress(served, module))).toBe(
        true
      )
      const input = { kind: 'nothing-to-perform' } as const
      const enroll = jest.spyOn(method, 'enrollInput').mockReturnValue(input)
      expect(client.approving.enrollInput(module, {})).toEqual(input)
      expect(enroll).toHaveBeenCalledTimes(1)
    })
  )

  it('hands out one implementation per slug, the same one each time', async () => {
    const client = await buildRecoveryClient(createWorld().config)
    const methods = SLUGS.map((slug) => client.methodFor(slug))
    expect(new Set(methods).size).toBe(SLUGS.length)
    SLUGS.forEach((slug, i) => expect(client.methodFor(slug)).toBe(methods[i]))
  })

  const UNKNOWN = [
    'guardian',
    'webauthn',
    'unknown-method',
    '',
    'constructor',
    '__proto__',
    'Passkey'
  ]
  UNKNOWN.forEach((slug) =>
    it(`hands out nothing for the slug '${slug}'`, async () => {
      const client = await buildRecoveryClient(createWorld().config)
      expect(client.methodFor(slug)).toBeUndefined()
    })
  )
})

const ID = 'req-1'
const ACCOUNT = addressOf('holder')
const CHAIN_ID = BigInt(CHAIN_IDS.sepolia)
const T0 = 1_700_000_000_000
/** The module the passkey method serves on the chain this build reads. */
const METHOD_ADDRESS = addressBookOf('sepolia').methods.passkey
const PARAMS = { relyingPartyId: 'chrome-extension://abc', userName: 'holder' }
const REQUEST: ApproverRequest = {
  kind: 'recovery-proof-request',
  version: 1,
  purpose: 'approval',
  chainId: CHAIN_ID.toString(),
  manager: addressOf('manager'),
  digestVersion: '1',
  account: ACCOUNT,
  action: addressOf('action'),
  attemptId: '1',
  setupNonce: '1',
  setupBodyHash: `0x${'44'.repeat(32)}`,
  validUntil: '1790000000',
  place: 0,
  method: METHOD_ADDRESS,
  config: '0xabcd',
  salt: '0x01',
  credentialHoldsCode: false,
  payload: '0x',
  order: { token: addressOf('token'), amount: '0', payee: addressOf('payee') }
}
const target = { account: ACCOUNT, chainId: CHAIN_ID, method: 'passkey' }
const ENROLL: CeremonyRequestRecord = {
  ...target,
  call: 'enroll',
  methodAddress: METHOD_ADDRESS,
  params: PARAMS
}

const routeOf = (call: CeremonyCall, method = 'passkey', id = ID): CeremonyParams => ({
  call,
  method,
  id,
  handOff: false
})

/**
 * The resolver over in-memory records and a client builder that serves the
 * passkey method, both on one clock that starts at `T0`.
 */
const resolverWorld = (
  served: Record<string, IRecoveryMethod> = {},
  descriptor = deploymentDescriptor('sepolia')
) => {
  const passkey = passkeyMethod()
  const { records, storage, clock } = recordsInMemory({ t: T0 })
  const client = fakeApprovingClient({ passkey, ...served }, descriptor)
  const clientFor = jest.fn(async () => client)
  const resolve = createCeremonyResolver({ records, clientFor, now: () => clock.t })
  return { passkey, records, storage, clock, client, clientFor, resolve }
}

/** The ceremony a resolver answered; throws where it answered null or a refusal. */
const ceremonyOf = (answer: Awaited<ReturnType<CeremonyResolver>>) => {
  if (!answer || 'refused' in answer) {
    throw new Error(`no ceremony: ${JSON.stringify(answer)}`)
  }
  return answer
}

describe('the ceremony resolver', () => {
  it('answers null for an id with no stored request, and builds no client', async () => {
    const { resolve, clientFor } = resolverWorld()
    await expect(resolve(routeOf('enroll'))).resolves.toBeNull()
    expect(clientFor).not.toHaveBeenCalled()
  })

  it('answers null for a request stored for another call than the route names, and builds no client', async () => {
    const { records, resolve, clientFor } = resolverWorld()
    await records.ceremonyRequest(ID).write(ENROLL)
    await expect(resolve(routeOf('testAccess'))).resolves.toBeNull()
    await expect(resolve(routeOf('healthCheck'))).resolves.toBeNull()
    expect(clientFor).not.toHaveBeenCalled()
  })

  it('answers null for a request stored for another method than the route names, and builds no client', async () => {
    const { records, resolve, clientFor } = resolverWorld()
    await records.ceremonyRequest(ID).write(ENROLL)
    await expect(resolve(routeOf('enroll', 'zkpassport'))).resolves.toBeNull()
    expect(clientFor).not.toHaveBeenCalled()
  })

  it('answers null for a stored value that is no ceremony request, and builds no client', async () => {
    const { storage, records, resolve, clientFor } = resolverWorld()
    await storage.set(recordKeys.ceremonyRequest(ID), {
      value: { ...ENROLL, methodAddress: 'not-an-address' },
      savedAt: 1
    })
    expect(await records.ceremonyRequest(ID).read()).toBe(ABSENT)
    await expect(resolve(routeOf('enroll'))).resolves.toBeNull()
    expect(clientFor).not.toHaveBeenCalled()
  })

  it('refuses a request whose method the client holds no implementation of, after building the client', async () => {
    const { records, resolve, clientFor, client } = resolverWorld()
    await records.ceremonyRequest(ID).write({ ...ENROLL, method: 'unknown-method' })
    await expect(resolve(routeOf('enroll', 'unknown-method'))).resolves.toEqual({
      refused: 'no-implementation'
    })
    expect(clientFor).toHaveBeenCalledWith(ACCOUNT, CHAIN_ID)
    expect(client.methodFor).toHaveBeenCalledWith('unknown-method')
  })

  it('answers null for a request older than a report of it may live, and builds no client', async () => {
    const { records, resolve, clientFor, clock } = resolverWorld()
    await records.ceremonyRequest(ID).write(ENROLL)
    clock.t = T0 + CEREMONY_REPORT_TTL_MS
    await expect(resolve(routeOf('enroll'))).resolves.toBeNull()
    clock.t = T0 + 24 * 60 * 60 * 1000
    await expect(resolve(routeOf('enroll'))).resolves.toBeNull()
    expect(clientFor).not.toHaveBeenCalled()
    expect((await records.ceremonyRequest(ID).read()).status).toBe('present')
  })

  const AGES = [
    -CEREMONY_REPORT_CLOCK_SKEW_MS - 1,
    -CEREMONY_REPORT_CLOCK_SKEW_MS,
    0,
    CEREMONY_REPORT_TTL_MS - 1,
    CEREMONY_REPORT_TTL_MS,
    CEREMONY_REPORT_TTL_MS + 1
  ]
  AGES.forEach((age) =>
    it(`reads a request of age ${age} ms by the expiry rule of a ceremony report`, async () => {
      const { records, resolve, clock } = resolverWorld()
      await records.ceremonyRequest(ID).write(ENROLL)
      clock.t = T0 + age
      const answer = await resolve(routeOf('enroll'))
      expect(answer !== null).toBe(isWithinExpiry(T0, T0 + age))
    })
  )

  it('reads the age of a request against the wall clock by default', async () => {
    const { records, clock } = recordsInMemory()
    const resolve = createCeremonyResolver({
      records,
      clientFor: async () => fakeApprovingClient({ passkey: passkeyMethod() })
    })
    await records.ceremonyRequest('fresh').write(ENROLL)
    clock.t = Date.now() - CEREMONY_REPORT_TTL_MS - 1000
    await records.ceremonyRequest('stale').write(ENROLL)
    await expect(resolve(routeOf('enroll', 'passkey', 'fresh'))).resolves.not.toBeNull()
    await expect(resolve(routeOf('enroll', 'passkey', 'stale'))).resolves.toBeNull()
  })

  const OTHER_CHAINS: ChainCase[] = [
    ['mainnet, the other recovery chain', 1],
    ['mainnet as a bigint', 1n],
    ['chain 10', 10],
    ['chain 137', 137n]
  ]
  OTHER_CHAINS.forEach(([label, chainId]) =>
    it(`answers null for a request on ${label}, not the chain this build reads, and builds no client`, async () => {
      const { records, resolve, clientFor } = resolverWorld()
      await records.ceremonyRequest(ID).write({ ...ENROLL, chainId })
      await expect(resolve(routeOf('enroll'))).resolves.toBeNull()
      expect(clientFor).not.toHaveBeenCalled()
    })
  )

  it('answers null for an enrollment whose method address is not a module the method serves', async () => {
    const { records, resolve, clientFor } = resolverWorld()
    const ecdsaModule = addressBookOf('sepolia').methods.ecdsa
    await records
      .ceremonyRequest('elsewhere')
      .write({ ...ENROLL, methodAddress: addressOf('elsewhere') })
    await records.ceremonyRequest('ecdsa').write({ ...ENROLL, methodAddress: ecdsaModule })
    await expect(resolve(routeOf('enroll', 'passkey', 'elsewhere'))).resolves.toBeNull()
    await expect(resolve(routeOf('enroll', 'passkey', 'ecdsa'))).resolves.toBeNull()
    expect(clientFor).toHaveBeenCalledTimes(2)
  })
  ;(['testAccess', 'createClaim'] as const).forEach((call) =>
    it(`answers null for a ${call} whose request names a module the method does not serve`, async () => {
      const { records, resolve } = resolverWorld()
      const request = { ...REQUEST, method: addressBookOf('sepolia').methods.zkpassport }
      await records.ceremonyRequest(ID).write({ ...target, call, request })
      await expect(resolve(routeOf(call))).resolves.toBeNull()
    })
  )

  it("reads the method's modules from the descriptor of the client it built", async () => {
    const moved = addressOf('moved-passkey-module')
    const { records, resolve } = resolverWorld(
      {},
      { ...deploymentDescriptor('sepolia'), methodPasskey: moved }
    )
    await records.ceremonyRequest('moved').write({ ...ENROLL, methodAddress: moved })
    await records.ceremonyRequest('shipped').write(ENROLL)
    const resolved = ceremonyOf(await resolve(routeOf('enroll', 'passkey', 'moved')))
    expect(resolved.methodAddress).toBe(moved)
    await expect(resolve(routeOf('enroll', 'passkey', 'shipped'))).resolves.toBeNull()
  })

  it('takes a module address written in another letter case', async () => {
    const { records, resolve } = resolverWorld()
    const upper = `0x${METHOD_ADDRESS.slice(2).toUpperCase()}` as const
    await records.ceremonyRequest(ID).write({ ...ENROLL, methodAddress: upper })
    expect(ceremonyOf(await resolve(routeOf('enroll'))).methodAddress).toBe(upper)
  })

  it('resolves an enrollment to the approving side, the method, and the stored method address and params', async () => {
    const { records, resolve, clientFor, client, passkey } = resolverWorld()
    await records.ceremonyRequest(ID).write(ENROLL)
    const resolved = ceremonyOf(await resolve(routeOf('enroll')))
    expect(resolved).toEqual({
      orchestrator: client.approving,
      method: passkey,
      methodAddress: METHOD_ADDRESS,
      params: PARAMS
    })
    expect(resolved.orchestrator).toBe(client.approving)
    expect(resolved.method).toBe(passkey)
    expect(clientFor).toHaveBeenCalledTimes(1)
    expect(clientFor).toHaveBeenCalledWith(ACCOUNT, CHAIN_ID)
  })
  ;(['testAccess', 'createClaim'] as const).forEach((call) =>
    it(`resolves a ${call} to the approving side, the method, and the stored request and params`, async () => {
      const { records, resolve, client, passkey } = resolverWorld()
      await records.ceremonyRequest(ID).write({ ...target, call, request: REQUEST, params: PARAMS })
      const resolved = ceremonyOf(await resolve(routeOf(call)))
      expect(resolved).toEqual({
        orchestrator: client.approving,
        method: passkey,
        request: REQUEST,
        params: PARAMS
      })
      expect(resolved.orchestrator).toBe(client.approving)
      expect(resolved.method).toBe(passkey)
    })
  )

  it('resolves a health check to the approving side and the method alone', async () => {
    const { records, resolve, client, passkey } = resolverWorld()
    await records.ceremonyRequest(ID).write({ ...target, call: 'healthCheck' })
    await expect(resolve(routeOf('healthCheck'))).resolves.toEqual({
      orchestrator: client.approving,
      method: passkey
    })
  })

  it('resolves no device for any call, so the tab runs the page passkey device', async () => {
    const { records, resolve } = resolverWorld()
    const stored: CeremonyRequestRecord[] = [
      ENROLL,
      { ...target, call: 'testAccess', request: REQUEST },
      { ...target, call: 'createClaim', request: REQUEST },
      { ...target, call: 'healthCheck' }
    ]
    const resolved = await Promise.all(
      stored.map(async (request, i) => {
        await records.ceremonyRequest(`req-${i}`).write(request)
        return resolve(routeOf(request.call, 'passkey', `req-${i}`))
      })
    )
    resolved.forEach((answer) => expect(ceremonyOf(answer)).not.toHaveProperty('device'))
  })

  it('builds the client for the account and chain the stored request names', async () => {
    const { records, resolve, clientFor } = resolverWorld()
    const other = addressOf('another-holder')
    await records
      .ceremonyRequest(ID)
      .write({ ...ENROLL, account: other, chainId: CHAIN_IDS.sepolia })
    await resolve(routeOf('enroll'))
    expect(clientFor).toHaveBeenCalledWith(other, CHAIN_IDS.sepolia)
  })

  it('resolves the request stored under the id the route names, never another', async () => {
    const { records, resolve } = resolverWorld()
    const otherRequest = { ...REQUEST, place: 3 }
    await records
      .ceremonyRequest('req-a')
      .write({ ...target, call: 'testAccess', request: REQUEST })
    await records
      .ceremonyRequest('req-b')
      .write({ ...target, call: 'testAccess', request: otherRequest })
    const resolved = ceremonyOf(await resolve(routeOf('testAccess', 'passkey', 'req-b')))
    expect(resolved.request).toEqual(otherRequest)
  })

  it('keeps the request in the records, so a retry resolves it again', async () => {
    const { records, resolve, passkey } = resolverWorld()
    await records.ceremonyRequest(ID).write(ENROLL)
    const first = ceremonyOf(await resolve(routeOf('enroll')))
    const second = await resolve(routeOf('enroll'))
    expect(first.method).toBe(passkey)
    expect(second).toEqual(first)
    expect((await records.ceremonyRequest(ID).read()).status).toBe('present')
  })

  it('rejects with the error of a client build that rejects', async () => {
    const { records, resolve, clientFor } = resolverWorld()
    await records.ceremonyRequest(ID).write(ENROLL)
    const failure = new Error('the provider did not answer')
    clientFor.mockRejectedValueOnce(failure)
    await expect(resolve(routeOf('enroll'))).rejects.toBe(failure)
  })
})

describe('the client builder the ceremony tab uses', () => {
  const SEPOLIA = networkRecord('sepolia')
  const MAINNET = networkRecord('mainnet')

  it('builds the client for the account over the provider of the chain network, then destroys that provider', async () => {
    const world = createWorld()
    buildProvider.mockReturnValue(world.ethers)
    const clientFor = extensionClientFor(() => [MAINNET, SEPOLIA])
    const client = await clientFor(world.account, CHAIN_ID)
    expect(buildProvider).toHaveBeenCalledTimes(1)
    expect(buildProvider.mock.calls[0][0]).toBe(SEPOLIA)
    SLUGS.forEach((slug) => expect(client.methodFor(slug)).toBeDefined())
    const module = world.config.addressBook.methods.passkey
    const input = { kind: 'nothing-to-perform' } as const
    const enroll = jest
      .spyOn(client.methodFor('passkey') as IRecoveryMethod, 'enrollInput')
      .mockReturnValue(input)
    expect(client.approving.enrollInput(module, {})).toEqual(input)
    expect(enroll).toHaveBeenCalledTimes(1)
    expect(world.ethers.destroy).toHaveBeenCalledTimes(1)
  })

  it('takes the chain id as a number as well as a bigint', async () => {
    const world = createWorld()
    buildProvider.mockReturnValue(world.ethers)
    const client = await extensionClientFor(() => [SEPOLIA])(world.account, CHAIN_IDS.sepolia)
    expect(client.methodFor('passkey')).toBeDefined()
  })

  it('destroys the provider and rejects with the refusal where the build is refused', async () => {
    const world = createWorld()
    world.chain.setChainId(1)
    buildProvider.mockReturnValue(world.ethers)
    const caught = await thrownBy(extensionClientFor(() => [SEPOLIA])(world.account, CHAIN_ID))
    expect(caught).toBeInstanceOf(Error)
    expect(caught).toMatchObject({ message: expect.stringMatching(/chain/i) })
    expect(world.ethers.destroy).toHaveBeenCalledTimes(1)
  })

  it('reads code over the same provider, so a deployed action address with no code is refused as undeployed', async () => {
    deploymentVariable.mockReturnValue(JSON.stringify(DEPLOYED_FACTS))
    const world = createDeployedWorld()
    world.chain.setContractCode(world.descriptor.action, false)
    buildProvider.mockReturnValue(world.ethers)
    const caught = await thrownBy(extensionClientFor(() => [SEPOLIA])(world.account, CHAIN_ID))
    expect(caught).toMatchObject({ name: 'DeploymentRefusal', check: 'action' })
    expect(world.ethers.getCode).toHaveBeenCalledWith(DEPLOYED_FACTS.action, 'latest')
    expect(world.ethers.destroy).toHaveBeenCalledTimes(1)
  })

  const NO_RECOVERY = [10, 137n, 5, 0]
  NO_RECOVERY.forEach((chainId) =>
    it(`rejects for chain ${String(
      chainId
    )}, which carries no recovery deployment, and builds no provider`, async () => {
      const clientFor = extensionClientFor(() => [
        SEPOLIA,
        networkRecord('sepolia', { chainId: BigInt(chainId) })
      ])
      await expect(clientFor(ACCOUNT, chainId)).rejects.toThrow()
      expect(buildProvider).not.toHaveBeenCalled()
    })
  )
  ;(
    [
      ['no networks at all', () => undefined],
      ['an empty list', () => []],
      ['only the other recovery chain', () => [MAINNET]]
    ] as const
  ).forEach(([label, networks]) =>
    it(`rejects for a recovery chain the extension holds no network for, with ${label}, and builds no provider`, async () => {
      await expect(extensionClientFor(networks)(ACCOUNT, CHAIN_ID)).rejects.toThrow()
      expect(buildProvider).not.toHaveBeenCalled()
    })
  )

  it('reads the networks at each build, so a network added later serves the next build', async () => {
    const world = createWorld()
    buildProvider.mockReturnValue(world.ethers)
    const held: ReturnType<typeof networkRecord>[] = []
    const clientFor = extensionClientFor(() => held)
    await expect(clientFor(world.account, CHAIN_ID)).rejects.toThrow()
    held.push(SEPOLIA)
    await expect(clientFor(world.account, CHAIN_ID)).resolves.toBeDefined()
    expect(buildProvider.mock.calls[0][0]).toBe(SEPOLIA)
  })
})

describe('a request for a method the page serves no device for, on the client the extension builds', () => {
  const OTHER_SLUGS = ['ecdsa'] as const
  OTHER_SLUGS.forEach((slug) =>
    (['enroll', 'testAccess'] as const).forEach((call) =>
      it(`ends the ${call} of ${slug} as not supported with no retry, since the page serves only the browser authenticator`, async () => {
        const world = createWorld()
        buildProvider.mockReturnValue(world.ethers)
        const { records } = recordsInMemory()
        const resolve = createCeremonyResolver({
          records,
          clientFor: extensionClientFor(() => [networkRecord('sepolia')])
        })
        const module = world.config.addressBook.methods[slug]
        const base = { account: world.account, chainId: CHAIN_ID, method: slug }
        await records
          .ceremonyRequest(ID)
          .write(
            call === 'enroll'
              ? { ...base, call, methodAddress: module, params: {} }
              : { ...base, call, request: { ...REQUEST, account: world.account, method: module } }
          )
        const route = routeOf(call, slug)
        const resolved = ceremonyOf(await resolve(route))
        expect(resolved.method.deviceBinding).not.toBe('browser-authenticator')
        const configFrom = jest.spyOn(resolved.method, 'configFrom')
        const replyFrom = jest.spyOn(resolved.method, 'replyFrom')

        const credentials = { create: jest.fn(), get: jest.fn() }
        const page = createPasskeyDevice({
          credentials,
          relyingParty: relyingPartyOf({ protocol: 'chrome-extension:', host: 'abc' })
        })
        const outcome = await runCeremony(route, resolved, {
          devices: { 'browser-authenticator': page }
        })
        expect(outcome).toEqual({
          kind: 'verdict',
          verdict: 'notSupported',
          cause: 'no-implementation',
          retry: false
        })
        expect(credentials.create).not.toHaveBeenCalled()
        expect(credentials.get).not.toHaveBeenCalled()
        expect(configFrom).not.toHaveBeenCalled()
        expect(replyFrom).not.toHaveBeenCalled()
      })
    )
  )
})

describe("an identity method's parameters the resolver hands the tab", () => {
  const AADHAAR_ADDRESS = addressBookOf('sepolia').methods.aadhaar
  const STORED = { nullifierSeed: 7n, issuerCertificate: 'stored' }
  const CURRENT = { nullifierSeed: 1n, issuerCertificate: 'current' }
  const aadhaarTarget = { account: ACCOUNT, chainId: CHAIN_ID, method: 'aadhaar' }
  const AADHAAR_REQUEST = { ...REQUEST, method: AADHAAR_ADDRESS }
  const STORED_BY_CALL: RecordsByCall = {
    enroll: { ...aadhaarTarget, call: 'enroll', methodAddress: AADHAAR_ADDRESS, params: STORED },
    testAccess: { ...aadhaarTarget, call: 'testAccess', request: AADHAAR_REQUEST, params: STORED },
    createClaim: { ...aadhaarTarget, call: 'createClaim', request: AADHAAR_REQUEST, params: STORED }
  }

  const identityWorld = () => {
    const world = resolverWorld({
      aadhaar: anonAadhaarMethod({ stack: createScriptedAadhaarStack() })
    })
    world.client.methodParamsFor.mockImplementation((slug) =>
      slug === 'aadhaar' ? CURRENT : undefined
    )
    return world
  }
  ;(['enroll', 'testAccess', 'createClaim'] as const).forEach((call) => {
    it(`hands a ${call} the parameters of the client it built, never the ones the request stored`, async () => {
      const { records, resolve, client } = identityWorld()
      await records.ceremonyRequest(ID).write(STORED_BY_CALL[call])
      const resolved = ceremonyOf(await resolve(routeOf(call, 'aadhaar')))
      expect(resolved.params).toEqual(CURRENT)
      expect(client.methodParamsFor).toHaveBeenCalledWith('aadhaar', call)
    })

    it(`refuses a ${call} where the client it built holds no parameters of the method`, async () => {
      const { records, resolve, client } = identityWorld()
      client.methodParamsFor.mockReturnValue(undefined)
      await records.ceremonyRequest(ID).write(STORED_BY_CALL[call])
      await expect(resolve(routeOf(call, 'aadhaar'))).resolves.toEqual({
        refused: 'no-implementation'
      })
    })
  })

  it('resolves a health check of an identity method, which takes no parameters', async () => {
    const { records, resolve, client } = identityWorld()
    client.methodParamsFor.mockReturnValue(undefined)
    await records.ceremonyRequest(ID).write({ ...aadhaarTarget, call: 'healthCheck' })
    expect(ceremonyOf(await resolve(routeOf('healthCheck', 'aadhaar')))).not.toHaveProperty(
      'params'
    )
  })

  it("keeps the passkey's stored parameters, the relying party and the hand-off its caller chose", async () => {
    const { records, resolve, client } = identityWorld()
    client.methodParamsFor.mockReturnValue(CURRENT)
    await records.ceremonyRequest(ID).write(ENROLL)
    expect(ceremonyOf(await resolve(routeOf('enroll'))).params).toEqual(PARAMS)
  })
})

describe("the chain's verdict the resolver hands the tab", () => {
  const CHAIN_VERDICT: ChainVerdict = async () => 'satisfied'

  const withVerdictWorld = () => {
    const passkey = passkeyMethod()
    const { records, clock } = recordsInMemory({ t: T0 })
    const client = { ...fakeApprovingClient({ passkey }), chainVerdict: CHAIN_VERDICT }
    const resolve = createCeremonyResolver({
      records,
      clientFor: async () => client,
      now: () => clock.t
    })
    return { records, resolve }
  }

  it('hands it to an access test', async () => {
    const { records, resolve } = withVerdictWorld()
    await records.ceremonyRequest(ID).write({ ...target, call: 'testAccess', request: REQUEST })
    expect(ceremonyOf(await resolve(routeOf('testAccess'))).chainVerdict).toBe(CHAIN_VERDICT)
  })
  ;(['enroll', 'createClaim'] as const).forEach((call) =>
    it(`hands none at ${call}`, async () => {
      const { records, resolve } = withVerdictWorld()
      await records
        .ceremonyRequest(ID)
        .write(call === 'enroll' ? ENROLL : { ...target, call, request: REQUEST })
      const resolved = ceremonyOf(await resolve(routeOf(call)))
      expect(resolved).not.toHaveProperty('chainVerdict')
    })
  )

  it('hands none to an access test where the client reads none', async () => {
    const { records, clock } = recordsInMemory({ t: T0 })
    const resolve = createCeremonyResolver({
      records,
      clientFor: async () => fakeApprovingClient({ passkey: passkeyMethod() }),
      now: () => clock.t
    })
    await records.ceremonyRequest(ID).write({ ...target, call: 'testAccess', request: REQUEST })
    expect(ceremonyOf(await resolve(routeOf('testAccess')))).not.toHaveProperty('chainVerdict')
  })
})

describe("the chain's verdict of the client builder the ceremony tab uses", () => {
  const SEPOLIA = networkRecord('sepolia')
  const PROOF: Hex = '0x01'

  /** A request of the world's account and deployment for `method` and `config`, and its reply. */
  const exchangeFor = (world: World, method: Address, config: Hex) => {
    const request = {
      ...REQUEST,
      chainId: String(world.descriptor.chainId),
      manager: world.descriptor.manager,
      action: world.descriptor.action,
      account: world.account,
      method,
      config
    } as ApproverRequest & { purpose: 'approval' }
    const digest = approvalDigest(
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
    const reply: Reply = {
      kind: 'recovery-proof-reply',
      version: 1,
      chainId: request.chainId,
      manager: request.manager,
      account: request.account,
      action: request.action,
      attemptId: request.attemptId,
      purpose: 'approval',
      place: request.place,
      method,
      config,
      salt: request.salt,
      digest,
      proof: PROOF
    }
    return { request, reply }
  }

  /** The access test of a method that cannot judge its proof, judged by `chainVerdict`. */
  const accessTestOver = (
    chainVerdict: ChainVerdict | undefined,
    request: ApproverRequest,
    reply: Reply
  ) => {
    const orchestrator = {
      signingInput: () => ({}),
      replyFrom: async () => reply,
      verify: async (): Promise<Verdict> => 'not-judged'
    } as unknown as IMethodsOrchestrator
    const method = { deviceBinding: 'external-app' } as unknown as IRecoveryMethod
    return runCeremony(
      routeOf('testAccess', 'zkpassport'),
      { orchestrator, method, request, ...(chainVerdict ? { chainVerdict } : {}) },
      {
        devices: {
          'external-app': {
            enroll: async () => ({ ok: true, material: {} }),
            sign: async () => ({ ok: true, material: {} })
          }
        }
      }
    )
  }

  it('reads each verdict on a deployed chain through a provider of its own, destroyed after the read', async () => {
    deploymentVariable.mockReturnValue(
      JSON.stringify({
        ...DEPLOYED_FACTS,
        methodZkpassport: addressOf('deployed-method-zkpassport')
      })
    )
    const world = createDeployedWorld()
    buildProvider.mockReturnValue(world.ethers)
    const client = await extensionClientFor(() => [SEPOLIA])(world.account, CHAIN_ID)
    expect(buildProvider).toHaveBeenCalledTimes(1)
    expect(world.ethers.destroy).toHaveBeenCalledTimes(1)
    const config: Hex = `0x${'a1'.repeat(96)}`
    const { request, reply } = exchangeFor(world, world.descriptor.methodZkpassport, config)

    world.chain.setVerdict(config, 'satisfied')
    expect(await accessTestOver(client.chainVerdict, request, reply)).toMatchObject({
      verdict: 'passed'
    })
    expect(buildProvider).toHaveBeenCalledTimes(2)
    expect(buildProvider.mock.calls[1][0]).toBe(SEPOLIA)
    expect(world.ethers.destroy).toHaveBeenCalledTimes(2)

    world.chain.setVerdict(config, 'rejected')
    expect(await accessTestOver(client.chainVerdict, request, reply)).toEqual({
      kind: 'verdict',
      verdict: 'failed',
      retry: true,
      cause: 'check-rejected'
    })
    expect(buildProvider).toHaveBeenCalledTimes(3)
    expect(world.ethers.destroy).toHaveBeenCalledTimes(3)

    failEverything(world.ethers, new Error('the node did not answer'))
    expect(await accessTestOver(client.chainVerdict, request, reply)).toEqual({
      kind: 'verdict',
      verdict: 'unavailable',
      retry: true,
      cause: 'service-unanswered'
    })
    expect(buildProvider).toHaveBeenCalledTimes(4)
    expect(world.ethers.destroy).toHaveBeenCalledTimes(4)
  })

  it("reads the same page's fake node on the stand-in chain, through no provider of its own", async () => {
    deploymentVariable.mockReturnValue(undefined)
    const world = createWorld({ chain: 'sepolia' })
    buildProvider.mockReturnValue(world.ethers)
    const client = await extensionClientFor(() => [SEPOLIA])(world.account, CHAIN_ID)
    const config: Hex = `0x${'b2'.repeat(96)}`
    const { request, reply } = exchangeFor(world, world.descriptor.methodPasskey, config)

    sdkStandIn.nodeFor(world.descriptor, world.account).setVerdict(config, 'satisfied')
    expect(await accessTestOver(client.chainVerdict, request, reply)).toMatchObject({
      verdict: 'passed'
    })
    sdkStandIn.nodeFor(world.descriptor, world.account).setVerdict(config, 'rejected')
    expect(await accessTestOver(client.chainVerdict, request, reply)).toMatchObject({
      verdict: 'failed',
      cause: 'check-rejected'
    })
    expect(buildProvider).toHaveBeenCalledTimes(1)
  })

  it('leaves a proof the method cannot judge unavailable where the tab holds no chain verdict', async () => {
    const world = createWorld({ chain: 'sepolia' })
    const { request, reply } = exchangeFor(world, world.descriptor.methodZkpassport, '0x01')
    expect(await accessTestOver(undefined, request, reply)).toMatchObject({
      verdict: 'unavailable',
      cause: 'not-judged'
    })
  })
})
