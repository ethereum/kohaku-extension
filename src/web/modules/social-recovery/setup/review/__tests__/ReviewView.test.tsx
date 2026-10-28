/**
 * @jest-environment jsdom
 *
 * The review mounted over the setup records on an in-memory storage, with a
 * fake client whose module reads answer per module. jsdom has no
 * `TextEncoder`, which viem needs when its modules load, so the test sets
 * Node's first and loads the modules after it.
 */
import { TextDecoder, TextEncoder } from 'util'

import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import type { ThemeProps } from '@common/styles/themeConfig'
import type { Address, Clause } from '@kohaku-eth/social-recovery'
import type { FitCheckReading, RemovedKeyReading } from '@web/modules/social-recovery/shared/client'
import type { Enrollment, RecordStorage } from '@web/modules/social-recovery/shared/records'

import type {
  MountOptions,
  Root
} from '@web/modules/social-recovery/setup/review/__fixtures__/review'
import type { ReviewClient, ReviewKitClient } from '@web/modules/social-recovery/setup/review/types'
import type {
  BlockedMountCase,
  FailedLineCase,
  PathCase,
  UnfailedLineCase,
  VerdictCase
} from '@web/modules/social-recovery/setup/review/__fixtures__/types'

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

Object.assign(globalThis, { TextEncoder, TextDecoder })
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
const { parse, stringify } = jest.requireActual<
  typeof import('@ambire-common/libs/richJson/richJson')
>('@ambire-common/libs/richJson/richJson')
const { getRuleLines, renderRuleLines } = jest.requireActual<
  typeof import('@web/modules/social-recovery/shared/rule-lines')
>('@web/modules/social-recovery/shared/rule-lines')
const { renderFullAddress, renderShortAddress } = jest.requireActual<
  typeof import('@web/modules/social-recovery/shared/display')
>('@web/modules/social-recovery/shared/display')
const { deploymentDescriptor, publisherKeyOf, auditedActionOf, sameAddress, shapeNoteOf } =
  jest.requireActual<typeof import('@web/modules/social-recovery/shared/client')>(
    '@web/modules/social-recovery/shared/client'
  )
const { createWalletRecords } = jest.requireActual<
  typeof import('@web/modules/social-recovery/shared/records')
>('@web/modules/social-recovery/shared/records')
const { zeroAddress } = jest.requireActual<typeof import('viem')>('viem')
const { emptySlot } = jest.requireActual<
  typeof import('@web/modules/social-recovery/shared/records/slots')
>('@web/modules/social-recovery/shared/records/slots')
const { kindNameOf } = jest.requireActual<
  typeof import('@web/modules/social-recovery/setup/review/lead')
>('@web/modules/social-recovery/setup/review/lead')
const ReviewView = jest.requireActual<
  typeof import('@web/modules/social-recovery/setup/review/ReviewView')
>('@web/modules/social-recovery/setup/review/ReviewView').default
const fixtures = jest.requireActual<
  typeof import('@web/modules/social-recovery/setup/review/__fixtures__/review')
>('@web/modules/social-recovery/setup/review/__fixtures__/review')
const {
  ACCOUNT,
  AADHAAR,
  ADMIN,
  ALICE,
  BOB,
  BOOK,
  CAROL,
  CHAIN_ID,
  DAVE,
  declaration,
  enrolled,
  group,
  guardianAddress,
  info,
  PASSKEY,
  PASSPORT,
  PENDING_ADMIN,
  required,
  SECOND_PASSPORT,
  THIRD_PARTY,
  UNANSWERED,
  NOT_PAUSED,
  REMOVED_KEY,
  OTHER_KEY,
  descriptionOf,
  setupStateOf
} = fixtures

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

/** The extension's storage helper in memory; `refuses` makes every read reject. */
const makeStorage = (refuses: boolean): RecordStorage => {
  const raw = new Map<string, string>()
  return {
    get: async (key, defaultValue) => {
      if (refuses) {
        throw new Error('storage unavailable')
      }
      const stored = key && raw.get(key)
      return stored ? parse(stored) : defaultValue
    },
    set: async (key, value) => {
      raw.set(key, typeof value === 'string' ? value : stringify(value))
      return null
    },
    remove: async (key) => {
      raw.delete(key)
      return null
    },
    setEntries: async (entries) => {
      Object.entries(entries).forEach(([key, value]) => raw.set(key, stringify(value)))
    },
    removeKeys: async (keys) => {
      keys.forEach((key) => raw.delete(key))
    }
  }
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

/** Lets the pending storage reads and module reads settle, then renders what they changed. */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
  })

const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const textOf = (id: string) => byTestId(id)?.textContent ?? null
const textsStartingWith = (prefix: string) =>
  Array.from(
    container.querySelectorAll<HTMLElement>(`[data-testid^="${prefix}"]`),
    (node) => node.textContent
  )
const pageText = () => container.textContent ?? ''
const byPrefix = (prefix: string) => container.querySelector(`[data-testid^="${prefix}"]`)
/** Whether the node with the first id sits before the node with the second in the document. */
const isBefore = (first: string, second: string) => {
  const ids = Array.from(container.querySelectorAll('[data-testid]'), (node) =>
    node.getAttribute('data-testid')
  )
  const [a, b] = [ids.indexOf(first), ids.indexOf(second)]
  if (a < 0 || b < 0) {
    throw new Error(`nothing on screen with the test id ${a < 0 ? first : second}`)
  }
  return a < b
}
/** Whether the node with the inner id sits inside the node with the outer id. */
const isInside = (inner: string, outer: string) => {
  const node = byTestId(inner)
  return !!node && !!byTestId(outer)?.contains(node)
}
const isDisabled = (id: string) => byTestId(id)?.getAttribute('aria-disabled') === 'true'
/** Whether the innermost element holding both nodes lays them out in a row. */
const drawnSideBySide = (first: string, second: string) => {
  const other = byTestId(second)
  let node = byTestId(first)?.parentElement ?? null
  while (node && other && !node.contains(other)) {
    node = node.parentElement
  }
  return !!node && !!other && window.getComputedStyle(node).flexDirection === 'row'
}
const heightOf = (id: string) => {
  const node = byTestId(id)
  return node ? window.getComputedStyle(node).height : null
}

const press = async (id: string) => {
  const node = byTestId(id)
  if (!node) {
    throw new Error(`nothing on screen with the test id ${id}`)
  }
  act(() => node.click())
  await settle()
}

const mount = async ({
  clauses = [group(2, ALICE, BOB, PASSKEY)],
  enrollments = [],
  wait = 172800,
  backup = 'encrypted',
  publicMetadata = '0x',
  passwordSet = true,
  client,
  trustedParties = async () => declaration(),
  moduleInfo = async () => info(),
  paused = async () => NOT_PAUSED,
  removedKey = async () => ({ kind: 'named', key: REMOVED_KEY }),
  fitCheck = async () => ({ basis: 'deployed-code', fits: true }),
  setupState = async () => setupStateOf(false),
  describeSetup = async () => descriptionOf(),
  accountLabel,
  storageRefuses = false,
  storageHeld
}: MountOptions = {}) => {
  const storage = makeStorage(false)
  const records = createWalletRecords({ storage })
  const setup = records.setup(CHAIN_ID, ACCOUNT)
  await setup.setupDraft.write({
    wait,
    clauses,
    ignoresPause: true,
    privacy: { backup, publicMetadata }
  })
  if (enrollments.length > 0) {
    await setup.enrollments.write(enrollments)
  }
  if (passwordSet) {
    await setup.passwordSet.write('password-set')
  }
  let shown = storageRefuses ? createWalletRecords({ storage: makeStorage(true) }) : records
  if (storageHeld) {
    shown = createWalletRecords({
      storage: {
        ...storage,
        get: async (key, defaultValue) => {
          await storageHeld
          return storage.get(key, defaultValue)
        }
      }
    })
  }

  const reads = {
    trustedParties: jest.fn(trustedParties),
    moduleInfo: jest.fn(moduleInfo),
    paused: jest.fn(paused)
  }
  const account = {
    removedKey: jest.fn(removedKey),
    fitCheck: jest.fn(fitCheck),
    setupState: jest.fn(setupState),
    describeSetup: jest.fn(describeSetup)
  }
  const kit: ReviewKitClient = {
    chain: 'sepolia',
    descriptor: deploymentDescriptor('sepolia'),
    moduleReads: reads,
    setup: { setupState: account.setupState, describeSetup: account.describeSetup },
    walletReads: { removedKey: account.removedKey, fitCheck: account.fitCheck }
  }
  const retry = jest.fn()
  let reviewClient: ReviewClient = { status: 'ready', client: kit }
  if (client === 'loading') {
    reviewClient = { status: 'loading' }
  }
  if (client === 'failed') {
    reviewClient = { status: 'failed', retry }
  }
  if (client === 'update-the-wallet') {
    reviewClient = { status: 'update-the-wallet', retry }
  }

  const navigate = jest.fn()
  // Renders the view again as a state push does: the same client, a new label.
  const render = async (label: string | undefined) => {
    await act(async () => {
      root.render(
        <ThemeContext.Provider value={THEME_CONTEXT}>
          <ReviewView
            records={shown}
            chainId={CHAIN_ID}
            account={ACCOUNT}
            client={reviewClient}
            accountLabel={label}
            navigate={navigate}
          />
        </ThemeContext.Provider>
      )
    })
    await settle()
  }
  await render(accountLabel)
  return { reads, account, navigate, retry, rerender: render }
}

const callsFor = (mock: jest.Mock, method: Address) =>
  mock.mock.calls.filter(([module]) => sameAddress(module, method)).length

describe('the verify-the-details expander', () => {
  it('is closed on arrival, and the trust list appears only once it is opened', async () => {
    await mount()

    expect(textOf('review-verify-details')).toBe(t('socialRecovery.review.verifyDetails'))
    expect(byTestId('review-trust-list')).toBeNull()
    expect(pageText()).not.toContain(t('socialRecovery.review.trust.selfAttested'))

    await press('review-verify-details')

    expect(byTestId('review-trust-list')).not.toBeNull()
    expect(pageText()).toContain(t('socialRecovery.review.trust.selfAttested'))
    expect(pageText()).toContain(t('socialRecovery.review.trust.deadProvider'))
  })
})

