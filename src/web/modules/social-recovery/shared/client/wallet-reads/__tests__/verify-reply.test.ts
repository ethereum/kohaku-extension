/**
 * The verify of a pasted reply over a provider scripted by hand: the reply is
 * checked against the request of its own place, then judged by the
 * credential's own method module through its `verify` view. Every address is
 * made up.
 */
import {
  approvalDigest,
  GATHERING_REPLY_KIND,
  GATHERING_REPLY_VERSION,
  GATHERING_REQUEST_KIND,
  GATHERING_REQUEST_VERSION,
  METHOD_ECDSA_CONFIG_ABI,
  passkeyMethod,
  POLICY_METHOD_VERIFY_ABI,
  VERDICT_MAGIC_VALUE
} from '@kohaku-eth/social-recovery'
import type { ApproverRequest, Reply } from '@kohaku-eth/social-recovery'
import {
  concat,
  decodeFunctionData,
  encodeAbiParameters,
  encodeErrorResult,
  keccak256,
  pad,
  slice,
  toFunctionSelector,
  zeroAddress
} from 'viem'
import type { Hex } from 'viem'

import { eachIt } from '@web/modules/social-recovery/shared/chrome/__fixtures__/table'
import {
  ACCOUNT,
  ACTION,
  CONTRACT_CODE,
  DESCRIPTOR,
  HEAD_TIMESTAMP,
  MANAGER,
  METHOD_ECDSA,
  METHOD_PASSKEY,
  reverting,
  scriptedProvider,
  thrownBy
} from '@web/modules/social-recovery/shared/client/__fixtures__/scripted-provider'
import type {
  ApprovalRequest,
  ScriptedProvider
} from '@web/modules/social-recovery/shared/client/__fixtures__/types'
import { providerReadFailure } from '@web/modules/social-recovery/shared/client/provider-adapter'
import type { ReplyCheckCase } from '@web/modules/social-recovery/shared/client/wallet-reads/__fixtures__/types'
import {
  createReplyCheck,
  createReplyVerify
} from '@web/modules/social-recovery/shared/client/wallet-reads'

const OTHER_WORD: Hex = '0xffffffff'
const VERIFY_SELECTOR = toFunctionSelector('verify(bytes,bytes32,bytes)')

const guardianConfigAt = (index: number): Hex =>
  encodeAbiParameters(METHOD_ECDSA_CONFIG_ABI, [pad(`0x${(index + 1).toString(16)}`, { size: 20 })])

const passkeyConfigAt = (index: number): Hex =>
  passkeyMethod().codec.encodeConfig({
    x: BigInt(index + 1),
    y: BigInt(index + 2),
    rpIdHash: pad(`0x${(index + 3).toString(16)}`)
  })

/** The request an approver of `config` under `method` at `place` answers, on an approval of the account. */
const approverRequestAt = (method: Hex, config: Hex, place: number): ApprovalRequest => ({
  kind: GATHERING_REQUEST_KIND,
  version: GATHERING_REQUEST_VERSION,
  purpose: 'approval',
  chainId: String(DESCRIPTOR.chainId),
  manager: MANAGER,
  digestVersion: DESCRIPTOR.digestVersion,
  account: ACCOUNT,
  action: ACTION,
  attemptId: '7',
  setupNonce: '3',
  setupBodyHash: keccak256('0x01'),
  payload: '0x02',
  order: { token: zeroAddress, amount: '0', payee: zeroAddress },
  validUntil: String(HEAD_TIMESTAMP + 7200),
  place,
  method,
  config,
  salt: pad(`0x${(place + 1).toString(16)}`),
  credentialHoldsCode: false
})

/** The digest the SDK derives for an approval request's place. */
const digestOfRequest = (request: ApprovalRequest): Hex =>
  approvalDigest(
    {
      chainId: Number(request.chainId),
      manager: request.manager,
      account: request.account,
      action: request.action,
      attemptId: BigInt(request.attemptId),
      setupNonce: BigInt(request.setupNonce),
      setupBodyHash: request.setupBodyHash,
      validUntil: Number(request.validUntil),
      digestVersion: request.digestVersion,
      payload: request.payload,
      order: { ...request.order, amount: BigInt(request.order.amount) }
    },
    request.place
  )

/** The reply to `request`, made against its own digest. */
const approverReplyTo = (request: ApprovalRequest, overrides: Partial<Reply> = {}): Reply => ({
  kind: GATHERING_REPLY_KIND,
  version: GATHERING_REPLY_VERSION,
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
  proof: `0x${'0f'.repeat(65)}`,
  ...overrides
})

const GUARDIAN_REQUEST = approverRequestAt(METHOD_ECDSA, guardianConfigAt(0), 0)
const PASSKEY_REQUEST = approverRequestAt(METHOD_PASSKEY, passkeyConfigAt(1), 1)

