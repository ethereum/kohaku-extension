/** The answer of `read`, or undefined where it throws or does not answer within `limitMs`. */
export const within = <T>(read: () => Promise<T>, limitMs: number): Promise<T | undefined> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), limitMs)
    Promise.resolve()
      .then(read)
      .then(
        (answer) => {
          clearTimeout(timer)
          resolve(answer)
        },
        () => {
          clearTimeout(timer)
          resolve(undefined)
        }
      )
  })

/**
 * The answer of `read`, rejected where it does not answer within `limitMs`;
 * `onLimit` shapes that rejection where a caller reads it by its kind.
 */
export const readWithin = <T>(
  read: () => Promise<T>,
  limitMs: number,
  onLimit: (error: Error) => Error = (error) => error
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(onLimit(new Error(`No answer in ${limitMs} ms.`))),
      limitMs
    )
    Promise.resolve()
      .then(read)
      .then(
        (answer) => {
          clearTimeout(timer)
          resolve(answer)
        },
        (error: unknown) => {
          clearTimeout(timer)
          reject(error)
        }
      )
  })
