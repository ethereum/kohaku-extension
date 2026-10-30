/**
 * The card as an A4 PDF, written by hand: the title, each row's label and
 * value, and the card's lines, inside a thin border. It uses the three
 * standard fonts every reader carries, Helvetica and Helvetica-Bold for the
 * text and Courier for the values, in their single-byte Windows encoding. A
 * character that encoding lacks is written as its `U+XXXX` code, so nothing is
 * dropped without a trace, and the result says that happened. Such a code
 * cannot be told apart from the same letters typed, so a text that must read
 * back exactly is checked with `carriesExactly` first.
 *
 * A value wraps anywhere, so each of its lines but the last ends with a grey
 * `¬` drawn in the cell right after the text: a space at the end of a line
 * shows as a gap before the mark, and the mark says the value goes on. The
 * mark is a drawn line, not text, so it is not part of the value and a
 * reader's text extraction gives the value alone.
 *
 * Text that does not fit on one page continues on the next, at the same size:
 * a block that does not fit in the room left starts a new page, a label moves
 * with the value it names, and a block taller than a page splits between its
 * lines. Every page has its border; the title is on the first page only.
 */
import type { CardPdf, CardRow, PdfBlock, PdfFont, PdfPage, PdfText } from './types'

// A4 in points.
const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 56
const PADDING = 24
const BOX_WIDTH = PAGE_WIDTH - 2 * MARGIN
const BOX_TOP = PAGE_HEIGHT - MARGIN
const TEXT_X = MARGIN + PADDING
const TEXT_WIDTH = BOX_WIDTH - 2 * PADDING
const TEXT_TOP = BOX_TOP - PADDING
// No baseline goes lower, so a descender stays inside the border.
const LOWEST_BASELINE = MARGIN + PADDING
const LEADING = 1.35

const FONT_NAMES: Record<PdfFont, string> = {
  regular: '/F1',
  bold: '/F2',
  mono: '/F3'
}

// The advance of one character as a share of the font size. Courier's is exact.
// Helvetica's widths vary by character; about 0.56 is its average over ordinary
// lower-case text, which is no bound, since capitals and wide letters run
// wider. The figures here sit above that average so an ordinary English line,
// capitals included, stays inside the padding; a long run of the widest
// letters, such as "W", can still overflow the padding and the border.
const ADVANCE: Record<PdfFont, number> = {
  regular: 0.62,
  bold: 0.66,
  mono: 0.6
}

const TEXT_GREY = 0.07
const LABEL_GREY = 0.35
const BORDER_GREY = 0.6

// The `¬` that ends every wrapped value line but the last, drawn as a stroke
// over Courier's own glyph: a bar from the left of the cell to near its right,
// then a tick down at its right end, in shares of the font size from the cell's
// left and the baseline, and a line about as thick as Courier's strokes.
const MARK_LEFT = 0.09
const MARK_RIGHT = 0.51
const MARK_BAR = 0.37
const MARK_TICK_END = 0.11
const MARK_STROKE = 0.05

// The characters the Windows encoding places between 0x80 and 0x9f; every other
// byte it shares with Latin-1.
const WIN_ANSI_HIGH = new Map<number, number>([
  [0x20ac, 0x80],
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x017d, 0x8e],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02dc, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9a],
  [0x203a, 0x9b],
  [0x0153, 0x9c],
  [0x017e, 0x9e],
  [0x0178, 0x9f]
])

// The no-break space and the soft hyphen share Latin-1's bytes but print as a
// plain space and a hyphen, which hides them, so they take their code instead.
const winAnsiByteOf = (codePoint: number): number | undefined =>
  (codePoint >= 0x20 && codePoint <= 0x7e) ||
  (codePoint >= 0xa1 && codePoint <= 0xff && codePoint !== 0xad)
    ? codePoint
    : WIN_ANSI_HIGH.get(codePoint)

// True when every character of the text has its own byte in the encoding, so
// the PDF gives the text back exactly; false when one would take its code.
export const carriesExactly = (text: string): boolean =>
  Array.from(text).every((char) => winAnsiByteOf(char.codePointAt(0) ?? 0) !== undefined)

const codeOf = (codePoint: number): string =>
  `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`

const toWinAnsi = (text: string): PdfText => {
  let replacedCharacters = false
  const units = Array.from(text, (char) => {
    const codePoint = char.codePointAt(0) ?? 0
    const byte = winAnsiByteOf(codePoint)
    if (byte === undefined) {
      replacedCharacters = true
      return codeOf(codePoint)
    }
    return String.fromCharCode(byte)
  })
  return { units, replacedCharacters }
}

const widthOf = (units: string[]): number => units.reduce((sum, unit) => sum + unit.length, 0)

// Breaks anywhere, keeping every character, a `U+XXXX` code whole.
const wrapAnywhere = (units: string[], max: number): string[][] => {
  const lines: string[][] = []
  let line: string[] = []
  let width = 0
  units.forEach((unit) => {
    if (line.length && width + unit.length > max) {
      lines.push(line)
      line = []
      width = 0
    }
    line.push(unit)
    width += unit.length
  })
  if (line.length) {
    lines.push(line)
  }
  return lines
}