/** The `verify` calls the provider was asked, decoded, in order. */
const verifyCallsOf = (node: ScriptedProvider) =>
  node.calls
    .filter(({ data }) => slice(data, 0, 4) === VERIFY_SELECTOR)
    .map(({ to, data }) => {
      const {
        args: [config, digest, proof]
      } = decodeFunctionData({ abi: POLICY_METHOD_VERIFY_ABI, data })
      return { module: to, config, digest, proof }
    })

const answersWord = (word: Hex) => () => word

const worldOf = (verdicts: { ecdsa?: () => Hex | Error; passkey?: () => Hex | Error } = {}) => {
  const node = scriptedProvider()
  node.setCode(METHOD_ECDSA, CONTRACT_CODE)
  node.setCode(METHOD_PASSKEY, CONTRACT_CODE)
  if (verdicts.ecdsa) {
    node.answerWith(METHOD_ECDSA, VERIFY_SELECTOR, verdicts.ecdsa)
  }
  if (verdicts.passkey) {
    node.answerWith(METHOD_PASSKEY, VERIFY_SELECTOR, verdicts.passkey)
  }
  return {
    node,
    verify: createReplyVerify(node.provider),
    check: createReplyCheck(node.provider)
  }
}

describe("the module's judgement", () => {
  it("is satisfied where the guardian's module answers the magic value over the request's digest", async () => {
    const { node, verify } = worldOf({ ecdsa: answersWord(VERDICT_MAGIC_VALUE) })
    const reply = approverReplyTo(GUARDIAN_REQUEST)

    expect(await verify(GUARDIAN_REQUEST, reply)).toBe('satisfied')
    expect(verifyCallsOf(node)).toEqual([
      {
        module: METHOD_ECDSA,
        config: GUARDIAN_REQUEST.config,
        digest: digestOfRequest(GUARDIAN_REQUEST),
        proof: reply.proof
      }
    ])
  })

  it("asks the passkey's own module for a passkey's reply, never the guardian's", async () => {
    const { node, verify } = worldOf({
      ecdsa: answersWord(OTHER_WORD),
      passkey: answersWord(VERDICT_MAGIC_VALUE)
    })

    expect(await verify(PASSKEY_REQUEST, approverReplyTo(PASSKEY_REQUEST))).toBe('satisfied')
    expect(verifyCallsOf(node).map((call) => call.module)).toEqual([METHOD_PASSKEY])
  })

  it('is rejected where the module answers another word', async () => {
    const { verify } = worldOf({ ecdsa: answersWord(OTHER_WORD) })

    expect(await verify(GUARDIAN_REQUEST, approverReplyTo(GUARDIAN_REQUEST))).toBe('rejected')
  })

  it('is rejected where the magic value comes with non-zero padding, as the manager refuses it', async () => {
    const { verify } = worldOf({
      ecdsa: answersWord(`${VERDICT_MAGIC_VALUE.slice(0, -2)}01` as Hex)
    })

    expect(await verify(GUARDIAN_REQUEST, approverReplyTo(GUARDIAN_REQUEST))).toBe('rejected')
  })

  it('is rejected where the magic word is followed by a trailing word, as the manager refuses it', async () => {
    const { verify } = worldOf({
      ecdsa: answersWord(concat([VERDICT_MAGIC_VALUE, VERDICT_MAGIC_VALUE]))
    })

    expect(await verify(GUARDIAN_REQUEST, approverReplyTo(GUARDIAN_REQUEST))).toBe('rejected')
  })

  it('rejects with a read failure where the module answers no word, as an address with no code does', async () => {
    const { verify } = worldOf({ ecdsa: answersWord('0x') })

    expect(
      await thrownBy(verify(GUARDIAN_REQUEST, approverReplyTo(GUARDIAN_REQUEST)))
    ).toMatchObject({ name: 'ProviderReadFailure', read: 'call' })
  })

  it('is rejected where the module reverts on the proof', async () => {
    const { verify } = worldOf({ ecdsa: () => reverting('0x08c379a0') })

    expect(await verify(GUARDIAN_REQUEST, approverReplyTo(GUARDIAN_REQUEST))).toBe('rejected')
  })

  it('rejects with the failure where the provider could not make the read, so the check can be tried again', async () => {
    const failure = providerReadFailure('call', new Error('node down'))
    const { verify } = worldOf({ ecdsa: () => failure })

    expect(await thrownBy(verify(GUARDIAN_REQUEST, approverReplyTo(GUARDIAN_REQUEST)))).toBe(
      failure
    )
  })

  it('reads the module again on every verify', async () => {
    const { node, verify } = worldOf({ ecdsa: answersWord(VERDICT_MAGIC_VALUE) })
    const reply = approverReplyTo(GUARDIAN_REQUEST)

    await verify(GUARDIAN_REQUEST, reply)
    await verify(GUARDIAN_REQUEST, reply)

    expect(verifyCallsOf(node)).toHaveLength(2)
  })
})

const VERIFIER_NOT_FOUND = encodeErrorResult({
  abi: [{ type: 'error', name: 'Error', inputs: [{ name: 'message', type: 'string' }] }],
  errorName: 'Error',
  args: ['Verifier not found']
})

