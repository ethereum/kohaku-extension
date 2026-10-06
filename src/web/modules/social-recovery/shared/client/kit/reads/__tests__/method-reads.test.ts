/**
 * A method module's views decode its ABI-encoded answers, and `paused` reads
 * the raw word as the manager does: only a 32-byte word equal to 1 is true,
 * a revert or any other answer is false, and a failed read rejects.
 */
import {
  encodeErrorResult,
  encodeFunctionData,
  encodeFunctionResult,
  type Hex,
  pad,
  parseAbi,
  zeroAddress
} from 'viem'

import type { Address, BlockTag, IProvider } from '@web/modules/social-recovery/sdk-interfaces'
import {
  isProviderReadFailure,
  isRevertedCall,
  providerReadFailure,
  revertedCall
} from '@web/modules/social-recovery/shared/client/provider-adapter'
import { createMethodReads } from '@web/modules/social-recovery/shared/client/kit/reads'

const METHOD: Address = '0x3333333333333333333333333333333333333333'
const ADMIN: Address = '0x4444444444444444444444444444444444444444'
const PAUSE_HOLDER: Address = '0x5555555555555555555555555555555555555555'
const TRUSTED_KEY: Hex = `0x${'ab'.repeat(32)}`
const CONFIG: Hex = `0x${'00'.repeat(12)}${'11'.repeat(20)}`
const DIGEST: Hex = `0x${'d1'.repeat(32)}`
const PROOF: Hex = `0x${'ee'.repeat(65)}`

const METHOD_VIEWS = parseAbi([
  'function name() view returns (string)',
  'function version() view returns (string)',
  'function supportsInterface(bytes4 id) view returns (bool)',
  'function trustedParties() view returns (address, address, bytes32[], address, address)',
  'function verify(bytes config, bytes32 digest, bytes proof) view returns (bytes4)',
  'function paused() view returns (bool)',
  'error Stopped(address by)'
])

const pausedCall = encodeFunctionData({ abi: METHOD_VIEWS, functionName: 'paused' })

const providerAnswering = (answers: [Hex, Hex | Error][]) => {
  const routes = new Map(answers)
  const call = jest.fn(
    async (to: Address, data: Hex, from: Address | undefined, block: BlockTag): Promise<Hex> => {
      const answer = routes.get(data)
      if (answer === undefined) {
        throw new Error(`no answer scripted for ${data} to ${to} from ${from} at ${block}`)
      }
      if (answer instanceof Error) {
        throw answer
      }
      return answer
    }
  )
  const provider: IProvider = { chainId: jest.fn(), call, logs: jest.fn(), block: jest.fn() }
  return { reads: createMethodReads(provider), call }
}