// Breaks after the spaces between words, which stay at the end of their line
// so the lines joined give back the text; a word wider than a line breaks anywhere.
const wrapAtSpaces = (units: string[], max: number): string[][] => {
  const words: string[][] = []
  let word: string[] = []
  units.forEach((unit, at) => {
    word.push(unit)
    if (unit === ' ' && units[at + 1] !== ' ') {
      words.push(word)
      word = []
    }
  })
  if (word.length) {
    words.push(word)
  }

  const lines: string[][] = []
  let line: string[] = []
  let width = 0
  words.forEach((current) => {
    let ink = widthOf(current)
    for (let at = current.length - 1; at >= 0 && current[at] === ' '; at -= 1) {
      ink -= 1
    }
    if (line.length && width + ink > max) {
      lines.push(line)
      line = []
      width = 0
    }
    if (ink > max) {
      const pieces = wrapAnywhere(current, max)
      lines.push(...pieces.slice(0, -1))
      line = [...pieces[pieces.length - 1]]
      width = widthOf(line)
      return
    }
    line.push(...current)
    width += widthOf(current)
  })
  if (line.length) {
    lines.push(line)
  }
  return lines
}

const blockOf = (
  text: string,
  font: PdfFont,
  size: number,
  grey: number,
  gapAfter: number,
  keepWithNext = false
) => {
  const { units, replacedCharacters } = toWinAnsi(text)
  const isValue = font === 'mono'
  const cells = Math.floor(TEXT_WIDTH / (size * ADVANCE[font]))
  // A value leaves its last cell free for the continuation mark.
  const max = Math.max(6, isValue ? cells - 1 : cells)
  const lines = isValue ? wrapAnywhere(units, max) : wrapAtSpaces(units, max)
  const block: PdfBlock = {
    font,
    size,
    grey,
    lines: lines.length ? lines : [[]],
    gapAfter,
    keepWithNext,
    marksContinuation: isValue
  }
  return { block, replacedCharacters }
}

const blocksOf = (title: string, rows: CardRow[]) => {
  const made = [
    blockOf(title, 'bold', 14, TEXT_GREY, 14),
    ...rows.flatMap((row) =>
      row.kind === 'value'
        ? [
            blockOf(row.label, 'bold', 9, LABEL_GREY, 4, true),
            blockOf(row.value, 'mono', 11, TEXT_GREY, 14)
          ]
        : [blockOf(row.text, 'regular', 11, TEXT_GREY, 8)]
    )
  ]
  return {
    blocks: made.map(({ block }) => block),
    replacedCharacters: made.some(({ replacedCharacters }) => replacedCharacters)
  }
}

const num = (value: number): string => String(Number(value.toFixed(2)))

// A literal string: the backslash and both parentheses escaped, every byte
// outside printable ASCII written in octal, so the content stream stays ASCII.
const literalOf = (units: string[]): string =>
  `(${units
    .map((unit) => {
      if (unit.length > 1) {
        return unit
      }
      if (unit === '\\' || unit === '(' || unit === ')') {
        return `\\${unit}`
      }
      const code = unit.charCodeAt(0)
      return code < 0x20 || code > 0x7e ? `\\${code.toString(8).padStart(3, '0')}` : unit
    })
    .join('')})`

// From the top of a block's first line to the baseline of line `count`.
const heightOf = (block: PdfBlock, count: number): number =>
  block.size + (count - 1) * block.size * LEADING

const PAGE_ROOM = TEXT_TOP - LOWEST_BASELINE

// How many lines of the block fit between the cursor and the lowest baseline.
const linesThatFit = (block: PdfBlock, cursor: number): number => {
  const room = cursor - block.size - LOWEST_BASELINE
  return room < 0 ? 0 : Math.floor(room / (block.size * LEADING)) + 1
}

// The room a block asks for before it starts on the page it is on: all of it
// when it fits on a page, else one line. A label asks for the room of the value
// it names as well, so the two start on the same page.
const roomAskedBy = (block: PdfBlock, next: PdfBlock | undefined): number => {
  const whole = heightOf(block, block.lines.length)
  const own = whole <= PAGE_ROOM ? whole : block.size
  if (!block.keepWithNext || !next) {
    return own
  }
  const nextWhole = heightOf(next, next.lines.length)
  const withLabel = whole + block.gapAfter
  return withLabel + (withLabel + nextWhole <= PAGE_ROOM ? nextWhole : next.size)
}

const newPage = (): PdfPage => ({ operators: [], cursor: TEXT_TOP, inkBottom: TEXT_TOP })

