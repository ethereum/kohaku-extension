/**
 * @jest-environment jsdom
 *
 * The two columns a screen's view draws: the main column the user reads and
 * acts in, and the narrower aside beside it for the cards that only inform.
 */
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { Text } from 'react-native'

import TwoColumn from '@web/modules/social-recovery/shared/chrome/TwoColumn'

// React only runs effects and state updates inside act() when this flag is set.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

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
    root.render(element)
  })

const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)

describe('the two columns', () => {
  it('draws the main column first and the aside after it', () => {
    mount(
      <TwoColumn testID="columns" aside={<Text testID="note">A note</Text>}>
        <Text testID="view">The view</Text>
      </TwoColumn>
    )
    expect(byTestId('columns')?.textContent).toBe('The viewA note')
    expect(byTestId('columns-main')?.contains(byTestId('view'))).toBe(true)
    expect(byTestId('columns-aside')?.contains(byTestId('note'))).toBe(true)
    expect(byTestId('columns-main')?.contains(byTestId('note'))).toBe(false)
  })

  it('draws the main column alone when the screen has nothing to put aside', () => {
    mount(
      <TwoColumn testID="columns">
        <Text testID="view">The view</Text>
      </TwoColumn>
    )
    expect(byTestId('columns')?.textContent).toBe('The view')
    expect(byTestId('columns-main')?.contains(byTestId('view'))).toBe(true)
    expect(byTestId('columns-aside')).toBeNull()
  })

  it('grows the columns and the main one only when told to', () => {
    mount(
      <TwoColumn testID="columns">
        <Text>The view</Text>
      </TwoColumn>
    )
    expect(getComputedStyle(byTestId('columns') as HTMLElement).flexGrow).not.toBe('1')
    expect(getComputedStyle(byTestId('columns-main') as HTMLElement).flexGrow).not.toBe('1')

    mount(
      <TwoColumn testID="columns" grow>
        <Text>The view</Text>
      </TwoColumn>
    )
    expect(getComputedStyle(byTestId('columns') as HTMLElement).flexGrow).toBe('1')
    expect(getComputedStyle(byTestId('columns-main') as HTMLElement).flexGrow).toBe('1')
  })

  it('puts its test id on its outermost element', () => {
    mount(
      <TwoColumn testID="columns" aside={<Text>A note</Text>}>
        <Text>The view</Text>
      </TwoColumn>
    )
    expect(container.firstElementChild).toBe(byTestId('columns'))
  })
})
