/**
 * @jest-environment jsdom
 *
 * The approval page as a guardian opens it: the lead with the four values in
 * full, verify the details, the states drawn in place of the sign action, the
 * gates of the sign action, the re-read every minute and the decline.
 */
import type { RecoveryAttemptState } from '@web/modules/social-recovery/shared/client'

import {
  ACCOUNT,
  advance,
  clientAccounts,
  CREATED_AT,
  DESCRIPTOR,
  descriptionOf,
  kit,
  linkOf,
  MANAGER,
  mountLive,
  mountPage,
  navigate,
  NEW_KEY,
  PAYEE,
  PAYLOAD,
  readyClient,
  attemptStateOf,
  REMOVED_KEY,
  requestOf,
  resetEdges,
  searchOf,
  setClient,
  settle,
  SUBMITTED,
  t,
  unmountPages,
  VALID_UNTIL,
  WAIT_ENDS_AT
} from '@web/modules/social-recovery/guardian-page/__tests__/harness'

const PAGE = 'socialRecovery.guardianPage'
// A salt of the length the SDK reads, so the link can be described before the client stands.
const DESCRIBABLE_SALT = `0x${'02'.repeat(32)}` as const
const MINUTE = 60_000
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
const dateOf = (ms: number) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
    timeZoneName: 'short'
  }).format(new Date(ms))

beforeEach(resetEdges)
afterEach(() => {
  unmountPages()
  jest.useRealTimers()
})

describe('the lead of a live request', () => {
  it('renders who asks, the four values in full and the compare line under them', async () => {
    const page = await mountLive()
    expect(page.textOf('guardian-brand')).toBe(t(`${PAGE}.brand`))
    expect(page.textOf('guardian-lead-title')).toBe(t(`${PAGE}.lead.title`))
    expect(page.textOf('guardian-value-accountBeingRecovered')).toBe(ACCOUNT)
    expect(page.textOf('guardian-value-newKey')).toBe(NEW_KEY)
    expect(page.textOf('guardian-value-keyBeingRemoved')).toBe(REMOVED_KEY)
    expect(page.textOf('guardian-value-payment')).toBe(t('socialRecovery.display.values.noPayment'))
    expect(page.textOf('guardian-lead-compare')).toBe(t(`${PAGE}.lead.compare`))
    expect(page.has('guardian-lead-submittable')).toBe(false)
    // Anyone holding the request can submit it: said once, under the deadline it depends on.
    expect(page.text().split(t('socialRecovery.checklist.submittable'))).toHaveLength(2)
    expect(page.textOf('guardian-signing-values-submittable')).toBe(
      t('socialRecovery.checklist.submittable')
    )
    page.unmount()
  })

  it('draws what approving does and what the wallet shows beside the request, not in its column', async () => {
    const page = await mountLive()
    const aside = page.textOf('guardian-page-columns-aside')
    const main = page.textOf('guardian-page-columns-main')
    expect(page.textOf('guardian-aside-approving')).toContain(t(`${PAGE}.aside.approving`))
    const approving = [
      ['guardian-lead-effect', `${PAGE}.lead.effect`],
      ['guardian-lead-publication', `${PAGE}.lead.publication`],
      ['guardian-lead-path-public', `${PAGE}.lead.pathPublic`],
      ['guardian-lead-no-forward', `${PAGE}.lead.noForward`]
    ]
    expect(page.textOf('guardian-aside-wallet')).toContain(t(`${PAGE}.aside.wallet`))
    const wallet = [
      ['guardian-prompt-note', `${PAGE}.signing.promptNote`],
      ['guardian-hardware-note', `${PAGE}.signing.hardwareNote`]
    ]
    ;[...approving, ...wallet].forEach(([id, key]) => {
      expect({ id, text: page.textOf(id), aside: aside.includes(t(key)) }).toEqual({
        id,
        text: t(key),
        aside: true
      })
      expect(main).not.toContain(t(key))
    })
    page.unmount()
  })

  it('keeps what approving does beside a dead request, without what the wallet shows', async () => {
    kit.attemptState.mockImplementation(async () => attemptStateOf({ nextAttemptId: 4n }))
    const page = await mountLive()
    expect(page.textOf('guardian-page-columns-aside')).toContain(t(`${PAGE}.lead.effect`))
    expect(page.has('guardian-aside-wallet')).toBe(false)
    page.unmount()
  })

  it('draws no line that the page shows what its link says', async () => {
    const page = await mountLive()
    expect(page.has('guardian-notice')).toBe(false)
    page.unmount()
  })

  it('renders the new key whole, never shortened and never as a hash', async () => {
    const page = await mountLive()
    const shown = page.textOf('guardian-value-newKey')
    expect(shown).toBe(NEW_KEY)
    expect(shown).toHaveLength(42)
    expect(shown).not.toContain('…')
    page.unmount()
  })

  it('opens verify the details on the numbers, the network and the registry, with no deadline', async () => {
    const page = await mountLive()
    expect(page.has('guardian-details-rows')).toBe(false)
    await page.press('guardian-verify-details')
    expect(page.has('guardian-details-deadline')).toBe(false)
    expect(page.textOf('guardian-details-rows')).not.toContain(dateOf(VALID_UNTIL * 1000))
    expect(page.textOf('guardian-details-setup-number')).toBe('2')
    expect(page.textOf('guardian-details-attempt-number')).toBe('3')
    expect(page.textOf('guardian-details-network')).toBe('Sepolia')
    expect(page.textOf('guardian-details-registry')).toBe(MANAGER)
    page.unmount()
  })

  it('renders the handover as not readable where the orchestrator could not decode it', async () => {
    kit.describeRequest.mockImplementation((request) =>
      descriptionOf(request, { handover: { decoded: false, cause: 'no-codec' } })
    )
    const page = await mountLive()
    expect(page.has('guardian-value-newKey')).toBe(false)
    expect(page.textOf('guardian-value-newKey-unreadable')).toBe(t(`${PAGE}.notReadable`))
    expect(page.textOf('guardian-value-keyBeingRemoved-unreadable')).toBe(t(`${PAGE}.notReadable`))
    await page.press('guardian-acknowledge')
    expect(page.isDisabled('guardian-sign')).toBe(true)
    page.unmount()
  })

  it('renders a payment with an amount as not readable and keeps the sign action disabled', async () => {
    kit.describeRequest.mockImplementation((request) =>
      descriptionOf(request, { order: { token: PAYEE, amount: 5_000_000n, payee: PAYEE } })
    )
    const page = await mountLive()
    expect(page.has('guardian-value-payment')).toBe(false)
    expect(page.textOf('guardian-value-payment-unreadable')).toBe(t(`${PAGE}.notReadable`))
    expect(page.textOf('guardian-value-newKey')).toBe(NEW_KEY)
    await page.press('guardian-acknowledge')
    expect(page.isDisabled('guardian-sign')).toBe(true)
    page.unmount()
  })
})

