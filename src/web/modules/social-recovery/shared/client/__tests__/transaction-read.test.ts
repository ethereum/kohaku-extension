/**
 * The transaction read answers the checksummed sender of the transaction the
 * extension's provider returns for a hash, null where the node knows none; a
 * sender that is not an address, or a read the provider could not make,
 * rejects as a failed transaction read.
 */
import type { Hex } from '@kohaku-eth/social-recovery'
import {
  createTransactionRead,
  isProviderReadFailure
} from '@web/modules/social-recovery/shared/client/provider-adapter'

const HASH: Hex = `0x${'ab'.repeat(32)}`
const SENDER_LOWER = '0xc18a000000000000000000000000000000000abc'
const SENDER = '0xc18a000000000000000000000000000000000abC'

const readAnswering = (answer: () => Promise<{ from: string } | null>) => {
  const getTransaction = jest.fn<Promise<{ from: string } | null>, [string]>(() => answer())
  return {
    read: createTransactionRead({ getTransaction } as unknown as Parameters<
      typeof createTransactionRead
    >[0]),
    getTransaction
  }
}

describe('the transaction read', () => {
  it("answers the transaction's sender, checksummed", async () => {
    const { read, getTransaction } = readAnswering(async () => ({ from: SENDER_LOWER }))
    await expect(read(HASH)).resolves.toBe(SENDER)
    expect(getTransaction).toHaveBeenCalledWith(HASH)
  })

  it('answers null where the node knows no such transaction', async () => {
    const { read } = readAnswering(async () => null)
    await expect(read(HASH)).resolves.toBeNull()
  })

  it('rejects a sender that is not an address as a failed transaction read', async () => {
    const { read } = readAnswering(async () => ({ from: 'nobody' }))
    const thrown = await read(HASH).catch((error: unknown) => error)
    expect(isProviderReadFailure(thrown)).toBe(true)
    expect(thrown).toMatchObject({ read: 'transaction' })
  })

  it('rejects a provider rejection as a failed transaction read carrying its cause', async () => {
    const cause = new Error('timeout')
    const { read } = readAnswering(() => Promise.reject(cause))
    const thrown = await read(HASH).catch((error: unknown) => error)
    expect(isProviderReadFailure(thrown)).toBe(true)
    expect(thrown).toMatchObject({ read: 'transaction', cause })
  })
})
