/**
 * The public note a shape-visible setup writes, and the privacy level a draft's
 * two fields read as. The note is read back through the doubles' reader, the
 * one the chain side uses, so what a setup writes is what a reader later sees.
 */
import { readPublicNote } from '@web/modules/social-recovery/sdk-doubles'
import type { PublicNoteReading } from '@web/modules/social-recovery/sdk-doubles'
import type {
  BackupForm,
  Configuration,
  Hex,
  PrivacyLevel
} from '@web/modules/social-recovery/sdk-interfaces'
import { privacyLevelOf, shapeNoteOf } from '@web/modules/social-recovery/shared/client'

const PASSKEY = '0x1000000000000000000000000000000000000001' as Hex
const PASSPORT = '0x2000000000000000000000000000000000000002' as Hex
const GUARDIAN = '0x4000000000000000000000000000000000000004' as Hex

const PASSKEY_CONFIG = `0x${'a1'.repeat(96)}` as Hex
const PASSPORT_CONFIG = `0x${'b2'.repeat(32)}` as Hex
const GUARDIAN_CONFIG = `0x${'c3'.repeat(32)}` as Hex
const GUARDIAN_SALT = `0x${'d4'.repeat(32)}` as Hex
const SECOND_GUARDIAN_CONFIG = `0x${'e5'.repeat(32)}` as Hex

const CONFIGURATION: Configuration = {
  wait: 604800n,
  ignoresPause: true,
  clauses: [
    {
      threshold: 1,
      credentials: [{ method: PASSKEY, config: PASSKEY_CONFIG, label: 'Laptop' }]
    },
    {
      threshold: 2,
      credentials: [
        { method: PASSPORT, config: PASSPORT_CONFIG },
        { method: GUARDIAN, config: GUARDIAN_CONFIG, salt: GUARDIAN_SALT },
        { method: GUARDIAN, config: SECOND_GUARDIAN_CONFIG }
      ]
    }
  ]
}

const textOf = (value: PublicNoteReading): string =>
  JSON.stringify(value, (_, v: unknown) => (typeof v === 'bigint' ? v.toString() : v))

describe('shapeNoteOf', () => {
  it('reads back as the shape: the wait, the pause choice, and each clause threshold and methods', () => {
    expect(readPublicNote(shapeNoteOf(CONFIGURATION))).toEqual({
      kind: 'shape',
      shape: {
        wait: 604800n,
        ignoresPause: true,
        clauses: [
          { threshold: 1, methods: [PASSKEY] },
          { threshold: 2, methods: [PASSPORT, GUARDIAN, GUARDIAN] }
        ]
      }
    })
  })

  it('carries no member config, salt or label', () => {
    const note = shapeNoteOf(CONFIGURATION).toLowerCase()
    ;[
      PASSKEY_CONFIG,
      PASSPORT_CONFIG,
      GUARDIAN_CONFIG,
      GUARDIAN_SALT,
      SECOND_GUARDIAN_CONFIG
    ].forEach((secret) => expect(note).not.toContain(secret.slice(2)))
    const reading = textOf(readPublicNote(shapeNoteOf(CONFIGURATION)))
    ;['a1a1', 'b2b2', 'c3c3', 'd4d4', 'e5e5', 'Laptop'].forEach((fragment) =>
      expect(reading).not.toContain(fragment)
    )
  })

  it('writes a different note when a threshold changes', () => {
    const other: Configuration = {
      ...CONFIGURATION,
      clauses: [CONFIGURATION.clauses[0], { ...CONFIGURATION.clauses[1], threshold: 3 }]
    }
    expect(shapeNoteOf(other)).not.toBe(shapeNoteOf(CONFIGURATION))
  })

  it('writes the same note for two configurations that differ only in member configs', () => {
    const other: Configuration = {
      ...CONFIGURATION,
      clauses: CONFIGURATION.clauses.map((clause) => ({
        ...clause,
        credentials: clause.credentials.map((credential) => ({
          method: credential.method,
          config: `0x${'ff'.repeat(32)}` as Hex
        }))
      }))
    }
    expect(shapeNoteOf(other)).toBe(shapeNoteOf(CONFIGURATION))
  })
})

describe('privacyLevelOf', () => {
  const NOTE = shapeNoteOf(CONFIGURATION)
  const cases: { note: string; publicMetadata: Hex; backup: BackupForm; level: PrivacyLevel }[] = [
    { note: 'no public note', publicMetadata: '0x', backup: 'encrypted', level: 'private' },
    { note: 'no public note', publicMetadata: '0x', backup: 'empty', level: 'private' },
    { note: 'no public note', publicMetadata: '0x', backup: 'clear', level: 'public' },
    { note: 'the shape note', publicMetadata: NOTE, backup: 'encrypted', level: 'shape-visible' },
    { note: 'the shape note', publicMetadata: NOTE, backup: 'empty', level: 'shape-visible' },
    { note: 'the shape note', publicMetadata: NOTE, backup: 'clear', level: 'public' },
    {
      note: 'one byte of note',
      publicMetadata: '0x01',
      backup: 'encrypted',
      level: 'shape-visible'
    }
  ]

  cases.forEach(({ note, publicMetadata, backup, level }) => {
    it(`${note} beside a backup of form ${backup} reads ${level}`, () => {
      expect(privacyLevelOf({ publicMetadata, backup })).toBe(level)
    })
  })
})
