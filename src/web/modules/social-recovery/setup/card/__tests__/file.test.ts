/**
 * The card's file read back the way a PDF reader reads it: its name and type,
 * its header and end marker, the cross-reference table and each offset in it,
 * the page tree, each content stream and its length, and the text each page
 * draws, over one page or several.
 */
import i18n from '@common/config/localization'
import type { Address } from '@web/modules/social-recovery/sdk-interfaces'
import { renderPasswordName } from '@web/modules/social-recovery/shared/display'
import {
  pdfDrawnValues,
  pdfFileParts,
  pdfShownStrings,
  pdfTextBlocks,
  winAnsiHighEntries
} from '@web/modules/social-recovery/setup/card/__tests__/harness'
import { eachIt } from '@web/modules/social-recovery/shared/chrome/__fixtures__/table'
import { cardFileOf } from '@web/modules/social-recovery/setup/card/file'
import type { RecoveryCard } from '@web/modules/social-recovery/setup/card/types'

const t = (key: string): string => i18n.t(key)

// Given in lower case; the file writes its checksummed form.
const ACCOUNT = '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed' as Address
const CHECKSUMMED = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'
const PASSWORD = 'tide lantern orchid'

// Every printable ASCII character in turn, the space and the three escaped ones
// included.
const asciiOf = (length: number): string =>
  Array.from({ length }, (_, at) => String.fromCharCode(0x20 + ((at * 7) % 95))).join('')
const LONG_ASCII = asciiOf(2500)
const TALLER_THAN_A_PAGE = asciiOf(6000)
const LONG_CJK = Array.from({ length: 400 }, (_, at) => String.fromCodePoint(0x4e00 + at)).join('')
const codesOf = (text: string): string =>
  Array.from(
    text,
    (char) => `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`
  ).join('')
const ORCHIDS = 'orchid '.repeat(40)

// Courier draws every character in 0.6 of the font size.
const COURIER_ADVANCE = 0.6
const MARK = '¬'

const hidden = (password: string): RecoveryCard => ({ account: ACCOUNT, level: 'hidden', password })
const PUBLIC: RecoveryCard = { account: ACCOUNT, level: 'public' }

const asText = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
const drawnText = (card: RecoveryCard): string =>
  pdfTextBlocks(cardFileOf(card, t).bytes)
    .map((block) => block.text)
    .join('\n')
const firstStream = (card: RecoveryCard): string =>
  pdfFileParts(cardFileOf(card, t).bytes).streams[0].text
const drawnPassword = (password: string) => {
  const values = pdfDrawnValues(cardFileOf(hidden(password), t).bytes)
  expect(values).toHaveLength(2)
  expect(values[0].text).toBe(CHECKSUMMED)
  return values[1]
}

// The operators a page draws with: the border, text objects that set a font
// and a grey and show strings at a position, and the continuation marks, a
// stroke grey and width followed by one bar-and-tick path per mark.
const OPERATOR_LINES = [
  /^q$/,
  /^Q$/,
  /^[\d.]+ G [\d.]+ w$/,
  /^[\d.]+ [\d.]+ m [\d.]+ [\d.]+ l [\d.]+ [\d.]+ l S$/,
  /^[\d.]+ G [\d.]+ w [\d.]+ [\d.]+ [\d.]+ [\d.]+ re S$/,
  /^BT$/,
  /^ET$/,
  /^\/F\d+ [\d.]+ Tf$/,
  /^[\d.]+ g$/,
  /^1 0 0 1 [\d.]+ [\d.]+ Tm \((?:\\[0-7]{3}|\\[\\()]|[^\\()])*\) Tj$/
]

