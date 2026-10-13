/**
 * The deployed kit's recovery client over a node scripted by hand: the two
 * inits read the manager's state, the restore, the removed key, the action's
 * two authority reads and the module reads, and check the digest they will
 * ask approvers to sign against the manager's own; the four record
 * operations count over the kit's ABI-encoded setup body. Every address is
 * made up.
 */
import {
  encodeAbiParameters,
  getAddress,
  type Hex,
  keccak256,
  parseAbiParameters,
  zeroAddress
} from 'viem'

import { digestOfRequest, RECORD_VERSION } from '@web/modules/social-recovery/sdk-doubles'
import type {
  ApproverReply,
  ApproverRequest,
  Configuration,
  Gathering,
  HandoverInput,
  PaymentOrder
} from '@web/modules/social-recovery/sdk-interfaces'
import {
  defaultSaltOf,
  readSetupBody,
  setupBodyOf,
  setupCommitmentOf
} from '@web/modules/social-recovery/shared/client/kit/formats'
import type {
  KitWorld,
  KitWorldOptions,
  ScriptedAction,
  ScriptedState
} from '@web/modules/social-recovery/shared/client/kit/setup-client/__fixtures__/types'
import {
  ACCOUNT,
  ACCOUNT_CODE,
  ACTION,
  DEPLOYED_AT,
  digestCallsOf,
  guardianAt,
  HASH_APPROVAL_SELECTOR,
  HEAD,
  HEAD_TIMESTAMP,
  KEY_A,
  KEY_B,
  kitWorld,
  MANAGER,
  managerDigestOf,
  METHOD_ECDSA,
  METHOD_PASSKEY,
  passkeyAt,
  scriptAction,
  scriptDigests,
  scriptMethod,
  scriptState,
  stateAnswer,
  stateOfCall,
  thrownBy,
  word
} from '@web/modules/social-recovery/shared/client/kit/setup-client/__tests__/harness'

const TOKEN = '0xc1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1'
const OTHER_WORD: Hex = `0x${'ee'.repeat(32)}`

/** Two clauses: an ECDSA guardian or a passkey, then a second passkey. */
const CONFIG: Configuration = {
  clauses: [
    { threshold: 1, credentials: [guardianAt(0), passkeyAt(1)] },
    { threshold: 1, credentials: [{ ...passkeyAt(2), label: 'Ana' }] }
  ],
  wait: 432_000n,
  ignoresPause: false
}
const BODY = setupBodyOf(ACCOUNT, CONFIG)
const NONCE = 3n
const NEXT_ATTEMPT = 7n
const ORDER: PaymentOrder = { token: TOKEN, amount: 5n, payee: KEY_B }
const WINDOW = 7200
const CONSUMABLE_AFTER = HEAD_TIMESTAMP + 3600

const standing = (overrides: Partial<ScriptedState> = {}): ScriptedState => ({
  setupCommitment: setupCommitmentOf(ACCOUNT, ACTION, NONCE, BODY),
  setupNonce: NONCE,
  setupCommittedAtBlock: DEPLOYED_AT + 10,
  nextAttemptId: NEXT_ATTEMPT,
  ...overrides
})

const WAITING: Partial<ScriptedState> = {
  attemptState: 1,
  attemptId: 6n,
  consumableAfter: CONSUMABLE_AFTER
}

/**
 * A deployed account with the setup standing, KEY_A an authority and KEY_B
 * holding nothing; the guardian method stopped with no stop holder, the
 * passkey method running with one.
 */
const worldWith = ({
  state,
  action,
  options
}: {
  state?: Partial<ScriptedState>
  action?: ScriptedAction
  options?: KitWorldOptions
} = {}): KitWorld => {
  const world = kitWorld({ accountCode: ACCOUNT_CODE, ...options })
  scriptState(world.node, standing(state))
  scriptAction(world.node, { supportsAccount: true, authorities: [KEY_A], ...action })
  scriptMethod(world.node, METHOD_ECDSA, { paused: word(1n) })
  scriptMethod(world.node, METHOD_PASSKEY, { pauseHolder: KEY_A })
  return world
}

