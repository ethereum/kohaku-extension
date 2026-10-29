/**
 * The approval page's pure parts: the request its link carries, what the
 * page reads of the request from the chain reads and its clock, the four
 * values and the deadline, and the gates of the sign action.
 */
import { getAddress, keccak256, zeroAddress } from 'viem'

import i18n from '@common/config/localization'
import { walletMethod } from '@kohaku-eth/social-recovery'
import type { ApproverRequest, Attempt, RequestDescription } from '@kohaku-eth/social-recovery'
import type { PollFacts } from '@web/modules/social-recovery/recovery/checklist'
import { approvalLinkOf } from '@web/modules/social-recovery/recovery/checklist'
import {
  approvalRequestOf,
  approvalValuesOf,
  deadlineViewOf,
  describedRequestOf,
  keyAllowsSign,
  keyReadingOf,
  readingOf,
  readingOfFacts,
  requestKeyOf,
  signEnabled
} from '@web/modules/social-recovery/guardian-page'
import type {
  ApprovalReading,
  ApprovalValues,
  DeadlineView,
  DomainOfBuild,
  KeystoreFacts
} from '@web/modules/social-recovery/guardian-page'
import type { ApproverApproval } from '@web/modules/social-recovery/guardian-page/__tests__/harness'
import type { ListedAccount } from '@web/modules/social-recovery/shared/client'

const t = (key: string, values?: Record<string, unknown>): string => i18n.t(key, values)

const BUILD: DomainOfBuild = {
  chainId: 11155111,
  manager: getAddress('0xd41f8b062c97ae5310bd7f4a6e21c08539dab7e6'),
  digestVersion: '1'
}
const ACCOUNT = getAddress('0x2b0f5e98ee98adc9865745e98802f333f72f6ef5')
const NEW_KEY = getAddress('0x7a19c3f0b41d8e5a90cc77b2e4f8135aa62cc204')
const REMOVED_KEY = getAddress('0x3fb2c4e8a19d07f6e5c3d1b8a24f9e7c60d1a2a2')
const PAYLOAD = '0xabcdef' as const
const CREATED_AT = 1_800_000_000
const VALID_UNTIL = CREATED_AT + 86_400
const BEFORE_DEADLINE = CREATED_AT * 1000
const AFTER_DEADLINE = (VALID_UNTIL + 1) * 1000

const requestOf = (overrides: Partial<ApproverApproval> = {}): ApproverApproval => ({
  kind: 'recovery-proof-request',
  version: 1,
  purpose: 'approval',
  chainId: String(BUILD.chainId),
  manager: BUILD.manager,
  digestVersion: BUILD.digestVersion,
  account: ACCOUNT,
  action: getAddress('0x0ac7000000000000000000000000000000000001'),
  attemptId: '3',
  setupNonce: '2',
  setupBodyHash: `0x${'5e'.repeat(32)}`,
  payload: PAYLOAD,
  order: { token: zeroAddress, amount: '0', payee: zeroAddress },
  validUntil: String(VALID_UNTIL),
  place: 1,
  method: getAddress('0xecd5000000000000000000000000000000000002'),
  config: '0x01',
  salt: '0x02',
  credentialHoldsCode: false,
  ...overrides
})

const NO_ATTEMPT: Attempt = {
  state: 'None',
  attemptId: 0n,
  setupNonce: 0n,
  consumableAfter: 0,
  payloadHash: `0x${'00'.repeat(32)}`,
  order: { token: zeroAddress, amount: 0n, payee: zeroAddress },
  usedMethods: [],
  ignoresPause: false
}

const SUBMITTED: Attempt = {
  ...NO_ATTEMPT,
  state: 'Waiting',
  attemptId: 3n,
  setupNonce: 2n,
  consumableAfter: CREATED_AT + 3 * 86_400,
  payloadHash: keccak256(PAYLOAD)
}

const factsOf = (overrides: Partial<PollFacts> = {}): PollFacts => ({
  attempt: NO_ATTEMPT,
  nextAttemptId: 3n,
  setupNonce: 2n,
  authorized: true,
  ...overrides
})

const descriptionOf = (overrides: Partial<RequestDescription> = {}): RequestDescription => ({
  account: ACCOUNT,
  chainId: BUILD.chainId,
  manager: BUILD.manager,
  action: requestOf().action,
  attemptId: 3n,
  setupNonce: 2n,
  purpose: 'approval',
  handover: { decoded: true, newAuthority: NEW_KEY, removedAuthority: REMOVED_KEY },
  validUntil: VALID_UNTIL,
  place: 1,
  identityPublic: { method: requestOf().method, config: requestOf().config, saltPublished: true },
  device: 'no-implementation',
  ...overrides
})

