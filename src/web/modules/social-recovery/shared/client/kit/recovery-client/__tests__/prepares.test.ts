/**
 * The deployed kit's five recovery prepares over a node scripted by hand: the
 * start and the cancellation by proofs validate the request against the
 * manager's state, the committed setup, the methods' stops and the action's
 * authority reads at one pinned block, then carry the manager's calldata; the
 * owner's and the veto's cancels and the execute carry theirs, the execute
 * with the calls the action will run. Every address is made up.
 */
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeErrorResult,
  encodeFunctionData,
  getAddress,
  type Hex,
  keccak256,
  parseAbi,
  parseAbiParameters,
  zeroAddress,
  zeroHash
} from 'viem'

import type {
  Address,
  Attempt,
  AttemptRequest,
  CancelRequest,
  Configuration,
  PreparedCall,
  ProofPlace
} from '@web/modules/social-recovery/sdk-interfaces'
import { ARBITRARY_SENDER } from '@web/modules/social-recovery/sdk-doubles/prepared'
import { eachIt } from '@web/modules/social-recovery/shared/chrome/__fixtures__/table'
import {
  defaultSaltOf,
  setupBodyOf,
  setupCommitmentOf
} from '@web/modules/social-recovery/shared/client/kit/formats'
import type {
  KitWorld,
  ScriptedAction,
  ScriptedState
} from '@web/modules/social-recovery/shared/client/kit/setup-client/__fixtures__/types'
import {
  ACCOUNT,
  ACCOUNT_CODE,
  ACTION,
  ACTION_ABI,
  DEPLOYED_AT,
  guardianAt,
  HEAD,
  HEAD_TIMESTAMP,
  KEY_A,
  KEY_B,
  KEY_VALUE,
  kitWorld,
  MANAGER,
  MANAGER_ABI,
  METHOD_ECDSA,
  METHOD_PASSKEY,
  passkeyAt,
  reverting,
  scriptAction,
  scriptMethod,
  scriptState,
  stateOfCall,
  thrownBy,
  word
} from '@web/modules/social-recovery/shared/client/kit/setup-client/__tests__/harness'

const TOKEN: Address = '0xc1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1'
const OTHER_ACCOUNT: Address = '0xd2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2'

const RECOVERY_WRITES = parseAbi([
  'function startAttempt((address account, address action, uint64 attemptId, uint64 setupNonce, bytes setupBody, bytes payload, (address token, uint256 amount, address payee) order, uint48 validUntil, (uint256 place, address method, bytes config, bytes32 salt, bytes proof)[] proofs) request)',
  'function cancelByProofs((address account, address action, uint64 attemptId, uint64 setupNonce, bytes setupBody, uint48 validUntil, (uint256 place, address method, bytes config, bytes32 salt, bytes proof)[] proofs) request)',
  'function cancelByOwner(address action)',
  'function cancelByVeto(address account, address action, uint64 attemptId, address method)',
  'function executeHandover(address account, bytes payload)',
  'function consume(address action, uint64 attemptId, bytes32 payloadHash)',
  'function setAddrPrivilege(address addr, bytes32 priv)',
  'function transfer(address to, uint256 amount) returns (bool)'
])

/** Two clauses: an ECDSA guardian or a passkey, then a second passkey. */
const CONFIG: Configuration = {
  clauses: [
    { threshold: 1, credentials: [guardianAt(0), passkeyAt(1)] },
    { threshold: 1, credentials: [passkeyAt(2)] }
  ],
  wait: 432_000n,
  ignoresPause: false
}
const CREDENTIALS = CONFIG.clauses.flatMap((clause) => clause.credentials)
const BODY = setupBodyOf(ACCOUNT, CONFIG)
const NONCE = 3n
const NEXT_ATTEMPT = 7n
const WAITING_ATTEMPT = 6n
const VALID_UNTIL = HEAD_TIMESTAMP + 7200
const NOW = HEAD_TIMESTAMP + 60
const ORDER = { token: TOKEN, amount: 5n, payee: KEY_B }

const handoverPayload = (newAuthority: Address, removedAuthority: Address): Hex =>
  encodeAbiParameters(parseAbiParameters('address, address'), [newAuthority, removedAuthority])
const PAYLOAD = handoverPayload(KEY_B, KEY_A)