const open = (
  world: KitWorld,
  handover: HandoverInput = { newAuthority: KEY_B },
  window = WINDOW
): Promise<Gathering> => world.recovery.initRecoveryGathering(CONFIG, handover, ORDER, { window })

const openCancel = (world: KitWorld, window = 1800): Promise<Gathering> =>
  world.recovery.initCancelGathering(CONFIG, { window })

const errorCodesOf = (thrown: unknown): string[] =>
  (thrown as { findings: { errors: { code: string }[] } }).findings.errors.map((f) => f.code)

const replyTo = (
  request: ApproverRequest,
  overrides: Partial<ApproverReply> = {}
): ApproverReply => ({
  kind: 'recovery-proof-reply',
  version: RECORD_VERSION,
  chainId: request.chainId,
  manager: request.manager,
  account: request.account,
  action: request.action,
  attemptId: request.attemptId,
  purpose: request.purpose,
  place: request.place,
  method: request.method,
  config: request.config,
  salt: request.salt,
  digest: digestOfRequest(request),
  proof: `0x0${request.place + 1}`,
  ...overrides
})

/** Files a reply at each place, in the order given. */
const filed = (world: KitWorld, gathering: Gathering, places: number[]): Gathering => {
  const requests = world.recovery.getApproverRequests(gathering)
  return places.reduce(
    (g, place) => world.recovery.addApproverReply(g, replyTo(requests[place])).gathering,
    gathering
  )
}

describe('opening an approval gathering', () => {
  it('records the request over the chain state, the handover and the pinned block', async () => {
    const world = worldWith()
    const gathering = await open(world)
    expect(gathering).toMatchObject({
      kind: 'gathering',
      version: RECORD_VERSION,
      purpose: 'approval',
      replies: []
    })
    expect(gathering.request).toEqual({
      chainId: '11155111',
      manager: MANAGER,
      digestVersion: '1',
      account: ACCOUNT,
      action: ACTION,
      block: { number: HEAD, timestamp: String(HEAD_TIMESTAMP), hash: world.node.head.hash },
      attemptId: String(NEXT_ATTEMPT),
      setupNonce: String(NONCE),
      setupBody: BODY,
      payload: encodeAbiParameters(parseAbiParameters('address, address'), [KEY_B, KEY_A]),
      order: { token: TOKEN, amount: '5', payee: KEY_B },
      validUntil: String(HEAD_TIMESTAMP + WINDOW)
    })
    expect(readSetupBody(gathering.request.setupBody).clauses.map((c) => c.threshold)).toEqual([
      1, 1
    ])
  })

  it("maps each credential to its place in body order, with the module's stop and stop holder", async () => {
    const gathering = await open(worldWith())
    expect(gathering.places).toEqual([
      {
        place: 0,
        method: METHOD_ECDSA,
        config: guardianAt(0).config,
        salt: defaultSaltOf(ACCOUNT, 0),
        standing: 'stopped',
        stoppable: false
      },
      {
        place: 1,
        method: METHOD_PASSKEY,
        config: passkeyAt(1).config,
        salt: defaultSaltOf(ACCOUNT, 1),
        standing: 'not-stopped',
        stoppable: true
      },
      {
        place: 2,
        method: METHOD_PASSKEY,
        config: passkeyAt(2).config,
        salt: defaultSaltOf(ACCOUNT, 2),
        label: 'Ana',
        standing: 'not-stopped',
        stoppable: true
      }
    ])
  })

  it("asks the manager once for place 0's digest of the request with no proofs, and it matches the approvers'", async () => {
    const world = worldWith()
    const gathering = await open(world)
    const calls = digestCallsOf(world.node)
    expect(calls).toHaveLength(1)
    expect(calls[0].functionName).toBe('hashApproval')
    expect(calls[0].args).toEqual([
      {
        account: getAddress(ACCOUNT),
        action: getAddress(ACTION),
        attemptId: NEXT_ATTEMPT,
        setupNonce: NONCE,
        setupBody: BODY,
        payload: gathering.request.payload,
        order: { token: getAddress(TOKEN), amount: 5n, payee: getAddress(KEY_B) },
        validUntil: HEAD_TIMESTAMP + WINDOW,
        proofs: []
      },
      0n
    ])
    const [first] = world.recovery.getApproverRequests(gathering)
    const asked = world.node.calls.filter(({ data }) => data.startsWith(HASH_APPROVAL_SELECTOR))
    expect(asked).toHaveLength(1)
    expect(digestOfRequest(first)).toBe(managerDigestOf(asked[0].data))
  })

  it("refuses to open where the manager's digest differs, carrying both digests", async () => {
    const honestWorld = worldWith()
    const honest = await open(honestWorld)
    const derived = digestOfRequest(honestWorld.recovery.getApproverRequests(honest)[0])
    const world = worldWith()
    scriptDigests(world.node, { approval: OTHER_WORD })
    expect(await thrownBy(open(world))).toMatchObject({
      code: 'digest.mismatch',
      values: { purpose: 'approval', derived, manager: OTHER_WORD }
    })
  })

  it("rejects as the provider does where the manager's digest read fails", async () => {
    const world = worldWith()
    const failure = new Error('timeout')
    scriptDigests(world.node, { approval: failure })
    expect(await thrownBy(open(world))).toBe(failure)
  })

  it('names the key the wallet reads where the caller names none, and takes the one it names', async () => {
    const world = worldWith()
    await open(world)
    expect(world.removedKey).toHaveBeenCalledTimes(1)
    const named = worldWith({ action: { authorities: [KEY_B] } })
    const gathering = await open(named, { newAuthority: KEY_A, removedAuthority: KEY_B })
    expect(named.removedKey).not.toHaveBeenCalled()
    expect(gathering.request.payload).toBe(
      encodeAbiParameters(parseAbiParameters('address, address'), [KEY_A, KEY_B])
    )
  })
})