describe('where the verify-the-details expander sits', () => {
  it('holds the expander and its trust list in the main column, after the account and before Save', async () => {
    await mount()
    await press('review-verify-details')

    const main = byTestId('review-columns-main')
    const aside = byTestId('review-columns-aside')
    ;['review-verify-details', 'review-trust-list'].forEach((id) => {
      expect(main?.contains(byTestId(id))).toBe(true)
      expect(aside?.contains(byTestId(id))).toBe(false)
    })
    expect(isBefore('review-account', 'review-verify-details')).toBe(true)
    expect(isBefore('review-trust-list', 'review-save')).toBe(true)
  })

  it('keeps only the text cards in the aside', async () => {
    await mount()
    await press('review-verify-details')

    const aside = byTestId('review-columns-aside')
    expect(aside?.querySelector('[role="button"]')).toBeNull()
    expect(aside?.contains(byTestId('review-what-publishes'))).toBe(true)
    expect(aside?.contains(byTestId('review-comparison'))).toBe(true)
  })
})

describe('the verify-the-details toggle', () => {
  it('reads collapsed on arrival and expanded once pressed', async () => {
    await mount()

    expect(byTestId('review-verify-details')?.getAttribute('aria-expanded')).toBe('false')

    await press('review-verify-details')

    expect(byTestId('review-verify-details')?.getAttribute('aria-expanded')).toBe('true')
  })
})

describe('the sections the review no longer shows', () => {
  it('shows no security stop, no other doors and no node line on a path of two methods whose every read answered', async () => {
    await mount({
      clauses: [required(PASSKEY), group(1, ALICE, BOB)],
      enrollments: [enrolled(PASSKEY), enrolled(ALICE), enrolled(BOB)]
    })
    await press('review-verify-details')

    expect(isDisabled('review-save')).toBe(false)
    expect(byTestId('review-trust-list')).not.toBeNull()
    expect(byPrefix('review-stop')).toBeNull()
    expect(byPrefix('review-doors')).toBeNull()
    expect(byPrefix('review-trust-node')).toBeNull()
    const gone = [
      'Security stop',
      'method · not stopped',
      'method · stopped',
      'Nobody can stop this method.',
      'can stop this method and lift the stop.',
      'The only stop in the kit is the one an identity method carries.',
      'This release ignores every stop',
      'Other doors on this account',
      'The wallet cannot see every door',
      'A recovery leaves them untouched.',
      'Your node ·',
      'It sees the request before the chain does.'
    ]
    gone.forEach((text) => expect(pageText()).not.toContain(text))
  })
})

describe('the titled sections of the details', () => {
  const mountTwoMethods = async () => {
    await mount({
      clauses: [required(PASSKEY), group(1, ALICE, BOB)],
      enrollments: [
        enrolled(PASSKEY, 'passed', { backup: 'synced' }),
        enrolled(ALICE),
        enrolled(BOB)
      ]
    })
    await press('review-verify-details')
  }

  it('titles one section per method contract with its kind, then one for the recovery module, in that order', async () => {
    await mountTwoMethods()

    expect(textOf('review-trust-0')?.startsWith(kindNameOf('passkey', t))).toBe(true)
    expect(textOf('review-trust-1')?.startsWith(kindNameOf('ecdsa', t))).toBe(true)
    expect(byTestId('review-trust-2')).toBeNull()
    expect(
      textOf('review-trust-module')?.startsWith(t('socialRecovery.display.nouns.recoveryModule'))
    ).toBe(true)
    expect(isBefore('review-trust-0', 'review-trust-1')).toBe(true)
    expect(isBefore('review-trust-1', 'review-trust-module')).toBe(true)
  })

  it("keeps each method's headings and lines inside its own section", async () => {
    await mountTwoMethods()

    expect(textOf('review-trust-0-heading-0')).toBe(PASSKEY.label)
    expect(isInside('review-trust-0-heading-0', 'review-trust-0')).toBe(true)
    expect(isInside('review-trust-0-method', 'review-trust-0')).toBe(true)
    expect(textOf('review-trust-0-heading-0-line-0')).toBe(t('socialRecovery.ceremony.syncedLoss'))
    expect(textOf('review-trust-0-heading-0-line-1')).toBe(
      t('socialRecovery.ceremony.passkeyOrigin')
    )
    expect(isInside('review-trust-0-heading-0-line-1', 'review-trust-0')).toBe(true)

    expect(isInside('review-trust-1-guardians', 'review-trust-1')).toBe(true)
    expect(isInside('review-trust-1-heading-0', 'review-trust-1')).toBe(true)
    expect(isInside('review-trust-1-heading-1', 'review-trust-1')).toBe(true)
    expect(isInside('review-trust-1-method', 'review-trust-1')).toBe(true)
    expect(textOf('review-trust-1-heading-1-line-0')).toBe(
      t('socialRecovery.disclosures.smartAccount')
    )
    expect(isInside('review-trust-1-heading-1-line-0', 'review-trust-1')).toBe(true)
    expect(textOf('review-trust-0')).not.toContain(t('socialRecovery.disclosures.smartAccount'))
  })

  it('keeps the identity line inside the identity method section', async () => {
    await mount({ clauses: [required(PASSPORT)], enrollments: [enrolled(PASSPORT)] })
    await press('review-verify-details')

    expect(textOf('review-trust-0')?.startsWith(kindNameOf('zkpassport', t))).toBe(true)
    expect(textOf('review-trust-0-heading-0-line-0')).toBe(t('socialRecovery.disclosures.identity'))
    expect(isInside('review-trust-0-heading-0-line-0', 'review-trust-0')).toBe(true)
  })

  it("holds the module's two lines in the module section and the closing lines after it, outside every section", async () => {
    await mountTwoMethods()

    const module = textOf('review-trust-module') ?? ''
    expect(module).toContain(t('socialRecovery.review.trust.moduleAuthority'))
    expect(module).toContain(t('socialRecovery.review.trust.auditedOnly'))
    expect(module).not.toContain(t('socialRecovery.review.trust.selfAttested'))

    const list = textOf('review-trust-list') ?? ''
    const closing = list.indexOf(t('socialRecovery.review.trust.selfAttested'))
    expect(closing).toBeGreaterThan(list.indexOf(t('socialRecovery.review.trust.auditedOnly')))
    expect(list.indexOf(t('socialRecovery.review.trust.deadProvider'))).toBeGreaterThan(closing)
    ;['review-trust-0', 'review-trust-1'].forEach((id) => {
      expect(textOf(id)).not.toContain(t('socialRecovery.review.trust.selfAttested'))
      expect(textOf(id)).not.toContain(t('socialRecovery.review.trust.deadProvider'))
    })
  })
})

describe('save and the trust list reads', () => {
  it('stays disabled while a read has not come back, with the line that checks the setup beside it', async () => {
    await mount({ moduleInfo: () => new Promise(() => {}) })

    expect(isDisabled('review-save')).toBe(true)
    expect(textOf('review-save-checking')).toBe(t('socialRecovery.loading.saveChecks'))
  })

  it("shows the line that reads the methods on a method's row while its read has not come back", async () => {
    await mount({ clauses: [required(PASSKEY)], moduleInfo: () => new Promise(() => {}) })
    await press('review-verify-details')

    const pending = byTestId('review-trust-0-pending')
    expect(pending?.textContent).toBe(t('socialRecovery.loading.trust'))
    expect(pending?.querySelector('[data-testid="loading-row"]')).not.toBeNull()
  })

  it('shows no line beside Save once every read answered', async () => {
    await mount()
    expect(byTestId('review-save-checking')).toBeNull()
  })

  it('shows no line beside a Save a block holds', async () => {
    await mount({ setupState: async () => setupStateOf(true) })
    expect(isDisabled('review-save')).toBe(true)
    expect(byTestId('review-save-checking')).toBeNull()
  })

  it('stays disabled while a read did not answer, then enables once the retry answers it', async () => {
    let passportAnswers = 0
    const { reads, navigate } = await mount({
      clauses: [group(2, ALICE, PASSPORT)],
      trustedParties: async (module) => {
        if (!sameAddress(module, BOOK.methods.zkpassport)) {
          return declaration()
        }
        passportAnswers += 1
        return passportAnswers === 1 ? UNANSWERED : declaration(ADMIN)
      }
    })

    expect(isDisabled('review-save')).toBe(true)
    await press('review-verify-details')
    // The path names the guardian first, so the passport's contract row is the second.
    const row = 'review-trust-1'
    expect(textOf(`${row}-unavailable`)).toBe(t('socialRecovery.review.blocked.unavailable.chip'))
    expect(textOf(`${row}-retry`)).toBe(t('socialRecovery.writes.tryAgain'))
    const guardianCalls = callsFor(reads.trustedParties, BOOK.methods.ecdsa)

    await press(`${row}-retry`)

    expect(callsFor(reads.trustedParties, BOOK.methods.zkpassport)).toBe(2)
    expect(callsFor(reads.trustedParties, BOOK.methods.ecdsa)).toBe(guardianCalls)
    expect(byTestId(`${row}-unavailable`)).toBeNull()
    expect(isDisabled('review-save')).toBe(false)

    await press('review-save')
    expect(navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetupSave)
  })

  it('reads a module read that rejects as unavailable, never as an empty declaration', async () => {
    await mount({
      clauses: [required(PASSKEY)],
      moduleInfo: async () => {
        throw new Error('node unreachable')
      }
    })
    await press('review-verify-details')

    expect(textOf('review-trust-0-unavailable')).toBe(
      t('socialRecovery.review.blocked.unavailable.chip')
    )
    expect(byTestId('review-trust-0-method')).toBeNull()
    expect(isDisabled('review-save')).toBe(true)
  })

  it('enables once every read answered, and reads each method once however many rows use it', async () => {
    const { reads } = await mount({ clauses: [group(2, ALICE, BOB, CAROL)] })

    expect(isDisabled('review-save')).toBe(false)
    expect(reads.trustedParties).toHaveBeenCalledTimes(1)
    expect(reads.moduleInfo).toHaveBeenCalledTimes(1)
  })

  it('goes back to the privacy step', async () => {
    const { navigate } = await mount()

    await press('review-back')

    expect(navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetupPrivacy)
  })

  it('states no cost under the save action, which the save screen carries', async () => {
    await mount()

    expect(byTestId('review-save')).not.toBeNull()
    expect(pageText()).not.toContain('One confirmation')
    expect(pageText()).not.toContain(t('socialRecovery.costLines.save'))
    expect(pageText()).not.toContain(t('socialRecovery.costLines.recovery'))
  })
})

