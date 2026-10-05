/**
 * @jest-environment jsdom
 *
 * The save over given props: the arrival's blocks, the account and the key a
 * recovery would remove, the cost line, the gas blocker, the shared write
 * states in the save's words, the saved screen and the disagreed one. jsdom
 * has no `TextEncoder`, which viem needs when its modules load, so the test
 * sets Node's first and loads the modules after it.
 */
import { TextDecoder, TextEncoder } from 'util'

import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import type { ThemeProps } from '@common/styles/themeConfig'
import type { Address, Hex, KitError } from '@web/modules/social-recovery/sdk-interfaces'
import type { DepositStep, WriteMachineState } from '@web/modules/social-recovery/shared/writes'
import type { SaveBlock } from '@web/modules/social-recovery/setup/review'

import type { ArmState, ArmViewProps, Arrival } from '@web/modules/social-recovery/setup/arm/types'

Object.assign(globalThis, { TextEncoder, TextDecoder })
// Jest's config does not transform the clipboard package's ES modules, which the gas blocker loads.
jest.mock('@common/utils/clipboard', () => ({ setStringAsync: async () => true }))
// React only runs effects and state updates inside act() when this flag is set.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const React = jest.requireActual<typeof import('react')>('react')
const { createRoot } = jest.requireActual<typeof import('react-dom/client')>('react-dom/client')
const { act } = jest.requireActual<typeof import('react-dom/test-utils')>('react-dom/test-utils')
const { t } = jest.requireActual<typeof import('@common/config/localization')>(
  '@common/config/localization'
).default
const { WEB_ROUTES } = jest.requireActual<typeof import('@common/modules/router/constants/common')>(
  '@common/modules/router/constants/common'
)
const { ThemeContext } = jest.requireActual<typeof import('@common/contexts/themeContext')>(
  '@common/contexts/themeContext'
)
const themeConfig = jest.requireActual<typeof import('@common/styles/themeConfig')>(
  '@common/styles/themeConfig'
)
const { renderFullAddress, renderHash, renderChip, renderValueLabel } = jest.requireActual<
  typeof import('@web/modules/social-recovery/shared/display')
>('@web/modules/social-recovery/shared/display')
const { accountBatchRefusal, auditedActionOf, deploymentDescriptor, publisherKeyOf } =
  jest.requireActual<typeof import('@web/modules/social-recovery/shared/client')>(
    '@web/modules/social-recovery/shared/client'
  )
const { renderDepositStep, renderGasAmount } = jest.requireActual<
  typeof import('@web/modules/social-recovery/shared/writes')
>('@web/modules/social-recovery/shared/writes')
const arm = jest.requireActual<typeof import('@web/modules/social-recovery/setup/arm')>(
  '@web/modules/social-recovery/setup/arm'
)
const { getAddress } = jest.requireActual<typeof import('viem')>('viem')
const ArmView = jest.requireActual<typeof import('@web/modules/social-recovery/setup/arm/ArmView')>(
  '@web/modules/social-recovery/setup/arm/ArmView'
).default

const THEME = Object.fromEntries(
  Object.entries(themeConfig.default).map(([name, byType]) => [
    name,
    byType[themeConfig.THEME_TYPES.LIGHT]
  ])
) as ThemeProps

const THEME_CONTEXT: ThemeContextReturnType = {
  theme: THEME,
  themeType: themeConfig.THEME_TYPES.LIGHT,
  selectedThemeType: themeConfig.THEME_TYPES.LIGHT,
  setThemeType: () => {}
}

const ACCOUNT: Address = getAddress('0x2b0f5e98ee98adc9865745e98802f333f72f6ef5')
const REMOVED_KEY: Address = getAddress('0x5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e')
const KEY: Address = getAddress('0x6c482af19b7d03e5c1a684fb27d05e93a8c410b7')
const TX_HASH: Hex = '0x9c1b2e6a0d4f3e8b7a6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a'
const DESCRIPTOR = deploymentDescriptor('sepolia')

const IDLE: ArmState = arm.initialArmState()

const withWrite = (write: WriteMachineState, after: ArmState['after'] = { stage: 'none' }) => ({
  write,
  after
})

const LANDED: WriteMachineState = {
  status: 'landed',
  write: 'save',
  transactionHash: TX_HASH,
  receipt: { transactionHash: TX_HASH, status: 1 },
  run: 1
}

const kitError = (name: 'InvalidCommitment'): KitError => ({
  kind: 'known',
  source: 'manager',
  name,
  selector: '0x12345678',
  args: {}
})

