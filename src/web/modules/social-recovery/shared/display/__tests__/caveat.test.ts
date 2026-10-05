import { NAME_USES, renderResolvedName } from '..'

const CAVEAT = 'The name can change hands. Check the full address.'

describe('resolved name caveat', () => {
  it('carries the caveat beside a full address the reader is asked to check', () => {
    expect(renderResolvedName('alice.eth', 'besideAddressToCheck')).toEqual({
      name: 'alice.eth',
      caveat: CAVEAT
    })
  })

  it('carries the caveat on a name rendered alone for an address the reader acts on', () => {
    expect(renderResolvedName('alice.eth', 'aloneForAction')).toEqual({
      name: 'alice.eth',
      caveat: CAVEAT
    })
  })

  it('carries no caveat on a name shown for information only', () => {
    expect(renderResolvedName('alice.eth', 'informationOnly')).toEqual({
      name: 'alice.eth',
      caveat: null
    })
  })

  it('carries the caveat in every use but information only', () => {
    NAME_USES.filter((use) => use !== 'informationOnly').forEach((use) =>
      expect(renderResolvedName('alice.eth', use)?.caveat).toBe(CAVEAT)
    )
  })

  it('keeps the caveat on a name cut at 24 characters', () => {
    expect(renderResolvedName(`${'a'.repeat(30)}.eth`, 'besideAddressToCheck')).toEqual({
      name: `${'a'.repeat(23)}…`,
      caveat: CAVEAT
    })
  })

  it('returns null for an empty name in every use, so no caveat floats with no name', () => {
    NAME_USES.forEach((use) => expect(renderResolvedName('', use)).toBeNull())
  })

  it('returns null for a blank name in every use', () => {
    NAME_USES.forEach((use) => expect(renderResolvedName('  \t', use)).toBeNull())
  })
})
