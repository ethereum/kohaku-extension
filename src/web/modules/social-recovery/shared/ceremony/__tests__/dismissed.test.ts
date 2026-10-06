/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "chrome-extension://cgjhdpkjghcgpplimocodhjgcceglpoj/tab.html#/social-recovery/ceremony"}
 */
/**
 * At a test access, a `NotAllowedError` from `navigator.credentials.get` reads
 * test failed with the browser's error name as its cause, since the browser
 * cannot tell a dismissed prompt from a missing credential. At an enrollment
 * and at a claim it stays the cancelled note. The method never runs in any of
 * them.
 */
import type { CeremonyStop } from '@web/modules/social-recovery/shared/ceremony'

import {
  browserErrorNameOf,
  carries,
  ceremony,
  CONFIG_HEX,
  enrollFailure,
  fakeAssertion,
  fakeAttestation,
  fakeMethod,
  fakeOrchestrator,
  flush,
  generatePoint,
  hosts,
  installCredentials,
  lineKeyOf,
  methodRunCount,
  noteKeyOf,
  notAllowedError,
  P256Point,
  PROOF_HEX,
  replyFailure,
  rowChipOf,
  SYNCED_FLAGS
} from '@web/modules/social-recovery/shared/ceremony/__tests__/harness'

const NOTE = (key: string) => `socialRecovery.ceremony.${key}`

let point: P256Point
let creds: ReturnType<typeof installCredentials>

beforeAll(async () => {
  point = await generatePoint()
})

afterEach(() => creds?.restore())

/** A browser whose `create` and `get` both reject with `error`. */
const browserRejects = (error: () => unknown) => {
  creds = installCredentials({
    create: async () => {
      throw error()
    },
    get: async () => {
      throw error()
    }
  })
}

const browserAnswers = () => {
  creds = installCredentials({
    create: async () => fakeAttestation({ flags: SYNCED_FLAGS, point }).credential,
    get: async () => fakeAssertion({ r: BigInt(5), s: BigInt(6) }).credential
  })
}

const run = async (host: 'enroll' | 'testAccess' | 'createClaim', method = fakeMethod()) => {
  const orchestrator = fakeOrchestrator(method)
  const outcome = await hosts[host]({ method, orchestrator })
  return { outcome, method, orchestrator }
}

describe('NotAllowedError at enrollment (create)', () => {
  beforeEach(() => browserRejects(notAllowedError))

  it('returns the cancelled or refused note', async () => {
    const { outcome } = await run('enroll')
    expect(outcome.type).toBe('note')
    if (outcome.type === 'note') {
      expect(['cancelled', 'refused']).toContain(outcome.note)
    }
  })

  it('ran the ceremony once and the method zero times', async () => {
    const { method, orchestrator } = await run('enroll')
    expect(creds.create).toHaveBeenCalledTimes(1)
    expect(methodRunCount(method, orchestrator)).toBe(0)
  })

  it("never reads the dismissal as a failed test, and keeps the row's chip", async () => {
    const { outcome } = await run('enroll')
    expect(outcome).not.toMatchObject({ type: 'verdict' })
    expect(rowChipOf(outcome, 'enroll')).toBeNull()
    expect(noteKeyOf(outcome, 'enroll')).toBe(NOTE('cancelledNote'))
  })

  it('reads refused where the browser refused an unfocused page', async () => {
    browserRejects(() => new DOMException('The document is not focused.', 'NotAllowedError'))
    const { outcome, method, orchestrator } = await run('enroll')
    expect(outcome).toMatchObject({ type: 'note', note: 'refused' })
    expect(methodRunCount(method, orchestrator)).toBe(0)
  })

  it('reads refused from the message of a refusal thrown as a plain object', async () => {
    browserRejects(() => ({ name: 'NotAllowedError', message: 'The document is not focused.' }))
    const { outcome } = await run('enroll')
    expect(outcome).toMatchObject({ type: 'note', note: 'refused' })
  })
})
describe('NotAllowedError at testAccess (get)', () => {
  beforeEach(() => browserRejects(notAllowedError))

  it("reads failed with the browser's error name as its cause", async () => {
    const { outcome } = await run('testAccess')
    expect(outcome).toMatchObject({ type: 'verdict', verdict: 'failed', retry: true })
    if (outcome.type === 'verdict') {
      expect(outcome.cause).toContain('NotAllowedError')
    }
    expect(browserErrorNameOf(outcome)).toBe('NotAllowedError')
  })

  it('still runs the method zero times', async () => {
    const { method, orchestrator } = await run('testAccess')
    expect(creds.get).toHaveBeenCalledTimes(1)
    expect(methodRunCount(method, orchestrator)).toBe(0)
  })

  it('reads test failed with its line, never not tested', async () => {
    const { outcome } = await run('testAccess')
    expect(rowChipOf(outcome, 'testAccess')).toBe('method:testFailed')
    expect(lineKeyOf(outcome, 'testAccess')).toBe(NOTE('testFailedLine'))
    expect(lineKeyOf(outcome, 'testAccess')).not.toBe(NOTE('notTestedLine'))
  })
})