describe('the path rows', () => {
  const CEREMONY = 'socialRecovery.ceremony'

  const VERDICTS: VerdictCase[] = [
    ['passed', undefined, 'tested', null],
    ['not-tested', undefined, 'notTested', null],
    ['failed', 'check-rejected', 'testFailed', `${CEREMONY}.testFailedNoMatch`],
    ['unavailable', undefined, 'testUnavailable', `${CEREMONY}.testUnavailableLine`],
    ['not-supported', undefined, 'notSupported', `${CEREMONY}.notSupportedLine`]
  ]
  VERDICTS.forEach(([test, cause, chip, line]) => {
    it(`show a ${test} test with its chip and its line`, async () => {
      await mount({
        clauses: [required(ALICE)],
        enrollments: [enrolled(ALICE, test, cause ? { cause } : {})]
      })

      expect(textOf('review-row-0-0-chip')).toBe(t(`socialRecovery.status.method.${chip}`))
      expect(textOf('review-row-0-0-line-0')).toBe(line ? t(line) : null)
    })
  })

  const FAILED_LINES: FailedLineCase[] = [
    [ALICE, 'check-rejected', `${CEREMONY}.testFailedNoMatch`],
    [ALICE, 'check-rejected: signer mismatch', `${CEREMONY}.testFailedNoMatch`],
    [ALICE, 'check-reverted', `${CEREMONY}.testFailedReverted`],
    [PASSKEY, 'browser-error: NotAllowedError', `${CEREMONY}.testFailedLine`],
    [PASSKEY, 'relying-party-mismatch: SecurityError', `${CEREMONY}.testFailedLine`],
    [ALICE, 'service-unanswered', `${CEREMONY}.testFailedLine`],
    [ALICE, undefined, `${CEREMONY}.testFailedLine`]
  ]
  FAILED_LINES.forEach(([credential, cause, line]) => {
    it(`show a failed test stored with ${
      cause ? `the cause "${cause}"` : 'no cause'
    } by one line`, async () => {
      await mount({
        clauses: [required(credential)],
        enrollments: [enrolled(credential, 'failed', cause === undefined ? {} : { cause })]
      })

      expect(textsStartingWith('review-row-0-0-line-')).toEqual([t(line)])
    })
  })

  const UNFAILED_LINES: UnfailedLineCase[] = [
    ['passed', []],
    ['not-tested', []]
  ]
  it('state that an untested method may fail once, in the warning beside Save', async () => {
    await mount({ clauses: [required(ALICE)], enrollments: [enrolled(ALICE, 'not-tested')] })

    const sentence = t(`${CEREMONY}.notTestedLine`)
    expect(pageText().split(sentence)).toHaveLength(2)
    expect(textOf('review-not-tested')).toContain(sentence)
  })

  UNFAILED_LINES.forEach(([test, lines]) => {
    it(`show no failed line on a ${test} test`, async () => {
      await mount({ clauses: [required(ALICE)], enrollments: [enrolled(ALICE, test)] })

      expect(textsStartingWith('review-row-0-0-line-')).toEqual(lines)
    })
  })

  /** The path and the query of the one place the review navigated to. */
  const destinationOf = (navigate: jest.Mock) => {
    expect(navigate).toHaveBeenCalledTimes(1)
    const [path, search = ''] = String(navigate.mock.calls[0][0]).split('?')
    return { path, query: Object.fromEntries(new URLSearchParams(search)) }
  }

  it("offer to run a guardian's test again on the enrollment step for that guardian", async () => {
    const { navigate } = await mount({
      clauses: [group(1, ALICE, BOB)],
      enrollments: [enrolled(ALICE), enrolled(BOB, 'unavailable')]
    })

    expect(textOf('review-row-0-1-retry-test')).toBe(t('socialRecovery.actions.runTheTestAgain'))
    expect(byTestId('review-row-0-0-retry-test')).toBeNull()

    await press('review-row-0-1-retry-test')

    expect(destinationOf(navigate)).toEqual({
      path: `/${WEB_ROUTES.socialRecoverySetupEnroll}`,
      query: { kind: 'ecdsa', clause: '0', member: '1' }
    })
  })

  it("offer to run a passkey's test again on the enrollment step for that passkey", async () => {
    const { navigate } = await mount({
      clauses: [required(ALICE), group(1, BOB, PASSKEY)],
      enrollments: [enrolled(ALICE), enrolled(BOB), enrolled(PASSKEY, 'unavailable')]
    })

    await press('review-row-1-1-retry-test')

    expect(destinationOf(navigate)).toEqual({
      path: `/${WEB_ROUTES.socialRecoverySetupEnroll}`,
      query: { kind: 'passkey', clause: '1', member: '1' }
    })
  })

  it('offer no test again on an identity row whose test could not run', async () => {
    await mount({
      clauses: [required(PASSPORT), required(AADHAAR)],
      enrollments: [enrolled(PASSPORT, 'unavailable'), enrolled(AADHAAR, 'unavailable')]
    })

    expect(textOf('review-row-0-0-chip')).toBe(t('socialRecovery.status.method.testUnavailable'))
    expect(textOf('review-row-1-0-chip')).toBe(t('socialRecovery.status.method.testUnavailable'))
    expect(container.querySelectorAll('[data-testid$="-retry-test"]')).toHaveLength(0)
  })

  it('offer no test again on a test that ran', async () => {
    await mount({
      clauses: [required(ALICE), required(BOB), required(CAROL)],
      enrollments: [
        enrolled(ALICE, 'failed', { cause: 'check-rejected' }),
        enrolled(BOB, 'not-tested'),
        enrolled(CAROL)
      ]
    })

    expect(container.querySelectorAll('[data-testid$="-retry-test"]')).toHaveLength(0)
  })

  it('carry the identity line and the publication line on a passport row', async () => {
    await mount({ clauses: [required(PASSPORT)], enrollments: [enrolled(PASSPORT, 'not-tested')] })

    expect(textsStartingWith('review-row-0-0-line-')).toEqual([
      t('socialRecovery.disclosures.identity'),
      t('socialRecovery.disclosures.passportPublication')
    ])
  })

  it('name a synced passkey with the synced word', async () => {
    await mount({
      clauses: [required(PASSKEY)],
      enrollments: [enrolled(PASSKEY, 'passed', { backup: 'synced' })]
    })

    expect(textOf('review-row-0-0-name')).toBe(PASSKEY.label)
    expect(textOf('review-row-0-0-aside')).toBe(t('socialRecovery.review.passkeySynced'))
    expect(textOf('review-row-0-0-chip')).toBe(t('socialRecovery.status.method.tested'))
    expect(textsStartingWith('review-row-0-0-line-')).toEqual([])
    expect(textOf('review-path')).not.toContain(t(`${CEREMONY}.syncedLoss`))
    expect(textOf('review-path')).not.toContain(t(`${CEREMONY}.passkeyOrigin`))
  })

  it('name a device-bound passkey with the device-bound word', async () => {
    await mount({
      clauses: [required(PASSKEY)],
      enrollments: [enrolled(PASSKEY, 'passed', { backup: 'device-bound' })]
    })

    expect(textOf('review-row-0-0-aside')).toBe(t('socialRecovery.review.passkeyDeviceBound'))
    expect(textOf('review-row-0-0-chip')).toBe(t('socialRecovery.status.method.tested'))
    expect(textsStartingWith('review-row-0-0-line-')).toEqual([])
    expect(textOf('review-path')).not.toContain(t(`${CEREMONY}.deviceBoundLoss`))
    expect(textOf('review-path')).not.toContain(t(`${CEREMONY}.passkeyOrigin`))
  })

  it('show a guardian by its full address', async () => {
    await mount({ clauses: [required(ALICE)], enrollments: [enrolled(ALICE)] })

    expect(textOf('review-row-0-0-name')).toBe(renderFullAddress(guardianAddress('a1')))
  })

  it('show three members of a larger group until the holder shows them all', async () => {
    await mount({ clauses: [group(2, ALICE, BOB, CAROL, DAVE)] })

    expect(byTestId('review-row-0-3')).toBeNull()
    expect(textOf('review-group-0-show-all')).toBe(t('socialRecovery.review.showAllMembers'))

    await press('review-group-0-show-all')

    expect(textOf('review-row-0-3-name')).toBe(renderFullAddress(guardianAddress('d4')))
  })
})

