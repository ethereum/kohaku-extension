/**
 * @jest-environment jsdom
 *
 * The ask mounted with the app's own components and the real en.json, over a
 * keystore state the test pushes and a dispatch it records. jsdom has no
 * `TextEncoder`, which viem reads when it loads, so the test sets Node's
 * before it loads the modules.
 */
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { TextDecoder, TextEncoder } from 'util'

import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import type { ThemeProps } from '@common/styles/themeConfig'

Object.assign(globalThis, { TextEncoder, TextDecoder })
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mockDispatch = jest.fn()
// The keystore's state as an external store, so a push re-renders the ask.
const mockKeystore = {
  current: { statuses: { unlockWithSecret: 'INITIAL' }, errorMessage: '' },
  listeners: new Set<() => void>()
}
jest.mock('@web/hooks/useBackgroundService', () => ({
  __esModule: true,
  default: () => ({ dispatch: mockDispatch })
}))
jest.mock('@web/hooks/useKeystoreControllerState', () => {
  const R = jest.requireActual('react')
  const subscribe = (listener: () => void) => {
    mockKeystore.listeners.add(listener)
    return () => mockKeystore.listeners.delete(listener)
  }
  return {
    __esModule: true,
    default: () => R.useSyncExternalStore(subscribe, () => mockKeystore.current)
  }
})

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const en: typeof import('@common/config/localization/translations/en.json') = require('@common/config/localization/translations/en.json')
const {
  ThemeContext
}: typeof import('@common/contexts/themeContext') = require('@common/contexts/themeContext')
const themeConfig: typeof import('@common/styles/themeConfig') = require('@common/styles/themeConfig')
const ExtensionPasswordAsk: typeof import('@web/modules/social-recovery/setup/card/ExtensionPasswordAsk').default =
  require('@web/modules/social-recovery/setup/card/ExtensionPasswordAsk').default
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const S = en.socialRecovery
const RESET = { type: 'KEYSTORE_CONTROLLER_RESET_ERROR_STATE' }
const KEYSTORE_ERROR = 'Incorrect password. Please try again.'

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

describe('the extension password ask', () => {
  let container: HTMLDivElement
  let root: Root
  let onConfirmed: jest.Mock
  let onCancel: jest.Mock

  const render = async () => {
    await act(async () => {
      root.render(
        <ThemeContext.Provider value={THEME_CONTEXT}>
          <ExtensionPasswordAsk onConfirmed={onConfirmed} onCancel={onCancel} />
        </ThemeContext.Provider>
      )
    })
  }

  // The keystore pushes a new state; the ask re-renders with it.
  const keystoreSays = async (unlockWithSecret: string, errorMessage = '') => {
    await act(async () => {
      mockKeystore.current = { statuses: { unlockWithSecret }, errorMessage }
      mockKeystore.listeners.forEach((listener) => listener())
    })
  }

  const input = () => {
    const node = container.querySelector<HTMLInputElement>('input')
    if (!node) {
      throw new Error('no password field')
    }
    return node
  }
  const type = async (value: string) => {
    const node = input()
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(node, value)
      node.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  const enter = async () => {
    await act(async () => {
      input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
  }
  const press = async (id: string) => {
    const node = container.querySelector<HTMLElement>(`[data-testid="${id}"]`)
    if (!node) {
      throw new Error(`nothing to press: ${id}`)
    }
    await act(async () => {
      node.click()
    })
  }
  const unlocks = () =>
    mockDispatch.mock.calls.filter(
      ([action]) => action.type === 'KEYSTORE_CONTROLLER_UNLOCK_WITH_SECRET'
    )

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    onConfirmed = jest.fn()
    onCancel = jest.fn()
    mockDispatch.mockClear()
    mockKeystore.current = { statuses: { unlockWithSecret: 'INITIAL' }, errorMessage: '' }
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('clears an error an earlier unlock left behind when it opens, and never shows it', async () => {
    mockKeystore.current = {
      statuses: { unlockWithSecret: 'INITIAL' },
      errorMessage: KEYSTORE_ERROR
    }
    await render()
    expect(mockDispatch.mock.calls[0]).toEqual([RESET])
    expect(container.textContent).not.toContain(KEYSTORE_ERROR)
    expect(container.textContent).not.toContain(S.card.wrongPassword)
  })

  it('leads with the line that a new download, print or hand-off asks the extension password', async () => {
    await render()
    expect(container.textContent?.startsWith(S.card.carrierAsks)).toBe(true)
  })

  it('sends one unlock on Enter and ignores Enter while the unlock runs', async () => {
    await render()
    await type('hunter22')
    await enter()
    expect(unlocks()).toEqual([
      [
        {
          type: 'KEYSTORE_CONTROLLER_UNLOCK_WITH_SECRET',
          params: { secretId: 'password', secret: 'hunter22' }
        }
      ]
    ])
    await keystoreSays('LOADING')
    await enter()
    await press('card-password-confirm')
    expect(unlocks()).toHaveLength(1)
  })

  it('sends nothing on Enter while another unlock runs', async () => {
    await render()
    await keystoreSays('LOADING')
    await type('hunter22')
    await enter()
    expect(unlocks()).toHaveLength(0)
  })

  it('sends again when the unlock it sent ends with neither a success nor an error', async () => {
    await render()
    await type('hunter22')
    await enter()
    await keystoreSays('LOADING')
    await keystoreSays('INITIAL')
    expect(onConfirmed).not.toHaveBeenCalled()
    expect(container.textContent).not.toContain(S.card.wrongPassword)
    await enter()
    expect(unlocks()).toHaveLength(2)
    await keystoreSays('SUCCESS')
    expect(onConfirmed).toHaveBeenCalledTimes(1)
  })

  it('confirms when the unlock it sent succeeds', async () => {
    await render()
    await type('hunter22')
    await enter()
    expect(onConfirmed).not.toHaveBeenCalled()
    await keystoreSays('SUCCESS')
    expect(onConfirmed).toHaveBeenCalledTimes(1)
  })

  it('does not confirm on a success it did not send', async () => {
    mockKeystore.current = { statuses: { unlockWithSecret: 'SUCCESS' }, errorMessage: '' }
    await render()
    expect(onConfirmed).not.toHaveBeenCalled()
  })

  it('says the password is wrong in its own words when the unlock fails, until the holder types', async () => {
    await render()
    await type('wrong-one')
    await enter()
    await keystoreSays('INITIAL', KEYSTORE_ERROR)
    expect(container.textContent).toContain(S.card.wrongPassword)
    expect(container.textContent).not.toContain(KEYSTORE_ERROR)
    expect(onConfirmed).not.toHaveBeenCalled()

    mockDispatch.mockClear()
    await type('wrong-one2')
    expect(mockDispatch).toHaveBeenCalledWith(RESET)
    expect(container.textContent).not.toContain(S.card.wrongPassword)
  })

  it('resets the keystore error on cancel and answers cancel', async () => {
    await render()
    mockDispatch.mockClear()
    await press('card-password-cancel')
    expect(mockDispatch).toHaveBeenCalledWith(RESET)
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(unlocks()).toHaveLength(0)
  })
})
