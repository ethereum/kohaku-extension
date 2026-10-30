import type { Enrollment } from '@web/modules/social-recovery/shared/records'
import { emptySlot } from '@web/modules/social-recovery/shared/records/slots'

import {
  accountReadsToRetry,
  saveGateOf,
  untestedInPath
} from '@web/modules/social-recovery/setup/review/gate'
import { trustRowsOf } from '@web/modules/social-recovery/setup/review/trust'
import type {
  AccountReads,
  MethodReads,
  SaveGateInput
} from '@web/modules/social-recovery/setup/review/types'
import {
  ALICE,
  answered,
  BOB,
  BOOK,
  declaration,
  descriptionOf,
  enrolled,
  group,
  info,
  OTHER_KEY,
  PASSKEY,
  readsOf,
  REMOVED_KEY,
  required,
  setupStateOf,
  SHIPPED,
  THIRD_PARTY,
  THIRD_PARTY_MODULE,
  UNANSWERED
} from '@web/modules/social-recovery/setup/review/__fixtures__/review'

const passkeyRows = (reads: MethodReads) =>
  trustRowsOf({
    clauses: [required(PASSKEY)],
    enrollments: [],
    reads: readsOf([[BOOK.methods.passkey, reads]]),
    shippedMethods: SHIPPED,
    addressBook: BOOK
  })

const ANSWERED_ROWS = passkeyRows(answered())
const UNAVAILABLE_ROWS = passkeyRows({
  trustedParties: declaration(),
  moduleInfo: info(),
  paused: UNANSWERED
})
const UNTESTED = [{ credential: ALICE, clause: 0, member: 0 }]

const PENDING_ROWS = passkeyRows({ trustedParties: declaration(), moduleInfo: info() })

const TWO_AUTHORITIES = descriptionOf([
  { key: REMOVED_KEY, isAuthority: true },
  { key: OTHER_KEY, isAuthority: true }
])

const READS: AccountReads = {
  removedKey: { status: 'answered', value: { kind: 'named', key: REMOVED_KEY } },
  fitCheck: { status: 'answered', value: { basis: 'deployed-code', fits: true } },
  setupState: { status: 'answered', value: setupStateOf(false) },
  description: { status: 'answered', value: descriptionOf() }
}

const REMOVED_KEY_UNNAMED: AccountReads['removedKey'] = {
  status: 'answered',
  value: { kind: 'unavailable', cause: 'not-a-key' }
}
const SEVERAL_KEYS: AccountReads['removedKey'] = {
  status: 'answered',
  value: { kind: 'unavailable', cause: 'several-key-entries' }
}
const NO_CREATION_RECORD: AccountReads['removedKey'] = {
  status: 'answered',
  value: { kind: 'unavailable', cause: 'no-source' }
}
const DOES_NOT_FIT: AccountReads['fitCheck'] = {
  status: 'answered',
  value: { basis: 'deployed-code', fits: false }
}
const HAS_SETUP: AccountReads['setupState'] = { status: 'answered', value: setupStateOf(true) }
const KEY_COUNT: AccountReads['description'] = { status: 'answered', value: TWO_AUTHORITIES }

const gateOf = (input: Partial<SaveGateInput> = {}) =>
  saveGateOf({
    recordsLoaded: true,
    clientReady: true,
    trustRows: ANSWERED_ROWS,
    untested: false,
    clauses: [],
    backup: 'encrypted',
    passwordSet: true,
    basicAccount: false,
    ...READS,
    ...input
  })

