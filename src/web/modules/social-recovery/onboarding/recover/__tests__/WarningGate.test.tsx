/**
 * @jest-environment jsdom
 *
 * The recovery warning in each of its three forms, mounted with the app's own
 * components, theme and the real en.json.
 */
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import en from '@common/config/localization/translations/en.json'
import { ThemeContext } from '@common/contexts/themeContext'
import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import themeConfig, { THEME_TYPES } from '@common/styles/themeConfig'
import type { ThemeProps } from '@common/styles/themeConfig'
import WarningGate from '@web/modules/social-recovery/onboarding/recover/WarningGate'

// React only runs effects and state updates inside act() when this flag is set.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const THEME = Object.fromEntries(
  Object.entries(themeConfig).map(([name, byType]) => [name, byType[THEME_TYPES.LIGHT]])
) as ThemeProps

const THEME_CONTEXT: ThemeContextReturnType = {
  theme: THEME,
  themeType: THEME_TYPES.LIGHT,
  selectedThemeType: THEME_TYPES.LIGHT,
  setThemeType: () => {}
}

const WARNING = en.socialRecovery.recover.warning

const FORMS = ['recover', 'reset', 'condensed'] as const

// The forms that draw their own continue and leave.
const GATED = ['recover', 'reset'] as const

const gateOf = (
  form: typeof FORMS[number],
  onContinue: () => void = () => {},
  onAcknowledgedChange: (acknowledged: boolean) => void = () => {}
) => {
  if (form === 'recover') {
    return (
      <WarningGate
        form="recover"
        onContinue={onContinue}
        onLeave={() => {}}
        onImportInstead={() => {}}
      />
    )
  }
  if (form === 'reset') {
    return <WarningGate form="reset" onContinue={onContinue} onLeave={() => {}} />
  }
  return <WarningGate form="condensed" onAcknowledgedChange={onAcknowledgedChange} />
}

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

const continueDisabled = () =>
  byTestId('recovery-warning-continue')?.getAttribute('aria-disabled') === 'true'

GATED.forEach((form) => {
  describe(`the ${form} form of the warning`, () => {
    it('keeps continue disabled and does nothing on a press before the acknowledgment', () => {
      const onContinue = jest.fn()
      mount(gateOf(form, onContinue))

      expect(byTestId('recovery-warning-continue')).not.toBeNull()
      expect(continueDisabled()).toBe(true)
      press('recovery-warning-continue')
      expect(onContinue).not.toHaveBeenCalled()
    })

    it('calls the continue handler once after the acknowledgment and one press', () => {
      const onContinue = jest.fn()
      mount(gateOf(form, onContinue))

      press('recovery-warning-acknowledge')
      expect(continueDisabled()).toBe(false)
      press('recovery-warning-continue')
      expect(onContinue).toHaveBeenCalledTimes(1)
    })

    it('disables continue again when the holder takes the acknowledgment back', () => {
      const onContinue = jest.fn()
      mount(gateOf(form, onContinue))

      press('recovery-warning-acknowledge')
      press('recovery-warning-acknowledge')
      expect(continueDisabled()).toBe(true)
      press('recovery-warning-continue')
      expect(onContinue).not.toHaveBeenCalled()
    })

    it('asks for the acknowledgment again on every mount', () => {
      const onContinue = jest.fn()
      mount(gateOf(form, onContinue))
      press('recovery-warning-acknowledge')
      expect(continueDisabled()).toBe(false)

      unmount()
      mount(gateOf(form, onContinue))

      expect(continueDisabled()).toBe(true)
      press('recovery-warning-continue')
      expect(onContinue).not.toHaveBeenCalled()
    })
  })
})

FORMS.forEach((form) => {
  it(`never calls the seed anything but the recovery phrase in the ${form} form`, () => {
    mount(gateOf(form))

    expect(container.textContent).not.toMatch(/seed|mnemonic|secret phrase/i)
  })
})

describe('the condensed form of the warning', () => {
  // The wallet's checkbox draws its check mark only while it is ticked.
  const isChecked = () => !!byTestId('recovery-warning-acknowledge')?.querySelector('svg')

  it('draws no continue and no leave', () => {
    mount(gateOf('condensed'))

    expect(byTestId('recovery-warning-acknowledge')).not.toBeNull()
    expect(byTestId('recovery-warning-continue')).toBeNull()
    expect(byTestId('recovery-warning-leave')).toBeNull()
    expect(byTestId('recovery-warning-actions')).toBeNull()
    expect(container.textContent).not.toContain(en.socialRecovery.actions.continue)
    expect(container.textContent).not.toContain(WARNING.leave)
  })

  it('reports the acknowledgment given and then taken back', () => {
    const onAcknowledgedChange = jest.fn()
    mount(gateOf('condensed', undefined, onAcknowledgedChange))

    expect(onAcknowledgedChange).not.toHaveBeenCalled()
    press('recovery-warning-acknowledge')
    press('recovery-warning-acknowledge')

    expect(onAcknowledgedChange.mock.calls).toEqual([[true], [false]])
  })

  it('starts unticked on every mount', () => {
    const onAcknowledgedChange = jest.fn()
    mount(gateOf('condensed', undefined, onAcknowledgedChange))
    press('recovery-warning-acknowledge')
    expect(isChecked()).toBe(true)

    unmount()
    onAcknowledgedChange.mockClear()
    mount(gateOf('condensed', undefined, onAcknowledgedChange))

    expect(isChecked()).toBe(false)
    expect(onAcknowledgedChange).not.toHaveBeenCalled()
    // The first click after a remount gives the acknowledgment, not takes it back.
    press('recovery-warning-acknowledge')
    expect(onAcknowledgedChange.mock.calls).toEqual([[true]])
  })
})

