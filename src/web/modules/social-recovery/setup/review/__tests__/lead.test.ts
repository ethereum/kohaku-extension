import i18n from '@common/config/localization'
import type { Clause, SetupDraft } from '@web/modules/social-recovery/sdk-interfaces'
import { shapeNoteOf } from '@web/modules/social-recovery/shared/client'
import { renderFullAddress } from '@web/modules/social-recovery/shared/display'
import { emptySlot } from '@web/modules/social-recovery/shared/records/slots'
import type { Enrollment } from '@web/modules/social-recovery/shared/records'

import {
  needsHostileMinorityLine,
  passkeyLinesOf,
  pathRowOf,
  privacyLinesOf,
  publicationItemsOf,
  publicationSentenceOf,
  renderWait
} from '@web/modules/social-recovery/setup/review/lead'
import {
  AADHAAR,
  ALICE,
  BOB,
  BOOK,
  CAROL,
  DAVE,
  enrolled,
  guardianAddress,
  group,
  PASSKEY,
  PASSPORT,
  PHONE_PASSKEY,
  required
} from '@web/modules/social-recovery/setup/review/__fixtures__/review'

const { t } = i18n
const ITEMS = 'socialRecovery.disclosures.items'
const LEAD = 'socialRecovery.disclosures.itemsLead'
const PUBLICATION = 'socialRecovery.review.publication'

const sentence = (clauses: Clause[]) => publicationSentenceOf(clauses, BOOK, t)

describe('the publication sentence', () => {
  it('names one item in the singular where the path holds no guardian', () => {
    expect(sentence([required(PASSKEY)])).toBe(
      t(`${PUBLICATION}.methods`, { items: t(`${LEAD}.passkey`), count: 1 })
    )
  })

  it('takes the plural verb for several passkeys', () => {
    expect(sentence([group(1, PASSKEY, PHONE_PASSKEY)])).toBe(
      t(`${PUBLICATION}.methods`, { items: t(`${LEAD}.passkeys`), count: 2 })
    )
  })

  it('joins two items as a pair in the plural', () => {
    expect(sentence([group(2, PASSKEY, PASSPORT)])).toBe(
      t(`${PUBLICATION}.methods`, {
        items: t(`${ITEMS}.pair`, {
          first: t(`${LEAD}.passkey`),
          second: t(`${ITEMS}.passportIdentifier`)
        }),
        count: 2
      })
    )
  })

  it('joins three items as a triple', () => {
    expect(sentence([group(2, PASSKEY, PASSPORT, AADHAAR)])).toBe(
      t(`${PUBLICATION}.methods`, {
        items: t(`${ITEMS}.triple`, {
          first: t(`${LEAD}.passkey`),
          second: t(`${ITEMS}.passportIdentifier`),
          third: t(`${ITEMS}.aadhaar`)
        }),
        count: 2
      })
    )
  })

  it('adds the one guardian beside the other methods', () => {
    expect(sentence([group(2, PASSKEY, PASSPORT, ALICE)])).toBe(
      t(`${PUBLICATION}.methodsAndGuardian`, {
        items: t(`${ITEMS}.pair`, {
          first: t(`${LEAD}.passkey`),
          second: t(`${ITEMS}.passportIdentifier`)
        }),
        count: 2
      })
    )
  })

  it('adds several guardians beside one other method, in the singular', () => {
    expect(sentence([required(PASSPORT), group(2, ALICE, BOB, CAROL)])).toBe(
      t(`${PUBLICATION}.methodsAndGuardians`, {
        items: t(`${LEAD}.passportIdentifier`),
        count: 1
      })
    )
  })

  it('names the one guardian alone where the path holds nothing else', () => {
    expect(sentence([required(ALICE)])).toBe(t(`${PUBLICATION}.guardian`))
  })

  it('names the guardians alone where the path holds nothing else', () => {
    expect(sentence([group(2, ALICE, BOB, CAROL)])).toBe(t(`${PUBLICATION}.guardians`))
  })

  it('counts empty slots by the kind they wait for', () => {
    expect(sentence([group(1, emptySlot('ecdsa'), emptySlot('ecdsa'))])).toBe(
      t(`${PUBLICATION}.guardians`)
    )
  })

  it('reads the singular and the plural forms as different sentences', () => {
    expect(sentence([required(PASSKEY)])).not.toBe(sentence([group(1, PASSKEY, PHONE_PASSKEY)]))
    expect(sentence([required(PASSPORT)])).not.toBe(sentence([group(2, PASSKEY, PASSPORT)]))
  })

  it('has no second sentence for an empty path', () => {
    expect(sentence([])).toBeNull()
  })
})

