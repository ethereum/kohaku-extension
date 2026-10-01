/**
 * The part of the string table the shape sentence reads, the real table read
 * as that part, a translator over any such table, and the sentence parts the
 * tests compose their expected sentences from.
 */
import i18next from 'i18next'

import en from '@common/config/localization/translations/en.json'
import type { Translate } from '@web/modules/social-recovery/shared/display/types'

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

export const translatorOf = (table: Table): Translate => {
  const i18n = i18next.createInstance()
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    defaultNS: 'app',
    resources: { en: { app: table } },
    interpolation: { escapeValue: false },
    initImmediate: false
  })
  return (key, params) => String(i18n.t(key, params ? { ...params } : undefined))
}

const fill = (template: string, params: Record<string, string | number>): string =>
  template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params[name]))

// The sentence parts, each read from one table.
export const partsOf = (table: Table) => {
  const s = table.socialRecovery.shape.sentence
  return {
    kinds: s.kinds,
    method: s.kinds.method,
    pair: (first: string, second: string) => fill(s.pair, { first, second }),
    list: (first: string, rest: string) => fill(s.list, { first, rest }),
    anyOf: (threshold: number, count: number) => fill(s.anyOf, { threshold, count }),
    and: ` ${table.socialRecovery.shape.and.toLowerCase()} `
  }
}

// Jest runs every file under __tests__, this one included; its own check runs
// only when Jest runs this file, never from a file that imports the harness.
if (expect.getState().testPath === __filename) {
  describe('harness', () => {
    const t = translatorOf(EN)
    const p = partsOf(EN)
    const SENTENCE = 'socialRecovery.shape.sentence'

    // Each real template, the values passed to it, and what the translator and
    // the parts make of them.
    const templates = [
      {
        name: 'anyOf',
        values: ['7', '11'],
        translated: t(`${SENTENCE}.anyOf`, { threshold: 7, count: 11 }),
        composed: p.anyOf(7, 11)
      },
      {
        name: 'pair',
        values: ['Xfirst', 'Ysecond'],
        translated: t(`${SENTENCE}.pair`, { first: 'Xfirst', second: 'Ysecond' }),
        composed: p.pair('Xfirst', 'Ysecond')
      },
      {
        name: 'list',
        values: ['Xfirst', 'Yrest'],
        translated: t(`${SENTENCE}.list`, { first: 'Xfirst', rest: 'Yrest' }),
        composed: p.list('Xfirst', 'Yrest')
      }
    ]

    templates.forEach(({ name, values, translated, composed }) => {
      it(`the real ${name} template takes every value it is given and leaves no placeholder`, () => {
        values.forEach((value) => {
          expect(translated).toContain(value)
          expect(composed).toContain(value)
        })
        expect(translated).not.toContain('{{')
        expect(composed).not.toContain('{{')
      })

      it(`the translator and the parts agree on the real ${name} template`, () => {
        expect(composed).toBe(translated)
      })
    })

    it('the translator and the parts read the same kind words and the same clause join', () => {
      Object.entries(p.kinds).forEach(([kind, word]) => {
        expect(t(`${SENTENCE}.kinds.${kind}`)).toBe(word)
      })
      expect(p.and).toBe(` ${t('socialRecovery.shape.and').toLowerCase()} `)
    })
  })
}
