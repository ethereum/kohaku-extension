/**
 * @jest-environment jsdom
 */
import type { Clause, Credential, SetupDraft } from '@web/modules/social-recovery/sdk-interfaces'
import type { WalletRecords } from '@web/modules/social-recovery/shared/records'

import type {
  Harness,
  StorageFaults
} from '@web/modules/social-recovery/setup/privacy/__tests__/harness'
import {
  ACCOUNT,
  CHAIN_ID,
  draftOf,
  harnessOf,
  holdReads,
  recordsOn
} from '@web/modules/social-recovery/setup/privacy/__tests__/harness'

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const en: typeof import('@common/config/localization/translations/en.json') = require('@common/config/localization/translations/en.json')
const {
  WEB_ROUTES
}: typeof import('@common/modules/router/constants/common') = require('@common/modules/router/constants/common')
const {
  addressBookOf,
  privacyLevelOf,
  shapeNoteOf,
  WALLET_RECOVERY_CHAIN
}: typeof import('@web/modules/social-recovery/shared/client') = require('@web/modules/social-recovery/shared/client')
const {
  readPublicNote
}: typeof import('@web/modules/social-recovery/sdk-doubles') = require('@web/modules/social-recovery/sdk-doubles')
const {
  PASSWORD_SET,
  readRecoveryPassword,
  setRecoveryPassword,
  wipeRecoveryPassword
}: typeof import('@web/modules/social-recovery/shared/records') = require('@web/modules/social-recovery/shared/records')
const PrivacyView: typeof import('@web/modules/social-recovery/setup/privacy/PrivacyView').default =
  require('@web/modules/social-recovery/setup/privacy/PrivacyView').default
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const L = en.socialRecovery.privacy.level
const S = en.socialRecovery
const SENTENCE = en.socialRecovery.shape.sentence

// Fills the `{{name}}` slots of a string from the table.
const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce(
    (text, [name, value]) => text.split(`{{${name}}}`).join(String(value)),
    template
  )
const BOOK = addressBookOf(WALLET_RECOVERY_CHAIN)
const ZERO = '0x0000000000000000000000000000000000000000'

// Any line claiming a level hides that a setup exists.
const HIDES_EXISTENCE = /nobody can see|hides that|no one can see|nobody knows/i

const slot = (kind: string): Credential => ({ method: ZERO, config: '0x', label: kind })
const guardian: Credential = { method: BOOK.methods.ecdsa, config: '0x0a' }
const passkey: Credential = { method: BOOK.methods.passkey, config: '0x01' }
const passport: Credential = { method: BOOK.methods.zkpassport, config: '0x02' }
const aadhaar: Credential = { method: BOOK.methods.aadhaar, config: '0x03' }

const PASSKEY_AND_PASSPORT: Clause[] = [{ threshold: 1, credentials: [passkey, passport] }]
const GUARDIAN_SLOTS_BESIDE_PASSKEY_AND_PASSPORT: Clause[] = [
  { threshold: 1, credentials: [passkey] },
  { threshold: 2, credentials: [slot('ecdsa'), slot('ecdsa'), slot('zkpassport')] }
]
const ENROLLED_GUARDIAN_BESIDE_PASSKEY_AND_PASSPORT: Clause[] = [
  { threshold: 2, credentials: [passkey, guardian, passport] }
]
const PASSKEY_PASSPORT_AND_GUARDIAN: Clause[] = [
  { threshold: 2, credentials: [passkey, passport, guardian] }
]

// The shape of the path above as a stranger reads it at Shape visible.
const PASSKEY_PASSPORT_AND_GUARDIAN_SHAPE = fill(SENTENCE.list, {
  first: fill(SENTENCE.list, {
    first: SENTENCE.kinds.passkey,
    rest: fill(SENTENCE.pair, { first: SENTENCE.kinds.passport, second: SENTENCE.kinds.guardian })
  }),
  rest: fill(SENTENCE.anyOf, { threshold: 2, count: 3 })
})

// A draft stored at Shape visible: a sealed backup beside the note of its shape.
const shapeVisibleDraft = (clauses: Clause[]) => {
  const { wait, ignoresPause } = draftOf()
  return draftOf({
    clauses,
    privacy: { backup: 'encrypted', publicMetadata: shapeNoteOf({ clauses, wait, ignoresPause }) }
  })
}