describe('the publication items', () => {
  it('name a passkey, the passport identifier and the Aadhaar identity in that order', () => {
    expect(publicationItemsOf(['aadhaar', 'ecdsa', 'zkpassport', 'passkey'])).toEqual([
      'passkey',
      'passportIdentifier',
      'aadhaar'
    ])
  })

  it('name several passkeys once, and several passports once', () => {
    expect(publicationItemsOf(['passkey', 'zkpassport', 'passkey', 'zkpassport'])).toEqual([
      'passkeys',
      'passportIdentifier'
    ])
  })

  it('name nothing for guardians alone', () => {
    expect(publicationItemsOf(['ecdsa', 'ecdsa'])).toEqual([])
  })
})

describe('the waiting period', () => {
  const CHIPS: [bigint, string][] = [
    [86400n, 'hours24'],
    [172800n, 'hours48'],
    [259200n, 'hours72'],
    [604800n, 'days7']
  ]
  CHIPS.forEach(([wait, chip]) => {
    it(`names ${wait} seconds by the picker chip ${chip}`, () => {
      expect(renderWait(wait, t)).toBe(t(`socialRecovery.privacy.waitingPeriod.chips.${chip}`))
    })
  })

  it('names any other length by its count of hours', () => {
    expect(renderWait(36n * 3600n, t)).toBe(
      t('socialRecovery.display.remainingHours', { count: 36 })
    )
    expect(renderWait(3600n, t)).toBe(t('socialRecovery.display.remainingHours', { count: 1 }))
    expect(renderWait(36n * 3600n, t)).not.toBe(renderWait(3600n, t))
  })
})

describe('the hostile-minority guidance', () => {
  it('shows where a group holds three members', () => {
    expect(needsHostileMinorityLine([group(2, ALICE, BOB, PASSKEY)])).toBe(true)
  })

  it('shows where any one group of several holds three or more', () => {
    expect(
      needsHostileMinorityLine([
        required(PASSKEY),
        group(1, ALICE, BOB),
        group(3, ALICE, BOB, CAROL, DAVE)
      ])
    ).toBe(true)
  })

  it('does not show where every group holds two members or fewer', () => {
    expect(
      needsHostileMinorityLine([required(PASSKEY), required(PASSPORT), group(1, ALICE, BOB)])
    ).toBe(false)
  })
})