const proofAt = (place: number): ProofPlace => ({
  place: BigInt(place),
  method: CREDENTIALS[place].method,
  config: CREDENTIALS[place].config,
  salt: defaultSaltOf(ACCOUNT, place),
  proof: `0x0${place + 1}`
})

const standing = (body: Hex = BODY, overrides: Partial<ScriptedState> = {}): ScriptedState => ({
  setupCommitment: setupCommitmentOf(ACCOUNT, ACTION, NONCE, body),
  setupNonce: NONCE,
  setupCommittedAtBlock: DEPLOYED_AT + 10,
  nextAttemptId: NEXT_ATTEMPT,
  ...overrides
})

const WAITING: Partial<ScriptedState> = {
  attemptState: 1,
  attemptId: WAITING_ATTEMPT,
  consumableAfter: HEAD_TIMESTAMP + 3600
}

/** A deployed account with the setup standing, KEY_A an authority, KEY_B holding nothing, no method stopped. */
const worldWith = ({
  state,
  action,
  body
}: { state?: Partial<ScriptedState>; action?: ScriptedAction; body?: Hex } = {}): KitWorld => {
  const world = kitWorld({ accountCode: ACCOUNT_CODE })
  scriptState(world.node, standing(body, state))
  scriptAction(world.node, { supportsAccount: true, authorities: [KEY_A], ...action })
  return world
}

const opening = (overrides: Partial<AttemptRequest> = {}): AttemptRequest => ({
  account: ACCOUNT,
  action: ACTION,
  attemptId: NEXT_ATTEMPT,
  setupNonce: NONCE,
  setupBody: BODY,
  payload: PAYLOAD,
  order: ORDER,
  validUntil: VALID_UNTIL,
  proofs: [proofAt(0), proofAt(2)],
  ...overrides
})

const cancellation = (overrides: Partial<CancelRequest> = {}): CancelRequest => ({
  account: ACCOUNT,
  action: ACTION,
  attemptId: WAITING_ATTEMPT,
  setupNonce: NONCE,
  setupBody: BODY,
  validUntil: VALID_UNTIL,
  proofs: [proofAt(1), proofAt(2)],
  ...overrides
})

const attemptOf = (overrides: Partial<Attempt> = {}): Attempt => ({
  state: 'Waiting',
  attemptId: WAITING_ATTEMPT,
  setupNonce: NONCE,
  consumableAfter: HEAD_TIMESTAMP - 60,
  payloadHash: keccak256(PAYLOAD),
  order: ORDER,
  usedMethods: [METHOD_ECDSA, METHOD_PASSKEY],
  ignoresPause: false,
  ...overrides
})

const errorsOf = (thrown: unknown) =>
  (thrown as { findings: { errors: { code: string; subject: string; values: unknown }[] } })
    .findings.errors

const refusalOf = async (run: Promise<unknown>) => {
  const thrown = await thrownBy(run)
  expect(thrown).toMatchObject({ name: 'ValidationRefusal', findings: { warnings: [] } })
  return errorsOf(thrown)
}

const decoded = (data: Hex) => decodeFunctionData({ abi: RECOVERY_WRITES, data })

const describedOf = (call: PreparedCall) =>
  (call.describes ?? []).map(({ to, value, data }) => ({ to, value, ...decoded(data) }))

const pinnedAtHead = (world: KitWorld) => ({ number: HEAD, hash: world.node.head.hash })

const callsTo = (world: KitWorld, to: Address, data: Hex) =>
  world.node.calls.filter(
    (call) => call.to.toLowerCase() === to.toLowerCase() && call.data === data
  )

const KEY_VALUE_CALL = encodeFunctionData({ abi: ACTION_ABI, functionName: 'KEY_VALUE' })
const PAUSED_CALL = encodeFunctionData({
  abi: parseAbi(['function paused() view returns (bool)']),
  functionName: 'paused'
})

const wrongNonce = encodeErrorResult({
  abi: MANAGER_ABI,
  errorName: 'PolicyManager_WrongSetupNonce',
  args: [2n, 3n]
})

