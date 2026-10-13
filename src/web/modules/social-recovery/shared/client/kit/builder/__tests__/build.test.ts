/**
 * The client of a deployed kit once its checks passed: the methods it serves
 * by slug, the action bound to the account with its real disarming call, the
 * wallet's reads over the chain with the verify of a pasted reply, the
 * recovery gathering and prepares over the manager, and the members it does
 * not serve yet, each refusing by name.
 */
import {
  decodeFunctionData,
  encodeEventTopics,
  encodeFunctionData,
  encodeFunctionResult,
  getAddress,
  type Hex,
  parseAbi,
  zeroAddress,
  zeroHash
} from 'viem'

import { PROXY_AMBIRE_ACCOUNT } from '@ambire-common/consts/deploy'
import { defaultClientConfiguration } from '@web/modules/social-recovery/sdk-doubles'
import type { Address, ClientConfiguration } from '@web/modules/social-recovery/sdk-interfaces'
import { buildKitClient } from '@web/modules/social-recovery/shared/client/kit/builder'
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
  CONTRACT_CODE,
  DESCRIPTOR,
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
    blockTags
  }: { privilegeAccount?: PrivilegeAccount; blockTags?: ClientConfiguration['blockTags'] } = {}
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
      ...(blockTags && { blockTags })
    }),
    provider: node.provider,
    codeRead: node.codeRead,
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
    node.setCode(ACCOUNT, CONTRACT_CODE)
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
    expect(node.provider.logs).toHaveBeenCalledTimes(Math.ceil((HEAD + 1) / 10_000))
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

describe('the members the deployed kit does not serve yet', () => {
  const EVENTS_THROW = ['accountFilter', 'methodFilter', 'privilegeFilter', 'decodeLog'] as const

  EVENTS_THROW.forEach((member) =>
    it(`throws the events feed member ${member} by name, on both sides`, () => {
      const { client } = clientOver()
      ;(['setup', 'recovery'] as const).forEach((part) => {
        const run = client[part].events[member] as () => unknown
        expect(run).toThrow(expect.objectContaining({ member: `${part}.events.${member}` }))
      })
    })
  )

  it('rejects the events fetch and the clear by name', async () => {
    const { client } = clientOver()
    const fetch = client.recovery.events.fetch as () => Promise<unknown>
    expect(await thrownBy(fetch())).toMatchObject({ member: 'recovery.events.fetch' })
    expect(await thrownBy(client.setup.prepareClearSetup())).toMatchObject({
      member: 'setup.prepareClearSetup'
    })
  })
})
