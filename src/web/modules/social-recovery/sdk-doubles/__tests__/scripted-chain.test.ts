import { PRIVACY_LEVELS, type Notification } from '@web/modules/social-recovery/sdk-interfaces'

import {
  ATTEMPT_STATUSES,
  CANCELLERS,
  World,
  ZERO,
  createWorld,
  eachIt
} from '@web/modules/social-recovery/sdk-doubles/__tests__/harness'

const notes = async (world: World): Promise<Notification[]> => {
  const at = await world.provider.block('latest')
  return world.events.fetch(world.events.accountFilter(), {
    from: world.descriptor.deployedAt,
    to: at.number
  })
}

describe('scripted chain', () => {
  describe('the setup', () => {
    it('reads none through the setup client, the manager and the stream alike', async () => {
      const world = createWorld()
      world.script.setupNone()
      const state = await (await world.setupClient()).setupState()
      expect(state.hasSetup).toBe(false)
      expect((await notes(world)).filter((n) => n.kind === 'setup-committed')).toEqual([])
    })

    eachIt(PRIVACY_LEVELS)(
      'reads a %s setup consistently: SetupCommitted agrees with stateOf',
      async (level) => {
        const world = createWorld()
        world.script.setupCommitted(level)
        const onChain = await world.manager.stateOf()
        const state = await (await world.setupClient()).setupState()
        const committed = (await notes(world)).filter(
          (n): n is Extract<Notification, { kind: 'setup-committed' }> =>
            n.kind === 'setup-committed'
        )
        const last = committed[committed.length - 1]
        expect(last).toBeDefined()
        expect(last!.nonce).toBe(onChain.setupNonce)
        expect(last!.setupCommitment).toBe(onChain.setupCommitment)
        expect(last!.at.blockNumber).toBe(onChain.setupCommittedAtBlock)
        expect(state.hasSetup).toBe(true)
        expect(state.setupCommitment).toBe(onChain.setupCommitment)

        // Private shows nothing in the public field; shape-visible shows the
        // shape there and keeps the values encrypted; public is all clear.
        if (level === 'private') {
          expect(last!.publicMetadata).toBe('0x')
        } else {
          expect(last!.publicMetadata).not.toBe('0x')
        }
        expect(last!.privateMetadata).not.toBe('0x')
      }
    )
  })

  describe('the attempt', () => {
    eachIt(ATTEMPT_STATUSES.filter((s) => s !== 'cancelled'))(
      'reads a %s attempt consistently',
      async (status) => {
        const world = createWorld()
        world.script.setupCommitted('private')
        world.script.attempt(status)
        const onChain = await world.manager.stateOf()
        const record = await (await world.recoveryClient()).recoveryState()
        const setup = await (await world.setupClient()).setupState()
        const kinds = (await notes(world)).map((n) => n.kind)
        expect(record.attempt).toEqual(onChain.attempt)
        expect(record.nextAttemptId).toBe(onChain.nextAttemptId)
        const expected = {
          none: 'None',
          pending: 'Waiting',
          ready: 'Waiting',
          executed: 'Consumed'
        }[status as 'none' | 'pending' | 'ready' | 'executed']
        expect(record.attempt.state).toBe(expected)
        expect(setup.attemptActive).toBe(expected === 'Waiting')
        if (status === 'none') {
          expect(kinds).not.toContain('attempt-started')
        } else {
          expect(kinds).toContain('attempt-started')
          expect(record.nextAttemptId).toBeGreaterThan(record.attempt.attemptId)
        }
        // Ready is the wallet's own computation: consumableAfter against the
        // timestamp of the block the record pins.
        if (status === 'pending') {
          expect(record.attempt.consumableAfter).toBeGreaterThan(record.block.timestamp)
        }
        if (status === 'ready') {
          expect(record.attempt.consumableAfter).toBeLessThanOrEqual(record.block.timestamp)
        }
        if (status === 'executed') {
          expect(kinds).toContain('attempt-consumed')
        } else {
          expect(kinds).not.toContain('attempt-consumed')
        }
      }
    )

    eachIt(CANCELLERS)('reads an attempt cancelled by %s consistently', async (canceller) => {
      const world = createWorld()
      world.script.setupCommitted('private')
      world.script.attempt('cancelled', canceller)
      const onChain = await world.manager.stateOf()
      const record = await (await world.recoveryClient()).recoveryState()
      expect(record.attempt.state).toBe('Cancelled')
      expect(onChain.attempt.state).toBe('Cancelled')
      const cancelled = (await notes(world)).filter(
        (n): n is Extract<Notification, { kind: 'attempt-cancelled' }> =>
          n.kind === 'attempt-cancelled'
      )
      expect(cancelled).toHaveLength(1)
      const [note] = cancelled
      expect(note!.attemptId).toBe(record.attempt.attemptId)
      // cancelledBy derives from the raw fields.
      if (note!.vetoingMethod !== ZERO) {
        expect(note!.cancelledBy).toBe('cancelByVeto')
      } else if (note!.usedPlaces.length > 0) {
        expect(note!.cancelledBy).toBe('cancelByProofs')
      } else if (note!.canceller === ZERO) {
        expect(note!.cancelledBy).toBe('setupWrite')
      } else {
        expect(note!.cancelledBy).toBe('cancelByOwner')
      }
      if (canceller === 'account') {
        expect(note!.cancelledBy).toBe('cancelByOwner')
        expect(note!.canceller.toLowerCase()).toBe(world.account.toLowerCase())
      }
      if (canceller === 'proofs') {
        expect(note!.cancelledBy).toBe('cancelByProofs')
      }
      // The harness scripts "nobody" as a security stop's veto, the stopped
      // method authorizing the cancel; the setup write is the next test.
      if (canceller === 'nobody') {
        expect(note!.cancelledBy).toBe('cancelByVeto')
        expect(note!.vetoingMethod.toLowerCase()).toBe(
          world.descriptor.methodZkpassport.toLowerCase()
        )
        expect(note!.usedPlaces).toEqual([])
      }
    })

    it('reads a setup write over a waiting attempt as its cancel, by nobody', async () => {
      const world = createWorld()
      world.script.setupCommitted('private')
      world.script.attempt('pending')
      const { attemptId } = (await world.manager.stateOf()).attempt
      world.script.setupCommitted('shape-visible')
      const record = await (await world.recoveryClient()).recoveryState()
      expect(record.attempt.state).toBe('Cancelled')
      const cancelled = (await notes(world)).filter(
        (n): n is Extract<Notification, { kind: 'attempt-cancelled' }> =>
          n.kind === 'attempt-cancelled'
      )
      expect(cancelled).toHaveLength(1)
      const [note] = cancelled
      expect(note!.attemptId).toBe(attemptId)
      expect(note!.cancelledBy).toBe('setupWrite')
      expect(note!.canceller).toBe(ZERO)
      expect(note!.vetoingMethod).toBe(ZERO)
      expect(note!.usedPlaces).toEqual([])
    })
  })

  it('never moves time back when it spreads fewer seconds than blocks', async () => {
    const world = createWorld()
    world.script.setupCommitted('private')
    world.chain.openAttempt({ wait: 8 })
    const start = world.chain.head
    const head = world.chain.advance(5, 10)
    expect(head.number).toBe(start.number + 10)
    expect(head.timestamp).toBe(start.timestamp + 5)
    const stamps = await Promise.all(
      Array.from({ length: 11 }, (_, i) => world.provider.block(start.number + i))
    ).then((blocks) => blocks.map((b) => b.timestamp))
    stamps.forEach((t, i) => i > 0 && expect(t).toBeGreaterThanOrEqual(stamps[i - 1]!))

    const recovery = await world.recoveryClient()
    const pending = await recovery.recoveryState()
    expect(pending.attempt.consumableAfter).toBeGreaterThan(pending.block.timestamp)
    expect(world.chain.attemptStatus()).toBe('pending')
    world.chain.advance(5, 10)
    const ready = await recovery.recoveryState()
    expect(ready.attempt.consumableAfter).toBeLessThanOrEqual(ready.block.timestamp)
    expect(world.chain.attemptStatus()).toBe('ready')
  })

  eachIt([true, false])('reads authorization %s through both sides', async (held) => {
    const world = createWorld()
    world.script.setupCommitted('private')
    world.script.authorized(held)
    expect(await world.actionPart.isAuthorized()).toBe(held)
    expect((await (await world.setupClient()).setupState()).isAuthorized).toBe(held)
    expect(await (await world.builder().recoveryAction()).isAuthorized()).toBe(held)
  })

  eachIt([true, false])('reads code present %s through the fit check', async (present) => {
    const world = createWorld()
    world.script.code(present)
    expect(await world.actionPart.supportsAccount()).toBe(present)
    expect(await (await world.builder().recoveryAction()).supportsAccount()).toBe(present)
  })

  it('holds one declaration per method, read alike through the manager and the read seam', async () => {
    const world = createWorld()
    const reads = await world.builder().methodModuleReads()
    const modules = [
      world.descriptor.methodEcdsa,
      world.descriptor.methodPasskey,
      world.descriptor.methodZkpassport,
      world.descriptor.methodAadhaar
    ]
    world.script.method(world.descriptor.methodAadhaar, { paused: true })
    // eslint-disable-next-line no-restricted-syntax
    for (const module of modules) {
      /* eslint-disable no-await-in-loop */
      const [info, paused, parties] = await Promise.all([
        reads.moduleInfo(module),
        reads.paused(module),
        reads.trustedParties(module)
      ])
      expect(info.answered).toBe(true)
      expect(paused).toEqual(await world.manager.paused(module))
      expect(parties).toEqual(await world.manager.trustedParties(module))
      expect(info).toEqual(await world.manager.moduleInfo(module))
      /* eslint-enable no-await-in-loop */
    }
    expect(await reads.paused(world.descriptor.methodAadhaar)).toEqual({
      answered: true,
      value: true
    })
  })
})
