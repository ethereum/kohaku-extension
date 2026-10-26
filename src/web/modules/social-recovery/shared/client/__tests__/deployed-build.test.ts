/**
 * The one client build follows the chain's deployment record. With no
 * deployment variable, the client is built over the stand-in's fake node and
 * the extension's provider is never read. With one, the build reads through
 * the extension's provider: the deployed manager and action are checked
 * before any client exists, in the SDK's order and then the deployment's
 * own, and the SDK's client is built over the chain. The variable is read
 * through its one module, mocked here; the deployment is a fake node of its
 * own, every address in it made up.
 */
import { BUILDER_CHAIN_MISMATCH_MESSAGE } from '@kohaku-eth/social-recovery'
import type { Address, Hex } from '@kohaku-eth/social-recovery'
import { toFunctionSelector, zeroAddress, zeroHash } from 'viem'

import {
  addressOf,
  buildRecoveryClient,
  createDeployedWorld,
  createWorld,
  DEPLOYED_FACTS,
  isDigestVersionRefusal,
  isProviderReadFailure,
  thrownBy,
  World
} from '@web/modules/social-recovery/shared/client/__tests__/harness'
import { isDeploymentRefusal } from '@web/modules/social-recovery/shared/client'
import { sepoliaDeploymentVariable } from '@web/modules/social-recovery/shared/client/deployment-env'
import type {
  OptionalCallArgs,
  OptionalDataCall,
  WorldCase,
  WorldRefusalCase
} from '@web/modules/social-recovery/shared/client/__fixtures__/types'

jest.mock('@web/modules/social-recovery/shared/client/deployment-env', () => ({
  ...jest.requireActual('@web/modules/social-recovery/shared/client/deployment-env'),
  sepoliaDeploymentVariable: jest.fn()
}))

const variable = sepoliaDeploymentVariable as jest.MockedFunction<typeof sepoliaDeploymentVariable>

const ARMED: Hex = '0x0000000000000000000000000000000000000000000000000000000000000001'
const ELSEWHERE: Address = '0x00000000000000000000000000000000000e15e0'
const KEY_A = addressOf('key-a')
const KEY_B = addressOf('key-b')

const VIEW_NAMES = new Map<string, string>(
  ['eip712Domain()', 'MANAGER()', 'AMBIRE_IMPLEMENTATION()', 'KIT_SLOT()', 'BINDING()'].map(
    (signature) => [toFunctionSelector(signature), signature.replace('()', '')]
  )
)

/** The deployment checks' reads the build made through the extension's provider, by name, in order. */
const checksOf = (world: World): string[] =>
  world.ethers.call.mock.calls.flatMap(([tx]: OptionalCallArgs) => {
    const name = VIEW_NAMES.get((tx.data ?? '').slice(0, 10))
    return name ? [name] : []
  })

afterEach(() => {
  jest.restoreAllMocks()
})