describe('NotAllowedError at createClaim (get)', () => {
  beforeEach(() => browserRejects(notAllowedError))

  it('reads the cancelled note, not a failed verdict', async () => {
    const { outcome } = await run('createClaim')
    expect(outcome).toMatchObject({ type: 'note', note: 'cancelled' })
    expect(outcome).not.toMatchObject({ type: 'verdict' })
  })

  it('still runs the method zero times', async () => {
    const { method, orchestrator } = await run('createClaim')
    expect(creds.get).toHaveBeenCalledTimes(1)
    expect(methodRunCount(method, orchestrator)).toBe(0)
  })

  it("keeps the row's chip and shows the cancelled note, with no test line", async () => {
    const { outcome } = await run('createClaim')
    expect(rowChipOf(outcome, 'createClaim')).toBeNull()
    expect(noteKeyOf(outcome, 'createClaim')).toBe(NOTE('cancelledNote'))
    expect(lineKeyOf(outcome, 'createClaim')).toBeNull()
    expect(browserErrorNameOf(outcome)).toBeNull()
  })

  it('reads refused where the browser refused an unfocused page', async () => {
    browserRejects(() => new DOMException('The document is not focused.', 'NotAllowedError'))
    const { outcome } = await run('createClaim')
    expect(outcome).toMatchObject({ type: 'note', note: 'refused' })
  })
})

describe("the browser's other errors", () => {
  ;(['enroll', 'testAccess', 'createClaim'] as const).forEach((host) =>
    it(`reads AbortError at ${host} as the cancelled note, before the method runs`, async () => {
      browserRejects(() => new DOMException('The operation was aborted.', 'AbortError'))
      const { outcome, method, orchestrator } = await run(host)
      expect(outcome).toMatchObject({ type: 'note', note: 'cancelled' })
      expect(methodRunCount(method, orchestrator)).toBe(0)
    })
  )

  it("reads the holder's own abort as cancelled, with no ceremony at all", async () => {
    browserAnswers()
    const controller = new AbortController()
    controller.abort()
    const method = fakeMethod()
    const orchestrator = fakeOrchestrator(method)
    const outcome = await hosts.enroll({ method, orchestrator, signal: controller.signal })
    expect(outcome).toMatchObject({ type: 'note', note: 'cancelled' })
    expect(creds.create).not.toHaveBeenCalled()
    expect(methodRunCount(method, orchestrator)).toBe(0)
  })

  it('reads SecurityError at enrollment as the provider that refused Kohaku', async () => {
    browserRejects(() => new DOMException('The relying party ID is not valid.', 'SecurityError'))
    const { outcome, method, orchestrator } = await run('enroll')
    expect(outcome).toMatchObject({ type: 'verdict', verdict: 'failed' })
    if (outcome.type === 'verdict') {
      expect(outcome.cause).toContain('relying-party-mismatch')
    }
    expect(noteKeyOf(outcome, 'enroll')).toBe(NOTE('providerRefused'))
    expect(methodRunCount(method, orchestrator)).toBe(0)
  })

  it('reads SecurityError at a test as the relying-party mismatch', async () => {
    browserRejects(() => new DOMException('The relying party ID is not valid.', 'SecurityError'))
    const { outcome, method, orchestrator } = await run('testAccess')
    expect(noteKeyOf(outcome, 'testAccess')).toBe(NOTE('relyingPartyMismatch'))
    expect(methodRunCount(method, orchestrator)).toBe(0)
  })

  it('reads InvalidStateError at enrollment as the refused note', async () => {
    browserRejects(() => new DOMException('The credential already exists.', 'InvalidStateError'))
    const { outcome, method, orchestrator } = await run('enroll')
    expect(outcome).toMatchObject({ type: 'note', note: 'refused' })
    expect(methodRunCount(method, orchestrator)).toBe(0)
  })
})

/**
 * The method's own `device-refused` reads the refused note for an external-app
 * method alone (the phone app declined). A browser-authenticator method's
 * refusal is read from the browser's own error before the method runs; a
 * `device-refused` the method returns after it ran is its typed failure, one
 * of the four verdicts.
 */
