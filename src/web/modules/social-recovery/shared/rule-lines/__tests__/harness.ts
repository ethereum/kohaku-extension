/**
 * The part of the string table the shape sentence reads, and the real table
 * read as that part.
 */
import en from '@common/config/localization/translations/en.json'

type SentenceTable = {
  kinds: { passkey: string; passport: string; guardian: string; aadhaar: string; method: string }
  anyOf: string
  pair: string
  list: string
}

type ShapeTable = { and: string; sentence: SentenceTable }

export type Table = {
  socialRecovery: { shape: ShapeTable }
}

export const EN = en as unknown as Table

// Jest runs every file under __tests__, this one included; its own check runs
// only when Jest runs this file, never from a file that imports the harness.
if (expect.getState().testPath === __filename) {
  describe('harness', () => {
    it('finds every string the shape sentence reads in the real table', () => {
      const { and, sentence } = EN.socialRecovery.shape
      const strings = [
        and,
        sentence.anyOf,
        sentence.pair,
        sentence.list,
        sentence.kinds.passkey,
        sentence.kinds.passport,
        sentence.kinds.guardian,
        sentence.kinds.aadhaar,
        sentence.kinds.method
      ]
      strings.forEach((s) => expect(typeof s === 'string' && s.length > 0).toBe(true))
    })
  })
}
