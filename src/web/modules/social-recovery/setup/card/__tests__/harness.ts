/**
 * What the card tests share: the fake recovery client the screen test hands
 * the screen, a promise a test settles by hand, the refusal the setup read
 * throws when a password does not open the saved backup, and the refusal a
 * client built against another digest version fails with.
 */
import type { RestoreCause, RestoreRefusal } from '@web/modules/social-recovery/sdk-interfaces'
import type { DigestVersionRefusal } from '@web/modules/social-recovery/shared/client'

/** The two setup reads the card's password row calls on the client. */
export interface FakeSetupReads {
  setupState: jest.Mock
  getSetup: jest.Mock
}

/** The client state the screen sees, as the client hook answers it. */
export type FakeClientState =
  | { status: 'loading' }
  | { status: 'ready'; client: { setup: FakeSetupReads } }
  | { status: 'failed'; error: unknown }
  | { status: 'update-the-wallet'; refusal: DigestVersionRefusal }

/** A promise with its two ends in the test's hands. */
export interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

export const deferred = <T>(): Deferred<T> => {
  let resolve: (value: T) => void = () => {}
  let reject: (reason: unknown) => void = () => {}
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

export const restoreRefusalOf = (cause: RestoreCause): RestoreRefusal => {
  const error = new Error(`The restore refused: ${cause}`) as RestoreRefusal
  error.name = 'RestoreRefusal'
  error.cause = { code: cause, subject: 'setup', values: {} }
  return error
}

/** The refusal of a client built against another deployment's digest version. */
export const digestVersionRefusal = (): DigestVersionRefusal =>
  Object.assign(new Error('The manager publishes another digest version.'), {
    name: 'DigestVersionRefusal' as const,
    state: 'update-the-wallet' as const,
    carried: { name: 'Recovery', version: '1' }
  })

// Jest runs every file under __tests__, this one included; its own check runs
// only when Jest runs this file, never from a file that imports the harness.
if (expect.getState().testPath === __filename) {
  describe('harness', () => {
    it('settles a held promise only when the test says, either way', async () => {
      const answered = deferred<string>()
      const refused = deferred<string>()
      const first = await Promise.race([answered.promise, Promise.resolve('still waiting')])
      expect(first).toBe('still waiting')
      answered.resolve('opened')
      refused.reject(new Error('refused'))
      await expect(answered.promise).resolves.toBe('opened')
      await expect(refused.promise).rejects.toThrow('refused')
    })

    it('throws a restore refusal as an error that carries its cause', () => {
      const refusal = restoreRefusalOf('restore.backup-unopened')
      expect(refusal).toBeInstanceOf(Error)
      expect(refusal.cause.code).toBe('restore.backup-unopened')
    })
  })
}