describe('the path tree', () => {
  it('draws a node per required row and per group, required rows first, each holding its row or group', async () => {
    await mount({
      clauses: [group(2, ALICE, BOB, CAROL), required(PASSKEY), required(PASSPORT)],
      enrollments: [enrolled(ALICE), enrolled(BOB), enrolled(CAROL), enrolled(PASSKEY)]
    })

    expect(byTestId('review-path')).not.toBeNull()
    ;['review-path-node-0', 'review-path-node-1', 'review-path-node-2'].forEach((id) =>
      expect(isInside(id, 'review-path')).toBe(true)
    )
    expect(byTestId('review-path-node-3')).toBeNull()
    expect(isInside('review-row-1-0', 'review-path-node-1')).toBe(true)
    expect(isInside('review-row-2-0', 'review-path-node-2')).toBe(true)
    expect(isInside('review-group-0', 'review-path-node-0')).toBe(true)
    expect(isInside('review-row-0-2', 'review-group-0')).toBe(true)
    expect(isBefore('review-path-node-1', 'review-path-node-2')).toBe(true)
    expect(isBefore('review-path-node-2', 'review-path-node-0')).toBe(true)
  })

  it('heads a group with its number and its Require N of M', async () => {
    await mount({ clauses: [required(PASSKEY), group(2, ALICE, BOB, CAROL)] })

    const header = textOf('review-group-1') ?? ''
    expect(header).toContain(t('socialRecovery.shape.group', { n: 1 }))
    expect(header).toContain(
      `${t('socialRecovery.shape.require')}2${t('socialRecovery.shape.of')}3`
    )
  })

  it('joins its parts with the and word, once between each two', async () => {
    await mount({ clauses: [required(PASSKEY), group(1, ALICE, BOB), group(1, CAROL, DAVE)] })

    const and = t('socialRecovery.shape.and')
    const junctions = Array.from(
      byTestId('review-path')?.children ?? [],
      (node) => node.textContent
    ).filter((text) => text === and)
    expect(junctions).toHaveLength(2)
  })

  it('keeps the show-all action inside a group drawn as a node', async () => {
    await mount({ clauses: [required(PASSKEY), group(2, ALICE, BOB, CAROL, DAVE)] })

    expect(isInside('review-group-1-show-all', 'review-path-node-1')).toBe(true)

    await press('review-group-1-show-all')

    expect(isInside('review-row-1-3', 'review-path-node-1')).toBe(true)
  })
})

describe('the lead', () => {
  const ruleLinesFor = (clauses: Clause[]) =>
    renderRuleLines(
      getRuleLines(
        { clauses },
        {
          kindOfMethod: (method) =>
            (Object.keys(BOOK.methods) as (keyof typeof BOOK.methods)[]).find((kind) =>
              sameAddress(BOOK.methods[kind], method)
            )
        }
      ),
      t
    )

  it('carries the rule lines of the path once, inside the path card under its rows', async () => {
    const clauses = [group(2, ALICE, BOB, PASSKEY)]
    await mount({ clauses })

    const lines = ruleLinesFor(clauses)
    expect(lines.length).toBeGreaterThan(0)
    expect(textsStartingWith('review-rule-line-')).toEqual(lines)
    lines.forEach((ruleLine) => expect(pageText().split(ruleLine).length - 1).toBe(1))
    expect(byTestId('review-rule-lines')?.parentElement?.contains(byTestId('review-path'))).toBe(
      true
    )
    expect(isBefore('review-path', 'review-rule-lines')).toBe(true)
    expect(byTestId('review-columns-aside')?.contains(byTestId('review-rule-lines'))).toBe(false)
  })

  it('states the single-method risk for a path of one method', async () => {
    const clauses = [required(PASSKEY)]
    await mount({ clauses, enrollments: [enrolled(PASSKEY)] })

    expect(textsStartingWith('review-rule-line-')).toEqual(ruleLinesFor(clauses))
    expect(textOf('review-rule-line-0')).toBe(t('socialRecovery.ruleLines.singleMethod'))
  })

  it('carries the hostile-minority guidance once for a group of three, and not for a group of two', async () => {
    await mount({ clauses: [group(2, ALICE, BOB, PASSKEY), group(2, CAROL, DAVE, PASSPORT)] })
    expect(textsStartingWith('review-hostile-minority')).toEqual([
      t('socialRecovery.review.hostileMinority')
    ])

    act(() => root.unmount())
    root = createRoot(container)
    await mount({ clauses: [group(1, ALICE, PASSKEY)] })
    expect(byTestId('review-hostile-minority')).toBeNull()
  })

  it('names the waiting period by its chip and carries the spare-key comparison', async () => {
    await mount({ wait: 604800 })

    expect(textOf('review-wait')).toBe(t('socialRecovery.privacy.waitingPeriod.chips.days7'))
    expect(textOf('review-spare-key')).toBe(t('socialRecovery.review.spareKey'))
    const aside = byTestId('review-columns-aside')
    expect(aside?.contains(byTestId('review-comparison'))).toBe(true)
    expect(textOf('review-comparison')).toContain('One comparison')
    expect(byTestId('review-columns-main')?.contains(byTestId('review-wait'))).toBe(true)
  })

  it("names a wait under one hour in minutes, and the floor in a release build's words", async () => {
    await mount({ wait: 300 })

    expect(textOf('review-wait')).toBe('5 minutes')
    expect(textOf('review-wait-minimum')).toBe("This wallet's minimum is 24 hours.")
    expect(pageText()).not.toContain('The chain enforces none')
  })

  it('carries the publication line once with its second sentence, beside the path, with no cost', async () => {
    await mount({ clauses: [required(ALICE)] })

    expect(textsStartingWith('review-publication')).toEqual([
      t('socialRecovery.review.publication.lead'),
      t('socialRecovery.review.publication.guardian')
    ])
    expect(byTestId('review-columns-aside')?.contains(byTestId('review-what-publishes'))).toBe(true)
    expect(byTestId('review-save-cost')).toBeNull()
    expect(byTestId('review-costs')).toBeNull()
  })

  it('reads Private with the recovery password set', async () => {
    await mount({ backup: 'encrypted', passwordSet: true })

    expect(textsStartingWith('review-privacy-')).toEqual([t('socialRecovery.review.privateSet')])
  })

  describe('at Shape visible', () => {
    const clauses = [group(2, PASSKEY, PASSPORT, ALICE)]
    const shape = 'socialRecovery.shape.sentence'
    const shapeLine = t('socialRecovery.privacy.level.shapeVisible.line', {
      shape: t(`${shape}.list`, {
        first: t(`${shape}.list`, {
          first: t(`${shape}.kinds.passkey`),
          rest: t(`${shape}.pair`, {
            first: t(`${shape}.kinds.passport`),
            second: t(`${shape}.kinds.guardian`)
          })
        }),
        rest: t(`${shape}.anyOf`, { threshold: 2, count: 3 })
      })
    })
    const mountShapeVisible = (passwordSet: boolean) =>
      mount({
        clauses,
        enrollments: [enrolled(PASSKEY)],
        publicMetadata: shapeNoteOf({ clauses, wait: 172800, ignoresPause: true }),
        passwordSet
      })

    it('reads that the recovery password is set, then the line carrying the shape, once the password is stored', async () => {
      await mountShapeVisible(true)

      expect(textsStartingWith('review-privacy-')).toEqual([
        t('socialRecovery.review.shapeVisibleSet'),
        shapeLine
      ])
    })

    it('reads the Shape visible label, then the line carrying the shape, before the password is stored', async () => {
      await mountShapeVisible(false)

      expect(textsStartingWith('review-privacy-')).toEqual([
        t('socialRecovery.privacy.level.shapeVisible.label'),
        shapeLine
      ])
    })

    it('reads that the recovery password is set, then the line for an empty path, where the path has no member', async () => {
      const memberless: Clause[] = [{ threshold: 1, credentials: [] }]
      await mount({
        clauses: memberless,
        publicMetadata: shapeNoteOf({ clauses: memberless, wait: 172800, ignoresPause: true }),
        passwordSet: true
      })

      expect(textsStartingWith('review-privacy-')).toEqual([
        t('socialRecovery.review.shapeVisibleSet'),
        t('socialRecovery.privacy.level.shapeVisible.lineEmpty')
      ])
    })
  })

  it('reads the Private label alone before the password is stored', async () => {
    await mount({ backup: 'encrypted', passwordSet: false })

    expect(textsStartingWith('review-privacy-')).toEqual([
      t('socialRecovery.privacy.level.private.label')
    ])
  })

  it('reads the Public label and its line', async () => {
    await mount({ backup: 'clear', passwordSet: false })

    expect(textsStartingWith('review-privacy-')).toEqual([
      t('socialRecovery.privacy.level.public.label'),
      t('socialRecovery.privacy.level.public.line')
    ])
  })
})