describe('the save gate', () => {
  it('lets Save run once every read answered and nothing blocks it', () => {
    expect(gateOf()).toEqual({ canSave: true, blocked: null, notTested: false })
  })

  it('keeps Save disabled with nothing blocking while the records or the client are not ready', () => {
    expect(gateOf({ recordsLoaded: false })).toMatchObject({ canSave: false, blocked: null })
    expect(gateOf({ clientReady: false })).toMatchObject({ canSave: false, blocked: null })
    expect(
      gateOf({ clientReady: false, trustRows: UNAVAILABLE_ROWS, setupState: HAS_SETUP })
    ).toMatchObject({ canSave: false, blocked: null })
  })

  it('keeps Save disabled with nothing blocking while a read is still running', () => {
    expect(gateOf({ trustRows: PENDING_ROWS })).toMatchObject({ canSave: false, blocked: null })
    expect(gateOf({ trustRows: [] })).toMatchObject({ canSave: false, blocked: null })
    const names = ['removedKey', 'fitCheck', 'setupState', 'description'] as const
    names.forEach((name) => {
      expect(gateOf({ [name]: { status: 'pending' } })).toMatchObject({
        canSave: false,
        blocked: null
      })
    })
  })

  describe('each blocker alone', () => {
    it('reads unavailable where a trust read did not answer', () => {
      expect(gateOf({ trustRows: UNAVAILABLE_ROWS })).toMatchObject({
        canSave: false,
        blocked: { kind: 'unavailable' }
      })
    })

    it('reads unavailable where the fit check threw', () => {
      expect(gateOf({ fitCheck: { status: 'failed' } })).toMatchObject({
        canSave: false,
        blocked: { kind: 'unavailable' }
      })
    })

    it('reads unavailable where the setup read threw', () => {
      expect(gateOf({ setupState: { status: 'failed' } })).toMatchObject({
        canSave: false,
        blocked: { kind: 'unavailable' }
      })
    })

    it('reads the removed key unreadable where the reading names no key', () => {
      expect(gateOf({ removedKey: REMOVED_KEY_UNNAMED })).toMatchObject({
        canSave: false,
        blocked: { kind: 'removed-key-unreadable' }
      })
    })

    it('reads the removed key unreadable where its read threw', () => {
      expect(gateOf({ removedKey: { status: 'failed' } })).toMatchObject({
        canSave: false,
        blocked: { kind: 'removed-key-unreadable' }
      })
    })

    it('reads cannot recover where the fit check refuses', () => {
      expect(gateOf({ fitCheck: DOES_NOT_FIT })).toMatchObject({
        canSave: false,
        blocked: { kind: 'cannot-recover', reason: 'not-supported' }
      })
    })

    it('reads cannot recover with the count where more than one key holds authority', () => {
      expect(gateOf({ description: KEY_COUNT })).toMatchObject({
        canSave: false,
        blocked: { kind: 'cannot-recover', reason: 'key-count', count: 2 }
      })
    })

    it('counts only the candidate keys that hold authority', () => {
      const description = descriptionOf([
        { key: REMOVED_KEY, isAuthority: true },
        { key: OTHER_KEY, isAuthority: false }
      ])

      expect(gateOf({ description: { status: 'answered', value: description } })).toMatchObject({
        canSave: true,
        blocked: null
      })
    })

    it('reads already set up where the account holds a setup', () => {
      expect(gateOf({ setupState: HAS_SETUP })).toMatchObject({
        canSave: false,
        blocked: { kind: 'already-set-up' }
      })
    })
  })

  describe('the order of the blockers', () => {
    it('shows unavailable before every other blocker', () => {
      expect(
        gateOf({
          trustRows: UNAVAILABLE_ROWS,
          removedKey: REMOVED_KEY_UNNAMED,
          description: KEY_COUNT,
          setupState: HAS_SETUP
        }).blocked
      ).toEqual({ kind: 'unavailable' })
      expect(
        gateOf({ fitCheck: { status: 'failed' }, removedKey: { status: 'failed' } }).blocked
      ).toEqual({ kind: 'unavailable' })
    })

    it('shows cannot recover before the removed key unreadable and already set up', () => {
      expect(
        gateOf({
          removedKey: REMOVED_KEY_UNNAMED,
          fitCheck: DOES_NOT_FIT,
          description: KEY_COUNT,
          setupState: HAS_SETUP
        }).blocked
      ).toEqual({ kind: 'cannot-recover', reason: 'not-supported' })
    })

    it('shows the unsupported account before the key count', () => {
      expect(gateOf({ fitCheck: DOES_NOT_FIT, description: KEY_COUNT }).blocked).toEqual({
        kind: 'cannot-recover',
        reason: 'not-supported'
      })
    })

    it('shows cannot recover before already set up', () => {
      expect(gateOf({ fitCheck: DOES_NOT_FIT, setupState: HAS_SETUP }).blocked).toEqual({
        kind: 'cannot-recover',
        reason: 'not-supported'
      })
      expect(gateOf({ description: KEY_COUNT, setupState: HAS_SETUP }).blocked).toEqual({
        kind: 'cannot-recover',
        reason: 'key-count',
        count: 2
      })
    })
  })

  describe("the wallet's reading of several keys", () => {
    it('reads cannot recover with the count the description gives', () => {
      expect(gateOf({ removedKey: SEVERAL_KEYS, description: KEY_COUNT })).toMatchObject({
        canSave: false,
        blocked: { kind: 'cannot-recover', reason: 'key-count', count: 2 }
      })
    })

    it('reads cannot recover with no count where the description threw', () => {
      const gate = gateOf({ removedKey: SEVERAL_KEYS, description: { status: 'failed' } })

      expect(gate.canSave).toBe(false)
      expect(gate.blocked).toEqual({ kind: 'cannot-recover', reason: 'key-count' })
    })

    it('reads cannot recover with no count where the description counts a single authority', () => {
      expect(gateOf({ removedKey: SEVERAL_KEYS }).blocked).toEqual({
        kind: 'cannot-recover',
        reason: 'key-count'
      })
    })

    it('never reads the removed key unreadable', () => {
      expect(gateOf({ removedKey: SEVERAL_KEYS }).blocked).not.toEqual({
        kind: 'removed-key-unreadable'
      })
    })

    it('shows the unsupported account before the key count', () => {
      expect(
        gateOf({ removedKey: SEVERAL_KEYS, fitCheck: DOES_NOT_FIT, description: KEY_COUNT }).blocked
      ).toEqual({ kind: 'cannot-recover', reason: 'not-supported' })
    })

    it('shows the key count before already set up', () => {
      expect(gateOf({ removedKey: SEVERAL_KEYS, setupState: HAS_SETUP }).blocked).toEqual({
        kind: 'cannot-recover',
        reason: 'key-count'
      })
    })

    it('shows unavailable before the key count', () => {
      expect(
        gateOf({ removedKey: SEVERAL_KEYS, setupState: { status: 'failed' } }).blocked
      ).toEqual({ kind: 'unavailable' })
    })
  })

  it('reads the removed key unreadable where the account has no creation record', () => {
    expect(gateOf({ removedKey: NO_CREATION_RECORD })).toMatchObject({
      canSave: false,
      blocked: { kind: 'removed-key-unreadable' }
    })
  })

  describe('while a read it depends on is still running', () => {
    it('shows no block while the removed key is pending, even where the setup read found a setup', () => {
      expect(gateOf({ removedKey: { status: 'pending' }, setupState: HAS_SETUP })).toEqual({
        canSave: false,
        blocked: null,
        notTested: false
      })
    })

    it('shows no block while the description is pending, even where the fit check refuses', () => {
      expect(
        gateOf({ description: { status: 'pending' }, fitCheck: DOES_NOT_FIT }).blocked
      ).toBeNull()
    })

    it('shows no block while a trust read is pending, even where an account read threw', () => {
      expect(
        gateOf({ trustRows: PENDING_ROWS, setupState: { status: 'failed' } }).blocked
      ).toBeNull()
    })

    it('shows no block while the fit check is pending, even where the removed key has no name', () => {
      expect(
        gateOf({ fitCheck: { status: 'pending' }, removedKey: REMOVED_KEY_UNNAMED }).blocked
      ).toBeNull()
    })

    it('still warns of an untested method', () => {
      expect(gateOf({ removedKey: { status: 'pending' }, untested: UNTESTED })).toEqual({
        canSave: false,
        blocked: null,
        notTested: UNTESTED
      })
    })
  })

  it('warns of an untested method beside an enabled Save', () => {
    expect(gateOf({ untested: UNTESTED })).toEqual({
      canSave: true,
      blocked: null,
      notTested: UNTESTED
    })
  })

  it('warns of an untested method beside whichever blocker applies', () => {
    expect(gateOf({ untested: UNTESTED, setupState: HAS_SETUP })).toEqual({
      canSave: false,
      blocked: { kind: 'already-set-up' },
      notTested: UNTESTED
    })
  })

  it('lets Save run where the setup description could not be read', () => {
    expect(gateOf({ description: { status: 'failed' } })).toEqual({
      canSave: true,
      blocked: null,
      notTested: false
    })
  })

  it('lets Save run where a method reads as stopped', () => {
    const trustRows = passkeyRows(answered(declaration(), info(), { answered: true, value: true }))

    expect(trustRows[0]?.contract.status).toBe('declared')
    expect(gateOf({ trustRows })).toEqual({ canSave: true, blocked: null, notTested: false })
  })

  it('lets a third-party module count as a trust read that answered', () => {
    const trustRows = trustRowsOf({
      clauses: [group(2, PASSKEY, THIRD_PARTY)],
      enrollments: [],
      reads: readsOf([
        [BOOK.methods.passkey, answered()],
        [THIRD_PARTY_MODULE, answered(declaration(), info(false))]
      ]),
      shippedMethods: SHIPPED,
      addressBook: BOOK
    })

    expect(gateOf({ trustRows })).toMatchObject({ canSave: true, blocked: null })
  })
})

