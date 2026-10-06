/**
 * Every test file reads the doubles through the SDK interfaces of
 * `sdk-interfaces/` and scripts the chain record through the `World` below, so
 * a rename in the doubles changes this file alone.
 */
import {
  ActionCodecDouble,
  addressOf,
  EventManagerDouble,
  kitFor,
  PolicyManagerDouble,
  ProviderDouble,
  RecoveryActionDouble,
  ScriptedChain,
  ScriptedReadFailure,
  shippedMethodDoubles,
  WalletMethodDouble,
  WalletReadsDouble,
  type AnyMethodDouble,
  type ChainSeed,
  type IWalletReadsDouble,
  type ModuleRead,
  type RecoveryKitBuilderDouble,
  type ScriptedRead,
  type ScriptedRefusalMember
} from '@web/modules/social-recovery/sdk-doubles'
import { clearNote, shapeNote } from '@web/modules/social-recovery/sdk-doubles/encoding'
import type {
  Address,
  ApproverReply,
  ApproverRequest,
  AttemptRequest,
  ClientConfiguration,
  Configuration,
  Credential,
  DeploymentDescriptor,
  FindingCode,
  Gathering,
  Hex,
  IActionCodec,
  IEventManager,
  IMethodsOrchestrator,
  IPolicyManagerInteractor,
  IProvider,
  IRecoveryActionArming,
  IRecoveryActionInteractor,
  IRecoveryClient,
  IRecoveryMethod,
  ISetupClient,
  MethodFailureCause,
  ModuleInfo,
  PaymentOrder,
  PrivacyLevel,
  ReadResult,
  SetupDraft,
  TrustedParties
} from '@web/modules/social-recovery/sdk-interfaces'
import {
  createPasskeyDevice,
  type CredentialsLike,
  relyingPartyOf
} from '@web/modules/social-recovery/shared/ceremony'
import { normalizeP256S, toBase64Url } from '@web/modules/social-recovery/shared/webauthn'
import { bytesToBigInt, keccak256, sha256, stringToBytes, stringToHex, zeroAddress } from 'viem'

/** The attempt statuses a test can script. */
export const ATTEMPT_STATUSES = ['none', 'pending', 'ready', 'cancelled', 'executed'] as const
export type AttemptStatus = typeof ATTEMPT_STATUSES[number]

/** Who cancels a scripted attempt: the account, a caller with proofs, nobody. */
export const CANCELLERS = ['account', 'proofs', 'nobody'] as const
export type Canceller = typeof CANCELLERS[number]

export const METHOD_KINDS = ['wallet', 'passkey', 'zkPassport', 'aadhaar'] as const
export type MethodKind = typeof METHOD_KINDS[number]

/** Every way to build from a builder; each runs the construction checks. */
export const BUILD_PATHS = {
  buildSetupClient: (b: RecoveryKitBuilderDouble) => b.buildSetupClient(),
  buildRecoveryClient: (b: RecoveryKitBuilderDouble) => b.buildRecoveryClient(),
  buildMethodsOrchestrator: (b: RecoveryKitBuilderDouble) => b.buildMethodsOrchestrator(),
  recoveryAction: (b: RecoveryKitBuilderDouble) => b.recoveryAction(),
  methodModuleReads: (b: RecoveryKitBuilderDouble) => b.methodModuleReads()
}
export type BuildPath = keyof typeof BUILD_PATHS

export const PASSWORD = 'correct horse battery staple'

export interface StandingRow {
  method: Address
  moduleInfo: ReadResult<ModuleInfo>
  paused: ReadResult<boolean>
}

export interface CommittedSetup {
  configuration: Configuration
  draft: SetupDraft
  password?: string
}

