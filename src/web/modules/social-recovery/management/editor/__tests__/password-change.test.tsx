/**
 * @jest-environment jsdom
 *
 * The change of the recovery password mounted with the app's own components
 * and the real en.json. jsdom has no `TextEncoder`, which viem reads when it
 * loads, so the test sets Node's before it loads the modules.
 */
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { TextDecoder, TextEncoder } from 'util'

import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import type { ThemeProps } from '@common/styles/themeConfig'

Object.assign(globalThis, { TextEncoder, TextDecoder })
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const i18n: typeof import('@common/config/localization').default =
  require('@common/config/localization').default
const {
  ThemeContext
}: typeof import('@common/contexts/themeContext') = require('@common/contexts/themeContext')
const themeConfig: typeof import('@common/styles/themeConfig') = require('@common/styles/themeConfig')
const PasswordChange: typeof import('@web/modules/social-recovery/management/editor/PasswordChange').default =
  require('@web/modules/social-recovery/management/editor/PasswordChange').default
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

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

describe('the change of the recovery password', () => {
  let container: HTMLDivElement
  let root: Root

  const inputOf = (id: string) => {
    const node = container.querySelector<HTMLInputElement>(`input[data-testid="${id}"]`)
    if (!node) {
      throw new Error(`no field: ${id}`)
    }
    return node
  }

  beforeEach(async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root.render(
        <ThemeContext.Provider value={THEME_CONTEXT}>
          <PasswordChange onDone={() => {}} onCancel={() => {}} />
        </ThemeContext.Provider>
      )
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('shows what each password field takes before anything is typed', () => {
    expect(inputOf('manage-password-field').placeholder).toBe(
      i18n.t('socialRecovery.management.editor.password.fieldPlaceholder')
    )
    expect(inputOf('manage-password-confirm').placeholder).toBe(
      i18n.t('socialRecovery.management.editor.password.confirmPlaceholder')
    )
  })
})