describe('the refusals of an approval gathering', () => {
  it('refuses while an attempt waits, before any digest is asked', async () => {
    const world = worldWith({ state: WAITING })
    const thrown = await thrownBy(open(world))
    expect(thrown).toMatchObject({
      name: 'ValidationRefusal',
      findings: {
        errors: [
          {
            code: 'request.attempt-active',
            values: { attemptId: 6n, consumableAfter: CONSUMABLE_AFTER, ownGathering: false }
          }
        ]
      }
    })
    expect(digestCallsOf(world.node)).toEqual([])
  })

  it('refuses where the removed key cannot be named, with the cause', async () => {
    const world = worldWith({
      options: { removedKey: { kind: 'unavailable', cause: 'several-key-entries' } }
    })
    const thrown = await thrownBy(open(world))
    expect(errorCodesOf(thrown)).toEqual(['handover.removed-unknown'])
    expect(thrown).toMatchObject({
      findings: { errors: [{ values: { account: ACCOUNT, cause: 'several-key-entries' } }] }
    })
  })

  const HANDOVER_CASES: [string, HandoverInput, ScriptedAction, string][] = [
    ['a zero key', { newAuthority: zeroAddress }, {}, 'handover.malformed'],
    ['one key on both sides', { newAuthority: KEY_A }, {}, 'handover.same-authority'],
    [
      'a removed key the action holds no authority for',
      { newAuthority: KEY_B },
      { authorities: [] },
      'handover.removed-not-authority'
    ],
    [
      'a new key that already holds a privilege',
      { newAuthority: KEY_B },
      { holders: [KEY_B] },
      'handover.new-holds-privilege'
    ]
  ]
  HANDOVER_CASES.forEach(([name, handover, action, code]) =>
    it(`refuses ${name}`, async () => {
      const world = worldWith({ action })
      expect(errorCodesOf(await thrownBy(open(world, handover)))).toEqual([code])
      expect(digestCallsOf(world.node)).toEqual([])
    })
  )

  it("refuses where a method's stop read does not answer, naming the place", async () => {
    const world = worldWith()
    scriptMethod(world.node, METHOD_PASSKEY, { paused: new Error('timeout') })
    expect(await thrownBy(open(world))).toMatchObject({
      code: 'read.unanswered',
      values: { read: 'manager.paused', module: METHOD_PASSKEY, place: 1 }
    })
  })

  it('refuses a configuration whose commitment is not the one the init read', async () => {
    // The restore pins a later block: a setup write landing between the two
    // reads must not join this init's nonce to the next setup's body.
    const later: Configuration = { ...CONFIG, wait: 500_000n }
    const laterBody = setupBodyOf(ACCOUNT, later)
    const world = kitWorld({ accountCode: ACCOUNT_CODE })
    let reads = 0
    world.node.answer(MANAGER, stateOfCall(), () =>
      stateAnswer(
        reads++ === 0
          ? standing()
          : standing({
              setupNonce: NONCE + 1n,
              setupCommitment: setupCommitmentOf(ACCOUNT, ACTION, NONCE + 1n, laterBody)
            })
      )
    )
    scriptAction(world.node, { supportsAccount: true, authorities: [KEY_A] })
    scriptMethod(world.node, METHOD_ECDSA, { paused: word(1n) })
    scriptMethod(world.node, METHOD_PASSKEY, { pauseHolder: KEY_A })
    const thrown = await thrownBy(
      world.recovery.initRecoveryGathering(later, { newAuthority: KEY_B }, ORDER, {
        window: WINDOW
      })
    )
    expect(thrown).toMatchObject({ cause: { code: 'restore.commitment-mismatch' } })
    expect(digestCallsOf(world.node)).toHaveLength(0)
  })
})

