/**
 * @jest-environment jsdom
 *
 * jsdom has no object URLs, so the test installs its own and watches the
 * link the carrier clicks. It applies no print styles either, so the print
 * view's rules are read from the parsed sheet and matched against a page by hand.
 */
import type { CardFile } from '@web/modules/social-recovery/setup/card'
import {
  BROWSER_CARRIERS,
  PRINT_VIEW_CSS,
  PRINT_VIEW_ID,
  REVOKE_DELAY_MS
} from '@web/modules/social-recovery/setup/card/carriers'

const FILE: CardFile = {
  name: 'card.html',
  type: 'text/html',
  text: '<p>tide lantern orchid</p>'
}

const readBlob = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })

describe('the file carrier', () => {
  const OBJECT_URL = 'blob:chrome-extension://card/1'
  let blobs: Blob[]
  let revoked: string[]
  let clicks: { href: string; download: string; inPage: boolean; live: boolean }[]
  const originalCreate = URL.createObjectURL
  const originalRevoke = URL.revokeObjectURL

  beforeEach(() => {
    jest.useFakeTimers()
    blobs = []
    revoked = []
    clicks = []
    URL.createObjectURL = jest.fn((blob: Blob) => {
      blobs.push(blob)
      return OBJECT_URL
    })
    URL.revokeObjectURL = jest.fn((url: string) => {
      revoked.push(url)
    })
    jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function click(this: HTMLAnchorElement) {
        clicks.push({
          href: this.href,
          download: this.download,
          inPage: this.parentElement === document.body,
          live: !revoked.includes(this.href)
        })
      })
  })

  afterEach(() => {
    jest.useRealTimers()
    URL.createObjectURL = originalCreate
    URL.revokeObjectURL = originalRevoke
    jest.restoreAllMocks()
  })

  it('saves the file from an object URL built from its text and type', async () => {
    BROWSER_CARRIERS.download(FILE)
    expect(blobs).toHaveLength(1)
    expect(blobs[0].type).toBe(FILE.type)
    expect(await readBlob(blobs[0])).toBe(FILE.text)
    expect(clicks).toEqual([{ href: OBJECT_URL, download: FILE.name, inPage: true, live: true }])
  })

  it('leaves no link in the page and keeps the object URL until the browser has the file', () => {
    BROWSER_CARRIERS.download(FILE)
    expect(document.querySelector('a')).toBeNull()
    expect(revoked).toEqual([])
    jest.advanceTimersByTime(REVOKE_DELAY_MS - 1)
    expect(revoked).toEqual([])
    jest.advanceTimersByTime(1)
    expect(revoked).toEqual([OBJECT_URL])
  })

  it('never puts the text in a data URL', () => {
    BROWSER_CARRIERS.download(FILE)
    expect(clicks).toHaveLength(1)
    clicks.forEach(({ href }) => {
      expect(href.startsWith('data:')).toBe(false)
      expect(href).not.toContain('orchid')
    })
  })
})

describe('the print view style', () => {
  let style: HTMLStyleElement
  let page: {
    html: HTMLElement
    body: HTMLElement
    other: HTMLElement
    view: HTMLElement
    card: HTMLElement
    line: HTMLElement
  }

  beforeEach(() => {
    style = document.createElement('style')
    style.textContent = PRINT_VIEW_CSS
    document.head.appendChild(style)

    const other = document.createElement('div')
    const view = document.createElement('div')
    view.id = PRINT_VIEW_ID
    const card = document.createElement('div')
    card.setAttribute('data-testid', 'print-card')
    const line = document.createElement('span')
    card.appendChild(line)
    view.appendChild(card)
    document.body.append(other, view)
    page = { html: document.documentElement, body: document.body, other, view, card, line }
  })

  afterEach(() => {
    style.remove()
    page.other.remove()
    page.view.remove()
  })

  const topRules = () => Array.from(style.sheet?.cssRules ?? [])
  const printRules = () =>
    topRules()
      .filter((rule): rule is CSSMediaRule => rule instanceof CSSMediaRule)
      .filter((rule) => rule.media.mediaText === 'print')
      .flatMap((rule) => Array.from(rule.cssRules))
      .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)
  const screenRules = () =>
    topRules().filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)

  // The value a property takes on an element from the given rules, the last
  // matching rule winning; every declaration under print here is important or alone.
  const valueOn = (rules: CSSStyleRule[], element: Element, property: string) =>
    rules
      .filter((rule) => element.matches(rule.selectorText))
      .map((rule) => rule.style.getPropertyValue(property))
      .filter(Boolean)
      .pop() ?? ''

  const channels = (colour: string): number[] => {
    const hex = colour.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1]
    if (hex) {
      const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex
      return [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16))
    }
    if (colour === 'white') {
      return [255, 255, 255]
    }
    const rgb = colour.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    if (rgb) {
      return rgb.slice(1, 4).map(Number)
    }
    throw new Error(`not a colour: ${colour}`)
  }
  const isWhite = (colour: string) => channels(colour).every((channel) => channel === 255)
  const isDark = (colour: string) => channels(colour).every((channel) => channel < 0x40)
  const background = (element: Element) =>
    valueOn(printRules(), element, 'background-color') ||
    valueOn(printRules(), element, 'background')

  it('keeps the print view out of the screen', () => {
    expect(valueOn(screenRules(), page.view, 'display')).toBe('none')
  })

  it('prints the print view alone', () => {
    expect(valueOn(printRules(), page.view, 'display')).toBe('block')
    expect(valueOn(printRules(), page.other, 'display')).toBe('none')
  })

  it('prints on white whatever the theme', () => {
    expect(isWhite(background(page.html))).toBe(true)
    expect(isWhite(background(page.body))).toBe(true)
    expect(isWhite(background(page.view))).toBe(true)
  })

  it('prints every line of the card in a dark colour', () => {
    expect(isDark(valueOn(printRules(), page.card, 'color'))).toBe(true)
    expect(isDark(valueOn(printRules(), page.line, 'color'))).toBe(true)
  })

  // The border's width, style and colour, from the shorthand or its longhands.
  const borderOf = (element: Element) => {
    const rules = printRules()
    const [width = '', lineStyle = '', colour = ''] = valueOn(rules, element, 'border')
      .split(/\s+/)
      .filter(Boolean)
    return {
      width: valueOn(rules, element, 'border-top-width') || width,
      lineStyle: valueOn(rules, element, 'border-top-style') || lineStyle,
      colour: valueOn(rules, element, 'border-top-color') || colour
    }
  }

  it('draws a visible border round the printed card', () => {
    const { width, lineStyle, colour } = borderOf(page.card)
    expect(parseFloat(width)).toBeGreaterThan(0)
    expect(lineStyle).toBe('solid')
    expect(isWhite(colour)).toBe(false)
    expect(borderOf(page.line).lineStyle).toBe('')
  })
})