describe('the trust list', () => {
  it('carries the smart account sentence under every guardian heading, tested or not', async () => {
    await mount({
      clauses: [group(2, ALICE, BOB, CAROL)],
      enrollments: [enrolled(ALICE), enrolled(BOB, 'not-tested'), enrolled(CAROL, 'failed')]
    })
    await press('review-verify-details')

    expect(textOf('review-trust-0-guardians')).toBe(
      t('socialRecovery.review.trust.guardiansSomeTested', { count: 3, tested: 1 })
    )
    expect(textsStartingWith('review-trust-0-heading-')).toEqual([
      t('socialRecovery.review.trust.guardianHeadingTested', {
        address: renderFullAddress(guardianAddress('a1'))
      }),
      t('socialRecovery.review.trust.guardianHeading', {
        address: renderFullAddress(guardianAddress('b2'))
      }),
      t('socialRecovery.review.trust.guardianHeading', {
        address: renderFullAddress(guardianAddress('c3'))
      }),
      t('socialRecovery.disclosures.smartAccount'),
      t('socialRecovery.disclosures.smartAccount'),
      t('socialRecovery.disclosures.smartAccount')
    ])
  })

  it('names no outside party for a method whose admin is the zero address', async () => {
    await mount({ clauses: [required(PASSKEY)] })
    await press('review-verify-details')

    expect(textOf('review-trust-0-method')).toBe(
      t('socialRecovery.review.trust.methodRow', {
        method: t('socialRecovery.methodNames.passkey')
      })
    )
    expect(byTestId('review-trust-0-admin')).toBeNull()
  })

  it('names the admin, the address one acceptance away, the recover-alone line and the renewal line', async () => {
    await mount({
      clauses: [required(PASSPORT)],
      trustedParties: async () => declaration(ADMIN, PENDING_ADMIN)
    })
    await press('review-verify-details')

    expect(textOf('review-trust-0-method')).toBe(
      t('socialRecovery.review.trust.methodRowAdmin', {
        method: t('socialRecovery.methodNames.passport'),
        party: renderFullAddress(ADMIN)
      })
    )
    expect(textOf('review-trust-0-admin')).toBe(t('socialRecovery.review.trust.adminLine'))
    expect(textOf('review-trust-0-pending-admin')).toBe(
      t('socialRecovery.review.trust.oneAcceptanceAway', {
        address: renderFullAddress(PENDING_ADMIN)
      })
    )
    expect(textOf('review-trust-0-recover-alone')).toBe(
      t('socialRecovery.review.trust.recoverAlone')
    )
    expect(textOf('review-trust-0-renewal')).toBe(t('socialRecovery.review.trust.passportRenewal'))
  })

  it('names the admin by its full address on the method row', async () => {
    await mount({
      clauses: [group(2, PASSPORT, PASSKEY)],
      trustedParties: async (module) =>
        sameAddress(module, BOOK.methods.zkpassport) ? declaration(ADMIN) : declaration()
    })
    await press('review-verify-details')

    const method = textOf('review-trust-0-method')
    expect(method).toBe(
      t('socialRecovery.review.trust.methodRowAdmin', {
        method: t('socialRecovery.methodNames.passport'),
        party: renderFullAddress(ADMIN)
      })
    )
    expect(method).toContain(renderFullAddress(ADMIN))
    expect(byTestId('review-trust-0-recover-alone')).toBeNull()
  })

  it('names no outside party and the address one acceptance away where only a pending admin is set', async () => {
    await mount({
      clauses: [required(PASSKEY)],
      trustedParties: async () => declaration(zeroAddress, PENDING_ADMIN)
    })
    await press('review-verify-details')

    expect(textOf('review-trust-0-method')).toBe(
      t('socialRecovery.review.trust.methodRow', {
        method: t('socialRecovery.methodNames.passkey')
      })
    )
    expect(textOf('review-trust-0-pending-admin')).toBe(
      t('socialRecovery.review.trust.oneAcceptanceAway', {
        address: renderFullAddress(PENDING_ADMIN)
      })
    )
    expect(byTestId('review-trust-0-admin')).toBeNull()
    expect(pageText()).not.toContain(t('socialRecovery.review.trust.adminLine'))
  })

  it('shows the recover-alone line where each group of any one holds a passport', async () => {
    await mount({
      clauses: [group(1, PASSPORT, ALICE), group(1, SECOND_PASSPORT, BOB)],
      trustedParties: async (module) =>
        sameAddress(module, BOOK.methods.zkpassport) ? declaration(ADMIN) : declaration()
    })
    await press('review-verify-details')

    expect(textOf('review-trust-0-recover-alone')).toBe(
      t('socialRecovery.review.trust.recoverAlone')
    )
  })

  it('does not show the recover-alone line for a two-of-three group that holds one passport', async () => {
    await mount({
      clauses: [group(2, PASSPORT, ALICE, BOB)],
      trustedParties: async (module) =>
        sameAddress(module, BOOK.methods.zkpassport) ? declaration(ADMIN) : declaration()
    })
    await press('review-verify-details')

    expect(textOf('review-trust-0-admin')).toBe(t('socialRecovery.review.trust.adminLine'))
    expect(byTestId('review-trust-0-recover-alone')).toBeNull()
  })

  it('puts the count line, then both guardian headings, then the method row once, then each smart account sentence', async () => {
    await mount({
      clauses: [group(1, ALICE, BOB)],
      enrollments: [enrolled(ALICE), enrolled(BOB)]
    })
    await press('review-verify-details')

    const rowIds = Array.from(
      container.querySelectorAll<HTMLElement>('[data-testid^="review-trust-0-"]'),
      (node) => node.getAttribute('data-testid')
    )
    expect(rowIds).toEqual([
      'review-trust-0-guardians',
      'review-trust-0-heading-0',
      'review-trust-0-heading-1',
      'review-trust-0-method',
      'review-trust-0-heading-0-line-0',
      'review-trust-0-heading-1-line-0'
    ])
    expect(textOf('review-trust-0-guardians')).toBe(
      t('socialRecovery.review.trust.guardiansAllTested', { count: 2 })
    )
    expect(textOf('review-trust-0-method')).toBe(
      t('socialRecovery.review.trust.methodRow', {
        method: t('socialRecovery.display.nouns.guardian')
      })
    )
    expect(textOf('review-trust-0-heading-0-line-0')).toBe(
      t('socialRecovery.disclosures.smartAccount')
    )
    expect(textOf('review-trust-0-heading-1-line-0')).toBe(
      t('socialRecovery.disclosures.smartAccount')
    )
  })

  it('carries the synced loss line then the origin line under a synced passkey heading', async () => {
    await mount({
      clauses: [required(PASSKEY)],
      enrollments: [enrolled(PASSKEY, 'passed', { backup: 'synced' })]
    })
    await press('review-verify-details')

    expect(textOf('review-trust-0-heading-0')).toBe(PASSKEY.label)
    expect(textsStartingWith('review-trust-0-heading-0-line-')).toEqual([
      t('socialRecovery.ceremony.syncedLoss'),
      t('socialRecovery.ceremony.passkeyOrigin')
    ])
  })

  it('carries the device-bound loss line then the origin line under a device-bound passkey heading', async () => {
    await mount({
      clauses: [required(PASSKEY)],
      enrollments: [enrolled(PASSKEY, 'not-tested', { backup: 'device-bound' })]
    })
    await press('review-verify-details')

    expect(textsStartingWith('review-trust-0-heading-0-line-')).toEqual([
      t('socialRecovery.ceremony.deviceBoundLoss'),
      t('socialRecovery.ceremony.passkeyOrigin')
    ])
  })

  it('carries the identity line under a passport heading', async () => {
    await mount({ clauses: [required(PASSPORT)], enrollments: [enrolled(PASSPORT)] })
    await press('review-verify-details')

    expect(textOf('review-trust-0-heading-0')).toBe(t('socialRecovery.methodNames.passport'))
    expect(textsStartingWith('review-trust-0-heading-0-line-')).toEqual([
      t('socialRecovery.disclosures.identity')
    ])
  })

  it('names a module the deployment does not ship as a third-party method', async () => {
    await mount({ clauses: [group(2, PASSKEY, THIRD_PARTY)] })
    await press('review-verify-details')

    expect(textOf('review-trust-1-third-party')).toBe(
      t('socialRecovery.review.trust.thirdPartyRow')
    )
    expect(pageText()).toContain(t('socialRecovery.review.trust.thirdPartyLine'))
    expect(isDisabled('review-save')).toBe(false)
  })

  it('names a declaring third-party module by its admin in full, with the lines of a shipped method', async () => {
    await mount({
      clauses: [required(THIRD_PARTY)],
      trustedParties: async () => declaration(ADMIN, PENDING_ADMIN)
    })
    await press('review-verify-details')

    const row = textOf('review-trust-0-third-party')
    expect(row).toBe(
      t('socialRecovery.review.trust.thirdPartyDeclaredRow', { party: renderFullAddress(ADMIN) })
    )
    expect(row).toContain(renderFullAddress(ADMIN))
    expect(textOf('review-trust-0-admin')).toBe(t('socialRecovery.review.trust.adminLine'))
    expect(textOf('review-trust-0-pending-admin')).toBe(
      t('socialRecovery.review.trust.oneAcceptanceAway', {
        address: renderFullAddress(PENDING_ADMIN)
      })
    )
    expect(textOf('review-trust-0-recover-alone')).toBe(
      t('socialRecovery.review.trust.recoverAlone')
    )
    expect(pageText()).not.toContain(t('socialRecovery.review.trust.thirdPartyRow'))
    expect(pageText()).not.toContain(t('socialRecovery.review.trust.thirdPartyLine'))
    expect(isDisabled('review-save')).toBe(false)
  })

  it('names a third-party module that does not answer to the method interface as unknown, whatever it declares', async () => {
    await mount({
      clauses: [group(2, PASSKEY, THIRD_PARTY)],
      trustedParties: async () => declaration(ADMIN, PENDING_ADMIN),
      moduleInfo: async (module) => info(!sameAddress(module, THIRD_PARTY.method))
    })
    await press('review-verify-details')

    expect(textOf('review-trust-1-third-party')).toBe(
      t('socialRecovery.review.trust.thirdPartyRow')
    )
    expect(textOf('review-trust-1')).toContain(t('socialRecovery.review.trust.thirdPartyLine'))
    expect(byTestId('review-trust-1-admin')).toBeNull()
    expect(byTestId('review-trust-1-pending-admin')).toBeNull()
    expect(byTestId('review-trust-1-recover-alone')).toBeNull()
    expect(pageText()).not.toContain(
      t('socialRecovery.review.trust.thirdPartyDeclaredRow', { party: renderFullAddress(ADMIN) })
    )
  })

  it('names a third-party module whose declaration names no admin as unknown', async () => {
    await mount({ clauses: [required(THIRD_PARTY)], trustedParties: async () => declaration() })
    await press('review-verify-details')

    expect(textOf('review-trust-0-third-party')).toBe(
      t('socialRecovery.review.trust.thirdPartyRow')
    )
    expect(textOf('review-trust-0')).toContain(t('socialRecovery.review.trust.thirdPartyLine'))
    expect(byTestId('review-trust-0-admin')).toBeNull()
    expect(byTestId('review-trust-0-recover-alone')).toBeNull()
  })

  describe('the recover-alone line', () => {
    const passportAdmin = async (module: Address) =>
      sameAddress(module, BOOK.methods.zkpassport) ? declaration(ADMIN) : declaration()

    const AT_ONE: PathCase[] = [
      ['a lone required row', [required(PASSPORT)]],
      ['a group of one of two', [group(1, PASSPORT, ALICE)]],
      ['two groups of any one', [group(1, PASSPORT, ALICE), group(1, SECOND_PASSPORT, BOB)]]
    ]
    AT_ONE.forEach(([name, clauses]) => {
      it(`names the threshold of one for ${name}`, async () => {
        await mount({ clauses, trustedParties: passportAdmin })
        await press('review-verify-details')

        expect(textOf('review-trust-0-recover-alone')).toBe(
          t('socialRecovery.review.trust.recoverAlone')
        )
      })
    })

    const OTHERWISE: PathCase[] = [
      ['two required passport rows', [required(PASSPORT), required(SECOND_PASSPORT)]],
      ['a required row beside a group', [required(PASSPORT), group(1, SECOND_PASSPORT, ALICE)]]
    ]
    OTHERWISE.forEach(([name, clauses]) => {
      it(`names no threshold for ${name}`, async () => {
        await mount({ clauses, trustedParties: passportAdmin })
        await press('review-verify-details')

        expect(textOf('review-trust-0-recover-alone')).toBe(
          t('socialRecovery.review.trust.recoverAloneAny')
        )
        expect(pageText()).not.toContain(t('socialRecovery.review.trust.recoverAlone'))
      })
    })
  })

  it('names the recovery module with its publisher from the wallet table', async () => {
    await mount()
    await press('review-verify-details')

    const action = auditedActionOf(deploymentDescriptor('sepolia').action, 'sepolia')
    if (action.kind !== 'audited') {
      throw new Error('the shipped action is not in the wallet table')
    }
    expect(textOf('review-trust-module')).toContain(
      t('socialRecovery.review.trust.moduleRow', { publisher: t(publisherKeyOf(action)) })
    )
  })
})

