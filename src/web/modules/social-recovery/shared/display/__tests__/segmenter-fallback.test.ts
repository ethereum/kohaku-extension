type IntlWithSegmenter = { Segmenter?: unknown }
const intl = Intl as unknown as IntlWithSegmenter

type DisplayModule = typeof import('..')

// Loaded fresh after the delete, so no segmenter built at load time or cached
// by an earlier test hides the missing API. A plain require: ts-jest's
// dynamic-import helper does not exist in an isolated module registry.
const loadFresh = (): DisplayModule => {
  let loaded: DisplayModule | undefined
  jest.isolateModules(() => {
    // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
    loaded = require('..') as DisplayModule
  })
  if (!loaded) throw new Error('the display module did not load')
  return loaded
}

describe('name cut without Intl.Segmenter (Firefox 115)', () => {
  const saved = Object.getOwnPropertyDescriptor(Intl, 'Segmenter')

  beforeEach(() => {
    delete intl.Segmenter
  })

  afterEach(() => {
    if (saved) Object.defineProperty(Intl, 'Segmenter', saved)
  })

  it('runs with Intl.Segmenter really absent', () => {
    expect(typeof intl.Segmenter).toBe('undefined')
  })

  it('loads the display module without throwing', () => {
    expect(() => loadFresh()).not.toThrow()
  })

  it('cuts a plain 25-character name at 24 and does not throw', () => {
    const { ellipsizeName } = loadFresh()
    expect(() => ellipsizeName('Abcdefghijklmnopqrstuvwxy')).not.toThrow()
    expect(ellipsizeName('Abcdefghijklmnopqrstuvwxy')).toBe('Abcdefghijklmnopqrstuvw…')
  })

  it('leaves a 24-character name unchanged', () => {
    const { ellipsizeName } = loadFresh()
    expect(ellipsizeName('Abcdefghijklmnopqrstuvwx')).toBe('Abcdefghijklmnopqrstuvwx')
  })

  it('never splits a one-code-point emoji', () => {
    const { ellipsizeName } = loadFresh()
    expect(ellipsizeName(`${'a'.repeat(22)}\u{1F600}bb`)).toBe(`${'a'.repeat(22)}\u{1F600}…`)
  })

  it('renders a resolved name with its caveat', () => {
    const { renderResolvedName } = loadFresh()
    expect(renderResolvedName(`${'a'.repeat(30)}.eth`, 'besideAddressToCheck')).toEqual({
      name: `${'a'.repeat(23)}…`,
      caveat: 'The name can change hands. Check the full address.'
    })
  })
})