describe('a method module reads its views', () => {
  const nameCall = encodeFunctionData({ abi: METHOD_VIEWS, functionName: 'name' })
  const versionCall = encodeFunctionData({ abi: METHOD_VIEWS, functionName: 'version' })
  const probeCall = encodeFunctionData({
    abi: METHOD_VIEWS,
    functionName: 'supportsInterface',
    args: ['0xf057a368']
  })
  const trustedCall = encodeFunctionData({ abi: METHOD_VIEWS, functionName: 'trustedParties' })
  const verifyCall = encodeFunctionData({
    abi: METHOD_VIEWS,
    functionName: 'verify',
    args: [CONFIG, DIGEST, PROOF]
  })

  it('reads the name, the version and the method interface probe at the module', async () => {
    const { reads, call } = providerAnswering([
      [
        nameCall,
        encodeFunctionResult({ abi: METHOD_VIEWS, functionName: 'name', result: 'method-ecdsa' })
      ],
      [
        versionCall,
        encodeFunctionResult({ abi: METHOD_VIEWS, functionName: 'version', result: '1.0.0' })
      ],
      [
        probeCall,
        encodeFunctionResult({ abi: METHOD_VIEWS, functionName: 'supportsInterface', result: true })
      ]
    ])
    await expect(reads.moduleInfo(METHOD)).resolves.toEqual({
      name: 'method-ecdsa',
      version: '1.0.0',
      supportsInterface: true
    })
    expect(call.mock.calls.every(([to, , , block]) => to === METHOD && block === 'latest')).toBe(
      true
    )
  })

  it('decodes the trusted parties', async () => {
    const { reads } = providerAnswering([
      [
        trustedCall,
        encodeFunctionResult({
          abi: METHOD_VIEWS,
          functionName: 'trustedParties',
          result: [ADMIN, zeroAddress, [TRUSTED_KEY], PAUSE_HOLDER, zeroAddress]
        })
      ]
    ])
    await expect(reads.trustedParties(METHOD)).resolves.toEqual({
      admin: ADMIN,
      pendingAdmin: zeroAddress,
      trustedKeys: [TRUSTED_KEY],
      pauseHolder: PAUSE_HOLDER,
      pendingPauseHolder: zeroAddress
    })
  })

  it('answers the magic value verify returns', async () => {
    const { reads } = providerAnswering([
      [
        verifyCall,
        encodeFunctionResult({ abi: METHOD_VIEWS, functionName: 'verify', result: '0x024ad318' })
      ]
    ])
    await expect(reads.verify(METHOD, CONFIG, DIGEST, PROOF)).resolves.toBe('0x024ad318')
  })

  it('keeps the data of a revert', async () => {
    const data = encodeErrorResult({ abi: METHOD_VIEWS, errorName: 'Stopped', args: [ADMIN] })
    const { reads } = providerAnswering([[verifyCall, revertedCall('call', data)]])
    const thrown = await reads
      .verify(METHOD, CONFIG, DIGEST, PROOF)
      .catch((error: unknown) => error)
    expect(isRevertedCall(thrown)).toBe(true)
    expect(thrown).toMatchObject({ data })
  })

  it('refuses an empty answer as a failed call read', async () => {
    const { reads } = providerAnswering([[trustedCall, '0x']])
    const thrown = await reads.trustedParties(METHOD).catch((error: unknown) => error)
    expect(isProviderReadFailure(thrown)).toBe(true)
    expect(thrown).toMatchObject({ read: 'call' })
  })

  it('passes a failed read through as it is', async () => {
    const failure = providerReadFailure('call', new Error('timeout'))
    const { reads } = providerAnswering([[nameCall, failure]])
    await expect(reads.name(METHOD)).rejects.toBe(failure)
  })
})

describe('a method module reads paused as the manager does', () => {
  it('answers true for a 32-byte word equal to 1', async () => {
    const { reads, call } = providerAnswering([[pausedCall, pad('0x01')]])
    await expect(reads.paused(METHOD)).resolves.toBe(true)
    expect(call).toHaveBeenCalledWith(METHOD, pausedCall, undefined, 'latest')
  })

  const notOne: [string, Hex][] = [
    ['a word equal to 0', pad('0x00')],
    ['a word equal to 2', pad('0x02')],
    ['a 31-byte answer ending in 1', pad('0x01', { size: 31 })],
    ['a 64-byte answer starting with the word 1', `${pad('0x01')}${'00'.repeat(32)}`],
    ['an empty answer', '0x']
  ]
  notOne.forEach(([label, answer]) =>
    it(`answers false for ${label}`, async () => {
      const { reads } = providerAnswering([[pausedCall, answer]])
      await expect(reads.paused(METHOD)).resolves.toBe(false)
    })
  )

  it('answers false for a revert, with data or without', async () => {
    const withData = providerAnswering([
      [
        pausedCall,
        revertedCall(
          'call',
          encodeErrorResult({ abi: METHOD_VIEWS, errorName: 'Stopped', args: [ADMIN] })
        )
      ]
    ])
    const withoutData = providerAnswering([[pausedCall, revertedCall('call', '0x')]])
    await expect(withData.reads.paused(METHOD)).resolves.toBe(false)
    await expect(withoutData.reads.paused(METHOD)).resolves.toBe(false)
  })

  it('rejects where the read fails', async () => {
    const failure = providerReadFailure('call', new Error('timeout'))
    const { reads } = providerAnswering([[pausedCall, failure]])
    await expect(reads.paused(METHOD)).rejects.toBe(failure)
  })
})