export interface World {
  chain: ScriptedChain
  descriptor: DeploymentDescriptor
  account: Address
  provider: IProvider
  manager: IPolicyManagerInteractor
  actionPart: IRecoveryActionInteractor & IRecoveryActionArming
  events: IEventManager
  codec: IActionCodec
  methods: Record<MethodKind, IRecoveryMethod>
  /** The wallet reads double, bound to the given client configuration. */
  walletReads(
    config?: Pick<ClientConfiguration, 'creation' | 'accountImplementation'>
  ): IWalletReadsDouble
  /** A fresh builder wired with every double of this world. */
  builder(config?: Partial<ClientConfiguration>): RecoveryKitBuilderDouble
  setupClient(): Promise<ISetupClient>
  recoveryClient(): Promise<IRecoveryClient>
  orchestrator(): IMethodsOrchestrator
  /** The configuration every setup of this world commits: wallet guardians only. */
  configuration: Configuration
  /** A draft the setup client accepts, at a privacy level. */
  draft(level: PrivacyLevel): SetupDraft
  /** The material a willing approver's device returns for a request. */
  material(request: ApproverRequest): unknown
  /** A key the account holds today and an address holding nothing. */
  keys: { held: Address; fresh: Address }
  script: {
    setupNone(): void
    setupCommitted(level: PrivacyLevel): CommittedSetup
    attempt(status: AttemptStatus, canceller?: Canceller): void
    authorized(held: boolean): void
    code(present: boolean): void
    method(
      module: Address,
      patch: { paused?: boolean; trustedParties?: TrustedParties; moduleInfo?: ModuleInfo }
    ): void
    keysUpdated(module: Address, current: Hex[]): void
    /** Every later call of this read throws. */
    failRead(read: ScriptedRead): void
    /** A module read answers `{ answered: false }`, for every module or for the one named. */
    leaveUnanswered(read: ModuleRead, module?: Address): void
    /** The member refuses, throwing a validation refusal carrying this code. */
    refuse(member: ScriptedRefusalMember, code: string): void
    /** Every `replyFrom` returns this typed failure. */
    replyFailure(cause: MethodFailureCause): void
    /** Every `configFrom` returns this typed failure. */
    enrollFailure(cause: MethodFailureCause): void
  }
}

const walletConfig = (label: string): Hex =>
  new WalletMethodDouble().codec.encodeConfig({ address: addressOf(label) })

/** A world over a scripted chain, seeded where a test needs another deployment. */
export const createWorld = (seed: ChainSeed = {}): World => {
  const chain = new ScriptedChain(seed)
  const { descriptor } = chain
  const provider = new ProviderDouble(chain)
  const doubles = shippedMethodDoubles(chain)
  const byKind = (kind: AnyMethodDouble['kind']) => doubles.find((d) => d.kind === kind)!
  const methods: Record<MethodKind, IRecoveryMethod> = {
    wallet: byKind('wallet'),
    passkey: byKind('passkey'),
    zkPassport: byKind('zkpassport'),
    aadhaar: byKind('aadhaar')
  }
  const ecdsa = descriptor.methodEcdsa
  const configuration: Configuration = {
    clauses: [
      {
        threshold: 2,
        credentials: [
          { method: ecdsa, config: walletConfig('ana') },
          { method: ecdsa, config: walletConfig('ben') },
          { method: ecdsa, config: walletConfig('carla') }
        ]
      },
      { threshold: 1, credentials: [{ method: ecdsa, config: walletConfig('hardware-wallet') }] }
    ],
    wait: 432_000n,
    ignoresPause: false
  }
  const keys = { held: chain.authorities[0]!, fresh: addressOf('fresh-key') }
  const codec = new ActionCodecDouble([descriptor.action])
  const builder = (config: Partial<ClientConfiguration> = {}) => {
    const kit = kitFor(chain, config)
    doubles.forEach((m) => kit.method(m))
    return kit
  }
  let kit: RecoveryKitBuilderDouble | undefined
  const sharedKit = () => {
    kit = kit ?? builder()
    return kit
  }
  const draft = (level: PrivacyLevel): SetupDraft => {
    const publicMetadata: Hex =
      level === 'private'
        ? '0x'
        : level === 'shape-visible'
        ? shapeNote(configuration)
        : clearNote(configuration)
    return {
      wait: configuration.wait,
      clauses: configuration.clauses,
      ignoresPause: configuration.ignoresPause,
      privacy: { publicMetadata, backup: level === 'public' ? 'clear' : 'encrypted' }
    }
  }
  const payload = codec.encode({ newAuthority: keys.fresh, removedAuthority: keys.held })
  const cancel = (canceller: Canceller) => {
    // "Nobody" here is a security stop's veto; a setup write is the other nobody.
    if (canceller === 'nobody') {
      chain.cancelAttempt('nobody', { vetoingMethod: descriptor.methodZkpassport })
    } else {
      chain.cancelAttempt(canceller)
    }
  }

  return {
    chain,
    descriptor,
    account: chain.account,
    provider,
    manager: new PolicyManagerDouble(chain),
    actionPart: new RecoveryActionDouble(chain),
    events: new EventManagerDouble(chain, provider),
    codec,
    methods,
    walletReads: (config = {}) => new WalletReadsDouble(chain, config),
    builder,
    setupClient: () => sharedKit().buildSetupClient(),
    recoveryClient: () => sharedKit().buildRecoveryClient(),
    orchestrator: () => sharedKit().buildMethodsOrchestrator(),
    configuration,
    draft,
    material: (request) => {
      const method = doubles.find((d) =>
        d.modules(descriptor).some((m) => m.toLowerCase() === request.method.toLowerCase())
      )!
      return method.satisfyingMaterial(request)
    },
    keys,
    script: {
      setupNone: () => {
        if (chain.setup.status === 'committed') {
          chain.clearSetup()
        }
      },
      setupCommitted: (level) => {
        const password = level === 'public' ? undefined : PASSWORD
        chain.commitSetup({ level, configuration, password })
        return { configuration, draft: draft(level), password }
      },
      attempt: (status, canceller = 'account') => {
        if (status === 'none') {
          return
        }
        chain.openAttempt({ ready: status !== 'pending', payload })
        if (status === 'cancelled') {
          cancel(canceller)
        }
        if (status === 'executed') {
          chain.executeAttempt()
        }
      },
      authorized: (held) => chain.setAuthorized(held),
      code: (present) => chain.setHasCode(present),
      method: (module, patch) => {
        chain.declareMethod(module, patch)
      },
      keysUpdated: (module, current) => chain.updateTrustedKeys(module, current),
      failRead: (read) => {
        chain.failRead(read)
      },
      leaveUnanswered: (read, module) => {
        chain.leaveUnanswered(read, module)
      },
      refuse: (member, code) => {
        chain.refuse(member, {
          kind: 'validation',
          findings: {
            errors: [{ code: code as FindingCode, subject: 'request', values: {} }],
            warnings: []
          }
        })
      },
      replyFailure: (cause) => {
        chain.replyFailure = cause
      },
      enrollFailure: (cause) => {
        chain.enrollFailure = cause
      }
    }
  }
}

