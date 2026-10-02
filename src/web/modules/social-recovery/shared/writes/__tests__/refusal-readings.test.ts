/**
 * Two refusals of the send port read their own way in the not-sent state. A
 * call the wallet submitted on a route it cannot follow may still reach the
 * chain: it offers no retry, the machine does not start it again, and it reads
 * one line with no title. A call refused because another request of the
 * account waits in the wallet reads its own line and keeps the retry, since
 * nothing was sent. Every other refusal reads as any call never sent.
 */
import i18n from '@common/config/localization'
import {
  accountBatchRefusal,
  isSendRefusal,
  SEND_REFUSAL_REASONS,
  sendRefusal,
  type SendRefusalReason
} from '@web/modules/social-recovery/shared/client'
import {
  ACCOUNT,
  canRetry,
  KEY,
  mayStillLand,
  otherRequestPending,
  renderWriteState,
  submittingFor,
  userRejected,
  WRITE_KINDS,
  writeReducer,
  WRITES_KEYS,
  WriteMachineState,
  WriteKind
} from '@web/modules/social-recovery/shared/writes/__tests__/harness'

const t = i18n.t
/** A translation that answers the key path it was given. */
const keyPath = (key: string) => key

/** The state the machine reads once the send throws `error` in a submitting run. */
const thrownInSend = (write: WriteKind, error: unknown): WriteMachineState => {
  const submitting = submittingFor(write)
  return writeReducer(submitting, { type: 'error', run: submitting.run, error })
}

const REFUSALS = [
  ['a key', (reason: SendRefusalReason) => sendRefusal(reason, KEY)],
  ["an account's batch", (reason: SendRefusalReason) => accountBatchRefusal(reason, ACCOUNT)]
] as const

describe('the line each refusal reads', () => {
  it('the may-still-land line, the other-request line and the plain not-sent line are three keys', () => {
    const lines = [WRITES_KEYS.mayStillLand, WRITES_KEYS.otherRequestPending, WRITES_KEYS.notSent]
    expect(new Set(lines).size).toBe(3)
    expect(new Set(lines.map((key) => t(key))).size).toBe(3)
  })
})

