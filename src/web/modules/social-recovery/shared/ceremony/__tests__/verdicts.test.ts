/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "chrome-extension://cgjhdpkjghcgpplimocodhjgcceglpoj/tab.html#/social-recovery/ceremony"}
 */
/**
 * Every host reports exactly one of four verdicts: passed, failed with its
 * cause, unavailable with retry, and not supported without one. A failed test
 * reads "test failed" with its cause, never "not tested".
 *
 * What a row renders depends on the call: the test chips and lines serve test
 * access alone, a passed enrollment reads not tested until its test runs, and
 * a claim reads the checklist's chips.
 */
import type { ApproverReply, Hex } from '@web/modules/social-recovery/sdk-interfaces'

import {
  browserDefaults,
  enrollFailure,
  fakeAssertion,
  fakeAttestation,
  fakeMethod,
  fakeOrchestrator,
  FourVerdict,
  generatePoint,
  HostName,
  hosts,
  installCredentials,
  lineKeyOf,
  MethodScript,
  methodRunCount,
  Outcome,
  P256Point,
  noteKeyOf,
  replyFailure,
  rowChipOf,
  SYNCED_FLAGS,
  ceremony
} from './harness'

const THROWN_CAUSE = 'the authenticator returned a key of the wrong curve'

/** A node or a service that did not answer: a timeout, and a fetch that never reached it. */
const timedOut = () =>
  Object.assign(new Error('the prover service did not answer in time'), { name: 'TimeoutError' })
const fetchFailed = () => new TypeError('Failed to fetch')

/** A stringify that survives bigints, for the "never not tested" scan. */
const scan = (value: unknown): string => {
  try {
    return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)) ?? ''
  } catch {
    return String(value)
  }
}

interface Case {
  title: string
  script: MethodScript
  verdict: FourVerdict
  cause?: string | RegExp
}

// The member each host runs: enroll packages through configFrom, test access
// through replyFrom then verify, create claim through replyFrom.
const CASES: Record<Exclude<HostName, 'healthCheck'>, Case[]> = {
  enroll: [
    { title: 'the method returns a config', script: {}, verdict: 'passed' },
    {
      title: 'the method throws a cause',
      script: { configFrom: { throws: new Error(THROWN_CAUSE) } },
      verdict: 'failed',
      cause: THROWN_CAUSE
    },
    {
      title: 'the method returns its enrollment failure',
      script: { configFrom: enrollFailure('material-rejected') },
      verdict: 'failed',
      cause: 'material-rejected'
    },
    {
      title: 'the device did not answer',
      script: { configFrom: enrollFailure('device-unavailable') },
      verdict: 'unavailable'
    },
    {
      title: 'a service did not answer (timeout)',
      script: { configFrom: { throws: timedOut() } },
      verdict: 'unavailable'
    },
    {
      title: 'a node did not answer (failed fetch)',
      script: { configFrom: { throws: fetchFailed() } },
      verdict: 'unavailable'
    },
    {
      title: 'the method cannot serve it',
      script: { configFrom: enrollFailure('method-unsupported') },
      verdict: 'not-supported'
    },
    {
      title: 'the method cannot read the record version',
      script: { configFrom: enrollFailure('version-unread') },
      verdict: 'not-supported'
    }
  ],
  testAccess: [
    { title: 'the proof satisfies the credential', script: {}, verdict: 'passed' },
    {
      title: 'the method throws a cause',
      script: { replyFrom: { throws: new Error(THROWN_CAUSE) } },
      verdict: 'failed',
      cause: THROWN_CAUSE
    },
    {
      title: 'the method returns its typed failure',
      script: { replyFrom: replyFailure('material-rejected') },
      verdict: 'failed',
      cause: 'material-rejected'
    },
    {
      title: 'the check does not match the key',
      script: { verify: 'rejected' },
      verdict: 'failed',
      cause: /./
    },
    {
      title: 'the verifier could not be reached (not judged)',
      script: { verify: 'not-judged' },
      verdict: 'unavailable'
    },
    {
      title: 'the check could not reach its node (failed fetch)',
      script: { verify: { throws: fetchFailed() } },
      verdict: 'unavailable'
    },
    {
      title: 'the check throws a cause',
      script: { verify: { throws: new Error(THROWN_CAUSE) } },
      verdict: 'failed',
      cause: THROWN_CAUSE
    },
    {
      title: 'the device did not answer',
      script: { replyFrom: replyFailure('device-unavailable') },
      verdict: 'unavailable'
    },
    {
      title: 'a service did not answer (timeout)',
      script: { replyFrom: { throws: timedOut() } },
      verdict: 'unavailable'
    },
    {
      title: 'the method cannot serve it',
      script: { replyFrom: replyFailure('method-unsupported') },
      verdict: 'not-supported'
    }
  ],
  createClaim: [
    { title: 'the method returns a proof', script: {}, verdict: 'passed' },
    {
      title: 'the method throws a cause',
      script: { replyFrom: { throws: new Error(THROWN_CAUSE) } },
      verdict: 'failed',
      cause: THROWN_CAUSE
    },
    {
      title: 'the method returns its typed failure',
      script: { replyFrom: replyFailure('material-rejected') },
      verdict: 'failed',
      cause: 'material-rejected'
    },
    {
      title: 'the device did not answer',
      script: { replyFrom: replyFailure('device-unavailable') },
      verdict: 'unavailable'
    },
    {
      title: 'a service did not answer (timeout)',
      script: { replyFrom: { throws: timedOut() } },
      verdict: 'unavailable'
    },
    {
      title: 'the method cannot serve it',
      script: { replyFrom: replyFailure('method-unsupported') },
      verdict: 'not-supported'
    }
  ]
}

