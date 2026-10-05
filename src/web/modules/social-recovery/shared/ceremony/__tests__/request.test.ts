import { ceremony } from './harness'

const parse = (search: string) => ceremony().parseCeremonySearch(search)

describe('parseCeremonySearch', () => {
  it('reads a well-formed search', () => {
    expect(parse('?call=enroll&method=passkey&id=req-1')).toEqual({
      ok: true,
      params: { call: 'enroll', method: 'passkey', id: 'req-1', handOff: false }
    })
  })

  it('reads URLSearchParams as well as a string', () => {
    const query = new URLSearchParams({ call: 'testAccess', method: 'passkey', id: 'abc_DEF-9' })
    expect(ceremony().parseCeremonySearch(query)).toMatchObject({
      ok: true,
      params: { call: 'testAccess', id: 'abc_DEF-9' }
    })
  })

  it('reads the phone hand-off from handOff=phone alone', () => {
    expect(parse('?call=createClaim&method=passkey&id=r&handOff=phone')).toMatchObject({
      ok: true,
      params: { handOff: true }
    })
    expect(parse('?call=createClaim&method=passkey&id=r&handOff=true')).toMatchObject({
      ok: true,
      params: { handOff: false }
    })
  })
  ;[
    '',
    '?method=passkey&id=r',
    '?call=delete&method=passkey&id=r',
    '?call=Enroll&method=passkey&id=r'
  ].forEach((search) =>
    it(`refuses ${JSON.stringify(search)} for its call`, () => {
      expect(parse(search)).toEqual({ ok: false, reason: 'call' })
    })
  )
  ;['', 'Passkey', '../passkey', 'pass key', 'x'.repeat(65)].forEach((method) =>
    it(`refuses the method ${JSON.stringify(method.slice(0, 20))}`, () => {
      expect(parse(`?call=enroll&method=${encodeURIComponent(method)}&id=r`)).toEqual({
        ok: false,
        reason: 'method'
      })
    })
  )
  ;['', 'a b', '../r', 'r/1', 'x'.repeat(129)].forEach((id) =>
    it(`refuses the id ${JSON.stringify(id.slice(0, 20))}`, () => {
      expect(parse(`?call=enroll&method=passkey&id=${encodeURIComponent(id)}`)).toEqual({
        ok: false,
        reason: 'id'
      })
    })
  )
})

describe('the returnTo check', () => {
  const withReturn = (returnTo: string) =>
    parse(`?call=enroll&method=passkey&id=r&returnTo=${encodeURIComponent(returnTo)}`)

  ;['/social-recovery/setup', '/social-recovery/recovery?step=2', '/'].forEach((returnTo) =>
    it(`keeps the internal path ${JSON.stringify(returnTo)}`, () => {
      expect(withReturn(returnTo)).toMatchObject({ ok: true, params: { returnTo } })
    })
  )
  ;[
    '//evil.example',
    'https://evil.example',
    '/https://evil.example',
    // A script URL, spelled in two parts so the linter does not read it as one.
    `${'java'}script:alert(1)`,
    `/${'java'}script:alert(1)`,
    '/\\evil.example',
    'social-recovery/setup',
    `/${'a'.repeat(512)}`
  ].forEach((returnTo) =>
    it(`refuses ${JSON.stringify(
      returnTo.slice(0, 30)
    )}, which leaves the extension or is not a path`, () => {
      expect(withReturn(returnTo)).toEqual({ ok: false, reason: 'returnTo' })
    })
  )

  it('leaves returnTo out where the search names none', () => {
    const parsed = parse('?call=enroll&method=passkey&id=r')
    expect(parsed.ok && 'returnTo' in parsed.params).toBe(false)
  })
})

describe('the path a caller opens', () => {
  it('builds the ceremony route and parses back to the same params', () => {
    const params = {
      call: 'createClaim' as const,
      method: 'passkey',
      id: 'req-42',
      handOff: true,
      returnTo: '/social-recovery/recovery'
    }
    const target = ceremony().ceremonyPath(params)
    expect(target.startsWith('/social-recovery/ceremony?')).toBe(true)
    expect(parse(target.slice(target.indexOf('?')))).toEqual({ ok: true, params })
  })

  it('carries no handOff and no returnTo where the caller named none', () => {
    const search = ceremony().ceremonySearch({
      call: 'enroll',
      method: 'passkey',
      id: 'r',
      handOff: false
    })
    expect(search).toBe('?call=enroll&method=passkey&id=r')
  })
})