describe('the request the link carries', () => {
  const link = approvalLinkOf(requestOf(), 'chrome-extension://kohaku/tab.html')

  it('reads the request from the search string the router hands the page', () => {
    expect(approvalRequestOf(link.slice(link.indexOf('?')), '')).toEqual(requestOf())
  })

  it('reads the request from the whole link', () => {
    expect(approvalRequestOf(link, '')).toEqual(requestOf())
  })

  it('reads the request from the window hash where the router hands no search', () => {
    expect(approvalRequestOf('', link.slice(link.indexOf('#')))).toEqual(requestOf())
  })

  it('reads no request from a malformed or missing request', () => {
    const cases = [
      '',
      '?request=',
      '?request=not-a-request',
      '?other=1',
      link.slice(link.indexOf('?'), -4)
    ]
    cases.forEach((search) => {
      expect({ search, request: approvalRequestOf(search, '') }).toEqual({ search, request: null })
    })
  })

  it('reads no request from a link that carries a cancellation', () => {
    const { payload, order, ...members } = requestOf()
    expect([payload, order]).toEqual([PAYLOAD, expect.any(Object)])
    const cancelLink = approvalLinkOf(
      { ...members, purpose: 'cancellation' },
      'chrome-extension://kohaku/tab.html'
    )
    expect(approvalRequestOf(cancelLink, '')).toBeNull()
  })

  it('describes the request, or reads none where the orchestrator cannot read it', () => {
    const request = requestOf()
    expect(describedRequestOf(request, () => descriptionOf())).toEqual({
      request,
      description: descriptionOf()
    })
    expect(
      describedRequestOf(request, () => {
        throw new Error('version-unread')
      })
    ).toBeNull()
    expect(describedRequestOf(null, () => descriptionOf())).toBeNull()
  })
})

