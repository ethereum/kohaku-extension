/**
 * @jest-environment jsdom
 *
 * Mounts a step view with the app's own components, the real en.json and real
 * records on an in-memory double of the extension's storage helper. Nothing is
 * mocked. jsdom has no `TextEncoder`, which viem reads when it loads, so the
 * harness sets Node's before it loads the modules.
 */
import type { ComponentType } from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { TextDecoder, TextEncoder } from 'util'

import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import type { ThemeProps } from '@common/styles/themeConfig'
import type { Address, SetupDraft } from '@web/modules/social-recovery/sdk-interfaces'
import type { StepViewProps } from '@web/modules/social-recovery/setup/privacy'
import type { RecordStorage, WalletRecords } from '@web/modules/social-recovery/shared/records'

Object.assign(globalThis, { TextEncoder, TextDecoder })
// React only runs effects and state updates inside act() when this flag is set.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const {
  parse,
  stringify
}: typeof import('@ambire-common/libs/richJson/richJson') = require('@ambire-common/libs/richJson/richJson')
const {
  ThemeContext
}: typeof import('@common/contexts/themeContext') = require('@common/contexts/themeContext')
const themeConfig: typeof import('@common/styles/themeConfig') = require('@common/styles/themeConfig')
const {
  createWalletRecords
}: typeof import('@web/modules/social-recovery/shared/records') = require('@web/modules/social-recovery/shared/records')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

export const CHAIN_ID = 11155111
export const ACCOUNT: Address = '0x1111111111111111111111111111111111111111'

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

export interface StorageFaults {
  get?: boolean
  remove?: boolean
  set?: number
  records?: string[]
  held?: Promise<void>
}

// Switches a test flips to make the storage refuse: `get` and `remove` while
// on, `set` for the next number of writes, and every write and removal of the
// records named in `records` while they are listed. A write or removal of
// several keys counts as one and lands whole or not at all. While `held` is
// set, every read waits for it to settle.
export const makeStorage = (faults: StorageFaults = {}): RecordStorage => {
  const raw = new Map<string, string>()
  const refuses = (key: string) => (faults.records ?? []).some((name) => key.includes(`:${name}:`))
  const refuseWrite = (keys: string[]) => {
    if (faults.set) {
      // eslint-disable-next-line no-param-reassign
      faults.set -= 1
      throw new Error('storage full')
    }
    if (keys.some(refuses)) {
      throw new Error('storage full')
    }
  }
  const refuseRemoval = (keys: string[]) => {
    if (faults.remove || keys.some(refuses)) {
      throw new Error('storage unavailable')
    }
  }
  const store = (key: string, value: unknown) =>
    raw.set(key, typeof value === 'string' ? value : stringify(value))
  return {
    get: async (key, defaultValue) => {
      await faults.held
      if (faults.get) {
        throw new Error('storage unavailable')
      }
      const stored = key && raw.get(key)
      return stored ? parse(stored) : defaultValue
    },
    getAll: async () =>
      Object.fromEntries([...raw.entries()].map(([key, stored]) => [key, parse(stored)])),
    set: async (key, value) => {
      refuseWrite([key])
      store(key, value)
      return null
    },
    remove: async (key) => {
      refuseRemoval([key])
      raw.delete(key)
      return null
    },
    setEntries: async (entries) => {
      refuseWrite(Object.keys(entries))
      Object.entries(entries).forEach(([key, value]) => store(key, value))
    },
    removeKeys: async (keys) => {
      refuseRemoval(keys)
      keys.forEach((key) => raw.delete(key))
    }
  }
}

// Holds every read of the storage from now on; the returned function lets
// them through and waits until the view has taken in what they read.
export const holdReads = (faults: StorageFaults): (() => Promise<void>) => {
  let release = () => {}
  // eslint-disable-next-line no-param-reassign
  faults.held = new Promise<void>((resolve) => {
    release = resolve
  })
  return async () => {
    await act(async () => {
      release()
    })
  }
}

export const recordsOn = (faults: StorageFaults = {}): WalletRecords =>
  createWalletRecords({ storage: makeStorage(faults) })

export const draftOf = (overrides: Partial<SetupDraft> = {}): SetupDraft => ({
  wait: 172800n,
  clauses: [],
  ignoresPause: true,
  privacy: { backup: 'encrypted', publicMetadata: '0x' },
  ...overrides
})

export interface Harness {
  navigate: jest.Mock
  mount: (records: WalletRecords) => Promise<void>
  unmount: () => void
  byTestId: (id: string) => HTMLElement | null
  inputOf: (id: string) => HTMLInputElement | null
  text: () => string
  press: (id: string) => Promise<void>
  type: (id: string, value: string) => Promise<void>
  isDisabled: (id: string) => boolean
}

export const harnessOf = (View: ComponentType<StepViewProps>): Harness => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  const navigate = jest.fn()

  const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)

  // An input carries its test id itself, or holds the input that does.
  const inputOf = (id: string) => {
    const node = byTestId(id)
    if (!node) {
      return null
    }
    return node instanceof HTMLInputElement ? node : node.querySelector('input')
  }

  return {
    navigate,
    mount: async (records) => {
      await act(async () => {
        root.render(
          <ThemeContext.Provider value={THEME_CONTEXT}>
            <View records={records} chainId={CHAIN_ID} account={ACCOUNT} navigate={navigate} />
          </ThemeContext.Provider>
        )
      })
    },
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
    byTestId,
    inputOf,
    text: () => container.textContent ?? '',
    press: async (id) => {
      const node = byTestId(id)
      if (!node) {
        throw new Error(`nothing to press: ${id}`)
      }
      await act(async () => {
        node.click()
      })
    },
    type: async (id, value) => {
      const input = inputOf(id)
      if (!input) {
        throw new Error(`nothing to type into: ${id}`)
      }
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      await act(async () => {
        setValue?.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
    },
    isDisabled: (id) => byTestId(id)?.getAttribute('aria-disabled') === 'true'
  }
}

// Registered only when Jest runs this file itself: a suite that imports the
// harness does not run its checks again.
const runningHarnessItself = expect.getState().testPath === __filename

const describeHarness = runningHarnessItself ? describe : () => undefined

describeHarness('the step view harness', () => {
  it('round-trips a waiting period and a draft through the storage double', async () => {
    const setup = recordsOn().setup(CHAIN_ID, ACCOUNT)
    await setup.waitingPeriod.write(172800n)
    await setup.setupDraft.write(draftOf({ wait: 86400n }))
    const wait = await setup.waitingPeriod.read()
    const draft = await setup.setupDraft.read()
    expect(wait.status === 'present' && wait.value).toBe(172800n)
    expect(draft.status === 'present' && draft.value).toEqual(draftOf({ wait: 86400n }))
  })

  it('refuses the given number of writes, then stores', async () => {
    const setup = recordsOn({ set: 1 }).setup(CHAIN_ID, ACCOUNT)
    await expect(setup.waitingPeriod.write(86400n)).rejects.toThrow()
    await setup.waitingPeriod.write(86400n)
    expect((await setup.waitingPeriod.read()).status).toBe('present')
  })
})