describe('preparing the start of an attempt', () => {
  it("carries the manager's startAttempt of the request, for anyone to send, at the pinned block", async () => {
    const world = worldWith()
    const request = opening()
    const call = await world.recovery.prepareStartAttempt(request, NOW)
    expect([call.kind, call.target, call.value, call.sender]).toEqual([
      'call',
      MANAGER,
      0n,
      'anyone'
    ])
    expect(call.block).toEqual(pinnedAtHead(world))
    expect(decoded(call.data)).toEqual({
      functionName: 'startAttempt',
      args: [
        {
          ...request,
          account: getAddress(ACCOUNT),
          action: getAddress(ACTION),
          order: { ...ORDER, token: getAddress(TOKEN), payee: getAddress(KEY_B) },
          proofs: request.proofs.map((p) => ({ ...p, method: getAddress(p.method) }))
        }
      ]
    })
    expect(call.simulation).toBeUndefined()
  })

  it("reads the manager's state and the action's two authority reads at the pinned block", async () => {
    const world = worldWith()
    await world.recovery.prepareStartAttempt(opening(), NOW)
    expect(callsTo(world, MANAGER, stateOfCall())).toEqual([
      { to: MANAGER, data: stateOfCall(), block: HEAD }
    ])
    const actionReads = world.node.calls.filter(
      (call) => call.to.toLowerCase() === ACTION.toLowerCase()
    )
    expect(actionReads.map((call) => call.block)).toEqual([HEAD, HEAD])
  })

  it('refuses an expired request with its deadline and the time it was judged at', async () => {
    const world = worldWith()
    const now = VALID_UNTIL + 1
    expect(await refusalOf(world.recovery.prepareStartAttempt(opening(), now))).toEqual([
      { code: 'request.expired', subject: 'request', values: { validUntil: VALID_UNTIL, now } }
    ])
  })

  it('refuses while another attempt waits, naming it as not this gathering', async () => {
    const world = worldWith({ state: WAITING })
    expect(await refusalOf(world.recovery.prepareStartAttempt(opening(), NOW))).toEqual([
      {
        code: 'request.attempt-active',
        subject: 'request',
        values: {
          attemptId: WAITING_ATTEMPT,
          consumableAfter: HEAD_TIMESTAMP + 3600,
          ownGathering: false
        }
      }
    ])
  })

  it("refuses while this request's own attempt waits, naming it as this gathering's", async () => {
    const world = worldWith({ state: { ...WAITING, attemptId: NEXT_ATTEMPT } })
    const [error] = await refusalOf(world.recovery.prepareStartAttempt(opening(), NOW))
    expect(error).toMatchObject({
      code: 'request.attempt-active',
      values: { attemptId: NEXT_ATTEMPT, ownGathering: true }
    })
  })

  it("refuses an attempt id other than the manager's next one", async () => {
    const world = worldWith()
    const request = opening({ attemptId: NEXT_ATTEMPT + 1n })
    expect(await refusalOf(world.recovery.prepareStartAttempt(request, NOW))).toEqual([
      {
        code: 'request.attempt-id',
        subject: 'request',
        values: { attemptId: NEXT_ATTEMPT + 1n, expected: NEXT_ATTEMPT }
      }
    ])
  })

  it('refuses a setup nonce other than the committed one, with both commitments', async () => {
    const world = worldWith()
    const request = opening({ setupNonce: NONCE - 1n })
    expect(await refusalOf(world.recovery.prepareStartAttempt(request, NOW))).toEqual([
      {
        code: 'request.body-mismatch',
        subject: 'request',
        values: {
          recomputed: setupCommitmentOf(ACCOUNT, ACTION, NONCE - 1n, BODY),
          committed: setupCommitmentOf(ACCOUNT, ACTION, NONCE, BODY)
        }
      }
    ])
  })

  it('refuses a body other than the committed one, with both commitments', async () => {
    const world = worldWith()
    const other = setupBodyOf(ACCOUNT, { ...CONFIG, wait: 1n })
    const request = opening({ setupBody: other })
    expect(await refusalOf(world.recovery.prepareStartAttempt(request, NOW))).toEqual([
      {
        code: 'request.body-mismatch',
        subject: 'request',
        values: {
          recomputed: setupCommitmentOf(ACCOUNT, ACTION, NONCE, other),
          committed: setupCommitmentOf(ACCOUNT, ACTION, NONCE, BODY)
        }
      }
    ])
  })

  it("refuses a request for another account carrying this account's body and nonce", async () => {
    const world = worldWith()
    const request = opening({ account: OTHER_ACCOUNT })
    expect(await refusalOf(world.recovery.prepareStartAttempt(request, NOW))).toEqual([
      {
        code: 'request.body-mismatch',
        subject: 'request',
        values: {
          recomputed: setupCommitmentOf(OTHER_ACCOUNT, ACTION, NONCE, BODY),
          committed: setupCommitmentOf(ACCOUNT, ACTION, NONCE, BODY)
        }
      }
    ])
  })

  it('refuses proofs out of place order, naming the first place out of order', async () => {
    const world = worldWith()
    const request = opening({ proofs: [proofAt(2), proofAt(0)] })
    expect(await refusalOf(world.recovery.prepareStartAttempt(request, NOW))).toEqual([
      { code: 'proof.places-unordered', subject: 'request', values: { place: 0n } }
    ])
  })

  it('refuses proofs the rule does not accept, with the failing clause and its counts', async () => {
    const world = worldWith()
    const request = opening({ proofs: [proofAt(0), proofAt(1)] })
    expect(await refusalOf(world.recovery.prepareStartAttempt(request, NOW))).toEqual([
      {
        code: 'request.rule-unsatisfied',
        subject: 'request',
        values: { clause: 1, filled: 0, threshold: 1 }
      }
    ])
  })

  it('refuses a proof whose method is stopped, naming the place and the method', async () => {
    const world = worldWith()
    scriptMethod(world.node, METHOD_PASSKEY, { paused: word(1n) })
    expect(await refusalOf(world.recovery.prepareStartAttempt(opening(), NOW))).toEqual([
      {
        code: 'request.method-stopped',
        subject: 'request',
        values: { place: 2n, method: METHOD_PASSKEY, ignoresPause: false }
      }
    ])
  })

  it('reads no stop and refuses none where the setup ignores stops', async () => {
    const body = setupBodyOf(ACCOUNT, { ...CONFIG, ignoresPause: true })
    const world = worldWith({ body })
    scriptMethod(world.node, METHOD_PASSKEY, { paused: word(1n) })
    const call = await world.recovery.prepareStartAttempt(opening({ setupBody: body }), NOW)
    expect(call.target).toBe(MANAGER)
    expect(world.node.calls.filter((c) => c.data === PAUSED_CALL)).toEqual([])
  })

  it("throws where a method's stop read does not answer, naming the place", async () => {
    const world = worldWith()
    scriptMethod(world.node, METHOD_PASSKEY, { paused: new Error('timeout') })
    expect(await thrownBy(world.recovery.prepareStartAttempt(opening(), NOW))).toMatchObject({
      code: 'read.unanswered',
      values: { read: 'manager.paused', module: METHOD_PASSKEY, place: 2 }
    })
  })

  it('refuses a payload the action cannot decode', async () => {
    const world = worldWith()
    const request = opening({ payload: '0x1234' })
    expect(await refusalOf(world.recovery.prepareStartAttempt(request, NOW))).toEqual([
      {
        code: 'handover.malformed',
        subject: 'request',
        values: { payload: '0x1234', cause: 'undecodable' }
      }
    ])
  })

  it('refuses a payload for an action other than the deployed one as undecodable', async () => {
    const world = worldWith()
    const other: Address = '0xd1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1'
    const errors = await refusalOf(
      world.recovery.prepareStartAttempt(opening({ action: other }), NOW)
    )
    expect(errors.map((e) => e.code)).toContain('handover.malformed')
  })

  eachIt<[string, Hex, ScriptedAction, unknown]>([
    [
      'handover.malformed',
      handoverPayload(zeroAddress, KEY_A),
      {},
      { newAuthority: zeroAddress, removedAuthority: getAddress(KEY_A), cause: 'zero-key' }
    ],
    [
      'handover.same-authority',
      handoverPayload(KEY_A, KEY_A),
      {},
      { newAuthority: getAddress(KEY_A), removedAuthority: getAddress(KEY_A) }
    ],
    [
      'handover.removed-not-authority',
      PAYLOAD,
      { authorities: [] },
      { removedAuthority: getAddress(KEY_A), isAuthority: false }
    ],
    [
      'handover.new-holds-privilege',
      PAYLOAD,
      { holders: [KEY_B] },
      { newAuthority: getAddress(KEY_B), holdsAnyPrivilege: true }
    ]
  ])('refuses the handover the payload decodes to as %s', async (code, payload, action, values) => {
    const world = worldWith({ action })
    expect(await refusalOf(world.recovery.prepareStartAttempt(opening({ payload }), NOW))).toEqual([
      { code, subject: 'request', values }
    ])
  })

  it("names a revert of the manager's state read as the kit's error", async () => {
    const world = worldWith()
    world.node.answer(MANAGER, stateOfCall(), reverting(wrongNonce))
    expect(await thrownBy(world.recovery.prepareStartAttempt(opening(), NOW))).toMatchObject({
      name: 'LandingRevert',
      code: 'WrongSetupNonce',
      error: { kind: 'known', source: 'manager', name: 'WrongSetupNonce' }
    })
  })
})

