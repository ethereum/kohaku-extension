/**
 * The saved screen's explorer link: a deployment that names its own explorer,
 * such as one on a fork, links there; otherwise the chain's public explorer.
 * The deployment variable is read through its one module, mocked here; every
 * address in it is made up.
 */
import { mainnet, sepolia } from 'viem/chains'

import type { Hex } from '@web/modules/social-recovery/sdk-interfaces'
import { sepoliaDeploymentVariable } from '@web/modules/social-recovery/shared/client/deployment-env'
import { explorerTransactionUrlOf } from '@web/modules/social-recovery/setup/arm'

jest.mock('@web/modules/social-recovery/shared/client/deployment-env', () => ({
  ...jest.requireActual('@web/modules/social-recovery/shared/client/deployment-env'),
  sepoliaDeploymentVariable: jest.fn()
}))

const variable = sepoliaDeploymentVariable as jest.MockedFunction<typeof sepoliaDeploymentVariable>

const TX_HASH: Hex = '0x9c1b2e6a0d4f3e8b7a6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a'
const FORK_EXPLORER = 'https://dashboard.example.org/explorer/vnet/fork-1'

const deploymentVariable = (explorerUrl?: string): string =>
  JSON.stringify({
    manager: '0x1111111111111111111111111111111111111111',
    methodEcdsa: '0x2222222222222222222222222222222222222222',
    methodPasskey: '0x3333333333333333333333333333333333333333',
    action: '0x4444444444444444444444444444444444444444',
    deployedAt: 1,
    digestVersion: '1',
    managerVersion: '1',
    auditedActions: [],
    ...(explorerUrl === undefined ? {} : { explorerUrl })
  })

afterEach(() => variable.mockReset())

describe('the explorer link of a saved transaction', () => {
  it("links to the explorer the chain's deployment names", () => {
    variable.mockReturnValue(deploymentVariable(FORK_EXPLORER))
    expect(explorerTransactionUrlOf('sepolia', TX_HASH)).toBe(`${FORK_EXPLORER}/tx/${TX_HASH}`)
  })

  it('drops the trailing slash of the named explorer', () => {
    variable.mockReturnValue(deploymentVariable(`${FORK_EXPLORER}/`))
    expect(explorerTransactionUrlOf('sepolia', TX_HASH)).toBe(`${FORK_EXPLORER}/tx/${TX_HASH}`)
  })

  it("links to the chain's explorer where the deployment names none", () => {
    variable.mockReturnValue(deploymentVariable())
    expect(explorerTransactionUrlOf('sepolia', TX_HASH)).toBe(
      `${sepolia.blockExplorers.default.url}/tx/${TX_HASH}`
    )
  })

  it("links to the chain's explorer where the chain has no deployment", () => {
    variable.mockReturnValue(undefined)
    expect(explorerTransactionUrlOf('sepolia', TX_HASH)).toBe(
      `${sepolia.blockExplorers.default.url}/tx/${TX_HASH}`
    )
    expect(explorerTransactionUrlOf('mainnet', TX_HASH)).toBe(
      `${mainnet.blockExplorers.default.url}/tx/${TX_HASH}`
    )
  })
})