describe('a basic account, which this release cannot recover', () => {
  const NOT_SUPPORTED = { kind: 'cannot-recover', reason: 'not-supported' }
  const EMPTY_PASSKEY = emptySlot('passkey')
  // What the wallet reads for a key with no smart account: no creation record
  // to name the removed key, and no code, so the fit is judged on the code to be.
  const BASIC_READS: Partial<SaveGateInput> = {
    removedKey: NO_CREATION_RECORD,
    fitCheck: {
      status: 'answered',
      value: {
        basis: 'code-to-be',
        implementation: '0x8888888888888888888888888888888888888888',
        fits: true
      }
    }
  }

  it("reads cannot recover for the unsupported account on the wallet's own reads of a key", () => {
    expect(gateOf({ ...BASIC_READS, basicAccount: true })).toMatchObject({
      canSave: false,
      blocked: NOT_SUPPORTED
    })
  })

  it('reads cannot recover for the unsupported account whatever the reads answer', () => {
    const cases: Partial<SaveGateInput>[] = [
      {},
      { removedKey: { status: 'failed' } },
      { removedKey: REMOVED_KEY_UNNAMED },
      { removedKey: SEVERAL_KEYS, description: KEY_COUNT },
      { description: KEY_COUNT },
      { fitCheck: { status: 'failed' }, setupState: { status: 'failed' } },
      { trustRows: UNAVAILABLE_ROWS },
      { setupState: HAS_SETUP },
      { removedKey: { status: 'pending' }, fitCheck: { status: 'pending' } },
      { trustRows: PENDING_ROWS }
    ]
    cases.forEach((reads) => {
      expect(gateOf({ ...reads, basicAccount: true })).toMatchObject({
        canSave: false,
        blocked: NOT_SUPPORTED
      })
    })
  })

  it('reads cannot recover for the unsupported account before the blocks the records decide', () => {
    expect(
      gateOf({ ...BASIC_READS, basicAccount: true, clauses: [required(EMPTY_PASSKEY)] }).blocked
    ).toEqual(NOT_SUPPORTED)
    expect(gateOf({ ...BASIC_READS, basicAccount: true, passwordSet: false }).blocked).toEqual(
      NOT_SUPPORTED
    )
  })

  it('reads cannot recover for the unsupported account while the records or the client are not ready', () => {
    expect(gateOf({ basicAccount: true, recordsLoaded: false })).toMatchObject({
      canSave: false,
      blocked: NOT_SUPPORTED
    })
    expect(gateOf({ basicAccount: true, clientReady: false })).toMatchObject({
      canSave: false,
      blocked: NOT_SUPPORTED
    })
  })

  it('never reads the removed key unreadable', () => {
    expect(gateOf({ ...BASIC_READS, basicAccount: true }).blocked).not.toEqual({
      kind: 'removed-key-unreadable'
    })
    expect(gateOf({ removedKey: { status: 'failed' }, basicAccount: true }).blocked).not.toEqual({
      kind: 'removed-key-unreadable'
    })
  })

  it('leaves the verdicts of an account the wallet does not list as basic as they were', () => {
    const cases: Partial<SaveGateInput>[] = [
      {},
      { removedKey: NO_CREATION_RECORD },
      { removedKey: REMOVED_KEY_UNNAMED },
      { fitCheck: DOES_NOT_FIT },
      { description: KEY_COUNT },
      { removedKey: SEVERAL_KEYS },
      { setupState: HAS_SETUP },
      { trustRows: UNAVAILABLE_ROWS },
      { passwordSet: false },
      { removedKey: { status: 'pending' } }
    ]
    cases.forEach((reads) => {
      expect(gateOf({ ...reads, basicAccount: false })).toEqual(gateOf(reads))
    })
  })
})