describe('opening a cancellation gathering', () => {
  it('records the waiting attempt and its wait, with no payload and no order', async () => {
    const world = worldWith({ state: WAITING })
    const gathering = await openCancel(world)
    expect(gathering.purpose).toBe('cancellation')
    expect(gathering.request).toEqual({
      chainId: '11155111',
      manager: MANAGER,
      digestVersion: '1',
      account: ACCOUNT,
      action: ACTION,
      block: { number: HEAD, timestamp: String(HEAD_TIMESTAMP), hash: world.node.head.hash },
      attemptId: '6',
      setupNonce: String(NONCE),
      setupBody: BODY,
      validUntil: String(HEAD_TIMESTAMP + 1800),
      consumableAfter: String(CONSUMABLE_AFTER)
    })
    const calls = digestCallsOf(world.node)
    expect(calls.map((c) => c.functionName)).toEqual(['hashCancel'])
    expect(calls[0].args).toEqual([
      {
        account: getAddress(ACCOUNT),
        action: getAddress(ACTION),
        attemptId: 6n,
        setupNonce: NONCE,
        setupBody: BODY,
        validUntil: HEAD_TIMESTAMP + 1800,
        proofs: []
      },
      0n
    ])
  })

  it("refuses where the manager's cancellation digest differs", async () => {
    const world = worldWith({ state: WAITING })
    scriptDigests(world.node, { cancel: OTHER_WORD })
    expect(await thrownBy(openCancel(world))).toMatchObject({
      code: 'digest.mismatch',
      values: { purpose: 'cancellation', manager: OTHER_WORD }
    })
  })

  it('refuses where no attempt waits', async () => {
    const thrown = await thrownBy(openCancel(worldWith()))
    expect(thrown).toMatchObject({
      findings: {
        errors: [{ code: 'request.no-active-attempt', values: { action: ACTION, state: 'None' } }]
      }
    })
  })
})

describe("the approvers' requests", () => {
  it('give each place its credential and the hash of the body, with the payload and the order on an approval only', async () => {
    const approvalWorld = worldWith()
    const approval = await open(approvalWorld)
    const requests = approvalWorld.recovery.getApproverRequests(approval)
    expect(requests.map((r) => [r.place, r.method, r.config, r.salt])).toEqual(
      approval.places.map((p) => [p.place, p.method, p.config, p.salt])
    )
    requests.forEach((r) => {
      expect(r.setupBodyHash).toBe(keccak256(BODY))
      expect(r.payload).toBe(approval.request.payload)
      expect(r.order).toEqual(approval.request.order)
    })

    const cancelWorld = worldWith({ state: WAITING })
    const cancel = await openCancel(cancelWorld)
    cancelWorld.recovery.getApproverRequests(cancel).forEach((r) => {
      expect(r.purpose).toBe('cancellation')
      expect(r).not.toHaveProperty('payload')
      expect(r).not.toHaveProperty('order')
    })
  })
})

