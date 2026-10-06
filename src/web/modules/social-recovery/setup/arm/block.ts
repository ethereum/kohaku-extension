/**
 * The wait for a new block: it reads the chain's block number, then reads it
 * again every few seconds until it moved past the first one, or until its
 * limit ends. A read that fails or does not answer in time moves nothing; the
 * wait never rejects, and it never runs past its limit. A block number the
 * chain answers counts only as a safe integer of zero or more.
 */
import { BLOCK_POLL_MS } from './constants'

/** A block number the chain answered, or undefined where it is not a safe integer of zero or more. */
export const blockOrNone = (block: number | undefined): number | undefined =>
  block !== undefined && Number.isSafeInteger(block) && block >= 0 ? block : undefined

const pause = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

/** The block number, or undefined where the read failed or had not answered by the deadline. */
const readBy = (read: () => Promise<number>, deadline: number): Promise<number | undefined> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), Math.max(0, deadline - Date.now()))
    Promise.resolve()
      .then(read)
      .then(
        (block) => {
          clearTimeout(timer)
          resolve(block)
        },
        () => {
          clearTimeout(timer)
          resolve(undefined)
        }
      )
  })

export const waitForNewBlock = async (
  blockNumber: () => Promise<number>,
  limitMs: number
): Promise<void> => {
  const deadline = Date.now() + limitMs
  const poll = async (seen: number | undefined): Promise<void> => {
    const left = deadline - Date.now()
    if (left <= 0) {
      return
    }
    await pause(Math.min(BLOCK_POLL_MS, left))
    const now = await readBy(blockNumber, deadline)
    if (now === undefined || seen === undefined || now <= seen) {
      await poll(seen ?? now)
    }
  }
  await poll(await readBy(blockNumber, deadline))
}