describe('the card file', () => {
  it('is a PDF by its name and its type', () => {
    const file = cardFileOf(hidden(PASSWORD), t)
    expect(file.name.endsWith('.pdf')).toBe(true)
    expect(file.type).toBe('application/pdf')
  })

  eachIt([
    ['the hidden level', hidden(PASSWORD)],
    ['the public level', PUBLIC]
  ])('starts with the PDF header and ends with the end-of-file marker at %s', (_, card) => {
    const text = asText(cardFileOf(card, t).bytes)
    expect(text.startsWith('%PDF-')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
  })

  it('holds exactly one page', () => {
    const file = cardFileOf(hidden(PASSWORD), t)
    expect(asText(file.bytes).match(/\/Type\s*\/Page(?![A-Za-z])/g)).toHaveLength(1)
    expect(file.pages).toBe(1)
  })

  eachIt([
    ['the hidden level', hidden(PASSWORD)],
    ['the public level', PUBLIC],
    ['a password outside the encoding', hidden('日本 🔑')],
    ['a long ASCII password', hidden(LONG_ASCII)],
    ['a long password outside the encoding', hidden(LONG_CJK)],
    ['a password taller than a page', hidden(TALLER_THAN_A_PAGE)]
  ])('points startxref at the table and each table entry at its object at %s', (_, card) => {
    const { file, startxref, firstObject, entries, trailer } = pdfFileParts(
      cardFileOf(card, t).bytes
    )
    expect(file.slice(startxref, startxref + 4)).toBe('xref')
    expect(firstObject).toBe(0)
    expect(entries[0]).toEqual({ offset: 0, generation: 65535, inUse: false })

    const inUse = entries.slice(1)
    expect(inUse.length).toBeGreaterThan(0)
    inUse.forEach((entry, at) => {
      const header = `${at + 1} ${entry.generation} obj`
      expect(entry.inUse).toBe(true)
      expect(file.slice(entry.offset, entry.offset + header.length)).toBe(header)
      // The object starts at the offset, not in the middle of another line.
      expect(file[entry.offset - 1]).toBe('\n')
    })

    const written = Array.from(file.matchAll(/(?:^|\n)(\d+) 0 obj\b/g), ([, n]) => Number(n))
    expect(written).toEqual(inUse.map((_entry, at) => at + 1))
    expect(trailer).toMatch(new RegExp(`/Size ${entries.length}\\b`))
    const root = trailer.match(/\/Root (\d+) 0 R/)?.[1]
    expect(root).toBeDefined()
    const rootAt = entries[Number(root)].offset
    expect(file.slice(rootAt)).toMatch(/^\d+ 0 obj\s*<<\s*\/Type \/Catalog/)
  })

  eachIt([
    ['a short password', hidden(PASSWORD)],
    ['a password that wraps over several lines', hidden(ORCHIDS)],
    ['a password outside the encoding', hidden('日本 🔑')],
    ['a long ASCII password', hidden(LONG_ASCII)],
    ['a long password outside the encoding', hidden(LONG_CJK)]
  ])('declares the length of every content stream it writes, for %s', (_, card) => {
    const { streams } = pdfFileParts(cardFileOf(card, t).bytes)
    streams.forEach((stream) => {
      expect(stream.text.length).toBeGreaterThan(0)
      expect(stream.declaredLength).toBe(stream.text.length)
    })
  })

  it('draws the address and the password at the hidden level', () => {
    const content = firstStream(hidden(PASSWORD))
    expect(content).toContain(`(${CHECKSUMMED}) Tj`)
    expect(content).toContain(`(${PASSWORD}) Tj`)
    expect(drawnText(hidden(PASSWORD))).toContain(PASSWORD)
  })

  it('draws the address and no password at the public level, even when one is held', () => {
    const card: RecoveryCard = { ...PUBLIC, password: PASSWORD }
    const bytes = cardFileOf(card, t).bytes
    expect(pdfFileParts(bytes).streams[0].text).toContain(`(${CHECKSUMMED}) Tj`)
    expect(asText(bytes)).not.toContain('orchid')
    expect(drawnText(card)).not.toContain('orchid')
  })

  it('escapes the backslash and both parentheses in a value and reads them back as typed', () => {
    const password = 'a(b)c\\d)(e\\'
    expect(firstStream(hidden(password))).toContain('(a\\(b\\)c\\\\d\\)\\(e\\\\) Tj')
    expect(drawnText(hidden(password))).toContain(password)
  })

  it('writes a character outside the encoding as its code and says so', () => {
    const file = cardFileOf(hidden('pass 日本 🔑'), t)
    const content = pdfFileParts(file.bytes).streams[0].text
    expect(file.replacedCharacters).toBe(true)
    expect(content).toContain('U+65E5U+672C')
    expect(content).toContain('U+1F511')
    expect(drawnText(hidden('pass 日本 🔑'))).toContain('pass U+65E5U+672C U+1F511')
  })

  it('writes the no-break space and the soft hyphen as their codes and says so', () => {
    const file = cardFileOf(hidden('tide\u00a0lan\u00adtern'), t)
    expect(file.replacedCharacters).toBe(true)
    expect(drawnPassword('tide\u00a0lan\u00adtern').text).toBe('tideU+00A0lanU+00ADtern')
  })

  it('writes the Latin-1 characters around those two as they are', () => {
    const password = '¡¬®ÿ'
    expect(cardFileOf(hidden(password), t).replacedCharacters).toBe(false)
    expect(drawnPassword(password).text).toBe(password)
  })

  it('writes the encoding’s own characters as they are and says nothing was replaced', () => {
    const password = 'café €5 – orchid’s “tide”'
    const file = cardFileOf(hidden(password), t)
    expect(file.replacedCharacters).toBe(false)
    expect(asText(file.bytes)).not.toContain('U+')
    expect(drawnText(hidden(password))).toContain(password)
    expect(cardFileOf(PUBLIC, t).replacedCharacters).toBe(false)
  })

  it('places each character of the code page’s high bytes at the byte the code page gives it', () => {
    const entries = winAnsiHighEntries()
    expect(entries).toHaveLength(27)
    entries.forEach(([byte, codePoint]) => {
      const char = String.fromCodePoint(codePoint)
      const file = cardFileOf(hidden(`a${char}b`), t)
      expect(file.replacedCharacters).toBe(false)
      expect(pdfFileParts(file.bytes).streams[0].text).toContain(`(a\\${byte.toString(8)}b) Tj`)
      expect(drawnPassword(`a${char}b`).text).toBe(`a${char}b`)
    })
  })

  it('keeps the content stream in printable ASCII whatever the password holds', () => {
    expect(firstStream(hidden('café 日本 €'))).toMatch(/^[\x20-\x7e\n]*$/)
  })
})

describe('a card longer than one page', () => {
  eachIt([
    ['a 2,500-character ASCII password', LONG_ASCII, LONG_ASCII],
    ['a 400-character password outside the encoding', LONG_CJK, codesOf(LONG_CJK)],
    ['a password taller than a page', TALLER_THAN_A_PAGE, TALLER_THAN_A_PAGE]
  ])('continues on further pages and reads back exactly, for %s', (_, password, expected) => {
    const file = cardFileOf(hidden(password), t)
    const { file: text, kids, count, pages, streams } = pdfFileParts(file.bytes)

    expect(file.pages).toBeGreaterThan(1)
    expect(text.match(/\/Type\s*\/Page(?![A-Za-z])/g)).toHaveLength(file.pages)
    expect(streams).toHaveLength(file.pages)
    expect(count).toBe(file.pages)
    expect(kids).toEqual(pages.map(({ object }) => object))
    expect(pages.map(({ contents }) => contents)).toEqual(streams.map(({ object }) => object))

    expect(drawnPassword(password).text).toBe(expected)
  })

  eachIt([
    ['a 2,500-character ASCII password', LONG_ASCII],
    ['a 400-character password outside the encoding', LONG_CJK],
    ['a password taller than a page', TALLER_THAN_A_PAGE]
  ])('writes every page as a stream that parses, inside its border, for %s', (_, password) => {
    const { streams } = pdfFileParts(cardFileOf(hidden(password), t).bytes)
    streams.forEach((stream) => {
      expect(stream.declaredLength).toBe(stream.text.length)
      const lines = stream.text.split('\n')
      lines.forEach((line) => {
        expect(OPERATOR_LINES.some((operator) => operator.test(line))).toBe(true)
      })
      // Text objects open and close in turn.
      const marks = lines.filter((line) => line === 'BT' || line === 'ET')
      expect(marks.length).toBeGreaterThan(0)
      marks.forEach((mark, at) => expect(mark).toBe(at % 2 ? 'ET' : 'BT'))

      const box = lines[0].match(/ ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re S$/)
      expect(box).not.toBeNull()
      const [left, bottom, width, height] = (box ?? []).slice(1).map(Number)
      Array.from(stream.text.matchAll(/1 0 0 1 ([\d.]+) ([\d.]+) Tm/g)).forEach(([, x, y]) => {
        expect(Number(x)).toBeGreaterThan(left)
        expect(Number(x)).toBeLessThan(left + width)
        expect(Number(y)).toBeGreaterThan(bottom)
        expect(Number(y)).toBeLessThan(bottom + height)
      })
    })
  })

  it('draws the title on the first page only', () => {
    const title = t('socialRecovery.card.cardTitle')
    const blocks = pdfTextBlocks(cardFileOf(hidden(LONG_ASCII), t).bytes)
    const titled = blocks.filter((block) => block.text === title)
    expect(titled).toHaveLength(1)
    expect(titled[0].page).toBe(0)
  })

  eachIt([44, 45, 46, 47])(
    'keeps the password’s label on the page of its first line, for a password of %i lines',
    (count) => {
      const password = 'y'.repeat(64 * count)
      const bytes = cardFileOf(hidden(password), t).bytes
      const label = renderPasswordName('recoveryPassword', t)
      const blocks = pdfTextBlocks(bytes)
      const labelAt = blocks.findIndex((block) => block.text === label)
      expect(labelAt).toBeGreaterThan(-1)

      const value = drawnPassword(password)
      expect(value.lines).toHaveLength(count)
      expect(value.lines[0].page).toBe(blocks[labelAt].page)
      // The block right after the label draws the value's first line.
      expect(blocks[labelAt + 1].page).toBe(blocks[labelAt].page)
      expect(blocks[labelAt + 1].lines[0].text).toBe(value.lines[0].text)
      expect(blocks[labelAt + 1].lines[0].y).toBe(value.lines[0].y)
      expect(value.text).toBe(password)

      const { file, entries } = pdfFileParts(bytes)
      expect(entries.length).toBeGreaterThan(1)
      entries.slice(1).forEach((entry, at) => {
        const header = `${at + 1} ${entry.generation} obj`
        expect(entry.inUse).toBe(true)
        expect(file.slice(entry.offset, entry.offset + header.length)).toBe(header)
        expect(file[entry.offset - 1]).toBe('\n')
      })
    }
  )

  it('splits a value taller than a page between its lines, over more than one page', () => {
    const value = drawnPassword(TALLER_THAN_A_PAGE)
    expect(new Set(value.lines.map(({ page }) => page)).size).toBeGreaterThan(1)
  })
})

describe('the continuation mark', () => {
  eachIt([
    ['a password of words', ORCHIDS],
    ['a 2,500-character ASCII password', LONG_ASCII],
    ['a 400-character password outside the encoding', LONG_CJK],
    ['a password taller than a page', TALLER_THAN_A_PAGE]
  ])(
    'ends every wrapped line of the value but the last, one cell after the text, for %s',
    (_, password) => {
      const value = drawnPassword(password)
      expect(value.lines.length).toBeGreaterThan(1)
      expect(value.marks).toHaveLength(value.lines.length - 1)

      value.lines.forEach((line, at) => {
        const beside = value.marks.filter(
          (mark) =>
            mark.page === line.page && mark.tickEnd > line.y && mark.bar < line.y + line.size
        )
        if (at === value.lines.length - 1) {
          expect(beside).toHaveLength(0)
          return
        }
        expect(beside).toHaveLength(1)
        // A bar with a tick down at its right end, inside the cell after the text.
        const [mark] = beside
        const cellLeft = line.x + line.text.length * line.size * COURIER_ADVANCE
        expect(mark.left).toBeGreaterThan(cellLeft)
        expect(mark.right).toBeGreaterThan(mark.left)
        expect(mark.right).toBeLessThan(cellLeft + line.size * COURIER_ADVANCE)
        expect(mark.tickEnd).toBeLessThan(mark.bar)
      })
    }
  )

  eachIt([
    ['a password of words', ORCHIDS],
    ['a 2,500-character ASCII password', LONG_ASCII],
    ['a 400-character password outside the encoding', LONG_CJK]
  ])(
    'is drawn in the label’s grey, lighter than the value, and never inside its text, for %s',
    (_, password) => {
      const value = drawnPassword(password)
      value.marks.forEach((mark) => {
        expect(mark.grey).toBe(value.labelGrey)
        value.lines.forEach((line) => expect(mark.grey).toBeGreaterThan(line.grey))
      })
      value.lines.forEach((line) => expect(line.text).not.toContain(MARK))
      expect(value.text).not.toContain(MARK)
    }
  )

  it('reads the words back exactly, the spaces at the ends of lines included', () => {
    expect(drawnPassword(ORCHIDS).text).toBe(ORCHIDS)
  })

  it('leaves a gap before the mark when a wrapped line ends on a space', () => {
    const cells = drawnPassword('x'.repeat(200)).lines[0].text.length
    const password = `${'x'.repeat(cells - 1)} tail`
    const value = drawnPassword(password)
    expect(value.lines[0].text).toBe(`${'x'.repeat(cells - 1)} `)
    expect(value.marks).toHaveLength(1)
    const { x, size } = value.lines[0]
    // The space takes its own cell, so the mark stands one cell clear of the last x.
    expect(value.marks[0].left).toBeGreaterThan(x + cells * size * COURIER_ADVANCE)
    expect(value.marks[0].right).toBeLessThan(x + (cells + 1) * size * COURIER_ADVANCE)
    expect(value.text).toBe(password)
  })

  it('stays off a value that fits on one line', () => {
    expect(drawnPassword(PASSWORD).marks).toHaveLength(0)
  })
})

describe('the text a reader extracts from the file', () => {
  // A value line holds 64 characters, so 65 wrap onto a second line.
  const TWO_LINES = 'a'.repeat(65)

  // Every string the file shows, split at the password's label: the strings
  // before it, and the password's own strings, up to the first card line.
  const shownAroundPassword = (password: string) => {
    const shown = pdfShownStrings(cardFileOf(hidden(password), t).bytes)
    const label = renderPasswordName('recoveryPassword', t)
    const guide = t('socialRecovery.card.lines.guide')
    const labelAt = shown.findIndex(({ text }) => text === label)
    expect(labelAt).toBeGreaterThan(-1)
    const after = shown.slice(labelAt + 1)
    const guideAt = after.findIndex(({ text }) => text.length > 10 && guide.startsWith(text))
    expect(guideAt).toBeGreaterThan(0)
    return { shown, before: shown.slice(0, labelAt), password: after.slice(0, guideAt) }
  }

  const strokedPaths = (password: string): string[] =>
    pdfFileParts(cardFileOf(hidden(password), t).bytes).streams.flatMap(({ text }) =>
      Array.from(
        text.matchAll(/-?[\d.]+ -?[\d.]+ m(?:\s+-?[\d.]+ -?[\d.]+ l)*\s+S/g),
        ([path]) => path
      )
    )

  eachIt([
    ['a password of 65 characters', TWO_LINES, 1],
    ['a password that continues onto further pages', TALLER_THAN_A_PAGE, 2]
  ])(
    'gives the password alone, with no continuation mark in any shown string, for %s',
    (_, password, leastPages) => {
      const { shown, before, password: lines } = shownAroundPassword(password)
      expect(before.map(({ text }) => text)).toEqual([
        t('socialRecovery.card.cardTitle'),
        t('socialRecovery.display.values.account'),
        CHECKSUMMED
      ])
      expect(lines.length).toBeGreaterThan(1)
      expect(lines.map(({ text }) => text).join('')).toBe(password)
      expect(new Set(lines.map(({ page }) => page)).size).toBeGreaterThanOrEqual(leastPages)
      shown.forEach(({ text }) => expect(text).not.toContain(MARK))
    }
  )

  it('shows no byte of the continuation mark anywhere in the file’s streams', () => {
    const { streams } = pdfFileParts(cardFileOf(hidden(TALLER_THAN_A_PAGE), t).bytes)
    streams.forEach(({ text }) => {
      expect(text).not.toContain('\\254')
      expect(text).not.toContain('\xac')
    })
  })

  it('strokes one bar-and-tick path for the one continued line of a 65-character password', () => {
    const paths = strokedPaths(TWO_LINES)
    expect(paths).toHaveLength(1)
    expect(paths[0]).toMatch(/^[\d.]+ [\d.]+ m [\d.]+ [\d.]+ l [\d.]+ [\d.]+ l S$/)
  })

  eachIt([1, 2, 5, 46, 94])(
    'strokes one path fewer than the password’s shown lines, for %i lines of 64 characters',
    (count) => {
      const password = 'a'.repeat(64 * count)
      const { password: lines } = shownAroundPassword(password)
      expect(lines).toHaveLength(count)
      expect(strokedPaths(password)).toHaveLength(count - 1)
    }
  )
})