describe('the sign action', () => {
  it('stays disabled with the line asking for the tick until the box is ticked', async () => {
    const page = await mountLive()
    expect(page.isDisabled('guardian-sign')).toBe(true)
    expect(page.textOf('guardian-tick-first')).toBe(t(`${PAGE}.acknowledgment.tickFirst`))
    expect(page.textOf('guardian-acknowledgment')).toContain(t(`${PAGE}.acknowledgment.label`))
    expect(page.textOf('guardian-acknowledgment-call-rule')).toBe(
      t(`${PAGE}.acknowledgment.callRule`)
    )
    await page.press('guardian-acknowledge')
    expect(page.isDisabled('guardian-sign')).toBe(false)
    expect(page.has('guardian-tick-first')).toBe(false)
    page.unmount()
  })

  it('stays disabled with the box ticked while the account does not authorize the action', async () => {
    kit.isAuthorized.mockImplementation(async () => false)
    const page = await mountLive()
    expect(page.textOf('guardian-dormant')).toBe(t(`${PAGE}.dormant`))
    expect(page.textOf('guardian-value-newKey')).toBe(NEW_KEY)
    await page.press('guardian-acknowledge')
    expect(page.isDisabled('guardian-sign')).toBe(true)
    page.unmount()
  })

  it('turns disabled once a later read fails, and draws the failed read', async () => {
    const page = await mountLive()
    await page.press('guardian-acknowledge')
    expect(page.isDisabled('guardian-sign')).toBe(false)
    kit.attemptState.mockImplementation(async () => {
      throw new Error('rpc down')
    })
    await advance(MINUTE)
    expect(page.has('guardian-read-failed')).toBe(true)
    expect(page.isDisabled('guardian-sign')).toBe(true)
    page.unmount()
  })

  it('keeps the last reading beside the refreshing line, sign held, while a later read runs, and opens once it answers', async () => {
    const page = await mountLive()
    await page.press('guardian-acknowledge')
    expect(page.has('guardian-refreshing')).toBe(false)
    let answer: () => void = () => undefined
    kit.attemptState.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = () => resolve(attemptStateOf())
        })
    )
    await advance(MINUTE)
    expect(page.textOf('guardian-refreshing')).toBe(t('socialRecovery.loading.refreshingAttempt'))
    expect(page.hasWithin('guardian-refreshing', 'loading-row')).toBe(true)
    expect(page.textOf('guardian-value-newKey')).toBe(NEW_KEY)
    expect(page.isDisabled('guardian-sign')).toBe(true)
    answer()
    await advance(0)
    expect(page.has('guardian-refreshing')).toBe(false)
    expect(page.isDisabled('guardian-sign')).toBe(false)
    page.unmount()
  })

  it('keeps the values and the tick through a failed re-read, and opens again once a read answers', async () => {
    const page = await mountLive()
    await page.press('guardian-acknowledge')
    kit.attemptState.mockImplementation(async () => {
      throw new Error('rpc down')
    })
    await advance(MINUTE)
    expect(page.has('guardian-read-failed')).toBe(true)
    expect(page.textOf('guardian-value-newKey')).toBe(NEW_KEY)
    expect(page.has('guardian-acknowledge')).toBe(false)
    kit.attemptState.mockImplementation(async () => attemptStateOf())
    await page.press('guardian-read-retry')
    expect(page.has('guardian-read-failed')).toBe(false)
    expect(page.has('guardian-tick-first')).toBe(false)
    expect(page.isDisabled('guardian-sign')).toBe(false)
    page.unmount()
  })
  it('drops the tick when another request for the same account opens in the same tab', async () => {
    const otherKey = '0x5000000000000000000000000000000000000042'
    kit.describeRequest.mockImplementation((request) =>
      'payload' in request && request.payload === PAYLOAD
        ? descriptionOf(request)
        : descriptionOf(request, {
            handover: { decoded: true, newAuthority: otherKey, removedAuthority: REMOVED_KEY }
          })
    )
    const page = await mountLive()
    await page.press('guardian-acknowledge')
    expect(page.isDisabled('guardian-sign')).toBe(false)
    expect(kit.attemptState).toHaveBeenCalledTimes(1)
    await navigate(searchOf(linkOf(requestOf({ payload: '0x123456', salt: '0x03' }))))
    expect(kit.attemptState).toHaveBeenCalledTimes(2)
    expect(kit.isAuthorized).toHaveBeenCalledTimes(2)
    expect(page.textOf('guardian-value-newKey')).toBe(otherKey)
    expect(page.has('guardian-tick-first')).toBe(true)
    expect(page.isDisabled('guardian-sign')).toBe(true)
    await page.press('guardian-acknowledge')
    expect(page.isDisabled('guardian-sign')).toBe(false)
    page.unmount()
  })
})

