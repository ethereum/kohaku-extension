/**
 * The client of a deployed kit once its checks passed: the methods it serves
 * by slug, the action bound to the account with its real disarming call, the
 * wallet's reads over the chain with the verify of a pasted reply, the
 * recovery gathering and prepares over the manager, the one events feed both
 * sides serve, and the members it does not serve yet, each refusing by name.
 */
import {
  decodeFunctionData,
  encodeEventTopics,
  encodeFunctionData,
  encodeFunctionResult,
  getAddress,
  type Hex,
  hexToBigInt,
  isAddressEqual,
  numberToHex,
  pad,
  parseAbi,
  parseSignature,
  serializeSignature,
  zeroAddress,
  zeroHash
} from 'viem'

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

import { PROXY_AMBIRE_ACCOUNT } from '@ambire-common/consts/deploy'
import { defaultClientConfiguration } from '@web/modules/social-recovery/sdk-doubles'
import {
  digestOfRequest,
  membersOfRequest,
  typedDataOf
} from '@web/modules/social-recovery/sdk-doubles/encoding'
import type {
  Address,
  ApproverReply,
  ClientConfiguration
} from '@web/modules/social-recovery/sdk-interfaces'
import { buildKitClient } from '@web/modules/social-recovery/shared/client/kit/builder'
import {
  ATTEMPT_CANCELLED_TOPIC,
  ATTEMPT_CONSUMED_TOPIC,
  ATTEMPT_STARTED_TOPIC,
  SETUP_CLEARED_TOPIC,
  SETUP_COMMITTED_TOPIC
} from '@web/modules/social-recovery/shared/client/kit/events'
import { ecdsaConfigOf } from '@web/modules/social-recovery/shared/client/kit/formats'
import {
  DEPLOYED_ACTION,
  DEPLOYED_KIT_SLOT,
  FACTS,
  scriptDeployment
} from '@web/modules/social-recovery/shared/client/kit/builder/__tests__/harness'
import {
  createActionReads,
  createManagerReads
} from '@web/modules/social-recovery/shared/client/kit/reads'
import {
  ACCOUNT,
  ACCOUNT_ABI,
  ACTION_ABI,
  approverReplyTo,
  approverRequestAt,
  commitArgsOf,
  commitCallOf,
  committedLog,
  CONFIGURATION,
  CONTRACT_CODE,
  DEPLOYED_AT,
  DESCRIPTOR,
  draftAt,
  fakeNode,
  guardianAt,
  HEAD,
  KEY_A,
  MANAGER,
  METHOD_AADHAAR,
  METHOD_ECDSA,
  METHOD_PASSKEY,
  METHOD_ZKPASSPORT,
  NO_STATE,
  scriptAction,
  scriptMethod,
  stateAnswer,
  stateOfCall,
  thrownBy,
  VERIFY_MAGIC,
  verifyCallsOf
} from '@web/modules/social-recovery/shared/client/kit/setup-client/__tests__/harness'
import type {
  DeploymentFacts,
  PrivilegeAccount
} from '@web/modules/social-recovery/shared/client/types'

const ARMED = '0x0000000000000000000000000000000000000000000000000000000000000001'

const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n

const PRIVILEGE_EVENT = parseAbi(['event LogPrivilegeChanged(address indexed addr, bytes32 priv)'])
const PRIVILEGES_VIEW = parseAbi(['function privileges(address) view returns (bytes32)'])
const CANCEL_BY_OWNER = parseAbi(['function cancelByOwner(address action)'])

const BOOK = {
  manager: MANAGER,
  methods: {
    ecdsa: METHOD_ECDSA,
    passkey: METHOD_PASSKEY,
    aadhaar: METHOD_AADHAAR,
    zkpassport: METHOD_ZKPASSPORT
  },
  action: DEPLOYED_ACTION
}