WRITE_KINDS.forEach((write) =>
  REFUSALS.forEach(([sender, refusal]) =>
    describe(`${write}, refused for ${sender}`, () => {
      describe('a send the wallet submitted on a route it cannot follow', () => {
        const state = () => thrownInSend(write, refusal('not-a-transaction'))

        it('reads not sent, may still land, and nothing else', () => {
          const failed = state()
          expect(failed).toMatchObject({ status: 'failedNotSent', write, mayStillLand: true })
          expect(failed).not.toHaveProperty('otherRequest')
          expect(failed).not.toHaveProperty('replaced')
          expect(mayStillLand(failed)).toBe(true)
          expect(otherRequestPending(failed)).toBe(false)
        })

        it('offers no retry, and the machine refuses to start it again', () => {
          const failed = state()
          expect(canRetry(failed)).toBe(false)
          expect(writeReducer(failed, { type: 'start' })).toBe(failed)
        })

        it('takes a reset, back to idle, from which a start opens a new run', () => {
          const failed = state()
          const reset = writeReducer(failed, { type: 'reset' })
          expect(reset).toMatchObject({ status: 'idle', write, run: failed.run })
          expect(writeReducer(reset, { type: 'start' })).toMatchObject({
            status: 'checkingGas',
            run: failed.run + 1
          })
        })

        it('renders one line, the may-still-land one, with no title and no retry', () => {
          const failed = state()
          expect(renderWriteState(failed, keyPath)).toMatchObject({
            lines: ['socialRecovery.writes.mayStillLand']
          })
          const rendered = renderWriteState(failed)
          expect(rendered.title).toBeUndefined()
          expect(rendered.retry).toBeUndefined()
          expect(rendered.lines).toEqual([t(WRITES_KEYS.mayStillLand)])
          expect(rendered.lines).not.toContain(t(WRITES_KEYS.notSent))
        })
      })

      describe('a send refused for another request of the account', () => {
        const state = () => thrownInSend(write, refusal('other-request-pending'))

        it('reads not sent with the other request, and not as may still land', () => {
          const failed = state()
          expect(failed).toMatchObject({ status: 'failedNotSent', write, otherRequest: true })
          expect(failed).not.toHaveProperty('mayStillLand')
          expect(otherRequestPending(failed)).toBe(true)
          expect(mayStillLand(failed)).toBe(false)
        })

        it('renders its one line in place of the not-sent line, with the retry', () => {
          const failed = state()
          expect(renderWriteState(failed, keyPath)).toMatchObject({
            lines: ['socialRecovery.writes.otherRequestPending'],
            retry: 'socialRecovery.writes.tryAgain'
          })
          const rendered = renderWriteState(failed)
          expect(rendered.lines).toEqual([t(WRITES_KEYS.otherRequestPending)])
          expect(rendered.lines).not.toContain(t(WRITES_KEYS.notSent))
          expect(rendered.retry).toBe(t(WRITES_KEYS.tryAgain))
        })

        it('starts again from the retry', () => {
          const failed = state()
          expect(canRetry(failed)).toBe(true)
          expect(writeReducer(failed, { type: 'start' })).toMatchObject({
            status: 'checkingGas',
            run: failed.run + 1
          })
        })
      })

      SEND_REFUSAL_REASONS.filter(
        (reason) => reason !== 'not-a-transaction' && reason !== 'other-request-pending'
      ).forEach((reason) =>
        it(`a ${reason} refusal reads as any call never sent: the not-sent line and the retry`, () => {
          const failed = thrownInSend(write, refusal(reason))
          const plain = thrownInSend(write, userRejected())
          expect(failed.status).toBe('failedNotSent')
          expect(failed).not.toHaveProperty('mayStillLand')
          expect(failed).not.toHaveProperty('otherRequest')
          expect(mayStillLand(failed)).toBe(false)
          expect(otherRequestPending(failed)).toBe(false)
          expect(canRetry(failed)).toBe(true)
          expect(renderWriteState(failed)).toEqual(renderWriteState(plain))
          expect(renderWriteState(failed, keyPath).lines).toEqual(['socialRecovery.writes.notSent'])
        })
      )
    })
  )
)

describe('only a refusal of the send port reads its reason', () => {
  const LOOKALIKES: [string, unknown][] = [
    [
      'a plain object with the name and the reason',
      { name: 'SendRefusal', reason: 'not-a-transaction' }
    ],
    [
      'an error named a refusal with a reason the port never gives',
      Object.assign(new Error('x'), { name: 'SendRefusal', reason: 'lost' })
    ],
    [
      'an error with the reason under another name',
      Object.assign(new Error('x'), { reason: 'not-a-transaction' })
    ]
  ]
  LOOKALIKES.forEach(([label, value]) =>
    it(`${label} is no refusal, and reads as any call never sent`, () => {
      expect(isSendRefusal(value)).toBe(false)
      const failed = thrownInSend('save', value)
      expect(failed.status).toBe('failedNotSent')
      expect(mayStillLand(failed)).toBe(false)
      expect(otherRequestPending(failed)).toBe(false)
      expect(canRetry(failed)).toBe(true)
    })
  )

  it('every refusal the port makes, for a key or a batch, is one', () => {
    SEND_REFUSAL_REASONS.forEach((reason) => {
      expect(isSendRefusal(sendRefusal(reason, KEY))).toBe(true)
      expect(isSendRefusal(accountBatchRefusal(reason, ACCOUNT))).toBe(true)
    })
  })

  it('no other thrown value is one', () => {
    ;[undefined, null, 'not-a-transaction', 0, new TypeError('x'), userRejected()].forEach(
      (value) => expect(isSendRefusal(value)).toBe(false)
    )
  })
})