describe('a cannot-recover answer before the removed key unreadable', () => {
  const NOT_SUPPORTED = { kind: 'cannot-recover', reason: 'not-supported' }

  it('reads cannot recover where the account has no creation record and the action does not fit it', () => {
    expect(gateOf({ removedKey: NO_CREATION_RECORD, fitCheck: DOES_NOT_FIT })).toMatchObject({
      canSave: false,
      blocked: NOT_SUPPORTED
    })
  })

  it('shows the fit refusal before a removed key that could not be named or whose read threw', () => {
    expect(gateOf({ removedKey: REMOVED_KEY_UNNAMED, fitCheck: DOES_NOT_FIT }).blocked).toEqual(
      NOT_SUPPORTED
    )
    expect(gateOf({ removedKey: { status: 'failed' }, fitCheck: DOES_NOT_FIT }).blocked).toEqual(
      NOT_SUPPORTED
    )
  })

  it('shows the key count before a removed key that could not be named or whose read threw', () => {
    const KEY_COUNT_BLOCK = { kind: 'cannot-recover', reason: 'key-count', count: 2 }

    expect(gateOf({ removedKey: NO_CREATION_RECORD, description: KEY_COUNT }).blocked).toEqual(
      KEY_COUNT_BLOCK
    )
    expect(gateOf({ removedKey: { status: 'failed' }, description: KEY_COUNT }).blocked).toEqual(
      KEY_COUNT_BLOCK
    )
  })

  it('still shows unavailable before the fit refusal', () => {
    expect(
      gateOf({
        removedKey: NO_CREATION_RECORD,
        fitCheck: DOES_NOT_FIT,
        setupState: { status: 'failed' }
      }).blocked
    ).toEqual({ kind: 'unavailable' })
  })
})