const LISTED_ACCOUNT: PrivilegeAccount = {
  addr: ACCOUNT,
  associatedKeys: [KEY_A],
  initialPrivileges: [[KEY_A, ARMED]],
  creation: { factoryAddr: MANAGER, bytecode: '0x00', salt: zeroHash }
}

const clientOver = (
  facts: DeploymentFacts = FACTS,
  {
    privilegeAccount = LISTED_ACCOUNT,
    blockTags,
    logChunkWidth
  }: {
    privilegeAccount?: PrivilegeAccount
    blockTags?: ClientConfiguration['blockTags']
    logChunkWidth?: number
  } = {}
) => {
  const node = fakeNode()
  scriptDeployment(node)
  const descriptor = { ...DESCRIPTOR, action: DEPLOYED_ACTION, auditedActions: [DEPLOYED_ACTION] }
  const client = buildKitClient({
    chain: 'sepolia',
    account: ACCOUNT,
    descriptor,
    facts,
    addressBook: BOOK,
    config: defaultClientConfiguration({
      accountImplementation: PROXY_AMBIRE_ACCOUNT,
      ...(blockTags && { blockTags }),
      ...(logChunkWidth !== undefined && { logChunkWidth })
    }),
    provider: node.provider,
    codeRead: node.codeRead,
    transactionRead: node.transactionRead,
    manager: createManagerReads(node.provider, MANAGER),
    action: createActionReads(
      { provider: node.provider, codeRead: node.codeRead },
      DEPLOYED_ACTION
    ),
    privilegeAccount
  })
  return { node, client }
}

const modulesOf = (client: ReturnType<typeof clientOver>['client'], slug: string): Address[] =>
  (client.methodFor(slug)?.modules(client.descriptor) ?? []).map((m) => getAddress(m))

describe('methodFor', () => {
  it('serves the two primary methods at the deployment addresses, and no identity method it does not name', () => {
    const { client } = clientOver()
    expect(modulesOf(client, 'ecdsa')).toContain(getAddress(METHOD_ECDSA))
    expect(modulesOf(client, 'passkey')).toContain(getAddress(METHOD_PASSKEY))
    expect(client.methodFor('aadhaar')).toBeUndefined()
    expect(client.methodFor('zkpassport')).toBeUndefined()
    expect(client.methodFor('unknown')).toBeUndefined()
  })

  it('serves an identity method where the deployment names its module', () => {
    const { client } = clientOver({
      ...FACTS,
      methodAadhaar: getAddress(METHOD_AADHAAR),
      methodZkpassport: getAddress(METHOD_ZKPASSPORT)
    })
    expect(modulesOf(client, 'aadhaar')).toContain(getAddress(METHOD_AADHAAR))
    expect(modulesOf(client, 'zkpassport')).toContain(getAddress(METHOD_ZKPASSPORT))
  })

  it("judges a guardian's real signature by the config's key as satisfied, on the method and the approving side", async () => {
    const { client } = clientOver()
    const guardian = privateKeyToAccount(generatePrivateKey())
    const request = approverRequestAt(guardianAt(0, { config: ecdsaConfigOf(guardian.address) }), 0)
    const digest = digestOfRequest(request)
    const ctx = {
      request,
      place: request.place,
      digest,
      typedData: typedDataOf(membersOfRequest(request))
    }
    const signature = await guardian.sign({ hash: digest })

    expect(await client.methodFor('ecdsa')?.verify(ctx, signature)).toBe('satisfied')
    expect(await client.approving.verify(request, request.place, signature)).toBe('satisfied')
  })

  it("gives the guardian's typed data to sign and turns a high-s signature into the low form in the reply", async () => {
    const { client } = clientOver()
    const guardian = privateKeyToAccount(generatePrivateKey())
    const request = approverRequestAt(guardianAt(0, { config: ecdsaConfigOf(guardian.address) }), 0)
    const digest = digestOfRequest(request)
    const signature = await guardian.sign({ hash: digest })
    const { r, s, yParity } = parseSignature(signature)
    const highS = serializeSignature({
      r,
      s: numberToHex(SECP256K1_N - hexToBigInt(s), { size: 32 }),
      yParity: yParity === 0 ? 1 : 0
    })

    expect(client.approving.signingInput(request)).toEqual(typedDataOf(membersOfRequest(request)))
    const reply = (await client.approving.replyFrom(request, undefined, {
      signature: highS
    })) as ApproverReply
    expect(reply.kind).toBe('recovery-proof-reply')
    expect(reply.proof).toBe(signature)
  })
})

