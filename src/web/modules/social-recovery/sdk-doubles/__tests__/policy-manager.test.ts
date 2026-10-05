import type {
  AttemptRequest,
  CancelRequest,
  ValidationRefusal
} from '@web/modules/social-recovery/sdk-interfaces'

import {
  createWorld,
  eachIt,
  expectThrown,
  fillAll,
  isAddress,
  isHex,
  momentOf,
  NO_PAYMENT,
  openRecovery
} from './harness'

describe('policy manager double', () => {
  it('reads the domain, the name, the version and the probe', async () => {
    const world = createWorld()
    const domain = await world.manager.eip712Domain()
    expect(isHex(domain.fields)).toBe(true)
    expect(typeof domain.name).toBe('string')
    expect(typeof domain.version).toBe('string')
    expect(domain.chainId).toBe(BigInt(world.descriptor.chainId))
    expect(domain.verifyingContract.toLowerCase()).toBe(world.descriptor.manager.toLowerCase())
    expect(Array.isArray(domain.extensions)).toBe(true)
    expect(typeof (await world.manager.name())).toBe('string')
    expect(typeof (await world.manager.version())).toBe('string')
    expect(typeof (await world.manager.supportsInterface('0x01ffc9a7'))).toBe('boolean')
  })

  it('hashes an approval to the digest the reply carries for that place', async () => {
    const opened = await openRecovery()
    const now = Number(opened.gathering.request.block.timestamp) + 60
    const filled = await fillAll(opened)
    const request = opened.recovery.complete(filled, undefined, now) as AttemptRequest
    const [first] = request.proofs
    const hash = await opened.world.manager.hashApproval(request, first!.place)
    expect(hash).toMatch(/^0x[0-9a-fA-F]{64}$/)
    const reply = filled.replies.find((r) => BigInt(r.place) === first!.place)!
    expect(hash).toBe(reply.digest)
    const asCancel: CancelRequest = { ...request }
    expect(await opened.world.manager.hashCancel(asCancel, first!.place)).toMatch(
      /^0x[0-9a-fA-F]{64}$/
    )
  })

  it('hashes a cancel request as a cancellation, extra fields and all', async () => {
    const world = createWorld()
    const committed = world.script.setupCommitted('private')
    world.script.attempt('pending')
    const recovery = await world.recoveryClient()
    const gathering = await recovery.initCancelGathering(committed.configuration, {
      window: 3600
    })
    const requests = recovery.getApproverRequests(gathering)
    const filled = await fillAll({
      world,
      recovery,
      orchestrator: world.orchestrator(),
      gathering,
      requests
    })
    const cancel = recovery.complete(filled, undefined, momentOf(gathering)) as CancelRequest
    expect(cancel).not.toHaveProperty('payload')
    expect(cancel).not.toHaveProperty('order')
    const [first] = cancel.proofs
    const reply = filled.replies.find((r) => BigInt(r.place) === first!.place)!
    const hash = await world.manager.hashCancel(cancel, first!.place)
    expect(hash).toBe(reply.digest)

    const carrying = { ...cancel, payload: '0x1234' as const, order: NO_PAYMENT }
    expect(await world.manager.hashCancel(carrying, first!.place)).toBe(hash)
    const asApproval: AttemptRequest = carrying
    expect(await world.manager.hashApproval(asApproval, first!.place)).not.toBe(hash)
  })

  it('hashes an approval for a place the request carries no proof for, without throwing', async () => {
    const opened = await openRecovery()
    const now = Number(opened.gathering.request.block.timestamp) + 60
    const filled = await fillAll(opened)
    const request = opened.recovery.complete(filled, undefined, now) as AttemptRequest
    const used = request.proofs.map((p) => p.place)
    const left = filled.replies.find((r) => !used.includes(BigInt(r.place)))
    expect(left).toBeDefined()
    const hash = await opened.world.manager.hashApproval(request, BigInt(left!.place))
    // The digest of one place depends on the request and the place alone, so
    // it is the one the left-out approver signed.
    expect(hash).toBe(left!.digest)
    const empty: AttemptRequest = { ...request, proofs: [] }
    expect(await opened.world.manager.hashApproval(empty, 0n)).toMatch(/^0x[0-9a-fA-F]{64}$/)
  })

  describe('the three module reads', () => {
    it('answer the scripted declaration, stop and module record', async () => {
      const world = createWorld()
      const module = world.descriptor.methodZkpassport
      const parties = {
        admin: world.keys.held,
        pendingAdmin: world.keys.fresh,
        trustedKeys: [`0x${'22'.repeat(32)}` as const],
        pauseHolder: world.keys.held,
        pendingPauseHolder: world.keys.fresh
      }
      world.script.method(module, {
        paused: true,
        trustedParties: parties,
        moduleInfo: { name: 'zkPassport', version: '1.0.0', supportsInterface: true }
      })
      expect(await world.manager.paused(module)).toEqual({ answered: true, value: true })
      expect(await world.manager.trustedParties(module)).toEqual({ answered: true, value: parties })
      expect(await world.manager.moduleInfo(module)).toEqual({
        answered: true,
        value: { name: 'zkPassport', version: '1.0.0', supportsInterface: true }
      })
    })

    eachIt(['moduleInfo', 'paused', 'trustedParties'] as const)(
      'throw a %s read scripted to fail',
      async (member) => {
        const world = createWorld()
        const module = world.descriptor.methodEcdsa
        const answered = await world.manager[member](module)
        expect(answered.answered).toBe(true)
        world.script.failRead(`manager.${member}`)
        // A scripted failure throws; the `{ answered: false }` answer is the
        // next test's.
        await expectThrown(() => world.manager[member](module))
      }
    )

    eachIt(['manager.moduleInfo', 'manager.paused', 'manager.trustedParties'] as const)(
      'answer %s scripted unanswered as { answered: false }',
      async (read) => {
        const world = createWorld()
        world.script.leaveUnanswered(read)
        const member = read.split('.')[1] as 'moduleInfo' | 'paused' | 'trustedParties'
        expect(await world.manager[member](world.descriptor.methodEcdsa)).toEqual({
          answered: false
        })
      }
    )
  })

  eachIt(['stateOf', 'eip712Domain', 'name', 'version'] as const)(
    'throws a scripted %s read failure',
    async (member) => {
      const world = createWorld()
      world.script.failRead(`manager.${member}`)
      await expectThrown(() => world.manager[member]())
    }
  )

  describe('the six prepares', () => {
    it('encode the contract’s own call with the right sender', async () => {
      const world = createWorld()
      world.script.setupCommitted('private')
      world.script.attempt('pending')
      const { manager, descriptor, account } = world
      const cases = [
        [
          await manager.prepareCommitSetup(
            descriptor.action,
            `0x${'00'.repeat(32)}`,
            1n,
            '0x',
            '0x'
          ),
          'account'
        ],
        [await manager.prepareClearSetup(descriptor.action), 'account'],
        [await manager.prepareCancelByOwner(descriptor.action), 'account'],
        [await manager.prepareStartAttempt({} as AttemptRequest), 'anyone'],
        [await manager.prepareCancelByProofs({} as CancelRequest), 'anyone'],
        [
          await manager.prepareCancelByVeto(account, descriptor.action, 1n, descriptor.methodEcdsa),
          'anyone'
        ]
      ] as const
      cases.forEach(([call, sender]) => {
        expect(call.kind).toBe('call')
        expect(call.sender).toBe(sender)
        expect(call.target.toLowerCase()).toBe(descriptor.manager.toLowerCase())
        expect(isAddress(call.target)).toBe(true)
        expect(isHex(call.data)).toBe(true)
      })
    })

    eachIt([
      'prepareCommitSetup',
      'prepareClearSetup',
      'prepareStartAttempt',
      'prepareCancelByProofs',
      'prepareCancelByOwner',
      'prepareCancelByVeto'
    ] as const)('throw %s with the scripted code', async (member) => {
      const world = createWorld()
      const { manager, descriptor, account } = world
      world.script.refuse(`manager.${member}`, 'action.unsupported')
      const run = {
        prepareCommitSetup: () =>
          manager.prepareCommitSetup(descriptor.action, `0x${'00'.repeat(32)}`, 1n, '0x', '0x'),
        prepareClearSetup: () => manager.prepareClearSetup(descriptor.action),
        prepareStartAttempt: () => manager.prepareStartAttempt({} as AttemptRequest),
        prepareCancelByProofs: () => manager.prepareCancelByProofs({} as CancelRequest),
        prepareCancelByOwner: () => manager.prepareCancelByOwner(descriptor.action),
        prepareCancelByVeto: () =>
          manager.prepareCancelByVeto(account, descriptor.action, 1n, descriptor.methodEcdsa)
      }
      const error = (await expectThrown(run[member])) as ValidationRefusal
      expect(error.findings.errors.map((f) => f.code)).toContain('action.unsupported')
    })
  })
})
