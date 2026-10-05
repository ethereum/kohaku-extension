/**
 * What the classification of a write's end takes from a thrown value: a
 * transaction hash, and the receipt ethers carries on it.
 *
 * - A hash is `0x` and exactly 64 hex digits, in either case. A thrown value
 *   that names one and carries no receipt keeps the write waiting for its
 *   receipt, and a status-zero receipt that carries one reads reverted. A
 *   thrown value with anything else in its place reads that nothing was sent.
 * - The receipt is ethers' `TransactionReceipt`: a numeric status, and the gas
 *   used and the gas price as bigints, whose product is the gas the revert
 *   spent. A gas factor that is missing, or of another type, is left out, and
 *   the revert names no gas spent. A receipt with no status, as before
 *   Byzantium, is never read.
 * - A node's raw JSON receipt is not the shape ethers gives, so the write does
 *   not settle from it; the hash it names says the call reached the chain, so
 *   the write waits for its receipt under that hash.
 */
import type { Hex } from '@web/modules/social-recovery/sdk-interfaces'

import {
  failThrown,
  GWEI,
  minedAndReverted,
  readingOf,
  receiptOf,
  TX_HASH,
  waitTimedOut,
  WRITE_KINDS
} from './harness'

const HASHES: [string, string][] = [
  ['64 lower-case hex digits', TX_HASH],
  ['64 upper-case hex digits', `0x${'ABCDEF09'.repeat(8)}`],
  ['64 hex digits in mixed case', `0x${'aBcD'.repeat(16)}`]
]

const NOT_HASHES: [string, string][] = [
  ['63 hex digits', TX_HASH.slice(0, -1)],
  ['65 hex digits', `${TX_HASH}0`],
  ['0X with a capital X before 64 hex digits', `0X${TX_HASH.slice(2)}`],
  ['a space before it', ` ${TX_HASH}`],
  ['a space after it', `${TX_HASH} `],
  ['a line break after it', `${TX_HASH}\n`],
  ['a space in place of its first digit, at the length of a hash', `0x ${TX_HASH.slice(3)}`],
  ['a letter past f, at the length of a hash', `0x${'g'.repeat(64)}`]
]

/** ethers' error from `wait()` on a mined revert, carrying the receipt given and no transaction. */
const minedAndRevertedWith = (receipt: Record<string, unknown>): Error =>
  Object.assign(new Error('transaction execution reverted'), { code: 'CALL_EXCEPTION', receipt })

/**
 * Thrown values that name `value`: a wait with no receipt, a mined revert
 * with the transaction and its receipt, and one with the receipt alone.
 */
const thrownNaming = (value: string): Error[] => [
  waitTimedOut(value as Hex),
  minedAndReverted(value as Hex),
  minedAndRevertedWith({ hash: value, status: 0 })
]

describe('a transaction hash', () => {
  describe('a thrown value that names one waits for its receipt, and one with a status-zero receipt reads reverted', () => {
    HASHES.forEach(([name, hash]) =>
      it(name, () => {
        WRITE_KINDS.forEach((write) => {
          const [waiting, withTransaction, receiptAlone] = thrownNaming(hash)
          expect(failThrown(write, waiting)).toEqual({
            status: 'submitting',
            write,
            transactionHash: hash
          })
          expect(failThrown(write, withTransaction)).toMatchObject({
            status: 'failedReverted',
            transactionHash: hash
          })
          expect(failThrown(write, receiptAlone)).toMatchObject({
            status: 'failedReverted',
            transactionHash: hash
          })
        })
      })
    )
  })

  describe('a thrown value with anything else in its place, with a receipt or without, reads that nothing was sent', () => {
    NOT_HASHES.forEach(([name, value]) =>
      it(name, () => {
        WRITE_KINDS.forEach((write) =>
          thrownNaming(value).forEach((thrown) =>
            expect(readingOf(failThrown(write, thrown))).toBe('notSent')
          )
        )
      })
    )
  })
})

describe('the gas a mined revert spent', () => {
  const spentWith = (gas: Record<string, unknown>) =>
    WRITE_KINDS.map((write) =>
      failThrown(write, minedAndRevertedWith({ hash: TX_HASH, status: 0, ...gas }))
    )

  it('is the gas used times the gas price', () => {
    spentWith({ gasUsed: 51_234n, gasPrice: 2n * GWEI }).forEach((state) =>
      expect(state).toMatchObject({ status: 'failedReverted', gasSpent: 51_234n * 2n * GWEI })
    )
  })

  it('is zero for zero gas used, not left out', () => {
    spentWith({ gasUsed: 0n, gasPrice: 2n * GWEI }).forEach((state) =>
      expect(state).toMatchObject({ status: 'failedReverted', gasSpent: 0n })
    )
  })

  it('is not named for a receipt with no gas price, and the write still reads reverted', () => {
    spentWith({ gasUsed: 51_234n }).forEach((state) => {
      expect(readingOf(state)).toBe('reverted')
      expect(state).not.toHaveProperty('gasSpent')
    })
  })

  it('is not named for a gas factor that is no bigint, and the write still reads reverted', () => {
    const factors = [
      { gasUsed: '0x0a', gasPrice: 2n * GWEI },
      { gasUsed: 10, gasPrice: 2n * GWEI },
      { gasUsed: 10n, gasPrice: '0x77359400' }
    ]
    factors.forEach((gas) =>
      spentWith(gas).forEach((state) => {
        expect(readingOf(state)).toBe('reverted')
        expect(state).not.toHaveProperty('gasSpent')
      })
    )
  })
})

describe('the status of a receipt', () => {
  it('a receipt with no status, as before Byzantium, is never read: a thrown value carrying one waits under its hash', () => {
    expect(receiptOf({ hash: TX_HASH, status: null })).toBeUndefined()
    WRITE_KINDS.forEach((write) =>
      expect(failThrown(write, minedAndRevertedWith({ hash: TX_HASH, status: null }))).toEqual({
        status: 'submitting',
        write,
        transactionHash: TX_HASH
      })
    )
  })
})

describe("a node's raw JSON receipt carried by a thrown value", () => {
  /** A mined revert as a node's JSON-RPC answer holds it: quantities as hex strings. */
  const rawReceipt = (transactionHash: string) => ({
    transactionHash,
    status: '0x0',
    blockNumber: '0x6acfc1',
    gasUsed: '0x0a',
    effectiveGasPrice: '0x77359400'
  })

  describe('keeps the write waiting in submitting under its transactionHash', () => {
    HASHES.forEach(([name, hash]) =>
      it(name, () => {
        WRITE_KINDS.forEach((write) =>
          expect(failThrown(write, minedAndRevertedWith(rawReceipt(hash)))).toEqual({
            status: 'submitting',
            write,
            transactionHash: hash
          })
        )
      })
    )
  })

  it('whose transactionHash is not a transaction hash reads that nothing was sent', () => {
    NOT_HASHES.forEach(([, value]) =>
      WRITE_KINDS.forEach((write) =>
        expect(readingOf(failThrown(write, minedAndRevertedWith(rawReceipt(value))))).toBe(
          'notSent'
        )
      )
    )
  })
})
