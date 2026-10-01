import { getAddress } from 'viem'

import type { Clause } from '@web/modules/social-recovery/sdk-interfaces'
import { emptySlot } from '@web/modules/social-recovery/shared/records/slots'
import type { Enrollment } from '@web/modules/social-recovery/shared/records'

import { aloneSatisfiesRule, nodeKindOf, trustReadsComplete, trustRowsOf } from '../trust'
import type { NodeKind, ProviderKind, TrustReads, TrustRow } from '../types'
import {
  ADMIN,
  ALICE,
  answered,
  BOB,
  BOOK,
  CAROL,
  declaration,
  enrolled,
  guardianAddress,
  group,
  info,
  NOT_PAUSED,
  PASSKEY,
  PASSPORT,
  PENDING_ADMIN,
  PHONE_PASSKEY,
  readsOf,
  required,
  SECOND_PASSPORT,
  SHIPPED,
  THIRD_PARTY,
  THIRD_PARTY_MODULE,
  UNANSWERED
} from '../__fixtures__/review'

const rowsOf = (
  clauses: Clause[],
  reads: TrustReads,
  enrollments: Enrollment[] = [],
  shippedMethods = SHIPPED
): TrustRow[] => trustRowsOf({ clauses, enrollments, reads, shippedMethods, addressBook: BOOK })

const rowOf = (rows: TrustRow[], method: string) => {
  const row = rows.find((held) => held.method.toLowerCase() === method.toLowerCase())
  if (!row) {
    throw new Error(`no trust row for ${method}`)
  }
  return row
}

const EVERY_METHOD_ANSWERED = readsOf([
  [BOOK.methods.ecdsa, answered()],
  [BOOK.methods.passkey, answered()],
  [BOOK.methods.zkpassport, answered(declaration(ADMIN))],
  [BOOK.methods.aadhaar, answered(declaration(ADMIN))]
])

