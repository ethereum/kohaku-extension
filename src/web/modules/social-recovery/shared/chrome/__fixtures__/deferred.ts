import type { Deferred } from '@web/modules/social-recovery/shared/chrome/__fixtures__/types'

/** A promise a test settles by hand, for an edge that must hold a run at one step. */
export const deferred = <T>(): Deferred<T> => {
  let resolve: (value: T) => void = () => {}
  let reject: (error: unknown) => void = () => {}
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}
