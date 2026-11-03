/**
 * @jest-environment jsdom
 *
 * The module's text field: a focused field draws neutral colours in both
 * themes, never the wallet's accent red, while a field with an error or one
 * marked valid keeps the wallet input's own colours. A field disabled while
 * focused keeps the neutral colours.
 */
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { View } from 'react-native'

import { ThemeContext } from '@common/contexts/themeContext'
import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import themeConfig, { THEME_TYPES } from '@common/styles/themeConfig'
import type { ThemeProps } from '@common/styles/themeConfig'
import { FieldInput } from '@web/modules/social-recovery/shared/chrome'

// React only runs effects and state updates inside act() when this flag is set.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const themeOf = (type: THEME_TYPES.LIGHT | THEME_TYPES.DARK) =>
  Object.fromEntries(
    Object.entries(themeConfig).map(([name, byType]) => [name, byType[type]])
  ) as ThemeProps

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

const contextOf = (type: THEME_TYPES.LIGHT | THEME_TYPES.DARK): ThemeContextReturnType => ({
  theme: themeOf(type),
  themeType: type,
  selectedThemeType: type,
  setThemeType: () => {}
})

const mount = (type: THEME_TYPES.LIGHT | THEME_TYPES.DARK, element: React.ReactElement) => {
  const context = contextOf(type)
  act(() => {
    root.render(<ThemeContext.Provider value={context}>{element}</ThemeContext.Provider>)
  })
}

const field = () => {
  const node = container.querySelector<HTMLInputElement>('[data-testid="field"]')
  if (!node) {
    throw new Error('no field drawn')
  }
  return node
}

/** The field's own border and the ring around it, as the page draws them. */
const borders = () => {
  const inner = field().parentElement?.parentElement
  const outer = inner?.parentElement
  if (!inner || !outer) {
    throw new Error('no field borders')
  }
  return { inner: inner.style.borderTopColor, outer: outer.style.borderTopColor }
}

/** A colour as the page writes it into an element's style. */
const asRendered = (colour: unknown): string => {
  const probe = document.createElement('div')
  const probeRoot = createRoot(probe)
  act(() => probeRoot.render(<View style={{ borderTopColor: colour as string }} />))
  const rendered = (probe.firstElementChild as HTMLElement | null)?.style.borderTopColor ?? ''
  act(() => probeRoot.unmount())
  return rendered
}

const focus = () => act(() => field().focus())
const blur = () => act(() => field().blur())

;(
  [
    ['light', THEME_TYPES.LIGHT],
    ['dark', THEME_TYPES.DARK]
  ] as const
).forEach(([name, type]) =>
  describe(`a field in the ${name} theme`, () => {
    const theme = themeOf(type)

    it('draws its focus in the primary colour and a neutral ring, never the accent red', () => {
      mount(type, <FieldInput testID="field" value="" onChangeText={() => {}} />)
      const resting = borders()
      focus()
      const focused = borders()
      expect(focused).toEqual({
        inner: asRendered(theme.primary),
        outer: asRendered(theme.primaryBorder)
      })
      expect([focused.inner, focused.outer]).not.toContain(asRendered(theme.linkText))
      expect([focused.inner, focused.outer]).not.toContain(asRendered(theme.errorDecorative))
      blur()
      expect(borders()).toEqual(resting)
    })

    it('keeps the error colours of a field with an error, focused or not', () => {
      mount(type, <FieldInput testID="field" value="" error="Wrong" onChangeText={() => {}} />)
      const errorBorders = {
        inner: asRendered(theme.errorDecorative),
        outer: asRendered(theme.errorBackground)
      }
      expect(borders()).toEqual(errorBorders)
      focus()
      expect(borders()).toEqual(errorBorders)
      expect(container.textContent).toContain('Wrong')
    })

    it('keeps the neutral focus colours when a focused field becomes disabled', () => {
      mount(type, <FieldInput testID="field" value="" onChangeText={() => {}} />)
      focus()
      const neutral = {
        inner: asRendered(theme.primary),
        outer: asRendered(theme.primaryBorder)
      }
      expect(borders()).toEqual(neutral)
      mount(type, <FieldInput testID="field" value="" disabled onChangeText={() => {}} />)
      expect(borders()).toEqual(neutral)
      expect([borders().inner, borders().outer]).not.toContain(asRendered(theme.linkText))
    })

    it('keeps the valid colours of a field marked valid while it is focused', () => {
      mount(type, <FieldInput testID="field" value="" isValid onChangeText={() => {}} />)
      focus()
      expect(borders()).toEqual({
        inner: asRendered(theme.successDecorative),
        outer: asRendered(theme.successBackground)
      })
    })
  })
)

describe('a field', () => {
  it('hands its focus and its blur to the handlers it is given', () => {
    const onFocus = jest.fn()
    const onBlur = jest.fn()
    mount(
      THEME_TYPES.LIGHT,
      <FieldInput testID="field" value="" onFocus={onFocus} onBlur={onBlur} />
    )
    focus()
    expect(onFocus).toHaveBeenCalledTimes(1)
    expect(onBlur).not.toHaveBeenCalled()
    blur()
    expect(onBlur).toHaveBeenCalledTimes(1)
  })

  it('lets the colours it is given win over its own focus', () => {
    const theme = themeOf(THEME_TYPES.LIGHT)
    mount(
      THEME_TYPES.LIGHT,
      <FieldInput
        testID="field"
        value=""
        inputWrapperStyle={{ borderColor: theme.successDecorative as string }}
        borderWrapperStyle={{ borderColor: theme.successBackground as string }}
      />
    )
    focus()
    expect(borders()).toEqual({
      inner: asRendered(theme.successDecorative),
      outer: asRendered(theme.successBackground)
    })
  })
})
