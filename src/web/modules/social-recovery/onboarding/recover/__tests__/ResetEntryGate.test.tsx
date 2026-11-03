/**
 * @jest-environment jsdom
 *
 * The warning in front of an entry the wallet already has. The entry is a
 * probe that records each render and each run of its mount effect, so the
 * test sees whether any of its content existed before the holder passed.
 */
import React, { useEffect } from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { TextInput } from 'react-native'

import { ThemeContext } from '@common/contexts/themeContext'
import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import themeConfig, { THEME_TYPES } from '@common/styles/themeConfig'
import type { ThemeProps } from '@common/styles/themeConfig'
import ResetEntryGate from '@web/modules/social-recovery/onboarding/recover/ResetEntryGate'

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

const renders = jest.fn()
const effects = jest.fn()

const Entry = () => {
  renders()
  useEffect(() => {
    effects()
  }, [])
  return <TextInput testID="entry-field" />
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  renders.mockClear()
  effects.mockClear()
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const mount = (onLeave: () => void = () => {}) =>
  act(() => {
    root.render(
      <ThemeContext.Provider value={THEME_CONTEXT}>
        <ResetEntryGate onLeave={onLeave}>
          <Entry />
        </ResetEntryGate>
      </ThemeContext.Provider>
    )
  })

const unmount = () =>
  act(() => {
    root.render(<ThemeContext.Provider value={THEME_CONTEXT}>{null}</ThemeContext.Provider>)
  })

const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)

const press = (id: string) => {
  const node = byTestId(id)
  if (!node) {
    throw new Error(`nothing to press: ${id}`)
  }
  act(() => {
    node.click()
  })
}

const pass = () => {
  press('recovery-warning-acknowledge')
  press('recovery-warning-continue')
}

describe('the warning in front of a reset entry', () => {
  it('mounts none of the entry before the acknowledgment', () => {
    mount()

    expect(byTestId('recovery-warning')).not.toBeNull()
    expect(byTestId('entry-field')).toBeNull()
    expect(renders).not.toHaveBeenCalled()
    expect(effects).not.toHaveBeenCalled()
  })

  it('mounts none of the entry after the acknowledgment alone', () => {
    mount()
    press('recovery-warning-acknowledge')

    expect(byTestId('entry-field')).toBeNull()
    expect(renders).not.toHaveBeenCalled()
    expect(effects).not.toHaveBeenCalled()
  })

  it('mounts none of the entry on a press of continue before the acknowledgment', () => {
    mount()
    press('recovery-warning-continue')

    expect(byTestId('recovery-warning')).not.toBeNull()
    expect(byTestId('entry-field')).toBeNull()
    expect(effects).not.toHaveBeenCalled()
  })

  it('mounts the entry once, in place of the warning, after the acknowledgment and continue', () => {
    mount()
    pass()

    expect(byTestId('entry-field')).not.toBeNull()
    expect(byTestId('recovery-warning')).toBeNull()
    expect(effects).toHaveBeenCalledTimes(1)
  })

  it('takes the acknowledgment again when the entry opens again', () => {
    mount()
    pass()
    expect(effects).toHaveBeenCalledTimes(1)

    unmount()
    mount()

    expect(byTestId('entry-field')).toBeNull()
    expect(byTestId('recovery-warning-continue')?.getAttribute('aria-disabled')).toBe('true')
    expect(effects).toHaveBeenCalledTimes(1)
  })

  it('leaves without mounting the entry', () => {
    const onLeave = jest.fn()
    mount(onLeave)
    press('recovery-warning-leave')

    expect(onLeave).toHaveBeenCalledTimes(1)
    expect(renders).not.toHaveBeenCalled()
    expect(effects).not.toHaveBeenCalled()
  })
})
