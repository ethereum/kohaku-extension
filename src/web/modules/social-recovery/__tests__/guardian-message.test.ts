/**
 * The message the owner sends a guardian is fixed copy the screen joins from
 * the paragraphs under socialRecovery.checklist.message. A guardian installs
 * the extension from what this text names, so the joined message must carry
 * the deadline, the link, the store and the publisher it was given, verbatim,
 * and must tell the guardian not to forward the link and to call the owner
 * back before approving.
 */
import i18n from '@common/config/localization/localization'
import en from '@common/config/localization/translations/en.json'

const MESSAGE_PREFIX = 'socialRecovery.checklist.message'

// The two names the install paragraph interpolates; they are values, not
// paragraphs of the message.
const NAME_KEYS = ['sourceName', 'publisherName']

const FILLED_PLACEHOLDERS = ['deadline', 'link', 'source', 'publisher']

const PLACEHOLDER = /\{\{([^}]*)\}\}/g

const message = en.socialRecovery.checklist.message as Record<string, string>
const paragraphKeys = Object.keys(message).filter((key) => !NAME_KEYS.includes(key))

// Values no fixed word of the message could match by chance, so each one is
// found only where its placeholder put it. The link carries the characters an
// escaping interpolation would rewrite.
const values = {
  deadline: '5 October 2026, 14:00 UTC',
  link: 'https://approve.example.test/r#a=1&b=2/3',
  source: 'Example Store Listing',
  publisher: 'Example Publisher Ltd'
}

const paragraphs = paragraphKeys.map((key) => i18n.t(`${MESSAGE_PREFIX}.${key}`, values))
const joined = paragraphs.join('\n\n')

const rendered = (key: string) => i18n.t(`${MESSAGE_PREFIX}.${key}`, values)

const expectCarried = (key: string) => {
  const text = rendered(key)
  expect(text).not.toContain(MESSAGE_PREFIX)
  expect(joined.includes(text)).toBe(true)
}

describe("the guardian's message", () => {
  it('has paragraphs to join and two names that resolve to text', () => {
    expect(paragraphKeys.length).toBeGreaterThan(0)
    NAME_KEYS.forEach((key) => {
      const name = i18n.t(`${MESSAGE_PREFIX}.${key}`)
      expect(name.trim().length).toBeGreaterThan(0)
      expect(name).not.toContain(MESSAGE_PREFIX)
      expect(name).not.toMatch(PLACEHOLDER)
    })
  })

  it('carries the deadline, the link, the store and the publisher verbatim', () => {
    Object.entries(values).forEach(([name, value]) => {
      expect({ name, found: joined.includes(value) }).toEqual({ name, found: true })
    })
  })

  it('uses no placeholder the screen does not fill', () => {
    const unfilled = paragraphKeys.flatMap((key) =>
      Array.from(message[key].matchAll(PLACEHOLDER), (match) => match[1])
        .filter((name) => !FILLED_PLACEHOLDERS.includes(name))
        .map((name) => `${key}: {{${name}}}`)
    )
    expect(unfilled).toEqual([])
    expect(joined).not.toMatch(/\{\{|\}\}/)
  })

  it('tells the guardian not to forward the link', () => {
    const forwardParagraphs = paragraphs.filter((paragraph) =>
      /\b(?:do not|don't|never)\s+forward\b/i.test(paragraph)
    )
    expect(forwardParagraphs.length).toBeGreaterThan(0)
    expect(forwardParagraphs.some((paragraph) => /\blink\b/i.test(paragraph))).toBe(true)
  })

  it('tells the guardian to call the owner back before approving', () => {
    expect(paragraphs.some((paragraph) => /\bcall\b[^.]*\bback\b/i.test(paragraph))).toBe(true)
  })

  it('tells the guardian to hang up on a call received first and call back', () => {
    expectCarried('callReceived')
    expect(rendered('callReceived')).toMatch(/\bhang up\b[^.]*\bcall me back\b/i)
  })

  it('says anyone holding the request can submit it until the deadline', () => {
    expectCarried('submittable')
    expect(rendered('submittable')).toMatch(/\banyone holding this request can submit it\b/i)
  })

  it('asks for the call back before the guardian approves on the page', () => {
    const callBack = joined.indexOf(rendered('callBack'))
    const approveOnPage = joined.indexOf(rendered('approveOnPage'))
    expect(callBack).toBeGreaterThanOrEqual(0)
    expect(approveOnPage).toBeGreaterThanOrEqual(0)
    expect(callBack).toBeLessThan(approveOnPage)
  })
})
