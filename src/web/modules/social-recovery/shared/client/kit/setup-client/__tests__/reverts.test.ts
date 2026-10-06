/**
 * A contract's revert met by a setup member, named as the kit's error: the
 * manager's and the action's errors by name, any other data as unknown with
 * its selector where it has one.
 */
import { encodeErrorResult, parseAbi } from 'viem'

import {
  kitErrorOf,
  withNamedRevert
} from '@web/modules/social-recovery/shared/client/kit/setup-client'
import { providerReadFailure } from '@web/modules/social-recovery/shared/client/provider-adapter'

import {
  MANAGER_ABI,
  reverting,
  thrownBy
} from '@web/modules/social-recovery/shared/client/kit/setup-client/__tests__/harness'

const OTHER_ERRORS = parseAbi(['error SomethingElse(uint256 value)'])

const wrongNonce = encodeErrorResult({
  abi: MANAGER_ABI,
  errorName: 'PolicyManager_WrongSetupNonce',
  args: [2n, 1n]
})

describe('kitErrorOf', () => {
  it("names the manager's error without its prefix, with its arguments", () => {
    expect(kitErrorOf(wrongNonce)).toEqual({
      kind: 'known',
      source: 'manager',
      name: 'WrongSetupNonce',
      selector: wrongNonce.slice(0, 10),
      args: { supplied: 2n, expected: 1n }
    })
  })

  it('answers unknown with the selector and the data for an error it does not know', () => {
    const data = encodeErrorResult({ abi: OTHER_ERRORS, errorName: 'SomethingElse', args: [7n] })
    expect(kitErrorOf(data)).toEqual({ kind: 'unknown', selector: data.slice(0, 10), data })
  })

  it('answers unknown with the data alone for data shorter than a selector', () => {
    expect(kitErrorOf('0x')).toEqual({ kind: 'unknown', data: '0x' })
    expect(kitErrorOf('0x123456')).toEqual({ kind: 'unknown', data: '0x123456' })
    expect(kitErrorOf('0x12345678')).toEqual({
      kind: 'unknown',
      selector: '0x12345678',
      data: '0x12345678'
    })
  })
})

describe('withNamedRevert', () => {
  it('passes the value of a member that resolves', async () => {
    await expect(withNamedRevert(async () => 42)).resolves.toBe(42)
  })

  it("rethrows a revert as the landing revert of the kit's error", async () => {
    const thrown = await thrownBy(
      withNamedRevert(async () => {
        throw reverting(wrongNonce)
      })
    )
    expect(thrown).toMatchObject({
      name: 'LandingRevert',
      code: 'WrongSetupNonce',
      error: kitErrorOf(wrongNonce)
    })
  })

  it('rethrows a revert with no data as an unknown error', async () => {
    expect(
      await thrownBy(
        withNamedRevert(async () => {
          throw reverting()
        })
      )
    ).toMatchObject({
      name: 'LandingRevert',
      code: 'unknown',
      error: { kind: 'unknown', data: '0x' }
    })
  })

  it('rethrows any other failure as it was thrown', async () => {
    const failure = providerReadFailure('call', new Error('down'))
    expect(
      await thrownBy(
        withNamedRevert(async () => {
          throw failure
        })
      )
    ).toBe(failure)
  })
})
