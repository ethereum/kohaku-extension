/**
 * Every write the doubles prepare is landed through `ScriptedChain.land`, as if
 * the integrator sent it, and the chain is read back through the clients, the
 * parts and the event stream.
 */
import type { LandingRevert } from '@web/modules/social-recovery/sdk-doubles'
import type {
  CancelRequest,
  Notification,
  PreparedBatch,
  PreparedCall
} from '@web/modules/social-recovery/sdk-interfaces'

import {
  createWorld,
  fillAll,
  momentOf,
  openingOf,
  PASSWORD,
  startLanded,
  World,
  ZERO
} from '@web/modules/social-recovery/sdk-doubles/__tests__/harness'

const stream = async (world: World, filter = world.events.accountFilter()) => {
  const at = await world.provider.block('latest')
  return world.events.fetch(filter, { from: world.descriptor.deployedAt, to: at.number })
}

const ofKind = <K extends Notification['kind']>(notes: Notification[], kind: K) =>
  notes.filter((n): n is Extract<Notification, { kind: K }> => n.kind === kind)

const expectClean = (prepared: PreparedCall | PreparedBatch) => {
  const calls = prepared.kind === 'batch' ? prepared.calls : [prepared]
  calls.forEach((call) => expect(call.simulation).toEqual({ ok: true, from: expect.any(String) }))
}

/** The wait the committed setup carries (harness configuration), plus a margin. */
const PAST_THE_WAIT = 432_000 + 60

