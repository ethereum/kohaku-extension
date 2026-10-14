import { eachIt } from '@web/modules/social-recovery/shared/chrome/__fixtures__/table'

describe('the table helper', () => {
  const seen: string[] = []
  eachIt([
    ['one', 1],
    ['two', 2]
  ] as const)('spreads the row %s into the test', (name, count) => {
    seen.push(`${name}:${count}`)
    expect(count).toBe(seen.length)
  })
  eachIt(['alone'])('passes a single value %s as it is', (value) => {
    expect(value).toBe('alone')
  })
  it('runs every row once, in order', () => {
    expect(seen).toEqual(['one:1', 'two:2'])
  })
})
