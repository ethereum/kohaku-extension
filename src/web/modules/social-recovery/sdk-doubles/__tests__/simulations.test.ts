/**
 * A failed simulation comes back as a typed kit error, never a thrown one. Each
 * kit error below comes from the chain state that produces it, except
 * MethodStopped: the prepare's own request validation refuses a stopped method
 * first (`request.method-stopped`), so a script fails that simulation outright.
 */
import {
  ACCOUNT_NOT_ARMED,
  ACCOUNT_UNFIT,
  kitError
} from '@web/modules/social-recovery/sdk-doubles'
import type {
  AttemptRequest,
  KitError,
  PreparedBatch,
  PreparedCall,
  ValidationRefusal
} from '@web/modules/social-recovery/sdk-interfaces'

import {
  completedRequest,
  createWorld,
  expectThrown,
  openingOf,
  openRecovery,
  startLanded,
  World
} from './harness'

const PAST_THE_WAIT = 432_000 + 60

/** The typed error a prepared call's simulation carries; fails the test on a clean one. */
const failureOf = (call: PreparedCall): Extract<KitError, { kind: 'known' }> => {
  const { simulation } = call
  if (!simulation || simulation.ok)
    throw new Error(`expected a failed simulation, got ${JSON.stringify(simulation)}`)
  if (simulation.error.kind !== 'known') throw new Error('expected a known kit error')
  return simulation.error
}

const readyAttempt = async () => {
  const world = createWorld()
  const started = await startLanded(world)
  world.chain.advance(PAST_THE_WAIT)
  const { attempt } = await started.recovery.recoveryState()
  const opening = await openingOf(world, attempt.attemptId)
  return { ...started, world, attempt, payload: opening.payload }
}