describe('the check a ceremony reads, which keeps a revert apart from a refusal', () => {
  const CASES: ReplyCheckCase[] = [
    ['a revert with a reason', () => reverting(VERIFIER_NOT_FOUND), 'reverted'],
    ['a revert that carries no data', () => reverting('0x'), 'reverted'],
    ['an answer other than the verdict word', answersWord(OTHER_WORD), 'rejected']
  ]
  CASES.forEach(([name, answer, expected]) => {
    it(`reads ${expected} for ${name}, where the pasted-reply verify reads rejected`, async () => {
      const { check, verify } = worldOf({ ecdsa: answer })
      const reply = approverReplyTo(GUARDIAN_REQUEST)

      expect(await check(GUARDIAN_REQUEST, reply)).toBe(expected)
      expect(await verify(GUARDIAN_REQUEST, reply)).toBe('rejected')
    })
  })

  it('reads satisfied for the verdict word', async () => {
    const { check } = worldOf({ ecdsa: answersWord(VERDICT_MAGIC_VALUE) })

    expect(await check(GUARDIAN_REQUEST, approverReplyTo(GUARDIAN_REQUEST))).toBe('satisfied')
  })

  it('still rejects with the read failure where the module answers no bytes or the node is down', async () => {
    const failure = providerReadFailure('call', new Error('node down'))
    const empty = worldOf({ ecdsa: answersWord('0x') })
    const down = worldOf({ ecdsa: () => failure })

    expect(
      await thrownBy(empty.check(GUARDIAN_REQUEST, approverReplyTo(GUARDIAN_REQUEST)))
    ).toMatchObject({ name: 'ProviderReadFailure', read: 'call' })
    expect(await thrownBy(down.check(GUARDIAN_REQUEST, approverReplyTo(GUARDIAN_REQUEST)))).toBe(
      failure
    )
  })
})

describe('a reply that does not answer the request', () => {
  const without = <T extends object>(value: T, field: keyof T): T =>
    Object.fromEntries(Object.entries(value).filter(([key]) => key !== field)) as T

  const CASES: [string, () => [ApproverRequest, Reply]][] = [
    [
      'a reply of another kind',
      () => [
        GUARDIAN_REQUEST,
        {
          ...approverReplyTo(GUARDIAN_REQUEST),
          kind: 'recovery-proof-request'
        } as unknown as Reply
      ]
    ],
    [
      'a reply of another version',
      () => [
        GUARDIAN_REQUEST,
        approverReplyTo(GUARDIAN_REQUEST, { version: GATHERING_REPLY_VERSION + 1 })
      ]
    ],
    [
      'a request with no setup body hash',
      () => [without(GUARDIAN_REQUEST, 'setupBodyHash'), approverReplyTo(GUARDIAN_REQUEST)]
    ],
    [
      "a reply to another place's request",
      () => [GUARDIAN_REQUEST, approverReplyTo(PASSKEY_REQUEST)]
    ],
    [
      'a reply that names another method',
      () => [GUARDIAN_REQUEST, approverReplyTo(GUARDIAN_REQUEST, { method: METHOD_PASSKEY })]
    ],
    [
      'a reply that names another config',
      () => [GUARDIAN_REQUEST, approverReplyTo(GUARDIAN_REQUEST, { config: guardianConfigAt(5) })]
    ],
    [
      'a reply made against another digest',
      () => [
        GUARDIAN_REQUEST,
        approverReplyTo(GUARDIAN_REQUEST, {
          digest: digestOfRequest({ ...GUARDIAN_REQUEST, attemptId: '8' })
        })
      ]
    ],
    [
      'a request whose manager is no address, so it makes no digest',
      () => [{ ...GUARDIAN_REQUEST, manager: '0x01' }, approverReplyTo(GUARDIAN_REQUEST)]
    ]
  ]

  eachIt(CASES)('is rejected with no read: %s', async (_name, build) => {
    const { node, verify } = worldOf({ ecdsa: answersWord(VERDICT_MAGIC_VALUE) })
    const [request, reply] = build()

    expect(await verify(request, reply)).toBe('rejected')
    expect(node.calls).toEqual([])
  })

  it('matches the method, the config and the digest whatever their case', async () => {
    const { verify } = worldOf({ ecdsa: answersWord(VERDICT_MAGIC_VALUE) })
    const reply = approverReplyTo(GUARDIAN_REQUEST)
    const upper = (value: Hex): Hex => `0x${value.slice(2).toUpperCase()}`

    expect(
      await verify(GUARDIAN_REQUEST, {
        ...reply,
        method: upper(reply.method),
        config: upper(reply.config),
        digest: upper(reply.digest)
      })
    ).toBe('satisfied')
  })

  it('never reads the manager', async () => {
    const { node, verify } = worldOf({ ecdsa: answersWord(VERDICT_MAGIC_VALUE) })

    await verify(GUARDIAN_REQUEST, approverReplyTo(GUARDIAN_REQUEST))

    expect(node.calls.map(({ to }) => to.toLowerCase())).not.toContain(MANAGER.toLowerCase())
  })
})