describe('the trust rows', () => {
  it('hold one row per method, however many rows of the path use it, in the order the path first names it', () => {
    const rows = rowsOf(
      [required(PASSKEY), group(2, ALICE, BOB, CAROL), group(1, PHONE_PASSKEY, PASSPORT)],
      EVERY_METHOD_ANSWERED
    )

    expect(rows.map(({ method }) => method)).toEqual([
      BOOK.methods.passkey,
      BOOK.methods.ecdsa,
      BOOK.methods.zkpassport
    ])
    expect(rowOf(rows, BOOK.methods.passkey).headings.map(({ credential }) => credential)).toEqual([
      PASSKEY,
      PHONE_PASSKEY
    ])
    expect(rowOf(rows, BOOK.methods.ecdsa).headings.map(({ guardian }) => guardian)).toEqual(
      ['a1', 'b2', 'c3'].map((byte) => getAddress(guardianAddress(byte)))
    )
  })

  it('count the tested guardians above several guardian headings, and add no count to a single guardian', () => {
    const several = rowsOf([group(2, ALICE, BOB, CAROL)], EVERY_METHOD_ANSWERED, [
      enrolled(ALICE),
      enrolled(BOB, 'not-tested'),
      enrolled(CAROL, 'failed')
    ])
    const single = rowsOf([required(ALICE)], EVERY_METHOD_ANSWERED, [enrolled(ALICE)])

    expect(several[0].guardians).toEqual({ count: 3, tested: 1 })
    expect(several[0].headings.map(({ tested }) => tested)).toEqual([true, false, false])
    expect(single[0].guardians).toBeUndefined()
  })

  it('name no outside party where the declaration holds the zero address as admin', () => {
    const [row] = rowsOf([required(PASSKEY)], EVERY_METHOD_ANSWERED)

    expect(row.contract).toEqual({
      status: 'declared',
      recoverAlone: false,
      aloneAtThresholdOne: false,
      passportRenewal: false,
      paused: false
    })
  })

  it('name the admin, and the address one acceptance away only where the declaration holds one', () => {
    const without = rowsOf(
      [group(2, PASSKEY, PASSPORT)],
      readsOf([
        [BOOK.methods.passkey, answered()],
        [BOOK.methods.zkpassport, answered(declaration(ADMIN))]
      ])
    )
    const withPending = rowsOf(
      [group(2, PASSKEY, PASSPORT)],
      readsOf([
        [BOOK.methods.passkey, answered()],
        [BOOK.methods.zkpassport, answered(declaration(ADMIN, PENDING_ADMIN))]
      ])
    )

    const passport = rowOf(without, BOOK.methods.zkpassport).contract
    expect(passport.status === 'declared' && passport.admin).toBe(ADMIN)
    expect(passport.status === 'declared' && passport.pendingAdmin).toBeUndefined()
    const pending = rowOf(withPending, BOOK.methods.zkpassport).contract
    expect(pending.status === 'declared' && pending.pendingAdmin).toBe(PENDING_ADMIN)
  })

  it('carry the renewal line on the passport row alone', () => {
    const rows = rowsOf([group(2, PASSKEY, PASSPORT, ALICE)], EVERY_METHOD_ANSWERED)

    const renewal = rows.map(({ method, contract }) => [
      method,
      contract.status === 'declared' && contract.passportRenewal
    ])
    expect(renewal).toEqual([
      [BOOK.methods.passkey, false],
      [BOOK.methods.zkpassport, true],
      [BOOK.methods.ecdsa, false]
    ])
  })

  describe('the recover-alone line', () => {
    const recoverAlone = (clauses: Clause[]) => {
      const { contract } = rowOf(rowsOf(clauses, EVERY_METHOD_ANSWERED), BOOK.methods.zkpassport)
      return contract.status === 'declared' && contract.recoverAlone
    }

    it('shows for a path of one required row', () => {
      expect(recoverAlone([required(PASSPORT)])).toBe(true)
    })

    it('shows for a single group of any one with no required row beside it', () => {
      expect(recoverAlone([group(1, PASSPORT, SECOND_PASSPORT)])).toBe(true)
    })

    it('does not show where a required row stands beside the group', () => {
      expect(recoverAlone([required(PASSKEY), group(1, PASSPORT, SECOND_PASSPORT)])).toBe(false)
    })

    it('does not show for a group that needs more than one', () => {
      expect(recoverAlone([group(2, PASSPORT, PASSKEY, ALICE)])).toBe(false)
    })

    it('does not show for two required rows', () => {
      expect(recoverAlone([required(PASSPORT), required(PASSKEY)])).toBe(false)
    })

    it('shows where every clause holds its threshold of passports', () => {
      expect(recoverAlone([group(1, PASSPORT, ALICE)])).toBe(true)
      expect(recoverAlone([required(PASSPORT), required(SECOND_PASSPORT)])).toBe(true)
      expect(recoverAlone([group(1, PASSPORT, ALICE), group(1, SECOND_PASSPORT, PASSKEY)])).toBe(
        true
      )
    })

    it('does not show where a clause needs more passports than it holds', () => {
      expect(recoverAlone([group(2, PASSPORT, PASSKEY)])).toBe(false)
    })

    it('does not show where the method names no outside party', () => {
      const [row] = rowsOf([required(PASSKEY)], EVERY_METHOD_ANSWERED)
      expect(row.contract.status === 'declared' && row.contract.recoverAlone).toBe(false)
    })
  })

  describe('the threshold of one beside the recover-alone line', () => {
    const passportContract = (clauses: Clause[]) =>
      rowOf(rowsOf(clauses, EVERY_METHOD_ANSWERED), BOOK.methods.zkpassport).contract

    const ALONE_AT_ONE: [string, Clause[]][] = [
      ['a lone required row', [required(PASSPORT)]],
      ['a group of one of two', [group(1, PASSPORT, ALICE)]],
      ['two groups of any one', [group(1, PASSPORT, ALICE), group(1, SECOND_PASSPORT, PASSKEY)]]
    ]
    ALONE_AT_ONE.forEach(([name, clauses]) => {
      it(`holds for ${name}`, () => {
        expect(passportContract(clauses)).toMatchObject({
          recoverAlone: true,
          aloneAtThresholdOne: true
        })
      })
    })

    const ALONE_OTHERWISE: [string, Clause[]][] = [
      ['two required passport rows', [required(PASSPORT), required(SECOND_PASSPORT)]],
      ['a required row beside a group', [required(PASSPORT), group(1, SECOND_PASSPORT, ALICE)]]
    ]
    ALONE_OTHERWISE.forEach(([name, clauses]) => {
      it(`does not hold for ${name}, though the admin could still recover alone`, () => {
        expect(passportContract(clauses)).toMatchObject({
          recoverAlone: true,
          aloneAtThresholdOne: false
        })
      })
    })

    it('does not hold where the admin could not recover alone', () => {
      expect(passportContract([group(2, PASSPORT, PASSKEY)])).toMatchObject({
        recoverAlone: false,
        aloneAtThresholdOne: false
      })
    })
  })

  it("read a declaring third-party module's admin by the same rule as a shipped method", () => {
    const rows = rowsOf(
      [required(THIRD_PARTY)],
      readsOf([[THIRD_PARTY_MODULE, answered(declaration(ADMIN, PENDING_ADMIN))]])
    )

    expect(rows[0].contract).toEqual({
      status: 'third-party',
      declaration: {
        admin: ADMIN,
        pendingAdmin: PENDING_ADMIN,
        recoverAlone: true,
        aloneAtThresholdOne: true,
        paused: false
      }
    })
  })

  it('read a module the deployment does not ship as a third-party module', () => {
    const rows = rowsOf([group(2, PASSKEY, THIRD_PARTY)], {
      ...EVERY_METHOD_ANSWERED,
      ...readsOf([[THIRD_PARTY_MODULE, answered(declaration(ADMIN))]])
    })

    expect(rowOf(rows, THIRD_PARTY_MODULE).contract).toEqual({
      status: 'third-party',
      declaration: { admin: ADMIN, recoverAlone: false, aloneAtThresholdOne: false, paused: false }
    })
    expect(rowOf(rows, BOOK.methods.passkey).contract.status).toBe('declared')
  })

  it('read a shipped module that does not answer to the method interface as a third-party module', () => {
    const rows = rowsOf(
      [required(PASSKEY)],
      readsOf([[BOOK.methods.passkey, answered(declaration(), info(false))]])
    )

    expect(rows[0].contract).toEqual({ status: 'third-party' })
  })

  it('mark a method unavailable where one of its reads did not answer, naming that read', () => {
    const rows = rowsOf(
      [group(2, PASSKEY, PASSPORT)],
      readsOf([
        [BOOK.methods.passkey, answered()],
        [
          BOOK.methods.zkpassport,
          { trustedParties: UNANSWERED, moduleInfo: info(), paused: NOT_PAUSED }
        ]
      ])
    )

    expect(rowOf(rows, BOOK.methods.zkpassport).contract).toEqual({
      status: 'unavailable',
      unanswered: ['trustedParties']
    })
    expect(rowOf(rows, BOOK.methods.passkey).contract.status).toBe('declared')
  })

  it('leave a method pending while one of its reads has not come back', () => {
    const rows = rowsOf(
      [required(PASSKEY)],
      readsOf([[BOOK.methods.passkey, { trustedParties: declaration() }]])
    )

    expect(rows[0].contract).toEqual({ status: 'pending' })
    expect(rowsOf([required(PASSKEY)], {})[0].contract).toEqual({ status: 'pending' })
  })

  it("read an empty slot's row through the address book's method of the kind it waits for", () => {
    const rows = rowsOf(
      [group(1, emptySlot('zkpassport'), emptySlot('ecdsa'))],
      EVERY_METHOD_ANSWERED
    )

    expect(rows.map(({ method, kind }) => [method, kind])).toEqual([
      [BOOK.methods.zkpassport, 'zkpassport'],
      [BOOK.methods.ecdsa, 'ecdsa']
    ])
    expect(rowOf(rows, BOOK.methods.ecdsa).headings[0].guardian).toBeUndefined()
  })
})