describe('what the page reads of the request', () => {
  const answered = (facts: PollFacts) => ({ status: 'answered' as const, facts })
  const ready = { status: 'ready' as const, client: {} as never }

  it('reads a live request with nothing on chain against it', () => {
    expect(readingOfFacts(requestOf(), factsOf(), BEFORE_DEADLINE)).toEqual({
      kind: 'live',
      authorized: true
    })
  })

  it('reads a live request the account no longer authorizes as dormant, not dead', () => {
    expect(readingOfFacts(requestOf(), factsOf({ authorized: false }), BEFORE_DEADLINE)).toEqual({
      kind: 'live',
      authorized: false
    })
  })

  it('reads expired from the deadline second on, as the deadline line reads it ended', () => {
    const lastLiveMs = VALID_UNTIL * 1000 - 1
    expect(readingOfFacts(requestOf(), factsOf(), lastLiveMs)).toEqual({
      kind: 'live',
      authorized: true
    })
    expect(deadlineViewOf(VALID_UNTIL, lastLiveMs, 'UTC', t)?.passed).toBe(false)
    expect(readingOfFacts(requestOf(), factsOf(), VALID_UNTIL * 1000)).toEqual({
      kind: 'dead',
      death: 'expired'
    })
    expect(deadlineViewOf(VALID_UNTIL, VALID_UNTIL * 1000, 'UTC', t)?.passed).toBe(true)
    expect(readingOfFacts(requestOf(), factsOf(), AFTER_DEADLINE)).toEqual({
      kind: 'dead',
      death: 'expired'
    })
  })

  it('reads void where another attempt waits or the attempt counter moved past the request', () => {
    const others: PollFacts[] = [
      factsOf({ attempt: { ...SUBMITTED, payloadHash: keccak256('0x01') }, nextAttemptId: 4n }),
      factsOf({ attempt: { ...SUBMITTED, attemptId: 2n }, nextAttemptId: 3n }),
      factsOf({ nextAttemptId: 4n }),
      factsOf({ attempt: { ...SUBMITTED, state: 'Cancelled', attemptId: 2n }, nextAttemptId: 4n })
    ]
    others.forEach((facts) => {
      expect(readingOfFacts(requestOf(), facts, BEFORE_DEADLINE)).toEqual({
        kind: 'dead',
        death: 'void'
      })
    })
  })

  it('reads setup changed where the setup number is not the request one', () => {
    expect(readingOfFacts(requestOf(), factsOf({ setupNonce: 3n }), BEFORE_DEADLINE)).toEqual({
      kind: 'dead',
      death: 'setup-changed'
    })
  })

  it('reads the request the recoverer submitted as waiting until its end, even past the deadline', () => {
    const facts = factsOf({ attempt: SUBMITTED, nextAttemptId: 4n })
    const waiting = { kind: 'waiting', endsAt: SUBMITTED.consumableAfter * 1000, authorized: true }
    expect(readingOfFacts(requestOf(), facts, BEFORE_DEADLINE)).toEqual(waiting)
    expect(readingOfFacts(requestOf(), facts, AFTER_DEADLINE)).toEqual(waiting)
    expect(readingOfFacts(requestOf(), { ...facts, authorized: false }, BEFORE_DEADLINE)).toEqual({
      ...waiting,
      authorized: false
    })
  })

  it('reads the request the recoverer submitted as used once its recovery ended, never as void', () => {
    const ended: Attempt[] = [
      { ...SUBMITTED, state: 'Cancelled' },
      { ...SUBMITTED, state: 'Consumed' }
    ]
    ended.forEach((attempt) => {
      const facts = [
        factsOf({ attempt, nextAttemptId: 4n }),
        factsOf({ attempt, nextAttemptId: 4n, setupNonce: 3n })
      ]
      facts.forEach((roundFacts) => {
        const clocks = [BEFORE_DEADLINE, AFTER_DEADLINE]
        clocks.forEach((clock) => {
          expect({
            state: attempt.state,
            clock,
            reading: readingOfFacts(requestOf(), roundFacts, clock)
          }).toEqual({ state: attempt.state, clock, reading: { kind: 'dead', death: 'used' } })
        })
      })
    })
  })

  it('names expired first, then another attempt waiting, then setup changed, then a moved counter', () => {
    const changedAndMoved = factsOf({ nextAttemptId: 4n, setupNonce: 3n })
    expect(readingOfFacts(requestOf(), changedAndMoved, AFTER_DEADLINE)).toEqual({
      kind: 'dead',
      death: 'expired'
    })
    expect(readingOfFacts(requestOf(), changedAndMoved, BEFORE_DEADLINE)).toEqual({
      kind: 'dead',
      death: 'setup-changed'
    })
    const otherWaitingAndChanged = factsOf({
      attempt: { ...SUBMITTED, payloadHash: keccak256('0x01') },
      nextAttemptId: 4n,
      setupNonce: 3n
    })
    expect(readingOfFacts(requestOf(), otherWaitingAndChanged, BEFORE_DEADLINE)).toEqual({
      kind: 'dead',
      death: 'void'
    })
  })

  it('reads a failed client or a failed read as failed, never as a death', () => {
    const retry = () => {}
    expect(
      readingOf(
        requestOf(),
        BUILD,
        { status: 'failed', retry },
        { status: 'pending' },
        AFTER_DEADLINE
      )
    ).toEqual({ kind: 'failed' })
    expect(readingOf(requestOf(), BUILD, ready, { status: 'failed' }, AFTER_DEADLINE)).toEqual({
      kind: 'failed'
    })
  })

  it('reads a client refused for the digest version the manager publishes as another deployment', () => {
    expect(
      readingOf(requestOf(), BUILD, { status: 'refused' }, { status: 'pending' }, BEFORE_DEADLINE)
    ).toEqual({ kind: 'other-deployment' })
  })

  it('reads a client or a read that has not answered as reading', () => {
    expect(
      readingOf(requestOf(), BUILD, { status: 'loading' }, { status: 'pending' }, BEFORE_DEADLINE)
    ).toEqual({ kind: 'reading' })
    expect(readingOf(requestOf(), BUILD, ready, { status: 'pending' }, BEFORE_DEADLINE)).toEqual({
      kind: 'reading'
    })
  })

  it('reads an answered round through the deaths', () => {
    expect(
      readingOf(requestOf(), BUILD, ready, answered(factsOf({ setupNonce: 9n })), BEFORE_DEADLINE)
    ).toEqual({ kind: 'dead', death: 'setup-changed' })
  })

  it('refuses a request aimed at another chain, manager or digest version before any read', () => {
    const others: Partial<ApproverApproval>[] = [
      { chainId: '1' },
      { manager: getAddress('0xd41f8b062c97ae5310bd7f4a6e21c08539dab7e7') },
      { digestVersion: '2' }
    ]
    others.forEach((overrides) => {
      expect(
        readingOf(requestOf(overrides), BUILD, ready, answered(factsOf()), BEFORE_DEADLINE)
      ).toEqual({ kind: 'other-deployment' })
    })
    expect(
      readingOf(
        requestOf({ manager: BUILD.manager.toLowerCase() as `0x${string}` }),
        BUILD,
        ready,
        answered(factsOf()),
        BEFORE_DEADLINE
      )
    ).toEqual({ kind: 'live', authorized: true })
  })
})

