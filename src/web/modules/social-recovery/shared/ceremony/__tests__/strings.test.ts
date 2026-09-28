/**
 * Every string the ceremony tab shows is a key of `socialRecovery` in en.json,
 * read through `t` with no fallback. The keys come from two places: the
 * literals of the module's sources, and the functions that pick a key per
 * outcome or per kind. Both are checked against the real en.json and through
 * the app's own i18next instance, which returns the key itself where a key is
 * missing.
 */
import fs from 'fs'
import path from 'path'

import i18n from '@common/config/localization'
import en from '@common/config/localization/translations/en.json'

import { ceremony } from './harness'

const MODULE_DIR = path.resolve(__dirname, '..')

const sourcesOf = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourcesOf(full)
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : []
  })

const SOURCES = sourcesOf(MODULE_DIR).map((file) => ({
  file: path.relative(MODULE_DIR, file),
  text: fs.readFileSync(file, 'utf8')
}))

/** The value at a dotted key of en.json, or undefined. */
const lookup = (key: string): unknown =>
  key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      en
    )

const expectResolves = (key: string) => {
  expect({ key, value: typeof lookup(key) }).toEqual({ key, value: 'string' })
  expect({ key, rendered: i18n.t(key) === key }).toEqual({ key, rendered: false })
}

describe('the ceremony tab strings', () => {
  it('passes no defaultValue to t anywhere in the screen', () => {
    const screen = SOURCES.filter((s) => s.file.startsWith('screen'))
    screen.forEach(({ file, text }) =>
      expect({ file, fallback: /defaultValue/.test(text) }).toEqual({ file, fallback: false })
    )
  })

  it('passes no defaultValue to a translate call anywhere in the module', () => {
    SOURCES.forEach(({ file, text }) =>
      expect({ file, fallback: /\bt\([^)]*defaultValue/.test(text) }).toEqual({
        file,
        fallback: false
      })
    )
  })

  it('resolves every literal socialRecovery key of the module in en.json', () => {
    const keys = new Set<string>()
    SOURCES.forEach(({ text }) => {
      // Code only: a comment may name a block of en.json in backticks.
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      const re = /['"`](socialRecovery\.[A-Za-z0-9_.]*[A-Za-z0-9_])['"`]/g
      let match = re.exec(code)
      while (match) {
        keys.add(match[1])
        match = re.exec(code)
      }
    })
    expect(keys.size).toBeGreaterThan(20)
    keys.forEach(expectResolves)
  })

  it('translates the screen through literal keys or the module key functions alone', () => {
    const screen = SOURCES.find((s) => s.file === path.join('screen', 'CeremonyScreen.tsx'))
    // The first argument of each t(...) call, up to its first comma or paren.
    const calls = [...(screen?.text ?? '').matchAll(/\bt\(\s*([^,)]+)/g)].map((m) => m[1].trim())
    expect(calls.length).toBeGreaterThan(10)
    const allowed = /^('socialRecovery\.[A-Za-z0-9_.]+'$|noteKey$|lossLineKeyOf\(|lineKey$)/
    calls.forEach((arg) =>
      expect({ arg, allowed: allowed.test(arg) }).toEqual({ arg, allowed: true })
    )
  })
})

describe('the keys an outcome selects', () => {
  const everyOutcome = () => {
    const { passed, failed, unavailable, notSupported, dismissed, HOST_CAUSES } = ceremony()
    const causes = [
      'device-refused',
      'device-unavailable',
      'material-rejected',
      'method-unsupported',
      'version-unread',
      ...HOST_CAUSES
    ] as const
    return [
      passed({}),
      ...causes.map((c) => failed(c)),
      ...causes.map((c) => unavailable(c)),
      ...causes.map((c) => notSupported(c)),
      dismissed('cancelled'),
      dismissed('refused')
    ]
  }

  it('resolves the note of every outcome at every call', () => {
    const { CEREMONY_CALLS, noteKeyOfOutcome } = ceremony()
    CEREMONY_CALLS.forEach((call) =>
      everyOutcome().forEach((outcome) => {
        const key = noteKeyOfOutcome(outcome, call)
        if (key !== null) expectResolves(key)
      })
    )
  })

  it('resolves the line of every outcome at every call, and never selects the not-tested line', () => {
    const { CEREMONY_CALLS, lineKeyOfOutcome } = ceremony()
    CEREMONY_CALLS.forEach((call) =>
      everyOutcome().forEach((outcome) => {
        const key = lineKeyOfOutcome(outcome, call)
        if (key === null) return
        expect(key).not.toBe('socialRecovery.ceremony.notTestedLine')
        expectResolves(key)
      })
    )
  })

  it('shows every outcome with a note, a line or a chip: no row is left without words', () => {
    const { CEREMONY_CALLS, chipOfOutcome, lineKeyOfOutcome, noteKeyOfOutcome } = ceremony()
    CEREMONY_CALLS.filter((call) => call !== 'healthCheck').forEach((call) =>
      everyOutcome().forEach((outcome) => {
        const words = [
          chipOfOutcome(outcome, call),
          noteKeyOfOutcome(outcome, call),
          lineKeyOfOutcome(outcome, call)
        ].filter((w) => w !== null)
        expect({ call, outcome, words: words.length > 0 }).toEqual({ call, outcome, words: true })
      })
    )
  })

  it('shows a browser error name alone as raw text, never a cause slug or a message', () => {
    const { browserErrorNameOf, failed, unavailable, HOST_CAUSES } = ceremony()
    expect(browserErrorNameOf(failed('browser-error', 'NotAllowedError'))).toBe('NotAllowedError')
    expect(browserErrorNameOf(failed('browser-error', 'the prompt closed'))).toBeNull()
    expect(browserErrorNameOf(failed('thrown', 'boom'))).toBeNull()
    HOST_CAUSES.forEach((cause) => {
      expect(browserErrorNameOf(unavailable(cause, 'TimeoutError'))).toBeNull()
    })
  })

  it('selects the unreachable note for a phone that never connected', () => {
    const { unavailable, noteKeyOfOutcome } = ceremony()
    expect(noteKeyOfOutcome(unavailable('unreachable'), 'testAccess')).toBe(
      'socialRecovery.ceremony.unreachableNote'
    )
  })

  it('resolves every kind line, provider and device name', () => {
    const { kindLineOf, lossLineKeyOf, PASSKEY_KINDS, PLATFORMS, AUTHENTICATOR_PLACES } = ceremony()
    const aaguids = [
      undefined,
      '00000000-0000-0000-0000-000000000000',
      'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4',
      'fbfc3007-154e-4ecc-8c0b-6e020557d7bd',
      'dd4ec289-e01d-41c9-bb89-70fa845d4bf2'
    ]
    PASSKEY_KINDS.forEach((kind) =>
      AUTHENTICATOR_PLACES.forEach((place) =>
        PLATFORMS.forEach((platform) =>
          aaguids.forEach((aaguid) => {
            const line = kindLineOf({ kind, place, aaguid }, platform)
            expectResolves(line.key)
            expectResolves(line.nameKey)
            expectResolves(lossLineKeyOf({ kind }))
          })
        )
      )
    )
  })
})
