import type { PrivilegeHoldersReading } from '@web/modules/social-recovery/shared/client'

import {
  authoritiesOf,
  codeEntriesOf,
  doorsOf as doorsWith
} from '@web/modules/social-recovery/setup/review/doors'
import type { AccountRead, AccountReads } from '@web/modules/social-recovery/setup/review/types'
import {
  descriptionOf,
  OTHER_KEY,
  REMOVED_KEY,
  THIRD_KEY
} from '@web/modules/social-recovery/setup/review/__fixtures__/review'

const NAMED: AccountReads['removedKey'] = {
  status: 'answered',
  value: { kind: 'named', key: REMOVED_KEY }
}

const doorsOf = (
  description: Parameters<typeof doorsWith>[0],
  codeEntries: Parameters<typeof doorsWith>[1],
  removedKey: AccountReads['removedKey'] = NAMED
) => doorsWith(description, codeEntries, removedKey)

const answeredWith = (
  ...args: Parameters<typeof descriptionOf>
): AccountRead<PrivilegeHoldersReading> => ({
  status: 'answered',
  value: { kind: 'holders', keys: authoritiesOf(descriptionOf(...args)) }
})

const UNAVAILABLE = { status: 'unavailable' } as const

const SEVERAL_KEYS: AccountReads['removedKey'] = {
  status: 'answered',
  value: { kind: 'unavailable', cause: 'several-key-entries' }
}

describe('the other doors', () => {
  it('wait while the setup description has not come back', () => {
    expect(doorsOf({ status: 'pending' }, UNAVAILABLE)).toEqual({ kind: 'pending' })
  })

  it('read as unreadable where the setup description threw', () => {
    expect(doorsOf({ status: 'failed' }, UNAVAILABLE)).toEqual({ kind: 'unreadable' })
  })

  it('read as none where no key holds authority beside the one a recovery removes', () => {
    expect(doorsOf(answeredWith(), UNAVAILABLE)).toEqual({ kind: 'none' })
    expect(doorsOf(answeredWith([]), UNAVAILABLE)).toEqual({ kind: 'none' })
  })

  it('count the keys beside the removed one while the code entries are unavailable', () => {
    const doors = doorsOf(
      answeredWith([
        { address: REMOVED_KEY, isAuthority: true },
        { address: OTHER_KEY, isAuthority: true },
        { address: THIRD_KEY, isAuthority: true }
      ]),
      UNAVAILABLE
    )

    expect(doors).toEqual({ kind: 'keys', keys: 2 })
  })

  it('leave out the removed key whatever the case its address is written in', () => {
    const doors = doorsOf(
      answeredWith(
        [
          { address: REMOVED_KEY, isAuthority: true },
          { address: OTHER_KEY, isAuthority: true }
        ],
        REMOVED_KEY.toLowerCase() as typeof REMOVED_KEY
      ),
      UNAVAILABLE
    )

    expect(doors).toEqual({ kind: 'keys', keys: 1 })
  })

  it('count only the candidate keys that hold authority', () => {
    const doors = doorsOf(
      answeredWith([
        { address: REMOVED_KEY, isAuthority: true },
        { address: OTHER_KEY, isAuthority: false },
        { address: THIRD_KEY, isAuthority: true }
      ]),
      UNAVAILABLE
    )

    expect(doors).toEqual({ kind: 'keys', keys: 1 })
  })

  it('count every authority where the SDK names no removed key', () => {
    const doors = doorsOf(
      answeredWith(
        [
          { address: OTHER_KEY, isAuthority: true },
          { address: THIRD_KEY, isAuthority: true }
        ],
        'no-creation-triple'
      ),
      UNAVAILABLE
    )

    expect(doors).toEqual({ kind: 'keys', keys: 2 })
  })

  it('read the code entries as unavailable, so the doors name the keys alone', () => {
    const doors = doorsOf(
      answeredWith([
        { address: REMOVED_KEY, isAuthority: true },
        { address: OTHER_KEY, isAuthority: true }
      ]),
      codeEntriesOf()
    )

    expect(doors).toEqual({ kind: 'keys', keys: 1 })
  })

  it('pair the code entries with the keys where both are read', () => {
    const description = answeredWith([
      { address: REMOVED_KEY, isAuthority: true },
      { address: OTHER_KEY, isAuthority: true }
    ])

    expect(doorsOf(description, { status: 'read', count: 2 })).toEqual({
      kind: 'pair',
      codeEntries: 2,
      keys: 1
    })
    expect(doorsOf(answeredWith(), { status: 'read', count: 1 })).toEqual({
      kind: 'pair',
      codeEntries: 1,
      keys: 0
    })
    expect(doorsOf(answeredWith(), { status: 'read', count: 0 })).toEqual({ kind: 'none' })
  })

  describe("with the wallet's reading of the removed key", () => {
    it('leave out the key the wallet names, not the one the description names', () => {
      const doors = doorsOf(
        answeredWith(
          [
            { address: REMOVED_KEY, isAuthority: true },
            { address: OTHER_KEY, isAuthority: true }
          ],
          THIRD_KEY
        ),
        UNAVAILABLE,
        NAMED
      )

      expect(doors).toEqual({ kind: 'keys', keys: 1 })
    })

    it('leave out the key the wallet names whatever the case its address is written in', () => {
      const doors = doorsOf(
        answeredWith([
          { address: REMOVED_KEY, isAuthority: true },
          { address: OTHER_KEY, isAuthority: true }
        ]),
        UNAVAILABLE,
        {
          status: 'answered',
          value: { kind: 'named', key: REMOVED_KEY.toLowerCase() as typeof REMOVED_KEY }
        }
      )

      expect(doors).toEqual({ kind: 'keys', keys: 1 })
    })

    it('read as unreadable where the wallet could not read the privilege holders', () => {
      const unreadable: AccountRead<PrivilegeHoldersReading> = {
        status: 'answered',
        value: { kind: 'unreadable', cause: 'node unreachable' }
      }

      expect(doorsOf(unreadable, UNAVAILABLE, SEVERAL_KEYS)).toEqual({ kind: 'unreadable' })
      expect(doorsOf(unreadable, UNAVAILABLE, NAMED)).toEqual({ kind: 'unreadable' })
    })

    it('count every authority where the wallet names no key but the description names one', () => {
      const doors = doorsOf(
        answeredWith([
          { address: REMOVED_KEY, isAuthority: true },
          { address: OTHER_KEY, isAuthority: true }
        ]),
        UNAVAILABLE,
        SEVERAL_KEYS
      )

      expect(doors).toEqual({ kind: 'keys', keys: 2 })
    })

    it("wait while the wallet's reading has not come back", () => {
      expect(doorsOf(answeredWith(), UNAVAILABLE, { status: 'pending' })).toEqual({
        kind: 'pending'
      })
    })
  })
})