describe('a row of the path', () => {
  const CEREMONY = 'socialRecovery.ceremony'
  const chip = (id: string) => t(`socialRecovery.status.method.${id}`)
  const rowOf = (enrollment: Enrollment) => pathRowOf(enrollment.credential, [enrollment], BOOK, t)

  it('reads a passed test as tested with no line under it', () => {
    const row = rowOf(enrolled(ALICE))
    expect([row.chip, row.lines]).toEqual([chip('tested'), []])
  })

  it('reads an untested method with the untested line', () => {
    const row = rowOf(enrolled(ALICE, 'not-tested'))
    expect([row.chip, row.lines]).toEqual([chip('notTested'), [t(`${CEREMONY}.notTestedLine`)]])
  })

  const NO_MATCH: string[] = ['check-rejected', 'check-rejected: signer mismatch']
  NO_MATCH.forEach((cause) => {
    it(`reads a failed check stored as "${cause}" by the no-match line alone`, () => {
      const row = rowOf(enrolled(ALICE, 'failed', { cause }))
      expect([row.chip, row.lines]).toEqual([
        chip('testFailed'),
        [t(`${CEREMONY}.testFailedNoMatch`)]
      ])
    })
  })

  const MAY_NEVER_WORK: [string, Enrollment['credential'], string | undefined][] = [
    ['a browser error with its name', PASSKEY, 'browser-error: NotAllowedError'],
    ['a browser error with no error name', PASSKEY, 'browser-error: the user left'],
    [
      'a passkey made under another origin, with its error name',
      PASSKEY,
      'relying-party-mismatch: SecurityError'
    ],
    ['a passkey made under another origin, bare', PASSKEY, 'relying-party-mismatch'],
    ['a cause the wallet has no words for', ALICE, 'service-unanswered'],
    ['no stored cause', ALICE, undefined]
  ]
  MAY_NEVER_WORK.forEach(([what, credential, cause]) => {
    it(`reads a failed test with ${what} by the may-never-work line alone`, () => {
      const row = rowOf(enrolled(credential, 'failed', cause === undefined ? {} : { cause }))
      expect([row.chip, row.lines]).toEqual([chip('testFailed'), [t(`${CEREMONY}.testFailedLine`)]])
    })
  })

  it('reads an unavailable test with its line', () => {
    const row = rowOf(enrolled(ALICE, 'unavailable'))
    expect([row.chip, row.lines]).toEqual([
      chip('testUnavailable'),
      [t(`${CEREMONY}.testUnavailableLine`)]
    ])
  })

  it('reads a document the method cannot check as not supported with its line', () => {
    const row = rowOf(enrolled(PASSPORT, 'not-supported'))
    expect(row.chip).toBe(chip('notSupported'))
    expect(row.lines[0]).toBe(t(`${CEREMONY}.notSupportedLine`))
  })

  it('names a guardian by its full address beside the guardian noun', () => {
    const row = rowOf(enrolled(ALICE))
    expect([row.name, row.aside]).toEqual([
      renderFullAddress(guardianAddress('a1')),
      t('socialRecovery.display.nouns.guardian')
    ])
  })

  it('carries the identity line and the publication line on a passport row', () => {
    const row = rowOf(enrolled(PASSPORT))
    expect([row.name, row.lines]).toEqual([
      t('socialRecovery.methodNames.passport'),
      [
        t('socialRecovery.disclosures.identity'),
        t('socialRecovery.disclosures.passportPublication')
      ]
    ])
  })

  it('carries the identity line alone on an Aadhaar row', () => {
    expect(rowOf(enrolled(AADHAAR)).lines).toEqual([t('socialRecovery.disclosures.identity')])
  })

  it('names a synced passkey by its label with the synced word', () => {
    const row = rowOf(enrolled(PASSKEY, 'passed', { backup: 'synced' }))
    expect(row).toEqual({
      name: PASSKEY.label,
      aside: t('socialRecovery.review.passkeySynced'),
      chip: chip('tested'),
      lines: []
    })
  })

  it('names a device-bound passkey with the device-bound word', () => {
    const row = rowOf(enrolled(PASSKEY, 'not-tested', { backup: 'device-bound' }))
    expect(row.aside).toBe(t('socialRecovery.review.passkeyDeviceBound'))
    expect(row.lines).toEqual([t(`${CEREMONY}.notTestedLine`)])
  })

  it('reads an empty slot by its kind as not yet active, with no line', () => {
    const row = pathRowOf(emptySlot('zkpassport'), [], BOOK, t)
    expect(row).toEqual({
      name: t('socialRecovery.methodNames.passport'),
      aside: null,
      chip: chip('notYetActive'),
      lines: []
    })
  })

  it('shows no chip for a credential the records hold no verdict for', () => {
    expect(pathRowOf(ALICE, [], BOOK, t).chip).toBeNull()
  })
})

describe('the lines under a passkey heading', () => {
  const CEREMONY = 'socialRecovery.ceremony'

  it('read the synced loss line, then the origin line', () => {
    expect(passkeyLinesOf('synced', t)).toEqual([
      t(`${CEREMONY}.syncedLoss`),
      t(`${CEREMONY}.passkeyOrigin`)
    ])
  })

  it('read the device-bound loss line, then the origin line', () => {
    expect(passkeyLinesOf('device-bound', t)).toEqual([
      t(`${CEREMONY}.deviceBoundLoss`),
      t(`${CEREMONY}.passkeyOrigin`)
    ])
  })

  it('read the origin line alone where the records hold no backup kind', () => {
    expect(passkeyLinesOf(undefined, t)).toEqual([t(`${CEREMONY}.passkeyOrigin`)])
  })
})

