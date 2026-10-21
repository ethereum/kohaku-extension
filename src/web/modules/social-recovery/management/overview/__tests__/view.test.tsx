/**
 * @jest-environment jsdom
 *
 * The overview over given reads: each state's status line, lead and actions,
 * the dormant warning with and without an open attempt, the mirror's one
 * action, the moved-keys notice, the notice after an ended attempt, and the
 * loading and failed reads that never read as not set up.
 */
import type { OverviewViewProps } from '@web/modules/social-recovery/management/overview/types'

jest.mock('viem', () => {
  // eslint-disable-next-line global-require
  const { TextDecoder, TextEncoder } = require('util')
  Object.assign(globalThis, { TextDecoder, TextEncoder })
  return jest.requireActual('viem')
})

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const harness: typeof import('@web/modules/social-recovery/management/overview/__fixtures__/harness') = require('@web/modules/social-recovery/management/overview/__fixtures__/harness')
const OverviewView: typeof import('@web/modules/social-recovery/management/overview/OverviewView').default =
  require('@web/modules/social-recovery/management/overview/OverviewView').default
const {
  WEB_ROUTES
}: typeof import('@common/modules/router/constants/common') = require('@common/modules/router/constants/common')
const display: typeof import('@web/modules/social-recovery/shared/display') = require('@web/modules/social-recovery/shared/display')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const { mount, t, readsOf, viewPropsOf, setupStateOf, CONFIGURATION, ADDRESS_BOOK, HASH } = harness
const O = 'socialRecovery.management.overview'
const ADMIN = '0x00000000000000000000000000000000000AD000' as const

const answered = (fields: Parameters<typeof setupStateOf>[0], attemptOpen = false) =>
  ({ status: 'answered', value: { setup: setupStateOf(fields), attemptOpen } } as const)

