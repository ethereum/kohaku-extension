import type { Network } from '@ambire-common/interfaces/network'
import { providerKeyOf } from '@web/modules/social-recovery/shared/client/extension-provider'

import { SEPOLIA } from './harness'

const sepolia = (overrides: Partial<Network> = {}): Network =>
  ({
    chainId: BigInt(SEPOLIA),
    name: 'Sepolia',
    rpcUrls: ['https://rpc.example/sepolia'],
    selectedRpcUrl: 'https://rpc.example/sepolia',
    rpcProvider: 'colibri',
    proverRpcUrl: 'https://prover.example/one',
    consensusRpcUrl: 'https://consensus.example/one',
    heliosCheckpoint: `0x${'01'.repeat(32)}`,
    ...overrides
  } as Network)

describe('providerKeyOf, the key the recovery provider is rebuilt on', () => {
  const INPUTS: [keyof Network, unknown][] = [
    ['chainId', 1n],
    ['rpcUrls', ['https://rpc.example/sepolia', 'https://rpc.example/other']],
    ['selectedRpcUrl', 'https://rpc.example/other'],
    ['rpcProvider', 'helios'],
    ['batchMaxCount', 5],
    ['consensusRpcUrl', 'https://consensus.example/two'],
    ['isOptimistic', true],
    ['isLinea', true],
    ['proverRpcUrl', 'https://prover.example/two']
  ]
  INPUTS.forEach(([input, value]) =>
    it(`changes when only ${input} changes`, () => {
      expect(providerKeyOf(sepolia({ [input]: value }))).not.toBe(providerKeyOf(sepolia()))
    })
  )

  it('stays the same when only the light client checkpoint changes', () => {
    expect(providerKeyOf(sepolia({ heliosCheckpoint: `0x${'02'.repeat(32)}` }))).toBe(
      providerKeyOf(sepolia())
    )
  })

  const FLAGS: (keyof Network)[] = ['isOptimistic', 'isLinea']
  FLAGS.forEach((flag) =>
    it(`stays the same whether ${flag} is left out or false`, () => {
      expect(providerKeyOf(sepolia({ [flag]: false }))).toBe(
        providerKeyOf(sepolia({ [flag]: undefined }))
      )
    })
  )

  it('stays the same for two equal records', () => {
    expect(providerKeyOf(sepolia())).toBe(providerKeyOf(sepolia()))
  })
})