describe('the four values and the deadline', () => {
  it('renders the account, the new key and the key being removed in full, and no payment', () => {
    const values = approvalValuesOf(descriptionOf(), t)
    expect(values.rendered).toBe(true)
    expect(values.lines.map(({ label, value }) => [label, value])).toEqual([
      ['Account being recovered', ACCOUNT],
      ['New key', NEW_KEY],
      ['Key being removed', REMOVED_KEY],
      ['Payment', 'No payment']
    ])
  })

  it('renders an order of zero as no payment', () => {
    const values = approvalValuesOf(
      descriptionOf({ order: { token: zeroAddress, amount: 0n, payee: zeroAddress } }),
      t
    )
    expect(values.lines[3].value).toBe('No payment')
    expect(values.rendered).toBe(true)
  })

  it('leaves the values not rendered where the handover is not decoded or the payment has an amount', () => {
    const undecoded = approvalValuesOf(
      descriptionOf({ handover: { decoded: false, cause: 'no-codec' } }),
      t
    )
    expect(undecoded.lines.map(({ value }) => value)).toEqual([ACCOUNT, null, null, 'No payment'])
    expect(undecoded.rendered).toBe(false)
    const paid = approvalValuesOf(
      descriptionOf({ order: { token: zeroAddress, amount: 5n, payee: zeroAddress } }),
      t
    )
    expect(paid.lines[3].value).toBeNull()
    expect(paid.rendered).toBe(false)
  })

  it('renders the deadline with its time left, then as ended', () => {
    const live = deadlineViewOf(VALID_UNTIL, BEFORE_DEADLINE, 'UTC', t)
    expect(live).toEqual({ line: 'Valid until 16 Jan, 08:00 UTC · 24 hours left', passed: false })
    const ended = deadlineViewOf(VALID_UNTIL, AFTER_DEADLINE, 'UTC', t)
    expect(ended).toEqual({ line: 'Valid until 16 Jan, 08:00 UTC · ended', passed: true })
    expect(deadlineViewOf(Number.NaN, BEFORE_DEADLINE, 'UTC', t)).toBeNull()
  })
})

describe('the sign action', () => {
  const values: ApprovalValues = approvalValuesOf(descriptionOf(), t)
  const deadline = deadlineViewOf(VALID_UNTIL, BEFORE_DEADLINE, 'UTC', t) as DeadlineView
  const live: ApprovalReading = { kind: 'live', authorized: true }
  const open = { values, deadline, reading: live, acknowledged: true }

  it('is enabled with every gate open', () => {
    expect(signEnabled(open)).toBe(true)
  })

  it('stays disabled while any one gate is closed, the ticked box alone enabling nothing', () => {
    const closed = [
      { ...open, acknowledged: false },
      {
        ...open,
        values: approvalValuesOf(
          descriptionOf({ handover: { decoded: false, cause: 'no-codec' } }),
          t
        )
      },
      { ...open, deadline: null },
      { ...open, deadline: { ...deadline, passed: true } },
      { ...open, reading: { kind: 'failed' } as ApprovalReading },
      { ...open, reading: { kind: 'reading' } as ApprovalReading },
      { ...open, reading: { kind: 'other-deployment' } as ApprovalReading },
      { ...open, reading: { kind: 'live', authorized: false } as ApprovalReading },
      { ...open, reading: { kind: 'dead', death: 'expired' } as ApprovalReading },
      { ...open, reading: { kind: 'waiting', endsAt: 0, authorized: true } as ApprovalReading }
    ]
    closed.forEach((gates) => {
      expect({ gates, enabled: signEnabled(gates) }).toEqual({ gates, enabled: false })
    })
  })
})