describe("the method's device-refused", () => {
  const externalDevice = () =>
    ceremony().providedMaterialDevice({ enroll: { result: {} }, sign: { proofs: '0x01' } })

  it('reads the refused note for an external-app method at a claim', async () => {
    browserAnswers()
    const method = fakeMethod({ replyFrom: replyFailure('device-refused') }, 'external-app')
    const orchestrator = fakeOrchestrator(method)
    const outcome = await hosts.createClaim({
      method,
      orchestrator,
      resolvedDevice: externalDevice()
    })
    expect(outcome).toMatchObject({ type: 'note', note: 'refused' })
    expect(creds.get).not.toHaveBeenCalled()
  })

  it('reads the refused note for an external-app method at enrollment', async () => {
    browserAnswers()
    const method = fakeMethod({ configFrom: enrollFailure('device-refused') }, 'external-app')
    const orchestrator = fakeOrchestrator(method)
    const outcome = await hosts.enroll({ method, orchestrator, resolvedDevice: externalDevice() })
    expect(outcome).toMatchObject({ type: 'note', note: 'refused' })
  })

  it('reads a verdict, not the note, for a browser-authenticator method at enrollment', async () => {
    browserAnswers()
    const method = fakeMethod({ configFrom: enrollFailure('device-refused') })
    const { outcome } = await run('enroll', method)
    expect(outcome).toMatchObject({ type: 'verdict', verdict: 'failed' })
    if (outcome.type === 'verdict') {
      expect(outcome.cause).toContain('device-refused')
    }
  })
  ;(['none', 'in-browser-prover'] as const).forEach((binding) =>
    it(`reads a verdict, not the note, for a ${binding} method at a claim`, async () => {
      browserAnswers()
      const method = fakeMethod({ replyFrom: replyFailure('device-refused') }, binding)
      const orchestrator = fakeOrchestrator(method)
      const outcome = await hosts.createClaim({
        method,
        orchestrator,
        resolvedDevice: externalDevice()
      })
      expect(outcome).toMatchObject({ type: 'verdict', verdict: 'failed' })
      if (outcome.type === 'verdict') {
        expect(outcome.cause).toContain('device-refused')
      }
    })
  )
  ;(['testAccess', 'createClaim'] as const).forEach((host) =>
    it(`reads a verdict, not the note, for a browser-authenticator method at ${host}`, async () => {
      browserAnswers()
      const method = fakeMethod({ replyFrom: replyFailure('device-refused') })
      const { outcome } = await run(host, method)
      expect(outcome).toMatchObject({ type: 'verdict', verdict: 'failed' })
      if (outcome.type === 'verdict') {
        expect(outcome.cause).toContain('device-refused')
      }
    })
  )
})

describe('a ceremony that completes', () => {
  beforeEach(() => browserAnswers())

  // The control of the tests above: the same fakes run the method once the
  // browser answers, so a zero count above is the browser error's doing.
  ;(
    [
      { host: 'enroll', call: 'create' },
      { host: 'testAccess', call: 'get' },
      { host: 'createClaim', call: 'get' }
    ] as const
  ).forEach(({ host, call }) =>
    it(`the ${host} host calls ${call} and then the method`, async () => {
      const { method, orchestrator } = await run(host)
      expect(creds[call]).toHaveBeenCalledTimes(1)
      expect(methodRunCount(method, orchestrator)).toBeGreaterThan(0)
    })
  )
})

describe('a cancel while the method still runs', () => {
  beforeEach(() => browserAnswers())

  const ANSWERS = { configFrom: CONFIG_HEX, replyFrom: PROOF_HEX, verify: 'satisfied' } as const

  const MEMBERS = [
    { host: 'enroll', member: 'configFrom' },
    { host: 'testAccess', member: 'replyFrom' },
    { host: 'testAccess', member: 'verify' },
    { host: 'createClaim', member: 'replyFrom' }
  ] as const

  ;(['answers', 'throws'] as const).forEach((settles) =>
    MEMBERS.forEach(({ host, member }) =>
      it(`reads cancelled at ${host} when the holder cancels during ${member} and it then ${settles}, and hands on no result`, async () => {
        const controller = new AbortController()
        const method = fakeMethod()
        let reached: () => void = () => undefined
        const memberRuns = new Promise<void>((resolve) => {
          reached = resolve
        })
        // The member settles only once the holder has cancelled.
        ;(method[member] as jest.Mock).mockImplementation(() => {
          reached()
          return new Promise((resolve, reject) => {
            controller.signal.addEventListener('abort', () =>
              settles === 'answers'
                ? resolve(ANSWERS[member])
                : reject(new Error('the method stopped'))
            )
          })
        })
        const orchestrator = fakeOrchestrator(method)
        const running = hosts[host]({ method, orchestrator, signal: controller.signal })
        await Promise.race([memberRuns, running])
        expect(method[member]).toHaveBeenCalledTimes(1)

        controller.abort()
        const outcome = await running
        expect(outcome).toMatchObject({ type: 'note', note: 'cancelled' })
        expect(carries(outcome.raw, { strings: [PROOF_HEX, CONFIG_HEX] })).toBe(false)
      })
    )
  )
})

