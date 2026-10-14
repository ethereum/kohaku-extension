/**
 * What the card tests share: the fake recovery client the screen test hands
 * the screen, a promise a test settles by hand, the refusal the setup read
 * throws when a password does not open the saved backup, and the refusal a
 * client built against another digest version fails with, and readers of the
 * card's PDF: the text it draws, the values it draws over one page or several,
 * the parts of its file, and every string a page shows, read by a tokenizer of
 * its own.
 */
import type { RestoreCause, RestoreRefusal } from '@web/modules/social-recovery/sdk-interfaces'
import type { DigestVersionRefusal } from '@web/modules/social-recovery/shared/client'
import { deferred } from '@web/modules/social-recovery/shared/chrome/__fixtures__/deferred'

/** The two setup reads the card's password row calls on the client. */
export interface FakeSetupReads {
  setupState: jest.Mock
  getSetup: jest.Mock
}

/** The client state the screen sees, as the client hook answers it. */
export type FakeClientState =
  | { status: 'loading' }
  | { status: 'ready'; client: { setup: FakeSetupReads } }
  | { status: 'failed'; error: unknown }
  | { status: 'update-the-wallet'; refusal: DigestVersionRefusal }

/** One line a text block draws: where its baseline starts, and its string. */
export interface PdfDrawnLine {
  x: number
  y: number
  text: string
}

/** One text block the PDF draws: its font resource and size, its grey, its page, its lines, and their strings joined. */
export interface PdfTextBlock {
  font: string
  size: number
  grey: number
  /** The page it is drawn on, from 0, in the page tree's order. */
  page: number
  lines: PdfDrawnLine[]
  text: string
}

/** A line drawn on a page, in a font size and a grey. */
export interface PdfPlacedLine extends PdfDrawnLine {
  page: number
  size: number
  grey: number
}

/**
 * One continuation mark as the page strokes it: a bar from `left` to `right`
 * at the height `bar`, then a tick down at `right` to `tickEnd`.
 */
export interface PdfDrawnMark {
  page: number
  /** The stroke colour's grey. */
  grey: number
  lineWidth: number
  left: number
  right: number
  bar: number
  tickEnd: number
}

/** A text block or a stroked mark, as a page draws it. */
export type PdfDrawnItem =
  | { kind: 'text'; block: PdfTextBlock }
  | { kind: 'mark'; mark: PdfDrawnMark }

/** One value as the PDF draws it in the fixed-width font, over every page it spans. */
export interface PdfDrawnValue {
  lines: PdfPlacedLine[]
  /** The marks stroked beside the value's lines. */
  marks: PdfDrawnMark[]
  /** The value's lines joined, the marks left out. */
  text: string
  /** The grey of the label that names the value. */
  labelGrey: number
}

/** A string a page shows with a text operator, decoded from its bytes in the Windows encoding. */
export interface PdfShownString {
  /** The page it is shown on, from 0, in the page tree's order. */
  page: number
  text: string
}

/** One entry of the PDF's cross-reference table, in table order from object 0. */
export interface PdfXrefEntry {
  offset: number
  generation: number
  inUse: boolean
}

/** A stream as written, with its object number and the length its dictionary declares. */
export interface PdfStream {
  object: number
  declaredLength: number
  text: string
}

/** A page object and the object number of its content stream. */
export interface PdfPageObject {
  object: number
  contents: number
}

/** The parts of a PDF file a reader finds its way by. */
export interface PdfFileParts {
  /** The file, one character per byte. */
  file: string
  startxref: number
  /** The first object number of the table's one subsection. */
  firstObject: number
  entries: PdfXrefEntry[]
  trailer: string
  /** The page tree's kids, as object numbers. */
  kids: number[]
  /** The page count the page tree declares. */
  count: number
  /** Every object whose type is a page, in file order. */
  pages: PdfPageObject[]
  /** Every stream, in file order. */
  streams: PdfStream[]
}

export const restoreRefusalOf = (cause: RestoreCause): RestoreRefusal => {
  const error = new Error(`The restore refused: ${cause}`) as RestoreRefusal
  error.name = 'RestoreRefusal'
  error.cause = { code: cause, subject: 'setup', values: {} }
  return error
}

/** The refusal of a client built against another deployment's digest version. */
export const digestVersionRefusal = (): DigestVersionRefusal =>
  Object.assign(new Error('The manager publishes another digest version.'), {
    name: 'DigestVersionRefusal' as const,
    state: 'update-the-wallet' as const,
    carried: { name: 'Recovery', version: '1' }
  })