describe('a chain whose deployment record names a deployed kit', () => {
  beforeEach(() => {
    variable.mockReturnValue(JSON.stringify(DEPLOYED_FACTS))
  })

  it("checks the chain, the manager's domain and the action's four constants through the extension's provider, then builds", async () => {
    const world = createDeployedWorld()
    const client = await buildRecoveryClient(world.config)
    expect(world.ethers.send).toHaveBeenCalledWith('eth_chainId', [])
    const checks = checksOf(world)
    expect(checks[0]).toBe('eip712Domain')
    expect(checks.filter((name) => name !== 'eip712Domain')).toEqual([
      'MANAGER',
      'AMBIRE_IMPLEMENTATION',
      'KIT_SLOT',
      'BINDING'
    ])
    expect(client.descriptor.manager).toBe(DEPLOYED_FACTS.manager)
    expect(client.descriptor.action).toBe(DEPLOYED_FACTS.action)
  })

  it('serves no identity method the deployment omits: its address is zero and nothing answers there', async () => {
    const world = createDeployedWorld()
    const client = await buildRecoveryClient(world.config)
    expect(client.descriptor.methodAadhaar).toBe(zeroAddress)
    expect(client.descriptor.methodZkpassport).toBe(zeroAddress)
    expect(client.descriptor.shippedMethods).toEqual([
      DEPLOYED_FACTS.methodEcdsa,
      DEPLOYED_FACTS.methodPasskey
    ])
    expect(client.methodFor('aadhaar')).toBeUndefined()
    expect(client.methodFor('zkpassport')).toBeUndefined()
    expect(client.methodFor('ecdsa')).toBeDefined()
    await expect(world.chain.code(zeroAddress, 'latest')).resolves.toBe('0x')
  })

  const REFUSALS: WorldRefusalCase[] = [
    [
      'a manager address with no code',
      ({ chain, descriptor }) => chain.setContractCode(descriptor.manager, false),
      'manager'
    ],
    [
      'a manager whose domain read reverts',
      ({ chain }) => chain.failRead('eip712Domain', { kind: 'revert', data: '0x' }),
      'manager'
    ],
    [
      'an action address with no code',
      ({ chain, descriptor }) => chain.setContractCode(descriptor.action, false),
      'action'
    ],
    [
      'an action whose constant read reverts',
      ({ chain }) => chain.failRead('MANAGER', { kind: 'revert', data: '0xdeadbeef' }),
      'action'
    ],
    [
      'an action bound to another manager',
      ({ chain }) => chain.setConstants({ manager: ELSEWHERE }),
      'action-manager'
    ],
    [
      'an action serving another implementation',
      ({ chain }) => chain.setConstants({ ambireImplementation: ELSEWHERE }),
      'served-implementation'
    ],
    [
      'an action holding another kit slot',
      ({ chain }) => chain.setConstants({ kitSlot: ELSEWHERE }),
      'kit-slot'
    ],
    [
      'an action holding another binding',
      ({ chain }) => chain.setConstants({ binding: `0x${'34'.repeat(32)}` }),
      'binding'
    ]
  ]

  REFUSALS.forEach(([name, seed, check]) =>
    it(`refuses ${name} with a deployment refusal`, async () => {
      const world = createDeployedWorld()
      seed(world)
      const caught = await thrownBy(buildRecoveryClient(world.config))
      expect(isDeploymentRefusal(caught)).toBe(true)
      expect(caught).toMatchObject({ name: 'DeploymentRefusal', check })
    })
  )

  const CONSTRUCTION: WorldCase[] = [
    [
      'a provider on another chain',
      ({ ethers }) => {
        Object.assign(ethers, { answeredChainId: 1 })
      }
    ],
    ['a domain on another chain', ({ chain }) => chain.setDomain({ chainId: 1n })],
    [
      'a domain naming another verifying contract',
      ({ chain }) => chain.setDomain({ verifyingContract: ELSEWHERE })
    ],
    ['a domain carrying other members', ({ chain }) => chain.setDomain({ fields: '0x1f' })],
    ['a domain of another name', ({ chain }) => chain.setDomain({ name: 'OtherManager' })]
  ]

  CONSTRUCTION.forEach(([name, seed]) =>
    it(`refuses ${name} before reading the action, and not as a deployment refusal`, async () => {
      const world = createDeployedWorld()
      seed(world)
      const caught = await thrownBy(buildRecoveryClient(world.config))
      expect(caught).toBeInstanceOf(Error)
      expect(isDeploymentRefusal(caught)).toBe(false)
      expect(checksOf(world).filter((read) => read !== 'eip712Domain')).toEqual([])
    })
  )

  it('refuses a domain of another digest version as update the wallet, before reading the action', async () => {
    const world = createDeployedWorld()
    world.chain.setDomain({ version: '2' })
    const caught = await thrownBy(buildRecoveryClient(world.config))
    expect(isDigestVersionRefusal(caught)).toBe(true)
    expect(caught).toMatchObject({
      state: 'update-the-wallet',
      published: { name: 'PolicyManager', version: '2' }
    })
    expect(checksOf(world).filter((read) => read !== 'eip712Domain')).toEqual([])
  })

  it("refuses another chain after the one domain read the client's own deployment check makes", async () => {
    const world = createDeployedWorld()
    world.ethers.answeredChainId = 1
    const caught = await thrownBy(buildRecoveryClient(world.config))
    expect(caught).toMatchObject({ message: BUILDER_CHAIN_MISMATCH_MESSAGE })
    expect(isDigestVersionRefusal(caught)).toBe(false)
    expect(isDeploymentRefusal(caught)).toBe(false)
    expect(checksOf(world)).toEqual(['eip712Domain'])
  })

  it('passes a read the provider could not make through as a read failure, never a refusal', async () => {
    const down = new Error('the node did not answer')
    const failing: WorldCase[] = [
      ['the domain', ({ ethers }) => ethers.call.mockRejectedValue(down)],
      [
        'the binding',
        ({ ethers }) => {
          const answer = ethers.call.getMockImplementation()
          ethers.call.mockImplementation(async (tx: OptionalDataCall) => {
            if (VIEW_NAMES.get((tx.data ?? '').slice(0, 10)) === 'BINDING') {
              throw down
            }
            return answer?.(tx)
          })
        }
      ],
      ['the chain id', ({ ethers }) => ethers.send.mockRejectedValue(down)]
    ]
    await failing.reduce(async (previous, [, fail]) => {
      await previous
      const world = createDeployedWorld()
      fail(world)
      const caught = await thrownBy(buildRecoveryClient(world.config))
      expect(isProviderReadFailure(caught)).toBe(true)
      expect(isDeploymentRefusal(caught)).toBe(false)
    }, Promise.resolve())
  })

  it("judges an account with no code by the creation's privileges the configuration carries", async () => {
    const world = createDeployedWorld()
    world.chain.setHasCode(false)
    const creation = {
      factory: DEPLOYED_FACTS.manager,
      bytecode: '0x00' as const,
      salt: zeroHash,
      block: 1
    }
    const client = await buildRecoveryClient({
      ...world.config,
      candidateKeys: [KEY_A, KEY_B],
      initialPrivileges: [
        [KEY_A, ARMED],
        [KEY_B, zeroHash]
      ],
      creation
    })
    await expect(client.walletReads.removedKey()).resolves.toEqual({ kind: 'named', key: KEY_A })
  })

  it('asks the action about the keys the configuration names for an account with code', async () => {
    const world = createDeployedWorld()
    world.chain.setAuthorities([KEY_B])
    const client = await buildRecoveryClient({ ...world.config, candidateKeys: [KEY_A, KEY_B] })
    await expect(client.walletReads.removedKey()).resolves.toEqual({ kind: 'named', key: KEY_B })
  })

  it('builds mainnet over the stand-in, which the variable does not name, reading nothing through the extension', async () => {
    const world = createWorld({ chain: 'mainnet' })
    await buildRecoveryClient(world.config)
    expect(world.ethers.send).not.toHaveBeenCalled()
    expect(world.ethers.call).not.toHaveBeenCalled()
    expect(world.ethers.getCode).not.toHaveBeenCalled()
  })
})

