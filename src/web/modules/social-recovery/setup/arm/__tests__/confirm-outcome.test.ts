/**
 * The check after a landed save, read as the save reads it: each answer the
 * client's `confirmSetup` can give, the further reads where a read did not find
 * the setup, and a check that throws or never answers at any read.
 */
import {
  COMMITMENT_MISMATCH_CODE,
  CONFIRM_READ_TIMEOUT_MS,
  CONFIRM_REREAD_BLOCKS,
  confirmOutcomeOf,
  outcomeOfConfirmation,
  outcomeOfConfirmFailure
} from '@web/modules/social-recovery/setup/arm'
import type { SetupConfirmation } from '@web/modules/social-recovery/sdk-interfaces'

import { codedError, confirmation } from '@web/modules/social-recovery/setup/arm/__tests__/harness'

/** Read 1 is the first; each later read follows a read that did not find the setup. */
const EVERY_READ = Array.from({ length: 1 + CONFIRM_REREAD_BLOCKS }, (_, index) => index + 1)
const LATER_READS = EVERY_READ.slice(1)

const reads = (...answers: (SetupConfirmation | Error | 'never')[]) => {
  let index = 0
  return jest.fn(() => {
    const answer = answers[Math.min(index, answers.length - 1)]
    index += 1
    if (answer === 'never') {
      return new Promise<SetupConfirmation>(() => {})
    }
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer)
  })
}

describe('one answer of the check', () => {
  it('agrees only where the setup landed and the module recognizes the authorization', () => {
    expect(outcomeOfConfirmation(confirmation(true, true))).toEqual({ kind: 'agreed' })
    expect(outcomeOfConfirmation(confirmation(true, false))).toEqual({
      kind: 'disagreed',
      check: 'authorization'
    })
  })

  it('reads a setup the check did not find as not yet decided, whatever the authorization reads', () => {
    expect(outcomeOfConfirmation(confirmation(false, true))).toBeNull()
    expect(outcomeOfConfirmation(confirmation(false, false))).toBeNull()
  })

  it("reads the commitment's coded mismatch as that disagreement, and any other throw as unanswered", () => {
    expect(outcomeOfConfirmFailure(codedError(COMMITMENT_MISMATCH_CODE))).toEqual({
      kind: 'disagreed',
      check: 'mismatch'
    })
    expect(outcomeOfConfirmFailure(codedError('confirm.no-commit-call'))).toEqual({
      kind: 'unread'
    })
    expect(outcomeOfConfirmFailure(new Error(COMMITMENT_MISMATCH_CODE))).toEqual({ kind: 'unread' })
    expect(outcomeOfConfirmFailure(undefined)).toEqual({ kind: 'unread' })
    expect(outcomeOfConfirmFailure('confirm.commitment-mismatch')).toEqual({ kind: 'unread' })
  })
})

describe('the check as the save reads it', () => {
  it('reads once where the first answer decides', async () => {
    const agreed = reads(confirmation(true, true))
    expect(await confirmOutcomeOf(agreed)).toEqual({ kind: 'agreed' })
    expect(agreed).toHaveBeenCalledTimes(1)

    const unauthorized = reads(confirmation(true, false))
    expect(await confirmOutcomeOf(unauthorized)).toEqual({
      kind: 'disagreed',
      check: 'authorization'
    })
    expect(unauthorized).toHaveBeenCalledTimes(1)
  })

  it('reads again where the setup was not found, and reads the mismatch only after the first read and every further read found nothing', async () => {
    const check = reads(confirmation(false, true))
    expect(await confirmOutcomeOf(check)).toEqual({ kind: 'disagreed', check: 'mismatch' })
    expect(check).toHaveBeenCalledTimes(1 + CONFIRM_REREAD_BLOCKS)
  })

  LATER_READS.forEach((read) => {
    const notFound = Array.from({ length: read - 1 }, () => confirmation(false, true))

    it(`agrees where read ${read} is the first to find the setup landed and authorized, and reads no more`, async () => {
      const check = reads(...notFound, confirmation(true, true), confirmation(false, true))
      expect(await confirmOutcomeOf(check)).toEqual({ kind: 'agreed' })
      expect(check).toHaveBeenCalledTimes(read)
    })

    it(`reads the authorization disagreement where read ${read} is the first to find the setup, unauthorized`, async () => {
      const check = reads(...notFound, confirmation(true, false), confirmation(true, true))
      expect(await confirmOutcomeOf(check)).toEqual({ kind: 'disagreed', check: 'authorization' })
      expect(check).toHaveBeenCalledTimes(read)
    })
  })

  EVERY_READ.forEach((read) => {
    const notFound = Array.from({ length: read - 1 }, () => confirmation(false, true))

    it(`reads a throw at read ${read} as unanswered, and the coded mismatch there as the mismatch, reading no more`, async () => {
      const thrown = reads(...notFound, new Error('node down'), confirmation(true, true))
      expect(await confirmOutcomeOf(thrown)).toEqual({ kind: 'unread' })
      expect(thrown).toHaveBeenCalledTimes(read)

      const mismatch = reads(
        ...notFound,
        codedError(COMMITMENT_MISMATCH_CODE),
        confirmation(true, true)
      )
      expect(await confirmOutcomeOf(mismatch)).toEqual({ kind: 'disagreed', check: 'mismatch' })
      expect(mismatch).toHaveBeenCalledTimes(read)
    })

    it(`gives read ${read} its own time limit, and reads one that does not answer as unanswered`, async () => {
      const check = reads(...notFound, 'never')
      expect(await confirmOutcomeOf(check, { timeoutMs: 10 })).toEqual({ kind: 'unread' })
      expect(check).toHaveBeenCalledTimes(read)
    })
  })

  it('reads a check that throws as unanswered, never as agreed', async () => {
    expect(await confirmOutcomeOf(reads(new Error('node down')))).toEqual({ kind: 'unread' })
    expect(
      await confirmOutcomeOf(() => {
        throw new Error('synchronous')
      })
    ).toEqual({
      kind: 'unread'
    })
  })

  it('reads a check that does not answer in time as unanswered', async () => {
    jest.useFakeTimers()
    try {
      const outcome = confirmOutcomeOf(reads('never'))
      jest.advanceTimersByTime(CONFIRM_READ_TIMEOUT_MS - 1)
      let settled = false
      outcome.then(
        () => {
          settled = true
        },
        () => {
          settled = true
        }
      )
      await Promise.resolve()
      expect(settled).toBe(false)
      jest.advanceTimersByTime(1)
      expect(await outcome).toEqual({ kind: 'unread' })
    } finally {
      jest.useRealTimers()
    }
  })
})