describe('whether one method alone satisfies the rule', () => {
  it('holds for the method of a single required row and not for another method', () => {
    expect(aloneSatisfiesRule([required(PASSPORT)], BOOK.methods.zkpassport, BOOK)).toBe(true)
    expect(aloneSatisfiesRule([required(PASSPORT)], BOOK.methods.passkey, BOOK)).toBe(false)
  })

  it('holds for a lone group of any one whose members use the method', () => {
    expect(aloneSatisfiesRule([group(1, ALICE, BOB)], BOOK.methods.ecdsa, BOOK)).toBe(true)
  })

  it('does not hold beside a required row, or in a group that needs two', () => {
    expect(
      aloneSatisfiesRule([required(PASSKEY), group(1, ALICE, BOB)], BOOK.methods.ecdsa, BOOK)
    ).toBe(false)
    expect(aloneSatisfiesRule([group(2, ALICE, PASSKEY)], BOOK.methods.ecdsa, BOOK)).toBe(false)
  })
})

describe('whether one method alone satisfies a rule of several clauses', () => {
  const PASSPORT_METHOD = BOOK.methods.zkpassport

  it('holds for a group of any one that holds a passport beside a guardian', () => {
    expect(aloneSatisfiesRule([group(1, PASSPORT, ALICE)], PASSPORT_METHOD, BOOK)).toBe(true)
  })

  it('holds for two required passport rows', () => {
    expect(
      aloneSatisfiesRule([required(PASSPORT), required(SECOND_PASSPORT)], PASSPORT_METHOD, BOOK)
    ).toBe(true)
  })

  it('holds for two groups of any one that each hold a passport', () => {
    expect(
      aloneSatisfiesRule(
        [group(1, PASSPORT, ALICE), group(1, SECOND_PASSPORT, PASSKEY)],
        PASSPORT_METHOD,
        BOOK
      )
    ).toBe(true)
  })

  it('does not hold for a group of two of three that holds one passport', () => {
    expect(aloneSatisfiesRule([group(2, PASSPORT, ALICE, BOB)], PASSPORT_METHOD, BOOK)).toBe(false)
  })

  it('does not hold for a group of two that holds a passport and a passkey', () => {
    expect(aloneSatisfiesRule([group(2, PASSPORT, PASSKEY)], PASSPORT_METHOD, BOOK)).toBe(false)
  })

  it('does not hold where one clause holds no passport', () => {
    expect(
      aloneSatisfiesRule([group(1, PASSPORT, ALICE), group(1, BOB, PASSKEY)], PASSPORT_METHOD, BOOK)
    ).toBe(false)
  })

  it('does not hold for an empty path', () => {
    expect(aloneSatisfiesRule([], PASSPORT_METHOD, BOOK)).toBe(false)
    expect(aloneSatisfiesRule([group(1)], PASSPORT_METHOD, BOOK)).toBe(false)
  })

  it('counts an empty slot as the method of the kind it waits for', () => {
    expect(
      aloneSatisfiesRule([group(1, emptySlot('zkpassport'), ALICE)], PASSPORT_METHOD, BOOK)
    ).toBe(true)
    expect(aloneSatisfiesRule([group(1, emptySlot('passkey'), ALICE)], PASSPORT_METHOD, BOOK)).toBe(
      false
    )
  })
})