describe('preparing the cancellation by proofs', () => {
  it("carries the manager's cancelByProofs of the request, for anyone to send, at the pinned block", async () => {
    const world = worldWith({ state: WAITING })
    const request = cancellation()
    const call = await world.recovery.prepareCancelByProofs(request, NOW)
    expect([call.target, call.sender, call.value]).toEqual([MANAGER, 'anyone', 0n])
    expect(call.block).toEqual(pinnedAtHead(world))
    expect(decoded(call.data)).toEqual({
      functionName: 'cancelByProofs',
      args: [
        {
          ...request,
          account: getAddress(ACCOUNT),
          action: getAddress(ACTION),
          proofs: request.proofs.map((p) => ({ ...p, method: getAddress(p.method) }))
        }
      ]
    })
  })

  it('reads no handover for a cancellation', async () => {
    const world = worldWith({ state: WAITING, action: { authorities: [] } })
    await world.recovery.prepareCancelByProofs(cancellation(), NOW)
    expect(
      world.node.calls.filter((call) => call.to.toLowerCase() === ACTION.toLowerCase())
    ).toEqual([])
  })

  it('refuses where no attempt waits, with the attempt state', async () => {
    const world = worldWith()
    expect(await refusalOf(world.recovery.prepareCancelByProofs(cancellation(), NOW))).toEqual([
      {
        code: 'request.no-active-attempt',
        subject: 'request',
        values: { action: ACTION, state: 'None' }
      }
    ])
  })

  it("refuses an attempt id other than the waiting attempt's", async () => {
    const world = worldWith({ state: WAITING })
    const request = cancellation({ attemptId: WAITING_ATTEMPT - 1n })
    expect(await refusalOf(world.recovery.prepareCancelByProofs(request, NOW))).toEqual([
      {
        code: 'request.attempt-id',
        subject: 'request',
        values: { attemptId: WAITING_ATTEMPT - 1n, expected: WAITING_ATTEMPT }
      }
    ])
  })

  it("refuses a request for another account carrying this account's body and nonce", async () => {
    const world = worldWith({ state: WAITING })
    const request = cancellation({ account: OTHER_ACCOUNT })
    expect(await refusalOf(world.recovery.prepareCancelByProofs(request, NOW))).toEqual([
      {
        code: 'request.body-mismatch',
        subject: 'request',
        values: {
          recomputed: setupCommitmentOf(OTHER_ACCOUNT, ACTION, NONCE, BODY),
          committed: setupCommitmentOf(ACCOUNT, ACTION, NONCE, BODY)
        }
      }
    ])
  })

  it('refuses an attempt judged under an earlier setup, with both nonces', async () => {
    const world = worldWith({ state: { ...WAITING, attemptSetupNonce: NONCE - 1n } })
    expect(await refusalOf(world.recovery.prepareCancelByProofs(cancellation(), NOW))).toEqual([
      {
        code: 'request.stale-attempt',
        subject: 'request',
        values: { judgedUnder: NONCE - 1n, currentNonce: NONCE }
      }
    ])
  })
})