describe('filing a reply', () => {
  it('files a reply that signs its place digest, and replaces an earlier one at that place', async () => {
    const world = worldWith()
    const gathering = await open(world)
    const [first] = world.recovery.getApproverRequests(gathering)
    const reply = replyTo(first)
    const added = world.recovery.addApproverReply(gathering, reply)
    expect(added.reason).toBeUndefined()
    expect(added.gathering.replies).toEqual([reply])
    const again = replyTo(first, { proof: '0x99' })
    const replaced = world.recovery.addApproverReply(added.gathering, again)
    expect(replaced.gathering.replies).toEqual([again])
    expect(replaced.displaced).toEqual(reply)
  })

  const REFUSED: [string, (request: ApproverRequest) => ApproverReply][] = [
    ['version-unread', (r) => ({ ...replyTo(r), version: RECORD_VERSION + 1 })],
    ['binding-mismatch', (r) => replyTo(r, { attemptId: '8' })],
    ['place-unknown', (r) => replyTo(r, { place: 9 })],
    ['credential-mismatch', (r) => replyTo(r, { salt: OTHER_WORD })],
    ['digest-mismatch', (r) => replyTo(r, { digest: OTHER_WORD })]
  ]
  REFUSED.forEach(([cause, build]) =>
    it(`refuses a reply as ${cause} and keeps the gathering`, async () => {
      const world = worldWith()
      const gathering = await open(world)
      const [first] = world.recovery.getApproverRequests(gathering)
      const result = world.recovery.addApproverReply(gathering, build(first))
      expect(result.reason).toEqual({ kind: 'add-refusal', cause })
      expect(result.gathering).toBe(gathering)
    })
  )
})

describe('assessing a gathering', () => {
  it('counts the filed places per clause of the body', async () => {
    const world = worldWith()
    const gathering = await open(world)
    const one = world.recovery.assess(filed(world, gathering, [0]), HEAD_TIMESTAMP)
    expect(one).toEqual({
      filled: [0],
      missing: [1, 2],
      clauses: [
        { clause: 0, threshold: 1, filled: 1 },
        { clause: 1, threshold: 1, filled: 0 }
      ],
      ruleSatisfied: false,
      findings: []
    })
    const two = world.recovery.assess(filed(world, gathering, [2, 0]), HEAD_TIMESTAMP)
    expect([two.filled, two.missing, two.ruleSatisfied]).toEqual([[0, 2], [1], true])
  })

  it('names an expired request and a moment far from the pinned one', async () => {
    const world = worldWith()
    const gathering = await open(world)
    const late = world.recovery.assess(gathering, HEAD_TIMESTAMP + WINDOW + 1)
    expect(late.findings.map((f) => f.code)).toEqual(['request.expired', 'request.moment-skew'])
    const skewed = world.recovery.assess(gathering, HEAD_TIMESTAMP + 1000)
    expect(skewed.findings.map((f) => f.code)).toEqual(['request.moment-skew'])
  })

  it("names a window under the configuration's floor", async () => {
    const short = worldWith()
    const gathering = await open(short, { newAuthority: KEY_B }, 600)
    expect(short.recovery.assess(gathering, HEAD_TIMESTAMP).findings).toEqual([
      expect.objectContaining({
        code: 'request.window-short',
        values: { window: 600, floor: 3600 }
      })
    ])
    const lowFloor = worldWith({
      options: { config: { requestWindow: { default: 600, floor: 60, ceiling: 7200 } } }
    })
    const allowed = await open(lowFloor, { newAuthority: KEY_B }, 600)
    expect(lowFloor.recovery.assess(allowed, HEAD_TIMESTAMP).findings).toEqual([])
  })

  it('names a cancellation window that outlasts the wait', async () => {
    const world = worldWith({ state: WAITING })
    const gathering = await openCancel(world, 7200)
    expect(world.recovery.assess(gathering, HEAD_TIMESTAMP).findings).toEqual([
      expect.objectContaining({
        code: 'cancel.window-late',
        values: { validUntil: HEAD_TIMESTAMP + 7200, consumableAfter: CONSUMABLE_AFTER }
      })
    ])
  })
})

