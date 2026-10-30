/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "chrome-extension://cgjhdpkjghcgpplimocodhjgcceglpoj/tab.html#/social-recovery/ceremony"}
 */
/**
 * The hosts the tab runs for the identity bindings. An access test whose
 * method cannot judge its own proof, as the zkPassport method never can, is
 * judged by the chain's verdict where the resolver hands one: satisfied
 * passes, rejected fails, and a read that did not answer is unavailable with
 * retry. With no chain verdict, a proof the method cannot judge stays
 * unavailable. The page's devices receive the screen's drawing and asking
 * hooks, and the in-page prover's material the ceremony's signal.
 */
import type { Material, Reply, Verdict } from '@kohaku-eth/social-recovery'

import type {
  CeremonyAnswer,
  CeremonyCall,
  CeremonyDevice,
  CeremonyStep,
  ChainVerdict,
  DeviceCallContext,
  ResolvedCeremony
} from '@web/modules/social-recovery/shared/ceremony'
import {
  ceremony,
  fakeMethod,
  fakeOrchestrator,
  FakeOrchestrator,
  fixtureRequest,
  MethodScript,
  PASSKEY_METHOD,
  PROOF_HEX
} from '@web/modules/social-recovery/shared/ceremony/__tests__/harness'
import type {
  HostSetup,
  RejectSettle,
  ResolveSettle,
  Settle,
  VerdictLine
} from '@web/modules/social-recovery/shared/ceremony/__fixtures__/types'

const PROOFS: Material = { proofs: [{ name: 'outer_evm_count_4' }] }

/** The method's inputs, opaque to the host. */
const INPUTS: MethodScript = {
  enrollInput: { kind: 'ceremony', domain: 'kohaku.example', scope: 'recovery' },
  signingInput: { domain: 'kohaku.example', scope: 'recovery' }
}

/** A device of the phone's binding that hands `material` back at once, and records what it was given. */
const phoneDevice = (material: Material = PROOFS) => {
  const contexts: DeviceCallContext[] = []
  const device: CeremonyDevice = {
    enroll: async (_input, context) => {
      contexts.push(context)
      return { ok: true, material }
    },
    sign: async (_input, context) => {
      contexts.push(context)
      return { ok: true, material }
    }
  }
  return { device, contexts }
}

const run = async (call: CeremonyCall, setup: HostSetup = {}) => {
  const binding = setup.binding ?? 'external-app'
  const method = fakeMethod(
    { ...INPUTS, verify: setup.verdict ?? 'not-judged', ...setup.script },
    binding
  )
  const orchestrator: FakeOrchestrator = fakeOrchestrator(method)
  const phone = phoneDevice(setup.material)
  const request = fixtureRequest()
  const resolved: ResolvedCeremony = {
    orchestrator,
    method,
    methodAddress: PASSKEY_METHOD,
    params: { domain: 'kohaku.example', scope: 'recovery' },
    request,
    ...(setup.chainVerdict ? { chainVerdict: setup.chainVerdict } : {})
  }
  const outcome = await ceremony().runCeremony(
    { call, method: 'zkpassport', id: 'req-1', handOff: false },
    resolved,
    { devices: { [binding]: phone.device }, ...setup.deps }
  )
  return { outcome, orchestrator, method, request, phone }
}

const chainVerdictOf = (answer: Verdict | 'reverted' | Error) =>
  jest.fn<ReturnType<ChainVerdict>, Parameters<ChainVerdict>>(async () => {
    if (answer instanceof Error) {
      throw answer
    }
    return answer
  })