const STEP: DepositStep = {
  write: 'save',
  payer: 'accountKey',
  fastTrack: false,
  key: KEY,
  network: { name: 'Sepolia', symbol: 'ETH' },
  estimate: {
    gas: 300_000n,
    gasPrice: 2_000_000_000n,
    cost: 600_000_000_000_000n,
    required: 720_000_000_000_000n
  },
  balance: 0n,
  shortfall: 720_000_000_000_000n,
  routes: [
    {
      kind: 'transfer',
      from: { address: ACCOUNT, name: 'Account 1', deployed: true },
      to: KEY,
      amount: 800_000_000_000_000n,
      fee: {
        gas: 60_000n,
        gasPrice: 2_000_000_000n,
        cost: 120_000_000_000_000n,
        required: 144_000_000_000_000n
      }
    },
    { kind: 'outside', to: KEY, amount: 720_000_000_000_000n }
  ]
}

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const textOf = (id: string) => byTestId(id)?.textContent ?? null
const pageText = () => container.textContent ?? ''

const press = (id: string) => {
  const node = byTestId(id)
  if (!node) {
    throw new Error(`nothing on screen with the test id ${id}`)
  }
  act(() => node.click())
}

/** The pressable that shows exactly this text: the outermost element with a tab stop that reads it. */
const buttonReading = (text: string) =>
  Array.from(container.querySelectorAll<HTMLElement>('[tabindex]')).find(
    (candidate) => candidate.textContent === text
  )

const pressText = (text: string) => {
  const node = buttonReading(text)
  if (!node) {
    throw new Error(`no button reads ${text}`)
  }
  act(() => node.click())
}

const hasButton = (text: string) => buttonReading(text) !== undefined

const mount = (overrides: Partial<ArmViewProps> = {}) => {
  const props: ArmViewProps = {
    arrival: { kind: 'ready' },
    state: IDLE,
    account: { address: ACCOUNT, removedKey: REMOVED_KEY, deployed: true },
    action: auditedActionOf(DESCRIPTOR.action, 'sepolia'),
    chain: 'sepolia',
    level: 'hidden',
    onRetryReads: jest.fn(),
    onRetryArrival: jest.fn(),
    onRetry: jest.fn(),
    onCheckAgain: jest.fn(),
    onCheckSetup: jest.fn(),
    onSaveAgain: jest.fn(),
    onRecheck: jest.fn(),
    onReread: jest.fn(),
    navigate: jest.fn(),
    openUrl: jest.fn(),
    ...overrides
  }
  act(() => {
    root.render(
      <ThemeContext.Provider value={THEME_CONTEXT}>
        <ArmView {...props} />
      </ThemeContext.Provider>
    )
  })
  return props
}

const SAVED_LINES = [
  'socialRecovery.arm.title',
  'socialRecovery.arm.live',
  'socialRecovery.arm.oneTransaction'
]

describe('before the save is sent', () => {
  it('shows the account in full and the key a recovery would remove, as the reads named it', () => {
    mount()
    expect(textOf('arm-account-address')).toBe(renderFullAddress(ACCOUNT))
    expect(textOf('arm-removed-key-address')).toBe(renderFullAddress(REMOVED_KEY))
    expect(textOf('arm-removed-key')).toContain(renderValueLabel('keyBeingRemoved', t))
    expect(textOf('arm-removed-key')).toContain(t('socialRecovery.review.keyRemovedLine'))
  })

  it('shows no removed key where the reads named none', () => {
    mount({ account: { address: ACCOUNT, deployed: true } })
    expect(byTestId('arm-removed-key')).toBeNull()
  })

  it('names the audited action and its publisher as the party that will hold the authority', () => {
    const action = auditedActionOf(DESCRIPTOR.action, 'sepolia')
    mount({ action })
    expect(action.kind).toBe('audited')
    if (action.kind !== 'audited') {
      return
    }
    expect(textOf('arm-module')).toContain(
      t('socialRecovery.review.trust.moduleRow', { publisher: t(publisherKeyOf(action)) })
    )
    expect(textOf('arm-module')).toContain(t('socialRecovery.review.trust.auditedOnly'))
  })
  ;(
    [
      [true, 'socialRecovery.costLines.save'],
      [false, 'socialRecovery.costLines.saveDeploys']
    ] as const
  ).forEach(([deployed, key]) =>
    it(`reads the cost line of an account whose code is ${deployed}`, () => {
      mount({ account: { address: ACCOUNT, deployed } })
      expect(textOf('arm-cost-line')).toBe(t(key))
    })
  )

  it('shows no cost line until the account facts are read', () => {
    mount({ account: { address: ACCOUNT } })
    expect(byTestId('arm-cost-line')).toBeNull()
  })
})