// The characters the Windows code page 1252 places at the bytes 0x80 to 0x9f,
// where Latin-1 has control codes; 0x81, 0x8d, 0x8f, 0x90 and 0x9d hold none.
// Every other byte reads the same in both.
const WIN_ANSI_HIGH: Record<number, number> = {
  0x80: 0x20ac,
  0x82: 0x201a,
  0x83: 0x0192,
  0x84: 0x201e,
  0x85: 0x2026,
  0x86: 0x2020,
  0x87: 0x2021,
  0x88: 0x02c6,
  0x89: 0x2030,
  0x8a: 0x0160,
  0x8b: 0x2039,
  0x8c: 0x0152,
  0x8e: 0x017d,
  0x91: 0x2018,
  0x92: 0x2019,
  0x93: 0x201c,
  0x94: 0x201d,
  0x95: 0x2022,
  0x96: 0x2013,
  0x97: 0x2014,
  0x98: 0x02dc,
  0x99: 0x2122,
  0x9a: 0x0161,
  0x9b: 0x203a,
  0x9c: 0x0153,
  0x9e: 0x017e,
  0x9f: 0x0178
}

/** The code page's characters at the bytes 0x80 to 0x9f, as pairs of byte and code point. */
export const winAnsiHighEntries = (): Array<[number, number]> =>
  Object.entries(WIN_ANSI_HIGH).map(([byte, codePoint]) => [Number(byte), codePoint])

const winAnsiChar = (byte: number): string => String.fromCodePoint(WIN_ANSI_HIGH[byte] ?? byte)

const decodeLiteral = (literal: string): string =>
  literal.replace(/\\([0-7]{3}|[\\()])/g, (_, escaped: string) =>
    escaped.length === 3 ? winAnsiChar(parseInt(escaped, 8)) : escaped
  )

const fileOf = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')

/**
 * The file read the way a reader reads it: `startxref` from the end, the
 * cross-reference table and the trailer at that offset, the page tree, each
 * page object, and every stream with the length its dictionary declares.
 * Throws where a part is missing.
 */
export const pdfFileParts = (bytes: Uint8Array): PdfFileParts => {
  const file = fileOf(bytes)
  const tail = file.match(/startxref\r?\n(\d+)\r?\n%%EOF\s*$/)
  if (!tail) {
    throw new Error('no startxref before the end of the file')
  }
  const startxref = Number(tail[1])
  const table = file
    .slice(startxref)
    .match(/^xref\r?\n(\d+) (\d+)\r?\n((?:\d{10} \d{5} [nf][ \r]\n)*)trailer\s*(<<[\s\S]*?>>)/)
  if (!table) {
    throw new Error('no cross-reference table at startxref')
  }
  const entries = Array.from(table[3].matchAll(/(\d{10}) (\d{5}) ([nf])/g), ([, o, g, kind]) => ({
    offset: Number(o),
    generation: Number(g),
    inUse: kind === 'n'
  }))
  if (entries.length !== Number(table[2])) {
    throw new Error('the subsection counts another number of entries')
  }

  const objects = Array.from(
    file.matchAll(/(?:^|\n)(\d+) 0 obj\r?\n([\s\S]*?)\r?\nendobj/g),
    ([, n, body]) => ({ object: Number(n), body })
  )
  const tree = objects.find(({ body }) => /\/Type \/Pages\b/.test(body))?.body
  const kids = tree?.match(/\/Kids \[([^\]]*)\]/)?.[1]
  const count = tree?.match(/\/Count (\d+)/)?.[1]
  if (kids === undefined || count === undefined) {
    throw new Error('no page tree')
  }
  const pages = objects.flatMap(({ object, body }) => {
    if (!/\/Type \/Page(?![A-Za-z])/.test(body)) {
      return []
    }
    const contents = body.match(/\/Contents (\d+) 0 R/)?.[1]
    if (contents === undefined) {
      throw new Error(`page ${object} names no content stream`)
    }
    return [{ object, contents: Number(contents) }]
  })
  const streams = objects.flatMap(({ object, body }) => {
    const stream = body.match(/^<< \/Length (\d+) >>\r?\nstream\r?\n([\s\S]*?)\r?\nendstream$/)
    return stream ? [{ object, declaredLength: Number(stream[1]), text: stream[2] }] : []
  })
  if (!streams.length) {
    throw new Error('no content stream')
  }

  return {
    file,
    startxref,
    firstObject: Number(table[1]),
    entries,
    trailer: table[4],
    kids: Array.from(kids.matchAll(/(\d+) 0 R/g), ([, n]) => Number(n)),
    count: Number(count),
    pages,
    streams
  }
}