export const ZERO: Address = zeroAddress
export const NO_PAYMENT: PaymentOrder = { token: ZERO, amount: 0n, payee: ZERO }
export const WINDOW = 24 * 3600

/** One address in another letter case: the hex digits upper-cased, the prefix kept. */
export const upperCased = (address: Address): Address =>
  `0x${address.slice(2).toUpperCase()}` as Address

/** A wallet guardian's credential under the world's ECDSA method. */
export const walletAt = (world: World, label: string): Credential => ({
  method: world.descriptor.methodEcdsa,
  config: world.methods.wallet.codec.encodeConfig({ address: addressOf(label) })
})

/** A zkPassport credential over one identifier, under the given spelling of its method. */
export const passportAt = (
  world: World,
  id: string,
  method: Address = world.descriptor.methodZkpassport
): Credential => ({
  method,
  config: world.methods.zkPassport.codec.encodeConfig({
    uniqueIdentifier: keccak256(stringToHex(id))
  })
})

/** One approver's reply: the signing input, then the material a willing device returns. */
export const replyFor = async (world: World, request: ApproverRequest): Promise<ApproverReply> => {
  const orchestrator = world.orchestrator()
  const input = orchestrator.signingInput(request)
  const reply = await orchestrator.replyFrom(request, input, await world.material(request))
  expect(reply.kind).toBe('recovery-proof-reply')
  return reply as ApproverReply
}

export interface Opened {
  world: World
  recovery: IRecoveryClient
  orchestrator: IMethodsOrchestrator
  gathering: Gathering
  requests: ApproverRequest[]
}

/** A committed private setup, no attempt, and an opening gathering over it. */
export const openRecovery = async (world: World = createWorld()): Promise<Opened> => {
  const committed = world.script.setupCommitted('private')
  world.script.authorized(true)
  const recovery = await world.recoveryClient()
  const gathering = await recovery.initRecoveryGathering(
    committed.configuration,
    { newAuthority: world.keys.fresh, removedAuthority: world.keys.held },
    NO_PAYMENT,
    { window: WINDOW }
  )
  return {
    world,
    recovery,
    orchestrator: world.orchestrator(),
    gathering,
    requests: recovery.getApproverRequests(gathering)
  }
}

