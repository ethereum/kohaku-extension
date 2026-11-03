/**
 * The client of a deployed kit once its checks passed, built over a fake node
 * of the deployment: the methods it serves by slug, the action bound to the
 * account with its disarming call, the wallet's reads over the chain with the
 * verify of a pasted reply, the commit the setup client prepares, the
 * recovery gathering and prepares over the manager, and the one events feed
 * both sides serve.
 */
import {
  approvalDigest,
  approvalTypedData,
  kitSlot,
  METHOD_ECDSA_CONFIG_ABI,
  POLICY_MANAGER_WRITES_ABI,
  RECOVERY_ACTION_SET_ADDR_PRIVILEGE_ABI
} from '@kohaku-eth/social-recovery'
import type {
  Address,
  Configuration,
  Hex,
  PreparedBatch,
  PreparedCall,
  Reply,
  SetupDraft
} from '@kohaku-eth/social-recovery'
import {
  decodeFunctionData,
  encodeAbiParameters,
  getAddress,
  hexToBigInt,
  keccak256,
  numberToHex,
  parseSignature,
  serializeSignature,
  zeroAddress,
  zeroHash
} from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

import {
  addressOf,
  buildRecoveryClient,
  createDeployedWorld,
  DEPLOYED_FACTS,
  thrownBy,
  World
} from '@web/modules/social-recovery/shared/client/__tests__/harness'
import type { ApprovalRequest } from '@web/modules/social-recovery/shared/client/__fixtures__/types'
import { sepoliaDeploymentVariable } from '@web/modules/social-recovery/shared/client/deployment-env'

jest.mock('@web/modules/social-recovery/shared/client/deployment-env', () => ({
  ...jest.requireActual('@web/modules/social-recovery/shared/client/deployment-env'),
  sepoliaDeploymentVariable: jest.fn()
}))

const ARMED: Hex = '0x0000000000000000000000000000000000000000000000000000000000000001'
const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
const KEY_A = addressOf('key-a')

const clientOver = async (world: World) =>
  buildRecoveryClient({
    ...world.config,
    candidateKeys: [KEY_A],
    initialPrivileges: [[KEY_A, ARMED]],
    creation: { factory: DEPLOYED_FACTS.manager, bytecode: '0x00', salt: zeroHash, block: 1 }
  })

const configurationOf = (world: World, guardian: Address): Configuration => ({
  wait: 432_000,
  ignoresPause: false,
  clauses: [
    {
      threshold: 1,
      credentials: [
        {
          method: world.descriptor.methodEcdsa,
          config: encodeAbiParameters(METHOD_ECDSA_CONFIG_ABI, [guardian])
        }
      ]
    }
  ]
})

const requestFor = (world: World, guardian: Address): ApprovalRequest => ({
  kind: 'recovery-proof-request',
  version: 1,
  purpose: 'approval',
  chainId: String(world.descriptor.chainId),
  manager: world.descriptor.manager,
  digestVersion: world.descriptor.digestVersion,
  account: world.account,
  action: world.descriptor.action,
  attemptId: '7',
  setupNonce: '3',
  setupBodyHash: keccak256('0x01'),
  payload: '0x02',
  order: { token: zeroAddress, amount: '0', payee: zeroAddress },
  validUntil: '1900000000',
  place: 0,
  method: world.descriptor.methodEcdsa,
  config: encodeAbiParameters(METHOD_ECDSA_CONFIG_ABI, [guardian]),
  salt: `0x${'01'.padStart(64, '0')}`,
  credentialHoldsCode: false
})

const membersOf = (request: ApprovalRequest) => ({
  chainId: Number(request.chainId),
  manager: request.manager,
  account: request.account,
  action: request.action,
  attemptId: BigInt(request.attemptId),
  setupNonce: BigInt(request.setupNonce),
  setupBodyHash: request.setupBodyHash,
  validUntil: Number(request.validUntil),
  digestVersion: request.digestVersion,
  payload: request.payload,
  order: { ...request.order, amount: BigInt(request.order.amount) }
})

const commitCallOf = (prepared: PreparedCall | PreparedBatch): PreparedCall =>
  prepared.kind === 'call' ? prepared : prepared.calls[prepared.calls.length - 1]