describe('whether every trust read answered', () => {
  it('holds once every method is declared or read as a third-party module', () => {
    const rows = rowsOf([group(2, PASSKEY, THIRD_PARTY)], {
      ...EVERY_METHOD_ANSWERED,
      ...readsOf([[THIRD_PARTY_MODULE, answered()]])
    })

    expect(trustReadsComplete(rows)).toBe(true)
  })

  it('does not hold while a read is still running', () => {
    const rows = rowsOf(
      [group(2, PASSKEY, ALICE)],
      readsOf([
        [BOOK.methods.passkey, answered()],
        [BOOK.methods.ecdsa, { moduleInfo: info() }]
      ])
    )

    expect(trustReadsComplete(rows)).toBe(false)
  })

  it('does not hold while a read did not answer', () => {
    const rows = rowsOf(
      [group(2, PASSKEY, ALICE)],
      readsOf([
        [BOOK.methods.passkey, answered()],
        [
          BOOK.methods.ecdsa,
          { trustedParties: declaration(), moduleInfo: info(), paused: UNANSWERED }
        ]
      ])
    )

    expect(trustReadsComplete(rows)).toBe(false)
  })

  it('does not hold for a path with no method to read', () => {
    expect(trustReadsComplete(rowsOf([], {}))).toBe(false)
  })
})

describe('the node by kind', () => {
  const KINDS: [ProviderKind | undefined, NodeKind][] = [
    ['helios', 'light-client'],
    ['colibri', 'light-client'],
    ['rpc', 'plain'],
    [undefined, 'plain']
  ]
  KINDS.forEach(([provider, kind]) => {
    it(`reads the provider kind ${provider ?? 'absent'} as a ${kind} node`, () => {
      expect(nodeKindOf(provider)).toBe(kind)
    })
  })
})
