/**
 * The one client build follows the chain's deployment record. With no
 * deployment variable, the stand-in builds as it always did and no deployed
 * contract is read. With one, the deployed manager and action are checked
 * before any client exists, in the SDK's order and then the deployment's
 * own, and the deployed kit's client is built over the chain. The variable is
 * read through its one module, mocked here; every address in it is made up
 * but the deployed action's, whose kit slot and binding the checks compare.
 */
import { zeroHash } from 'viem'

import {
  addressOf,
  RecoveryKitBuilderDouble,
  SetupClientDouble
} from '@web/modules/social-recovery/sdk-doubles'
import {
  addressBookOf,
  buildRecoveryClient,
  type RecoveryClientConfiguration
} from '@web/modules/social-recovery/shared/client'
import { createWorld } from '@web/modules/social-recovery/shared/client/__tests__/harness'
import { sepoliaDeploymentVariable } from '@web/modules/social-recovery/shared/client/deployment-env'
import {
  CONSTANT_CALLS,
  DEPLOYED_ACTION,
  DOMAIN_CALL,
  FACTS,
  scriptDeployment
} from '@web/modules/social-recovery/shared/client/kit/builder/__tests__/harness'
import {
  ACCOUNT,
  draftAt,
  fakeNode,
  KEY_A,
  KEY_B,
  MANAGER,
  METHOD_ECDSA,
  NO_STATE,
  reverting,
  scriptAction,
  scriptMethod,
  stateAnswer,
  stateOfCall,
  thrownBy
} from '@web/modules/social-recovery/shared/client/kit/setup-client/__tests__/harness'
import type { ScriptedDeployment } from '@web/modules/social-recovery/shared/client/kit/builder/__fixtures__/types'
import { providerReadFailure } from '@web/modules/social-recovery/shared/client/provider-adapter'

jest.mock('@web/modules/social-recovery/shared/client/deployment-env', () => ({
  ...jest.requireActual('@web/modules/social-recovery/shared/client/deployment-env'),
  sepoliaDeploymentVariable: jest.fn()
}))

const variable = sepoliaDeploymentVariable as jest.MockedFunction<typeof sepoliaDeploymentVariable>

const ARMED = '0x0000000000000000000000000000000000000000000000000000000000000001'
const ELSEWHERE = '0x00000000000000000000000000000000000e15e0'

const deployedNode = (script: ScriptedDeployment = {}) => {
  const node = fakeNode()
  scriptDeployment(node, script)
  return node
}

const configOver = (
  node: ReturnType<typeof fakeNode>,
  overrides: Partial<RecoveryClientConfiguration> = {}
): RecoveryClientConfiguration => ({
  chain: 'sepolia',
  account: ACCOUNT,
  addressBook: addressBookOf('sepolia'),
  provider: node.provider,
  codeRead: node.codeRead,
  ...overrides
})

/** The calls the build made, as the reads they were. */
const readsOf = (node: ReturnType<typeof fakeNode>) => {
  const names = new Map<string, string>([
    [DOMAIN_CALL, 'eip712Domain'],
    [CONSTANT_CALLS.manager, 'MANAGER'],
    [CONSTANT_CALLS.implementation, 'AMBIRE_IMPLEMENTATION'],
    [CONSTANT_CALLS.kitSlot, 'KIT_SLOT'],
    [CONSTANT_CALLS.binding, 'BINDING']
  ])
  return node.calls.map((call) => names.get(call.data) ?? call.data)
}

afterEach(() => {
  jest.restoreAllMocks()
})