/** Files one reply per request, each add reading the record the last one returned. */
export const fillAll = async ({ world, recovery, gathering, requests }: Opened) => {
  let g = gathering
  // eslint-disable-next-line no-restricted-syntax
  for (const request of requests) {
    // eslint-disable-next-line no-await-in-loop
    const added = recovery.addApproverReply(g, await replyFor(world, request))
    expect(added.reason).toBeUndefined()
    g = added.gathering
  }
  return g
}

/** The moment a caller judges an opened gathering against: one minute after its pinned block. */
export const momentOf = (gathering: Gathering) => Number(gathering.request.block.timestamp) + 60

/** A completed opening request over every reply, ready for `prepareStartAttempt`. */
export const completedRequest = async (opened: Opened) => {
  const filled = await fillAll(opened)
  const now = momentOf(opened.gathering)
  const request = opened.recovery.complete(filled, undefined, now) as AttemptRequest
  return { filled, now, request }
}

/**
 * The whole opening path, landed: a gathering, every reply, the completed
 * request, its prepared `startAttempt`, and the chain applying it. The attempt
 * then waits under the committed setup's own wait.
 */
export const startLanded = async (world: World = createWorld()) => {
  const opened = await openRecovery(world)
  const { request, now } = await completedRequest(opened)
  const prepared = await opened.recovery.prepareStartAttempt(request, now)
  world.chain.land(prepared)
  return { ...opened, request, prepared }
}

/** The opening notification of the live attempt, whose payload the execute takes. */
export const openingOf = async (world: World, attemptId: bigint) => {
  const at = await world.provider.block('latest')
  const notes = await world.events.fetch(world.events.accountFilter(), {
    from: world.descriptor.deployedAt,
    to: at.number
  })
  const opening = notes.find((n) => n.kind === 'attempt-started' && n.attemptId === attemptId)
  if (opening?.kind !== 'attempt-started') {
    throw new Error('no opening notification')
  }
  return opening
}

export const isHex = (value: unknown): value is Hex =>
  typeof value === 'string' && /^0x[0-9a-fA-F]*$/.test(value)
export const isAddress = (value: unknown): value is Address =>
  typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value)

/** Every member of an object, own or on its prototype chain, below Object.prototype. */
export const membersOf = (value: object): string[] => {
  const names = new Set<string>()
  let proto: object | null = value
  while (proto && proto !== Object.prototype) {
    Object.getOwnPropertyNames(proto).forEach((n) => n !== 'constructor' && names.add(n))
    proto = Object.getPrototypeOf(proto)
  }
  return [...names]
}

/**
 * `it.each` and `describe.each` without their typings: the repository's type
 * roots declare the mocha globals over Jest's, so tsc knows no `.each`.
 */
export const eachIt =
  <T>(values: readonly T[]) =>
  (title: string, fn: (value: T) => unknown) =>
    values.forEach((value) =>
      // A tuple case is named by its first member, its label.
      it(title.replace('%s', String(Array.isArray(value) ? value[0] : value)), () => fn(value))
    )

export const eachDescribe =
  <T>(values: readonly T[]) =>
  (title: string, fn: (value: T) => void) =>
    values.forEach((value) => describe(title.replace('%s', String(value)), () => fn(value)))

/** A read the doubles could not make is a thrown value, never an empty answer. */
export const expectThrown = async (run: () => Promise<unknown>) => {
  let caught: unknown
  let answered = false
  try {
    await run()
    answered = true
  } catch (e) {
    caught = e
  }
  expect(answered).toBe(false)
  expect(caught).toBeInstanceOf(Error)
  return caught as Error
}

/** The unanswered-read refusal, checked for its class, its code and exactly what it names. */
export const expectUnanswered = (
  error: Error,
  values: { read: ScriptedRead; module: Address; place?: number }
) => {
  expect(error).toBeInstanceOf(ScriptedReadFailure)
  expect((error as ScriptedReadFailure).code).toBe('read.unanswered')
  expect((error as ScriptedReadFailure).values).toStrictEqual(values)
}

const ECDSA_P256 = { name: 'ECDSA', namedCurve: 'P-256' } as const
const ECDSA_SHA256 = { name: 'ECDSA', hash: 'SHA-256' } as const

/* eslint-disable global-require, @typescript-eslint/no-var-requires */
const webAuthnFakes = () =>
  require('@web/modules/social-recovery/shared/ceremony/__tests__/harness') as typeof import('@web/modules/social-recovery/shared/ceremony/__tests__/harness')
/* eslint-enable global-require, @typescript-eslint/no-var-requires */

