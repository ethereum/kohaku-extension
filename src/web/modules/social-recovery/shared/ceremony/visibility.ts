/**
 * The visibility rule: a hidden tab dispatches nothing until it is shown
 * again, the report's storage write included, so a ceremony that hands off to
 * a phone reports its result when the tab returns.
 *
 * The gate takes the document as a parameter, so it runs under Jest's node
 * environment with a fabricated source and in the tab with `document`.
 */
import type { Held, VisibilityGate, VisibilitySource } from './types'

/** Whether the source is shown: only `visible` counts, `hidden` and `prerender` hold. */
export const isVisible = (source: Pick<VisibilitySource, 'visibilityState'>): boolean =>
  source.visibilityState === 'visible'

/** A gate over `source`. */
export const createVisibilityGate = (source: VisibilitySource): VisibilityGate => {
  let held: Held[] = []
  let disposed = false

  const flush = () => {
    if (!isVisible(source)) {
      return
    }
    const ready = held
    held = []
    ready.forEach((h) => h.run())
  }

  const onChange = () => flush()
  source.addEventListener('visibilitychange', onChange)

  return {
    dispatch<T>(dispatch: () => T | Promise<T>): Promise<T> {
      if (disposed) {
        return Promise.reject(new Error('The visibility gate is disposed.'))
      }
      if (isVisible(source)) {
        try {
          return Promise.resolve(dispatch())
        } catch (error) {
          return Promise.reject(error)
        }
      }
      return new Promise<T>((resolve, reject) => {
        held.push({
          run: () => {
            try {
              Promise.resolve(dispatch()).then(resolve, reject)
            } catch (error) {
              reject(error)
            }
          },
          drop: reject
        })
      })
    },
    pending: () => held.length,
    dispose: () => {
      if (disposed) {
        return
      }
      disposed = true
      source.removeEventListener('visibilitychange', onChange)
      const dropped = held
      held = []
      dropped.forEach((h) => h.drop(new Error('The visibility gate was disposed first.')))
    }
  }
}

/** Resolves once `source` is visible, at once where it already is. */
export const whenVisible = (source: VisibilitySource): Promise<void> =>
  new Promise((resolve) => {
    if (isVisible(source)) {
      resolve()
      return
    }
    const onChange = () => {
      if (!isVisible(source)) {
        return
      }
      source.removeEventListener('visibilitychange', onChange)
      resolve()
    }
    source.addEventListener('visibilitychange', onChange)
  })
