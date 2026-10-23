/**
 * @jest-environment jsdom
 */
import * as React from 'react'
import { createRoot, Root } from 'react-dom/client'

import type { WatchedAttemptState, WatcherRecord } from '@web/modules/social-recovery/watcher'
import { storedWatcherRecordOf, watcherKeyOf } from '@web/modules/social-recovery/watcher'
import {
  ACCOUNT,
  DEPLOYMENT,
  RETIRED_DEPLOYMENT,
  HEAD,
  HEAD_TIME,
  NEW_KEY,
  OTHER_ACCOUNT,
  SEPOLIA
} from '@web/modules/social-recovery/watcher/__fixtures__/harness'
import { useWatchedAttempt } from '@web/modules/social-recovery/watcher/useWatchedAttempt'

// viem builds a TextEncoder and a TextDecoder when either entry loads, which
// jsdom lacks: Node's own are installed first, whichever entry loads first.
jest.mock('viem', () => {
  // eslint-disable-next-line global-require
  const { TextDecoder, TextEncoder } = require('util')
  Object.assign(globalThis, { TextDecoder, TextEncoder })
  return jest.requireActual('viem')
})
jest.mock('viem/chains', () => {
  // eslint-disable-next-line global-require
  const { TextDecoder, TextEncoder } = require('util')
  Object.assign(globalThis, { TextDecoder, TextEncoder })
  return jest.requireActual('viem/chains')
})

// React 18.3.0 exports `act` only as `unstable_act`; the react-dom re-export warns on every call.
const act: typeof React.act =
  (React as unknown as { act?: typeof React.act }).act ??
  (React as unknown as { unstable_act: typeof React.act }).unstable_act
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const recordWith = (record: WatcherRecord) => ({
  value: storedWatcherRecordOf(record),
  savedAt: 1
})

const OPEN: WatcherRecord = {
  reading: {
    account: ACCOUNT,
    block: { number: HEAD, timestamp: HEAD_TIME },
    hasSetup: true,
    dormant: false,
    attempt: {
      attemptId: 4n,
      setupNonce: 1n,
      payloadHash: `0x${'11'.repeat(32)}`,
      consumableAfter: HEAD_TIME + 3600,
      executionDue: false,
      newKey: NEW_KEY
    },
    deployment: DEPLOYMENT
  },
  dismissed: []
}

const sourcesOver = (
  stored: Record<string, unknown>,
  read: (key: string) => Promise<unknown> = async (key) => stored[key]
) => {
  const listeners = new Map<string, ((value: unknown) => void)[]>()
  return {
    read: jest.fn(read),
    subscribe: jest.fn((key: string, onValue: (value: unknown) => void) => {
      listeners.set(key, [...(listeners.get(key) ?? []), onValue])
      return () =>
        listeners.set(
          key,
          (listeners.get(key) ?? []).filter((l) => l !== onValue)
        )
    }),
    change: (key: string, value: unknown) => (listeners.get(key) ?? []).forEach((l) => l(value))
  }
}

let container: HTMLDivElement
let root: Root
const seen: WatchedAttemptState[] = []

const Probe = ({ sources }: { sources: ReturnType<typeof sourcesOver> }) => {
  seen.push(useWatchedAttempt(ACCOUNT, sources))
  return null
}

const mount = async (sources: ReturnType<typeof sourcesOver>) => {
  await act(async () => {
    root.render(<Probe sources={sources} />)
  })
}

const latest = () => seen[seen.length - 1]

beforeEach(() => {
  seen.length = 0
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('the watched attempt hook', () => {
  it('returns the reading of its account', async () => {
    const sources = sourcesOver({ [watcherKeyOf(SEPOLIA, ACCOUNT)]: recordWith(OPEN) })
    await mount(sources)

    expect(seen[0]).toEqual({ status: 'loading' })
    expect(latest()).toEqual({
      status: 'watched',
      reading: OPEN.reading,
      attemptDismissed: false
    })
  })

  it('reads a reading of a retired deployment as an account not polled yet', async () => {
    const retired = {
      ...OPEN,
      reading: OPEN.reading && { ...OPEN.reading, deployment: RETIRED_DEPLOYMENT }
    }
    const sources = sourcesOver({ [watcherKeyOf(SEPOLIA, ACCOUNT)]: recordWith(retired) })
    await mount(sources)

    expect(latest()).toEqual({ status: 'unwatched' })
  })

  it('reads an account the watcher has not polled as unwatched', async () => {
    await mount(sourcesOver({}))

    expect(latest()).toEqual({ status: 'unwatched' })
  })

  it('updates on a change of its key and on no other', async () => {
    const sources = sourcesOver({ [watcherKeyOf(SEPOLIA, ACCOUNT)]: recordWith(OPEN) })
    await mount(sources)
    const before = seen.length

    await act(async () => {
      sources.change(
        watcherKeyOf(SEPOLIA, OTHER_ACCOUNT),
        recordWith({ ...OPEN, failed: { at: 2, message: 'node down' } })
      )
    })
    expect(seen.length).toBe(before)

    await act(async () => {
      sources.change(
        watcherKeyOf(SEPOLIA, ACCOUNT),
        recordWith({ ...OPEN, failed: { at: 2, message: 'node down' }, dismissed: [4n] })
      )
    })
    expect(latest()).toEqual({
      status: 'watched',
      reading: OPEN.reading,
      failed: { at: 2, message: 'node down' },
      attemptDismissed: true
    })
  })

  it('keeps a change that arrived before its first read answered', async () => {
    let answer: ((value: unknown) => void) | undefined
    const sources = sourcesOver(
      {},
      () =>
        new Promise((resolve) => {
          answer = resolve
        })
    )
    await mount(sources)

    await act(async () => {
      sources.change(watcherKeyOf(SEPOLIA, ACCOUNT), recordWith(OPEN))
    })
    await act(async () => {
      answer?.(undefined)
    })

    expect(latest()).toEqual({ status: 'watched', reading: OPEN.reading, attemptDismissed: false })
  })

  it('reads a failed storage read as failed, and reads again on retry', async () => {
    let fails = true
    const sources = sourcesOver({}, async () => {
      if (fails) {
        throw new Error('storage refused')
      }
      return recordWith(OPEN)
    })
    await mount(sources)

    const failed = latest()
    expect(failed).toEqual({ status: 'failed', retry: expect.any(Function) })

    fails = false
    await act(async () => {
      if (failed.status === 'failed') {
        failed.retry()
      }
    })
    expect(sources.read).toHaveBeenCalledTimes(2)
    expect(latest()).toEqual({ status: 'watched', reading: OPEN.reading, attemptDismissed: false })
  })

  it('reads a stored value that is not a watcher record as failed, never as unwatched', async () => {
    await mount(sourcesOver({ [watcherKeyOf(SEPOLIA, ACCOUNT)]: { value: { dismissed: [4] } } }))

    expect(latest()).toEqual({ status: 'failed', retry: expect.any(Function) })
  })
})
