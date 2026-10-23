/** Jest's fake clock as the installed version serves it; its typings lack the async advance. */
export interface AsyncFakeTimers {
  advanceTimersByTimeAsync(ms: number): Promise<void>
}