beforeEach(() => {
  ;(sepoliaDeploymentVariable as jest.Mock).mockReturnValue(JSON.stringify(DEPLOYED_FACTS))
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('methodFor', () => {
  it('serves the two primary methods at the deployment addresses, and no identity method the deployment omits', async () => {
    const world = createDeployedWorld()
    const client = await clientOver(world)
    const modulesOf = (slug: string): Address[] =>
      (client.methodFor(slug)?.modules(client.descriptor) ?? []).map((m) => getAddress(m))
    expect(modulesOf('ecdsa')).toContain(getAddress(DEPLOYED_FACTS.methodEcdsa))
    expect(modulesOf('passkey')).toContain(getAddress(DEPLOYED_FACTS.methodPasskey))
    expect(client.methodFor('aadhaar')).toBeUndefined()
    expect(client.methodFor('zkpassport')).toBeUndefined()
    expect(client.methodFor('unknown')).toBeUndefined()
  })

  it('serves both identity methods at the addresses the deployment names', async () => {
    const methodAadhaar = addressOf('deployed-method-aadhaar')
    const methodZkpassport = addressOf('deployed-method-zkpassport')
    ;(sepoliaDeploymentVariable as jest.Mock).mockReturnValue(
      JSON.stringify({ ...DEPLOYED_FACTS, methodAadhaar, methodZkpassport })
    )
    const client = await clientOver(createDeployedWorld())
    const modulesOf = (slug: string): Address[] =>
      (client.methodFor(slug)?.modules(client.descriptor) ?? []).map((m) => getAddress(m))
    expect(client.methodFor('aadhaar')?.deviceBinding).toBe('in-browser-prover')
    expect(modulesOf('aadhaar')).toEqual([getAddress(methodAadhaar)])
    expect(client.methodFor('zkpassport')?.deviceBinding).toBe('external-app')
    expect(modulesOf('zkpassport')).toEqual([getAddress(methodZkpassport)])
  })

  it("judges a guardian's real signature by the config's key as satisfied, on the method and the approving side", async () => {
    const world = createDeployedWorld()
    const client = await clientOver(world)
    const guardian = privateKeyToAccount(generatePrivateKey())
    const request = requestFor(world, guardian.address)
    const digest = approvalDigest(membersOf(request), request.place)
    const ctx = {
      request,
      place: request.place,
      digest,
      typedData: approvalTypedData(membersOf(request), request.place)
    }
    const signature = await guardian.sign({ hash: digest })

    expect(await client.methodFor('ecdsa')?.verify(ctx, signature)).toBe('satisfied')
    expect(await client.approving.verify(request, request.place, signature)).toBe('satisfied')
  })

  it('turns a high-s signature into the low form in the reply', async () => {
    const world = createDeployedWorld()
    const client = await clientOver(world)
    const guardian = privateKeyToAccount(generatePrivateKey())
    const request = requestFor(world, guardian.address)
    const signature = await guardian.sign({
      hash: approvalDigest(membersOf(request), request.place)
    })
    const { r, s, yParity } = parseSignature(signature)
    const highS = serializeSignature({
      r,
      s: numberToHex(SECP256K1_N - hexToBigInt(s), { size: 32 }),
      yParity: yParity === 0 ? 1 : 0
    })

    const input = client.approving.signingInput(request)
    const reply = (await client.approving.replyFrom(request, input, { signature: highS })) as Reply
    expect(reply.kind).toBe('recovery-proof-reply')
    expect(reply.proof).toBe(signature)
  })
})

describe('the action bound to the account', () => {
  it('prepares the disarming call the account sends to itself, at the pinned block', async () => {
    const world = createDeployedWorld()
    const client = await clientOver(world)
    const call = await client.action.disarmingCall()
    expect([call.kind, call.target, call.value, call.sender]).toEqual([
      'call',
      getAddress(world.account),
      0n,
      'account'
    ])
    expect(call.block.number).toBe(world.chain.head.number)
    const { functionName, args } = decodeFunctionData({
      abi: RECOVERY_ACTION_SET_ADDR_PRIVILEGE_ABI,
      data: call.data
    })
    expect(functionName).toBe('setAddrPrivilege')
    expect(args).toEqual([getAddress(kitSlot(world.descriptor.action)), zeroHash])
  })

  it('answers the account not armed where it has no code', async () => {
    const world = createDeployedWorld()
    world.chain.setHasCode(false)
    const client = await clientOver(world)
    await expect(client.action.isAuthorized()).resolves.toBe(false)
  })
})

describe("the wallet's reads", () => {
  it('names the key the creation grants on an account with no code', async () => {
    const world = createDeployedWorld()
    world.chain.setHasCode(false)
    const client = await clientOver(world)
    await expect(client.walletReads.removedKey()).resolves.toEqual({ kind: 'named', key: KEY_A })
  })

  it('judges the fit of an account with no code by the implementation the action serves', async () => {
    const world = createDeployedWorld()
    world.chain.setHasCode(false)
    const client = await clientOver(world)
    await expect(client.walletReads.fitCheck()).resolves.toMatchObject({
      basis: 'code-to-be',
      fits: true
    })
  })

  it("names a deployed account's key from its privilege writes where the wallet holds no creation record", async () => {
    const world = createDeployedWorld()
    world.chain.setPrivilege(KEY_A)
    const client = await buildRecoveryClient(world.config)
    await expect(client.walletReads.removedKey()).resolves.toEqual({
      kind: 'named',
      key: getAddress(KEY_A)
    })
    await expect(client.walletReads.fitCheck()).resolves.toEqual({
      basis: 'deployed-code',
      fits: true
    })
  })

  it('computes the commitment of a configuration as the commit the setup client prepares carries it', async () => {
    const world = createDeployedWorld()
    const client = await clientOver(world)
    const configuration = configurationOf(world, addressOf('guardian'))
    const draft: SetupDraft = {
      ...configuration,
      privacy: { publicMetadata: '0x', backup: 'clear' }
    }
    const prepared = await client.setup.prepareCommitSetup(draft)
    const decoded = decodeFunctionData({
      abi: POLICY_MANAGER_WRITES_ABI,
      data: commitCallOf(prepared).data
    })
    if (decoded.functionName !== 'commitSetup') {
      throw new Error(`Not a commit: ${decoded.functionName}.`)
    }
    const [, setupCommitment, nonce] = decoded.args
    expect(client.walletReads.commitmentOf(nonce, configuration)).toBe(setupCommitment)
    const other = { ...configuration, wait: configuration.wait + 1 }
    expect(client.walletReads.commitmentOf(nonce, other)).not.toBe(setupCommitment)
  })

  it("verifies a pasted reply through the guardian method's own verify view", async () => {
    const world = createDeployedWorld()
    const client = await clientOver(world)
    const guardian = privateKeyToAccount(generatePrivateKey())
    const request = requestFor(world, guardian.address)
    const digest = approvalDigest(membersOf(request), request.place)
    const reply: Reply = {
      kind: 'recovery-proof-reply',
      version: 1,
      chainId: request.chainId,
      manager: request.manager,
      account: request.account,
      action: request.action,
      attemptId: request.attemptId,
      purpose: request.purpose,
      place: request.place,
      method: request.method,
      config: request.config,
      salt: request.salt,
      digest,
      proof: await guardian.sign({ hash: digest })
    }
    const verify = jest.spyOn(world.chain, 'call')

    expect(await client.walletReads.verifyReply(request, reply)).toBe('satisfied')
    expect(verify.mock.calls.map(([to]) => getAddress(to))).toEqual([
      getAddress(world.descriptor.methodEcdsa)
    ])
  })
})

describe('the recovery side', () => {
  it('refuses a gathering while an attempt is already open on the deployed action', async () => {
    const world = createDeployedWorld()
    const client = await clientOver(world)
    const configuration = configurationOf(world, addressOf('guardian'))
    await world.chain.commitSetup(configuration, { publicMetadata: '0x', backup: 'clear' })
    world.chain.openAttempt()
    const thrown = await thrownBy(
      client.recovery.initRecoveryGathering(
        configuration,
        { newAuthority: addressOf('new-key'), removedAuthority: KEY_A },
        { token: zeroAddress, amount: 0n, payee: zeroAddress },
        { window: 3600 }
      )
    )
    expect(thrown).toBeInstanceOf(Error)
  })

  it("prepares the owner's cancel the account sends to the manager, at the pinned block", async () => {
    const world = createDeployedWorld()
    const client = await clientOver(world)
    await world.chain.commitSetup(configurationOf(world, addressOf('guardian')), {
      publicMetadata: '0x',
      backup: 'clear'
    })
    world.chain.openAttempt()
    const call = await client.recovery.prepareCancelByOwner()
    expect([call.kind, call.target, call.value, call.sender]).toEqual([
      'call',
      getAddress(world.descriptor.manager),
      0n,
      'account'
    ])
    const decoded = decodeFunctionData({ abi: POLICY_MANAGER_WRITES_ABI, data: call.data })
    expect(decoded.functionName).toBe('cancelByOwner')
    expect(getAddress((decoded.args as readonly unknown[])[0] as Address)).toBe(
      getAddress(world.descriptor.action)
    )
  })
})

describe('the events feed', () => {
  it("reads the manager's logs of the account at the deployed action, one feed on both sides", async () => {
    const world = createDeployedWorld()
    const client = await clientOver(world)
    await world.chain.commitSetup(configurationOf(world, addressOf('guardian')), {
      publicMetadata: '0x',
      backup: 'clear'
    })
    const { events } = client.setup
    const { head } = world.chain
    const found = await events.fetch(events.accountFilter(), {
      from: head.number - 10,
      to: head.number
    })
    expect(found.map((notification) => notification.kind)).toEqual(['setup-committed'])
    expect(world.ethers.getLogs).toHaveBeenCalled()
    expect(client.recovery.events).toBe(events)
  })
})
