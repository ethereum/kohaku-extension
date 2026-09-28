/**
 * The ceremony screen mounts with one `<Route>` in the module's registry, which
 * MainRoutes mounts inside its TabOnlyRoute group, so an open from the popup
 * redirects to `tab.html`.
 *
 * The route files are read as text: rendering MainRoutes would load every
 * screen of the extension. The scanner below walks JSX tags with brace depth,
 * so an element prop such as `element={<TabOnlyRoute />}` does not close a tag.
 */
import fs from 'fs'
import path from 'path'

import { ceremony } from './harness'

const ROOT = path.resolve(__dirname, '../../../../../../..')
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8')

const MAIN_ROUTES = 'src/web/modules/router/components/MainRoutes/MainRoutes.tsx'
const REGISTRY = 'src/web/modules/social-recovery/routes/SocialRecoveryRoutes.tsx'

interface RouteTag {
  text: string
  start: number
  end: number
  selfClosing: boolean
  closes?: number
}

/** Drops JSX and line comments, keeping offsets meaningless but order intact. */
const stripComments = (source: string) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

/** Every `<Route ...>` tag with the offset of its matching `</Route>`. */
const routeTags = (source: string): RouteTag[] => {
  const tags: RouteTag[] = []
  const open: RouteTag[] = []
  const re = /<Route\b|<\/Route>/g
  let match = re.exec(source)
  while (match) {
    if (match[0] === '</Route>') {
      const tag = open.pop()
      if (!tag) throw new Error(`unbalanced </Route> at ${match.index}`)
      tag.closes = match.index
    } else {
      let depth = 0
      let i = match.index + match[0].length
      for (; i < source.length; i++) {
        const c = source[i]
        if (c === '{') depth++
        else if (c === '}') depth--
        else if (c === '>' && depth === 0) break
      }
      const selfClosing = source[i - 1] === '/'
      const tag: RouteTag = {
        text: source.slice(match.index, i + 1),
        start: match.index,
        end: i + 1,
        selfClosing
      }
      tags.push(tag)
      if (!selfClosing) open.push(tag)
      re.lastIndex = i + 1
    }
    match = re.exec(source)
  }
  if (open.length) throw new Error('unclosed <Route>')
  return tags
}

describe('the ceremony runs in a full tab', () => {
  it('mounts the module registry inside the TabOnlyRoute group of MainRoutes', () => {
    const source = stripComments(read(MAIN_ROUTES))
    const tags = routeTags(source)
    const tabOnly = tags.filter((t) => /element=\{\s*<TabOnlyRoute\s*\/>\s*\}/.test(t.text))
    expect(tabOnly).toHaveLength(1)
    const group = tabOnly[0]
    const mounts = tags.filter((t) => t.text.includes('WEB_ROUTES.socialRecovery}/*'))
    expect(mounts).toHaveLength(1)
    expect(mounts[0].start).toBeGreaterThan(group.end)
    expect(mounts[0].end).toBeLessThan(group.closes ?? -1)
  })

  // TabOnlyRoute keeps an action window that holds a current action, so the
  // screen keeps its own gate: a full tab runs, the popup and the action
  // window never do.
  it('lets the screen run a ceremony in a full tab alone', () => {
    const { ceremonyMayRun } = ceremony()
    expect(ceremonyMayRun({ isTab: true, isPopup: false, isActionWindow: false })).toBe(true)
    expect(ceremonyMayRun({ isTab: false, isPopup: true, isActionWindow: false })).toBe(false)
    expect(ceremonyMayRun({ isTab: false, isPopup: false, isActionWindow: true })).toBe(false)
    expect(ceremonyMayRun({ isTab: false, isPopup: false, isActionWindow: false })).toBe(false)
  })

  it('adds exactly one <Route> for the ceremony screen to the registry', () => {
    const tags = routeTags(stripComments(read(REGISTRY)))
    const ceremonyRoutes = tags.filter((t) => /ceremony/i.test(t.text))
    expect(ceremonyRoutes).toHaveLength(1)
    // Its path is the WEB_ROUTES value without the module prefix, or that value itself.
    expect(ceremonyRoutes[0].text).toMatch(/path=\{?\s*["'`]?(ceremony|.*socialRecoveryCeremony)/)
  })
})