describe('the overview', () => {
  let view: Awaited<ReturnType<typeof mount>> | undefined

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  const render = (props: OverviewViewProps) => mount(<OverviewView {...props} />)

  it('shows the read running, never not set up, while the setup is read', async () => {
    view = await render(viewPropsOf())
    expect(view.text()).toContain(t(`${O}.reads.loading`))
    expect(view.byTestId('overview-chip-not-set-up')).toBeNull()
    expect(view.byTestId('overview-empty')).toBeNull()
  })

  it('shows a failed read with its retry, never not set up', async () => {
    const props = viewPropsOf({ reads: readsOf({ facts: { status: 'failed' } }) })
    view = await render(props)
    expect(view.text()).toContain(t(`${O}.reads.failedTitle`))
    expect(view.byTestId('overview-chip-not-set-up')).toBeNull()
    expect(view.byTestId('overview-empty')).toBeNull()
    await view.press('overview-read-failed-retry')
    expect(props.reads.retry).toHaveBeenCalled()
  })

  it('shows the empty state with set up recovery and the recover entry before a setup exists', async () => {
    const props = viewPropsOf({
      reads: readsOf({ facts: answered({ hasSetup: false, isAuthorized: false }) })
    })
    view = await render(props)
    expect(view.textOf('overview-chip-not-set-up')).toBe(
      t('socialRecovery.status.recovery.notSetUp')
    )
    expect(view.text()).toContain(t(`${O}.lead.notSetUp`))
    expect(view.textOf('overview-empty-body')).toBe(t(`${O}.empty.body`))
    expect(view.byTestId('overview-card')).toBeNull()
    await view.press('overview-set-up')
    expect(props.navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetup)
    await view.press('overview-recover')
    expect(props.navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoveryRecovery)
  })

  it('shows a set-up path with its rule lines, its actions and the Recovery Card', async () => {
    const props = viewPropsOf({
      reads: readsOf({
        facts: answered({}),
        path: { kind: 'readable', configuration: CONFIGURATION }
      })
    })
    view = await render(props)
    expect(view.textOf('overview-chip-set-up')).toBe(t('socialRecovery.status.recovery.setUp'))
    expect(view.text()).toContain(t(`${O}.lead.setUp`))
    expect(view.byTestId('readout-path')).not.toBeNull()
    expect(view.byTestId('readout-wait-value')).not.toBeNull()
    expect(view.byTestId('overview-path-pending')).toBeNull()
    expect(view.byTestId('overview-chip-in-progress')).toBeNull()
    expect(view.byTestId('banner-slot')).toBeNull()
    await view.press('overview-edit-path')
    expect(props.navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoveryManageEdit)
    await view.press('overview-remove-recovery')
    expect(props.navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoveryManageRemove)
    await view.press('overview-card-open')
    expect(props.navigate).toHaveBeenCalledWith(`${WEB_ROUTES.socialRecoverySetupCard}?from=manage`)
    expect(view.byTestId('overview-recover')).not.toBeNull()
  })

  it('shows a path this device cannot read as set up with path locked, asking the recovery password', async () => {
    const props = viewPropsOf({
      reads: readsOf({ facts: answered({}), path: { kind: 'locked', level: 'private' } })
    })
    view = await render(props)
    expect(view.textOf('overview-chip-set-up')).toBe(t('socialRecovery.status.recovery.setUp'))
    expect(view.textOf('overview-chip-path-locked')).toBe(
      t('socialRecovery.status.recovery.pathLocked')
    )
    expect(view.textOf('overview-locked-title')).toBe(t(`${O}.locked.title`))
    expect(view.byTestId('overview-locked-field')).toBeNull()
    await view.press('overview-locked-action')
    expect(view.byTestId('overview-locked-field')).not.toBeNull()
  })

  it('reads the wrong password on the locked path', async () => {
    view = await render(
      viewPropsOf({
        reads: readsOf({
          facts: answered({}),
          path: { kind: 'locked', level: 'private' },
          ask: { status: 'wrong' }
        })
      })
    )
    await view.press('overview-locked-action')
    expect(view.textOf('overview-locked-wrong')).toBe(t(`${O}.locked.wrong`))
  })

  it('shows a recovery in progress with the banner and the line above the two actions', async () => {
    view = await render(
      viewPropsOf({
        reads: readsOf({
          facts: answered({ attemptActive: true }, true),
          path: { kind: 'readable', configuration: CONFIGURATION }
        })
      })
    )
    expect(view.text()).toContain(t(`${O}.lead.inProgress`))
    expect(view.textOf('overview-chip-in-progress')).toBe(
      t('socialRecovery.status.attempt.recoveryInProgress')
    )
    expect(view.byTestId('banner-slot')).not.toBeNull()
    expect(view.textOf('overview-path-pending')).toBe(t(`${O}.path.pendingLine`))
    const pending = view.byTestId('overview-path-pending')
    const edit = view.byTestId('overview-edit-path')
    expect(
      // eslint-disable-next-line no-bitwise
      pending && edit && pending.compareDocumentPosition(edit) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('warns of a dormant setup with re-authorize and clear while no attempt is open', async () => {
    const props = viewPropsOf({
      reads: readsOf({
        facts: answered({ isAuthorized: false }),
        path: { kind: 'readable', configuration: CONFIGURATION }
      })
    })
    view = await render(props)
    expect(view.textOf('overview-chip-not-active')).toBe(
      t('socialRecovery.status.recovery.notActive')
    )
    expect(view.textOf('overview-dormant-title')).toBe(t(`${O}.dormant.title`))
    expect(view.textOf('overview-reauthorize-note')).toBe(t(`${O}.dormant.reauthorizeNote`))
    expect(view.byTestId('overview-dormant-refused')).toBeNull()
    expect(view.byTestId('overview-dormant-clear-cancels')).toBeNull()
    expect(view.byTestId('overview-dormant-pending')).toBeNull()
    // A dormant setup offers no edit or removal beside its repair.
    expect(view.byTestId('overview-edit-path')).toBeNull()
    expect(view.byTestId('overview-remove-recovery')).toBeNull()
    await view.press('overview-reauthorize')
    expect(props.onOpen).toHaveBeenCalledWith('reauthorize')
    await view.press('overview-clear')
    expect(props.onOpen).toHaveBeenCalledWith('clear')
  })

  it('refuses the re-authorize with its reason while an attempt is open, and the dormant reading wins', async () => {
    const props = viewPropsOf({
      reads: readsOf({
        facts: answered({ isAuthorized: false }, true),
        path: { kind: 'readable', configuration: CONFIGURATION }
      })
    })
    view = await render(props)
    expect(view.byTestId('overview-reauthorize')).toBeNull()
    expect(view.textOf('overview-dormant-refused')).toBe(t(`${O}.dormant.refused`))
    expect(view.textOf('overview-dormant-pending')).toBe(t(`${O}.dormant.pendingLine`))
    expect(view.textOf('overview-dormant-clear-cancels')).toBe(t(`${O}.dormant.clearCancels`))
    expect(view.byTestId('banner-slot')).not.toBeNull()
    expect(view.textOf('overview-chip-not-active')).toBe(
      t('socialRecovery.status.recovery.notActive')
    )
    await view.press('overview-clear')
    expect(props.onOpen).toHaveBeenCalledWith('clear')
  })

  it('shows the mirror with its one action', async () => {
    const props = viewPropsOf({
      reads: readsOf({ facts: answered({ hasSetup: false, isAuthorized: true }) })
    })
    view = await render(props)
    expect(view.textOf('overview-mirror-title')).toBe(t(`${O}.mirror.title`))
    expect(view.textOf('overview-chip-not-active')).toBe(
      t('socialRecovery.status.recovery.notActive')
    )
    expect(view.byTestId('overview-set-up')).toBeNull()
    expect(view.byTestId('overview-path')).toBeNull()
    expect(view.byTestId('overview-reauthorize')).toBeNull()
    await view.press('overview-remove-authorization')
    expect(props.onOpen).toHaveBeenCalledWith('removeAuthorization')
  })

  it('names a method whose trusted keys moved, with its admin, the caveat and the editor', async () => {
    const method = ADDRESS_BOOK.methods.ecdsa
    const id = method.toLowerCase()
    const props = viewPropsOf({
      reads: readsOf({
        facts: answered({}),
        path: { kind: 'readable', configuration: CONFIGURATION },
        notices: {
          status: 'answered',
          value: {
            moved: [
              {
                method,
                at: {
                  blockNumber: 150,
                  blockHash: HASH,
                  logIndex: 0,
                  transactionHash: HASH,
                  removed: false
                }
              }
            ],
            cancelledAttempts: []
          }
        }
      }),
      adminOf: () => ADMIN
    })
    view = await render(props)
    expect(view.textOf(`overview-moved-${id}-title`)).toBe(
      t(`${O}.movedKeys.title`, { method: 'Guardian' })
    )
    expect(view.textOf(`overview-moved-${id}-admin`)).toBe(display.renderFullAddress(ADMIN))
    expect(view.textOf(`overview-moved-${id}-caveat`)).toBe(t(`${O}.movedKeys.caveat`))
    await view.press(`overview-moved-${id}-edit`)
    expect(props.navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoveryManageEdit)
  })

  it('shows the notice after the owner cancel while the setup was committed no later, with no dismiss', async () => {
    const props = viewPropsOf({
      reads: readsOf({
        facts: answered({}),
        path: { kind: 'readable', configuration: CONFIGURATION },
        notices: { status: 'answered', value: { moved: [], cancelledAttempts: [3n] } }
      }),
      ending: { attemptId: 3n, road: 'cancelled', cancelledBy: 'cancelByOwner', at: 1_700_000_000 }
    })
    view = await render(props)
    expect(view.textOf('overview-ended-line')).toBe(
      t(`${O}.ended.ownerCancel`, {
        date: display.renderDateTimeInZone(1_700_000_000_000, 'UTC').date
      })
    )
    await view.press('overview-ended-replace')
    expect(props.navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoveryManageEdit)
  })

  it('draws no ended notice where the setup was committed after the ending', async () => {
    view = await render(
      viewPropsOf({
        reads: readsOf({
          facts: answered({}),
          path: { kind: 'readable', configuration: CONFIGURATION }
        }),
        ending: { attemptId: 3n, road: 'cancelled', cancelledBy: 'setupWrite', at: 1_700_000_000 }
      })
    )
    expect(view.byTestId('overview-ended')).toBeNull()
  })

  it('shows a failed read of the notices with its retry', async () => {
    const props = viewPropsOf({
      reads: readsOf({
        facts: answered({}),
        path: { kind: 'readable', configuration: CONFIGURATION },
        notices: { status: 'failed' }
      })
    })
    view = await render(props)
    expect(view.text()).toContain(t(`${O}.reads.noticesFailedTitle`))
    expect(view.text()).toContain(t(`${O}.reads.noticesFailedBody`))
    expect(view.byTestId('readout-path')).not.toBeNull()
    await view.press('overview-notices-failed-retry')
    expect(props.reads.retryNotices).toHaveBeenCalled()
  })

  it('reads that the account is no longer controlled from this device, with no action on it', async () => {
    const controller = '0x00000000000000000000000000000000000000C1' as const
    const props = viewPropsOf({
      reads: readsOf({
        facts: {
          status: 'answered',
          value: { setup: setupStateOf({}), attemptOpen: false, movedBy: 3n }
        },
        path: { kind: 'readable', configuration: CONFIGURATION }
      }),
      ending: { attemptId: 3n, road: 'executed', controller, at: 1_700, transactionHash: HASH }
    })
    view = await render(props)
    expect(view.textOf('overview-title')).toBe(t(`${O}.controlMoved.title`))
    expect(view.text()).toContain(
      t(`${O}.controlMoved.lead`, { date: display.renderDateTimeInZone(1_700_000, 'UTC').date })
    )
    expect(view.text()).toContain(t('socialRecovery.display.values.account'))
    expect(view.textOf('overview-control-moved-account')).toBe(
      display.renderFullAddress(harness.ACCOUNT)
    )
    const accountRow = view.byTestId('overview-control-moved-account')
    const controllerRow = view.byTestId('overview-control-moved-controller')
    expect(
      accountRow &&
        controllerRow &&
        // eslint-disable-next-line no-bitwise
        accountRow.compareDocumentPosition(controllerRow) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(view.text()).toContain(t(`${O}.controlMoved.controller`))
    expect(view.textOf('overview-control-moved-controller')).toBe(
      display.renderFullAddress(controller)
    )
    expect(view.textOf('overview-control-moved-path')).toBe(t(`${O}.controlMoved.path`))
    expect(view.text()).not.toContain(t(`${O}.lead.setUp`))
    expect(view.byTestId('readout-path')).not.toBeNull()
    expect(view.byTestId('overview-edit-path')).toBeNull()
    expect(view.byTestId('overview-remove-recovery')).toBeNull()
    expect(view.byTestId('banner-slot')).toBeNull()
    expect(view.byTestId('overview-card-open')).not.toBeNull()
    expect(view.byTestId('overview-recover')).not.toBeNull()
    await view.press('overview-control-moved-transaction')
    expect(props.onTransaction).toHaveBeenCalledWith(HASH)
  })

  it('keeps the text of a notice and draws none of its actions once control moved away', async () => {
    const method = ADDRESS_BOOK.methods.ecdsa
    const id = method.toLowerCase()
    view = await render(
      viewPropsOf({
        reads: readsOf({
          facts: {
            status: 'answered',
            value: { setup: setupStateOf({}), attemptOpen: false, movedBy: 3n }
          },
          path: { kind: 'readable', configuration: CONFIGURATION },
          notices: {
            status: 'answered',
            value: {
              moved: [
                {
                  method,
                  at: {
                    blockNumber: 150,
                    blockHash: HASH,
                    logIndex: 0,
                    transactionHash: HASH,
                    removed: false
                  }
                }
              ],
              cancelledAttempts: []
            }
          }
        }),
        adminOf: () => ADMIN
      })
    )
    expect(view.textOf(`overview-moved-${id}-title`)).toBe(
      t(`${O}.movedKeys.title`, { method: 'Guardian' })
    )
    expect(view.textOf(`overview-moved-${id}-caveat`)).toBe(t(`${O}.movedKeys.caveat`))
    expect(view.byTestId(`overview-moved-${id}-edit`)).toBeNull()
    expect(view.byTestId('overview-reauthorize')).toBeNull()
  })

  it('reads the moved control with no time, key or link where the watcher read none', async () => {
    view = await render(
      viewPropsOf({
        reads: readsOf({
          facts: {
            status: 'answered',
            value: { setup: setupStateOf({ isAuthorized: false }), attemptOpen: false, movedBy: 3n }
          }
        }),
        ending: { attemptId: 2n, road: 'executed', at: 1_700, transactionHash: HASH }
      })
    )
    expect(view.text()).toContain(t(`${O}.controlMoved.noTime`))
    expect(view.byTestId('overview-control-moved-controller')).toBeNull()
    expect(view.byTestId('overview-control-moved-transaction')).toBeNull()
    // A dormant setup offers no repair once this device no longer controls the account.
    expect(view.byTestId('overview-dormant')).toBeNull()
    expect(view.textOf('overview-chip-not-active')).toBe(
      t('socialRecovery.status.recovery.notActive')
    )
  })

  it('draws the open write step in place of the overview', async () => {
    view = await render(
      viewPropsOf({
        reads: readsOf({ facts: answered({ isAuthorized: false }) }),
        step: <div data-testid="step-slot" />
      })
    )
    expect(view.byTestId('step-slot')).not.toBeNull()
    expect(view.byTestId('overview-dormant')).toBeNull()
  })
})
