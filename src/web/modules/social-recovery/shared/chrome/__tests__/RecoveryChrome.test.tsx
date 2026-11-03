/**
 * @jest-environment jsdom
 *
 * The chrome a recovery screen draws by its route, mounted with the app's own
 * components and the real en.json. The settings sidebar and the logo are
 * stubs: the sidebar reads the wallet's controllers, and Jest does not load
 * the logo's image.
 */
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { Text } from 'react-native'

import i18n from '@common/config/localization'
import { ThemeContext } from '@common/contexts/themeContext'
import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import themeConfig, { THEME_TYPES } from '@common/styles/themeConfig'
import type { ThemeProps } from '@common/styles/themeConfig'
import {
  RECOVERY_STAGE_COUNTER_KEY,
  RECOVERY_STAGES
} from '@web/modules/social-recovery/shared/chrome/constants'
import RecoveryChrome from '@web/modules/social-recovery/shared/chrome/RecoveryChrome'

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
// A recovery leaves the setup tab's account alone, so no notice shows.
jest.mock('@web/modules/social-recovery/shared/chrome/useSetupAccount')
jest.mock('@web/modules/social-recovery/shared/chrome/OtherAccountNotice', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock('@common/hooks/useNavigation', () => ({
  __esModule: true,
  default: () => ({ navigate: () => {} })
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

const TITLE_KEY = 'socialRecovery.routes.recover'
const TITLE = i18n.t(TITLE_KEY)
const BREADCRUMB = i18n.t('socialRecovery.chrome.breadcrumb')
const COUNTER = i18n.t(RECOVERY_STAGE_COUNTER_KEY, { step: 2, total: RECOVERY_STAGES })

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

describe('the recovery chrome', () => {
  it('on the fresh install shows the title, then the stage counter, then the view, and no breadcrumb', () => {
    mount(
      <RecoveryChrome
        route="fresh-install"
        titleKey={TITLE_KEY}
        stage={{ step: 2, testID: 'stage' }}
        testID="chrome"
      >
        <Text>The view</Text>
      </RecoveryChrome>
    )
    expect(COUNTER).toContain('2')
    expect(byTestId('chrome')?.textContent).toBe(`${TITLE}${COUNTER}The view`)
    expect(byTestId('stage')).not.toBeNull()
    expect(byTestId('chrome')?.textContent).not.toContain(BREADCRUMB)
  })

  it('on the logged-in route shows the breadcrumb, then the same stage counter, then the view', () => {
    mount(
      <RecoveryChrome
        route="logged-in"
        titleKey={TITLE_KEY}
        stage={{ step: 2, testID: 'stage' }}
        testID="chrome"
      >
        <Text>The view</Text>
      </RecoveryChrome>
    )
    expect(byTestId('chrome')?.textContent).toBe(`${BREADCRUMB}${COUNTER}The view`)
    expect(byTestId('chrome')?.textContent).not.toContain(TITLE)
  })

  it('shows no counter on either route when the screen gives no stage', () => {
    mount(
      <RecoveryChrome route="fresh-install" titleKey={TITLE_KEY} testID="chrome">
        <Text>The view</Text>
      </RecoveryChrome>
    )
    expect(byTestId('chrome')?.textContent).toBe(`${TITLE}The view`)

    mount(
      <RecoveryChrome route={null} titleKey={TITLE_KEY} testID="chrome">
        <Text>The view</Text>
      </RecoveryChrome>
    )
    expect(byTestId('chrome')?.textContent).toBe(`${BREADCRUMB}The view`)
  })
})