describe('the arrival blocks', () => {
  const BLOCKS: [SaveBlock, string[]][] = [
    [
      { kind: 'unavailable' },
      [
        'socialRecovery.review.blocked.unavailable.title',
        'socialRecovery.review.blocked.unavailable.body'
      ]
    ],
    [
      { kind: 'removed-key-unreadable' },
      [
        'socialRecovery.review.blocked.removedKeyUnreadable.title',
        'socialRecovery.review.blocked.removedKeyUnreadable.body'
      ]
    ],
    [
      { kind: 'cannot-recover', reason: 'not-supported' },
      [
        'socialRecovery.review.blocked.cannotRecover.title',
        'socialRecovery.review.blocked.cannotRecover.reasonNotSupported'
      ]
    ],
    [
      { kind: 'cannot-recover', reason: 'key-count' },
      [
        'socialRecovery.review.blocked.cannotRecover.title',
        'socialRecovery.review.blocked.cannotRecover.reasonSeveralKeys'
      ]
    ],
    [
      { kind: 'already-set-up' },
      [
        'socialRecovery.review.blocked.alreadySetUp.title',
        'socialRecovery.review.blocked.alreadySetUp.body',
        'socialRecovery.review.blocked.alreadySetUp.open'
      ]
    ],
    [{ kind: 'empty-slot' }, ['socialRecovery.review.blocked.emptySlot']],
    [{ kind: 'password-missing' }, ['socialRecovery.review.blocked.passwordMissing']]
  ]

  BLOCKS.forEach(([block, keys]) =>
    it(`shows the review's blocker for ${JSON.stringify(block)}, and nothing of a send`, () => {
      mount({ arrival: { kind: 'blocked', block } })
      expect(byTestId(`review-blocked-${block.kind}`)).not.toBeNull()
      keys.forEach((key) => expect(pageText()).toContain(t(key)))
      expect(pageText()).not.toContain(t('socialRecovery.writes.submitting'))
      expect(pageText()).not.toContain(t('socialRecovery.arm.title'))
      expect(byTestId('arm-back')).not.toBeNull()
    })
  )

  it('names the key count where the description counted the keys', () => {
    mount({
      arrival: { kind: 'blocked', block: { kind: 'cannot-recover', reason: 'key-count', count: 2 } }
    })
    expect(pageText()).toContain(
      t('socialRecovery.review.blocked.cannotRecover.reasonKeyCount', { count: 2 })
    )
  })

  it('leads each block action where the review leads it', () => {
    const navigate = jest.fn()
    const onRetryReads = jest.fn()
    mount({ arrival: { kind: 'blocked', block: { kind: 'already-set-up' } }, navigate })
    press('review-blocked-open')
    expect(navigate).toHaveBeenLastCalledWith(WEB_ROUTES.socialRecoveryManage)

    mount({ arrival: { kind: 'blocked', block: { kind: 'password-missing' } }, navigate })
    press('review-blocked-privacy')
    expect(navigate).toHaveBeenLastCalledWith(WEB_ROUTES.socialRecoverySetupPrivacy)

    mount({ arrival: { kind: 'blocked', block: { kind: 'empty-slot' } }, navigate })
    press('review-blocked-editor')
    expect(navigate).toHaveBeenLastCalledWith(WEB_ROUTES.socialRecoverySetupEditor)

    mount({ arrival: { kind: 'blocked', block: { kind: 'removed-key-unreadable' } }, onRetryReads })
    press('review-blocked-retry')
    expect(onRetryReads).toHaveBeenCalledTimes(1)
  })
  const UNAVAILABLE_BODIES = [
    'socialRecovery.client.unavailableBody',
    'socialRecovery.arm.notListed',
    'socialRecovery.arm.viewOnly'
  ]
  ;(
    [
      [{ kind: 'unavailable', retry: 'facts' }, 'socialRecovery.client.unavailableBody'],
      [{ kind: 'unavailable', retry: 'client' }, 'socialRecovery.client.unavailableBody'],
      [{ kind: 'unavailable', retry: null, cause: 'not-listed' }, 'socialRecovery.arm.notListed'],
      [{ kind: 'unavailable', retry: null, cause: 'view-only' }, 'socialRecovery.arm.viewOnly']
    ] as [Arrival, string][]
  ).forEach(([arrival, body]) =>
    it(`shows the unavailable title for ${JSON.stringify(
      arrival
    )} with its own body, and the retry only beside the body that asks to try again`, () => {
      const retries = body === 'socialRecovery.client.unavailableBody'
      // Each body reads apart from the others, also while a key still reads as its own path.
      expect(new Set(UNAVAILABLE_BODIES.map((key) => t(key))).size).toBe(UNAVAILABLE_BODIES.length)
      const onRetryArrival = jest.fn()
      mount({ arrival, onRetryArrival })
      const shown = textOf('arm-unavailable') ?? ''
      expect(shown).toContain(t('socialRecovery.client.unavailableTitle'))
      expect(shown.indexOf(t(body))).toBeGreaterThan(
        shown.indexOf(t('socialRecovery.client.unavailableTitle'))
      )
      UNAVAILABLE_BODIES.filter((other) => other !== body).forEach((other) =>
        expect(shown).not.toContain(t(other))
      )
      expect(hasButton(t('socialRecovery.writes.tryAgain'))).toBe(retries)
      expect(byTestId('arm-arrival-retry') !== null).toBe(retries)
      if (retries) {
        press('arm-arrival-retry')
        expect(onRetryArrival).toHaveBeenCalledTimes(1)
      }
    })
  )

  it('shows the update-the-wallet lines, and the records that could not load with a retry', () => {
    mount({ arrival: { kind: 'update-the-wallet' } })
    expect(pageText()).toContain(t('socialRecovery.client.updateTheWalletTitle'))
    const onRetryArrival = jest.fn()
    mount({ arrival: { kind: 'load-failed' }, onRetryArrival })
    expect(pageText()).toContain(t('socialRecovery.records.loadFailed'))
    press('arm-arrival-retry')
    expect(onRetryArrival).toHaveBeenCalledTimes(1)
  })

  it('shows a spinner while the arrival loads, with no block and no back', () => {
    mount({ arrival: { kind: 'loading' } })
    expect(byTestId('arm-spinner')).not.toBeNull()
    expect(byTestId('arm-back')).toBeNull()
  })
})

