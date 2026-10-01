import type { Address, Clause } from '@web/modules/social-recovery/sdk-interfaces'

import { stopRowsOf, trustRowsOf } from '../trust'
import type { MethodReads, TrustReads } from '../types'
import {
  ADMIN,
  ALICE,
  answered,
  BOOK,
  group,
  info,
  PASSKEY,
  PASSPORT,
  PAUSE_HOLDER,
  PAUSED,
  PENDING_PAUSE_HOLDER,
  readsOf,
  required,
  SHIPPED,
  stopDeclaration,
  THIRD_PARTY,
  THIRD_PARTY_MODULE,
  UNANSWERED
} from '../__fixtures__/review'

const trustRowsFor = (clauses: Clause[], reads: TrustReads) =>
  trustRowsOf({ clauses, enrollments: [], reads, shippedMethods: SHIPPED, addressBook: BOOK })

const stopRowsFor = (clauses: Clause[], reads: TrustReads) =>
  stopRowsOf(trustRowsFor(clauses, reads))

const passportStop = (reads: MethodReads) =>
  stopRowsFor([required(PASSPORT)], readsOf([[BOOK.methods.zkpassport, reads]]))[0].stop

describe('the security stop rows', () => {
  it('read that nobody can stop a method whose declaration names no pause holder', () => {
    expect(passportStop(answered(stopDeclaration({})))).toEqual({
      status: 'declared',
      paused: false
    })
  })

  it('name the party that can stop the method', () => {
    expect(passportStop(answered(stopDeclaration({ pauseHolder: PAUSE_HOLDER })))).toEqual({
      status: 'declared',
      paused: false,
      pauseHolder: PAUSE_HOLDER
    })
  })

  it('name the address one acceptance away from the stop role only where the declaration holds one', () => {
    expect(
      passportStop(
        answered(
          stopDeclaration({ pauseHolder: PAUSE_HOLDER, pendingPauseHolder: PENDING_PAUSE_HOLDER })
        )
      )
    ).toEqual({
      status: 'declared',
      paused: false,
      pauseHolder: PAUSE_HOLDER,
      pendingPauseHolder: PENDING_PAUSE_HOLDER
    })
    expect(
      passportStop(answered(stopDeclaration({ pauseHolder: PAUSE_HOLDER })))
    ).not.toHaveProperty('pendingPauseHolder')
  })

  it('name the address one acceptance away even where nobody holds the stop role yet', () => {
    expect(
      passportStop(answered(stopDeclaration({ pendingPauseHolder: PENDING_PAUSE_HOLDER })))
    ).toEqual({ status: 'declared', paused: false, pendingPauseHolder: PENDING_PAUSE_HOLDER })
  })

  it('name one party holding both roles where the admin is the pause holder', () => {
    expect(
      passportStop(answered(stopDeclaration({ admin: PAUSE_HOLDER, pauseHolder: PAUSE_HOLDER })))
    ).toEqual({
      status: 'declared',
      paused: false,
      pauseHolder: PAUSE_HOLDER,
      bothRoles: PAUSE_HOLDER
    })
  })

  it('name one party holding both roles whatever the case its address is written in', () => {
    const lowercase = PAUSE_HOLDER.toLowerCase() as Address

    expect(
      passportStop(answered(stopDeclaration({ admin: PAUSE_HOLDER, pauseHolder: lowercase })))
    ).toHaveProperty('bothRoles')
  })

  it('name no party holding both roles where the admin and the pause holder differ', () => {
    expect(
      passportStop(answered(stopDeclaration({ admin: ADMIN, pauseHolder: PAUSE_HOLDER })))
    ).not.toHaveProperty('bothRoles')
  })

  it('name no party holding both roles where neither role is held', () => {
    expect(passportStop(answered(stopDeclaration({})))).not.toHaveProperty('bothRoles')
  })

  it('name no party holding both roles where only one role is held', () => {
    expect(passportStop(answered(stopDeclaration({ admin: ADMIN })))).not.toHaveProperty(
      'bothRoles'
    )
    expect(passportStop(answered(stopDeclaration({ pauseHolder: ADMIN })))).not.toHaveProperty(
      'bothRoles'
    )
  })

  it('read a stopped method as stopped', () => {
    expect(
      passportStop(answered(stopDeclaration({ pauseHolder: PAUSE_HOLDER }), info(), PAUSED))
    ).toEqual({ status: 'declared', paused: true, pauseHolder: PAUSE_HOLDER })
  })

  it('hold one row per method in the trust list order, however many path rows use it', () => {
    const rows = stopRowsFor(
      [group(2, PASSKEY, ALICE, PASSPORT), required(PASSKEY)],
      readsOf([
        [BOOK.methods.passkey, answered()],
        [BOOK.methods.ecdsa, answered()],
        [BOOK.methods.zkpassport, answered(stopDeclaration({ pauseHolder: PAUSE_HOLDER }))]
      ])
    )

    expect(rows.map(({ method }) => method)).toEqual([
      BOOK.methods.passkey,
      BOOK.methods.ecdsa,
      BOOK.methods.zkpassport
    ])
    expect(rows.map(({ kind }) => kind)).toEqual(['passkey', 'ecdsa', 'zkpassport'])
  })

  it("read a third-party module's row from its own declaration by the same rule", () => {
    const rows = stopRowsFor(
      [group(2, PASSKEY, THIRD_PARTY)],
      readsOf([
        [BOOK.methods.passkey, answered()],
        [
          THIRD_PARTY_MODULE,
          answered(
            stopDeclaration({
              admin: PAUSE_HOLDER,
              pauseHolder: PAUSE_HOLDER,
              pendingPauseHolder: PENDING_PAUSE_HOLDER
            }),
            info(),
            PAUSED
          )
        ]
      ])
    )

    expect(rows[1]).toEqual({
      method: THIRD_PARTY_MODULE,
      kind: undefined,
      stop: {
        status: 'declared',
        paused: true,
        pauseHolder: PAUSE_HOLDER,
        pendingPauseHolder: PENDING_PAUSE_HOLDER,
        bothRoles: PAUSE_HOLDER
      }
    })
  })

  it('give no row to a module with no declaration', () => {
    const rows = stopRowsFor(
      [group(2, PASSKEY, THIRD_PARTY)],
      readsOf([
        [BOOK.methods.passkey, answered()],
        [THIRD_PARTY_MODULE, answered(stopDeclaration({ pauseHolder: PAUSE_HOLDER }), info(false))]
      ])
    )

    expect(rows.map(({ method }) => method)).toEqual([BOOK.methods.passkey])
  })

  it('mark a method unavailable where its stop read did not answer', () => {
    const reads = readsOf([
      [BOOK.methods.passkey, answered(stopDeclaration({}), info(), UNANSWERED)]
    ])

    expect(trustRowsFor([required(PASSKEY)], reads)[0].contract).toEqual({
      status: 'unavailable',
      unanswered: ['paused']
    })
    expect(stopRowsFor([required(PASSKEY)], reads)[0].stop).toEqual({ status: 'unavailable' })
  })

  it('leave a method pending while its stop read has not come back', () => {
    const rows = stopRowsFor(
      [required(PASSKEY)],
      readsOf([[BOOK.methods.passkey, { trustedParties: stopDeclaration({}), moduleInfo: info() }]])
    )

    expect(rows[0].stop).toEqual({ status: 'pending' })
  })
})