describe("preparing the owner's cancel", () => {
  it("carries the manager's cancelByOwner of the action, sent by the account, at the pinned block", async () => {
    const world = worldWith({ state: WAITING })
    const call = await world.recovery.prepareCancelByOwner()
    expect([call.target, call.sender, call.value]).toEqual([MANAGER, 'account', 0n])
    expect(call.block).toEqual(pinnedAtHead(world))
    expect(decoded(call.data)).toEqual({
      functionName: 'cancelByOwner',
      args: [getAddress(ACTION)]
    })
    expect(world.node.calls).toEqual([])
  })
})

describe('preparing the cancel by a veto', () => {
  it("carries the manager's cancelByVeto of the waiting attempt and the method", async () => {
    const world = worldWith({ state: WAITING })
    const call = await world.recovery.prepareCancelByVeto(METHOD_PASSKEY)
    expect([call.target, call.sender, call.value]).toEqual([MANAGER, 'anyone', 0n])
    expect(call.block).toEqual(pinnedAtHead(world))
    expect(decoded(call.data)).toEqual({
      functionName: 'cancelByVeto',
      args: [getAddress(ACCOUNT), getAddress(ACTION), WAITING_ATTEMPT, getAddress(METHOD_PASSKEY)]
    })
    expect(callsTo(world, MANAGER, stateOfCall())).toEqual([
      { to: MANAGER, data: stateOfCall(), block: HEAD }
    ])
  })

  it('refuses where no attempt waits', async () => {
    const world = worldWith()
    expect(await refusalOf(world.recovery.prepareCancelByVeto(METHOD_PASSKEY))).toEqual([
      {
        code: 'request.no-active-attempt',
        subject: 'request',
        values: { action: ACTION, state: 'None' }
      }
    ])
  })

  it("names a revert of the manager's state read as the kit's error", async () => {
    const world = worldWith()
    world.node.answer(MANAGER, stateOfCall(), reverting(wrongNonce))
    expect(await thrownBy(world.recovery.prepareCancelByVeto(METHOD_PASSKEY))).toMatchObject({
      name: 'LandingRevert',
      code: 'WrongSetupNonce'
    })
  })
})