describe('the step counter', () => {
  const stepOf = (step: number) => t(`${PAGE}.stageCounter`, { step, total: 3 })

  it('reads the first step while the box is not ticked and the second once it is', async () => {
    const page = await mountLive()
    expect(page.textOf('guardian-stage-counter')).toBe(stepOf(1))
    expect(page.textOf('guardian-signing-title')).toBe(t(`${PAGE}.signing.title`))
    await page.press('guardian-acknowledge')
    expect(page.textOf('guardian-stage-counter')).toBe(stepOf(2))
    expect(page.textOf('guardian-signing-title')).toBe(t(`${PAGE}.signing.titleReady`))
    await page.press('guardian-acknowledge')
    expect(page.textOf('guardian-stage-counter')).toBe(stepOf(1))
    expect(page.textOf('guardian-signing-title')).toBe(t(`${PAGE}.signing.title`))
    page.unmount()
  })

  it('reads the second step in the offline block, ticked or not', async () => {
    const page = await mountLive()
    await page.press('guardian-offline-open')
    expect(page.textOf('guardian-stage-counter')).toBe(stepOf(2))
    page.unmount()
  })

  it('draws none while the request is read, after a failed read, or once it died', async () => {
    kit.attemptState.mockImplementation(() => new Promise(() => {}))
    const reading = await mountLive()
    expect(reading.has('guardian-reading')).toBe(true)
    expect(reading.has('guardian-stage-counter')).toBe(false)
    reading.unmount()
    kit.attemptState.mockImplementation(async () => {
      throw new Error('rpc down')
    })
    const failed = await mountLive()
    expect(failed.has('guardian-read-failed')).toBe(true)
    expect(failed.has('guardian-stage-counter')).toBe(false)
    failed.unmount()
    kit.attemptState.mockImplementation(async () => attemptStateOf({ nextAttemptId: 4n }))
    const dead = await mountLive()
    expect(dead.has('guardian-dead-void')).toBe(true)
    expect(dead.has('guardian-stage-counter')).toBe(false)
    dead.unmount()
  })

  it('draws none on a link that carries no request', async () => {
    const page = await mountPage('?request=broken')
    expect(page.has('guardian-no-request-columns')).toBe(true)
    expect(page.has('guardian-stage-counter')).toBe(false)
    page.unmount()
  })
})