describe('completing a gathering', () => {
  it('refuses a rule the filed replies do not satisfy', async () => {
    const world = worldWith()
    const gathering = filed(world, await open(world), [0])
    const thrown = (() => {
      try {
        world.recovery.complete(gathering, undefined, HEAD_TIMESTAMP)
      } catch (error: unknown) {
        return error
      }
      return undefined
    })()
    expect(errorCodesOf(thrown)).toEqual(['request.rule-unsatisfied'])
  })

  it('builds the request over a selection, its proofs in place order', async () => {
    const world = worldWith()
    const gathering = filed(world, await open(world), [0, 1, 2])
    const request = world.recovery.complete(gathering, [2, 0], HEAD_TIMESTAMP)
    expect(request).toEqual({
      account: ACCOUNT,
      action: ACTION,
      attemptId: NEXT_ATTEMPT,
      setupNonce: NONCE,
      setupBody: BODY,
      validUntil: HEAD_TIMESTAMP + WINDOW,
      payload: gathering.request.payload,
      order: ORDER,
      proofs: [0, 2].map((place) => ({
        place: BigInt(place),
        method: gathering.places[place].method,
        config: gathering.places[place].config,
        salt: gathering.places[place].salt,
        proof: `0x0${place + 1}`
      }))
    })
    expect(() => world.recovery.complete(gathering, [0], HEAD_TIMESTAMP)).toThrow()
  })

  it('ranks a set on a stopped method last, even where its reply was filed first', async () => {
    const world = worldWith()
    const gathering = filed(world, await open(world), [0, 1, 2])
    const request = world.recovery.complete(gathering, undefined, HEAD_TIMESTAMP)
    expect(request.proofs.map((p) => p.place)).toEqual([1n, 2n])
  })
})

describe('the recovery-side state', () => {
  it('carries the manager state, the removed key and the pinned block', async () => {
    const world = worldWith({ state: WAITING })
    const state = await world.recovery.recoveryState()
    expect(state).toMatchObject({
      nextAttemptId: NEXT_ATTEMPT,
      setupCommitment: standing().setupCommitment,
      setupNonce: NONCE,
      removedKey: KEY_A,
      block: world.node.head
    })
    expect(state.attempt).toMatchObject({
      state: 'Waiting',
      attemptId: 6n,
      consumableAfter: CONSUMABLE_AFTER
    })
  })

  it('reads a removed key the wallet cannot name as no creation triple', async () => {
    const world = worldWith({
      options: { removedKey: { kind: 'unavailable', cause: 'no-creation-record' } }
    })
    await expect(world.recovery.recoveryState()).resolves.toMatchObject({
      removedKey: 'no-creation-triple'
    })
  })
})

describe('the members not served yet', () => {
  const PREPARES = [
    'prepareStartAttempt',
    'prepareCancelByProofs',
    'prepareCancelByOwner',
    'prepareCancelByVeto',
    'prepareExecuteHandover'
  ] as const
  PREPARES.forEach((member) =>
    it(`rejects recovery.${member} by name, with no read`, async () => {
      const world = worldWith()
      const run = world.recovery[member] as () => Promise<unknown>
      expect(await thrownBy(run())).toMatchObject({
        name: 'NotServedRefusal',
        member: `recovery.${member}`
      })
      expect(world.node.calls).toEqual([])
    })
  )

  it('refuses the events feed by name', async () => {
    const { events } = worldWith().recovery
    const accountFilter = events.accountFilter as () => unknown
    expect(accountFilter).toThrow(
      expect.objectContaining({ member: 'recovery.events.accountFilter' })
    )
    const fetch = events.fetch as () => Promise<unknown>
    expect(await thrownBy(fetch())).toMatchObject({ member: 'recovery.events.fetch' })
  })
})
