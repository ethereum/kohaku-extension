/**
 * @jest-environment jsdom
 *
 * The slot the search names: the screen serves an empty slot of the kind the
 * search names, or the credential it already placed there, and renders the
 * nothing-to-run line with Back alone for any other search or slot.
 */
import type { Credential } from '@web/modules/social-recovery/sdk-interfaces'

import type { Mounted } from '@web/modules/social-recovery/setup/enroll/__tests__/harness'
import {
  BOOK,
  depsOf,
  each,
  emptySlot,
  guardianConfigOf,
  mountView,
  pathWith,
  recordsWith,
  t
} from '@web/modules/social-recovery/setup/enroll/__tests__/harness'

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const {
  WEB_ROUTES
}: typeof import('@common/modules/router/constants/common') = require('@common/modules/router/constants/common')
const {
  parseEnrollSearch
}: typeof import('@web/modules/social-recovery/setup/enroll/search') = require('@web/modules/social-recovery/setup/enroll/search')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const GUARDIAN = '0x2222222222222222222222222222222222222222'
const passkey: Credential = {
  method: BOOK.methods.passkey,
  config: '0x01',
  label: 'this Mac passkey'
}
const guardian: Credential = {
  method: BOOK.methods.ecdsa,
  config: guardianConfigOf(GUARDIAN),
  label: ''
}

describe('the enroll search', () => {
  it('reads the slot a well-formed search names', () => {
    expect(parseEnrollSearch('?kind=ecdsa&clause=1&member=2')).toEqual({
      kind: 'ecdsa',
      at: { clause: 1, member: 2 }
    })
  })

  it('carries the id of a ceremony whose report is due', () => {
    expect(parseEnrollSearch('?kind=passkey&clause=0&member=0&ceremony=abc_1-2')?.ceremony).toBe(
      'abc_1-2'
    )
  })

  it('drops a malformed ceremony id and keeps the slot', () => {
    expect(parseEnrollSearch('?kind=passkey&clause=0&member=0&ceremony=a/b')).toEqual({
      kind: 'passkey',
      at: { clause: 0, member: 0 }
    })
  })

  each([
    ['a kind the address book does not name', '?kind=phone&clause=0&member=0'],
    ['no kind', '?clause=0&member=0'],
    ['a fractional clause', '?kind=passkey&clause=0.5&member=0'],
    ['a negative member', '?kind=passkey&clause=0&member=-1'],
    ['a member that is not a number', '?kind=passkey&clause=0&member=x'],
    ['a clause with a leading zero', '?kind=passkey&clause=01&member=0'],
    ['no member', '?kind=passkey&clause=0']
  ] as const)('names no slot for %s', ([, search]) => {
    expect(parseEnrollSearch(search)).toBeNull()
  })
})

