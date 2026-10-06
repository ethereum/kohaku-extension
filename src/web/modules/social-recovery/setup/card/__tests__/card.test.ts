import type { Address } from '@web/modules/social-recovery/sdk-interfaces'

import {
  levelFromSearch,
  levelOfBackup,
  markCardCarried,
  wasCardCarried
} from '@web/modules/social-recovery/setup/card'

describe('the level of a stored backup', () => {
  it('takes the hidden level for an encrypted backup and the public level otherwise', () => {
    expect(levelOfBackup('encrypted')).toBe('hidden')
    expect(levelOfBackup('clear')).toBe('public')
    expect(levelOfBackup('empty')).toBe('public')
  })
})

describe('the level the save names in the search', () => {
  it('reads hidden and public', () => {
    expect(levelFromSearch('?level=hidden')).toBe('hidden')
    expect(levelFromSearch('?level=public')).toBe('public')
    expect(levelFromSearch('?from=save&level=public')).toBe('public')
  })

  it('reads nothing from an empty search, an unknown level or another letter case', () => {
    expect(levelFromSearch('')).toBeNull()
    expect(levelFromSearch('?from=save')).toBeNull()
    expect(levelFromSearch('?level=private')).toBeNull()
    expect(levelFromSearch('?level=HIDDEN')).toBeNull()
    expect(levelFromSearch('?level=')).toBeNull()
  })
})

describe('the carried card', () => {
  const ACCOUNT: Address = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'
  const OTHER: Address = '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359'

  it('is carried only for the chain and account it was marked on, in any letter case', () => {
    expect(wasCardCarried(1, ACCOUNT)).toBe(false)
    markCardCarried(1, ACCOUNT)
    expect(wasCardCarried(1, ACCOUNT)).toBe(true)
    expect(wasCardCarried(1, ACCOUNT.toLowerCase() as Address)).toBe(true)
    expect(wasCardCarried(1n, ACCOUNT)).toBe(true)
    expect(wasCardCarried(11155111, ACCOUNT)).toBe(false)
    expect(wasCardCarried(1, OTHER)).toBe(false)
  })
})