describe('the access test of a method that cannot judge its own proof', () => {
  it("passes where the chain's verdict is satisfied, read once over the request and the method's reply", async () => {
    const chainVerdict = chainVerdictOf('satisfied')
    const { outcome, orchestrator, request } = await run('testAccess', { chainVerdict })
    expect(outcome).toMatchObject({
      kind: 'verdict',
      verdict: 'passed',
      value: { proof: PROOF_HEX }
    })
    expect(chainVerdict).toHaveBeenCalledTimes(1)
    const [asked, reply] = chainVerdict.mock.calls[0]
    expect(asked).toBe(request)
    const replied = (await orchestrator.replyFrom.mock.results[0].value) as Reply
    expect(reply).toEqual(replied)
  })

  it("fails as a rejected check, with retry, where the chain's verdict is rejected", async () => {
    const { outcome } = await run('testAccess', { chainVerdict: chainVerdictOf('rejected') })
    expect(outcome).toEqual({
      kind: 'verdict',
      verdict: 'failed',
      retry: true,
      cause: 'check-rejected'
    })
  })

  it("fails as a reverted check, with retry, where the module's view reverted instead of judging", async () => {
    const { outcome } = await run('testAccess', { chainVerdict: chainVerdictOf('reverted') })
    expect(outcome).toEqual({
      kind: 'verdict',
      verdict: 'failed',
      retry: true,
      cause: 'check-reverted'
    })
  })

  it('is unavailable with retry where the chain read throws, and never shows the read failure', async () => {
    const { outcome } = await run('testAccess', {
      chainVerdict: chainVerdictOf(new Error('the node did not answer'))
    })
    expect(outcome).toEqual({
      kind: 'verdict',
      verdict: 'unavailable',
      retry: true,
      cause: 'service-unanswered'
    })
  })

  it('is unavailable with retry where the chain read throws before it returns a promise', async () => {
    const chainVerdict = jest.fn<Promise<Verdict>, Parameters<ChainVerdict>>(() => {
      throw new Error('the provider could not be built')
    })
    const { outcome } = await run('testAccess', { chainVerdict })
    expect(outcome).toEqual({
      kind: 'verdict',
      verdict: 'unavailable',
      retry: true,
      cause: 'service-unanswered'
    })
    expect(chainVerdict).toHaveBeenCalledTimes(1)
  })

  it('stays unavailable as not judged where the resolver hands no chain verdict', async () => {
    const { outcome } = await run('testAccess')
    expect(outcome).toEqual({
      kind: 'verdict',
      verdict: 'unavailable',
      retry: true,
      cause: 'not-judged'
    })
  })

  it("stays unavailable as not judged where the chain's verdict is itself not judged", async () => {
    const { outcome } = await run('testAccess', { chainVerdict: chainVerdictOf('not-judged') })
    expect(outcome).toMatchObject({ verdict: 'unavailable', cause: 'not-judged' })
  })

  it('reads an abort during the chain read as cancelled, whatever the chain answers', async () => {
    const controller = new AbortController()
    const chainVerdict = jest.fn<Promise<Verdict>, Parameters<ChainVerdict>>(async () => {
      controller.abort()
      return 'satisfied'
    })
    const { outcome } = await run('testAccess', {
      chainVerdict,
      deps: { signal: controller.signal }
    })
    expect(outcome).toEqual({ kind: 'dismissed', note: 'cancelled', detail: 'AbortError' })
  })

  it('reads an abort during a chain read that never settles as cancelled at once', async () => {
    const controller = new AbortController()
    let reading: () => void = () => undefined
    const asked = new Promise<void>((resolve) => {
      reading = resolve
    })
    const chainVerdict = jest.fn<Promise<Verdict>, Parameters<ChainVerdict>>(() => {
      reading()
      return new Promise<Verdict>(() => {})
    })
    const running = run('testAccess', { chainVerdict, deps: { signal: controller.signal } })
    await asked
    controller.abort()
    const { outcome } = await running
    expect(outcome).toEqual({ kind: 'dismissed', note: 'cancelled', detail: 'AbortError' })
    expect(chainVerdict).toHaveBeenCalledTimes(1)
  })
  ;(
    [
      ['a verdict', (settle: ResolveSettle) => settle.resolve('satisfied')],
      ['a rejection', (settle: RejectSettle) => settle.reject(new Error('late read failure'))]
    ] as const
  ).forEach(([what, finish]) =>
    it(`stays cancelled, with no unhandled rejection, where the hung read later settles with ${what}`, async () => {
      const unhandled: unknown[] = []
      const onUnhandled = (reason: unknown) => unhandled.push(reason)
      process.on('unhandledRejection', onUnhandled)
      try {
        const controller = new AbortController()
        let reading: () => void = () => undefined
        const asked = new Promise<void>((resolve) => {
          reading = resolve
        })
        const settle: Settle = {
          resolve: () => undefined,
          reject: () => undefined
        }
        const chainVerdict = jest.fn<Promise<Verdict>, Parameters<ChainVerdict>>(() => {
          reading()
          return new Promise<Verdict>((resolve, reject) => {
            settle.resolve = resolve
            settle.reject = reject
          })
        })
        const running = run('testAccess', { chainVerdict, deps: { signal: controller.signal } })
        await asked
        controller.abort()
        const { outcome } = await running
        finish(settle)
        await new Promise((resolve) => {
          setTimeout(resolve, 10)
        })
        expect(outcome).toEqual({ kind: 'dismissed', note: 'cancelled', detail: 'AbortError' })
        expect(unhandled).toEqual([])
      } finally {
        process.off('unhandledRejection', onUnhandled)
      }
    })
  )

  it('shows the checking step before it reads the chain', async () => {
    const steps: CeremonyStep[] = []
    let stepsAtRead: CeremonyStep[] = []
    const chainVerdict = jest.fn<Promise<Verdict>, Parameters<ChainVerdict>>(async () => {
      stepsAtRead = [...steps]
      return 'satisfied'
    })
    await run('testAccess', { chainVerdict, deps: { onStep: (step) => steps.push(step) } })
    expect(stepsAtRead[stepsAtRead.length - 1]).toBe('checking')
  })
})

