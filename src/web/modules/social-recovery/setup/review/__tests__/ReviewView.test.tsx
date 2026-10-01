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
import type { Address, Clause } from '@web/modules/social-recovery/sdk-interfaces'
import type { Enrollment, RecordStorage } from '@web/modules/social-recovery/shared/records'

import type { MountOptions, Root } from '../__fixtures__/review'
import type { ReviewClient, ReviewKitClient } from '../types'

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
const { renderFullAddress } = jest.requireActual<
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
const ReviewView = jest.requireActual<typeof import('../ReviewView')>('../ReviewView').default
const fixtures =
  jest.requireActual<typeof import('../__fixtures__/review')>('../__fixtures__/review')
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
  UNANSWERED
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
const isDisabled = (id: string) => byTestId(id)?.getAttribute('aria-disabled') === 'true'

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
  wait = 172800n,
  backup = 'encrypted',
  publicMetadata = '0x',
  passwordSet = true,
  client,
  trustedParties = async () => declaration(),
  moduleInfo = async () => info(),
  providerKind,
  accountLabel,
  storageRefuses = false
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
  const shown = storageRefuses ? createWalletRecords({ storage: makeStorage(true) }) : records

  const reads = {
    trustedParties: jest.fn(trustedParties),
    moduleInfo: jest.fn(moduleInfo),
    paused: jest.fn(async () => ({ answered: true as const, value: false }))
  }
  const kit: ReviewKitClient = {
    chain: 'sepolia',
    descriptor: deploymentDescriptor('sepolia'),
    moduleReads: reads
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
  await act(async () => {
    root.render(
      <ThemeContext.Provider value={THEME_CONTEXT}>
        <ReviewView
          records={shown}
          chainId={CHAIN_ID}
          account={ACCOUNT}
          client={reviewClient}
          providerKind={providerKind}
          accountLabel={accountLabel}
          navigate={navigate}
        />
      </ThemeContext.Provider>
    )
  })
  await settle()
  return { reads, navigate, retry }
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

describe('save and the trust list reads', () => {
  it('stays disabled while a read has not come back', async () => {
    await mount({ moduleInfo: () => new Promise(() => {}) })

    expect(isDisabled('review-save')).toBe(true)
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
})

describe('the path rows', () => {
  const CEREMONY = 'socialRecovery.ceremony'

  const VERDICTS: [Enrollment['test'], string | undefined, string, string | null][] = [
    ['passed', undefined, 'tested', null],
    ['not-tested', undefined, 'notTested', `${CEREMONY}.notTestedLine`],
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

  const FAILED_LINES: [Enrollment['credential'], string | undefined, string][] = [
    [ALICE, 'check-rejected', `${CEREMONY}.testFailedNoMatch`],
    [ALICE, 'check-rejected: signer mismatch', `${CEREMONY}.testFailedNoMatch`],
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

  const UNFAILED_LINES: [Enrollment['test'], string[]][] = [
    ['passed', []],
    ['not-tested', [t(`${CEREMONY}.notTestedLine`)]]
  ]
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
      t(`${CEREMONY}.notTestedLine`),
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

  it('renders the rule lines of a two-of-three group', async () => {
    const clauses = [group(2, ALICE, BOB, PASSKEY)]
    await mount({ clauses })

    const lines = textsStartingWith('review-rule-line-')
    expect(lines).toEqual(ruleLinesFor(clauses))
    expect(lines.length).toBeGreaterThan(0)
  })

  it('renders the rule lines of a single row', async () => {
    const clauses = [required(PASSKEY)]
    await mount({ clauses })

    const lines = textsStartingWith('review-rule-line-')
    expect(lines).toEqual(ruleLinesFor(clauses))
    expect(lines.length).toBeGreaterThan(0)
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
    await mount({ wait: 604800n })

    expect(textOf('review-wait')).toBe(t('socialRecovery.privacy.waitingPeriod.chips.days7'))
    expect(textOf('review-spare-key')).toBe(t('socialRecovery.review.spareKey'))
  })

  it('carries the publication line once with its second sentence and the save cost', async () => {
    await mount({ clauses: [required(ALICE)] })

    expect(textsStartingWith('review-publication')).toEqual([
      t('socialRecovery.review.publication.lead'),
      t('socialRecovery.review.publication.guardian')
    ])
    expect(textOf('review-save-cost')).toBe(t('socialRecovery.costLines.save'))
    expect(pageText()).toContain(t('socialRecovery.costLines.recovery'))
  })

  it('reads Private with the recovery password set', async () => {
    await mount({ backup: 'encrypted', passwordSet: true })

    expect(textsStartingWith('review-privacy-')).toEqual([t('socialRecovery.review.privateSet')])
  })

  it('reads the Shape visible label and the line carrying the shape of a stored shape-visible draft', async () => {
    const clauses = [group(2, PASSKEY, PASSPORT, ALICE)]
    const shape = 'socialRecovery.shape.sentence'
    await mount({
      clauses,
      enrollments: [enrolled(PASSKEY)],
      publicMetadata: shapeNoteOf({ clauses, wait: 172800n, ignoresPause: true })
    })

    expect(textsStartingWith('review-privacy-')).toEqual([
      t('socialRecovery.privacy.level.shapeVisible.label'),
      t('socialRecovery.privacy.level.shapeVisible.line', {
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

  it('names the recovery module with its publisher from the wallet table, and a light client node', async () => {
    await mount({ providerKind: 'helios' })
    await press('review-verify-details')

    const action = auditedActionOf(deploymentDescriptor('sepolia').action, 'sepolia')
    if (action.kind !== 'audited') {
      throw new Error('the shipped action is not in the wallet table')
    }
    expect(textOf('review-trust-module')).toContain(
      t('socialRecovery.review.trust.moduleRow', { publisher: t(publisherKeyOf(action)) })
    )
    expect(textOf('review-trust-node')).toBe(t('socialRecovery.review.trust.nodeLightClient'))
  })

  it('names a plain node where the network has no provider kind', async () => {
    await mount()
    await press('review-verify-details')

    expect(textOf('review-trust-node')).toBe(t('socialRecovery.review.trust.nodePlain'))
  })
})

describe('the account block', () => {
  it('names the account in full with its check line', async () => {
    await mount()

    expect(textOf('review-account-address')).toBe(renderFullAddress(ACCOUNT))
    expect(textOf('review-account-check')).toBe(t('socialRecovery.review.account.check'))
    expect(byTestId('review-account-caveat')).toBeNull()
  })

  it('carries the name caveat beside the label the wallet holds', async () => {
    await mount({ accountLabel: 'Account 1' })

    expect(textOf('review-account-label')).toBe('Account 1')
    expect(textOf('review-account-caveat')).toBe(t('socialRecovery.display.nameCaveat'))
  })
})

describe('what the review cannot read', () => {
  it('reads that the draft could not be read, with no Save', async () => {
    await mount({ storageRefuses: true })

    expect(textOf('review-load-failed')).toBe(t('socialRecovery.records.loadFailed'))
    expect(byTestId('review-save')).toBeNull()
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

  it('keeps Save disabled while the client loads', async () => {
    await mount({ client: 'loading' })

    expect(isDisabled('review-save')).toBe(true)
  })
})