const TEXT_OBJECT = /(?:^|\n)BT\n([\s\S]*?)\nET/
const MARK_GROUP =
  /(?:^|\n)([\d.]+) G ([\d.]+) w((?:\n[\d.]+ [\d.]+ m [\d.]+ [\d.]+ l [\d.]+ [\d.]+ l S)+)/
const DRAWN_ITEM = new RegExp(`${TEXT_OBJECT.source}|${MARK_GROUP.source}`, 'g')

const textBlockOf = (block: string, page: number): PdfTextBlock => {
  const lines = Array.from(
    block.matchAll(/1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm \(((?:\\.|[^\\)])*)\) Tj/g),
    ([, x, y, literal]) => ({ x: Number(x), y: Number(y), text: decodeLiteral(literal) })
  )
  const font = block.match(/(\/F\d+) ([\d.]+) Tf/)
  return {
    font: font?.[1] ?? '',
    size: Number(font?.[2] ?? NaN),
    grey: Number(block.match(/(?:^|\n)([\d.]+) g(?:\n|$)/)?.[1] ?? NaN),
    page,
    lines,
    text: lines.map((line) => line.text).join('')
  }
}

const marksOf = (grey: string, width: string, paths: string, page: number): PdfDrawnMark[] =>
  Array.from(
    paths.matchAll(/([\d.]+) ([\d.]+) m ([\d.]+) ([\d.]+) l ([\d.]+) ([\d.]+) l S/g),
    (match) => {
      const [left, bar, right, barEnd, tickX, tickEnd] = match.slice(1).map(Number)
      if (barEnd !== bar || tickX !== right) {
        throw new Error(`a mark that is not a bar and a tick: ${match[0]}`)
      }
      return { page, grey: Number(grey), lineWidth: Number(width), left, right, bar, tickEnd }
    }
  )

/**
 * What each page draws, in drawing order, page after page in the page tree's
 * order: its text blocks, read in the Windows encoding the fonts declare, and
 * the continuation marks it strokes.
 */
export const pdfDrawnItems = (bytes: Uint8Array): PdfDrawnItem[] => {
  const { kids, pages, streams } = pdfFileParts(bytes)
  return kids.flatMap((kid, page) => {
    const contents = pages.find(({ object }) => object === kid)?.contents
    const stream = streams.find(({ object }) => object === contents)
    if (!stream) {
      throw new Error(`page ${kid} has no content stream`)
    }
    return Array.from(stream.text.matchAll(DRAWN_ITEM), (match): PdfDrawnItem[] =>
      match[1] !== undefined
        ? [{ kind: 'text', block: textBlockOf(match[1], page) }]
        : marksOf(match[2], match[3], match[4], page).map((mark) => ({ kind: 'mark', mark }))
    ).flat()
  })
}

/**
 * The PDF's text blocks in drawing order, page after page in the page tree's
 * order, each with its lines and their strings joined back into its text.
 */
export const pdfTextBlocks = (bytes: Uint8Array): PdfTextBlock[] =>
  pdfDrawnItems(bytes).flatMap((item) => (item.kind === 'text' ? [item.block] : []))

/**
 * The values the PDF draws in its fixed-width font, each as one piece however
 * many blocks and pages it spans, with the marks stroked after its blocks. A
 * block in another font ends the value.
 */
export const pdfDrawnValues = (bytes: Uint8Array): PdfDrawnValue[] => {
  const values: PdfDrawnValue[] = []
  let current: PdfDrawnValue | undefined
  let labelGrey = NaN
  pdfDrawnItems(bytes).forEach((item) => {
    if (item.kind === 'mark') {
      if (!current) {
        throw new Error('a mark drawn outside a value')
      }
      current.marks.push(item.mark)
      return
    }
    const { block } = item
    if (block.font !== '/F3') {
      current = undefined
      labelGrey = block.grey
      return
    }
    if (!current) {
      current = { lines: [], marks: [], text: '', labelGrey }
      values.push(current)
    }
    const { page, size, grey } = block
    current.lines.push(...block.lines.map((line) => ({ ...line, page, size, grey })))
    current.text += block.text
  })
  return values
}