describe('the untested warning beside a cannot-recover answer', () => {
  const FINAL = [
    ['a basic account', () => gateOf({ basicAccount: true, untested: UNTESTED })],
    [
      'a basic account on the wallet reads of a key',
      () =>
        gateOf({
          basicAccount: true,
          removedKey: NO_CREATION_RECORD,
          untested: UNTESTED
        })
    ],
    [
      'a basic account whose path holds an empty slot',
      () =>
        gateOf({
          basicAccount: true,
          clauses: [required(emptySlot('passkey'))],
          untested: UNTESTED
        })
    ],
    [
      'a basic account whose records are loaded but whose client is not ready',
      () => gateOf({ basicAccount: true, clientReady: false, untested: UNTESTED })
    ],
    ['an action that does not fit', () => gateOf({ fitCheck: DOES_NOT_FIT, untested: UNTESTED })],
    [
      'an action that does not fit beside an unreadable removed key',
      () => gateOf({ fitCheck: DOES_NOT_FIT, removedKey: REMOVED_KEY_UNNAMED, untested: UNTESTED })
    ],
    ['the key count', () => gateOf({ description: KEY_COUNT, untested: UNTESTED })],
    [
      'several keys with no count',
      () =>
        gateOf({
          removedKey: SEVERAL_KEYS,
          description: { status: 'failed' },
          untested: UNTESTED
        })
    ]
  ] as const

  FINAL.forEach(([named, gate]) =>
    it(`shows no untested warning for ${named}`, () => {
      expect(gate().blocked?.kind).toBe('cannot-recover')
      expect(gate().notTested).toBe(false)
    })
  )

  const OTHER = [
    [
      'a trust read that did not answer',
      'unavailable',
      () => gateOf({ trustRows: UNAVAILABLE_ROWS, untested: UNTESTED })
    ],
    [
      'a removed key the wallet could not name',
      'removed-key-unreadable',
      () => gateOf({ removedKey: REMOVED_KEY_UNNAMED, untested: UNTESTED })
    ],
    [
      'an account with no creation record',
      'removed-key-unreadable',
      () => gateOf({ removedKey: NO_CREATION_RECORD, untested: UNTESTED })
    ],
    [
      'an account that holds a setup',
      'already-set-up',
      () => gateOf({ setupState: HAS_SETUP, untested: UNTESTED })
    ],
    [
      'a path with an empty slot',
      'empty-slot',
      () => gateOf({ clauses: [required(emptySlot('passkey'))], untested: UNTESTED })
    ],
    [
      'a hidden setup with no recovery password',
      'password-missing',
      () => gateOf({ passwordSet: false, untested: UNTESTED })
    ]
  ] as const

  OTHER.forEach(([named, kind, gate]) =>
    it(`still warns of the untested method beside the block for ${named}`, () => {
      expect(gate().blocked?.kind).toBe(kind)
      expect(gate().notTested).toEqual(UNTESTED)
    })
  )

  it('still warns beside an enabled Save and beside the unreadable key of an account not listed as basic', () => {
    expect(gateOf({ basicAccount: false, untested: UNTESTED }).notTested).toEqual(UNTESTED)
    expect(
      gateOf({ basicAccount: false, removedKey: NO_CREATION_RECORD, untested: UNTESTED }).notTested
    ).toEqual(UNTESTED)
  })
})