describe('the key the request names', () => {
  const METHOD_ECDSA = getAddress('0x5e1a7c0b9d2f3e4a6b8c0d1e2f3a4b5c6d7e8f90')
  const wallet = walletMethod()
  const client = {
    descriptor: { methodEcdsa: METHOD_ECDSA },
    methodFor: (slug: string) => (slug === 'ecdsa' ? wallet : undefined)
  } as unknown as Parameters<typeof requestKeyOf>[0]
  const request = {
    method: METHOD_ECDSA,
    config: wallet.codec.encodeConfig({ signer: NEW_KEY })
  } as ApproverRequest

  it("is the address the SDK's wallet codec decodes from the config", () => {
    expect(requestKeyOf(client, request)).toBe(NEW_KEY)
  })

  it('reads as held when the unlocked wallet holds that key', () => {
    const reading = keyReadingOf(requestKeyOf(client, request), {
      keys: [{ addr: NEW_KEY, type: 'internal' }],
      isUnlocked: true,
      hasPasswordSecret: true
    })
    expect(reading).toEqual({ kind: 'held', key: { addr: NEW_KEY, type: 'internal' } })
  })

  const SMART = getAddress('0x9c1e7a3b5d2f4e6a8c0b1d3f5e7a9c2b4d6f8e01')
  const CONTROLLER = getAddress('0x41d6b2e8c3a5f7091e2d4c6b8a0f1e3d5c7b9a12')
  const STRANGER = getAddress('0x8e2a4c6b0d1f3e5a7c9b2d4f6e8a0c1b3d5f7e23')
  const creation = {
    factoryAddr: getAddress('0xfac7000000000000000000000000000000000001'),
    bytecode: '0x00',
    salt: `0x${'00'.repeat(32)}`
  } as ListedAccount['creation']
  const accounts: readonly ListedAccount[] = [
    { addr: CONTROLLER, associatedKeys: [CONTROLLER], creation: null },
    { addr: SMART, associatedKeys: [CONTROLLER], creation }
  ]
  const unlocked: KeystoreFacts = {
    keys: [{ addr: CONTROLLER, type: 'internal' }],
    isUnlocked: true,
    hasPasswordSecret: true
  }

  it('reads a listed smart account whose controlling key the wallet holds as that account, deployed where the request reads code at it', () => {
    expect(keyReadingOf(SMART, unlocked, accounts, true)).toEqual({
      kind: 'smartAccount',
      key: { addr: SMART, type: 'internal' },
      deployed: true
    })
    expect(keyReadingOf(SMART, unlocked, accounts, false)).toEqual({
      kind: 'smartAccount',
      key: { addr: SMART, type: 'internal' },
      deployed: false
    })
  })

  it('takes the controlling key type the keystore holds for the smart account', () => {
    const trezor: KeystoreFacts = { ...unlocked, keys: [{ addr: CONTROLLER, type: 'trezor' }] }
    expect(keyReadingOf(SMART, trezor, accounts, true)).toEqual({
      kind: 'smartAccount',
      key: { addr: SMART, type: 'trezor' },
      deployed: true
    })
  })

  it('reads a listed smart account whose controlling key the wallet does not hold as missing', () => {
    const otherKey: KeystoreFacts = { ...unlocked, keys: [{ addr: STRANGER, type: 'internal' }] }
    expect(keyReadingOf(SMART, otherKey, accounts, true)).toEqual({
      kind: 'missing',
      address: SMART
    })
  })

  it('reads an address the wallet lists nowhere as missing, even with keys held', () => {
    expect(keyReadingOf(STRANGER, unlocked, accounts, true)).toEqual({
      kind: 'missing',
      address: STRANGER
    })
  })

  it('reads a listed basic account with the same address as a held key, not as a smart account', () => {
    expect(keyReadingOf(CONTROLLER, unlocked, accounts, true)).toEqual({
      kind: 'held',
      key: { addr: CONTROLLER, type: 'internal' }
    })
  })

  it('reads a locked wallet as locked before it looks at the smart accounts', () => {
    const locked: KeystoreFacts = { ...unlocked, isUnlocked: false }
    expect(keyReadingOf(SMART, locked, accounts, true)).toEqual({
      kind: 'locked',
      address: SMART
    })
  })

  it('lets the sign action be pressed for a held key, a locked wallet and a deployed smart account only', () => {
    const cases = [
      { reading: keyReadingOf(CONTROLLER, unlocked, accounts, false), allows: true },
      { reading: keyReadingOf(SMART, { ...unlocked, isUnlocked: false }, accounts), allows: true },
      { reading: keyReadingOf(SMART, unlocked, accounts, true), allows: true },
      { reading: keyReadingOf(SMART, unlocked, accounts, false), allows: false },
      { reading: keyReadingOf(STRANGER, unlocked, accounts, true), allows: false },
      { reading: keyReadingOf(null, unlocked, accounts, true), allows: false }
    ]
    cases.forEach(({ reading, allows }) => {
      expect({ reading, allows: keyAllowsSign(reading) }).toEqual({ reading, allows })
    })
  })
})
