/**
 * The client of a deployed kit once its checks passed: the methods it serves
 * by slug, the action bound to the account with its real disarming call, the
 * wallet's reads over the chain, and the members it does not serve yet, each
 * refusing by name.
 */
import { decodeFunctionData, getAddress, zeroHash } from 'viem'

import { PROXY_AMBIRE_ACCOUNT } from '@ambire-common/consts/deploy'
import { defaultClientConfiguration } from '@web/modules/social-recovery/sdk-doubles'
import type { Address } from '@web/modules/social-recovery/sdk-interfaces'
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
  DESCRIPTOR,
  fakeNode,
  HEAD,
  KEY_A,
  MANAGER,
  METHOD_AADHAAR,
  METHOD_ECDSA,
  METHOD_PASSKEY,
  METHOD_ZKPASSPORT,
  thrownBy
} from '@web/modules/social-recovery/shared/client/kit/setup-client/__tests__/harness'
import type { DeploymentFacts } from '@web/modules/social-recovery/shared/client/types'

const ARMED = '0x0000000000000000000000000000000000000000000000000000000000000001'

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

const clientOver = (facts: DeploymentFacts = FACTS) => {
  const node = fakeNode()
  scriptDeployment(node)
  const descriptor = { ...DESCRIPTOR, action: DEPLOYED_ACTION, auditedActions: [DEPLOYED_ACTION] }
  const client = buildKitClient({
    chain: 'sepolia',
    account: ACCOUNT,
    descriptor,
    facts,
    addressBook: BOOK,
    config: defaultClientConfiguration({ accountImplementation: PROXY_AMBIRE_ACCOUNT }),
    provider: node.provider,
    codeRead: node.codeRead,
    manager: createManagerReads(node.provider, MANAGER),
    action: createActionReads(
      { provider: node.provider, codeRead: node.codeRead },
      DEPLOYED_ACTION
    ),
    privilegeAccount: {
      addr: ACCOUNT,
      associatedKeys: [KEY_A],
      initialPrivileges: [[KEY_A, ARMED]],
      creation: { factoryAddr: MANAGER, bytecode: '0x00', salt: zeroHash }
    }
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
})

describe('the members the deployed kit does not serve yet', () => {
  const RECOVERY_REJECTS = [
    'initRecoveryGathering',
    'initCancelGathering',
    'prepareStartAttempt',
    'prepareCancelByProofs',
    'prepareCancelByOwner',
    'prepareCancelByVeto',
    'prepareExecuteHandover',
    'recoveryState'
  ] as const
  const RECOVERY_THROWS = ['getApproverRequests', 'addApproverReply', 'assess', 'complete'] as const
  const EVENTS_THROW = ['accountFilter', 'methodFilter', 'privilegeFilter', 'decodeLog'] as const

  RECOVERY_REJECTS.forEach((member) =>
    it(`rejects recovery.${member} by name`, async () => {
      const { node, client } = clientOver()
      const run = client.recovery[member] as () => Promise<unknown>
      expect(await thrownBy(run())).toMatchObject({
        name: 'NotServedRefusal',
        member: `recovery.${member}`
      })
      expect(node.calls).toEqual([])
    })
  )

  RECOVERY_THROWS.forEach((member) =>
    it(`throws recovery.${member} by name`, () => {
      const { client } = clientOver()
      const run = client.recovery[member] as () => unknown
      expect(run).toThrow(
        expect.objectContaining({ name: 'NotServedRefusal', member: `recovery.${member}` })
      )
    })
  )

  EVENTS_THROW.forEach((member) =>
    it(`throws the events feed member ${member} by name, on both sides`, () => {
      const { client } = clientOver()
      ;(['setup', 'recovery'] as const).forEach((part) => {
        const run = client[part].events[member] as () => unknown
        expect(run).toThrow(expect.objectContaining({ member: `${part}.events.${member}` }))
      })
    })
  )

  it('rejects the events fetch, the clear and the verify of a pasted reply by name', async () => {
    const { client } = clientOver()
    const fetch = client.recovery.events.fetch as () => Promise<unknown>
    expect(await thrownBy(fetch())).toMatchObject({ member: 'recovery.events.fetch' })
    expect(await thrownBy(client.setup.prepareClearSetup())).toMatchObject({
      member: 'setup.prepareClearSetup'
    })
    const verify = client.walletReads.verifyReply as () => Promise<unknown>
    expect(await thrownBy(verify())).toMatchObject({
      name: 'NotServedRefusal',
      member: 'walletReads.verifyReply'
    })
  })
})