describe('a chain whose deployment record names a deployed kit', () => {
  beforeEach(() => {
    variable.mockReturnValue(JSON.stringify(FACTS))
  })

  it("checks the chain, the manager's domain and the action's four constants, then builds the kit's client", async () => {
    const builder = jest.spyOn(RecoveryKitBuilderDouble.prototype, 'buildSetupClient')
    const node = deployedNode()
    const client = await buildRecoveryClient(configOver(node))
    expect(node.provider.chainId).toHaveBeenCalledTimes(1)
    expect(readsOf(node)).toEqual([
      'eip712Domain',
      'MANAGER',
      'AMBIRE_IMPLEMENTATION',
      'KIT_SLOT',
      'BINDING'
    ])
    expect(client.descriptor.manager).toBe(FACTS.manager)
    expect(client.descriptor.action).toBe(FACTS.action)
    expect(client.setup).not.toBeInstanceOf(SetupClientDouble)
    expect(await thrownBy(client.setup.prepareClearSetup())).toMatchObject({
      name: 'NotServedRefusal'
    })
    expect(builder).not.toHaveBeenCalled()
  })

  const REFUSALS: [string, ScriptedDeployment, string][] = [
    ['a manager address with no code', { managerCode: false }, 'manager'],
    ['a manager whose domain read reverts', { domain: reverting() }, 'manager'],
    ['an action address with no code', { actionCode: false }, 'action'],
    ['an action whose constant read reverts', { manager: reverting('0xdeadbeef') }, 'action'],
    ['an action bound to another manager', { manager: ELSEWHERE }, 'action-manager'],
    [
      'an action serving another implementation',
      { implementation: ELSEWHERE },
      'served-implementation'
    ],
    ['an action holding another kit slot', { kitSlot: ELSEWHERE }, 'kit-slot'],
    ['an action holding another binding', { binding: `0x${'34'.repeat(32)}` }, 'binding']
  ]

  REFUSALS.forEach(([name, script, check]) =>
    it(`refuses ${name} with a deployment refusal`, async () => {
      const node = deployedNode(script)
      expect(await thrownBy(buildRecoveryClient(configOver(node)))).toMatchObject({
        name: 'DeploymentRefusal',
        check
      })
    })
  )

  const CONSTRUCTION: [string, ScriptedDeployment, object][] = [
    [
      'a provider on another chain',
      { chainId: 1 },
      { name: 'ConstructionRefusal', check: 'chain-id' }
    ],
    [
      'a domain on another chain',
      { domain: { chainId: 1n } },
      { name: 'ConstructionRefusal', check: 'domain' }
    ],
    [
      'a domain naming another verifying contract',
      { domain: { verifyingContract: ELSEWHERE } },
      { name: 'ConstructionRefusal', check: 'domain' }
    ],
    [
      'a domain carrying other members',
      { domain: { fields: '0x1f' } },
      { name: 'ConstructionRefusal', check: 'domain-fields' }
    ],
    [
      'a domain of another digest version',
      { domain: { version: '2' } },
      {
        name: 'DigestVersionRefusal',
        state: 'update-the-wallet',
        published: { name: 'PolicyManager', version: '2' }
      }
    ],
    [
      'a domain of another name',
      { domain: { name: 'OtherManager' } },
      { name: 'DigestVersionRefusal', published: { name: 'OtherManager', version: '1' } }
    ]
  ]

  CONSTRUCTION.forEach(([name, script, refusal]) =>
    it(`refuses ${name} before reading the action`, async () => {
      const node = deployedNode(script)
      expect(await thrownBy(buildRecoveryClient(configOver(node)))).toMatchObject(refusal)
      expect(readsOf(node).filter((read) => read !== 'eip712Domain')).toEqual([])
    })
  )

  it('refuses another chain before reading the domain', async () => {
    const node = deployedNode({ chainId: 1 })
    await thrownBy(buildRecoveryClient(configOver(node)))
    expect(node.calls).toEqual([])
  })

  it('passes a read the provider could not make through as it failed', async () => {
    const failure = providerReadFailure('call', new Error('down'))
    expect(await thrownBy(buildRecoveryClient(configOver(deployedNode({ domain: failure }))))).toBe(
      failure
    )
    expect(
      await thrownBy(buildRecoveryClient(configOver(deployedNode({ binding: failure }))))
    ).toBe(failure)
    const chainFailure = providerReadFailure('chainId', new Error('down'))
    const node = deployedNode()
    node.provider.chainId.mockRejectedValue(chainFailure)
    expect(await thrownBy(buildRecoveryClient(configOver(node)))).toBe(chainFailure)
  })

  it("judges an account with no code by the creation's privileges the configuration carries", async () => {
    const node = deployedNode()
    node.answer(MANAGER, stateOfCall(DEPLOYED_ACTION), stateAnswer(NO_STATE))
    scriptMethod(node, METHOD_ECDSA)
    scriptAction(node, { at: DEPLOYED_ACTION })
    const creation = { factory: MANAGER, bytecode: '0x00' as const, salt: zeroHash, block: 1 }
    const client = await buildRecoveryClient(
      configOver(node, {
        candidateKeys: [KEY_A, KEY_B],
        initialPrivileges: [
          [KEY_A, ARMED],
          [KEY_B, zeroHash]
        ],
        creation
      })
    )
    const described = await client.setup.describeSetup(draftAt('private'))
    expect(described.candidateKeys).toEqual([
      { address: KEY_A, isAuthority: true },
      { address: KEY_B, isAuthority: false }
    ])
    expect(described.removedKey).toBe(KEY_A)
    const bare = await buildRecoveryClient(configOver(node, { candidateKeys: [KEY_A], creation }))
    expect((await bare.setup.describeSetup(draftAt('private'))).candidateKeys).toEqual([
      { address: KEY_A, isAuthority: false }
    ])
  })

  it('asks the action about the keys the configuration names for an account with code', async () => {
    const node = deployedNode()
    node.setCode(ACCOUNT, '0x6080604052')
    scriptAction(node, { at: DEPLOYED_ACTION, supportsAccount: true, authorities: [KEY_B] })
    const creation = { factory: MANAGER, bytecode: '0x00' as const, salt: zeroHash, block: 1 }
    const named = await buildRecoveryClient(
      configOver(node, { candidateKeys: [KEY_A, KEY_B], creation })
    )
    await expect(named.walletReads.removedKey()).resolves.toEqual({ kind: 'named', key: KEY_B })
  })

  it('builds mainnet over the stand-in, which the variable does not name', async () => {
    const world = createWorld({ chain: 'mainnet' })
    const codeRead = { code: jest.fn() }
    const client = await buildRecoveryClient({ ...world.config, codeRead })
    expect(client.setup).toBeInstanceOf(SetupClientDouble)
    expect(codeRead.code).not.toHaveBeenCalled()
  })
})

describe('a chain whose deployment record names the stand-in', () => {
  beforeEach(() => {
    variable.mockReturnValue(undefined)
  })

  it('builds the stand-in through its builder and reads no deployed contract', async () => {
    const builder = jest.spyOn(RecoveryKitBuilderDouble.prototype, 'buildSetupClient')
    const world = createWorld({ account: addressOf('account') })
    const codeRead = { code: jest.fn() }
    const client = await buildRecoveryClient({ ...world.config, codeRead })
    expect(client.setup).toBeInstanceOf(SetupClientDouble)
    expect(builder).toHaveBeenCalledTimes(1)
    expect(codeRead.code).not.toHaveBeenCalled()
    expect(world.ethers.getCode).not.toHaveBeenCalled()
    const asked = world.ethers.call.mock.calls.map(([tx]: [{ data?: string }]) => tx.data)
    expect(
      asked.filter((data) => Object.values(CONSTANT_CALLS).includes(data as `0x${string}`))
    ).toEqual([])
  })
})
