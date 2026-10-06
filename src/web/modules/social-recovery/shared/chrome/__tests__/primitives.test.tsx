/**
 * @jest-environment jsdom
 *
 * The setup screens' shared building blocks, mounted with the app's own
 * components and theme.
 */
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { Text } from 'react-native'

import { ThemeContext } from '@common/contexts/themeContext'
import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import themeConfig, { THEME_TYPES } from '@common/styles/themeConfig'
import type { ThemeProps } from '@common/styles/themeConfig'
import {
  ActionsRow,
  MethodRow,
  NoteBox,
  PageTitle,
  PillChoice,
  RadioCard,
  SectionCard,
  SectionLabel,
  StatusChip
} from '@web/modules/social-recovery/shared/chrome'

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

const press = (id: string) => {
  const node = byTestId(id)
  if (!node) {
    throw new Error(`nothing to press: ${id}`)
  }
  act(() => {
    node.click()
  })
}

const checkedOf = (id: string) => byTestId(id)?.getAttribute('aria-checked')

describe('a radio card', () => {
  it('reports the checked state it is given', () => {
    mount(
      <>
        <RadioCard testID="on" selected onPress={() => {}}>
          <Text>On</Text>
        </RadioCard>
        <RadioCard testID="off" selected={false} onPress={() => {}}>
          <Text>Off</Text>
        </RadioCard>
      </>
    )
    expect(byTestId('on')?.getAttribute('role')).toBe('radio')
    expect(checkedOf('on')).toBe('true')
    expect(checkedOf('off')).toBe('false')
  })

  it('follows a change of the selection', () => {
    const card = (selected: boolean) => (
      <RadioCard testID="card" selected={selected} onPress={() => {}}>
        <Text>Card</Text>
      </RadioCard>
    )
    mount(card(false))
    expect(checkedOf('card')).toBe('false')
    mount(card(true))
    expect(checkedOf('card')).toBe('true')
  })

  it('calls its handler once for a press', () => {
    const onPress = jest.fn()
    mount(
      <RadioCard testID="card" selected={false} onPress={onPress}>
        <Text>Card</Text>
      </RadioCard>
    )
    press('card')
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('does not call its handler while disabled', () => {
    const onPress = jest.fn()
    mount(
      <RadioCard testID="card" selected={false} onPress={onPress} disabled>
        <Text>Card</Text>
      </RadioCard>
    )
    press('card')
    expect(onPress).not.toHaveBeenCalled()
  })

  it('shows its children inside the card', () => {
    mount(
      <RadioCard testID="card" selected={false} onPress={() => {}}>
        <Text testID="body">Two of three</Text>
      </RadioCard>
    )
    expect(byTestId('card')?.contains(byTestId('body'))).toBe(true)
    expect(byTestId('card')?.textContent).toBe('Two of three')
  })
})

describe('a pill choice', () => {
  it('shows its label and reports the checked state it is given', () => {
    mount(
      <>
        <PillChoice testID="on" label="48 hours" selected onPress={() => {}} />
        <PillChoice testID="off" label="7 days" selected={false} onPress={() => {}} />
      </>
    )
    expect(byTestId('on')?.textContent).toBe('48 hours')
    expect(byTestId('off')?.textContent).toBe('7 days')
    expect(byTestId('on')?.getAttribute('role')).toBe('radio')
    expect(checkedOf('on')).toBe('true')
    expect(checkedOf('off')).toBe('false')
  })

  it('follows a change of the selection', () => {
    const pill = (selected: boolean) => (
      <PillChoice testID="pill" label="48 hours" selected={selected} onPress={() => {}} />
    )
    mount(pill(true))
    expect(checkedOf('pill')).toBe('true')
    mount(pill(false))
    expect(checkedOf('pill')).toBe('false')
  })

  it('calls its handler once for a press', () => {
    const onPress = jest.fn()
    mount(<PillChoice testID="pill" label="48 hours" selected={false} onPress={onPress} />)
    press('pill')
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('does not call its handler while disabled', () => {
    const onPress = jest.fn()
    mount(<PillChoice testID="pill" label="48 hours" selected={false} onPress={onPress} disabled />)
    press('pill')
    expect(onPress).not.toHaveBeenCalled()
  })

  it('keeps its label, its checked state and its handler when it is given a style', () => {
    const onPress = jest.fn()
    mount(
      <PillChoice
        testID="pill"
        label="48 hours"
        selected
        onPress={onPress}
        style={{ marginRight: 8 }}
      />
    )
    expect(byTestId('pill')?.textContent).toBe('48 hours')
    expect(checkedOf('pill')).toBe('true')
    press('pill')
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})

describe('a status chip', () => {
  const tones = ['default', 'success', 'warning', 'error'] as const
  tones.forEach((tone) => {
    it(`holds its text and nothing else with the ${tone} tone`, () => {
      mount(<StatusChip testID="chip" text="Not tested" tone={tone} />)
      expect(byTestId('chip')?.textContent).toBe('Not tested')
    })
  })

  it('holds its text and nothing else with no tone given', () => {
    mount(<StatusChip testID="chip" text="Saved" />)
    expect(byTestId('chip')?.textContent).toBe('Saved')
  })

  it('holds its text and nothing else when it is given a style', () => {
    mount(<StatusChip testID="chip" text="Saved" tone="success" style={{ marginLeft: 8 }} />)
    expect(byTestId('chip')?.textContent).toBe('Saved')
  })
})

describe('an actions row', () => {
  it('puts the primary action before the secondary one', () => {
    mount(
      <ActionsRow
        testID="actions"
        primary={<Text testID="primary">Continue</Text>}
        secondary={<Text testID="secondary">Back</Text>}
      />
    )
    expect(byTestId('actions')?.contains(byTestId('primary'))).toBe(true)
    expect(byTestId('actions')?.contains(byTestId('secondary'))).toBe(true)
    // The document order is the reading order: the primary first, then the secondary.
    expect(byTestId('actions')?.textContent).toBe('ContinueBack')
  })

  it('shows the note only when it is given one', () => {
    mount(<ActionsRow testID="actions" primary={<Text>Continue</Text>} />)
    expect(byTestId('actions')?.textContent).toBe('Continue')
    mount(
      <ActionsRow
        testID="actions"
        primary={<Text>Continue</Text>}
        note="Continue unlocks when you pick one."
      />
    )
    expect(byTestId('actions')?.textContent).toBe('ContinueContinue unlocks when you pick one.')
  })

  it('keeps the primary action before both buttons of a two-button secondary', () => {
    mount(
      <ActionsRow
        testID="actions"
        primary={<Text testID="primary">Save</Text>}
        secondary={
          <>
            <Text testID="retry">Try again</Text>
            <Text testID="back">Back</Text>
          </>
        }
      />
    )
    expect(byTestId('actions')?.contains(byTestId('retry'))).toBe(true)
    expect(byTestId('actions')?.contains(byTestId('back'))).toBe(true)
    expect(byTestId('actions')?.textContent).toBe('SaveTry againBack')
  })

  it('shows the note under the test id it is given for it', () => {
    mount(
      <ActionsRow
        testID="actions"
        primary={<Text>Continue</Text>}
        note="Create your passkey first."
        noteTestID="note"
      />
    )
    expect(byTestId('note')?.textContent).toBe('Create your passkey first.')
    expect(byTestId('actions')?.contains(byTestId('note'))).toBe(true)
  })
})

describe('a method row', () => {
  it('shows its children under its test id', () => {
    mount(
      <MethodRow testID="row">
        <Text testID="label">Passkey</Text>
        <Text>Not tested</Text>
      </MethodRow>
    )
    expect(byTestId('row')?.contains(byTestId('label'))).toBe(true)
    expect(byTestId('row')?.textContent).toBe('PasskeyNot tested')
  })

  it('shows its children under its test id when it is quiet', () => {
    mount(
      <MethodRow testID="row" quiet>
        <Text>Recovery password</Text>
      </MethodRow>
    )
    expect(byTestId('row')?.textContent).toBe('Recovery password')
  })
})

describe('a page title', () => {
  it('shows the title under its own test id, and the lead and the children given', () => {
    mount(
      <PageTitle testID="header" titleTestID="title" title="Recovery" lead="Pick who can help.">
        <Text testID="link">Learn more</Text>
      </PageTitle>
    )
    expect(byTestId('title')?.textContent).toBe('Recovery')
    expect(byTestId('header')?.textContent).toBe('RecoveryPick who can help.Learn more')
    expect(byTestId('header')?.contains(byTestId('link'))).toBe(true)
  })

  it('shows the title alone when it has no lead and no children', () => {
    mount(<PageTitle testID="header" titleTestID="title" title="Recovery" />)
    expect(byTestId('title')?.textContent).toBe('Recovery')
    expect(byTestId('header')?.textContent).toBe('Recovery')
  })
})

describe('a section card', () => {
  it('shows its label and its children under its test id', () => {
    mount(
      <SectionCard testID="card" label="Required">
        <Text testID="body">Your passkey</Text>
      </SectionCard>
    )
    expect(byTestId('card')?.textContent).toBe('RequiredYour passkey')
    expect(byTestId('card')?.contains(byTestId('body'))).toBe(true)
  })

  it('shows its children alone when it has no label', () => {
    mount(
      <SectionCard testID="card" tone="muted">
        <Text>Your passkey</Text>
      </SectionCard>
    )
    expect(byTestId('card')?.textContent).toBe('Your passkey')
  })
})

describe('a section label', () => {
  it('shows its text under its test id', () => {
    mount(<SectionLabel testID="label">Groups</SectionLabel>)
    expect(byTestId('label')?.textContent).toBe('Groups')
  })
})

describe('a note box', () => {
  it('shows its text under its test id', () => {
    mount(<NoteBox testID="note">Nothing is sent until you save.</NoteBox>)
    expect(byTestId('note')?.textContent).toBe('Nothing is sent until you save.')
  })
})