describe('the privacy step', () => {
  let h: Harness

  beforeEach(() => {
    h = harnessOf(PrivacyView)
    wipeRecoveryPassword(CHAIN_ID, ACCOUNT)
  })

  afterEach(() => {
    h.unmount()
    wipeRecoveryPassword(CHAIN_ID, ACCOUNT)
  })

  const withDraft = async (overrides: Parameters<typeof draftOf>[0] = {}) => {
    const records = recordsOn()
    await records.setup(CHAIN_ID, ACCOUNT).setupDraft.write(draftOf(overrides))
    return records
  }

  const storedDraft = async (records: WalletRecords) => {
    const read = await records.setup(CHAIN_ID, ACCOUNT).setupDraft.read()
    if (read.status !== 'present') {
      throw new Error('no draft stored')
    }
    return read.value
  }

  const flagOf = async (records: WalletRecords) => {
    const read = await records.setup(CHAIN_ID, ACCOUNT).passwordSet.read()
    return read.status === 'present' ? read.value : undefined
  }

  const typePasswords = async (password: string, confirmation: string) => {
    await h.type('password', password)
    await h.type('password-confirmation', confirmation)
  }

  const radioNodes = () =>
    Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid="privacy-screen"] [role="radio"]')
    )

  const radioIds = () => radioNodes().map((radio) => radio.getAttribute('data-testid'))

  const checkedRadios = () =>
    radioNodes()
      .filter((radio) => radio.getAttribute('aria-checked') === 'true')
      .map((radio) => radio.getAttribute('data-testid'))

  // Continues at whatever level the step opened on, and reads back what it stored.
  const continueAsOpened = async (records: WalletRecords) => {
    if (h.inputOf('password')) {
      await typePasswords('correct horse', 'correct horse')
    }
    await h.press('continue')
    return (await storedDraft(records)).privacy
  }

  const exposureText = () =>
    ['exposure-guardians', 'exposure-unguessable', 'exposure-publication'].map(
      (id) => h.byTestId(id)?.textContent ?? null
    )

  describe('the levels', () => {
    it('offers three radios, Private, Shape visible then Public, each with its label and exact line', async () => {
      await h.mount(await withDraft({ clauses: PASSKEY_PASSPORT_AND_GUARDIAN }))
      const radios = Array.from(
        document.querySelectorAll<HTMLElement>('[data-testid="privacy-screen"] [role="radio"]')
      )
      expect(radios.map((radio) => radio.getAttribute('data-testid'))).toEqual([
        'level-private',
        'level-shape-visible',
        'level-public'
      ])
      expect(h.byTestId('level-private')?.textContent).toContain(L.private.label)
      expect(h.byTestId('level-shape-visible')?.textContent).toContain(L.shapeVisible.label)
      expect(h.byTestId('level-public')?.textContent).toContain(L.public.label)
      expect(h.byTestId('level-line-private')?.textContent).toBe(L.private.line)
      expect(h.byTestId('level-line-shape-visible')?.textContent).toBe(
        fill(L.shapeVisible.line, { shape: PASSKEY_PASSPORT_AND_GUARDIAN_SHAPE })
      )
      expect(h.byTestId('level-line-public')?.textContent).toBe(L.public.line)
      expect(h.byTestId('level-private')?.textContent).toContain(L.private.badge)
      expect(h.byTestId('level-shape-visible')?.textContent).not.toContain(L.private.badge)
    })

    it('the Shape visible line names the path by its kinds of method and how many must answer', async () => {
      await h.mount(await withDraft({ clauses: PASSKEY_PASSPORT_AND_GUARDIAN }))
      expect(h.byTestId('level-line-shape-visible')?.textContent).toBe(
        'The shape of your setup is readable: a passkey, a passport and a guardian, any 2 of 3. Which ones stays hidden.'
      )
    })

    it('a draft stored at Private opens on Private', async () => {
      const privacy = { backup: 'encrypted', publicMetadata: '0x' } as const
      const records = await withDraft({ clauses: PASSKEY_PASSPORT_AND_GUARDIAN, privacy })
      await h.mount(records)
      expect(h.inputOf('password')).not.toBeNull()
      expect(await continueAsOpened(records)).toEqual(privacy)
    })

    it('a draft stored at Shape visible opens on Shape visible', async () => {
      const draft = shapeVisibleDraft(PASSKEY_PASSPORT_AND_GUARDIAN)
      const records = recordsOn()
      await records.setup(CHAIN_ID, ACCOUNT).setupDraft.write(draft)
      await h.mount(records)
      expect(h.inputOf('password')).not.toBeNull()
      expect(await continueAsOpened(records)).toEqual(draft.privacy)
    })

    it('a draft stored in the clear opens on Public', async () => {
      const privacy = { backup: 'clear', publicMetadata: '0x' } as const
      const records = await withDraft({ clauses: PASSKEY_PASSPORT_AND_GUARDIAN, privacy })
      await h.mount(records)
      expect(h.inputOf('password')).toBeNull()
      expect(await continueAsOpened(records)).toEqual(privacy)
    })

    it('a draft stored at Shape visible with no member opens on Shape visible and continue keeps it', async () => {
      const draft = shapeVisibleDraft([])
      const records = recordsOn()
      await records.setup(CHAIN_ID, ACCOUNT).setupDraft.write(draft)
      await h.mount(records)
      expect(radioIds()).toEqual(['level-private', 'level-shape-visible', 'level-public'])
      expect(checkedRadios()).toEqual(['level-shape-visible'])
      expect(h.byTestId('level-line-shape-visible')?.textContent).toBe(L.shapeVisible.lineEmpty)
      const privacy = await continueAsOpened(records)
      expect(privacy).toEqual(draft.privacy)
      expect(privacyLevelOf(privacy)).toBe('shape-visible')
    })

    it('a path whose groups have no member offers Shape visible with the line that names no shape', async () => {
      await h.mount(await withDraft({ clauses: [{ threshold: 1, credentials: [] }] }))
      expect(radioIds()).toEqual(['level-private', 'level-shape-visible', 'level-public'])
      expect(h.byTestId('level-shape-visible')?.textContent).toContain(L.shapeVisible.label)
      expect(h.byTestId('level-line-shape-visible')?.textContent).toBe(L.shapeVisible.lineEmpty)
      expect(h.byTestId('level-line-private')?.textContent).toBe(L.private.line)
      expect(h.byTestId('level-line-public')?.textContent).toBe(L.public.line)
    })

    it('a path whose groups have no member stores Shape visible as a sealed backup beside a note that reads back as Shape visible', async () => {
      const records = await withDraft({ clauses: [{ threshold: 1, credentials: [] }] })
      await h.mount(records)
      await h.press('level-shape-visible')
      expect(checkedRadios()).toEqual(['level-shape-visible'])
      await typePasswords('correct horse', 'correct horse')
      await h.press('continue')
      const { privacy } = await storedDraft(records)
      expect(privacy.backup).toBe('encrypted')
      expect(privacy.publicMetadata).not.toBe('0x')
      expect(privacyLevelOf(privacy)).toBe('shape-visible')
      expect(await flagOf(records)).toBe(PASSWORD_SET)
      expect(readRecoveryPassword(CHAIN_ID, ACCOUNT)).toBe('correct horse')
      expect(h.navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetupReview)
    })

    it('a path with a member never reads the line that names no shape', async () => {
      await h.mount(await withDraft({ clauses: PASSKEY_PASSPORT_AND_GUARDIAN }))
      expect(h.byTestId('level-line-shape-visible')?.textContent).not.toBe(L.shapeVisible.lineEmpty)
    })

    it('only the radio of a stored Public draft is checked', async () => {
      await h.mount(
        await withDraft({
          clauses: PASSKEY_PASSPORT_AND_GUARDIAN,
          privacy: { backup: 'clear', publicMetadata: '0x' }
        })
      )
      expect(checkedRadios()).toEqual(['level-public'])
      expect(
        radioNodes().filter((radio) => radio.getAttribute('aria-checked') === 'false')
      ).toHaveLength(2)
    })

    it('a press on Shape visible checks that radio alone', async () => {
      await h.mount(await withDraft({ clauses: PASSKEY_PASSPORT_AND_GUARDIAN }))
      expect(checkedRadios()).toEqual(['level-private'])
      await h.press('level-shape-visible')
      expect(checkedRadios()).toEqual(['level-shape-visible'])
    })

    it('opens on Private with no draft', async () => {
      const records = recordsOn()
      await h.mount(records)
      expect(await continueAsOpened(records)).toEqual({ backup: 'encrypted', publicMetadata: '0x' })
    })

    it('opens at Private, with the recovery password asked and no public line', async () => {
      await h.mount(recordsOn())
      expect(h.inputOf('password')).not.toBeNull()
      expect(h.inputOf('password-confirmation')).not.toBeNull()
      expect(h.byTestId('public-line')).toBeNull()
    })

    it('opens at Public for a draft stored in the clear', async () => {
      await h.mount(await withDraft({ privacy: { backup: 'clear', publicMetadata: '0x' } }))
      expect(h.inputOf('password')).toBeNull()
      expect(h.byTestId('public-line')).not.toBeNull()
    })

    it('never claims a level hides that a setup exists', async () => {
      await h.mount(await withDraft({ clauses: GUARDIAN_SLOTS_BESIDE_PASSKEY_AND_PASSPORT }))
      expect(h.text()).not.toMatch(HIDES_EXISTENCE)
      await h.press('level-public')
      expect(h.text()).not.toMatch(HIDES_EXISTENCE)
    })
  })

  describe('the exposure line', () => {
    const GUARDIANS =
      'Every guardian of your path is hidden from a stranger who cannot guess their address.'
    const PUBLICATION =
      'A recovery publishes the rule with its waiting period and every method in it, so every method of your path is exposed, the ones it used and the ones it did not.'
    const UNGUESSABLE =
      'Your passkey and your passport cannot be guessed at all and lose nothing before a recovery.'

    it('a path with guardian slots carries the guardian half and names the passkey and the passport', async () => {
      await h.mount(await withDraft({ clauses: GUARDIAN_SLOTS_BESIDE_PASSKEY_AND_PASSPORT }))
      expect(h.byTestId('exposure-guardians')?.textContent).toBe(GUARDIANS)
      expect(h.byTestId('exposure-unguessable')?.textContent).toBe(UNGUESSABLE)
      expect(h.byTestId('exposure-publication')?.textContent).toBe(PUBLICATION)
    })

    it('a path with an enrolled guardian carries the guardian half', async () => {
      await h.mount(await withDraft({ clauses: ENROLLED_GUARDIAN_BESIDE_PASSKEY_AND_PASSPORT }))
      expect(h.byTestId('exposure-guardians')?.textContent).toBe(GUARDIANS)
      expect(h.byTestId('exposure-unguessable')?.textContent).toBe(UNGUESSABLE)
    })

    it('a guardian beside an Aadhaar identity names the Aadhaar identity alone', async () => {
      await h.mount(
        await withDraft({ clauses: [{ threshold: 2, credentials: [guardian, aadhaar] }] })
      )
      expect(h.byTestId('exposure-guardians')?.textContent).toBe(GUARDIANS)
      expect(h.byTestId('exposure-unguessable')?.textContent).toBe(
        fill(L.exposure.unguessableOne, { items: S.disclosures.itemsLead.aadhaar })
      )
    })

    it('one passkey beside a guardian takes the singular line', async () => {
      await h.mount(
        await withDraft({ clauses: [{ threshold: 2, credentials: [guardian, passkey] }] })
      )
      expect(h.byTestId('exposure-unguessable')?.textContent).toBe(
        fill(L.exposure.unguessableOne, { items: S.disclosures.itemsLead.passkey })
      )
    })

    it('a passkey and a passport beside a guardian take the plural line and name both', async () => {
      await h.mount(await withDraft({ clauses: PASSKEY_PASSPORT_AND_GUARDIAN }))
      expect(h.byTestId('exposure-unguessable')?.textContent).toBe(
        fill(L.exposure.unguessable, {
          items: fill(S.disclosures.items.pair, {
            first: S.disclosures.itemsLead.passkey,
            second: S.disclosures.items.passport
          })
        })
      )
    })

    it('several passkeys beside a guardian take the plural line and name the passkeys', async () => {
      await h.mount(
        await withDraft({
          clauses: [
            { threshold: 2, credentials: [passkey, { ...passkey, config: '0x04' }, guardian] }
          ]
        })
      )
      expect(h.byTestId('exposure-unguessable')?.textContent).toBe(
        fill(L.exposure.unguessable, { items: S.disclosures.itemsLead.passkeys })
      )
    })

    it('a passkey, a passport and an Aadhaar slot beside a guardian are named as three', async () => {
      await h.mount(
        await withDraft({
          clauses: [
            { threshold: 1, credentials: [passkey] },
            { threshold: 2, credentials: [slot('ecdsa'), passport, slot('aadhaar')] }
          ]
        })
      )
      expect(h.byTestId('exposure-unguessable')?.textContent).toBe(
        'Your passkey, your passport and your Aadhaar identity cannot be guessed at all and lose nothing before a recovery.'
      )
    })

    it('a guardians-only path carries the guardian half and no unguessable line', async () => {
      await h.mount(
        await withDraft({ clauses: [{ threshold: 2, credentials: [guardian, slot('ecdsa')] }] })
      )
      expect(h.byTestId('exposure-guardians')?.textContent).toBe(GUARDIANS)
      expect(h.byTestId('exposure-unguessable')).toBeNull()
    })

    it('a passkey-and-passport path carries the publication half alone', async () => {
      await h.mount(await withDraft({ clauses: PASSKEY_AND_PASSPORT }))
      expect(h.byTestId('exposure-guardians')).toBeNull()
      expect(h.byTestId('exposure-unguessable')).toBeNull()
      expect(h.byTestId('exposure-publication')?.textContent).toBe(PUBLICATION)
    })

    it('a guardian path carries both halves at Private and the publication half alone at Public', async () => {
      await h.mount(await withDraft({ clauses: ENROLLED_GUARDIAN_BESIDE_PASSKEY_AND_PASSPORT }))
      expect(h.byTestId('exposure-guardians')?.textContent).toBe(GUARDIANS)
      expect(h.byTestId('exposure-publication')?.textContent).toBe(PUBLICATION)
      await h.press('level-public')
      expect(h.byTestId('exposure-guardians')).toBeNull()
      expect(h.byTestId('exposure-unguessable')).toBeNull()
      expect(h.byTestId('exposure-publication')?.textContent).toBe(PUBLICATION)
      await h.press('level-private')
      expect(h.byTestId('exposure-guardians')?.textContent).toBe(GUARDIANS)
      expect(h.byTestId('exposure-unguessable')?.textContent).toBe(UNGUESSABLE)
    })

    it('a guardian path stored in the clear opens with the publication half alone', async () => {
      await h.mount(
        await withDraft({
          clauses: GUARDIAN_SLOTS_BESIDE_PASSKEY_AND_PASSPORT,
          privacy: { backup: 'clear', publicMetadata: '0x' }
        })
      )
      expect(h.byTestId('exposure-guardians')).toBeNull()
      expect(h.byTestId('exposure-publication')?.textContent).toBe(PUBLICATION)
    })

    it('carries the publication half with no draft and at Public', async () => {
      await h.mount(recordsOn())
      expect(h.byTestId('exposure-publication')?.textContent).toBe(PUBLICATION)
      await h.press('level-public')
      expect(h.byTestId('exposure-publication')?.textContent).toBe(PUBLICATION)
    })
  })

  describe('at Private', () => {
    it('continue stores no public note beside the sealed backup', async () => {
      const records = recordsOn()
      await records
        .setup(CHAIN_ID, ACCOUNT)
        .setupDraft.write(shapeVisibleDraft(PASSKEY_PASSPORT_AND_GUARDIAN))
      await h.mount(records)
      await h.press('level-private')
      await typePasswords('correct horse', 'correct horse')
      await h.press('continue')
      expect((await storedDraft(records)).privacy).toEqual({
        backup: 'encrypted',
        publicMetadata: '0x'
      })
      expect(h.navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetupReview)
    })

    it('asks the recovery password twice beside both halves of the trade', async () => {
      await h.mount(recordsOn())
      const field = h.byTestId('recovery-password')
      expect(field?.querySelectorAll('input')).toHaveLength(2)
      expect(h.byTestId('trade-card')?.textContent).toBe(
        'Anyone holding the Recovery Card can read the recovery path and still cannot recover.'
      )
      expect(h.byTestId('trade-loss')?.textContent).toBe(
        'Lose both the card and the password and a fresh device cannot begin a recovery.'
      )
    })

    it('names the field the recovery password, never the extension password', async () => {
      await h.mount(recordsOn())
      const field = h.byTestId('recovery-password')?.textContent ?? ''
      expect(field).toContain(S.display.passwords.recoveryPassword)
      expect(field).not.toContain(S.display.passwords.extensionPassword)
      expect(h.text()).not.toContain(S.display.passwords.extensionPassword)
    })

    it('holds continue until the password is typed twice', async () => {
      await h.mount(recordsOn())
      expect(h.isDisabled('continue')).toBe(true)
      await h.type('password', 'correct horse')
      expect(h.isDisabled('continue')).toBe(true)
      await h.type('password-confirmation', 'correct horse')
      expect(h.isDisabled('continue')).toBe(false)
    })

    it('a mismatch shows its line, holds continue and stores nothing', async () => {
      const records = await withDraft()
      await h.mount(records)
      await typePasswords('correct horse', 'correct horsf')
      expect(h.byTestId('mismatch')?.textContent).toBe(
        'The two recovery passwords you typed do not match.'
      )
      expect(h.isDisabled('continue')).toBe(true)
      await h.press('continue')
      expect(h.navigate).not.toHaveBeenCalled()
      expect(await flagOf(records)).toBeUndefined()
      expect(readRecoveryPassword(CHAIN_ID, ACCOUNT)).toBeUndefined()
    })

    it('continue stores the flag, holds the password and keeps the draft encrypted', async () => {
      const records = await withDraft({ privacy: { backup: 'encrypted', publicMetadata: '0x' } })
      await h.mount(records)
      await typePasswords('correct horse', 'correct horse')
      await h.press('continue')
      expect(await flagOf(records)).toBe(PASSWORD_SET)
      expect(readRecoveryPassword(CHAIN_ID, ACCOUNT)).toBe('correct horse')
      expect((await storedDraft(records)).privacy).toEqual({
        backup: 'encrypted',
        publicMetadata: '0x'
      })
    })

    it('shows the line that the password is required at Private and Shape visible', async () => {
      await h.mount(recordsOn())
      expect(h.byTestId('recovery-password')?.textContent).toContain(L.requiredAtPrivate)
    })

    it('never writes the password into storage', async () => {
      const records = await withDraft()
      await h.mount(records)
      await typePasswords('correct horse', 'correct horse')
      await h.press('continue')
      const setup = records.setup(CHAIN_ID, ACCOUNT)
      const stored = await Promise.all([setup.setupDraft.read(), setup.passwordSet.read()])
      expect(
        JSON.stringify(stored, (_, value) => (typeof value === 'bigint' ? String(value) : value))
      ).not.toContain('correct horse')
    })

    it('moving from Public back to Private stores the draft encrypted again', async () => {
      const records = await withDraft({ privacy: { backup: 'clear', publicMetadata: '0x' } })
      await h.mount(records)
      await h.press('level-private')
      await typePasswords('correct horse', 'correct horse')
      await h.press('continue')
      expect((await storedDraft(records)).privacy.backup).toBe('encrypted')
      expect(await flagOf(records)).toBe(PASSWORD_SET)
    })

    it('fills both fields with the password this tab already holds', async () => {
      setRecoveryPassword(CHAIN_ID, ACCOUNT, 'held before')
      await h.mount(recordsOn())
      expect(h.inputOf('password')?.value).toBe('held before')
      expect(h.inputOf('password-confirmation')?.value).toBe('held before')
      expect(h.isDisabled('continue')).toBe(false)
    })
  })

  describe('at Shape visible', () => {
    const atShapeVisible = async () => {
      const records = await withDraft({ clauses: PASSKEY_PASSPORT_AND_GUARDIAN })
      await h.mount(records)
      await h.press('level-shape-visible')
      return records
    }

    it('continue stores a sealed backup beside a public note of the path shape, sets the flag and holds the password', async () => {
      const records = await atShapeVisible()
      await typePasswords('correct horse', 'correct horse')
      await h.press('continue')
      const draft = await storedDraft(records)
      expect(draft.privacy.backup).toBe('encrypted')
      expect(readPublicNote(draft.privacy.publicMetadata)).toEqual({
        kind: 'shape',
        shape: {
          wait: draft.wait,
          ignoresPause: draft.ignoresPause,
          clauses: [{ threshold: 2, methods: [passkey.method, passport.method, guardian.method] }]
        }
      })
      expect(await flagOf(records)).toBe(PASSWORD_SET)
      expect(readRecoveryPassword(CHAIN_ID, ACCOUNT)).toBe('correct horse')
      expect(h.navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetupReview)
    })

    it('the public note carries no member config and never the password', async () => {
      const records = await atShapeVisible()
      await typePasswords('correct horse', 'correct horse')
      await h.press('continue')
      const { publicMetadata } = (await storedDraft(records)).privacy
      const note = JSON.stringify(readPublicNote(publicMetadata), (_, value) =>
        typeof value === 'bigint' ? String(value) : value
      )
      expect(note).not.toContain('config')
      expect(note).not.toContain('correct horse')
    })

    it('asks the recovery password twice with the line that it is required here too', async () => {
      await atShapeVisible()
      const field = h.byTestId('recovery-password')
      expect(field?.querySelectorAll('input')).toHaveLength(2)
      expect(field?.textContent).toContain(L.requiredAtPrivate)
      expect(field?.textContent).toContain(S.display.passwords.recoveryPassword)
      expect(h.byTestId('trade-card')?.textContent).toBe(L.tradeCard)
      expect(h.byTestId('trade-loss')?.textContent).toBe(L.tradeLoss)
      expect(h.byTestId('public-line')).toBeNull()
    })

    it('holds continue until the password is typed twice', async () => {
      await atShapeVisible()
      expect(h.isDisabled('continue')).toBe(true)
      await h.type('password', 'correct horse')
      expect(h.isDisabled('continue')).toBe(true)
      await h.type('password-confirmation', 'correct horse')
      expect(h.isDisabled('continue')).toBe(false)
    })

    it('a mismatch shows its line, holds continue and stores nothing', async () => {
      const records = await atShapeVisible()
      await typePasswords('correct horse', 'correct horsf')
      expect(h.byTestId('mismatch')?.textContent).toBe(L.mismatch)
      expect(h.isDisabled('continue')).toBe(true)
      await h.press('continue')
      expect(h.navigate).not.toHaveBeenCalled()
      expect(await flagOf(records)).toBeUndefined()
      expect(readRecoveryPassword(CHAIN_ID, ACCOUNT)).toBeUndefined()
      expect((await storedDraft(records)).privacy.publicMetadata).toBe('0x')
    })

    it('carries the same exposure lines as Private', async () => {
      await h.mount(await withDraft({ clauses: GUARDIAN_SLOTS_BESIDE_PASSKEY_AND_PASSPORT }))
      const atPrivate = exposureText()
      expect(atPrivate[0]).toBe(L.exposure.guardians)
      await h.press('level-shape-visible')
      expect(exposureText()).toEqual(atPrivate)
    })

    it('never claims the level hides that a setup exists', async () => {
      await atShapeVisible()
      expect(h.text()).not.toMatch(HIDES_EXISTENCE)
    })

    it('is offered with no draft, with the line that names no shape', async () => {
      await h.mount(recordsOn())
      expect(radioIds()).toEqual(['level-private', 'level-shape-visible', 'level-public'])
      expect(checkedRadios()).toEqual(['level-private'])
      expect(h.byTestId('level-line-shape-visible')?.textContent).toBe(L.shapeVisible.lineEmpty)
    })

    it('continue with no draft starts one with a sealed backup beside a note that reads back as Shape visible', async () => {
      const records = recordsOn()
      await records.setup(CHAIN_ID, ACCOUNT).waitingPeriod.write(259200n)
      await h.mount(records)
      await h.press('level-shape-visible')
      await typePasswords('correct horse', 'correct horse')
      await h.press('continue')
      const draft = await storedDraft(records)
      expect(draft.clauses).toEqual([])
      expect(draft.wait).toBe(259200n)
      expect(draft.privacy.backup).toBe('encrypted')
      expect(draft.privacy.publicMetadata).not.toBe('0x')
      expect(privacyLevelOf(draft.privacy)).toBe('shape-visible')
      expect(await flagOf(records)).toBe(PASSWORD_SET)
      expect(readRecoveryPassword(CHAIN_ID, ACCOUNT)).toBe('correct horse')
      expect(h.navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetupReview)
    })

    it('continue carries the stored waiting period into the note', async () => {
      const records = recordsOn()
      const setup = records.setup(CHAIN_ID, ACCOUNT)
      await setup.waitingPeriod.write(259200n)
      await setup.setupDraft.write(
        draftOf({ wait: 259200n, clauses: PASSKEY_PASSPORT_AND_GUARDIAN })
      )
      await h.mount(records)
      await h.press('level-shape-visible')
      await typePasswords('correct horse', 'correct horse')
      await h.press('continue')
      const note = readPublicNote((await storedDraft(records)).privacy.publicMetadata)
      expect(note.kind === 'shape' && note.shape.wait).toBe(259200n)
    })
  })

  describe('at Public', () => {
    it('renders no password field and its own line', async () => {
      await h.mount(recordsOn())
      await h.press('level-public')
      expect(h.byTestId('recovery-password')).toBeNull()
      expect(h.text()).not.toContain(L.requiredAtPrivate)
      expect(document.querySelector('[data-testid="privacy-screen"] input')).toBeNull()
      expect(h.byTestId('public-line')?.textContent).toBe(
        'No password is set. A fresh device rebuilds the setup from the chain alone, and the card carries only the address.'
      )
      expect(h.byTestId('mismatch')).toBeNull()
      expect(h.isDisabled('continue')).toBe(false)
    })

    it('continue wipes the flag and the held password and stores the draft in the clear with no note', async () => {
      const records = recordsOn()
      await records
        .setup(CHAIN_ID, ACCOUNT)
        .setupDraft.write(shapeVisibleDraft(PASSKEY_PASSPORT_AND_GUARDIAN))
      await records.setup(CHAIN_ID, ACCOUNT).passwordSet.write(PASSWORD_SET)
      setRecoveryPassword(CHAIN_ID, ACCOUNT, 'held before')
      await h.mount(records)
      await h.press('level-public')
      await h.press('continue')
      expect(await flagOf(records)).toBeUndefined()
      expect(readRecoveryPassword(CHAIN_ID, ACCOUNT)).toBeUndefined()
      expect((await storedDraft(records)).privacy).toEqual({
        backup: 'clear',
        publicMetadata: '0x'
      })
    })

    it('continue with no draft starts one in the clear that carries the stored waiting period', async () => {
      const records = recordsOn()
      await records.setup(CHAIN_ID, ACCOUNT).waitingPeriod.write(259200n)
      await h.mount(records)
      await h.press('level-public')
      await h.press('continue')
      const draft = await storedDraft(records)
      expect(draft.privacy.backup).toBe('clear')
      expect(draft.wait).toBe(259200n)
      expect(draft.clauses).toEqual([])
      expect(await flagOf(records)).toBeUndefined()
      expect(h.navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetupReview)
    })
  })

  describe('a draft still loading', () => {
    // Mounts the step on a draft stored at the given privacy whose reads wait
    // until the returned function lets them through.
    const mountHeld = async (privacy: SetupDraft['privacy']) => {
      const faults: StorageFaults = {}
      const records = recordsOn(faults)
      await records.setup(CHAIN_ID, ACCOUNT).setupDraft.write(draftOf({ privacy }))
      const release = holdReads(faults)
      await h.mount(records)
      return { records, release }
    }

    const disabledRadios = () => radioIds().map((id) => h.isDisabled(String(id)))

    it('holds the three levels, the password fields and continue until the draft is read', async () => {
      const { release } = await mountHeld({ backup: 'encrypted', publicMetadata: '0x' })
      expect(radioIds()).toEqual(['level-private', 'level-shape-visible', 'level-public'])
      expect(disabledRadios()).toEqual([true, true, true])
      expect(h.inputOf('password')?.readOnly).toBe(true)
      expect(h.inputOf('password-confirmation')?.readOnly).toBe(true)
      expect(h.isDisabled('continue')).toBe(true)
      await release()
      expect(disabledRadios()).toEqual([false, false, false])
      expect(h.inputOf('password')?.readOnly).toBe(false)
      expect(h.inputOf('password-confirmation')?.readOnly).toBe(false)
    })

    it('a level pressed while the draft loads changes nothing, and the stored level shows once read', async () => {
      const { records, release } = await mountHeld({ backup: 'encrypted', publicMetadata: '0x' })
      await h.press('level-public')
      expect(checkedRadios()).toEqual(['level-private'])
      await h.press('continue')
      await release()
      expect(checkedRadios()).toEqual(['level-private'])
      expect(h.byTestId('recovery-password')).not.toBeNull()
      expect(h.navigate).not.toHaveBeenCalled()
      expect((await storedDraft(records)).privacy.backup).toBe('encrypted')
    })

    it('a stored Public shows once read, and a level picked after it stays and is what continue stores', async () => {
      const { records, release } = await mountHeld({ backup: 'clear', publicMetadata: '0x' })
      expect(checkedRadios()).toEqual(['level-private'])
      await release()
      expect(checkedRadios()).toEqual(['level-public'])
      await h.press('level-private')
      expect(checkedRadios()).toEqual(['level-private'])
      await typePasswords('correct horse', 'correct horse')
      await h.press('continue')
      expect((await storedDraft(records)).privacy.backup).toBe('encrypted')
      expect(h.navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetupReview)
    })

    it('a held password fills the fields but continue waits for the draft, which then shows its stored Public', async () => {
      setRecoveryPassword(CHAIN_ID, ACCOUNT, 'held before')
      const { records, release } = await mountHeld({ backup: 'clear', publicMetadata: '0x' })
      expect(h.inputOf('password')?.value).toBe('held before')
      expect(h.isDisabled('continue')).toBe(true)
      await h.press('continue')
      expect(h.navigate).not.toHaveBeenCalled()
      await release()
      expect((await storedDraft(records)).privacy.backup).toBe('clear')
      expect(checkedRadios()).toEqual(['level-public'])
    })
  })

  describe('navigation', () => {
    it('back returns to the waiting period and stores nothing', async () => {
      const records = await withDraft()
      await h.mount(records)
      await typePasswords('correct horse', 'correct horse')
      await h.press('back')
      expect(h.navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetupWaitingPeriod)
      expect(await flagOf(records)).toBeUndefined()
      expect(readRecoveryPassword(CHAIN_ID, ACCOUNT)).toBeUndefined()
    })

    it('continue opens the review once the level is stored', async () => {
      await h.mount(recordsOn())
      await h.press('level-public')
      await h.press('continue')
      expect(h.navigate).toHaveBeenCalledTimes(1)
      expect(h.navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetupReview)
    })
  })

  describe('a storage failure', () => {
    it('a refused write shows its line, stays on the step and leaves the held password as it was', async () => {
      setRecoveryPassword(CHAIN_ID, ACCOUNT, 'held before')
      const records = recordsOn({ set: 1 })
      await h.mount(records)
      await typePasswords('typed now', 'typed now')
      await h.press('continue')
      expect(h.byTestId('write-failed')?.textContent).toBe(S.records.writeFailed)
      expect(h.navigate).not.toHaveBeenCalled()
      expect(readRecoveryPassword(CHAIN_ID, ACCOUNT)).toBe('held before')
      expect(await flagOf(records)).toBeUndefined()
      expect(h.isDisabled('continue')).toBe(false)
    })

    it('a refused draft write leaves the flag and the held password as they were', async () => {
      const faults = { set: 0 }
      const records = recordsOn(faults)
      await records.setup(CHAIN_ID, ACCOUNT).setupDraft.write(draftOf())
      setRecoveryPassword(CHAIN_ID, ACCOUNT, 'held before')
      faults.set = 1
      await h.mount(records)
      await typePasswords('typed now', 'typed now')
      await h.press('continue')
      expect(h.byTestId('write-failed')?.textContent).toBe(S.records.writeFailed)
      expect(readRecoveryPassword(CHAIN_ID, ACCOUNT)).toBe('held before')
      expect(await flagOf(records)).toBeUndefined()
      expect((await storedDraft(records)).privacy.backup).toBe('encrypted')
    })

    it('a refused wipe at Public leaves the held password as it was', async () => {
      const faults = { remove: false }
      const records = recordsOn(faults)
      await records.setup(CHAIN_ID, ACCOUNT).passwordSet.write(PASSWORD_SET)
      setRecoveryPassword(CHAIN_ID, ACCOUNT, 'held before')
      faults.remove = true
      await h.mount(records)
      await h.press('level-public')
      await h.press('continue')
      expect(h.byTestId('write-failed')?.textContent).toBe(S.records.writeFailed)
      expect(readRecoveryPassword(CHAIN_ID, ACCOUNT)).toBe('held before')
      expect(await flagOf(records)).toBe(PASSWORD_SET)
    })

    it('a refused flag at Private puts the draft back in the clear', async () => {
      const faults: StorageFaults = {}
      const records = recordsOn(faults)
      await records
        .setup(CHAIN_ID, ACCOUNT)
        .setupDraft.write(draftOf({ privacy: { backup: 'clear', publicMetadata: '0x' } }))
      await h.mount(records)
      await h.press('level-private')
      await typePasswords('typed now', 'typed now')
      faults.records = ['passwordSet']
      await h.press('continue')
      expect(h.byTestId('write-failed')?.textContent).toBe(S.records.writeFailed)
      expect((await storedDraft(records)).privacy.backup).toBe('clear')
      expect(await flagOf(records)).toBeUndefined()
      expect(readRecoveryPassword(CHAIN_ID, ACCOUNT)).toBeUndefined()
    })

    it('a refused wipe at Public puts the draft back encrypted', async () => {
      const faults: StorageFaults = {}
      const records = recordsOn(faults)
      const setup = records.setup(CHAIN_ID, ACCOUNT)
      await setup.setupDraft.write(draftOf())
      await setup.passwordSet.write(PASSWORD_SET)
      setRecoveryPassword(CHAIN_ID, ACCOUNT, 'held before')
      await h.mount(records)
      await h.press('level-public')
      faults.records = ['passwordSet']
      await h.press('continue')
      expect(h.byTestId('write-failed')?.textContent).toBe(S.records.writeFailed)
      expect((await storedDraft(records)).privacy.backup).toBe('encrypted')
      expect(await flagOf(records)).toBe(PASSWORD_SET)
      expect(readRecoveryPassword(CHAIN_ID, ACCOUNT)).toBe('held before')
    })

    it('a refused wipe at Public with no draft removes the draft and the path it started', async () => {
      const faults: StorageFaults = {}
      const records = recordsOn(faults)
      await h.mount(records)
      await h.press('level-public')
      faults.records = ['passwordSet']
      await h.press('continue')
      expect(h.byTestId('write-failed')?.textContent).toBe(S.records.writeFailed)
      expect(h.navigate).not.toHaveBeenCalled()
      const setup = records.setup(CHAIN_ID, ACCOUNT)
      expect((await setup.setupDraft.read()).status).not.toBe('present')
      expect((await setup.path.read()).status).not.toBe('present')
    })

    it('the next continue that stores clears the line and moves on', async () => {
      const records = recordsOn({ set: 1 })
      await h.mount(records)
      await typePasswords('typed now', 'typed now')
      await h.press('continue')
      await h.press('continue')
      expect(h.byTestId('write-failed')).toBeNull()
      expect(readRecoveryPassword(CHAIN_ID, ACCOUNT)).toBe('typed now')
      expect(h.navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetupReview)
    })

    it('a failed read shows its line, holds continue and stores nothing once storage is back', async () => {
      const faults: StorageFaults = { get: true }
      const records = recordsOn(faults)
      await h.mount(records)
      expect(h.byTestId('load-failed')?.textContent).toBe(S.records.loadFailed)
      await typePasswords('typed now', 'typed now')
      expect(h.isDisabled('continue')).toBe(true)
      await h.press('level-public')
      expect(h.isDisabled('continue')).toBe(true)
      faults.get = false
      await h.press('continue')
      expect(h.navigate).not.toHaveBeenCalled()
      expect(await flagOf(records)).toBeUndefined()
      expect(readRecoveryPassword(CHAIN_ID, ACCOUNT)).toBeUndefined()
    })
  })
})