describe('the action bound to the account', () => {
  it('prepares the disarming call the account sends to itself, at the pinned block', async () => {
    const { node, client } = clientOver()
    const call = await client.action.disarmingCall()
    expect([call.kind, call.target, call.value, call.sender]).toEqual([
      'call',
      ACCOUNT,
      0n,
      'account'
    ])
    expect(call.block).toEqual({ number: HEAD, hash: node.head.hash })
    const { functionName, args } = decodeFunctionData({ abi: ACCOUNT_ABI, data: call.data })
    expect(functionName).toBe('setAddrPrivilege')
    expect(args).toEqual([DEPLOYED_KIT_SLOT, zeroHash])
  })

  it('answers the account not armed with no call where it has no code', async () => {
    const { node, client } = clientOver()
    await expect(client.action.isAuthorized()).resolves.toBe(false)
    expect(node.calls).toEqual([])
  })
})

describe("the wallet's reads", () => {
  it('names the key the creation grants on an account with no code', async () => {
    const { client } = clientOver()
    await expect(client.walletReads.removedKey()).resolves.toEqual({ kind: 'named', key: KEY_A })
  })

  it('judges the fit of an account with no code by the implementation the action serves', async () => {
    const { client } = clientOver()
    await expect(client.walletReads.fitCheck()).resolves.toMatchObject({
      basis: 'code-to-be',
      fits: true
    })
  })

  it("names a deployed account's key from its privilege writes where the wallet holds no creation record", async () => {
    const { node, client } = clientOver(FACTS, {
      privilegeAccount: {
        addr: ACCOUNT,
        associatedKeys: [],
        initialPrivileges: [],
        creation: null
      },
      blockTags: { read: 'finalized', watch: 'finalized' }
    })
    node.setCode(ACCOUNT, CONTRACT_CODE, DEPLOYED_AT)
    node.addLog({
      address: ACCOUNT,
      topics: encodeEventTopics({
        abi: PRIVILEGE_EVENT,
        eventName: 'LogPrivilegeChanged',
        args: { addr: KEY_A }
      }) as Hex[],
      data: ARMED,
      blockNumber: HEAD - 5,
      blockHash: zeroHash,
      logIndex: 0,
      transactionHash: zeroHash
    })
    node.answer(
      ACCOUNT,
      encodeFunctionData({ abi: PRIVILEGES_VIEW, functionName: 'privileges', args: [KEY_A] }),
      ARMED
    )
    node.answer(
      DEPLOYED_ACTION,
      encodeFunctionData({ abi: ACTION_ABI, functionName: 'isAuthority', args: [ACCOUNT, KEY_A] }),
      encodeFunctionResult({ abi: ACTION_ABI, functionName: 'isAuthority', result: true })
    )
    await expect(client.walletReads.removedKey()).resolves.toEqual({
      kind: 'named',
      key: getAddress(KEY_A)
    })
    expect(node.provider.block).toHaveBeenCalledWith('finalized')
    expect(node.provider.logs.mock.calls.map(([, range]) => range)).toEqual([
      { from: DEPLOYED_AT, to: HEAD },
      { from: DEPLOYED_AT, to: HEAD }
    ])
    expect(node.calls.map(({ to, block }) => [to, block])).toEqual([
      [ACCOUNT, HEAD],
      [DEPLOYED_ACTION, HEAD]
    ])
    node.answer(
      DEPLOYED_ACTION,
      encodeFunctionData({ abi: ACTION_ABI, functionName: 'supportsAccount', args: [ACCOUNT] }),
      encodeFunctionResult({ abi: ACTION_ABI, functionName: 'supportsAccount', result: true })
    )
    await expect(client.walletReads.fitCheck()).resolves.toEqual({
      basis: 'deployed-code',
      fits: true
    })
  })

  it("names the sender of an unlisted account's latest setup commit through the transaction read", async () => {
    const { node, client } = clientOver(FACTS, {
      privilegeAccount: { addr: ACCOUNT, associatedKeys: [], initialPrivileges: [], creation: null }
    })
    node.setCode(ACCOUNT, CONTRACT_CODE, DEPLOYED_AT)
    const commit = committedLog(
      { action: DEPLOYED_ACTION, nonce: 1n, setupCommitment: ARMED },
      HEAD - 5
    )
    node.addLog(commit)
    node.setSender(commit.transactionHash, getAddress(KEY_A))
    node.answer(
      ACCOUNT,
      encodeFunctionData({ abi: PRIVILEGES_VIEW, functionName: 'privileges', args: [KEY_A] }),
      ARMED
    )
    node.answer(
      DEPLOYED_ACTION,
      encodeFunctionData({ abi: ACTION_ABI, functionName: 'isAuthority', args: [ACCOUNT, KEY_A] }),
      encodeFunctionResult({ abi: ACTION_ABI, functionName: 'isAuthority', result: true })
    )
    await expect(client.walletReads.removedKey()).resolves.toEqual({
      kind: 'named',
      key: getAddress(KEY_A)
    })
    expect(node.transactionRead.mock.calls).toEqual([[commit.transactionHash]])
  })

  it("reads an unlisted account's privilege writes and manager logs in chunks of the configured width", async () => {
    const { node, client } = clientOver(FACTS, {
      privilegeAccount: {
        addr: ACCOUNT,
        associatedKeys: [],
        initialPrivileges: [],
        creation: null
      },
      logChunkWidth: 400_000
    })
    node.setCode(ACCOUNT, CONTRACT_CODE)
    await expect(client.walletReads.removedKey()).resolves.toEqual({
      kind: 'unavailable',
      cause: 'no-source'
    })
    const rangesAt = (address: Address) =>
      node.provider.logs.mock.calls
        .filter(([filter]) => filter.addresses.some((at: Address) => isAddressEqual(at, address)))
        .map(([, range]) => range)
    expect(rangesAt(ACCOUNT)).toEqual([
      { from: 0, to: 399_999 },
      { from: 400_000, to: 799_999 },
      { from: 800_000, to: HEAD }
    ])
    expect(rangesAt(MANAGER)).toEqual([{ from: DEPLOYED_AT, to: HEAD }])
  })

  it('computes the commitment of a configuration as the commit the setup client prepares carries it', async () => {
    const { node, client } = clientOver()
    node.answer(MANAGER, stateOfCall(DEPLOYED_ACTION), stateAnswer(NO_STATE))
    scriptMethod(node, METHOD_ECDSA, { name: 'method-ecdsa' })
    scriptAction(node, { at: DEPLOYED_ACTION })
    const prepared = await client.setup.prepareCommitSetup(draftAt('public'))
    const args = commitArgsOf(commitCallOf(prepared))
    expect(client.walletReads.commitmentOf(args.nonce, CONFIGURATION)).toBe(args.setupCommitment)
    const other = { ...CONFIGURATION, wait: CONFIGURATION.wait + 1n }
    expect(client.walletReads.commitmentOf(args.nonce, other)).not.toBe(args.setupCommitment)
  })

  it("verifies a pasted reply through the guardian method's own verify view", async () => {
    const { node, client } = clientOver()
    scriptMethod(node, METHOD_ECDSA, { verify: VERIFY_MAGIC })
    const request = approverRequestAt(guardianAt(0), 0)
    const reply = approverReplyTo(request)

    expect(await client.walletReads.verifyReply(request, reply)).toBe('satisfied')
    expect(verifyCallsOf(node)).toEqual([
      expect.objectContaining({ module: METHOD_ECDSA, proof: reply.proof })
    ])
  })
})