const ESCAPED_BYTES: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12 }

// The bytes of the literal string whose content starts at `start`, right after
// its opening parenthesis, with every escape the PDF syntax allows and
// balanced parentheses kept as they are; and the index after its closing one.
const literalBytesAt = (stream: string, start: number): { bytes: number[]; end: number } => {
  const bytes: number[] = []
  let depth = 1
  let at = start
  while (at < stream.length) {
    const char = stream[at]
    if (char === '\\') {
      const next = stream[at + 1]
      const octal = stream.slice(at + 1).match(/^[0-7]{1,3}/)?.[0]
      if (octal) {
        // eslint-disable-next-line no-bitwise
        bytes.push(parseInt(octal, 8) & 0xff)
        at += 1 + octal.length
      } else if (next === '\r' || next === '\n') {
        at += next === '\r' && stream[at + 2] === '\n' ? 3 : 2
      } else {
        bytes.push(ESCAPED_BYTES[next] ?? next.charCodeAt(0))
        at += 2
      }
    } else {
      if (char === '(') {
        depth += 1
      }
      if (char === ')') {
        depth -= 1
      }
      if (depth === 0) {
        return { bytes, end: at + 1 }
      }
      bytes.push(char.charCodeAt(0))
      at += 1
    }
  }
  throw new Error('a literal string that never closes')
}

const hexBytesOf = (hex: string): number[] => {
  const digits = hex.replace(/\s/g, '')
  const even = digits.length % 2 ? `${digits}0` : digits
  return Array.from(even.match(/../g) ?? [], (pair) => parseInt(pair, 16))
}

const SHOWING_OPERATORS = new Set(['Tj', 'TJ', "'", '"'])

/**
 * Every string a page shows with a text operator, page after page in the page
 * tree's order and in stream order within a page. Unlike the drawn-item reader
 * above, it reads each content stream token by token and keeps every string
 * operand of `Tj`, `TJ`, `'` and `"`, with nothing filtered out.
 */
export const pdfShownStrings = (bytes: Uint8Array): PdfShownString[] => {
  const { kids, pages, streams } = pdfFileParts(bytes)
  return kids.flatMap((kid, page) => {
    const contents = pages.find(({ object }) => object === kid)?.contents
    const stream = streams.find(({ object }) => object === contents)?.text
    if (stream === undefined) {
      throw new Error(`page ${kid} has no content stream`)
    }
    const shown: PdfShownString[] = []
    let operands: number[][] = []
    let at = 0
    while (at < stream.length) {
      const char = stream[at]
      if (/\s/.test(char) || char === '[' || char === ']') {
        at += 1
      } else if (char === '(') {
        const literal = literalBytesAt(stream, at + 1)
        operands.push(literal.bytes)
        at = literal.end
      } else if (char === '<') {
        const end = stream.indexOf('>', at)
        operands.push(hexBytesOf(stream.slice(at + 1, end)))
        at = end + 1
      } else {
        const token = stream.slice(at).match(/^[^\s()<>[\]]+/)?.[0] ?? char
        at += token.length
        const isOperand = /^[-+.\d]/.test(token) || token.startsWith('/')
        if (!isOperand) {
          if (SHOWING_OPERATORS.has(token)) {
            const strings = operands.map((string) => string.map(winAnsiChar).join(''))
            shown.push(...strings.map((text) => ({ page, text })))
          }
          operands = []
        }
      }
    }
    return shown
  })
}

// Jest runs every file under __tests__, this one included; its own check runs
// only when Jest runs this file, never from a file that imports the harness.
if (expect.getState().testPath === __filename) {
  describe('harness', () => {
    it('settles a held promise only when the test says, either way', async () => {
      const answered = deferred<string>()
      const refused = deferred<string>()
      const first = await Promise.race([answered.promise, Promise.resolve('still waiting')])
      expect(first).toBe('still waiting')
      answered.resolve('opened')
      refused.reject(new Error('refused'))
      await expect(answered.promise).resolves.toBe('opened')
      await expect(refused.promise).rejects.toThrow('refused')
    })

    it('throws a restore refusal as an error that carries its cause', () => {
      const refusal = restoreRefusalOf('restore.backup-unopened')
      expect(refusal).toBeInstanceOf(Error)
      expect(refusal.cause.code).toBe('restore.backup-unopened')
    })
  })
}
