/**
 * @jest-environment jsdom
 *
 * The card view mounted with the app's own components and the real en.json,
 * with fake carriers and a fake extension password ask passed as props.
 * Nothing is mocked. jsdom has no `TextEncoder`, which viem reads when it
 * loads, so the test sets Node's before it loads the modules.
 */
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { TextDecoder, TextEncoder } from 'util'

import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import type { ThemeProps } from '@common/styles/themeConfig'
import type { Address } from '@web/modules/social-recovery/sdk-interfaces'
import type {
  CardFile,
  CardLevel,
  PasswordAskAnswer
} from '@web/modules/social-recovery/setup/card'
import { pdfTextBlocks } from '@web/modules/social-recovery/setup/card/__tests__/harness'
import type {
  MissingPasswordRow,
  RecoveryPasswordCheck
} from '@web/modules/social-recovery/setup/card/types'
import { deferred } from '@web/modules/social-recovery/shared/chrome/__fixtures__/deferred'

Object.assign(globalThis, { TextEncoder, TextDecoder })
// React only runs effects and state updates inside act() when this flag is set.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const en: typeof import('@common/config/localization/translations/en.json') = require('@common/config/localization/translations/en.json')
const i18n: typeof import('@common/config/localization').default =
  require('@common/config/localization').default
const {
  ThemeContext
}: typeof import('@common/contexts/themeContext') = require('@common/contexts/themeContext')
const themeConfig: typeof import('@common/styles/themeConfig') = require('@common/styles/themeConfig')
const RecoveryCardView: typeof import('@web/modules/social-recovery/setup/card/RecoveryCardView').default =
  require('@web/modules/social-recovery/setup/card/RecoveryCardView').default
const {
  cardFileOf
}: typeof import('@web/modules/social-recovery/setup/card/file') = require('@web/modules/social-recovery/setup/card/file')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

// Given in lower case; the card shows its checksummed form.
const ACCOUNT = '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed' as Address
const CHECKSUMMED = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'
const PASSWORD = 'tide<lantern>&"orchid\'s'
const S = en.socialRecovery
const t = (key: string): string => i18n.t(key)
const TYPED = 'harbor quill meadow'
const LINES = [
  S.card.lines.guide,
  S.card.lines.cannotMoveFunds,
  S.card.lines.keepAway,
  S.card.lines.photograph
]

// What a card must never name: a method, a threshold, a waiting period.
const METHOD_NAMES = Object.values(S.methodNames).map((name) => name.toLowerCase())
const METHOD_WORDS =
  /passkey|passport|guardian|aadhaar|e-?mail|hardware key|\bzk|signer|authenticator/i
const THRESHOLD_WORDS =
  /threshold|\b\d+\s+of\s+\d+\b|\bany\s+\d+\b|\bboth\b|\beither\b|quorum|must answer/i
const WAITING_WORDS = /waiting|\bdelay|timelock|\b\d+\s*(?:minute|hour|day|week|month)s?\b/i
const ADDRESSES = /0x[0-9a-fA-F]{40}/g

const THEME = Object.fromEntries(
  Object.entries(themeConfig.default).map(([name, byType]) => [
    name,
    byType[themeConfig.THEME_TYPES.LIGHT]
  ])
) as ThemeProps

const THEME_CONTEXT: ThemeContextReturnType = {
  theme: THEME,
  themeType: themeConfig.THEME_TYPES.LIGHT,
  selectedThemeType: themeConfig.THEME_TYPES.LIGHT,
  setThemeType: () => {}
}

