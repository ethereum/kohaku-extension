/**
 * @jest-environment jsdom
 *
 * The slot the search names: the screen serves an empty slot of the kind the
 * search names, or the credential it already placed there, and renders the
 * nothing-to-run line with Back alone for any other search or slot. Back leads
 * to the editor that opened the enrollment.
 */
import type { Credential } from '@kohaku-eth/social-recovery'

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
  settle,
  t
} from '@web/modules/social-recovery/setup/enroll/__tests__/harness'
import { CHAIN_NAMES } from '@web/modules/social-recovery/recovery/entry/constants'
import { deferred } from '@web/modules/social-recovery/shared/chrome/__fixtures__/deferred'
import { WALLET_RECOVERY_CHAIN } from '@web/modules/social-recovery/shared/client'

// The spinner's animation needs a native module jsdom lacks; a plain view stands in.
jest.mock('@common/components/Spinner', () => {
  /* eslint-disable @typescript-eslint/no-var-requires, global-require */
  const mockReact: typeof import('react') = require('react')
  const { View: MockView }: typeof import('react-native') = require('react-native')
  /* eslint-enable @typescript-eslint/no-var-requires, global-require */
  return {
    __esModule: true,
    default: () => mockReact.createElement(MockView, { testID: 'spinner' })
  }
})

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
    expect(
      mounted.byTestId('enroll-columns-main')?.contains(mounted.byTestId('enroll-nothing'))
    ).toBe(true)
    expect(mounted.byTestId('enroll-columns-aside')).toBeNull()
  }

  it('renders the nothing-to-run line and Back where the search names no slot', async () => {
    const { records } = await recordsWith(pathWith(emptySlot('passkey')))
    view = await mountView({ records, search: null, deps: depsOf() })
    expectNothingToRun(view)
    await view.press('enroll-back')
    expect(view.navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetupEditor)
  })

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
    expect(
      view.byTestId('enroll-columns-main')?.contains(view.byTestId('enroll-load-failed'))
    ).toBe(true)
    expect(view.byTestId('enroll-columns-aside')).toBeNull()

    faults.get = false
    await view.press('enroll-load-retry')
    expect(view.byTestId('enroll-load-failed')).toBeNull()
    expect(view.byTestId('passkey-none-yet')).not.toBeNull()
  })

  it('shows the waiting block that reads the slot until the slot is read', async () => {
    const { records, storage } = await recordsWith(pathWith(emptySlot('passkey')))
    const gate = deferred<void>()
    const { get } = storage
    storage.get = async (key, defaultValue) => {
      await gate.promise
      return get(key, defaultValue)
    }
    view = await mountView({
      records,
      search: { kind: 'passkey', at: { clause: 0, member: 0 } },
      deps: depsOf()
    })
    expect(view.byTestId('loading-screen')?.textContent).toBe(t('socialRecovery.loading.slot'))
    expect(view.byTestId('enroll-loading')?.contains(view.byTestId('loading-screen'))).toBe(true)
    expect(view.byTestId('enroll-columns')).toBeNull()
    expect(view.byTestId('enroll-passkey')).toBeNull()

    gate.resolve()
    await settle()
    expect(view.byTestId('loading-screen')).toBeNull()
    expect(view.byTestId('passkey-none-yet')).not.toBeNull()
  })

  it('names the network in the waiting block while the client loads, and keeps the row on screen', async () => {
    const { records } = await recordsWith(pathWith(emptySlot('ecdsa')))
    view = await mountView({
      records,
      search: { kind: 'ecdsa', at: { clause: 0, member: 0 } },
      client: { status: 'loading' },
      deps: depsOf()
    })
    const block = view
      .byTestId('enroll-client-loading')
      ?.querySelector('[data-testid="loading-block"]')
    expect(block?.textContent).toBe(
      t('socialRecovery.loading.client', { network: CHAIN_NAMES[WALLET_RECOVERY_CHAIN] })
    )
    expect(view.byTestId('enroll-guardian')).not.toBeNull()
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

  it('goes back to the management editor where that editor opened the enrollment', async () => {
    const { records } = await recordsWith(pathWith(emptySlot('ecdsa')))
    view = await mountView({
      records,
      search: { kind: 'ecdsa', at: { clause: 0, member: 0 }, returnTo: 'manage' },
      deps: depsOf()
    })
    expect(view.byTestId('enroll-guardian')).not.toBeNull()
    await view.press('enroll-back')
    expect(view.navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoveryManageEdit)
    expect(view.navigate).not.toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetupEditor)
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