let point: P256Point
let restore: () => void

beforeAll(async () => {
  point = await generatePoint()
})

beforeEach(() => {
  const creds = installCredentials({
    create: async () => fakeAttestation({ flags: SYNCED_FLAGS, point }).credential,
    get: async () => fakeAssertion({ r: BigInt(5), s: BigInt(6) }).credential
  })
  restore = creds.restore
})

afterEach(() => restore())

type Call = keyof typeof CASES

const NOTE = (key: string) => `socialRecovery.ceremony.${key}`

/** The chip, note and line a row renders for one verdict of `call`. */
const expectRow = (outcome: Outcome & { type: 'verdict' }, call: Call) => {
  const chip = rowChipOf(outcome, call)
  const note = noteKeyOf(outcome, call)
  const line = lineKeyOf(outcome, call)
  // On every call, nothing a failed or unavailable run renders reads not tested.
  if (outcome.verdict !== 'passed') {
    expect(chip).not.toBe('method:notTested')
    expect(line).not.toBe(NOTE('notTestedLine'))
  }
  // A test that could not run reads the test-unavailable line; an enrollment or
  // a claim is not a test and reads the unavailable note.
  const unavailableNote = /unreachable/.test(outcome.cause ?? '')
    ? NOTE('unreachableNote')
    : NOTE(call === 'testAccess' ? 'testUnavailableLine' : 'unavailableNote')
  if (call === 'testAccess') {
    const expected = {
      passed: ['method:tested', NOTE('passedNote'), null],
      failed: [
        'method:testFailed',
        null,
        /check-rejected/.test(outcome.cause ?? '')
          ? NOTE('testFailedNoMatch')
          : NOTE('testFailedLine')
      ],
      unavailable: ['method:testUnavailable', unavailableNote, null],
      'not-supported': ['method:notSupported', NOTE('notSupportedNote'), NOTE('notSupportedLine')]
    }[outcome.verdict]
    expect([chip, note, line]).toEqual(expected)
    return
  }
  const passedChip = call === 'enroll' ? 'method:notTested' : 'collection:complete'
  const passedNote = call === 'enroll' ? null : NOTE('passedNote')
  const expected = {
    passed: [passedChip, passedNote, null],
    failed: [null, NOTE('failedNote'), null],
    unavailable: [null, unavailableNote, null],
    'not-supported': [null, NOTE('notSupportedNote'), null]
  }[outcome.verdict]
  expect([chip, note, line]).toEqual(expected)
}

const expectOneVerdict = (outcome: Outcome, expected: Case, call: Call) => {
  expect(outcome.type).toBe('verdict')
  if (outcome.type !== 'verdict') return
  expect(outcome.verdict).toBe(expected.verdict)
  // A failed test is never a skipped one.
  expect(scan(outcome.raw)).not.toMatch(/not[\s_-]?tested|skipped/i)
  switch (outcome.verdict) {
    case 'failed':
      expect(outcome.cause).toEqual(expect.any(String))
      expect((outcome.cause ?? '').length).toBeGreaterThan(0)
      if (typeof expected.cause === 'string') expect(outcome.cause).toContain(expected.cause)
      else if (expected.cause) expect(outcome.cause).toMatch(expected.cause)
      break
    case 'unavailable':
      expect(outcome.retry).toBe(true)
      break
    case 'not-supported':
      expect(outcome.retry).toBe(false)
      break
    default:
      break
  }
  expectRow(outcome, call)
}

