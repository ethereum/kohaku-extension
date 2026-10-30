/**
 * @jest-environment jsdom
 *
 * The cancel's arrival read beside the watcher's last reading: the last
 * reading answers while the fresh read runs, and the fresh read alone
 * answers the read.
 */
import type { Arrival, AttemptReadResult } from '@web/modules/social-recovery/cancel/types'
import type { WatcherReading } from '@web/modules/social-recovery/watcher'

jest.mock('viem', () => {
  // eslint-disable-next-line global-require
  const { TextDecoder, TextEncoder } = require('util')
  Object.assign(globalThis, { TextDecoder, TextEncoder })
  return jest.requireActual('viem')
})

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const fixtures: typeof import('@web/modules/social-recovery/cancel/__fixtures__/mount') = require('@web/modules/social-recovery/cancel/__fixtures__/mount')
const watcherFixtures: typeof import('@web/modules/social-recovery/watcher/__fixtures__/harness') = require('@web/modules/social-recovery/watcher/__fixtures__/harness')
const {
  useAttemptRead
}: typeof import('@web/modules/social-recovery/cancel/useAttemptRead') = require('@web/modules/social-recovery/cancel/useAttemptRead')
const {
  deferred
}: typeof import('@web/modules/social-recovery/shared/chrome/__fixtures__/deferred') = require('@web/modules/social-recovery/shared/chrome/__fixtures__/deferred')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const { act, mount } = fixtures
const { ACCOUNT, HEAD, HEAD_TIME } = watcherFixtures

const LAST: WatcherReading = {
  account: ACCOUNT,
  block: { number: HEAD - 5, timestamp: HEAD_TIME - 60 },
  hasSetup: true,
  dormant: false
}
const FRESH: WatcherReading = { ...LAST, block: { number: HEAD, timestamp: HEAD_TIME } }

describe("the cancel's arrival read", () => {
  it('answers the last reading while the fresh read runs, and the fresh read once it answers', async () => {
    const fresh = deferred<Arrival>()
    const readArrival = () => fresh.promise
    const readLast = async () => LAST
    const seen: AttemptReadResult[] = []
    const Probe = () => {
      seen.push(useAttemptRead(readArrival, readLast))
      return null
    }
    const view = await mount(<Probe />)

    expect(seen[seen.length - 1].read).toEqual({ status: 'loading' })
    expect(seen[seen.length - 1].last).toBe(LAST)

    await act(async () => {
      fresh.resolve({ reading: FRESH })
    })
    expect(seen[seen.length - 1].read).toEqual({ status: 'read', arrival: { reading: FRESH } })
    view.unmount()
  })

  const NO_LAST_READING = [
    { name: 'none is stored', readLast: async () => undefined },
    {
      name: 'its read fails',
      readLast: async () => {
        throw new Error('storage refused')
      }
    }
  ]
  NO_LAST_READING.forEach(({ name, readLast }) =>
    it(`answers no last reading where ${name}`, async () => {
      const seen: AttemptReadResult[] = []
      const readArrival = () => new Promise<Arrival>(() => {})
      const Probe = () => {
        seen.push(useAttemptRead(readArrival, readLast))
        return null
      }
      const view = await mount(<Probe />)
      expect(seen[seen.length - 1].last).toBeNull()
      view.unmount()
    })
  )
})
