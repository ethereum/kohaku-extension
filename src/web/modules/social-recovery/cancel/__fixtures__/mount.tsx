/**
 * Mounts a view of the cancel in jsdom with the light theme, and a storage in
 * memory whose writes reach the watcher hook as the browser's change events
 * do.
 */
import { TextDecoder, TextEncoder } from 'util'

import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import type { ThemeProps } from '@common/styles/themeConfig'
import type { Address } from '@kohaku-eth/social-recovery'
import type {
  WatchedAttemptSources,
  WatchedAttemptState,
  WatcherReading,
  WatcherRecord,
  WatcherStorage
} from '@web/modules/social-recovery/watcher'

Object.assign(globalThis, { TextEncoder, TextDecoder })
// The spinner's animation needs a native module jsdom lacks; a plain view stands in.
jest.mock('@common/components/Spinner', () => {
  /* eslint-disable @typescript-eslint/no-var-requires, global-require */
  const mockReact: typeof import('react') = require('react')
  const { View: MockView }: typeof import('react-native') = require('react-native')
  /* eslint-enable @typescript-eslint/no-var-requires, global-require */
  return {
    __esModule: true,
    default: () => mockReact.createElement(MockView, { testID: 'spinner' })
  }
})
// React only runs effects and state updates inside act() when this flag is set.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const { createRoot }: typeof import('react-dom/client') = require('react-dom/client')
const {
  ThemeContext
}: typeof import('@common/contexts/themeContext') = require('@common/contexts/themeContext')
const themeConfig: typeof import('@common/styles/themeConfig') = require('@common/styles/themeConfig')
const i18n: typeof import('@common/config/localization').default =
  require('@common/config/localization').default
const watcher: typeof import('@web/modules/social-recovery/watcher') = require('@web/modules/social-recovery/watcher')
const {
  useWatchedAttempt
}: typeof import('@web/modules/social-recovery/watcher/useWatchedAttempt') = require('@web/modules/social-recovery/watcher/useWatchedAttempt')
const {
  useDismissed
}: typeof import('@web/modules/social-recovery/cancel/useDismissed') = require('@web/modules/social-recovery/cancel/useDismissed')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

// React 18.3.0 exports `act` only as `unstable_act`; the react-dom re-export warns on every call.
export const act: typeof React.act =
  (React as unknown as { act?: typeof React.act }).act ??
  (React as unknown as { unstable_act: typeof React.act }).unstable_act

export const t = (key: string, values?: Record<string, unknown>): string => i18n.t(key, values)

const THEME = Object.fromEntries(
  Object.entries(themeConfig.default).map(([name, byType]) => [
    name,
    byType[themeConfig.THEME_TYPES.LIGHT]
  ])
) as ThemeProps

const THEME_CONTEXT: ThemeContextReturnType = {
  theme: THEME,
  themeType: themeConfig.THEME_TYPES.LIGHT,
  selectedThemeType: themeConfig.THEME_TYPES.LIGHT,
  setThemeType: () => {}
}

/** Lets the promises and the timers at zero that a render started settle. */
export const settle = () =>
  act(async () => {
    for (let round = 0; round < 20; round += 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
    }
  })

/** What this device last read of the account, named for the test that shows it. */
export interface LastReadingCase {
  name: string
  last: WatcherReading | null
}

export interface Mounted {
  unmount: () => void
  byTestId: (id: string) => HTMLElement | null
  text: () => string
  textOf: (id: string) => string
  press: (id: string) => Promise<void>
  isDisabled: (id: string) => boolean
  render: (element: ReturnType<typeof React.createElement>) => Promise<void>
}

export const mount = async (element: ReturnType<typeof React.createElement>): Promise<Mounted> => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)
  const render = async (next: ReturnType<typeof React.createElement>) => {
    await act(async () => {
      root.render(<ThemeContext.Provider value={THEME_CONTEXT}>{next}</ThemeContext.Provider>)
    })
    await settle()
  }
  await render(element)
  return {
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
    byTestId,
    text: () => container.textContent ?? '',
    textOf: (id) => byTestId(id)?.textContent ?? '',
    press: async (id) => {
      const node = byTestId(id)
      if (!node) {
        throw new Error(`nothing to press: ${id}`)
      }
      await act(async () => {
        node.click()
      })
      await settle()
    },
    isDisabled: (id) => byTestId(id)?.getAttribute('aria-disabled') === 'true',
    render
  }
}

/** A storage in memory, its writes delivered to the hook's subscribers as change events. */
export const watchedStorage = () => {
  const entries = new Map<string, string>()
  const listeners = new Map<string, Set<(value: unknown) => void>>()
  const storage: WatcherStorage = {
    get: (async (key: string, defaultValue?: unknown) => {
      const held = entries.get(key)
      return held === undefined ? defaultValue : JSON.parse(held)
    }) as WatcherStorage['get'],
    set: async (key: string, value: unknown) => {
      entries.set(key, JSON.stringify(value))
      const parsed = JSON.parse(entries.get(key) as string)
      listeners.get(key)?.forEach((listener) => listener(parsed))
      return null
    }
  }
  const sources: WatchedAttemptSources = {
    read: (key) => storage.get(key),
    subscribe: (key, onValue) => {
      const set = listeners.get(key) ?? new Set()
      set.add(onValue)
      listeners.set(key, set)
      return () => {
        set.delete(onValue)
      }
    }
  }
  return { storage, sources }
}

export type WatchedStorage = ReturnType<typeof watchedStorage>

/** Writes the record of one account, as the watcher's poll does, and lets a mounted view follow it. */
export const storeRecord = async (
  { storage }: WatchedStorage,
  chainId: number,
  account: Address,
  record: WatcherRecord
) => {
  await act(async () => {
    await watcher.updateWatcherRecord(storage, chainId, account, () => record)
  })
}

/** The hooks the banner reads the records through, over one storage. */
export const hooksOver = ({ storage, sources }: WatchedStorage) => ({
  useAttempt: (account: Address): WatchedAttemptState => useWatchedAttempt(account, sources),
  useDismissed: (account: Address, state: WatchedAttemptState) =>
    useDismissed(account, state, storage)
})