;(Object.keys(CASES) as (keyof typeof CASES)[]).forEach((host) =>
  describe(`the ${host} host`, () => {
    CASES[host].forEach((c) =>
      it(c.title, async () => {
        const method = fakeMethod(c.script)
        const orchestrator = fakeOrchestrator(method)
        const outcome = await hosts[host]({ method, orchestrator })
        expectOneVerdict(outcome, c, host)
      })
    )
  })
)

describe('a method that answers null', () => {
  it('reads failed with the thrown cause at enrollment and at a claim', async () => {
    const enrolling = fakeMethod()
    enrolling.configFrom.mockResolvedValue(null as unknown as Hex)
    const enrolled = await hosts.enroll({
      method: enrolling,
      orchestrator: fakeOrchestrator(enrolling)
    })
    const claiming = fakeMethod()
    const orchestrator = fakeOrchestrator(claiming)
    orchestrator.replyFrom.mockResolvedValue(null as unknown as ApproverReply)
    const claimed = await hosts.createClaim({ method: claiming, orchestrator })
    ;[enrolled, claimed].forEach((outcome) =>
      expect(outcome.raw).toMatchObject({ kind: 'verdict', verdict: 'failed', cause: 'thrown' })
    )
  })
})

describe('a page that serves no passkey device', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'credentials', {
      value: undefined,
      configurable: true,
      writable: true
    })
  })
  ;(['enroll', 'testAccess', 'createClaim'] as const).forEach((host) =>
    it(`reads ${host} as not supported, with no implementation, before the method runs`, async () => {
      expect(browserDefaults().browserPasskeyDevice()).toBeUndefined()
      const method = fakeMethod()
      const orchestrator = fakeOrchestrator(method)
      const outcome = await hosts[host]({ method, orchestrator })
      expect(outcome).toMatchObject({
        type: 'verdict',
        verdict: 'not-supported',
        cause: 'no-implementation',
        retry: false
      })
      expect(methodRunCount(method, orchestrator)).toBe(0)
    })
  )
})

describe('the health-check host', () => {
  it('returns not supported with no retry', async () => {
    const method = fakeMethod()
    const orchestrator = fakeOrchestrator(method)
    const outcome = await hosts.healthCheck({ method, orchestrator })
    expect(outcome).toMatchObject({ type: 'verdict', verdict: 'not-supported', retry: false })
  })

  it('runs no member of the method and no ceremony', async () => {
    const creds = installCredentials()
    const method = fakeMethod()
    const orchestrator = fakeOrchestrator(method)
    await hosts.healthCheck({ method, orchestrator })
    const memberCalls = [
      method.enrollInput,
      method.configFrom,
      method.signingInput,
      method.replyFrom,
      method.verify,
      orchestrator.configFrom,
      orchestrator.replyFrom,
      orchestrator.verify
    ].reduce((n, fn) => n + fn.mock.calls.length, 0)
    expect(memberCalls).toBe(0)
    expect(creds.create).not.toHaveBeenCalled()
    expect(creds.get).not.toHaveBeenCalled()
    creds.restore()
  })
})