describe('the enroll view', () => {
  let view: Mounted | undefined

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  const expectNothingToRun = (mounted: Mounted) => {
    expect(mounted.byTestId('enroll-nothing')?.textContent).toContain(
      t('socialRecovery.ceremony.nothingToRun')
    )
    expect(mounted.byTestId('enroll-passkey')).toBeNull()
    expect(mounted.byTestId('enroll-guardian')).toBeNull()
    expect(mounted.byTestId('enroll-save')).toBeNull()
  }

  it('renders the nothing-to-run line and Back where the search names no slot', async () => {
    const { records } = await recordsWith(pathWith(emptySlot('passkey')))
    view = await mountView({ records, search: null, deps: depsOf() })
    expectNothingToRun(view)
    await view.press('enroll-back')
    expect(view.navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetupEditor)
  })

  each([['zkpassport'], ['aadhaar']] as const)(
    'leaves an empty %s slot to its own screen',
    async ([kind]) => {
      const { records } = await recordsWith(pathWith(emptySlot(kind)))
      view = await mountView({
        records,
        search: { kind, at: { clause: 0, member: 0 } },
        deps: depsOf()
      })
      expectNothingToRun(view)
    }
  )

  it('renders nothing to run for a slot waiting for another kind', async () => {
    const { records } = await recordsWith(pathWith(emptySlot('ecdsa')))
    view = await mountView({
      records,
      search: { kind: 'passkey', at: { clause: 0, member: 0 } },
      deps: depsOf()
    })
    expectNothingToRun(view)
  })

  each([
    ['a clause the path does not hold', { clause: 1, member: 0 }],
    ['a member the clause does not hold', { clause: 0, member: 3 }]
  ] as const)('renders nothing to run for %s', async ([, at]) => {
    const { records } = await recordsWith(pathWith(emptySlot('passkey')))
    view = await mountView({ records, search: { kind: 'passkey', at }, deps: depsOf() })
    expectNothingToRun(view)
  })

  it('renders nothing to run where no draft is stored', async () => {
    const { records } = await recordsWith([])
    view = await mountView({
      records,
      search: { kind: 'passkey', at: { clause: 0, member: 0 } },
      deps: depsOf()
    })
    expectNothingToRun(view)
  })

  it('renders nothing to run for a slot holding a credential this screen did not place', async () => {
    const { records } = await recordsWith(pathWith(passkey))
    view = await mountView({
      records,
      search: { kind: 'passkey', at: { clause: 0, member: 0 } },
      deps: depsOf()
    })
    expectNothingToRun(view)
  })

  it('renders nothing to run for a guardian where the search asks for a passkey', async () => {
    const { records } = await recordsWith(pathWith(guardian), [
      { credential: guardian, test: 'not-tested' }
    ])
    view = await mountView({
      records,
      search: { kind: 'passkey', at: { clause: 0, member: 0 } },
      deps: depsOf()
    })
    expectNothingToRun(view)
  })

  it('opens the credential this screen placed, on a reload after the enrollment', async () => {
    const { records } = await recordsWith(pathWith(passkey), [
      { credential: passkey, test: 'not-tested', backup: 'synced' }
    ])
    view = await mountView({
      records,
      search: { kind: 'passkey', at: { clause: 0, member: 0 } },
      deps: depsOf()
    })
    expect(view.byTestId('enroll-nothing')).toBeNull()
    expect(view.byTestId('passkey-label')?.textContent).toBe('this Mac passkey')
    expect(view.isDisabled('enroll-save')).toBe(false)
  })

  it('renders the load failure with a retry that reads the slot again', async () => {
    const { records, faults } = await recordsWith(pathWith(emptySlot('passkey')))
    faults.get = true
    view = await mountView({
      records,
      search: { kind: 'passkey', at: { clause: 0, member: 0 } },
      deps: depsOf()
    })
    expect(view.byTestId('enroll-load-failed')?.textContent).toContain(
      t('socialRecovery.records.loadFailed')
    )
    expect(view.byTestId('enroll-passkey')).toBeNull()

    faults.get = false
    await view.press('enroll-load-retry')
    expect(view.byTestId('enroll-load-failed')).toBeNull()
    expect(view.byTestId('passkey-none-yet')).not.toBeNull()
  })

  it('goes back to the editor from a row with the records as they stand', async () => {
    const { records } = await recordsWith(pathWith(emptySlot('ecdsa')))
    view = await mountView({
      records,
      search: { kind: 'ecdsa', at: { clause: 0, member: 0 } },
      deps: depsOf()
    })
    await view.press('enroll-back')
    expect(view.navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetupEditor)
  })

  each([
    ['loading', { status: 'loading' as const }, 'enroll-client-loading'],
    ['failed', { status: 'failed' as const, retry: jest.fn() }, 'enroll-client-failed'],
    [
      'update-the-wallet',
      { status: 'update-the-wallet' as const, retry: jest.fn() },
      'enroll-client-update-the-wallet'
    ]
  ] as const)('shows the client state %s beside the row', async ([, client, testId]) => {
    const { records } = await recordsWith(pathWith(emptySlot('ecdsa')))
    view = await mountView({
      records,
      search: { kind: 'ecdsa', at: { clause: 0, member: 0 } },
      client,
      deps: depsOf()
    })
    expect(view.byTestId(testId)).not.toBeNull()
    expect(view.isDisabled('guardian-add')).toBe(true)
    if (client.status !== 'loading') {
      await view.press('enroll-client-retry')
      expect(client.retry).toHaveBeenCalled()
    }
  })
})
