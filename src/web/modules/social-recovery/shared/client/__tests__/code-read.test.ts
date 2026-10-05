/**
 * The code read answers the code the extension's provider returns at the
 * block it is asked for, `0x` for an address with none; an answer that is not
 * hex, or a read the provider could not make, rejects as a failed code read.
 */
import type { Address, Hex } from '@web/modules/social-recovery/sdk-interfaces'
import {
  createCodeRead,
  isProviderReadFailure
} from '@web/modules/social-recovery/shared/client/provider-adapter'

const ACCOUNT: Address = '0x1111111111111111111111111111111111111111'
const CODE: Hex = '0x6080604052'

const codeReadAnswering = (answer: () => Promise<string>) => {
  const getCode = jest.fn<Promise<string>, [unknown, unknown?]>(() => answer())
  return { codeRead: createCodeRead({ getCode }), getCode }
}

describe('the code read', () => {
  it('answers the code at the block it is given', async () => {
    const { codeRead, getCode } = codeReadAnswering(async () => CODE)
    await expect(codeRead.code(ACCOUNT, 11829500)).resolves.toBe(CODE)
    expect(getCode).toHaveBeenCalledWith(ACCOUNT, 11829500)
  })

  it('reads the latest block where none is given', async () => {
    const { codeRead, getCode } = codeReadAnswering(async () => CODE)
    await codeRead.code(ACCOUNT)
    expect(getCode).toHaveBeenCalledWith(ACCOUNT, 'latest')
  })

  it('answers 0x for an address with no code', async () => {
    const { codeRead } = codeReadAnswering(async () => '0x')
    await expect(codeRead.code(ACCOUNT)).resolves.toBe('0x')
  })

  it('rejects an answer that is not hex as a failed code read', async () => {
    const { codeRead } = codeReadAnswering(async () => 'no code here')
    const thrown = await codeRead.code(ACCOUNT).catch((error: unknown) => error)
    expect(isProviderReadFailure(thrown)).toBe(true)
    expect(thrown).toMatchObject({ read: 'code' })
  })

  it('rejects a provider rejection as a failed code read carrying its cause', async () => {
    const cause = new Error('timeout')
    const { codeRead } = codeReadAnswering(() => Promise.reject(cause))
    const thrown = await codeRead.code(ACCOUNT).catch((error: unknown) => error)
    expect(isProviderReadFailure(thrown)).toBe(true)
    expect(thrown).toMatchObject({ read: 'code', cause })
  })
})