// The operators that draw the block's lines `from` up to `to` below the
// cursor, and the baseline of the last: the text in one text object, then the
// continuation marks as stroked paths outside any text object, so the only
// strings the page shows are the value's own lines.
const drawingOf = (cursor: number, block: PdfBlock, from: number, to: number) => {
  const baselineOf = (at: number) => cursor - heightOf(block, at - from + 1)
  const font = `${FONT_NAMES[block.font]} ${num(block.size)} Tf`
  const indexes = Array.from({ length: to - from }, (_, at) => from + at)
  const shown = indexes.map(
    (at) => `1 0 0 1 ${num(TEXT_X)} ${num(baselineOf(at))} Tm ${literalOf(block.lines[at])} Tj`
  )
  const operators = [['BT', font, `${num(block.grey)} g`, ...shown, 'ET'].join('\n')]

  const continued = block.marksContinuation
    ? indexes.filter((at) => at < block.lines.length - 1)
    : []
  if (continued.length) {
    const { size } = block
    const cell = size * ADVANCE[block.font]
    const marks = continued.map((at) => {
      const x = TEXT_X + widthOf(block.lines[at]) * cell
      const baseline = baselineOf(at)
      const left = num(x + MARK_LEFT * size)
      const right = num(x + MARK_RIGHT * size)
      const bar = num(baseline + MARK_BAR * size)
      const tickEnd = num(baseline + MARK_TICK_END * size)
      return `${left} ${bar} m ${right} ${bar} l ${right} ${tickEnd} l S`
    })
    // Saved and restored around the marks, so their stroke colour and width
    // reach no later stroke on the page.
    operators.push(
      ['q', `${num(LABEL_GREY)} G ${num(MARK_STROKE * size)} w`, ...marks, 'Q'].join('\n')
    )
  }
  return { operators, lastBaseline: baselineOf(to - 1) }
}

const pagesOf = (blocks: PdfBlock[]): PdfPage[] => {
  const pages = [newPage()]
  let page = pages[0]
  const turn = () => {
    page = newPage()
    pages.push(page)
  }
  blocks.forEach((block, index) => {
    const started = page.operators.length > 0
    // A block right after its label starts where the label left it: the label
    // already kept room for this block's first line, and the rest splits by line.
    const followsLabel = index > 0 && blocks[index - 1].keepWithNext
    if (
      started &&
      !followsLabel &&
      page.cursor - roomAskedBy(block, blocks[index + 1]) < LOWEST_BASELINE
    ) {
      turn()
    }
    let from = 0
    while (from < block.lines.length) {
      if (linesThatFit(block, page.cursor) === 0) {
        turn()
      }
      // A fresh page holds at least one line of any block.
      const fit = Math.max(1, Math.min(linesThatFit(block, page.cursor), block.lines.length - from))
      const { operators, lastBaseline } = drawingOf(page.cursor, block, from, from + fit)
      page.operators.push(...operators)
      page.inkBottom = lastBaseline
      page.cursor = lastBaseline - block.gapAfter
      from += fit
    }
  })
  return pages
}

const contentOf = (page: PdfPage): string => {
  const bottom = page.inkBottom - PADDING
  const box = [MARGIN, bottom, BOX_WIDTH, BOX_TOP - bottom].map(num).join(' ')
  const border = `${num(BORDER_GREY)} G 0.75 w ${box} re S`
  return [border, ...page.operators].join('\n')
}

const fontObject = (baseFont: string): string =>
  `<< /Type /Font /Subtype /Type1 /BaseFont /${baseFont} /Encoding /WinAnsiEncoding >>`

// The objects in order: the catalog, the page tree, the three fonts, then each
// page followed by its content stream.
const FIRST_PAGE_OBJECT = 6

// Every byte of the file is below 0x100, one character each, so a string's
// length is its byte length and each offset is counted in bytes.
const serialise = (contents: string[]): Uint8Array<ArrayBuffer> => {
  const pageObject = (at: number) => FIRST_PAGE_OBJECT + 2 * at
  const kids = contents.map((_, at) => `${pageObject(at)} 0 R`).join(' ')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${kids}] /Count ${contents.length} >>`,
    fontObject('Helvetica'),
    fontObject('Helvetica-Bold'),
    fontObject('Courier'),
    ...contents.flatMap((content, at) => [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(PAGE_WIDTH)} ${num(PAGE_HEIGHT)}] ` +
        '/Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> ' +
        `/Contents ${pageObject(at) + 1} 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
    ])
  ]
  // The second line's high bytes mark the file as binary for tools that guess.
  let file = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'
  const offsets = objects.map((body, at) => {
    const offset = file.length
    file += `${at + 1} 0 obj\n${body}\nendobj\n`
    return offset
  })
  const xref = file.length
  const entries = offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
  file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${entries.join('')}`
  file += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Uint8Array.from(file, (char) => char.charCodeAt(0))
}

export const cardPdfOf = (title: string, rows: CardRow[]): CardPdf => {
  const { blocks, replacedCharacters } = blocksOf(title, rows)
  const pages = pagesOf(blocks)
  return { bytes: serialise(pages.map(contentOf)), replacedCharacters, pages: pages.length }
}