describe('the privacy lines', () => {
  it('read Private with the recovery password set', () => {
    expect(
      privacyLinesOf(
        { clauses: [], privacy: { backup: 'encrypted', publicMetadata: '0x' } },
        BOOK,
        true,
        t
      )
    ).toEqual([t('socialRecovery.review.privateSet')])
  })

  it('read the Public level with its own line', () => {
    expect(
      privacyLinesOf(
        { clauses: [], privacy: { backup: 'clear', publicMetadata: '0x' } },
        BOOK,
        false,
        t
      )
    ).toEqual([
      t('socialRecovery.privacy.level.public.label'),
      t('socialRecovery.privacy.level.public.line')
    ])
  })

  it('read Private alone, never that a password is set, before the password is stored', () => {
    expect(
      privacyLinesOf(
        { clauses: [], privacy: { backup: 'encrypted', publicMetadata: '0x' } },
        BOOK,
        false,
        t
      )
    ).toEqual([t('socialRecovery.privacy.level.private.label')])
  })

  describe('at Shape visible', () => {
    const SHAPE = 'socialRecovery.shape.sentence'
    const clauses = [group(2, PASSKEY, PASSPORT, ALICE)]
    const shapeVisible: Pick<SetupDraft, 'privacy' | 'clauses'> = {
      clauses,
      privacy: {
        backup: 'encrypted',
        publicMetadata: shapeNoteOf({ clauses, wait: 172800n, ignoresPause: true })
      }
    }
    const shapeLine = t('socialRecovery.privacy.level.shapeVisible.line', {
      shape: t(`${SHAPE}.list`, {
        first: t(`${SHAPE}.list`, {
          first: t(`${SHAPE}.kinds.passkey`),
          rest: t(`${SHAPE}.pair`, {
            first: t(`${SHAPE}.kinds.passport`),
            second: t(`${SHAPE}.kinds.guardian`)
          })
        }),
        rest: t(`${SHAPE}.anyOf`, { threshold: 2, count: 3 })
      })
    })

    it('read the label and the line naming the kinds of a passkey, a passport and a guardian, any 2 of 3, before the password is stored', () => {
      expect(privacyLinesOf(shapeVisible, BOOK, false, t)).toEqual([
        t('socialRecovery.privacy.level.shapeVisible.label'),
        shapeLine
      ])
      expect(shapeLine).toContain('a passkey, a passport and a guardian, any 2 of 3')
    })

    it('read that the recovery password is set first, then the shape line, once the password is stored', () => {
      expect(privacyLinesOf(shapeVisible, BOOK, true, t)).toEqual([
        t('socialRecovery.review.shapeVisibleSet'),
        shapeLine
      ])
    })

    it('read the line for an empty path where the path has no member, with or without the password stored', () => {
      const memberless: Pick<SetupDraft, 'privacy' | 'clauses'> = {
        clauses: [],
        privacy: {
          backup: 'encrypted',
          publicMetadata: shapeNoteOf({ clauses: [], wait: 172800n, ignoresPause: true })
        }
      }
      const emptyLine = t('socialRecovery.privacy.level.shapeVisible.lineEmpty')
      expect(privacyLinesOf(memberless, BOOK, false, t)).toEqual([
        t('socialRecovery.privacy.level.shapeVisible.label'),
        emptyLine
      ])
      expect(privacyLinesOf(memberless, BOOK, true, t)).toEqual([
        t('socialRecovery.review.shapeVisibleSet'),
        emptyLine
      ])
    })

    it('read the line for an empty path where the groups have no member, with or without the password stored', () => {
      const memberlessGroups = [{ threshold: 1, credentials: [] }]
      const memberless: Pick<SetupDraft, 'privacy' | 'clauses'> = {
        clauses: memberlessGroups,
        privacy: {
          backup: 'encrypted',
          publicMetadata: shapeNoteOf({
            clauses: memberlessGroups,
            wait: 172800n,
            ignoresPause: true
          })
        }
      }
      const emptyLine = t('socialRecovery.privacy.level.shapeVisible.lineEmpty')
      expect(privacyLinesOf(memberless, BOOK, false, t)).toEqual([
        t('socialRecovery.privacy.level.shapeVisible.label'),
        emptyLine
      ])
      expect(privacyLinesOf(memberless, BOOK, true, t)).toEqual([
        t('socialRecovery.review.shapeVisibleSet'),
        emptyLine
      ])
    })

    it('name no member of the path', () => {
      const text = privacyLinesOf(shapeVisible, BOOK, true, t).join(' ')
      expect(text).not.toContain(PASSKEY.label)
      expect(text.toLowerCase()).not.toContain(guardianAddress('a1').toLowerCase())
    })
  })

  it('read Public for a clear backup even beside a shape note', () => {
    const clauses = [group(2, PASSKEY, PASSPORT, ALICE)]
    expect(
      privacyLinesOf(
        {
          clauses,
          privacy: {
            backup: 'clear',
            publicMetadata: shapeNoteOf({ clauses, wait: 172800n, ignoresPause: true })
          }
        },
        BOOK,
        true,
        t
      )
    ).toEqual([
      t('socialRecovery.privacy.level.public.label'),
      t('socialRecovery.privacy.level.public.line')
    ])
  })
})