describe('a device stop that arrives after a cancel', () => {
  beforeEach(() => browserAnswers())

  /** A phone that answers only once the holder has cancelled, and then with a stop. */
  const lateStopDevice = (signal: AbortSignal, stop: CeremonyStop) => {
    const settle = () =>
      new Promise<{ ok: false; stop: CeremonyStop }>((resolve) => {
        signal.addEventListener('abort', () => resolve({ ok: false, stop }))
      })
    return { enroll: jest.fn(settle), sign: jest.fn(settle) }
  }

  const STOPS: [string, () => CeremonyStop][] = [
    ['an unreachable phone', () => ceremony().unavailable('unreachable')],
    ['a refusal', () => ceremony().dismissed('refused')]
  ]

  STOPS.forEach(([title, stop]) =>
    (['enroll', 'testAccess', 'createClaim'] as const).forEach((host) =>
      it(`reads cancelled at ${host} over ${title}, and runs no method`, async () => {
        const controller = new AbortController()
        const device = lateStopDevice(controller.signal, stop())
        const method = fakeMethod({}, 'external-app')
        const orchestrator = fakeOrchestrator(method)
        const running = hosts[host]({
          method,
          orchestrator,
          resolvedDevice: device,
          signal: controller.signal
        })
        await flush()
        expect(host === 'enroll' ? device.enroll : device.sign).toHaveBeenCalledTimes(1)

        controller.abort()
        const outcome = await running
        expect(outcome).toMatchObject({ type: 'note', note: 'cancelled' })
        expect(methodRunCount(method, orchestrator)).toBe(0)
      })
    )
  )
})

describe('the material the method receives', () => {
  beforeEach(() => browserAnswers())

  const suppliedDevice = () =>
    ceremony().providedMaterialDevice({ enroll: { result: {} }, sign: { proofs: '0x01' } })

  it('carries the ceremony abort signal for an in-browser prover', async () => {
    const controller = new AbortController()
    const method = fakeMethod({}, 'in-browser-prover')
    const orchestrator = fakeOrchestrator(method)
    await hosts.createClaim({
      method,
      orchestrator,
      resolvedDevice: suppliedDevice(),
      signal: controller.signal
    })
    expect(method.replyFrom.mock.calls[0][2]).toEqual({ proofs: '0x01', signal: controller.signal })
  })

  it('carries no signal for an external-app method', async () => {
    const controller = new AbortController()
    const method = fakeMethod({}, 'external-app')
    const orchestrator = fakeOrchestrator(method)
    await hosts.enroll({
      method,
      orchestrator,
      resolvedDevice: suppliedDevice(),
      signal: controller.signal
    })
    expect(method.configFrom.mock.calls[0][1]).toEqual({ result: {} })
  })

  const proverClaimWith = async (material: unknown, signal: AbortSignal) => {
    const method = fakeMethod({}, 'in-browser-prover')
    const orchestrator = fakeOrchestrator(method)
    await hosts.createClaim({
      method,
      orchestrator,
      resolvedDevice: ceremony().providedMaterialDevice({ sign: material }),
      signal
    })
    return method.replyFrom.mock.calls[0][2]
  }

  it("keeps an in-browser prover's own signal", async () => {
    const own = new AbortController().signal
    const material = { proofs: '0x01', signal: own }
    const received = await proverClaimWith(material, new AbortController().signal)
    expect(received).toBe(material)
    expect((received as { signal: AbortSignal }).signal).toBe(own)
  })

  class ProverMaterial {
    readonly proofs = '0x01'
  }
  ;(
    [
      ['a byte array', new Uint8Array([1, 2, 3])],
      ['a class instance', new ProverMaterial()],
      ['an array', [{ proofs: '0x01' }]],
      ['a hex string', '0x01']
    ] as const
  ).forEach(([title, material]) =>
    it(`hands an in-browser prover ${title} unchanged`, async () => {
      const received = await proverClaimWith(material, new AbortController().signal)
      expect(received).toBe(material)
      expect(received).not.toHaveProperty('signal')
    })
  )
})
