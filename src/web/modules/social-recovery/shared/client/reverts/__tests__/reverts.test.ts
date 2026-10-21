/**
 * A contract's revert met by a read or a landing, named as the kit's error:
 * the manager's and the action's errors by name, the errors the SDK's tables
 * leave out by their deployed names, any other data as unknown with its
 * selector where it has one.
 */
import { encodeErrorResult, parseAbi } from 'viem'

import {
  providerReadFailure,
  revertedCall
} from '@web/modules/social-recovery/shared/client/provider-adapter'
import { kitErrorOf, withNamedRevert } from '@web/modules/social-recovery/shared/client/reverts'

const MANAGER_ABI = parseAbi([
  'error PolicyManager_WrongSetupNonce(uint64 supplied, uint64 expected)',
  'error PolicyManager_ActionDoesNotServeAccount(address _action, address _account)'
])
const OTHER_ERRORS = parseAbi(['error SomethingElse(uint256 value)'])

const reverting = (data: `0x${string}` = '0x') => revertedCall('call', data)

const thrownBy = (run: Promise<unknown>): Promise<unknown> =>
  run.then(
    () => undefined,
    (error: unknown) => error
  )

const wrongNonce = encodeErrorResult({
  abi: MANAGER_ABI,
  errorName: 'PolicyManager_WrongSetupNonce',
  args: [2n, 1n]
})

describe('kitErrorOf', () => {
  it("names the manager's error, with its arguments", () => {
    expect(kitErrorOf(wrongNonce)).toEqual({
      known: true,
      source: 'manager',
      name: 'PolicyManager_WrongSetupNonce',
      selector: wrongNonce.slice(0, 10),
      args: { supplied: 2n, expected: 1n }
    })
  })

  it('names an error the SDK does not know under its deployed name', () => {
    const data = encodeErrorResult({
      abi: MANAGER_ABI,
      errorName: 'PolicyManager_ActionDoesNotServeAccount',
      args: [
        '0x00000000000000000000000000000000000000a1',
        '0x00000000000000000000000000000000000000a2'
      ]
    })
    expect(kitErrorOf(data)).toMatchObject({
      known: true,
      source: 'manager',
      name: 'PolicyManager_ActionDoesNotServeAccount'
    })
  })

  it('answers unknown with the selector and the data for an error it does not know', () => {
    const data = encodeErrorResult({ abi: OTHER_ERRORS, errorName: 'SomethingElse', args: [7n] })
    expect(kitErrorOf(data)).toEqual({ known: false, selector: data.slice(0, 10), data })
  })

  it('answers unknown with the data alone for data shorter than a selector', () => {
    expect(kitErrorOf('0x')).toEqual({ known: false, data: '0x' })
    expect(kitErrorOf('0x123456')).toEqual({ known: false, data: '0x123456' })
    expect(kitErrorOf('0x12345678')).toEqual({
      known: false,
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
      code: 'PolicyManager_WrongSetupNonce',
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
      error: { known: false, data: '0x' }
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