describe('a chain whose deployment record names the stand-in', () => {
  beforeEach(() => {
    variable.mockReturnValue(undefined)
  })

  it("builds over the stand-in's fake node and reads nothing through the extension's provider", async () => {
    const world = createWorld({ account: addressOf('account') })
    const client = await buildRecoveryClient(world.config)
    expect(client.descriptor).toEqual(world.descriptor)
    expect(world.ethers.send).not.toHaveBeenCalled()
    expect(world.ethers.call).not.toHaveBeenCalled()
    expect(world.ethers.getCode).not.toHaveBeenCalled()
  })
})

describe('the guard of a deployment refusal', () => {
  const named = (fields: Record<string, unknown>) =>
    Object.assign(new Error('refused'), { name: 'DeploymentRefusal', ...fields })

  it('reads an error with the name and a check it names as a refusal', () => {
    expect(isDeploymentRefusal(named({ check: 'binding' }))).toBe(true)
  })

  const NOT_REFUSALS = [
    { name: 'an error with the name and no check', value: named({}) },
    { name: 'an error with the name and a check it does not name', value: named({ check: 'gas' }) },
    {
      name: 'a plain object shaped as a refusal',
      value: { name: 'DeploymentRefusal', check: 'binding' }
    }
  ]
  NOT_REFUSALS.forEach(({ name, value }) =>
    it(`never reads ${name} as a refusal`, () => {
      expect(isDeploymentRefusal(value)).toBe(false)
    })
  )
})