describe('the states in place of the sign action', () => {
  const deaths = [
    {
      name: 'void',
      state: () => attemptStateOf({ nextAttemptId: 4n }),
      title: `${PAGE}.dead.voidTitle`,
      body: `${PAGE}.dead.voidBody`
    },
    {
      name: 'setup-changed',
      state: () => attemptStateOf({ setupNonce: 3n }),
      title: `${PAGE}.dead.changedTitle`,
      body: `${PAGE}.dead.changedBody`
    }
  ]
  deaths.forEach(({ name, state, title, body }) =>
    it(`draws ${name} with its lines, the line to tell the owner and close`, async () => {
      kit.attemptState.mockImplementation(async () => state())
      const page = await mountLive()
      expect(page.has(`guardian-dead-${name}`)).toBe(true)
      expect(page.textOf('guardian-dead-title')).toBe(t(title))
      expect(page.textOf('guardian-dead-body')).toBe(t(body))
      expect(page.textOf('guardian-tell-owner')).toBe(t(`${PAGE}.dead.tellOwner`))
      expect(page.has('guardian-sign')).toBe(false)
      expect(page.textOf('guardian-value-newKey')).toBe(NEW_KEY)
      page.unmount()
    })
  )

  it('draws the request the recoverer submitted as used once its recovery ended, never as void', async () => {
    const ended = ['Cancelled', 'Consumed'] as const
    // eslint-disable-next-line no-restricted-syntax
    for (const state of ended) {
      kit.attemptState.mockImplementation(async () =>
        attemptStateOf({ attempt: { ...SUBMITTED, state }, nextAttemptId: 4n, setupNonce: 3n })
      )
      // eslint-disable-next-line no-await-in-loop
      const page = await mountLive()
      expect({ state, used: page.has('guardian-dead-used') }).toEqual({ state, used: true })
      expect(page.textOf('guardian-dead-title')).toBe(t(`${PAGE}.dead.usedTitle`))
      expect(page.textOf('guardian-dead-body')).toBe(t(`${PAGE}.dead.usedBody`))
      expect(page.textOf('guardian-tell-owner')).toBe(t(`${PAGE}.dead.tellOwner`))
      expect(page.has('guardian-close')).toBe(true)
      expect(page.has('guardian-dead-void')).toBe(false)
      expect(page.has('guardian-sign')).toBe(false)
      page.unmount()
    }
  })

  it('draws expired once the deadline passes on the open page', async () => {
    const page = await mountLive(requestOf({ validUntil: String(CREATED_AT + 90) }))
    expect(page.has('guardian-sign')).toBe(true)
    await advance(MINUTE)
    expect(page.has('guardian-sign')).toBe(true)
    await advance(31_000)
    expect(page.has('guardian-dead-expired')).toBe(true)
    expect(page.textOf('guardian-dead-title')).toBe(t(`${PAGE}.dead.expiredTitle`))
    expect(page.textOf('guardian-dead-body')).toBe(t(`${PAGE}.dead.expiredBody`))
    expect(page.has('guardian-sign')).toBe(false)
    page.unmount()
  })

  it('draws a submitted request as waiting until its end, with the dormant line where it applies', async () => {
    kit.attemptState.mockImplementation(async () =>
      attemptStateOf({ attempt: SUBMITTED, nextAttemptId: 4n })
    )
    kit.isAuthorized.mockImplementation(async () => false)
    const page = await mountLive()
    expect(page.textOf('guardian-waiting-title')).toBe(t(`${PAGE}.waiting.title`))
    expect(page.textOf('guardian-waiting-headline')).toBe(t(`${PAGE}.waiting.headline`))
    expect(page.textOf('guardian-waiting-body')).toBe(
      t(`${PAGE}.waiting.body`, { date: dateOf(WAIT_ENDS_AT * 1000) })
    )
    expect(page.textOf('guardian-dormant')).toBe(t(`${PAGE}.dormant`))
    expect(page.textOf('guardian-tell-owner')).toBe(t(`${PAGE}.dead.tellOwner`))
    expect(page.has('guardian-dead-void')).toBe(false)
    expect(page.has('guardian-sign')).toBe(false)
    page.unmount()
  })

  it('draws a submitted request whose waiting period is over with the date it ended', async () => {
    const endedAt = CREATED_AT - 60
    kit.attemptState.mockImplementation(async () =>
      attemptStateOf({ attempt: { ...SUBMITTED, consumableAfter: endedAt }, nextAttemptId: 4n })
    )
    const page = await mountLive()
    expect(page.textOf('guardian-waiting-headline')).toBe(t(`${PAGE}.waiting.headline`))
    expect(page.textOf('guardian-waiting-body')).toBe(
      t(`${PAGE}.waiting.bodyEnded`, { date: dateOf(endedAt * 1000) })
    )
    expect(page.has('guardian-sign')).toBe(false)
    page.unmount()
  })

  it('draws the reading state in place of the sign action, below the link values, with sign disabled', async () => {
    kit.attemptState.mockImplementation(() => new Promise(() => {}))
    const page = await mountLive()
    expect(page.textOf('guardian-reading')).toBe(t(`${PAGE}.reading`))
    expect(page.has('guardian-lead')).toBe(true)
    expect(page.textOf('guardian-value-newKey')).toBe(NEW_KEY)
    expect(page.has('guardian-details')).toBe(true)
    expect(page.has('guardian-acknowledge')).toBe(false)
    expect(page.isDisabled('guardian-sign')).toBe(true)
    expect(page.has('guardian-dead-expired')).toBe(false)
    page.unmount()
  })

  it("draws the link's values beside the reading, sign held, while the client is first built", async () => {
    setClient({ status: 'loading', retry: () => {} })
    const page = await mountLive(requestOf({ salt: DESCRIBABLE_SALT }))
    expect(page.has('guardian-lead')).toBe(true)
    expect(page.textOf('guardian-value-accountBeingRecovered')).toBe(ACCOUNT)
    expect(page.has('guardian-details')).toBe(true)
    expect(page.has('guardian-reading')).toBe(true)
    expect(page.isDisabled('guardian-sign')).toBe(true)
    expect(page.has('guardian-request-loading')).toBe(false)

    setClient(readyClient())
    expect(page.textOf('guardian-value-newKey')).toBe(NEW_KEY)
    expect(page.isDisabled('guardian-sign')).toBe(true)
    page.unmount()
  })

  it('draws a centred waiting block that opens the request where the link cannot be described before the client stands', async () => {
    const clientLayer = jest.requireMock<
      typeof import('@web/modules/social-recovery/shared/client')
    >('@web/modules/social-recovery/shared/client')
    const describe = jest.spyOn(clientLayer, 'describeRequestOffline').mockImplementation(() => {
      throw new Error('unknown version')
    })
    setClient({ status: 'loading', retry: () => {} })
    const page = await mountLive()
    expect(page.textOf('guardian-request-loading')).toBe(t('socialRecovery.loading.request'))
    expect(page.hasWithin('guardian-request-loading', 'loading-screen')).toBe(true)
    expect(page.has('guardian-status-columns')).toBe(false)
    expect(page.has('guardian-lead')).toBe(false)

    setClient(readyClient())
    expect(page.has('guardian-request-loading')).toBe(false)
    expect(page.textOf('guardian-value-newKey')).toBe(NEW_KEY)
    describe.mockRestore()
    page.unmount()
  })

  it('keeps the link values while the client is built again', async () => {
    const page = await mountLive()
    setClient({ status: 'loading', retry: () => {} })
    expect(page.has('guardian-reading')).toBe(true)
    expect(page.textOf('guardian-value-newKey')).toBe(NEW_KEY)
    expect(page.isDisabled('guardian-sign')).toBe(true)
    page.unmount()
  })

  it('draws a failed read with a retry below the link values, never a death', async () => {
    kit.isAuthorized.mockImplementation(async () => {
      throw new Error('rpc down')
    })
    const page = await mountLive(requestOf({ validUntil: String(CREATED_AT - 1) }))
    expect(page.textOf('guardian-read-failed')).toContain(t(`${PAGE}.readFailed`))
    expect(page.textOf('guardian-read-retry')).toBe(t(`${PAGE}.actions.tryAgain`))
    expect(page.isDisabled('guardian-sign')).toBe(true)
    expect(page.has('guardian-dead-expired')).toBe(false)
    expect(page.has('guardian-lead')).toBe(true)
    expect(page.textOf('guardian-value-accountBeingRecovered')).toBe(ACCOUNT)
    expect(page.has('guardian-acknowledge')).toBe(false)
    kit.isAuthorized.mockImplementation(async () => true)
    await page.press('guardian-read-retry')
    expect(page.has('guardian-read-failed')).toBe(false)
    expect(page.has('guardian-dead-expired')).toBe(true)
    page.unmount()
  })

  it('draws a read that ran past its limit as failed', async () => {
    kit.attemptState.mockImplementation(() => new Promise(() => {}))
    const page = await mountLive()
    expect(page.has('guardian-reading')).toBe(true)
    expect(page.textOf('guardian-reading')).toBe(t(`${PAGE}.reading`))
    await advance(15_000)
    expect(page.has('guardian-read-failed')).toBe(true)
    page.unmount()
  })

  it('draws a client that failed as a failed read, whose retry builds it again', async () => {
    const retry = jest.fn()
    setClient({ status: 'failed', error: new Error('rpc down'), retry })
    const page = await mountLive()
    expect(page.textOf('guardian-read-failed')).toContain(t(`${PAGE}.readFailed`))
    expect(page.isDisabled('guardian-sign')).toBe(true)
    await page.press('guardian-read-retry')
    expect(retry).toHaveBeenCalledTimes(1)
    page.unmount()
  })

  it('draws a client refused for the digest version the manager publishes as another deployment, with no retry', async () => {
    setClient({ status: 'update-the-wallet', refusal: {} as never, retry: () => {} })
    const page = await mountLive()
    expect(page.textOf('guardian-other-deployment')).toContain(t(`${PAGE}.otherDeployment`))
    expect(page.has('guardian-read-failed')).toBe(false)
    expect(page.has('guardian-read-retry')).toBe(false)
    expect(page.has('guardian-lead')).toBe(false)
    expect(page.isDisabled('guardian-sign')).toBe(true)
    page.unmount()
  })

  it("draws the link's values above the failed read, sign held, where the client failed before it stood", async () => {
    const retry = jest.fn()
    setClient({ status: 'failed', error: new Error('rpc down'), retry })
    const page = await mountLive(requestOf({ salt: DESCRIBABLE_SALT }))
    expect(page.has('guardian-lead')).toBe(true)
    expect(page.textOf('guardian-value-accountBeingRecovered')).toBe(ACCOUNT)
    expect(page.has('guardian-details')).toBe(true)
    expect(page.textOf('guardian-read-failed')).toContain(t(`${PAGE}.readFailed`))
    expect(page.has('guardian-acknowledge')).toBe(false)
    expect(page.isDisabled('guardian-sign')).toBe(true)
    expect(page.has('guardian-request-loading')).toBe(false)
    await page.press('guardian-read-retry')
    expect(retry).toHaveBeenCalledTimes(1)
    page.unmount()
  })

  it('draws a refused client as another deployment, with no values and sign held, even where the link can be described', async () => {
    setClient({ status: 'update-the-wallet', refusal: {} as never, retry: () => {} })
    const page = await mountLive(requestOf({ salt: DESCRIBABLE_SALT }))
    expect(page.textOf('guardian-other-deployment')).toContain(t(`${PAGE}.otherDeployment`))
    expect(page.has('guardian-lead')).toBe(false)
    expect(page.has('guardian-value-accountBeingRecovered')).toBe(false)
    expect(page.has('guardian-read-retry')).toBe(false)
    expect(page.isDisabled('guardian-sign')).toBe(true)
    expect(page.has('guardian-request-loading')).toBe(false)
    page.unmount()
  })

  it('refuses a request aimed at another deployment with no retry and no read', async () => {
    const page = await mountLive(requestOf({ digestVersion: '9' }))
    expect(page.textOf('guardian-other-deployment')).toContain(t(`${PAGE}.otherDeployment`))
    expect(page.has('guardian-read-retry')).toBe(false)
    expect(page.isDisabled('guardian-sign')).toBe(true)
    expect(clientAccounts().every((account) => account === undefined)).toBe(true)
    expect(kit.attemptState).not.toHaveBeenCalled()
    page.unmount()
  })

  it('refuses a request the built client names another deployment for', async () => {
    setClient(readyClient({ ...DESCRIPTOR, digestVersion: '9' }))
    const page = await mountLive()
    expect(page.has('guardian-other-deployment')).toBe(true)
    expect(page.has('guardian-lead')).toBe(false)
    page.unmount()
  })

  it('renders only the no-request line for a link that carries none', async () => {
    const page = await mountPage('?request=broken')
    expect(page.textOf('guardian-no-request')).toBe(t(`${PAGE}.noRequest`))
    expect(page.has('guardian-sign')).toBe(false)
    expect(kit.attemptState).not.toHaveBeenCalled()
    page.unmount()
  })

  it('reads the request from the window hash where the router hands no search', async () => {
    window.location.hash = new URL(linkOf(requestOf())).hash
    const page = await mountPage('')
    expect(page.textOf('guardian-value-newKey')).toBe(NEW_KEY)
    page.unmount()
  })
})

