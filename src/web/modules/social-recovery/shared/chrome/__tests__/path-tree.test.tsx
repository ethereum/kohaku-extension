/**
 * @jest-environment jsdom
 *
 * The path tree drawn with the app's own components and theme: where its
 * line runs, which nodes it ticks into, and what a junction shows.
 */
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { Text } from 'react-native'
import type { ColorValue } from 'react-native'

import { ThemeContext } from '@common/contexts/themeContext'
import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import themeConfig, { THEME_TYPES } from '@common/styles/themeConfig'
import type { ThemeProps } from '@common/styles/themeConfig'
import { PathTree, PathTreeNode } from '@web/modules/social-recovery/shared/chrome'
import { eachIt } from '@web/modules/social-recovery/shared/chrome/__fixtures__/table'

// React only runs effects and state updates inside act() when this flag is set.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const themeContextOf = (type: THEME_TYPES.LIGHT | THEME_TYPES.DARK): ThemeContextReturnType => ({
  theme: Object.fromEntries(
    Object.entries(themeConfig).map(([name, byType]) => [name, byType[type]])
  ) as ThemeProps,
  themeType: type,
  selectedThemeType: type,
  setThemeType: () => {}
})

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

const mount = (
  element: React.ReactElement,
  type: THEME_TYPES.LIGHT | THEME_TYPES.DARK = THEME_TYPES.LIGHT
) =>
  act(() => {
    root.render(
      <ThemeContext.Provider value={themeContextOf(type)}>{element}</ThemeContext.Provider>
    )
  })

const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)

/** The pieces of line a node draws in its gutter, left of its content. */
const piecesOf = (id: string) => {
  const node = byTestId(id)
  if (!node) {
    throw new Error(`nothing on screen with the test id ${id}`)
  }
  return Array.from((node.firstElementChild?.children ?? []) as HTMLCollectionOf<HTMLElement>)
}

/**
 * How the line crosses a node: whether it runs up out of the node's top, down
 * out of its bottom, and whether it ticks into the node's content.
 */
const lineAt = (id: string) => {
  const pieces = piecesOf(id)
  const runs = pieces.filter((piece) => piece.style.height !== '2px')
  return {
    up: runs.some((run) => run.style.top === '0px'),
    down: runs.some((run) => run.style.bottom === '0px'),
    tick: pieces.length > runs.length
  }
}

const NONE = { up: false, down: false, tick: false }

/**
 * A colour as its red, green and blue channels and its opacity to two places,
 * so a theme's hex colour and the page's style read back compare as one.
 */
const channelsOf = (colour: ColorValue) => {
  const probe = document.createElement('div')
  probe.style.backgroundColor = String(colour)
  const [r, g, b, a = 1] = (probe.style.backgroundColor.match(/[\d.]+/g) ?? []).map(Number)
  return [r, g, b, Math.round(a * 100) / 100].join(',')
}

describe('a path tree', () => {
  it('draws no line for a path of one branch, whatever passes beside it', () => {
    mount(
      <PathTree label="and">
        <PathTreeNode variant="through" testID="header">
          <Text>Required</Text>
        </PathTreeNode>
        <PathTreeNode testID="only">
          <Text>Passkey</Text>
        </PathTreeNode>
        <PathTreeNode variant="through" testID="footer">
          <Text>Add</Text>
        </PathTreeNode>
      </PathTree>
    )
    ;['header', 'only', 'footer'].forEach((id) => expect(piecesOf(id)).toHaveLength(0))
    expect(byTestId('only')?.textContent).toBe('Passkey')
  })

  it('runs from the first branch down to the last, ticking into each branch only', () => {
    mount(
      <PathTree label="and">
        <PathTreeNode variant="through" testID="before">
          <Text>Required</Text>
        </PathTreeNode>
        <PathTreeNode testID="first">
          <Text>Passkey</Text>
        </PathTreeNode>
        <PathTreeNode variant="through" testID="between">
          <Text>Groups</Text>
        </PathTreeNode>
        <PathTreeNode testID="middle">
          <Text>Group 1</Text>
        </PathTreeNode>
        <PathTreeNode testID="last">
          <Text>Group 2</Text>
        </PathTreeNode>
        <PathTreeNode variant="through" testID="after">
          <Text>Add a group</Text>
        </PathTreeNode>
      </PathTree>
    )
    expect(lineAt('before')).toEqual(NONE)
    expect(lineAt('first')).toEqual({ up: false, down: true, tick: true })
    expect(lineAt('between')).toEqual({ up: true, down: true, tick: false })
    expect(lineAt('middle')).toEqual({ up: true, down: true, tick: true })
    expect(lineAt('last')).toEqual({ up: true, down: false, tick: true })
    expect(lineAt('after')).toEqual(NONE)
  })

  it("shows the tree's label on a junction, on the line, and a branch's own content", () => {
    mount(
      <PathTree label="AND">
        <PathTreeNode testID="first">
          <Text>Passkey</Text>
        </PathTreeNode>
        <PathTreeNode variant="junction" testID="junction" />
        <PathTreeNode testID="second">
          <Text>Group 1</Text>
        </PathTreeNode>
      </PathTree>
    )
    expect(byTestId('junction')?.textContent).toBe('AND')
    expect(lineAt('junction')).toEqual({ up: true, down: true, tick: false })
    expect(byTestId('first')?.textContent).toBe('Passkey')
    expect(byTestId('second')?.textContent).toBe('Group 1')
  })

  it('meets a branch at the anchor it names', () => {
    mount(
      <PathTree>
        <PathTreeNode testID="first" anchor={40}>
          <Text>Passkey</Text>
        </PathTreeNode>
        <PathTreeNode testID="second" anchor={10}>
          <Text>Group 1</Text>
        </PathTreeNode>
      </PathTree>
    )
    const tickTop = (id: string) =>
      piecesOf(id).find((piece) => piece.style.height === '2px')?.style.top
    expect(tickTop('first')).toBe('39px')
    expect(tickTop('second')).toBe('9px')
  })

  eachIt([THEME_TYPES.LIGHT, THEME_TYPES.DARK] as const)(
    "draws every piece of line in the %s theme's border colour",
    (type) => {
      mount(
        <PathTree label="and">
          <PathTreeNode testID="first">
            <Text>Passkey</Text>
          </PathTreeNode>
          <PathTreeNode variant="junction" testID="junction" />
          <PathTreeNode testID="second">
            <Text>Group 1</Text>
          </PathTreeNode>
        </PathTree>,
        type
      )
      const { theme } = themeContextOf(type)
      const allowed = [channelsOf(theme.primaryBorder), channelsOf(theme.secondaryBorder)]
      const pieces = ['first', 'junction', 'second'].flatMap(piecesOf)
      expect(pieces.length).toBeGreaterThan(0)
      pieces.forEach((piece) => expect(allowed).toContain(channelsOf(piece.style.backgroundColor)))
    }
  )

  it('draws no line for a node outside a tree', () => {
    mount(
      <PathTreeNode testID="alone">
        <Text>Passkey</Text>
      </PathTreeNode>
    )
    expect(piecesOf('alone')).toHaveLength(0)
    expect(byTestId('alone')?.textContent).toBe('Passkey')
  })
})