describe('simulation outcomes', () => {
  it('ProofRejected: a proof its method would not accept, at its place', async () => {
    const opened = await openRecovery()
    const { request, now } = await completedRequest(opened)
    const [first, ...rest] = request.proofs
    const forged: AttemptRequest = {
      ...request,
      proofs: [{ ...first!, proof: `0x${'ab'.repeat(65)}` }, ...rest]
    }
    const error = failureOf(await opened.recovery.prepareStartAttempt(forged, now))
    expect(error.name).toBe('ProofRejected')
    expect(error.source).toBe('manager')
    expect(BigInt(error.args.place as bigint)).toBe(first!.place)
    expect(String(error.args.method).toLowerCase()).toBe(first!.method.toLowerCase())
  })

  it('MethodStopped: a scripted simulation failure comes back typed, never thrown', async () => {
    const opened = await openRecovery()
    const { request, now } = await completedRequest(opened)
    const [first] = request.proofs
    opened.world.chain.failSimulation(
      'recovery.prepareStartAttempt',
      kitError('MethodStopped', { place: first!.place, method: first!.method })
    )
    const error = failureOf(await opened.recovery.prepareStartAttempt(request, now))
    expect(error.name).toBe('MethodStopped')
    expect(error.args).toEqual({ place: first!.place, method: first!.method })
  })

  it('a method stopped before the start is the request validation’s refusal, request.method-stopped', async () => {
    const opened = await openRecovery()
    const { request, now } = await completedRequest(opened)
    opened.world.chain.setPaused(request.proofs[0]!.method, true)
    const error = (await expectThrown(() =>
      opened.recovery.prepareStartAttempt(request, now)
    )) as ValidationRefusal
    expect(error.findings.errors.map((f) => f.code)).toContain('request.method-stopped')
  })

  it('NotConsumable: an execute before the wait is over', async () => {
    const world = createWorld()
    const { recovery } = await startLanded(world)
    const { attempt } = await recovery.recoveryState()
    const opening = await openingOf(world, attempt.attemptId)
    const error = failureOf(await recovery.prepareExecuteHandover(attempt, opening.payload))
    expect(error.name).toBe('NotConsumable')
    expect(error.source).toBe('action')
  })

  it('MethodVetoedSpend: an execute while a method the attempt used is stopped', async () => {
    const { world, recovery, attempt, payload } = await readyAttempt()
    const [used] = attempt.usedMethods
    world.chain.setPaused(used!, true)
    const error = failureOf(await recovery.prepareExecuteHandover(attempt, payload))
    expect(error.name).toBe('MethodVetoedSpend')
    expect(String(error.args.method).toLowerCase()).toBe(used!.toLowerCase())
  })

  it('MalformedHandover: an execute over committed bytes the action does not decode', async () => {
    const world = createWorld()
    world.script.setupCommitted('private')
    world.script.authorized(true)
    world.chain.openAttempt({ ready: true, payload: '0x1234' })
    const recovery = await world.recoveryClient()
    const { attempt } = await recovery.recoveryState()
    const error = failureOf(await recovery.prepareExecuteHandover(attempt, '0x1234'))
    expect(error.name).toBe('MalformedHandover')
  })

  it('MethodNotUsed: a veto naming a method the attempt did not use', async () => {
    const world = createWorld()
    const { recovery } = await startLanded(world)
    const unused = world.descriptor.methodAadhaar
    world.chain.setPaused(unused, true)
    const error = failureOf(await recovery.prepareCancelByVeto(unused))
    expect(error.name).toBe('MethodNotUsed')
  })

  it('AttemptIgnoresPause: a veto against an attempt whose setup ignores stops', async () => {
    const world = createWorld()
    world.script.setupCommitted('private')
    const stoppable = world.descriptor.methodZkpassport
    world.chain.openAttempt({
      payload: world.codec.encode({
        newAuthority: world.keys.fresh,
        removedAuthority: world.keys.held
      }),
      usedMethods: [stoppable],
      ignoresPause: true
    })
    world.chain.setPaused(stoppable, true)
    const recovery = await world.recoveryClient()
    const error = failureOf(await recovery.prepareCancelByVeto(stoppable))
    expect(error.name).toBe('AttemptIgnoresPause')
  })

  it('AttemptIgnoresPause before MethodNotUsed: a veto naming an unused method against an attempt that ignores stops', async () => {
    const world = createWorld()
    world.script.setupCommitted('private')
    const { methodZkpassport: used, methodAadhaar: unused } = world.descriptor
    world.chain.openAttempt({
      payload: world.codec.encode({
        newAuthority: world.keys.fresh,
        removedAuthority: world.keys.held
      }),
      usedMethods: [used],
      ignoresPause: true
    })
    world.chain.setPaused(unused, true)
    const recovery = await world.recoveryClient()
    const prepared = await recovery.prepareCancelByVeto(unused)
    expect(failureOf(prepared).name).toBe('AttemptIgnoresPause')
    expect(() => world.chain.land(prepared)).toThrow()
    expect((await recovery.recoveryState()).attempt.state).toBe('Waiting')
  })

  it('StaleAttempt: a veto against a waiting attempt judged under an earlier setup', async () => {
    const world = createWorld()
    world.script.setupCommitted('private')
    const { setupNonce } = await world.manager.stateOf()
    const stoppable = world.descriptor.methodZkpassport
    world.chain.openAttempt({
      payload: world.codec.encode({
        newAuthority: world.keys.fresh,
        removedAuthority: world.keys.held
      }),
      usedMethods: [stoppable],
      ignoresPause: false,
      setupNonce: setupNonce - 1n
    })
    world.chain.setPaused(stoppable, true)
    const recovery = await world.recoveryClient()
    const prepared = await recovery.prepareCancelByVeto(stoppable)
    const error = failureOf(prepared)
    expect(error.name).toBe('StaleAttempt')
    expect(error.args).toEqual({ judgedUnder: setupNonce - 1n, currentNonce: setupNonce })
    expect(() => world.chain.land(prepared)).toThrow()
    expect((await recovery.recoveryState()).attempt.state).toBe('Waiting')
  })

  it('MethodNotStopped: a veto naming a used method that is not stopped', async () => {
    const world = createWorld()
    const { recovery } = await startLanded(world)
    const [used] = (await recovery.recoveryState()).attempt.usedMethods
    const error = failureOf(await recovery.prepareCancelByVeto(used!))
    expect(error.name).toBe('MethodNotStopped')
  })

  it('NoActiveAttempt: an owner’s cancel with nothing waiting', async () => {
    const world = createWorld()
    world.script.setupCommitted('private')
    const recovery = await world.recoveryClient()
    const error = failureOf(await recovery.prepareCancelByOwner())
    expect(error.name).toBe('NoActiveAttempt')
  })

  it('carries a scripted failure on the commit call of the arming batch alone', async () => {
    const world = createWorld()
    world.chain.failSimulation('setup.prepareCommitSetup', kitError('WrongSetupNonce'))
    const setup = await world.setupClient()
    const batch = (await setup.prepareCommitSetup(world.draft('private'), 'pw')) as PreparedBatch
    expect(batch.kind).toBe('batch')
    expect(batch.calls[0]!.simulation?.ok).toBe(true)
    expect(failureOf(batch.calls[1]!).name).toBe('WrongSetupNonce')
  })

  describe('an execute the account cannot run', () => {
    // With the action's authorization removed the setup is dormant, and the
    // account refuses the action's batch; an account whose code the action does
    // not serve cannot run it either. Both are the account's own revert in the
    // simulation, and a landing of the same call reverts, leaving the attempt
    // waiting.
    const refusedByAccount = async (
      script: (world: World) => void,
      name: typeof ACCOUNT_NOT_ARMED | typeof ACCOUNT_UNFIT
    ) => {
      const { world, recovery, attempt, payload } = await readyAttempt()
      script(world)
      const prepared = await recovery.prepareExecuteHandover(attempt, payload)
      const error = failureOf(prepared)
      expect(error.name).toBe(name)
      expect(error.source).toBe('account')
      expect(() => world.chain.land(prepared)).toThrow()
      const after = await recovery.recoveryState()
      expect(after.attempt.state).toBe('Waiting')
      expect(await world.actionPart.isAuthority(world.keys.held)).toBe(true)
      expect(await world.actionPart.isAuthority(world.keys.fresh)).toBe(false)
    }

    it('refuses to execute over a dormant setup', async () => {
      await refusedByAccount((world) => world.script.authorized(false), ACCOUNT_NOT_ARMED)
    })

    it('refuses to execute on an account the action does not fit', async () => {
      await refusedByAccount((world) => world.script.code(false), ACCOUNT_UNFIT)
    })
  })
})