describe('the re-read', () => {
  it('reads the chain when the page opens and once every minute', async () => {
    const page = await mountLive()
    expect(kit.attemptState).toHaveBeenCalledTimes(1)
    expect(kit.isAuthorized).toHaveBeenCalledTimes(1)
    await advance(MINUTE - 1)
    expect(kit.attemptState).toHaveBeenCalledTimes(1)
    await advance(1)
    expect(kit.attemptState).toHaveBeenCalledTimes(2)
    expect(kit.isAuthorized).toHaveBeenCalledTimes(2)
    kit.attemptState.mockImplementation(async () => attemptStateOf({ setupNonce: 3n }))
    await advance(MINUTE)
    expect(page.has('guardian-dead-setup-changed')).toBe(true)
    page.unmount()
  })

  it('answers its rounds without the removed key, while that read would fail', async () => {
    const page = await mountLive()
    await advance(MINUTE)
    await advance(MINUTE)
    expect(kit.attemptState).toHaveBeenCalledTimes(3)
    expect(kit.recoveryState).not.toHaveBeenCalled()
    expect(kit.removedKey).not.toHaveBeenCalled()
    expect(page.has('guardian-sign-block')).toBe(true)
    expect(page.has('guardian-read-failed')).toBe(false)
    page.unmount()
  })

  it("drops a round of an earlier client that answers after the newer client's round", async () => {
    let answerLate: (state: RecoveryAttemptState) => void = () => {}
    kit.attemptState.mockImplementationOnce(
      () =>
        new Promise<RecoveryAttemptState>((resolve) => {
          answerLate = resolve
        })
    )
    const page = await mountLive()
    expect(page.has('guardian-reading')).toBe(true)
    setClient(readyClient())
    await settle()
    expect(kit.attemptState).toHaveBeenCalledTimes(2)
    expect(page.has('guardian-sign-block')).toBe(true)
    answerLate(attemptStateOf({ setupNonce: 3n }))
    await settle()
    expect(page.has('guardian-dead-setup-changed')).toBe(false)
    expect(page.has('guardian-sign-block')).toBe(true)
    page.unmount()
  })

  it("drops a round of an earlier link that answers after the new link's round", async () => {
    let answerLate: (state: RecoveryAttemptState) => void = () => {}
    kit.attemptState.mockImplementationOnce(
      () =>
        new Promise<RecoveryAttemptState>((resolve) => {
          answerLate = resolve
        })
    )
    const page = await mountLive()
    expect(page.has('guardian-reading')).toBe(true)
    await navigate(searchOf(linkOf(requestOf({ salt: '0x03' }))))
    expect(kit.attemptState).toHaveBeenCalledTimes(2)
    expect(page.has('guardian-sign-block')).toBe(true)
    answerLate(attemptStateOf({ setupNonce: 3n }))
    await settle()
    expect(page.has('guardian-dead-setup-changed')).toBe(false)
    expect(page.has('guardian-sign-block')).toBe(true)
    page.unmount()
  })

  it('stops reading once the guardian declines', async () => {
    const page = await mountLive()
    await page.press('guardian-decline')
    await advance(3 * MINUTE)
    expect(kit.attemptState).toHaveBeenCalledTimes(1)
    page.unmount()
  })
})