describe('the recovery card view', () => {
  let container: HTMLDivElement
  let root: Root
  let files: CardFile[]
  let printed: { printView: boolean; printCardText: string }[]
  let onCarried: jest.Mock
  let onBack: jest.Mock
  let onContinue: jest.Mock
  let onSetPasswordAgain: jest.Mock

  const download = (file: CardFile) => {
    files.push(file)
  }
  const print = () => {
    const printView = document.querySelector<HTMLElement>('[data-testid="print-view"]')
    printed.push({
      printView: !!printView && printView.parentElement === document.body,
      printCardText:
        document.querySelector<HTMLElement>('[data-testid="print-card"]')?.textContent ?? ''
    })
  }

  // The ask the screen fills with the keystore's unlock, reduced to its lead and its two answers.
  const renderPasswordAsk = ({ onConfirmed, onCancel }: PasswordAskAnswer) => (
    <div>
      <p>{S.card.carrierAsks}</p>
      <button type="button" data-testid="ask-confirm" onClick={onConfirmed}>
        confirm
      </button>
      <button type="button" data-testid="ask-cancel" onClick={onCancel}>
        cancel
      </button>
    </div>
  )

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    files = []
    printed = []
    onCarried = jest.fn()
    onBack = jest.fn()
    onContinue = jest.fn()
    onSetPasswordAgain = jest.fn()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  // A password left out of the options is the one held; `null` is none held.
  const mount = async ({
    level = 'hidden',
    password = PASSWORD,
    carriedBefore = false,
    missingPassword = { kind: 'gone' }
  }: {
    level?: CardLevel
    password?: string | null
    carriedBefore?: boolean
    missingPassword?: MissingPasswordRow
  } = {}) => {
    await act(async () => {
      root.render(
        <ThemeContext.Provider value={THEME_CONTEXT}>
          <RecoveryCardView
            account={ACCOUNT}
            level={level}
            password={password ?? undefined}
            missingPassword={missingPassword}
            carriedBefore={carriedBefore}
            onCarried={onCarried}
            carriers={{ download, print }}
            renderPasswordAsk={renderPasswordAsk}
            onSetPasswordAgain={onSetPasswordAgain}
            onBack={onBack}
            onContinue={onContinue}
          />
        </ThemeContext.Provider>
      )
    })
  }

  const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)
  const allByTestId = (id: string) =>
    Array.from(
      container.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`),
      (node) => node.textContent
    )
  const cardText = () => byTestId('recovery-card')?.textContent ?? ''
  const isDisabled = (id: string) => byTestId(id)?.getAttribute('aria-disabled') === 'true'

  const press = async (id: string) => {
    const node = byTestId(id)
    if (!node) {
      throw new Error(`nothing to press: ${id}`)
    }
    await act(async () => {
      node.click()
    })
  }

  // The file's card as its rows read: each label with its value in the
  // fixed-width font, then each line in the regular one.
  const fileRows = (file: CardFile) => {
    const blocks = pdfTextBlocks(file.bytes)
    return {
      values: blocks.flatMap((block, at) =>
        block.font === '/F3' ? [[blocks[at - 1]?.text, block.text]] : []
      ),
      lines: blocks.filter((block) => block.font === '/F1').map((block) => block.text),
      text: blocks.map((block) => block.text).join('\n')
    }
  }

  const expectNamesNothingToPhish = (text: string) => {
    METHOD_NAMES.forEach((name) => expect(text.toLowerCase()).not.toContain(name))
    expect(text).not.toMatch(METHOD_WORDS)
    expect(text).not.toMatch(THRESHOLD_WORDS)
    expect(text).not.toMatch(WAITING_WORDS)
    expect(text.match(ADDRESSES)).toEqual([CHECKSUMMED])
  }

  describe('at the hidden level', () => {
    it('carries exactly the account, the password row and the four lines in order', async () => {
      await mount()
      expect(byTestId('card-account')?.textContent).toBe(CHECKSUMMED)
      expect(allByTestId('card-password')).toHaveLength(1)
      expect(allByTestId('card-line')).toEqual(LINES)
      expect(cardText()).toBe(
        [
          S.card.cardTitle,
          S.display.values.account,
          CHECKSUMMED,
          S.display.passwords.recoveryPassword,
          S.display.hiddenValue,
          S.display.hiddenChip,
          S.card.reveal,
          ...LINES
        ].join('')
      )
    })

    it('shows the address whole, 42 characters with no separator', async () => {
      await mount()
      const address = byTestId('card-account')?.textContent ?? ''
      expect(address).toHaveLength(42)
      expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/)
    })

    it('names no method, no threshold, no waiting period and no other address', async () => {
      await mount()
      await press('card-reveal')
      expectNamesNothingToPhish(cardText())
    })

    it('hides the password by default, reveals it on the action and hides it again', async () => {
      await mount()
      expect(byTestId('card-password-value')?.textContent).toBe(S.display.hiddenValue)
      expect(byTestId('card-password-chip')?.textContent).toBe(S.display.hiddenChip)
      expect(document.body.textContent).not.toContain(PASSWORD)

      await press('card-reveal')
      expect(byTestId('card-password-value')?.textContent).toBe(PASSWORD)
      expect(byTestId('card-password-chip')).toBeNull()
      expect(byTestId('card-reveal')?.textContent).toBe(S.card.hide)

      await press('card-reveal')
      expect(byTestId('card-password-value')?.textContent).toBe(S.display.hiddenValue)
      expect(byTestId('card-password-chip')?.textContent).toBe(S.display.hiddenChip)
      expect(byTestId('card-reveal')?.textContent).toBe(S.card.reveal)
      expect(document.body.textContent).not.toContain(PASSWORD)
    })

    it('saves a file with the account, the password in clear and the four lines', async () => {
      await mount()
      await press('card-download')
      expect(files).toHaveLength(1)
      const rows = fileRows(files[0])
      expect(rows.values).toEqual([
        [S.display.values.account, CHECKSUMMED],
        [S.display.passwords.recoveryPassword, PASSWORD]
      ])
      expect(rows.lines).toEqual(LINES)
      expectNamesNothingToPhish(rows.text)
      expect(onCarried).toHaveBeenCalledTimes(1)
    })

    it('offers two carriers, download and print, and no hand-off to another device', async () => {
      await mount()
      const row = byTestId('card-download')?.parentElement
      expect(Array.from(row?.children ?? [], (node) => node.getAttribute('data-testid'))).toEqual([
        'card-download',
        'card-print'
      ])
      expect(byTestId('card-download')?.textContent).toBe(S.card.downloadPdf)
      expect(byTestId('card-print')?.textContent).toBe(S.card.print)
      expect(byTestId('card-send')).toBeNull()
      expect(container.querySelectorAll('[data-testid^="card-send"]')).toHaveLength(0)
    })

    it('hands the download carrier the card as a PDF file', async () => {
      await mount()
      await press('card-download')
      expect(files).toHaveLength(1)
      expect(files[0].type).toBe('application/pdf')
      expect(files[0].name.endsWith('.pdf')).toBe(true)
      expect(String.fromCharCode(...files[0].bytes.slice(0, 5))).toBe('%PDF-')
      const expected = cardFileOf({ account: ACCOUNT, level: 'hidden', password: PASSWORD }, t)
      expect(Array.from(files[0].bytes)).toEqual(Array.from(expected.bytes))
      expect(files[0].replacedCharacters).toBe(false)
    })

    it('saves a password with inner and trailing spaces exactly as typed', async () => {
      const spaced = ' tide  lantern orchid '
      await mount({ password: spaced })
      await press('card-download')
      expect(files).toHaveLength(1)
      expect(fileRows(files[0]).values[1]).toEqual([S.display.passwords.recoveryPassword, spaced])
    })

    it('prints with the card mounted under the page body, then takes the print view away', async () => {
      await mount()
      await press('card-print')
      expect(printed).toHaveLength(1)
      expect(printed[0].printView).toBe(true)
      expect(printed[0].printCardText).toContain(CHECKSUMMED)
      expect(printed[0].printCardText).toContain(PASSWORD)
      expect(document.querySelector('[data-testid="print-view"]')).toBeNull()
      expect(document.body.textContent).not.toContain(PASSWORD)
      expect(onCarried).toHaveBeenCalledTimes(1)
    })
  })

  describe('at the hidden level with a password the PDF cannot carry exactly', () => {
    const OUTSIDE = '日本 🔑'
    // The same letters the file would write for the password above.
    const CODE_LETTERS = 'U+65E5U+672C U+1F511'

    it('turns the download off, says why, and never hands over a file', async () => {
      await mount({ password: OUTSIDE })
      expect(byTestId('card-download-unavailable')?.textContent).toBe(S.card.downloadUnavailable)
      expect(isDisabled('card-download')).toBe(true)
      expect(isDisabled('card-print')).toBe(false)
      await press('card-download')
      expect(files).toHaveLength(0)
      expect(onCarried).not.toHaveBeenCalled()
    })

    it('still prints the card with the password as typed', async () => {
      await mount({ password: OUTSIDE })
      await press('card-print')
      expect(printed).toHaveLength(1)
      expect(printed[0].printCardText).toContain(OUTSIDE)
      expect(files).toHaveLength(0)
      expect(onCarried).toHaveBeenCalledTimes(1)
    })

    it('asks nothing for a download on a card carried before, while print still asks', async () => {
      await mount({ password: OUTSIDE, carriedBefore: true })
      await press('card-download')
      expect(byTestId('card-password-ask')).toBeNull()
      expect(byTestId('card-recovery-password-ask')).toBeNull()
      expect(byTestId('ask-confirm')).toBeNull()
      expect(files).toHaveLength(0)
      expect(onCarried).not.toHaveBeenCalled()

      await press('card-print')
      expect(byTestId('card-password-ask')).not.toBeNull()
      expect(printed).toHaveLength(0)
      await press('ask-confirm')
      expect(printed).toHaveLength(1)
      expect(files).toHaveLength(0)
      expect(onCarried).toHaveBeenCalledTimes(1)
    })

    it('downloads a password typed as those code letters and gives it back exactly', async () => {
      await mount({ password: CODE_LETTERS })
      expect(byTestId('card-download-unavailable')).toBeNull()
      expect(isDisabled('card-download')).toBe(false)
      await press('card-download')
      expect(files).toHaveLength(1)
      expect(files[0].replacedCharacters).toBe(false)
      expect(fileRows(files[0]).values[1]).toEqual([
        S.display.passwords.recoveryPassword,
        CODE_LETTERS
      ])
    })
  })

  describe('at the public level', () => {
    it('carries the account and the four lines, with no password row', async () => {
      await mount({ level: 'public' })
      expect(byTestId('card-password')).toBeNull()
      expect(byTestId('card-reveal')).toBeNull()
      expect(cardText()).toBe(
        [S.card.cardTitle, S.display.values.account, CHECKSUMMED, ...LINES].join('')
      )
      expectNamesNothingToPhish(cardText())
    })

    it('carries no password in the print or the file even when one is held', async () => {
      await mount({ level: 'public' })
      await press('card-print')
      expect(printed[0].printCardText).toBe(
        [S.card.cardTitle, S.display.values.account, CHECKSUMMED, ...LINES].join('')
      )

      await press('card-download')
      await press('ask-confirm')
      const rows = fileRows(files[0])
      expect(rows.values).toEqual([[S.display.values.account, CHECKSUMMED]])
      expect(rows.lines).toEqual(LINES)
      expect(fileRows(files[0]).text).not.toContain('orchid')
    })
  })

  describe('at the hidden level with no password held', () => {
    it('says the password is gone in the password row, with no value and no reveal', async () => {
      await mount({ password: null })
      expect(allByTestId('card-password')).toHaveLength(1)
      expect(byTestId('card-password-gone')?.textContent).toBe(S.card.passwordGone)
      expect(byTestId('card-password-gone-action')?.textContent).toBe(S.card.passwordGoneAction)
      expect(byTestId('card-reveal')).toBeNull()
      expect(byTestId('card-password-value')).toBeNull()
      expect(byTestId('card-password-chip')).toBeNull()
      expect(cardText()).toBe(
        [
          S.card.cardTitle,
          S.display.values.account,
          CHECKSUMMED,
          S.display.passwords.recoveryPassword,
          S.card.passwordGone,
          S.card.passwordGoneAction,
          ...LINES
        ].join('')
      )
    })

    it('leads to setting the password again through its handler', async () => {
      await mount({ password: null })
      await press('card-password-gone-action')
      expect(onSetPasswordAgain).toHaveBeenCalledTimes(1)
      expect(onBack).not.toHaveBeenCalled()
      expect(onContinue).not.toHaveBeenCalled()
      expect(onCarried).not.toHaveBeenCalled()
    })

    it('disables every carrier, so nothing carries a card without its password', async () => {
      await mount({ password: null })
      expect(['card-download', 'card-print'].map(isDisabled)).toEqual([true, true])
      await press('card-download')
      await press('card-print')
      expect(files).toHaveLength(0)
      expect(printed).toHaveLength(0)
      expect(byTestId('card-password-ask')).toBeNull()
      expect(onCarried).not.toHaveBeenCalled()
    })

    it('offers the way back to the password beside back and continue', async () => {
      await mount({ password: null })
      const actions = Array.from(container.querySelectorAll<HTMLElement>('[data-testid]'), (node) =>
        node.getAttribute('data-testid')
      )
      expect(actions.filter((id) => id !== 'card-line')).toEqual([
        'card-screen',
        'recovery-card',
        'card-account',
        'card-password',
        'card-password-gone',
        'card-password-gone-action',
        'card-download',
        'card-print',
        'card-why',
        'card-warns',
        'card-continue',
        'card-back'
      ])
    })

    it('shows no gone line when a password is held or at the public level', async () => {
      await mount()
      expect(byTestId('card-password-gone')).toBeNull()
      expect(byTestId('card-password-gone-action')).toBeNull()
      expect(byTestId('card-reveal')).not.toBeNull()

      await mount({ level: 'public', password: null })
      expect(byTestId('card-password')).toBeNull()
      expect(byTestId('card-password-gone')).toBeNull()
      expect(isDisabled('card-download')).toBe(false)
      await press('card-download')
      expect(files).toHaveLength(1)
    })
  })

  describe('the re-download', () => {
    it('runs the first carrier at once and asks the extension password for the second', async () => {
      await mount()
      await press('card-download')
      expect(files).toHaveLength(1)
      expect(byTestId('card-password-ask')).toBeNull()

      await press('card-print')
      expect(byTestId('card-password-ask')).not.toBeNull()
      expect(byTestId('card-download')).toBeNull()
      expect(byTestId('card-print')).toBeNull()
      expect(printed).toHaveLength(0)
      expect(onCarried).toHaveBeenCalledTimes(1)

      await press('ask-confirm')
      expect(printed).toHaveLength(1)
      expect(byTestId('card-password-ask')).toBeNull()
      expect(byTestId('card-download')).not.toBeNull()
      expect(onCarried).toHaveBeenCalledTimes(2)
    })

    it('takes back and continue away while the ask shows and brings them back on either answer', async () => {
      await mount()
      await press('card-download')
      expect(byTestId('card-back')).not.toBeNull()
      expect(byTestId('card-continue')).not.toBeNull()

      await press('card-download')
      expect(byTestId('card-password-ask')).not.toBeNull()
      expect(byTestId('card-back')).toBeNull()
      expect(byTestId('card-continue')).toBeNull()

      await press('ask-cancel')
      expect(byTestId('card-back')).not.toBeNull()
      expect(byTestId('card-continue')).not.toBeNull()

      await press('card-print')
      expect(byTestId('card-back')).toBeNull()
      expect(byTestId('card-continue')).toBeNull()
      await press('ask-confirm')
      expect(printed).toHaveLength(1)
      expect(byTestId('card-back')).not.toBeNull()
      expect(byTestId('card-continue')).not.toBeNull()
      expect(onBack).not.toHaveBeenCalled()
      expect(onContinue).not.toHaveBeenCalled()
    })

    it('runs nothing when the ask is cancelled and brings the carriers back', async () => {
      await mount()
      await press('card-download')
      await press('card-download')
      await press('ask-cancel')
      expect(files).toHaveLength(1)
      expect(onCarried).toHaveBeenCalledTimes(1)
      expect(byTestId('card-password-ask')).toBeNull()
      expect(byTestId('card-download')).not.toBeNull()

      await press('card-download')
      expect(byTestId('card-password-ask')).not.toBeNull()
    })

    it('asks before the first carrier when the card was carried earlier in this tab', async () => {
      await mount({ carriedBefore: true })
      await press('card-download')
      expect(files).toHaveLength(0)
      expect(byTestId('card-password-ask')).not.toBeNull()
      await press('ask-confirm')
      expect(files).toHaveLength(1)
      expect(fileRows(files[0]).values[1]).toEqual([S.display.passwords.recoveryPassword, PASSWORD])
    })
  })

  describe('around the card', () => {
    it('keeps why the setup is not on the card closed until asked', async () => {
      await mount()
      expect(byTestId('card-why')?.textContent).toBe(S.card.whyNotOnCard)
      expect(byTestId('card-why-body')).toBeNull()
      await press('card-why')
      expect(byTestId('card-why-body')?.textContent).toBe(S.card.whyNotOnCardBody)
      await press('card-why')
      expect(byTestId('card-why-body')).toBeNull()
    })

    it('says what warns the holder in one banner line, with no alert settings', async () => {
      await mount()
      expect(byTestId('card-warns')?.textContent).toBe(S.card.warnsHeader + S.card.banner)
      expect(byTestId('card-warns')?.children).toHaveLength(2)
      expect(container.textContent).not.toMatch(/alert|notif|e-?mail|push|telegram|sms/i)
      expect(container.querySelector('input')).toBeNull()
    })

    it('says every later carrier asks the extension password once, under the carriers or as the ask', async () => {
      const count = () => (container.textContent ?? '').split(S.card.carrierAsks).length - 1
      await mount()
      expect(count()).toBe(1)
      await press('card-download')
      await press('card-download')
      expect(byTestId('card-password-ask')).not.toBeNull()
      expect(count()).toBe(1)
      expect(byTestId('card-password-ask')?.textContent).toContain(S.card.carrierAsks)
      await press('ask-cancel')
      expect(count()).toBe(1)
    })

    it('goes back and continues through its handlers', async () => {
      await mount()
      await press('card-back')
      expect(onBack).toHaveBeenCalledTimes(1)
      expect(onContinue).not.toHaveBeenCalled()
      await press('card-continue')
      expect(onContinue).toHaveBeenCalledTimes(1)
    })
  })

  describe('the password row while the setup is read or the password is asked again', () => {
    const askField = () =>
      container.querySelector<HTMLInputElement>('[data-testid="card-recovery-password-ask"] input')
    const typeAsk = async (value: string) => {
      const node = askField()
      if (!node) {
        throw new Error('no recovery password field')
      }
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(node, value)
        node.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }
    const askWith = (check: jest.Mock): MissingPasswordRow => ({ kind: 'ask', check })

    it('holds the label alone while the setup is read, with every carrier off', async () => {
      await mount({ password: null, missingPassword: { kind: 'reading' } })
      expect(allByTestId('card-password')).toEqual([
        t('socialRecovery.display.passwords.recoveryPassword')
      ])
      expect(byTestId('card-password-gone')).toBeNull()
      expect(byTestId('card-recovery-password-ask')).toBeNull()
      expect(container.querySelector('input')).toBeNull()
      expect(['card-download', 'card-print'].map(isDisabled)).toEqual([true, true])
    })

    it('asks the recovery password in the row, beside back and continue, with every carrier off', async () => {
      await mount({ password: null, missingPassword: askWith(jest.fn()) })
      expect(byTestId('card-recovery-password-lead')?.textContent).toBe(
        t('socialRecovery.card.passwordAsk')
      )
      expect(askField()?.getAttribute('aria-label')).toBe(
        t('socialRecovery.display.passwords.recoveryPassword')
      )
      expect(byTestId('card-recovery-password-check')?.textContent).toBe(
        t('socialRecovery.card.passwordAskAction')
      )
      expect(isDisabled('card-recovery-password-check')).toBe(true)
      expect(['card-download', 'card-print'].map(isDisabled)).toEqual([true, true])
      const ids = Array.from(container.querySelectorAll<HTMLElement>('[data-testid]'), (node) =>
        node.getAttribute('data-testid')
      )
      expect(ids).not.toContain('card-password-gone')
      expect(ids).not.toContain('card-password-gone-action')
      expect(ids).not.toContain('card-reveal')
      expect(ids.indexOf('card-recovery-password-ask')).toBeGreaterThan(
        ids.indexOf('card-password')
      )
      expect(ids.indexOf('card-recovery-password-ask')).toBeLessThan(ids.indexOf('card-line'))
      expect(ids).toContain('card-back')
      expect(ids).toContain('card-continue')
    })

    it('shows no ask once a password is held or at the public level', async () => {
      await mount({ missingPassword: askWith(jest.fn()) })
      expect(byTestId('card-recovery-password-ask')).toBeNull()
      expect(byTestId('card-reveal')).not.toBeNull()

      await mount({ level: 'public', password: null, missingPassword: askWith(jest.fn()) })
      expect(byTestId('card-recovery-password-ask')).toBeNull()
      expect(byTestId('card-password')).toBeNull()
    })

    it('hands the typed value to the check and empties the field once it opens', async () => {
      const check = jest.fn(async (): Promise<RecoveryPasswordCheck> => 'opened')
      await mount({ password: null, missingPassword: askWith(check) })
      await typeAsk(TYPED)
      expect(isDisabled('card-recovery-password-check')).toBe(false)
      await press('card-recovery-password-check')
      expect(check.mock.calls).toEqual([[TYPED]])
      expect(askField()?.value).toBe('')
      expect(byTestId('card-recovery-password-wrong')).toBeNull()
      expect(byTestId('card-recovery-password-unchecked')).toBeNull()
    })

    it('says a wrong password is wrong and empties the field', async () => {
      const check = jest.fn(async (): Promise<RecoveryPasswordCheck> => 'wrong')
      await mount({ password: null, missingPassword: askWith(check) })
      await typeAsk(TYPED)
      await press('card-recovery-password-check')
      expect(byTestId('card-recovery-password-wrong')?.textContent).toBe(
        t('socialRecovery.card.wrongRecoveryPassword')
      )
      expect(askField()?.value).toBe('')
      expect(isDisabled('card-recovery-password-check')).toBe(true)
    })

    it('says a check that could not run, or that threw, could not check, and keeps the value', async () => {
      const check = jest
        .fn<Promise<RecoveryPasswordCheck>, [string]>()
        .mockResolvedValueOnce('unchecked')
        .mockRejectedValueOnce(new Error('the check threw'))
      await mount({ password: null, missingPassword: askWith(check) })
      await typeAsk(TYPED)
      await press('card-recovery-password-check')
      expect(byTestId('card-recovery-password-unchecked')?.textContent).toBe(
        t('socialRecovery.card.passwordUnchecked')
      )
      expect(askField()?.value).toBe(TYPED)

      await press('card-recovery-password-check')
      expect(byTestId('card-recovery-password-unchecked')?.textContent).toBe(
        t('socialRecovery.card.passwordUnchecked')
      )
      expect(askField()?.value).toBe(TYPED)
      expect(check).toHaveBeenCalledTimes(2)
    })

    it('clears the earlier line on a new check and keeps the button off while it runs', async () => {
      const second = deferred<RecoveryPasswordCheck>()
      const check = jest
        .fn<Promise<RecoveryPasswordCheck>, [string]>()
        .mockResolvedValueOnce('wrong')
        .mockReturnValueOnce(second.promise)
      await mount({ password: null, missingPassword: askWith(check) })
      await typeAsk('not the password')
      await press('card-recovery-password-check')
      expect(byTestId('card-recovery-password-wrong')).not.toBeNull()

      await typeAsk(TYPED)
      await press('card-recovery-password-check')
      expect(byTestId('card-recovery-password-wrong')).toBeNull()
      expect(isDisabled('card-recovery-password-check')).toBe(true)
      await press('card-recovery-password-check')
      expect(check).toHaveBeenCalledTimes(2)

      await act(async () => {
        second.resolve('stale')
      })
      expect(byTestId('card-recovery-password-wrong')).toBeNull()
      expect(byTestId('card-recovery-password-unchecked')).toBeNull()
      expect(isDisabled('card-recovery-password-check')).toBe(false)
    })
  })
})