describe('what a row renders, by call', () => {
  type ModuleOutcome = Parameters<ReturnType<typeof ceremony>['chipOfOutcome']>[0]
  const row = (outcome: ModuleOutcome, call: Call | 'healthCheck') => {
    const { chipOfOutcome, noteKeyOfOutcome, lineKeyOfOutcome } = ceremony()
    const chip = chipOfOutcome(outcome, call)
    return [
      chip ? `${chip.set}:${chip.chip}` : null,
      noteKeyOfOutcome(outcome, call),
      lineKeyOfOutcome(outcome, call)
    ]
  }

  it("enroll: a passed enrollment reads not tested; every other outcome keeps the row's chip with its note", () => {
    const { passed, failed, unavailable, notSupported, dismissed } = ceremony()
    expect(row(passed({ config: '0x01' }), 'enroll')).toEqual(['method:notTested', null, null])
    expect(row(failed('material-rejected'), 'enroll')).toEqual([null, NOTE('failedNote'), null])
    expect(row(failed('thrown'), 'enroll')).toEqual([null, NOTE('failedNote'), null])
    expect(row(failed('relying-party-mismatch'), 'enroll')).toEqual([
      null,
      NOTE('providerRefused'),
      null
    ])
    // An enrollment is not a test: the unavailable note, never the test line.
    expect(row(unavailable('device-unavailable'), 'enroll')).toEqual([
      null,
      NOTE('unavailableNote'),
      null
    ])
    expect(row(unavailable('service-unanswered'), 'enroll')).toEqual([
      null,
      NOTE('unavailableNote'),
      null
    ])
    expect(row(unavailable('unreachable'), 'enroll')).toEqual([null, NOTE('unreachableNote'), null])
    expect(row(notSupported('method-unsupported'), 'enroll')).toEqual([
      null,
      NOTE('notSupportedNote'),
      null
    ])
    expect(row(dismissed('cancelled'), 'enroll')).toEqual([null, NOTE('cancelledNote'), null])
    expect(row(dismissed('refused'), 'enroll')).toEqual([null, NOTE('refusedNote'), null])
  })

  it('testAccess: the four test chips, a failed test with its line and never not tested', () => {
    const { passed, failed, unavailable, notSupported, dismissed } = ceremony()
    expect(row(passed({ proof: '0x01' }), 'testAccess')).toEqual([
      'method:tested',
      NOTE('passedNote'),
      null
    ])
    expect(row(failed('thrown'), 'testAccess')).toEqual([
      'method:testFailed',
      null,
      NOTE('testFailedLine')
    ])
    expect(row(failed('browser-error', 'NotAllowedError'), 'testAccess')).toEqual([
      'method:testFailed',
      null,
      NOTE('testFailedLine')
    ])
    expect(row(failed('check-rejected'), 'testAccess')).toEqual([
      'method:testFailed',
      null,
      NOTE('testFailedNoMatch')
    ])
    expect(row(failed('relying-party-mismatch'), 'testAccess')).toEqual([
      'method:testFailed',
      NOTE('relyingPartyMismatch'),
      NOTE('testFailedLine')
    ])
    // An unavailable test shows its line once, as the note, and never the
    // unavailable note of an enrollment or a claim.
    expect(row(unavailable('not-judged'), 'testAccess')).toEqual([
      'method:testUnavailable',
      NOTE('testUnavailableLine'),
      null
    ])
    expect(row(unavailable('service-unanswered'), 'testAccess')).toEqual([
      'method:testUnavailable',
      NOTE('testUnavailableLine'),
      null
    ])
    expect(row(unavailable('unreachable'), 'testAccess')).toEqual([
      'method:testUnavailable',
      NOTE('unreachableNote'),
      null
    ])
    expect(row(notSupported('method-unsupported'), 'testAccess')).toEqual([
      'method:notSupported',
      NOTE('notSupportedNote'),
      NOTE('notSupportedLine')
    ])
    expect(row(dismissed('cancelled'), 'testAccess')).toEqual([null, NOTE('cancelledNote'), null])
  })

  it("createClaim: a passed claim reads complete; a failed claim keeps the row's chip with the failed note and no test line", () => {
    const { passed, failed, unavailable, notSupported, dismissed } = ceremony()
    expect(row(passed({ reply: {} }), 'createClaim')).toEqual([
      'collection:complete',
      NOTE('passedNote'),
      null
    ])
    expect(row(failed('material-rejected'), 'createClaim')).toEqual([
      null,
      NOTE('failedNote'),
      null
    ])
    expect(row(failed('browser-error', 'NotAllowedError'), 'createClaim')).toEqual([
      null,
      NOTE('failedNote'),
      null
    ])
    expect(row(failed('relying-party-mismatch'), 'createClaim')).toEqual([
      null,
      NOTE('relyingPartyMismatch'),
      null
    ])
    // A claim is not a test: the unavailable note, never the test line.
    expect(row(unavailable('service-unanswered'), 'createClaim')).toEqual([
      null,
      NOTE('unavailableNote'),
      null
    ])
    expect(row(unavailable('device-unavailable'), 'createClaim')).toEqual([
      null,
      NOTE('unavailableNote'),
      null
    ])
    expect(row(unavailable('unreachable'), 'createClaim')).toEqual([
      null,
      NOTE('unreachableNote'),
      null
    ])
    expect(row(notSupported('version-unread'), 'createClaim')).toEqual([
      null,
      NOTE('notSupportedNote'),
      null
    ])
    expect(row(dismissed('refused'), 'createClaim')).toEqual([null, NOTE('refusedNote'), null])
  })

  it('healthCheck: the shell selects no chip and no test line', () => {
    const { notSupported } = ceremony()
    expect(row(notSupported('no-implementation'), 'healthCheck')).toEqual([
      null,
      NOTE('notSupportedNote'),
      null
    ])
  })
})
