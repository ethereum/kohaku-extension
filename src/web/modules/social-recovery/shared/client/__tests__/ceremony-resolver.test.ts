/**
 * The ceremony tab resolves the ceremony a request id names through the
 * client: the request a caller stored under the id in the wallet's records,
 * and the approving side and method implementation of the client built for
 * the account and chain that request names.
 */
import { getRpcProvider } from '@ambire-common/services/provider/getRpcProvider'
import { addressOf, PasskeyMethodDouble } from '@web/modules/social-recovery/sdk-doubles'
import type { ApproverRequest, IRecoveryMethod } from '@web/modules/social-recovery/sdk-interfaces'
import {
  CEREMONY_REPORT_CLOCK_SKEW_MS,
  CEREMONY_REPORT_TTL_MS,
  createPasskeyDevice,
  isWithinExpiry,
  relyingPartyOf,
  runCeremony,
  type CeremonyCall,
  type CeremonyParams,
  type CeremonyResolver
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
  createWorld,
  deploymentDescriptor,
  extensionClientFor,
  fakeApprovingClient,
  networkRecord,
  recordsInMemory,
  sameAddress,
  spyOnBuilder,
  thrownBy
} from '@web/modules/social-recovery/shared/client/__tests__/harness'

jest.mock('@ambire-common/services/provider/getRpcProvider', () => ({
  getRpcProvider: jest.fn()
}))

const buildProvider = getRpcProvider as jest.Mock

afterEach(() => {
  jest.restoreAllMocks()
  buildProvider.mockReset()
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
      const input = { enrolling: slug }
      jest.spyOn(method, 'enrollInput').mockReturnValue(input)
      expect(client.approving.enrollInput(module, {})).toBe(input)
    })
  )

  it('hands out one implementation per slug, the same one each time', async () => {
    const client = await buildRecoveryClient(createWorld().config)
    const methods = SLUGS.map((slug) => client.methodFor(slug))
    expect(new Set(methods).size).toBe(SLUGS.length)
    SLUGS.forEach((slug, i) => expect(client.methodFor(slug)).toBe(methods[i]))
  })

  it('hands out, for two slugs on one module, the method registered last, the one the approving side runs', async () => {
    const { addressBook } = createWorld().config
    const shared = addressBook.methods.passkey
    const world = createWorld({
      addressBook: { ...addressBook, methods: { ...addressBook.methods, aadhaar: shared } }
    })
    const spies = spyOnBuilder()
    const client = await buildRecoveryClient(world.config)
    const serving = spies.method.mock.calls
      .map(([registered]) => registered as IRecoveryMethod)
      .filter((registered) =>
        registered.modules(world.descriptor).some((served) => sameAddress(served, shared))
      )
    expect(serving).toHaveLength(2)
    const last = serving[serving.length - 1]
    expect(client.methodFor('passkey')).toBe(last)
    expect(client.methodFor('aadhaar')).toBe(last)
    const input = { enrolling: 'shared' }
    jest.spyOn(last, 'enrollInput').mockReturnValue(input)
    expect(client.approving.enrollInput(shared, {})).toBe(input)
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
  salt: '0x01'
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
  const passkey = new PasskeyMethodDouble()
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
      clientFor: async () => fakeApprovingClient({ passkey: new PasskeyMethodDouble() })
    })
    await records.ceremonyRequest('fresh').write(ENROLL)
    clock.t = Date.now() - CEREMONY_REPORT_TTL_MS - 1000
    await records.ceremonyRequest('stale').write(ENROLL)
    await expect(resolve(routeOf('enroll', 'passkey', 'fresh'))).resolves.not.toBeNull()
    await expect(resolve(routeOf('enroll', 'passkey', 'stale'))).resolves.toBeNull()
  })

  const OTHER_CHAINS: [string, number | bigint][] = [
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
    expect(world.ethers.send).toHaveBeenCalledWith('eth_chainId', [])
    SLUGS.forEach((slug) => expect(client.methodFor(slug)).toBeDefined())
    const module = world.config.addressBook.methods.passkey
    const input = { enrolling: 'passkey' }
    jest.spyOn(client.methodFor('passkey') as IRecoveryMethod, 'enrollInput').mockReturnValue(input)
    expect(client.approving.enrollInput(module, {})).toBe(input)
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
    world.ethers.answeredChainId = 1
    buildProvider.mockReturnValue(world.ethers)
    const caught = await thrownBy(extensionClientFor(() => [SEPOLIA])(world.account, CHAIN_ID))
    expect(caught).toBeInstanceOf(Error)
    expect((caught as { check?: string }).check).toBe('chain-id')
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
  const OTHER_SLUGS = ['ecdsa', 'zkpassport', 'aadhaar'] as const
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