describe('the blocks the setup records decide', () => {
  const EMPTY_PASSKEY = emptySlot('passkey')

  it('blocks a hidden setup with no recovery password set', () => {
    expect(gateOf({ backup: 'encrypted', passwordSet: false })).toMatchObject({
      canSave: false,
      blocked: { kind: 'password-missing' }
    })
  })

  it('lets a hidden setup with its recovery password set save', () => {
    expect(gateOf({ backup: 'encrypted', passwordSet: true })).toMatchObject({
      canSave: true,
      blocked: null
    })
  })

  it('lets a public setup save with no recovery password set', () => {
    expect(gateOf({ backup: 'clear', passwordSet: false })).toMatchObject({
      canSave: true,
      blocked: null
    })
  })

  it('lets an empty backup with no recovery password set reach the reads blocks', () => {
    expect(gateOf({ backup: 'empty', passwordSet: false })).toMatchObject({
      canSave: true,
      blocked: null
    })
    expect(gateOf({ backup: 'empty', passwordSet: false, setupState: HAS_SETUP }).blocked).toEqual({
      kind: 'already-set-up'
    })
  })

  it('blocks a path with an empty slot in its first clause', () => {
    expect(gateOf({ clauses: [group(1, ALICE, EMPTY_PASSKEY), required(PASSKEY)] })).toMatchObject({
      canSave: false,
      blocked: { kind: 'empty-slot' }
    })
  })

  it('blocks a path with an empty slot in its second clause', () => {
    expect(gateOf({ clauses: [required(PASSKEY), group(1, ALICE, EMPTY_PASSKEY)] })).toMatchObject({
      canSave: false,
      blocked: { kind: 'empty-slot' }
    })
  })

  it('blocks a path whose required row is an empty slot', () => {
    expect(gateOf({ clauses: [group(1, ALICE), required(EMPTY_PASSKEY)] })).toMatchObject({
      canSave: false,
      blocked: { kind: 'empty-slot' }
    })
  })

  it('lets a path whose every slot holds a method save', () => {
    expect(gateOf({ clauses: [group(1, ALICE, PASSKEY), required(PASSKEY)] })).toMatchObject({
      canSave: true,
      blocked: null
    })
  })

  it('shows the empty slot before the missing password', () => {
    expect(
      gateOf({ clauses: [required(EMPTY_PASSKEY)], backup: 'encrypted', passwordSet: false })
        .blocked
    ).toEqual({ kind: 'empty-slot' })
  })

  it('shows the records blocks before every block from the reads', () => {
    const reads = {
      trustRows: UNAVAILABLE_ROWS,
      removedKey: REMOVED_KEY_UNNAMED,
      fitCheck: DOES_NOT_FIT,
      setupState: HAS_SETUP
    }

    expect(gateOf({ ...reads, clauses: [required(EMPTY_PASSKEY)] }).blocked).toEqual({
      kind: 'empty-slot'
    })
    expect(gateOf({ ...reads, passwordSet: false }).blocked).toEqual({
      kind: 'password-missing'
    })
  })

  it('shows the records blocks while a read is still running', () => {
    expect(
      gateOf({ removedKey: { status: 'pending' }, clauses: [required(EMPTY_PASSKEY)] })
    ).toMatchObject({ canSave: false, blocked: { kind: 'empty-slot' } })
    expect(gateOf({ trustRows: PENDING_ROWS, passwordSet: false })).toMatchObject({
      canSave: false,
      blocked: { kind: 'password-missing' }
    })
  })

  it('shows the records blocks while the client is not ready', () => {
    expect(gateOf({ clientReady: false, passwordSet: false })).toMatchObject({
      canSave: false,
      blocked: { kind: 'password-missing' }
    })
  })

  it('shows no records block before the records loaded', () => {
    expect(
      gateOf({ recordsLoaded: false, clauses: [required(EMPTY_PASSKEY)], passwordSet: false })
    ).toMatchObject({ canSave: false, blocked: null })
  })

  it('reaches the reads blocks on a full hidden path with its recovery password set', () => {
    const clauses = [group(1, ALICE, PASSKEY), required(PASSKEY)]

    expect(
      gateOf({ clauses, backup: 'encrypted', passwordSet: true, setupState: HAS_SETUP }).blocked
    ).toEqual({ kind: 'already-set-up' })
    expect(
      gateOf({ clauses, backup: 'encrypted', passwordSet: true, trustRows: UNAVAILABLE_ROWS })
        .blocked
    ).toEqual({ kind: 'unavailable' })
  })
})