describe('the decline', () => {
  it('draws the declined page with every line, and close closes the tab', async () => {
    const close = jest.spyOn(window, 'close').mockImplementation(() => {})
    const page = await mountLive()
    await page.press('guardian-decline')
    expect(page.has('guardian-lead')).toBe(false)
    expect(page.textOf('guardian-declined-title')).toBe(t(`${PAGE}.declined.title`))
    expect(page.textOf('guardian-declined-headline')).toBe(t(`${PAGE}.declined.headline`))
    expect(page.textOf('guardian-declined-body')).toBe(t(`${PAGE}.declined.body`))
    const text = page.text()
    const keys = [
      'tellTitle',
      'tellBody',
      'cancelLine',
      'copyMessage',
      'close',
      'publishesTitle',
      'stillPublishes'
    ]
    keys.forEach((key) => {
      expect({ key, shown: text.includes(t(`${PAGE}.declined.${key}`)) }).toEqual({
        key,
        shown: true
      })
    })
    const aside = page.textOf('guardian-declined-columns-aside')
    expect(aside).toContain(t(`${PAGE}.declined.stillPublishes`))
    expect(aside).not.toContain(t(`${PAGE}.declined.tellTitle`))
    expect(page.textOf('guardian-declined-columns-main')).toContain(t(`${PAGE}.declined.tellTitle`))
    expect(page.has('guardian-stage-counter')).toBe(false)
    await page.press('guardian-declined-close')
    expect(close).toHaveBeenCalledTimes(1)
    close.mockRestore()
    page.unmount()
  })

  it('leaves another link opened in the same tab undeclined, and reads it', async () => {
    const page = await mountLive()
    await page.press('guardian-decline')
    expect(page.has('guardian-declined-title')).toBe(true)
    await navigate(searchOf(linkOf(requestOf({ salt: '0x03' }))))
    expect(page.has('guardian-declined-title')).toBe(false)
    expect(page.textOf('guardian-value-newKey')).toBe(NEW_KEY)
    expect(kit.attemptState).toHaveBeenCalledTimes(2)
    expect(kit.isAuthorized).toHaveBeenCalledTimes(2)
    await page.press('guardian-acknowledge')
    expect(page.isDisabled('guardian-sign')).toBe(false)
    await advance(MINUTE)
    expect(kit.attemptState).toHaveBeenCalledTimes(3)
    page.unmount()
  })

  it('closes the tab from a death', async () => {
    const close = jest.spyOn(window, 'close').mockImplementation(() => {})
    kit.attemptState.mockImplementation(async () => attemptStateOf({ nextAttemptId: 4n }))
    const page = await mountLive()
    await page.press('guardian-close')
    expect(close).toHaveBeenCalledTimes(1)
    close.mockRestore()
    await settle()
    page.unmount()
  })
})
