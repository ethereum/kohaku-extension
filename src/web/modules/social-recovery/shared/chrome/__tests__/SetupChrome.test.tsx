/**
 * @jest-environment jsdom
 *
 * The setup chrome mounted with the app's own components and the real en.json.
 * The settings sidebar and the logo are stubs: the sidebar reads the wallet's
 * controllers, and Jest does not load the logo's image.
 */
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { Text, View } from 'react-native'

import i18n from '@common/config/localization'
import { ThemeContext } from '@common/contexts/themeContext'
import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import themeConfig, { THEME_TYPES } from '@common/styles/themeConfig'
import type { ThemeProps } from '@common/styles/themeConfig'
import SetupChrome from '@web/modules/social-recovery/shared/chrome/SetupChrome'

// React only runs effects and state updates inside act() when this flag is set.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

jest.mock('@web/modules/settings/components/Sidebar', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock('@common/components/AmbireLogoHorizontal', () => ({
  __esModule: true,
  default: () => null
}))

const THEME = Object.fromEntries(
  Object.entries(themeConfig).map(([name, byType]) => [name, byType[THEME_TYPES.LIGHT]])
) as ThemeProps

const THEME_CONTEXT: ThemeContextReturnType = {
  theme: THEME,
  themeType: THEME_TYPES.LIGHT,
  selectedThemeType: THEME_TYPES.LIGHT,
  setThemeType: () => {}
}

const BREADCRUMB = i18n.t('socialRecovery.chrome.breadcrumb')

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const mount = (element: React.ReactElement) =>
  act(() => {
    root.render(<ThemeContext.Provider value={THEME_CONTEXT}>{element}</ThemeContext.Provider>)
  })

const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)

describe('the setup chrome', () => {
  it('shows the breadcrumb above the view it holds', () => {
    mount(
      <SetupChrome testID="chrome">
        <Text testID="view">The view</Text>
      </SetupChrome>
    )
    expect(BREADCRUMB).not.toBe('')
    expect(byTestId('view')).not.toBeNull()
    // The breadcrumb comes first in the document, then the view.
    expect(byTestId('chrome')?.textContent).toBe(`${BREADCRUMB}The view`)
  })

  it('puts its test id on its outermost element, with the view inside it', () => {
    mount(
      <SetupChrome testID="chrome">
        <View testID="view" />
      </SetupChrome>
    )
    const chrome = byTestId('chrome')
    expect(container.firstElementChild).toBe(chrome)
    expect(chrome?.contains(byTestId('view'))).toBe(true)
  })

  it('shows the breadcrumb when it holds no view', () => {
    mount(<SetupChrome testID="chrome">{false}</SetupChrome>)
    expect(byTestId('chrome')?.textContent).toBe(BREADCRUMB)
  })
})
