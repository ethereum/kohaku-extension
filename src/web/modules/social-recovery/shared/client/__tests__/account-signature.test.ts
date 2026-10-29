/**
 * A contract account's EIP-1271 answer, read over a provider's static call:
 * the magic value accepts the signature, any other answer or a revert
 * refuses it, and a read the node did not answer throws.
 */
import { decodeFunctionData, encodeFunctionResult, parseAbi } from 'viem'

import type { Hex } from '@kohaku-eth/social-recovery'
import {
  addressOf,
  callException,
  isValidAccountSignature,
  thrownBy
} from '@web/modules/social-recovery/shared/client/__tests__/harness'

const EIP1271_ABI = parseAbi([
  'function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)'
])
const ACCOUNT = addressOf('smart-account')
const DIGEST = `0x${'ab'.repeat(32)}` as Hex
const SIGNATURE = `0x${'cd'.repeat(65)}01` as Hex

const answerOf = (value: Hex): string =>
  encodeFunctionResult({ abi: EIP1271_ABI, functionName: 'isValidSignature', result: value })

const providerAnswering = (answer: () => Promise<string>) => ({
  call: jest.fn<Promise<string>, [{ to: string; data: Hex }]>(answer)
})

describe('the account check of a signature', () => {
  it('asks the account itself about the digest and the signature, and accepts the magic value', async () => {
    const provider = providerAnswering(async () => answerOf('0x1626ba7e'))
    await expect(isValidAccountSignature(provider, ACCOUNT, DIGEST, SIGNATURE)).resolves.toBe(true)
    expect(provider.call).toHaveBeenCalledTimes(1)
    const [{ to, data }] = provider.call.mock.calls[0]
    expect(to).toBe(ACCOUNT)
    expect(decodeFunctionData({ abi: EIP1271_ABI, data })).toEqual({
      functionName: 'isValidSignature',
      args: [DIGEST, SIGNATURE]
    })
  })

  it('refuses any other value', async () => {
    const values: Hex[] = ['0xffffffff', '0x00000000', '0x1626ba7f']
    const answers = await Promise.all(
      values.map((value) =>
        isValidAccountSignature(
          providerAnswering(async () => answerOf(value)),
          ACCOUNT,
          DIGEST,
          SIGNATURE
        )
      )
    )
    expect(answers).toEqual([false, false, false])
  })

  it('refuses an empty answer, as an address with no code gives', async () => {
    await expect(
      isValidAccountSignature(
        providerAnswering(async () => '0x'),
        ACCOUNT,
        DIGEST,
        SIGNATURE
      )
    ).resolves.toBe(false)
  })

  it('refuses where the call reverts', async () => {
    const provider = providerAnswering(async () => {
      throw callException('0x')
    })
    await expect(isValidAccountSignature(provider, ACCOUNT, DIGEST, SIGNATURE)).resolves.toBe(false)
  })

  it('throws where the node does not answer, never reading that as a refusal', async () => {
    const failure = new Error('the node did not answer')
    const provider = providerAnswering(async () => {
      throw failure
    })
    expect(await thrownBy(isValidAccountSignature(provider, ACCOUNT, DIGEST, SIGNATURE))).toBe(
      failure
    )
  })
})