describe('the Save button on a ready arrival', () => {
  it('shows the summary with the Save button where the screen offers it, and the button starts the save', () => {
    const onSave = jest.fn()
    mount({ onSave })

    expect(textOf('arm-save')).toBe(t('socialRecovery.review.save'))
    expect(byTestId('arm-spinner')).toBeNull()
    expect(textOf('arm-removed-key-address')).toBe(renderFullAddress(REMOVED_KEY))
    expect(byTestId('arm-module')).not.toBeNull()
    expect(textOf('arm-cost-line')).toBe(t('socialRecovery.costLines.save'))
    press('arm-save')
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('shows a spinner and no button where the save starts by itself', () => {
    mount()
    expect(byTestId('arm-save')).toBeNull()
    expect(byTestId('arm-spinner')).not.toBeNull()
  })

  it('shows no Save button on an arrival that is not ready, nor once a run started', () => {
    mount({ arrival: { kind: 'blocked', block: { kind: 'empty-slot' } }, onSave: jest.fn() })
    expect(byTestId('arm-save')).toBeNull()
    mount({ arrival: { kind: 'loading' }, onSave: jest.fn() })
    expect(byTestId('arm-save')).toBeNull()
    mount({
      state: withWrite({ status: 'submitting', write: 'save', run: 1 }),
      onSave: jest.fn()
    })
    expect(byTestId('arm-save')).toBeNull()
  })
})

describe('a run that found a setup on the account', () => {
  const STOPPED: ArmState = {
    write: { status: 'idle', write: 'save', run: 1 },
    after: { stage: 'none' },
    stop: 'already-set-up'
  }

  it("shows the review's already-set-up block with its button and the back, and nothing of a send", () => {
    const navigate = jest.fn()
    mount({ state: STOPPED, navigate, onSave: jest.fn() })

    expect(byTestId('review-blocked-already-set-up')).not.toBeNull()
    expect(pageText()).toContain(t('socialRecovery.review.blocked.alreadySetUp.title'))
    expect(byTestId('arm-save')).toBeNull()
    expect(byTestId('arm-back')).not.toBeNull()
    expect(pageText()).not.toContain(t('socialRecovery.writes.submitting'))
    expect(hasButton(t('socialRecovery.writes.tryAgain'))).toBe(false)
    SAVED_LINES.forEach((key) => expect(pageText()).not.toContain(t(key)))
    press('review-blocked-open')
    expect(navigate).toHaveBeenLastCalledWith(WEB_ROUTES.socialRecoveryManage)
  })

  it('shows the block whatever the arrival reads after the run', () => {
    mount({ state: STOPPED, arrival: { kind: 'ready' } })
    expect(byTestId('review-blocked-already-set-up')).not.toBeNull()
    expect(byTestId('arm-spinner')).toBeNull()
  })
})

describe('the gas blocker', () => {
  it("names the shortfall and the controlling key's address, with the two routes and no sponsor", () => {
    const onRecheck = jest.fn()
    mount({
      state: withWrite({ status: 'needsDeposit', write: 'save', step: STEP, run: 1 }),
      onRecheck
    })
    const rendered = renderDepositStep(STEP, {}, t)
    const blocker = textOf('arm-gas-blocker') ?? ''

    expect(blocker).toContain(t('socialRecovery.writes.gas.notEnoughGasAccountKey'))
    expect(rendered.blocker.line).toBe(
      t('socialRecovery.writes.gas.shortfallSave', {
        amount: renderGasAmount(STEP.shortfall, STEP.network.symbol)
      })
    )
    expect(blocker).toContain(rendered.blocker.line)
    expect(blocker).toContain(renderFullAddress(KEY))
    expect(byTestId('arm-gas-route-transfer')).not.toBeNull()
    expect(byTestId('arm-gas-route-outside')).not.toBeNull()
    expect(blocker).toContain(t('socialRecovery.writes.gas.transferIsAnOperation'))
    expect(blocker.toLowerCase()).not.toContain('sponsor')

    press('arm-gas-continue')
    expect(onRecheck).toHaveBeenCalledTimes(1)
  })
})

describe('the write states in the save words', () => {
  it('shows the submitting state with its own sentence', () => {
    mount({ state: withWrite({ status: 'submitting', write: 'save', run: 1 }) })
    expect(pageText()).toContain(t('socialRecovery.writes.submitting'))
    expect(pageText()).toContain(t('socialRecovery.review.after.submitting'))
    expect(pageText()).not.toContain(t('socialRecovery.arm.title'))
    expect(byTestId('arm-back')).toBeNull()
  })

  it('shows a save never sent under its own title with one sentence, the retry and the back', () => {
    const onRetry = jest.fn()
    mount({
      state: withWrite({
        status: 'failedNotSent',
        write: 'save',
        error: new Error('refused'),
        run: 1
      }),
      onRetry
    })
    expect(pageText()).toContain(t('socialRecovery.review.after.failedTitle'))
    expect(pageText()).toContain(t('socialRecovery.review.after.notSent'))
    // The save's own sentence stands in place of the shared not-sent line.
    expect(pageText()).not.toContain(t('socialRecovery.writes.notSent'))
    pressText(t('socialRecovery.writes.tryAgain'))
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(byTestId('arm-back')).not.toBeNull()
  })

  it('shows a save that may still land with no failure title, its one line and check again, and no retry, Save or back', () => {
    const onRetry = jest.fn()
    const onCheckSetup = jest.fn()
    mount({
      state: withWrite({
        status: 'failedNotSent',
        write: 'save',
        error: accountBatchRefusal('not-a-transaction', ACCOUNT),
        mayStillLand: true,
        run: 1
      }),
      onRetry,
      onCheckSetup
    })
    expect(pageText()).not.toContain(t('socialRecovery.review.after.failedTitle'))
    expect(pageText()).not.toContain(t('socialRecovery.writes.notSent'))
    expect(pageText()).not.toContain(t('socialRecovery.review.after.notSent'))
    expect(pageText()).not.toContain(t('socialRecovery.writes.mayStillLand'))
    expect(byTestId('arm-save')).toBeNull()
    // The stored save stays while the operation may still land, so nothing leads back to the review.
    expect(byTestId('arm-back')).toBeNull()
    expect(textOf('arm-write-failedNotSent')).toBe(
      `${t('socialRecovery.arm.mayStillLand')}${t('socialRecovery.arm.checkAgain')}`
    )
    // The one control reads check again, which reads the setup; nothing reads try again.
    expect(t('socialRecovery.arm.checkAgain')).not.toBe(t('socialRecovery.writes.tryAgain'))
    expect(textOf('arm-check-setup')).toBe(t('socialRecovery.arm.checkAgain'))
    expect(pageText()).not.toContain(t('socialRecovery.writes.tryAgain'))
    expect(hasButton(t('socialRecovery.writes.tryAgain'))).toBe(false)
    pressText(t('socialRecovery.arm.checkAgain'))
    expect(onCheckSetup).toHaveBeenCalledTimes(1)
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('shows another request waiting in the wallet under the save title with the shared line, the retry and the back', () => {
    const onRetry = jest.fn()
    mount({
      state: withWrite({
        status: 'failedNotSent',
        write: 'save',
        error: accountBatchRefusal('other-request-pending', ACCOUNT),
        otherRequest: true,
        run: 1
      }),
      onRetry
    })
    expect(pageText()).toContain(t('socialRecovery.review.after.failedTitle'))
    expect(pageText()).toContain(t('socialRecovery.writes.otherRequestPending'))
    expect(pageText()).not.toContain(t('socialRecovery.review.after.notSent'))
    expect(pageText()).not.toContain(t('socialRecovery.writes.notSent'))
    expect(byTestId('arm-back')).not.toBeNull()
    pressText(t('socialRecovery.writes.tryAgain'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('shows a followed request whose read did not answer as submitting with its own sentence in place of the submitting one, and check again, which reads it again', () => {
    const onCheckAgain = jest.fn()
    mount({
      state: {
        ...withWrite({ status: 'submitting', write: 'save', run: 2 }),
        requestId: 'stored',
        follow: 'unread'
      },
      onCheckAgain
    })
    expect(t('socialRecovery.arm.unread')).not.toBe(t('socialRecovery.review.after.submitting'))
    expect(pageText()).toContain(t('socialRecovery.writes.submitting'))
    expect(pageText()).toContain(t('socialRecovery.arm.unread'))
    expect(pageText()).not.toContain(t('socialRecovery.review.after.submitting'))
    expect(pageText()).not.toContain(t('socialRecovery.arm.lookingForSave'))
    expect(byTestId('arm-save')).toBeNull()
    expect(byTestId('arm-back')).toBeNull()
    press('arm-check-again')
    expect(onCheckAgain).toHaveBeenCalledTimes(1)
  })

  it('shows a followed request neither the queue nor the activity holds as submitting with its own sentence in place of the submitting one, with no check again and no Save', () => {
    mount({
      state: {
        ...withWrite({ status: 'submitting', write: 'save', run: 2 }),
        requestId: 'stored',
        follow: 'gone'
      }
    })
    expect(t('socialRecovery.arm.lookingForSave')).not.toBe(
      t('socialRecovery.review.after.submitting')
    )
    expect(pageText()).toContain(t('socialRecovery.writes.submitting'))
    expect(pageText()).toContain(t('socialRecovery.arm.lookingForSave'))
    expect(pageText()).not.toContain(t('socialRecovery.review.after.submitting'))
    expect(pageText()).not.toContain(t('socialRecovery.arm.unread'))
    expect(byTestId('arm-check-again')).toBeNull()
    expect(byTestId('arm-save')).toBeNull()
    expect(byTestId('arm-back')).toBeNull()
  })

  const SUBMITTING_NOTE: [string, Partial<ArmState>, WriteMachineState][] = [
    ['queued', { follow: 'queued' }, { status: 'submitting', write: 'save', run: 2 }],
    [
      'broadcast under its hash',
      {},
      { status: 'submitting', write: 'save', transactionHash: TX_HASH, run: 2 }
    ],
    [
      'stalled under its hash',
      { stalled: true },
      { status: 'submitting', write: 'save', transactionHash: TX_HASH, run: 2 }
    ],
    ['in the wallet window of this page', {}, { status: 'submitting', write: 'save', run: 1 }]
  ]

  SUBMITTING_NOTE.forEach(([named, held, write]) =>
    it(`keeps the submitting sentence, and neither of the follow's own, for a save ${named}`, () => {
      mount({ state: { ...withWrite(write), requestId: 'stored', ...held } })
      expect(pageText()).toContain(t('socialRecovery.review.after.submitting'))
      expect(pageText()).not.toContain(t('socialRecovery.arm.unread'))
      expect(pageText()).not.toContain(t('socialRecovery.arm.lookingForSave'))
      expect(byTestId('arm-save')).toBeNull()
    })
  )

  it('shows the line of a save that may still land only for a refusal that may still land', () => {
    mount({
      state: withWrite({
        status: 'failedNotSent',
        write: 'save',
        error: accountBatchRefusal('window-closed', ACCOUNT),
        run: 1
      })
    })
    expect(pageText()).toContain(t('socialRecovery.review.after.failedTitle'))
    expect(pageText()).not.toContain(t('socialRecovery.arm.mayStillLand'))
    expect(byTestId('arm-check-setup')).toBeNull()
  })

  it('shows a save the port refused for another reason with the not-sent sentence and the retry', () => {
    const onRetry = jest.fn()
    mount({
      state: withWrite({
        status: 'failedNotSent',
        write: 'save',
        error: accountBatchRefusal('window-closed', ACCOUNT),
        run: 1
      }),
      onRetry
    })
    expect(pageText()).toContain(t('socialRecovery.review.after.notSent'))
    pressText(t('socialRecovery.writes.tryAgain'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('shows check again under the submitting state where the receipt wait of the sent batch failed, and it waits again', () => {
    const onCheckAgain = jest.fn()
    const onRetry = jest.fn()
    mount({
      state: {
        ...withWrite({ status: 'submitting', write: 'save', transactionHash: TX_HASH, run: 1 }),
        stalled: true
      },
      onCheckAgain,
      onRetry
    })
    expect(pageText()).toContain(t('socialRecovery.writes.submitting'))
    expect(textOf('arm-check-again')).toBe(t('socialRecovery.arm.checkAgain'))
    expect(pageText()).not.toContain(t('socialRecovery.writes.tryAgain'))
    expect(pageText()).not.toContain(t('socialRecovery.arm.mayStillLand'))
    expect(byTestId('arm-back')).toBeNull()
    press('arm-check-again')
    expect(onCheckAgain).toHaveBeenCalledTimes(1)
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('shows no check again while the receipt wait runs, nor without a hash', () => {
    mount({
      state: withWrite({ status: 'submitting', write: 'save', transactionHash: TX_HASH, run: 1 })
    })
    expect(byTestId('arm-check-again')).toBeNull()
    mount({
      state: { ...withWrite({ status: 'submitting', write: 'save', run: 1 }), stalled: true }
    })
    expect(byTestId('arm-check-again')).toBeNull()
  })

  describe('a save the network dropped', () => {
    const DROPPED: [string, Partial<ArmState>][] = [
      ['', {}],
      [' and its wait stalled', { stalled: true }]
    ]

    DROPPED.forEach(([named, held]) =>
      it(`shows only the dropped line and Save again${named}: no write state, no title, no check again, no retry, and the back`, () => {
        const onSaveAgain = jest.fn()
        const onCheckAgain = jest.fn()
        const onRetry = jest.fn()
        mount({
          state: {
            ...withWrite({
              status: 'submitting',
              write: 'save',
              transactionHash: TX_HASH,
              run: 1
            }),
            requestId: 'stored',
            dropped: true,
            ...held
          },
          onSaveAgain,
          onCheckAgain,
          onRetry
        })
        expect(textOf('arm-dropped-line')).toBe(t('socialRecovery.arm.dropped'))
        expect(textOf('arm-save-again')).toBe(t('socialRecovery.arm.saveAgain'))
        expect(textOf('arm-dropped')).toBe(
          `${t('socialRecovery.arm.dropped')}${t('socialRecovery.arm.saveAgain')}`
        )
        expect(byTestId('arm-write-submitting')).toBeNull()
        expect(pageText()).not.toContain(t('socialRecovery.writes.submitting'))
        expect(pageText()).not.toContain(t('socialRecovery.review.after.submitting'))
        expect(pageText()).not.toContain(t('socialRecovery.review.after.failedTitle'))
        expect(byTestId('arm-check-again')).toBeNull()
        expect(byTestId('arm-save')).toBeNull()
        expect(hasButton(t('socialRecovery.writes.tryAgain'))).toBe(false)
        expect(hasButton(t('socialRecovery.arm.checkAgain'))).toBe(false)
        expect(byTestId('arm-back')).not.toBeNull()

        press('arm-save-again')
        expect(onSaveAgain).toHaveBeenCalledTimes(1)
        expect(onCheckAgain).not.toHaveBeenCalled()
        expect(onRetry).not.toHaveBeenCalled()
      })
    )

    it('shows neither the dropped line nor Save again for a stalled save under its hash that is not dropped', () => {
      mount({
        state: {
          ...withWrite({ status: 'submitting', write: 'save', transactionHash: TX_HASH, run: 1 }),
          requestId: 'stored',
          stalled: true
        }
      })
      expect(byTestId('arm-dropped-line')).toBeNull()
      expect(byTestId('arm-save-again')).toBeNull()
      expect(pageText()).not.toContain(t('socialRecovery.arm.dropped'))
      expect(byTestId('arm-check-again')).not.toBeNull()
    })
  })

  it('shows a replaced save as replaced, without the not-sent sentence', () => {
    mount({
      state: withWrite({
        status: 'failedNotSent',
        write: 'save',
        error: new Error('replaced'),
        replaced: 'replaced',
        run: 1
      })
    })
    expect(pageText()).toContain(t('socialRecovery.review.after.failedTitle'))
    expect(pageText()).toContain(t('socialRecovery.writes.replaced'))
    expect(pageText()).not.toContain(t('socialRecovery.review.after.notSent'))
  })

  it('shows a reverted save with the cause the receipt carries, and no retry for a cause a retry cannot fix', () => {
    mount({
      state: withWrite({
        status: 'failedReverted',
        write: 'save',
        transactionHash: TX_HASH,
        receipt: { transactionHash: TX_HASH, status: 0 },
        cause: { kind: 'named', name: 'InvalidCommitment', error: kitError('InvalidCommitment') },
        decoded: kitError('InvalidCommitment'),
        run: 1
      })
    })
    expect(pageText()).toContain(t('socialRecovery.review.after.failedTitle'))
    expect(pageText()).toContain(
      t('socialRecovery.writes.revertedSave', {
        cause: t('socialRecovery.writes.causes.InvalidCommitment')
      })
    )
    expect(hasButton(t('socialRecovery.writes.tryAgain'))).toBe(false)
  })

  it('shows a reverted save with no named cause as the cause it cannot name, with the retry', () => {
    mount({
      state: withWrite({
        status: 'failedReverted',
        write: 'save',
        transactionHash: TX_HASH,
        receipt: { transactionHash: TX_HASH, status: 0 },
        cause: { kind: 'unnamed' },
        run: 1
      })
    })
    expect(pageText()).toContain(
      t('socialRecovery.writes.revertedSave', { cause: t('socialRecovery.writes.causes.unnamed') })
    )
    expect(hasButton(t('socialRecovery.writes.tryAgain'))).toBe(true)
  })

  it('shows only a spinner while the check after the landing runs, and nothing saved', () => {
    mount({ state: withWrite(LANDED, { stage: 'confirming' }) })
    expect(byTestId('arm-confirming')).not.toBeNull()
    SAVED_LINES.forEach((key) => expect(pageText()).not.toContain(t(key)))
    mount({ state: withWrite(LANDED, { stage: 'saving' }) })
    expect(byTestId('arm-confirming')).not.toBeNull()
    expect(byTestId('arm-saved')).toBeNull()
  })
})

describe('the saved screen', () => {
  it('shows the saved lines, the hash with its explorer page, the account and Continue to the card with the level', () => {
    const navigate = jest.fn()
    const openUrl = jest.fn()
    mount({ state: withWrite(LANDED, { stage: 'saved' }), level: 'hidden', navigate, openUrl })

    expect(textOf('arm-saved-chip')).toBe(renderChip('recovery', 'setUp', t))
    SAVED_LINES.forEach((key) => expect(pageText()).toContain(t(key)))
    expect(pageText()).toContain(t('socialRecovery.arm.savedOnChain'))
    expect(pageText()).toContain(renderHash(TX_HASH))
    expect(pageText()).toContain(t('socialRecovery.arm.settingsLine'))
    expect(textOf('arm-saved-account-address')).toBe(renderFullAddress(ACCOUNT))
    expect(textOf('arm-saved-written-to')).toBe(t('socialRecovery.arm.writtenTo'))
    expect(textOf('arm-saved-hidden')).toBe(t('socialRecovery.arm.hiddenBehindPassword'))

    press('arm-saved-explorer')
    expect(openUrl).toHaveBeenCalledWith(arm.explorerTransactionUrlOf('sepolia', TX_HASH))
    press('arm-saved-continue')
    expect(navigate).toHaveBeenCalledWith(arm.cardPathOf('hidden'))
    expect(navigate.mock.calls[0][0]).toContain('level=hidden')
  })

  it('shows a save that landed while no page followed its hash as saved, with no hash and no explorer', () => {
    const UNSEEN: ArmState = {
      write: { status: 'submitting', write: 'save', run: 2 },
      after: { stage: 'saved' },
      landedUnseen: true
    }
    mount({ state: UNSEEN })
    expect(byTestId('arm-saved')).not.toBeNull()
    SAVED_LINES.forEach((key) => expect(pageText()).toContain(t(key)))
    expect(byTestId('arm-saved-explorer')).toBeNull()
    expect(pageText()).not.toContain(t('socialRecovery.arm.savedOnChain'))

    mount({ state: { ...UNSEEN, after: { stage: 'disagreed', check: 'mismatch' } } })
    expect(textOf('arm-disagreed-check')).toBe(t('socialRecovery.arm.disagreed.mismatch'))
    expect(byTestId('arm-disagreed-transaction')).toBeNull()
    expect(byTestId('arm-saved')).toBeNull()
  })

  it('names the hidden setup only at the hidden level', () => {
    const navigate = jest.fn()
    mount({ state: withWrite(LANDED, { stage: 'saved' }), level: 'public', navigate })
    expect(byTestId('arm-saved-hidden')).toBeNull()
    expect(pageText()).not.toContain(t('socialRecovery.arm.hiddenBehindPassword'))
    press('arm-saved-continue')
    expect(navigate.mock.calls[0][0]).toContain('level=public')
  })
})

describe('the disagreed and unanswered states', () => {
  ;(
    [
      ['mismatch', 'socialRecovery.arm.disagreed.mismatch'],
      ['authorization', 'socialRecovery.arm.disagreed.authorizationUnrecognized']
    ] as const
  ).forEach(([check, line]) =>
    it(`shows the ${check} disagreement with its line, the transaction, and Remove and save again, never saved`, () => {
      const navigate = jest.fn()
      const openUrl = jest.fn()
      mount({ state: withWrite(LANDED, { stage: 'disagreed', check }), navigate, openUrl })

      expect(textOf('arm-disagreed-title')).toBe(t('socialRecovery.arm.disagreed.title'))
      expect(textOf('arm-disagreed-body')).toBe(t('socialRecovery.arm.disagreed.body'))
      expect(pageText()).toContain(t('socialRecovery.arm.disagreed.checkHeader'))
      expect(textOf('arm-disagreed-check')).toBe(t(line))
      expect(textOf('arm-disagreed-do-not-rely')).toBe(t('socialRecovery.arm.disagreed.doNotRely'))
      expect(pageText()).toContain(renderHash(TX_HASH))
      SAVED_LINES.forEach((key) => expect(pageText()).not.toContain(t(key)))
      expect(byTestId('arm-saved')).toBeNull()
      expect(hasButton(t('socialRecovery.writes.tryAgain'))).toBe(false)

      press('arm-disagreed-explorer')
      expect(openUrl).toHaveBeenCalledWith(arm.explorerTransactionUrlOf('sepolia', TX_HASH))
      press('arm-disagreed-remove-and-save')
      expect(navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoveryManage)
    })
  )
  ;(
    [
      ['the mismatch', { stage: 'disagreed', check: 'mismatch' }],
      ['the authorization', { stage: 'disagreed', check: 'authorization' }],
      ['an unanswered check', { stage: 'unread' }]
    ] as [string, ArmState['after']][]
  ).forEach(([named, after]) =>
    it(`shows the landed transaction under the saved-on-chain header for ${named}`, () => {
      mount({ state: withWrite(LANDED, after) })
      const transaction = textOf('arm-disagreed-transaction') ?? ''
      const header = transaction.indexOf(t('socialRecovery.arm.savedOnChain'))
      expect(header).toBeGreaterThanOrEqual(0)
      expect(transaction.indexOf(renderHash(TX_HASH))).toBeGreaterThan(header)
    })
  )

  it('shows an unanswered check under the disagreed title and body, with a retry that reads it again', () => {
    const onReread = jest.fn()
    mount({ state: withWrite(LANDED, { stage: 'unread' }), onReread })

    expect(byTestId('arm-unread')).not.toBeNull()
    expect(textOf('arm-disagreed-title')).toBe(t('socialRecovery.arm.disagreed.title'))
    expect(textOf('arm-disagreed-body')).toBe(t('socialRecovery.arm.disagreed.body'))
    expect(byTestId('arm-disagreed-check')).toBeNull()
    expect(byTestId('arm-disagreed-remove-and-save')).toBeNull()
    SAVED_LINES.forEach((key) => expect(pageText()).not.toContain(t(key)))
    press('arm-unread-retry')
    expect(onReread).toHaveBeenCalledTimes(1)
  })
})