describe('whether a method of the path is untested', () => {
  it('holds where a credential skipped its test', () => {
    expect(untestedInPath([required(ALICE)], [enrolled(ALICE, 'not-tested')])).toEqual([
      { credential: ALICE, clause: 0, member: 0 }
    ])
  })

  it('holds where a credential has no enrollment', () => {
    expect(untestedInPath([required(ALICE)], [])).toEqual([
      { credential: ALICE, clause: 0, member: 0 }
    ])
    expect(untestedInPath([group(1, ALICE, PASSKEY)], [enrolled(ALICE)])).toEqual([
      { credential: PASSKEY, clause: 0, member: 1 }
    ])
  })

  const RAN: Enrollment['test'][] = ['failed', 'unavailable', 'not-supported']
  RAN.forEach((test) => {
    it(`does not hold where a credential's test reads ${test}`, () => {
      expect(untestedInPath([required(PASSKEY)], [enrolled(PASSKEY, test)])).toEqual([])
    })
  })

  it('holds where one credential skipped its test beside one whose test failed', () => {
    expect(
      untestedInPath(
        [group(1, ALICE, PASSKEY)],
        [enrolled(ALICE, 'not-tested'), enrolled(PASSKEY, 'failed')]
      )
    ).toEqual([{ credential: ALICE, clause: 0, member: 0 }])
  })

  it('does not hold where every credential passed its test', () => {
    expect(
      untestedInPath([group(1, ALICE, PASSKEY)], [enrolled(ALICE), enrolled(PASSKEY)])
    ).toEqual([])
  })

  it('does not count an empty slot as an untested method', () => {
    expect(untestedInPath([group(1, ALICE, emptySlot('passkey'))], [enrolled(ALICE)])).toEqual([])
  })
})

