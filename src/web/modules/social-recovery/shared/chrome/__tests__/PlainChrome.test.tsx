/**
 * @jest-environment jsdom
 *
 * The chrome of a surface outside settings, mounted with the app's own
 * components and the real en.json. The logo is a stub: Jest does not load its
 * image.
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
import PlainChrome from '@web/modules/social-recovery/shared/chrome/PlainChrome'

// React only runs effects and state updates inside act() when this flag is set.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

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

const TITLE = i18n.t('socialRecovery.routes.recover')
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

describe('the plain chrome', () => {
  it('shows its title above the view it holds, and no breadcrumb', () => {
    mount(
      <PlainChrome testID="chrome" title={TITLE}>
        <Text testID="view">The view</Text>
      </PlainChrome>
    )
    expect(TITLE).not.toBe('')
    expect(byTestId('view')).not.toBeNull()
    // The title comes first in the document, then the view.
    expect(byTestId('chrome')?.textContent).toBe(`${TITLE}The view`)
    expect(byTestId('chrome')?.textContent).not.toContain(BREADCRUMB)
  })

  it('shows the view alone under a header with no title', () => {
    mount(
      <PlainChrome testID="chrome">
        <Text>The view</Text>
      </PlainChrome>
    )
    expect(byTestId('chrome')?.textContent).toBe('The view')
  })

  it('puts its test id on its outermost element, with the view inside it', () => {
    mount(
      <PlainChrome testID="chrome" title={TITLE}>
        <View testID="view" />
      </PlainChrome>
    )
    const chrome = byTestId('chrome')
    expect(container.firstElementChild).toBe(chrome)
    expect(chrome?.contains(byTestId('view'))).toBe(true)
  })
})