describe('the recovery side', () => {
  it("opens a gathering over the manager's state of the deployed action", async () => {
    const { node, client } = clientOver()
    node.answer(
      MANAGER,
      stateOfCall(DEPLOYED_ACTION),
      stateAnswer({ ...NO_STATE, attemptState: 1 })
    )
    const thrown = await thrownBy(
      client.recovery.initRecoveryGathering(
        { password: 'unused' },
        { newAuthority: KEY_A },
        { token: zeroAddress, amount: 0n, payee: zeroAddress },
        { window: 3600 }
      )
    )
    expect(thrown).toMatchObject({
      name: 'ValidationRefusal',
      findings: { errors: [expect.objectContaining({ code: 'request.attempt-active' })] }
    })
    expect(node.calls).toEqual([{ to: MANAGER, data: stateOfCall(DEPLOYED_ACTION), block: HEAD }])
  })

  it("prepares the owner's cancel the account sends to the manager, at the pinned block", async () => {
    const { node, client } = clientOver()
    const call = await client.recovery.prepareCancelByOwner()
    expect([call.kind, call.target, call.value, call.sender]).toEqual([
      'call',
      MANAGER,
      0n,
      'account'
    ])
    expect(call.block).toEqual({ number: HEAD, hash: node.head.hash })
    expect(decodeFunctionData({ abi: CANCEL_BY_OWNER, data: call.data })).toEqual({
      functionName: 'cancelByOwner',
      args: [getAddress(DEPLOYED_ACTION)]
    })
  })
})

