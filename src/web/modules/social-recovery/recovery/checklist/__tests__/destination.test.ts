/**
 * The destination key a recovery installs: a smart account's controlling key
 * as the keystore holds it, and a basic account's own address where the
 * keystore holds its key.
 */
import type { Address } from '@web/modules/social-recovery/sdk-interfaces'
import type { ListedAccountFacts } from '@web/modules/social-recovery/shared/client'

import { destinationKeyOf } from '@web/modules/social-recovery/recovery/checklist'

const ACCOUNT: Address = '0x1111111111111111111111111111111111111111'
const KEY: Address = '0x4444444444444444444444444444444444444444'

const factsOf = (facts: Partial<ListedAccountFacts>): ListedAccountFacts =>
  ({ account: { addr: ACCOUNT }, ...facts } as unknown as ListedAccountFacts)

describe('the destination key', () => {
  it('is the key the keystore holds for a smart account', () => {
    const facts = factsOf({
      creation: {} as ListedAccountFacts['creation'],
      key: { addr: KEY, type: 'internal' }
    })

    expect(destinationKeyOf(facts)).toBe(KEY)
  })

  it('is the own address of a basic account', () => {
    const facts = factsOf({ key: { addr: ACCOUNT, type: 'internal' } })

    expect(destinationKeyOf(facts)).toBe(ACCOUNT)
  })

  it('is none for a basic account the keystore holds no key for', () => {
    expect(destinationKeyOf(factsOf({}))).toBeNull()
  })

  it('is none for a basic account whose held key is at another address', () => {
    const facts = factsOf({ key: { addr: KEY, type: 'internal' } })

    expect(destinationKeyOf(facts)).toBeNull()
  })
})