describe('what each form of the warning shows', () => {
  it('shows the step counter, the pointer line and its action in the recover form', () => {
    const onImportInstead = jest.fn()
    mount(
      <WarningGate
        form="recover"
        onContinue={() => {}}
        onLeave={() => {}}
        onImportInstead={onImportInstead}
      />
    )

    expect(byTestId('recovery-warning-step')?.textContent).toMatch(/\b1\b.*\b3\b/)
    expect(byTestId('recovery-warning-pointer')?.textContent).toContain(WARNING.importPointer)
    expect(byTestId('recovery-warning-import-instead')?.textContent).toBe(WARNING.importAction)
    press('recovery-warning-import-instead')
    expect(onImportInstead).toHaveBeenCalledTimes(1)
  })

  const others = ['reset', 'condensed'] as const
  others.forEach((form) => {
    it(`shows no step counter and no pointer line in the ${form} form`, () => {
      mount(gateOf(form))

      expect(byTestId('recovery-warning-step')).toBeNull()
      expect(byTestId('recovery-warning-pointer')).toBeNull()
      expect(byTestId('recovery-warning-import-instead')).toBeNull()
      expect(container.textContent).not.toContain(WARNING.importPointer)
      expect(container.textContent).not.toContain(WARNING.importAction)
    })
  })

  it('takes the longer acknowledgment at the recover door and the shorter one at a reset entry', () => {
    mount(gateOf('recover'))
    const atRecover = byTestId('recovery-warning')?.textContent
    mount(gateOf('reset'))
    const atReset = byTestId('recovery-warning')?.textContent

    expect(WARNING.acknowledgeRecover).not.toBe(WARNING.acknowledgeReset)
    expect(atRecover).toContain(WARNING.acknowledgeRecover)
    expect(atReset).toContain(WARNING.acknowledgeReset)
    expect(atReset).not.toContain(WARNING.acknowledgeRecover)
  })

  it('offers a way off the screen in the recover and the reset forms', () => {
    const onLeave = jest.fn()
    mount(<WarningGate form="reset" onContinue={() => {}} onLeave={onLeave} />)

    expect(byTestId('recovery-warning-leave')?.textContent).toBe(WARNING.leave)
    press('recovery-warning-leave')
    expect(onLeave).toHaveBeenCalledTimes(1)

    mount(gateOf('recover'))
    expect(byTestId('recovery-warning-leave')?.textContent).toBe(WARNING.leave)
  })

  it('never calls the continue handler when the holder leaves', () => {
    const onContinue = jest.fn()
    const onLeave = jest.fn()
    mount(<WarningGate form="reset" onContinue={onContinue} onLeave={onLeave} />)

    press('recovery-warning-leave')
    expect(onLeave).toHaveBeenCalledTimes(1)
    expect(onContinue).not.toHaveBeenCalled()
  })

  it('shows the lead and the condensed line in the condensed form, not the full warning', () => {
    mount(gateOf('condensed'))

    expect(byTestId('recovery-warning-lead')?.textContent).toBe(WARNING.lead)
    expect(container.textContent).toContain(WARNING.condensed)
    expect(container.textContent).not.toContain(WARNING.body)
    expect(byTestId('recovery-warning-header')).toBeNull()
  })

  it('shows the full warning in the recover and the reset forms', () => {
    const full = ['recover', 'reset'] as const
    full.forEach((form) => {
      mount(gateOf(form))
      const text = container.textContent ?? ''
      expect(byTestId('recovery-warning-header')?.textContent).toBe(WARNING.header)
      const lines = [
        WARNING.lead,
        WARNING.body,
        WARNING.nobodyWatches,
        WARNING.nobodyNeedsPhrase,
        WARNING.walkAway
      ]
      lines.forEach((line) => expect(text).toContain(line))
    })
  })

  it('names the seed as the recovery phrase where the recover form names it', () => {
    mount(gateOf('recover'))

    expect(container.textContent).toMatch(/recovery phrase/)
  })
})