describe('preparing the execute', () => {
  it("carries the action's executeHandover of the payload, for anyone to send, at the pinned block", async () => {
    const world = worldWith({ state: WAITING })
    const call = await world.recovery.prepareExecuteHandover(attemptOf(), PAYLOAD)
    expect([call.target, call.sender, call.value]).toEqual([ACTION, 'anyone', 0n])
    expect(call.block).toEqual(pinnedAtHead(world))
    expect(decoded(call.data)).toEqual({
      functionName: 'executeHandover',
      args: [getAddress(ACCOUNT), PAYLOAD]
    })
  })

  it('describes the consume, the grant, the revoke and the payment the action will run', async () => {
    const world = worldWith({ state: WAITING })
    const call = await world.recovery.prepareExecuteHandover(attemptOf(), PAYLOAD)
    expect(describedOf(call)).toEqual([
      {
        to: MANAGER,
        value: 0n,
        functionName: 'consume',
        args: [getAddress(ACTION), WAITING_ATTEMPT, keccak256(PAYLOAD)]
      },
      {
        to: ACCOUNT,
        value: 0n,
        functionName: 'setAddrPrivilege',
        args: [getAddress(KEY_B), KEY_VALUE]
      },
      {
        to: ACCOUNT,
        value: 0n,
        functionName: 'setAddrPrivilege',
        args: [getAddress(KEY_A), zeroHash]
      },
      { to: TOKEN, value: 0n, functionName: 'transfer', args: [getAddress(KEY_B), 5n] }
    ])
    expect(callsTo(world, ACTION, KEY_VALUE_CALL)).toHaveLength(1)
  })

  it('grants the key value the action answers', async () => {
    const other: Hex = `0x${'00'.repeat(31)}07`
    const world = worldWith({ state: WAITING, action: { keyValue: other } })
    const call = await world.recovery.prepareExecuteHandover(attemptOf(), PAYLOAD)
    expect(describedOf(call)[1].args).toEqual([getAddress(KEY_B), other])
  })

  it('describes no payment where the order carries no amount', async () => {
    const world = worldWith({ state: WAITING })
    const attempt = attemptOf({ order: { token: zeroAddress, amount: 0n, payee: zeroAddress } })
    const call = await world.recovery.prepareExecuteHandover(attempt, PAYLOAD)
    expect(describedOf(call).map((d) => d.functionName)).toEqual([
      'consume',
      'setAddrPrivilege',
      'setAddrPrivilege'
    ])
  })

  it('describes a token payment to an open payee as paid to the executing sender', async () => {
    const world = worldWith({ state: WAITING })
    const attempt = attemptOf({ order: { token: TOKEN, amount: 5n, payee: zeroAddress } })
    const call = await world.recovery.prepareExecuteHandover(attempt, PAYLOAD, {
      from: OTHER_ACCOUNT
    })
    expect(describedOf(call)[3]).toEqual({
      to: TOKEN,
      value: 0n,
      functionName: 'transfer',
      args: [getAddress(OTHER_ACCOUNT), 5n]
    })
  })

  it('describes a token payment to an open payee as paid to the arbitrary sender where no sender is given', async () => {
    const world = worldWith({ state: WAITING })
    const attempt = attemptOf({ order: { token: TOKEN, amount: 5n, payee: zeroAddress } })
    const call = await world.recovery.prepareExecuteHandover(attempt, PAYLOAD)
    expect(describedOf(call)[3].args).toEqual([getAddress(ARBITRARY_SENDER), 5n])
  })

  it('keeps a fixed payee whatever sender executes', async () => {
    const world = worldWith({ state: WAITING })
    const token = await world.recovery.prepareExecuteHandover(attemptOf(), PAYLOAD, {
      from: OTHER_ACCOUNT
    })
    expect(describedOf(token)[3].args).toEqual([getAddress(KEY_B), 5n])
    const attempt = attemptOf({ order: { token: zeroAddress, amount: 5n, payee: KEY_B } })
    const native = await world.recovery.prepareExecuteHandover(attempt, PAYLOAD, {
      from: OTHER_ACCOUNT
    })
    expect(native.describes?.[3]).toEqual({ to: KEY_B, value: 5n, data: '0x' })
  })

  it('describes a native payment as the amount sent to the payee with no data', async () => {
    const world = worldWith({ state: WAITING })
    const attempt = attemptOf({ order: { token: zeroAddress, amount: 5n, payee: KEY_B } })
    const call = await world.recovery.prepareExecuteHandover(attempt, PAYLOAD)
    expect(call.describes?.[3]).toEqual({ to: KEY_B, value: 5n, data: '0x' })
  })

  it('describes a native payment to an open payee as sent to the executing sender', async () => {
    const world = worldWith({ state: WAITING })
    const attempt = attemptOf({ order: { token: zeroAddress, amount: 5n, payee: zeroAddress } })
    const call = await world.recovery.prepareExecuteHandover(attempt, PAYLOAD, {
      from: OTHER_ACCOUNT
    })
    expect(call.describes?.[3]).toEqual({ to: OTHER_ACCOUNT, value: 5n, data: '0x' })
  })

  it('describes a native payment to an open payee as sent to the arbitrary sender where no sender is given', async () => {
    const world = worldWith({ state: WAITING })
    const attempt = attemptOf({ order: { token: zeroAddress, amount: 5n, payee: zeroAddress } })
    const call = await world.recovery.prepareExecuteHandover(attempt, PAYLOAD)
    expect(call.describes?.[3]).toEqual({ to: ARBITRARY_SENDER, value: 5n, data: '0x' })
  })

  it('describes the consume and the payment alone for a payload that does not decode, and refuses nothing', async () => {
    const world = worldWith({ state: WAITING })
    const call = await world.recovery.prepareExecuteHandover(attemptOf(), '0x1234')
    expect(decoded(call.data).args).toEqual([getAddress(ACCOUNT), '0x1234'])
    expect(describedOf(call)).toEqual([
      {
        to: MANAGER,
        value: 0n,
        functionName: 'consume',
        args: [getAddress(ACTION), WAITING_ATTEMPT, keccak256('0x1234')]
      },
      { to: TOKEN, value: 0n, functionName: 'transfer', args: [getAddress(KEY_B), 5n] }
    ])
    expect(callsTo(world, ACTION, KEY_VALUE_CALL)).toEqual([])
  })

  it('describes the consume alone for an undecodable payload with no payment', async () => {
    const world = worldWith({ state: WAITING })
    const attempt = attemptOf({ order: { token: zeroAddress, amount: 0n, payee: zeroAddress } })
    const call = await world.recovery.prepareExecuteHandover(attempt, '0x')
    expect(describedOf(call).map((d) => d.functionName)).toEqual(['consume'])
  })
})