describe("the chain's verdict where the method judges its own proof", () => {
  const LOCAL: VerdictLine[] = [
    ['satisfied', 'passed'],
    ['rejected', 'failed']
  ]
  LOCAL.forEach(([verdict, read]) =>
    it(`keeps the method's own ${verdict} verdict, read ${read}, and reads no chain`, async () => {
      const chainVerdict = chainVerdictOf(verdict === 'satisfied' ? 'rejected' : 'satisfied')
      const { outcome } = await run('testAccess', { verdict, chainVerdict })
      expect(outcome).toMatchObject({ verdict: read })
      expect(chainVerdict).not.toHaveBeenCalled()
    })
  )
  ;(['enroll', 'createClaim'] as const).forEach((call) =>
    it(`is never read at ${call}`, async () => {
      const chainVerdict = chainVerdictOf('rejected')
      const { outcome } = await run(call, { chainVerdict })
      expect(outcome).toMatchObject({ verdict: 'passed' })
      expect(chainVerdict).not.toHaveBeenCalled()
    })
  )

  it('is never read where the reply could not be made', async () => {
    const chainVerdict = chainVerdictOf('satisfied')
    const { outcome } = await run('testAccess', {
      chainVerdict,
      script: { replyFrom: { kind: 'reply-failure', cause: 'material-rejected' } }
    })
    expect(outcome).toMatchObject({ verdict: 'failed' })
    expect(chainVerdict).not.toHaveBeenCalled()
  })
})

describe("the page's devices for the identity bindings", () => {
  ;(['enroll', 'testAccess', 'createClaim'] as const).forEach((call) =>
    it(`receive the screen's drawing and asking hooks at ${call}`, async () => {
      const show = jest.fn()
      const ask = jest.fn(async (): Promise<CeremonyAnswer> => ({ kind: 'cancelled' }))
      const { phone } = await run(call, {
        chainVerdict: chainVerdictOf('satisfied'),
        deps: { show, ask }
      })
      expect(phone.contexts).toHaveLength(1)
      expect(phone.contexts[0].show).toBe(show)
      expect(phone.contexts[0].ask).toBe(ask)
      expect(phone.contexts[0].call).toBe(call)
    })
  )

  it("hands the in-page prover's material the ceremony's signal where the device set none", async () => {
    const controller = new AbortController()
    const { orchestrator } = await run('enroll', {
      binding: 'in-browser-prover',
      material: { qrData: '42' },
      deps: { signal: controller.signal }
    })
    const material = orchestrator.configFrom.mock.calls[0][2] as { signal?: AbortSignal }
    expect(material).toEqual({ qrData: '42', signal: controller.signal })
  })

  it("hands the phone's material on unchanged", async () => {
    const controller = new AbortController()
    const { orchestrator } = await run('createClaim', { deps: { signal: controller.signal } })
    expect(orchestrator.replyFrom.mock.calls[0][2]).toEqual(PROOFS)
  })
})

describe("the note of the phone's error", () => {
  ;(['enroll', 'testAccess', 'createClaim'] as const).forEach((call) =>
    it(`reads the phone's error note at ${call}`, () => {
      const outcome = ceremony().failed('phone-error', 'The chip did not answer.')
      expect(ceremony().noteKeyOfOutcome(outcome, call)).toBe(
        'socialRecovery.ceremony.phoneErrorNote'
      )
    })
  )
})
