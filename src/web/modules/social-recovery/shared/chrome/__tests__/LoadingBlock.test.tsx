/**
 * @jest-environment jsdom
 *
 * The waiting block and the refreshing line, mounted with the app's own text
 * and theme.
 */
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import i18n from '@common/config/localization'
import { ThemeContext } from '@common/contexts/themeContext'
import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import themeConfig, { THEME_TYPES } from '@common/styles/themeConfig'
import type { ThemeProps } from '@common/styles/themeConfig'
import LoadingBlock from '@web/modules/social-recovery/shared/chrome/LoadingBlock'
import RefreshingLine from '@web/modules/social-recovery/shared/chrome/RefreshingLine'
import type { LoadingVariant } from '@web/modules/social-recovery/shared/chrome/types'

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
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const themeOf = (type: THEME_TYPES.LIGHT | THEME_TYPES.DARK) =>
  Object.fromEntries(
    Object.entries(themeConfig).map(([name, byType]) => [name, byType[type]])
  ) as ThemeProps

const contextOf = (type: THEME_TYPES.LIGHT | THEME_TYPES.DARK): ThemeContextReturnType => ({
  theme: themeOf(type),
  themeType: type,
  selectedThemeType: type,
  setThemeType: () => {}
})

const THEME_CONTEXT = contextOf(THEME_TYPES.LIGHT)

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

const mount = (element: React.ReactElement, context: ThemeContextReturnType = THEME_CONTEXT) =>
  act(() => {
    root.render(<ThemeContext.Provider value={context}>{element}</ThemeContext.Provider>)
  })

/** A colour as the browser writes it once it has parsed it. */
const parsedColour = (value: string) => {
  const probe = document.createElement('span')
  probe.style.color = value
  return probe.style.color
}

const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)

const VARIANTS: LoadingVariant[] = ['screen', 'block', 'row']

describe('the waiting block', () => {
  VARIANTS.forEach((variant) => {
    it(`shows the spinner and the message in the ${variant} variant`, () => {
      mount(<LoadingBlock variant={variant} message="Reading your accounts…" />)

      const block = byTestId(`loading-${variant}`)
      expect(block).not.toBeNull()
      expect(block?.querySelector('[data-testid="spinner"]')).not.toBeNull()
      expect(block?.querySelector('[data-testid="loading-message"]')?.textContent).toBe(
        'Reading your accounts…'
      )
    })
  })

  it('fills its container and centres both ways in the screen variant', () => {
    mount(<LoadingBlock variant="screen" message="Opening this recovery…" />)

    const style = getComputedStyle(byTestId('loading-screen') as HTMLElement)
    expect(style.flexGrow).toBe('1')
    expect(style.justifyContent).toBe('center')
    expect(style.alignItems).toBe('center')
  })

  it('centres across its card without filling it in the block variant', () => {
    mount(<LoadingBlock variant="block" message="Checking the path against the chain…" />)

    const style = getComputedStyle(byTestId('loading-block') as HTMLElement)
    expect(style.alignItems).toBe('center')
    expect(style.flexGrow).not.toBe('1')
  })

  it('puts the spinner before the message on one line in the row variant', () => {
    mount(<LoadingBlock variant="row" message="Checking the fee…" />)

    const row = byTestId('loading-row') as HTMLElement
    expect(getComputedStyle(row).flexDirection).toBe('row')
    const children = Array.from(row.children)
    expect(children).toHaveLength(2)
    expect(children[0].getAttribute('data-testid')).toBe('spinner')
    expect(children[1].getAttribute('data-testid')).toBe('loading-message')
  })
})

describe('the colour of the waiting line', () => {
  const THEMES = [THEME_TYPES.LIGHT, THEME_TYPES.DARK] as const
  THEMES.forEach((type) => {
    const context = contextOf(type)
    VARIANTS.forEach((variant) => {
      it(`draws the line in the primary text colour in the ${variant} variant, ${type} theme`, () => {
        mount(<LoadingBlock variant={variant} message="Reading your accounts…" />, context)

        const line = byTestId(`loading-${variant}`)?.querySelector<HTMLElement>(
          '[data-testid="loading-message"]'
        )
        if (!line) {
          throw new Error('the block drew no line')
        }
        const colour = getComputedStyle(line).color
        expect(colour).toBe(parsedColour(String(context.theme.primaryText)))
        expect(colour).not.toBe(parsedColour(String(context.theme.secondaryText)))
      })
    })
  })

  it('draws the refreshing line in the primary text colour', () => {
    mount(<RefreshingLine />)

    const line = byTestId('loading-message') as HTMLElement
    expect(getComputedStyle(line).color).toBe(parsedColour(String(THEME_CONTEXT.theme.primaryText)))
  })
})

describe('the refreshing line', () => {
  it('says the screen refreshes when it is given no key', () => {
    mount(<RefreshingLine />)

    expect(byTestId('loading-row')).not.toBeNull()
    expect(byTestId('loading-message')?.textContent).toBe(
      i18n.t('socialRecovery.loading.refreshing')
    )
    expect(byTestId('loading-message')?.textContent).toBe('Refreshing…')
  })

  it('shows the line of the key it is given', () => {
    mount(<RefreshingLine messageKey="socialRecovery.loading.refreshingSetup" />)

    expect(byTestId('loading-message')?.textContent).toBe('Refreshing the setup from the chain…')
  })
})