export const generateKey = async () => {
  const pair = (await crypto.subtle.generateKey(ECDSA_P256, true, [
    'sign',
    'verify'
  ])) as CryptoKeyPair
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  return { privateKey: pair.privateKey, point: { x: raw.slice(1, 33), y: raw.slice(33, 65) } }
}

type Key = Awaited<ReturnType<typeof generateKey>>

/** The browser's credential, which the SDK's own `Credential` shadows in this file. */
type WebAuthnCredential = Awaited<ReturnType<CredentialsLike['create']>>

export const clientDataOf = (challenge: Uint8Array, origin = webAuthnFakes().EXTENSION_ORIGIN) =>
  stringToBytes(JSON.stringify({ type: 'webauthn.get', challenge: toBase64Url(challenge), origin }))

/**
 * The credential `navigator.credentials.get` resolves: authenticator data under
 * the extension's relying party, the client data over `challenge`, and a DER
 * signature by `key` over `authenticatorData || sha256(clientDataJSON)`.
 */
export const signedAssertion = async (
  key: Key,
  challenge: Uint8Array,
  {
    clientData = clientDataOf(challenge),
    signedClientData = clientData,
    highS = false,
    withSignature = true,
    flags = webAuthnFakes().SYNCED_FLAGS,
    rpIdHash = webAuthnFakes().ORIGIN_HASH
  }: {
    clientData?: Uint8Array
    signedClientData?: Uint8Array
    highS?: boolean
    withSignature?: boolean
    flags?: number
    rpIdHash?: Hex
  } = {}
) => {
  const { authenticatorData, derSignature, P256_N, toBuffer } = webAuthnFakes()
  const authData = authenticatorData({ flags, rpIdHash })
  const raw = new Uint8Array(
    await crypto.subtle.sign(
      ECDSA_SHA256,
      key.privateKey,
      toBuffer(Uint8Array.from([...authData, ...sha256(signedClientData, 'bytes')]))
    )
  )
  const r = bytesToBigInt(raw.slice(0, 32))
  const low = bytesToBigInt(raw.slice(32))
  const lowS = normalizeP256S(low)
  const signature = derSignature(r, highS ? P256_N - lowS : lowS)
  const rawId = Uint8Array.from({ length: 20 }, (_, i) => i + 1)
  return {
    id: toBase64Url(rawId),
    rawId: toBuffer(rawId),
    type: 'public-key',
    authenticatorAttachment: 'platform',
    response: {
      clientDataJSON: toBuffer(clientData),
      authenticatorData: toBuffer(authData),
      ...(withSignature ? { signature: toBuffer(signature) } : {}),
      userHandle: null
    },
    getClientExtensionResults: () => ({})
  }
}

export type Assertion = Awaited<ReturnType<typeof signedAssertion>>

/** A world, a device over fake WebAuthn calls, and the hosts' shared context. */
export const setUp = async ({
  create,
  get
}: {
  create: () => Promise<unknown>
  get: (options?: CredentialRequestOptions) => Promise<unknown>
}) => {
  const { world, requests } = await openRecovery()
  const credentials = {
    create: jest.fn(async () => (await create()) as WebAuthnCredential),
    get: jest.fn(
      async (options?: CredentialRequestOptions) => (await get(options)) as WebAuthnCredential
    )
  }
  const relyingParty = relyingPartyOf({
    protocol: 'chrome-extension:',
    host: webAuthnFakes().EXTENSION_ID
  })
  const device = createPasskeyDevice({ credentials, relyingParty })
  const orchestrator = world.orchestrator()
  const context = {
    orchestrator,
    method: world.methods.passkey,
    devices: { 'browser-authenticator': device }
  }
  return { world, request: requests[0]!, credentials, context, orchestrator }
}

export type Setup = Awaited<ReturnType<typeof setUp>>

// Jest runs every file under __tests__, this one included; its own check runs
// only when Jest runs this file, never from a file that imports the harness.
if (expect.getState().testPath === __filename) {
  describe('harness', () => {
    it('builds a world whose own drafts pass setup validation at every level', async () => {
      const world = createWorld()
      const setup = await world.setupClient()
      const levels: PrivacyLevel[] = ['private', 'shape-visible', 'public']
      const findings = await Promise.all(levels.map((l) => setup.validateSetup(world.draft(l))))
      findings.forEach(({ errors }) => expect(errors).toEqual([]))
    })
  })
}