describe('the events feed', () => {
  it("reads the manager's logs of the account at the deployed action, one feed on both sides", async () => {
    const { node, client } = clientOver()
    const { events } = client.setup
    await expect(
      events.fetch(events.accountFilter(), { from: HEAD - 10, to: HEAD })
    ).resolves.toEqual([])
    expect(node.provider.logs).toHaveBeenCalledWith(
      {
        addresses: [MANAGER],
        topics: [
          [
            SETUP_COMMITTED_TOPIC,
            SETUP_CLEARED_TOPIC,
            ATTEMPT_STARTED_TOPIC,
            ATTEMPT_CANCELLED_TOPIC,
            ATTEMPT_CONSUMED_TOPIC
          ],
          pad(ACCOUNT.toLowerCase() as Hex),
          pad(DEPLOYED_ACTION.toLowerCase() as Hex)
        ]
      },
      { from: HEAD - 10, to: HEAD }
    )
    expect(client.recovery.events).toBe(events)
  })

  it('reads in chunks of the configured width, which a node with a narrow ceiling serves', async () => {
    const { node, client } = clientOver(FACTS, { logChunkWidth: 2 })
    const read = node.provider.logs.getMockImplementation()!
    node.provider.logs.mockImplementation(async (filter, range) => {
      if (range.to - range.from + 1 > 2) {
        throw new Error('range too wide')
      }
      return read(filter, range)
    })
    const { events } = client.setup
    await expect(events.fetch(events.accountFilter(), { from: 100, to: 104 })).resolves.toEqual([])
    expect(node.provider.logs.mock.calls.map(([, range]) => range)).toEqual([
      { from: 100, to: 101 },
      { from: 102, to: 103 },
      { from: 104, to: 104 }
    ])
  })
})

describe('the members the deployed kit does not serve yet', () => {
  it("refuses the events feed's method filter by name", () => {
    const { client } = clientOver()
    expect(() => client.recovery.events.methodFilter()).toThrow(
      expect.objectContaining({ name: 'NotServedRefusal', member: 'events.methodFilter' })
    )
  })
})