describe('the account block', () => {
  it('names the account on one line by its full address, with no check line and no key box', async () => {
    await mount()

    expect(textOf('review-account-line')).toBe(renderFullAddress(ACCOUNT))
    expect(pageText()).not.toContain(renderShortAddress(ACCOUNT))
    expect(pageText()).not.toContain(t('socialRecovery.review.account.check'))
    expect(pageText()).not.toContain(t('socialRecovery.arm.keyRecoveryWouldRemove'))
  })

  it('puts the label the wallet holds before the full address, with no caveat', async () => {
    await mount({ accountLabel: 'Account 1' })

    expect(textOf('review-account-line')).toBe(`Account 1 · ${renderFullAddress(ACCOUNT)}`)
    expect(pageText()).not.toContain(t('socialRecovery.display.nameCaveat'))
  })
})

describe('what the review cannot read', () => {
  it('reads that the draft could not be read, with no Save', async () => {
    await mount({ storageRefuses: true })

    expect(textOf('review-load-failed')).toBe(t('socialRecovery.records.loadFailed'))
    expect(byTestId('review-save')).toBeNull()
    expect(byTestId('review-columns-main')?.contains(byTestId('review-load-failed'))).toBe(true)
    expect(byTestId('review-columns-aside')).toBeNull()
  })

  it("shows the client's unavailable pair with a retry and keeps Save disabled", async () => {
    const { retry, reads } = await mount({ client: 'failed' })

    expect(pageText()).toContain(t('socialRecovery.client.unavailableTitle'))
    expect(pageText()).toContain(t('socialRecovery.client.unavailableBody'))
    expect(isDisabled('review-save')).toBe(true)
    expect(reads.trustedParties).not.toHaveBeenCalled()

    await press('review-client-retry')
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it("shows the client's update-the-wallet pair and keeps Save disabled", async () => {
    await mount({ client: 'update-the-wallet' })

    expect(pageText()).toContain(t('socialRecovery.client.updateTheWalletTitle'))
    expect(pageText()).toContain(t('socialRecovery.client.updateTheWalletBody'))
    expect(isDisabled('review-save')).toBe(true)
  })

  it('keeps Save disabled while the client loads, with the line that checks the setup beside it', async () => {
    await mount({ client: 'loading' })

    expect(isDisabled('review-save')).toBe(true)
    expect(textOf('review-save-checking')).toBe(t('socialRecovery.loading.saveChecks'))
    expect(
      byTestId('review-save-checking')?.querySelector('[data-testid="loading-row"]')
    ).not.toBeNull()
  })

  it('shows the block that reads the methods in the details while the client loads', async () => {
    await mount({ client: 'loading' })
    await press('review-verify-details')

    const block = byTestId('review-trust-loading')?.querySelector('[data-testid="loading-block"]')
    expect(block?.textContent).toBe(t('socialRecovery.loading.trust'))
  })

  it('shows the waiting block that opens the draft under the title until the draft is read', async () => {
    let release: () => void = () => {}
    const storageHeld = new Promise<void>((resolve) => {
      release = resolve
    })
    await mount({ storageHeld })

    expect(textOf('review-title')).toBe(t('socialRecovery.review.title'))
    expect(textOf('loading-screen')).toBe(t('socialRecovery.loading.draft'))
    expect(byTestId('review-save')).toBeNull()
    // The columns and the view under the title grow, so the wait centres below the title.
    const growing = ['review-columns', 'review-columns-main', 'review']
    growing.forEach((id) => {
      expect(getComputedStyle(byTestId(id) as HTMLElement).flexGrow).toBe('1')
    })

    await act(async () => {
      release()
    })
    expect(byTestId('loading-screen')).toBeNull()
    expect(byTestId('review-save')).not.toBeNull()
  })
})

describe("the client's retry beside Back", () => {
  const CLIENT_REFUSALS: Array<'failed' | 'update-the-wallet'> = ['failed', 'update-the-wallet']
  CLIENT_REFUSALS.forEach((client) => {
    it(`sits before Back in one row at the same height, and retries, where the client is ${client}`, async () => {
      const { retry } = await mount({ client })

      expect(drawnSideBySide('review-client-retry', 'review-back')).toBe(true)
      expect(isBefore('review-client-retry', 'review-back')).toBe(true)
      expect(heightOf('review-back')).toBeTruthy()
      expect(heightOf('review-client-retry')).toBe(heightOf('review-back'))

      await press('review-client-retry')
      expect(retry).toHaveBeenCalledTimes(1)
    })
  })

  it('draws no retry beside Back where the client is ready', async () => {
    await mount()
    expect(byTestId('review-client-retry')).toBeNull()
    expect(byTestId('review-back')).not.toBeNull()
  })
})

describe('a read that did not answer', () => {
  const BLOCKED = 'socialRecovery.review.blocked'

  it('shows the unavailable block, and its retry runs again only the reads that did not answer', async () => {
    let pausedAnswers = 0
    let fitAnswers = 0
    const { reads, account } = await mount({
      clauses: [group(2, ALICE, PASSKEY)],
      paused: async (module) => {
        if (!sameAddress(module, BOOK.methods.passkey)) {
          return NOT_PAUSED
        }
        pausedAnswers += 1
        return pausedAnswers === 1 ? UNANSWERED : NOT_PAUSED
      },
      fitCheck: async () => {
        fitAnswers += 1
        if (fitAnswers === 1) {
          throw new Error('node unreachable')
        }
        return { basis: 'deployed-code', fits: true }
      }
    })

    expect(isDisabled('review-save')).toBe(true)
    expect(textOf('review-blocked-chip')).toBe(t(`${BLOCKED}.unavailable.chip`))
    expect(textOf('review-blocked-title')).toBe(t(`${BLOCKED}.unavailable.title`))
    expect(textOf('review-blocked-body')).toBe(t(`${BLOCKED}.unavailable.body`))
    expect(textOf('review-blocked-retry')).toBe(t('socialRecovery.writes.tryAgain'))
    await press('review-verify-details')
    expect(textOf('review-trust-1-unavailable')).toBe(t(`${BLOCKED}.unavailable.chip`))

    await press('review-blocked-retry')

    expect(callsFor(reads.paused, BOOK.methods.passkey)).toBe(2)
    expect(callsFor(reads.paused, BOOK.methods.ecdsa)).toBe(1)
    expect(callsFor(reads.trustedParties, BOOK.methods.passkey)).toBe(1)
    expect(callsFor(reads.moduleInfo, BOOK.methods.passkey)).toBe(1)
    expect(account.fitCheck).toHaveBeenCalledTimes(2)
    expect(account.removedKey).toHaveBeenCalledTimes(1)
    expect(account.setupState).toHaveBeenCalledTimes(1)
    expect(account.describeSetup).toHaveBeenCalledTimes(1)
    expect(byTestId('review-blocked-unavailable')).toBeNull()
    expect(textOf('review-trust-1-method')).toBe(
      t('socialRecovery.review.trust.methodRow', {
        method: t('socialRecovery.methodNames.passkey')
      })
    )
    expect(isDisabled('review-save')).toBe(false)
  })

  it('reads a setup read that throws as unavailable', async () => {
    await mount({
      setupState: async () => {
        throw new Error('node unreachable')
      }
    })

    expect(byTestId('review-blocked-unavailable')).not.toBeNull()
    expect(isDisabled('review-save')).toBe(true)
  })
})

describe('the key a recovery would remove', () => {
  const BLOCKED = 'socialRecovery.review.blocked'

  it('is read before Save runs but left to the save screen to show', async () => {
    await mount()

    expect(pageText()).not.toContain(t('socialRecovery.arm.keyRecoveryWouldRemove'))
    expect(pageText()).not.toContain(renderFullAddress(REMOVED_KEY))
    expect(pageText()).not.toContain(t('socialRecovery.review.keyRemovedLine'))
    expect(isDisabled('review-save')).toBe(false)
  })

  it('blocks Save with its reason where it cannot be named, until a retry names it', async () => {
    let answers = 0
    const { account } = await mount({
      removedKey: async () => {
        answers += 1
        return answers === 1
          ? { kind: 'unavailable', cause: 'not-a-key' }
          : { kind: 'named', key: REMOVED_KEY }
      }
    })

    expect(textOf('review-blocked-title')).toBe(t(`${BLOCKED}.removedKeyUnreadable.title`))
    expect(textOf('review-blocked-body')).toBe(t(`${BLOCKED}.removedKeyUnreadable.body`))
    expect(isDisabled('review-save')).toBe(true)

    await press('review-blocked-retry')

    expect(account.removedKey).toHaveBeenCalledTimes(2)
    expect(account.fitCheck).toHaveBeenCalledTimes(1)
    expect(byTestId('review-blocked-removed-key-unreadable')).toBeNull()
    expect(isDisabled('review-save')).toBe(false)
  })

  it('reads a removed key read that throws as unreadable', async () => {
    await mount({
      removedKey: async () => {
        throw new Error('node unreachable')
      }
    })

    expect(byTestId('review-blocked-removed-key-unreadable')).not.toBeNull()
    expect(isDisabled('review-save')).toBe(true)
  })
})

describe('an account this release cannot recover', () => {
  const BLOCKED = 'socialRecovery.review.blocked'

  it('names the unsupported account where the fit check refuses', async () => {
    await mount({ fitCheck: async () => ({ basis: 'deployed-code', fits: false }) })

    expect(textOf('review-blocked-chip')).toBe(t('socialRecovery.status.recovery.cannotRecover'))
    expect(textOf('review-blocked-title')).toBe(t(`${BLOCKED}.cannotRecover.title`))
    expect(textOf('review-blocked-body')).toBe(t(`${BLOCKED}.cannotRecover.reasonNotSupported`))
    expect(byTestId('review-blocked-retry')).toBeNull()
    expect(isDisabled('review-save')).toBe(true)
  })

  it('names the key count where two keys hold authority', async () => {
    await mount({
      describeSetup: async () =>
        descriptionOf([
          { key: REMOVED_KEY, isAuthority: true },
          { key: OTHER_KEY, isAuthority: true }
        ])
    })

    expect(textOf('review-blocked-title')).toBe(t(`${BLOCKED}.cannotRecover.title`))
    expect(textOf('review-blocked-body')).toBe(
      t(`${BLOCKED}.cannotRecover.reasonKeyCount`, { count: 2 })
    )
    expect(isDisabled('review-save')).toBe(true)
  })
})

describe("the wallet's reading of the account's keys", () => {
  const BLOCKED = 'socialRecovery.review.blocked'
  const TWO_AUTHORITIES = [
    { key: REMOVED_KEY, isAuthority: true },
    { key: OTHER_KEY, isAuthority: true }
  ]
  const blockers = () => container.querySelectorAll('[data-testid^="review-blocked"]')

  it('lets Save run with no block where the wallet names a key and one key holds authority', async () => {
    await mount({
      removedKey: async () => ({ kind: 'named', key: REMOVED_KEY }),
      describeSetup: async () => descriptionOf([{ key: REMOVED_KEY, isAuthority: true }])
    })

    expect(blockers()).toHaveLength(0)
    expect(isDisabled('review-save')).toBe(false)
  })

  it('reads several keys as an account this release cannot recover, with the count, and offers no retry', async () => {
    const { account } = await mount({
      removedKey: async () => ({ kind: 'unavailable', cause: 'several-key-entries' }),
      describeSetup: async () => descriptionOf(TWO_AUTHORITIES)
    })

    expect(textOf('review-blocked-chip')).toBe(t('socialRecovery.status.recovery.cannotRecover'))
    expect(textOf('review-blocked-title')).toBe(t(`${BLOCKED}.cannotRecover.title`))
    expect(textOf('review-blocked-body')).toBe(
      t(`${BLOCKED}.cannotRecover.reasonKeyCount`, { count: 2 })
    )
    expect(byTestId('review-blocked-removed-key-unreadable')).toBeNull()
    expect(byTestId('review-blocked-retry')).toBeNull()
    expect(isDisabled('review-save')).toBe(true)
    expect(account.removedKey).toHaveBeenCalledTimes(1)
  })

  it('reads several keys as cannot recover with the several-keys line where the description throws', async () => {
    await mount({
      removedKey: async () => ({ kind: 'unavailable', cause: 'several-key-entries' }),
      describeSetup: async () => {
        throw new Error('node unreachable')
      }
    })

    expect(byTestId('review-blocked-cannot-recover')).not.toBeNull()
    expect(textOf('review-blocked-title')).toBe(t(`${BLOCKED}.cannotRecover.title`))
    expect(textOf('review-blocked-body')).toBe(t(`${BLOCKED}.cannotRecover.reasonSeveralKeys`))
    expect(pageText()).not.toContain(t(`${BLOCKED}.cannotRecover.reasonNotSupported`))
    expect(byTestId('review-blocked-retry')).toBeNull()
    expect(isDisabled('review-save')).toBe(true)
  })

  it('reads several keys with the several-keys line where the description counts one authority', async () => {
    await mount({
      removedKey: async () => ({ kind: 'unavailable', cause: 'several-key-entries' })
    })

    expect(byTestId('review-blocked-cannot-recover')).not.toBeNull()
    expect(textOf('review-blocked-body')).toBe(t(`${BLOCKED}.cannotRecover.reasonSeveralKeys`))
    expect(isDisabled('review-save')).toBe(true)
  })

  it('reads an account with no creation record as a removed key it could not read, with its retry', async () => {
    const { account } = await mount({
      removedKey: async () => ({ kind: 'unavailable', cause: 'no-source' })
    })

    expect(textOf('review-blocked-title')).toBe(t(`${BLOCKED}.removedKeyUnreadable.title`))
    expect(textOf('review-blocked-body')).toBe(t(`${BLOCKED}.removedKeyUnreadable.body`))
    expect(isDisabled('review-save')).toBe(true)

    await press('review-blocked-retry')

    expect(account.removedKey).toHaveBeenCalledTimes(2)
  })

  it('shows no block while the removed key is still being read, then the block once it answers', async () => {
    let answer: (reading: RemovedKeyReading) => void = () => {}
    await mount({
      removedKey: () =>
        new Promise<RemovedKeyReading>((resolve) => {
          answer = resolve
        }),
      setupState: async () => setupStateOf(true)
    })

    expect(blockers()).toHaveLength(0)
    expect(isDisabled('review-save')).toBe(true)

    await act(async () => answer({ kind: 'named', key: REMOVED_KEY }))
    await settle()

    expect(byTestId('review-blocked-already-set-up')).not.toBeNull()
    expect(isDisabled('review-save')).toBe(true)
  })
})

describe('an account that already has a setup', () => {
  const BLOCKED = 'socialRecovery.review.blocked'

  it('refuses a second setup and opens the recovery path', async () => {
    const { navigate } = await mount({ setupState: async () => setupStateOf(true) })

    expect(textOf('review-blocked-chip')).toBe(t(`${BLOCKED}.alreadySetUp.chip`))
    expect(textOf('review-blocked-title')).toBe(t(`${BLOCKED}.alreadySetUp.title`))
    expect(textOf('review-blocked-body')).toBe(t(`${BLOCKED}.alreadySetUp.body`))
    expect(textOf('review-blocked-open')).toBe(t(`${BLOCKED}.alreadySetUp.open`))
    expect(isDisabled('review-save')).toBe(true)

    await press('review-blocked-open')

    expect(navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoveryManage)
  })
})

describe('a path with an empty slot', () => {
  const BLOCKED = 'socialRecovery.review.blocked'

  it('blocks Save with its line and opens the editor', async () => {
    const { navigate } = await mount({ clauses: [group(1, ALICE, emptySlot('passkey'))] })

    expect(byTestId('review-blocked-empty-slot')).not.toBeNull()
    expect(textOf('review-blocked-body')).toBe(t(`${BLOCKED}.emptySlot`))
    expect(textOf('review-blocked-editor')).toBe(t(`${BLOCKED}.emptySlotAction`))
    expect(isDisabled('review-save')).toBe(true)

    await press('review-blocked-editor')

    expect(navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetupEditor)
  })

  it('shows before the missing password and before a read has come back', async () => {
    await mount({
      clauses: [required(ALICE), required(emptySlot('passkey'))],
      passwordSet: false,
      moduleInfo: () => new Promise(() => {})
    })

    expect(byTestId('review-blocked-empty-slot')).not.toBeNull()
    expect(byTestId('review-blocked-password-missing')).toBeNull()
    expect(isDisabled('review-save')).toBe(true)
  })
})

describe('a hidden setup with no recovery password', () => {
  const BLOCKED = 'socialRecovery.review.blocked'

  it('blocks Save with its line and opens the privacy step', async () => {
    const { navigate } = await mount({ backup: 'encrypted', passwordSet: false })

    expect(byTestId('review-blocked-password-missing')).not.toBeNull()
    expect(textOf('review-blocked-body')).toBe(t(`${BLOCKED}.passwordMissing`))
    expect(textOf('review-blocked-privacy')).toBe(t(`${BLOCKED}.passwordMissingAction`))
    expect(isDisabled('review-save')).toBe(true)

    await press('review-blocked-privacy')

    expect(navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetupPrivacy)
  })

  it('shows before a block from the reads', async () => {
    await mount({ passwordSet: false, setupState: async () => setupStateOf(true) })

    expect(byTestId('review-blocked-password-missing')).not.toBeNull()
    expect(byTestId('review-blocked-already-set-up')).toBeNull()
  })

  it('does not block a public setup', async () => {
    await mount({ backup: 'clear', passwordSet: false })

    expect(byTestId('review-blocked-password-missing')).toBeNull()
    expect(isDisabled('review-save')).toBe(false)
  })
})

describe('the block beside Save', () => {
  const BLOCKED = 'socialRecovery.review.blocked'
  const NODE_UNREACHABLE = async (): Promise<never> => {
    throw new Error('node unreachable')
  }

  /** Every part the block renders, by its test id, in order, with its text. */
  const partsOf = (kind: string) =>
    Array.from(
      byTestId(`review-blocked-${kind}`)?.querySelectorAll<HTMLElement>('[data-testid]') ?? [],
      (node) => [node.dataset.testid, node.textContent]
    )

  const CASES: BlockedMountCase[] = [
    [
      'a path with an empty slot',
      'empty-slot',
      { clauses: [group(1, ALICE, emptySlot('passkey'))] },
      [
        ['review-blocked-body', t(`${BLOCKED}.emptySlot`)],
        ['review-blocked-editor', t(`${BLOCKED}.emptySlotAction`)]
      ]
    ],
    [
      'a hidden setup with no recovery password',
      'password-missing',
      { passwordSet: false },
      [
        ['review-blocked-body', t(`${BLOCKED}.passwordMissing`)],
        ['review-blocked-privacy', t(`${BLOCKED}.passwordMissingAction`)]
      ]
    ],
    [
      'a read that threw',
      'unavailable',
      { setupState: NODE_UNREACHABLE },
      [
        ['review-blocked-chip', t(`${BLOCKED}.unavailable.chip`)],
        ['review-blocked-title', t(`${BLOCKED}.unavailable.title`)],
        ['review-blocked-body', t(`${BLOCKED}.unavailable.body`)],
        ['review-blocked-retry', t('socialRecovery.writes.tryAgain')]
      ]
    ],
    [
      'a removed key the wallet could not read',
      'removed-key-unreadable',
      { removedKey: NODE_UNREACHABLE },
      [
        ['review-blocked-title', t(`${BLOCKED}.removedKeyUnreadable.title`)],
        ['review-blocked-body', t(`${BLOCKED}.removedKeyUnreadable.body`)],
        ['review-blocked-retry', t('socialRecovery.writes.tryAgain')]
      ]
    ],
    [
      'an account whose code the release does not support',
      'cannot-recover',
      { fitCheck: async () => ({ basis: 'deployed-code', fits: false }) },
      [
        ['review-blocked-chip', t('socialRecovery.status.recovery.cannotRecover')],
        ['review-blocked-title', t(`${BLOCKED}.cannotRecover.title`)],
        ['review-blocked-body', t(`${BLOCKED}.cannotRecover.reasonNotSupported`)]
      ]
    ],
    [
      'an account with two keys holding authority',
      'cannot-recover',
      {
        describeSetup: async () =>
          descriptionOf([
            { key: REMOVED_KEY, isAuthority: true },
            { key: OTHER_KEY, isAuthority: true }
          ])
      },
      [
        ['review-blocked-chip', t('socialRecovery.status.recovery.cannotRecover')],
        ['review-blocked-title', t(`${BLOCKED}.cannotRecover.title`)],
        ['review-blocked-body', t(`${BLOCKED}.cannotRecover.reasonKeyCount`, { count: 2 })]
      ]
    ],
    [
      'an account with several key entries it cannot count',
      'cannot-recover',
      {
        removedKey: async () => ({ kind: 'unavailable', cause: 'several-key-entries' }),
        describeSetup: NODE_UNREACHABLE
      },
      [
        ['review-blocked-chip', t('socialRecovery.status.recovery.cannotRecover')],
        ['review-blocked-title', t(`${BLOCKED}.cannotRecover.title`)],
        ['review-blocked-body', t(`${BLOCKED}.cannotRecover.reasonSeveralKeys`)]
      ]
    ],
    [
      'an account that already has a setup',
      'already-set-up',
      { setupState: async () => setupStateOf(true) },
      [
        ['review-blocked-chip', t(`${BLOCKED}.alreadySetUp.chip`)],
        ['review-blocked-title', t(`${BLOCKED}.alreadySetUp.title`)],
        ['review-blocked-body', t(`${BLOCKED}.alreadySetUp.body`)],
        ['review-blocked-open', t(`${BLOCKED}.alreadySetUp.open`)]
      ]
    ]
  ]
  CASES.forEach(([name, kind, options, parts]) => {
    it(`renders its chip, title, body and action, in that order, for ${name}`, async () => {
      await mount(options)

      expect(byTestId(`review-blocked-${kind}`)).not.toBeNull()
      expect(partsOf(kind)).toEqual(parts)
      expect(isDisabled('review-save')).toBe(true)
    })
  })
})

describe('an untested method', () => {
  it('warns beside an enabled Save', async () => {
    await mount({ clauses: [required(ALICE)], enrollments: [enrolled(ALICE, 'not-tested')] })

    const warning = textOf('review-not-tested')
    expect(warning).toContain(t('socialRecovery.status.method.notTested'))
    expect(warning).toContain(t('socialRecovery.review.blocked.notTested.title'))
    expect(warning).toContain(t('socialRecovery.review.blocked.notTested.body'))
    expect(byTestId('review-blocked-chip')).toBeNull()
    expect(isDisabled('review-save')).toBe(false)
  })

  it('does not warn where every method passed its test', async () => {
    await mount({ clauses: [required(ALICE)], enrollments: [enrolled(ALICE)] })

    expect(byTestId('review-not-tested')).toBeNull()
  })

  it('does not warn where the one passkey failed its test, whose row reads the failed outcome', async () => {
    await mount({
      clauses: [required(PASSKEY)],
      enrollments: [enrolled(PASSKEY, 'failed', { cause: 'check-rejected' })]
    })

    expect(textOf('review-row-0-0-chip')).toBe(t('socialRecovery.status.method.testFailed'))
    expect(byTestId('review-not-tested')).toBeNull()
    expect(pageText()).not.toContain(t('socialRecovery.review.blocked.notTested.title'))
    expect(isDisabled('review-save')).toBe(false)
  })

  const RAN: Enrollment['test'][] = ['unavailable', 'not-supported']
  RAN.forEach((test) => {
    it(`does not warn where the one passkey's test reads ${test}`, async () => {
      await mount({ clauses: [required(PASSKEY)], enrollments: [enrolled(PASSKEY, test)] })

      expect(byTestId('review-not-tested')).toBeNull()
      expect(isDisabled('review-save')).toBe(false)
    })
  })

  it('warns where a method of the path has no enrollment', async () => {
    await mount({ clauses: [group(1, ALICE, PASSKEY)], enrollments: [enrolled(ALICE)] })

    expect(textOf('review-not-tested')).toContain(
      t('socialRecovery.review.blocked.notTested.title')
    )
    expect(isDisabled('review-save')).toBe(false)
  })

  it('names the one untested passkey by its label and kind under the singular title', async () => {
    await mount({
      clauses: [required(PASSKEY), group(1, ALICE, BOB)],
      enrollments: [enrolled(PASSKEY, 'not-tested'), enrolled(ALICE), enrolled(BOB)]
    })

    const warning = textOf('review-not-tested') ?? ''
    expect(warning).toContain(t('socialRecovery.review.blocked.notTested.title', { count: 1 }))
    expect(warning).not.toContain(t('socialRecovery.review.blocked.notTested.title', { count: 2 }))
    expect(textOf('review-not-tested-0-0-name')).toBe(PASSKEY.label)
    expect(textOf('review-not-tested-0-0-kind')).toBe(kindNameOf('passkey', t))
    expect(byTestId('review-not-tested-1-0')).toBeNull()
    expect(byTestId('review-not-tested-1-1')).toBeNull()
    expect(isDisabled('review-save')).toBe(false)
  })

  it('names two untested methods with the count in the title, the guardian by its full address', async () => {
    await mount({
      clauses: [required(PASSKEY), group(1, ALICE, BOB)],
      enrollments: [enrolled(PASSKEY, 'not-tested'), enrolled(ALICE)]
    })

    const title = t('socialRecovery.review.blocked.notTested.title', { count: 2 })
    expect(title).toContain('2')
    expect(textOf('review-not-tested')).toContain(title)
    expect(textOf('review-not-tested-0-0-name')).toBe(PASSKEY.label)
    expect(textOf('review-not-tested-1-1-name')).toBe(renderFullAddress(guardianAddress('b2')))
    expect(textOf('review-not-tested-1-1-kind')).toBe(kindNameOf('ecdsa', t))
    expect(byTestId('review-not-tested-1-0')).toBeNull()
    expect(isBefore('review-not-tested-0-0', 'review-not-tested-1-1')).toBe(true)
    expect(isDisabled('review-save')).toBe(false)
  })

  it('names no empty slot as an untested method', async () => {
    await mount({
      clauses: [group(1, ALICE, emptySlot('passkey'))],
      enrollments: [enrolled(ALICE, 'not-tested')]
    })

    expect(textOf('review-not-tested-0-0-name')).toBe(renderFullAddress(guardianAddress('a1')))
    expect(byTestId('review-not-tested-0-1')).toBeNull()
  })

  it('warns where a skipped test stands beside a failed one', async () => {
    await mount({
      clauses: [group(1, ALICE, PASSKEY)],
      enrollments: [
        enrolled(ALICE, 'not-tested'),
        enrolled(PASSKEY, 'failed', { cause: 'check-rejected' })
      ]
    })

    expect(textOf('review-not-tested')).toContain(
      t('socialRecovery.review.blocked.notTested.title')
    )
  })
})

describe('the account reads', () => {
  it('place each answer as it arrives, so a slow read holds back no other', async () => {
    let answerFit: (reading: FitCheckReading) => void = () => {}
    await mount({
      fitCheck: () =>
        new Promise<FitCheckReading>((resolve) => {
          answerFit = resolve
        })
    })

    expect(isDisabled('review-save')).toBe(true)

    await act(async () => answerFit({ basis: 'deployed-code', fits: true }))
    await settle()

    expect(isDisabled('review-save')).toBe(false)
  })

  it('run again on a retry only the read that threw', async () => {
    let answers = 0
    const { account } = await mount({
      setupState: async () => {
        answers += 1
        if (answers === 1) {
          throw new Error('node unreachable')
        }
        return setupStateOf(false)
      }
    })
    expect(byTestId('review-blocked-unavailable')).not.toBeNull()

    await press('review-blocked-retry')

    expect(account.setupState).toHaveBeenCalledTimes(2)
    expect(account.removedKey).toHaveBeenCalledTimes(1)
    expect(account.fitCheck).toHaveBeenCalledTimes(1)
    expect(account.describeSetup).toHaveBeenCalledTimes(1)
    expect(byTestId('review-blocked-unavailable')).toBeNull()
    expect(isDisabled('review-save')).toBe(false)
  })

  it('run again on a retry each read that threw, and none that answered', async () => {
    const failOnce = <T,>(value: T) => {
      let calls = 0
      return async (): Promise<T> => {
        calls += 1
        if (calls === 1) {
          throw new Error('node unreachable')
        }
        return value
      }
    }
    const { account } = await mount({
      fitCheck: failOnce<FitCheckReading>({ basis: 'deployed-code', fits: true }),
      setupState: failOnce(setupStateOf(false))
    })

    await press('review-blocked-retry')

    expect(account.fitCheck).toHaveBeenCalledTimes(2)
    expect(account.setupState).toHaveBeenCalledTimes(2)
    expect(account.removedKey).toHaveBeenCalledTimes(1)
    expect(account.describeSetup).toHaveBeenCalledTimes(1)
    expect(isDisabled('review-save')).toBe(false)
  })
})