describe('the untested credentials of a path, at their places', () => {
  const EMPTY_PASSKEY = emptySlot('passkey')

  it('names the one untested row of a path holding a tested row, an empty slot and a skipped test', () => {
    expect(
      untestedInPath(
        [required(PASSKEY), group(1, ALICE, EMPTY_PASSKEY, BOB)],
        [enrolled(PASSKEY), enrolled(ALICE, 'not-tested'), enrolled(BOB)]
      )
    ).toEqual([{ credential: ALICE, clause: 1, member: 0 }])
  })

  it('names two untested rows in path order: a guardian with no enrollment and a skipped test', () => {
    expect(
      untestedInPath(
        [group(1, ALICE, EMPTY_PASSKEY, BOB), required(PASSKEY)],
        [enrolled(ALICE), enrolled(PASSKEY, 'not-tested')]
      )
    ).toEqual([
      { credential: BOB, clause: 0, member: 2 },
      { credential: PASSKEY, clause: 1, member: 0 }
    ])
  })

  it('names none where every filled row passed its test, beside an empty slot', () => {
    expect(
      untestedInPath(
        [required(PASSKEY), group(1, ALICE, EMPTY_PASSKEY, BOB)],
        [enrolled(PASSKEY), enrolled(ALICE), enrolled(BOB)]
      )
    ).toEqual([])
  })

  it('carries the named rows into the warning, and no warning for an empty list or unloaded records', () => {
    const untested = untestedInPath([required(ALICE), required(BOB)], [])

    expect(gateOf({ untested }).notTested).toEqual([
      { credential: ALICE, clause: 0, member: 0 },
      { credential: BOB, clause: 1, member: 0 }
    ])
    expect(gateOf({ untested: [] }).notTested).toBe(false)
    expect(gateOf({ untested, recordsLoaded: false }).notTested).toBe(false)
  })
})

describe('the account reads a retry runs again', () => {
  it('names every read that threw', () => {
    expect(
      accountReadsToRetry({
        removedKey: { status: 'failed' },
        fitCheck: { status: 'failed' },
        setupState: { status: 'failed' },
        description: { status: 'failed' }
      })
    ).toEqual(['removedKey', 'fitCheck', 'setupState', 'description'])
  })

  it('names the removed key where it could not be named', () => {
    expect(accountReadsToRetry({ ...READS, removedKey: REMOVED_KEY_UNNAMED })).toEqual([
      'removedKey'
    ])
  })

  it('does not name the removed key where the account holds several keys', () => {
    expect(accountReadsToRetry({ ...READS, removedKey: SEVERAL_KEYS })).toEqual([])
  })

  it('names the removed key where the account has no creation record', () => {
    expect(accountReadsToRetry({ ...READS, removedKey: NO_CREATION_RECORD })).toEqual([
      'removedKey'
    ])
  })

  it('never names the removed key of a basic account, whatever its read answered', () => {
    expect(accountReadsToRetry({ ...READS, removedKey: NO_CREATION_RECORD }, true)).toEqual([])
    expect(accountReadsToRetry({ ...READS, removedKey: REMOVED_KEY_UNNAMED }, true)).toEqual([])
    expect(accountReadsToRetry({ ...READS, removedKey: { status: 'failed' } }, true)).toEqual([])
  })

  it('still names the other reads of a basic account that threw', () => {
    expect(
      accountReadsToRetry(
        {
          removedKey: { status: 'failed' },
          fitCheck: { status: 'failed' },
          setupState: { status: 'failed' },
          description: { status: 'failed' }
        },
        true
      )
    ).toEqual(['fitCheck', 'setupState', 'description'])
  })

  it('names the removed key of an account not listed as basic as before', () => {
    expect(accountReadsToRetry({ ...READS, removedKey: NO_CREATION_RECORD }, false)).toEqual([
      'removedKey'
    ])
  })

  it('names nothing that answered or is still running', () => {
    expect(accountReadsToRetry(READS)).toEqual([])
    expect(
      accountReadsToRetry({ ...READS, fitCheck: { status: 'pending' }, setupState: HAS_SETUP })
    ).toEqual([])
  })
})