describe('land, then read', () => {
  describe('commitSetup', () => {
    it('lands the arming pair: the setup stands, the account authorizes, the backup opens', async () => {
      const world = createWorld()
      const setup = await world.setupClient()
      const draft = world.draft('private')
      const before = await setup.setupState()
      const prepared = await setup.prepareCommitSetup(draft, PASSWORD)
      expectClean(prepared)
      world.chain.land(prepared)

      const state = await setup.setupState()
      expect(state.hasSetup).toBe(true)
      expect(state.isAuthorized).toBe(true)
      expect(state.setupNonce).toBe(before.setupNonce + 1n)
      expect(await world.actionPart.isAuthorized()).toBe(true)
      const committed = ofKind(await stream(world), 'setup-committed')
      expect(committed).toHaveLength(1)
      expect(committed[0]!.nonce).toBe(state.setupNonce)
      expect(committed[0]!.setupCommitment).toBe(state.setupCommitment)
      expect(committed[0]!.at.blockNumber).toBe(state.setupCommittedAtBlock)
      const kitSlotWrites = ofKind(
        await stream(world, world.events.privilegeFilter()),
        'privilege-changed'
      )
      expect(kitSlotWrites.length).toBeGreaterThan(0)
      expect(await setup.getSetup({ password: PASSWORD })).toEqual(world.configuration)
    })

    it('answers confirmSetup from the state the landing left, not from a flag alone', async () => {
      const world = createWorld()
      const setup = await world.setupClient()
      const draft = world.draft('private')
      const prepared = await setup.prepareCommitSetup(draft, PASSWORD)

      const unsent = await setup.confirmSetup(draft, prepared)
      expect(unsent.landed).toBe(false)
      expect(unsent.isAuthorized).toBe(false)
      expect(unsent.position).toBeUndefined()

      world.chain.land(prepared)
      const confirmed = await setup.confirmSetup(draft, prepared)
      const state = await setup.setupState()
      const [event] = ofKind(await stream(world), 'setup-committed')
      expect(confirmed.landed).toBe(true)
      expect(confirmed.nonce).toBe(state.setupNonce)
      expect(confirmed.setupCommitment).toBe(state.setupCommitment)
      expect(confirmed.isAuthorized).toBe(state.isAuthorized)
      expect(confirmed.isAuthorized).toBe(true)
      expect(confirmed.position).toEqual(event!.at)
      expect(confirmed.position!.blockNumber).toBe(state.setupCommittedAtBlock)
    })

    it('lands an edit on an armed account as commitSetup alone, moving the nonce', async () => {
      const world = createWorld()
      world.script.setupCommitted('private')
      world.script.authorized(true)
      const setup = await world.setupClient()
      const before = await setup.setupState()
      const prepared = await setup.prepareCommitSetup(world.draft('shape-visible'), PASSWORD)
      expect(prepared.kind).toBe('call')
      world.chain.land(prepared)
      const after = await setup.setupState()
      expect(after.setupNonce).toBe(before.setupNonce + 1n)
      expect(after.isAuthorized).toBe(true)
      const committed = ofKind(await stream(world), 'setup-committed')
      expect(committed[committed.length - 1]!.publicMetadata).not.toBe('0x')
    })
  })

  describe('clearSetup', () => {
    it('lands the leaving pair: no setup, no authorization, SetupCleared', async () => {
      const world = createWorld()
      world.script.setupCommitted('private')
      world.script.authorized(true)
      const setup = await world.setupClient()
      const before = await setup.setupState()
      const prepared = await setup.prepareClearSetup()
      expect(prepared.kind).toBe('batch')
      expectClean(prepared)
      world.chain.land(prepared)
      const state = await setup.setupState()
      expect(state.hasSetup).toBe(false)
      expect(state.isAuthorized).toBe(false)
      expect(state.setupNonce).toBe(before.setupNonce + 1n)
      const cleared = ofKind(await stream(world), 'setup-cleared')
      expect(cleared).toHaveLength(1)
      expect(cleared[0]!.nonce).toBe(state.setupNonce)
    })
  })

  describe('startAttempt', () => {
    it('lands the opening: the attempt waits under the id and the places the request carried', async () => {
      const world = createWorld()
      const { recovery, request, prepared } = await startLanded(world)
      expect(prepared.simulation).toEqual({ ok: true, from: expect.any(String) })
      const state = await recovery.recoveryState()
      expect(state.attempt.state).toBe('Waiting')
      expect(state.attempt.attemptId).toBe(request.attemptId)
      expect(state.nextAttemptId).toBe(request.attemptId + 1n)
      expect(state.attempt.consumableAfter).toBeGreaterThan(state.block.timestamp)
      const opening = await openingOf(world, request.attemptId)
      expect(opening.usedPlaces).toEqual(request.proofs.map((p) => p.place))
      expect(opening.payload).toBe(request.payload)
      expect((await (await world.setupClient()).setupState()).attemptActive).toBe(true)
    })
  })

  describe('the three cancels', () => {
    it('lands cancelByOwner: Cancelled, by the account', async () => {
      const world = createWorld()
      const { recovery, request } = await startLanded(world)
      const prepared = await recovery.prepareCancelByOwner()
      expect(prepared.simulation?.ok).toBe(true)
      world.chain.land(prepared)
      expect((await recovery.recoveryState()).attempt.state).toBe('Cancelled')
      const [note] = ofKind(await stream(world), 'attempt-cancelled')
      expect(note!.attemptId).toBe(request.attemptId)
      expect(note!.cancelledBy).toBe('cancelByOwner')
      expect(note!.canceller.toLowerCase()).toBe(world.account.toLowerCase())
      expect(note!.usedPlaces).toEqual([])
      expect(note!.vetoingMethod).toBe(ZERO)
    })

    it('lands cancelByProofs: Cancelled, by the places the cancel request filled', async () => {
      const world = createWorld()
      const { recovery, request } = await startLanded(world)
      const gathering = await recovery.initCancelGathering(world.configuration, { window: 3600 })
      const requests = recovery.getApproverRequests(gathering)
      const filled = await fillAll({
        world,
        recovery,
        orchestrator: world.orchestrator(),
        gathering,
        requests
      })
      const now = momentOf(gathering)
      const cancel = recovery.complete(filled, undefined, now) as CancelRequest
      const prepared = await recovery.prepareCancelByProofs(cancel, now)
      expect(prepared.simulation?.ok).toBe(true)
      world.chain.land(prepared)
      expect((await recovery.recoveryState()).attempt.state).toBe('Cancelled')
      const [note] = ofKind(await stream(world), 'attempt-cancelled')
      expect(note!.attemptId).toBe(request.attemptId)
      expect(note!.cancelledBy).toBe('cancelByProofs')
      expect(note!.usedPlaces).toEqual(cancel.proofs.map((p) => p.place))
    })

    it('lands cancelByProofs through the cancel checks for a cancel request carrying extra fields', async () => {
      const world = createWorld()
      const { recovery, request } = await startLanded(world)
      const gathering = await recovery.initCancelGathering(world.configuration, { window: 3600 })
      const requests = recovery.getApproverRequests(gathering)
      const filled = await fillAll({
        world,
        recovery,
        orchestrator: world.orchestrator(),
        gathering,
        requests
      })
      const now = momentOf(gathering)
      const cancel = recovery.complete(filled, undefined, now) as CancelRequest
      const carrying = { ...cancel, payload: request.payload, order: request.order }
      const prepared = await recovery.prepareCancelByProofs(carrying, now)
      expect(prepared.simulation?.ok).toBe(true)
      world.chain.land(prepared)
      expect((await recovery.recoveryState()).attempt.state).toBe('Cancelled')
      const [note] = ofKind(await stream(world), 'attempt-cancelled')
      expect(note!.attemptId).toBe(request.attemptId)
      expect(note!.cancelledBy).toBe('cancelByProofs')
      expect(note!.usedPlaces).toEqual(cancel.proofs.map((p) => p.place))
    })

    it('lands cancelByVeto: Cancelled, naming the stopped method the attempt used', async () => {
      const world = createWorld()
      const { recovery, request } = await startLanded(world)
      const [used] = (await recovery.recoveryState()).attempt.usedMethods
      world.chain.setPaused(used!, true)
      const prepared = await recovery.prepareCancelByVeto(used!)
      expect(prepared.simulation?.ok).toBe(true)
      world.chain.land(prepared)
      expect((await recovery.recoveryState()).attempt.state).toBe('Cancelled')
      const [note] = ofKind(await stream(world), 'attempt-cancelled')
      expect(note!.attemptId).toBe(request.attemptId)
      expect(note!.cancelledBy).toBe('cancelByVeto')
      expect(note!.vetoingMethod.toLowerCase()).toBe(used!.toLowerCase())
    })

    it('lands no veto prepared for an earlier attempt over the next one', async () => {
      const world = createWorld()
      const { recovery, request } = await startLanded(world)
      const [used] = (await recovery.recoveryState()).attempt.usedMethods
      world.chain.setPaused(used!, true)
      const stale = await recovery.prepareCancelByVeto(used!)
      expect(stale.simulation?.ok).toBe(true)
      world.chain.land(await recovery.prepareCancelByOwner())
      world.chain.openAttempt({
        usedMethods: [used!],
        ignoresPause: false,
        payload: request.payload
      })
      const next = (await recovery.recoveryState()).attempt
      expect(next.state).toBe('Waiting')
      expect(next.attemptId).toBe(request.attemptId + 1n)

      let thrown: unknown
      try {
        world.chain.land(stale)
      } catch (e) {
        thrown = e
      }
      expect(thrown).toBeInstanceOf(Error)
      const { code, error } = thrown as LandingRevert
      expect(code).toBe('WrongAttemptId')
      expect(error.kind === 'known' && error.args).toEqual({
        supplied: request.attemptId,
        expected: next.attemptId
      })
      expect((await recovery.recoveryState()).attempt).toEqual(next)
      const cancelled = () =>
        stream(world).then((notes) => ofKind(notes, 'attempt-cancelled').map((n) => n.attemptId))
      expect(await cancelled()).toEqual([request.attemptId])

      const fresh = await recovery.prepareCancelByVeto(used!)
      expect(fresh.simulation?.ok).toBe(true)
      world.chain.land(fresh)
      expect(await cancelled()).toEqual([request.attemptId, next.attemptId])
    })
  })

  describe('executeHandover', () => {
    it('lands the handover: Consumed, the new key installed, the removed key gone, both writes beside AttemptConsumed', async () => {
      const world = createWorld()
      const { recovery, request } = await startLanded(world)
      world.chain.advance(PAST_THE_WAIT)
      const { attempt } = await recovery.recoveryState()
      const opening = await openingOf(world, attempt.attemptId)
      const prepared = await recovery.prepareExecuteHandover(attempt, opening.payload, {
        from: world.keys.fresh
      })
      expect(prepared.simulation).toEqual({ ok: true, from: world.keys.fresh })
      const lastBlock = (await world.provider.block('latest')).number
      world.chain.land(prepared)

      expect((await recovery.recoveryState()).attempt.state).toBe('Consumed')
      expect(await world.actionPart.isAuthority(world.keys.fresh)).toBe(true)
      expect(await world.actionPart.isAuthority(world.keys.held)).toBe(false)

      const [consumed] = ofKind(await stream(world), 'attempt-consumed')
      expect(consumed!.attemptId).toBe(request.attemptId)
      expect(consumed!.at.blockNumber).toBeGreaterThan(lastBlock)
      const writes = ofKind(
        await stream(world, world.events.privilegeFilter()),
        'privilege-changed'
      ).filter((n) => n.at.blockNumber > lastBlock)
      const installed = writes.find((n) => n.addr.toLowerCase() === world.keys.fresh.toLowerCase())
      const removed = writes.find((n) => n.addr.toLowerCase() === world.keys.held.toLowerCase())
      expect(installed).toBeDefined()
      expect(removed).toBeDefined()
      expect(BigInt(installed!.priv)).not.toBe(0n)
      expect(BigInt(removed!.priv)).toBe(0n)
    })
  })
})
