/**
 * The verify of a pasted reply over a node scripted by hand: the reply is
 * checked against the request of its own place, then judged by the
 * credential's own method module through its `verify` view. Every address is
 * made up.
 */
import { concat, pad, toFunctionSelector } from 'viem'

import type { Hex } from 'viem'

import { digestOfRequest } from '@web/modules/social-recovery/sdk-doubles'
import type { ApproverReply, ApproverRequest } from '@web/modules/social-recovery/sdk-interfaces'
import { eachIt } from '@web/modules/social-recovery/shared/chrome/__fixtures__/table'
import {
  createActionReads,
  createMethodReads
} from '@web/modules/social-recovery/shared/client/kit/reads'
import type { ScriptedMethod } from '@web/modules/social-recovery/shared/client/kit/setup-client/__fixtures__/types'
import {
  ACCOUNT,
  ACTION,
  approverReplyTo,
  approverRequestAt,
  fakeNode,
  guardianAt,
  MANAGER,
  METHOD_ECDSA,
  METHOD_PASSKEY,
  passkeyAt,
  reverting,
  scriptMethod,
  thrownBy,
  VERIFY_MAGIC,
  verifyCallsOf
} from '@web/modules/social-recovery/shared/client/kit/setup-client/__tests__/harness'
import { createKitWalletReads } from '@web/modules/social-recovery/shared/client/kit/wallet-reads'
import { providerReadFailure } from '@web/modules/social-recovery/shared/client/provider-adapter'

const GUARDIAN_REQUEST = approverRequestAt(guardianAt(0), 0)
const PASSKEY_REQUEST = approverRequestAt(passkeyAt(1), 1)
const OTHER_WORD: Hex = '0xffffffff'
const VERIFY_SELECTOR = toFunctionSelector('verify(bytes,bytes32,bytes)')
const MAGIC_WORD = pad(VERIFY_MAGIC, { dir: 'right', size: 32 })

const worldOf = (scripts: { ecdsa?: ScriptedMethod; passkey?: ScriptedMethod } = {}) => {
  const node = fakeNode()
  scriptMethod(node, METHOD_ECDSA, scripts.ecdsa)
  scriptMethod(node, METHOD_PASSKEY, scripts.passkey)
  const reads = createKitWalletReads({
    account: { addr: ACCOUNT, associatedKeys: [], initialPrivileges: [], creation: null },
    action: createActionReads({ provider: node.provider, codeRead: node.codeRead }, ACTION),
    moduleReads: createMethodReads(node.provider),
    codeRead: node.codeRead,
    provider: node.provider
  })
  return { node, verify: reads.verifyReply }
}

describe("the module's judgement", () => {
  it("is satisfied where the guardian's module answers the magic value over the request's digest", async () => {
    const { node, verify } = worldOf({ ecdsa: { verify: VERIFY_MAGIC } })
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
      ecdsa: { verify: OTHER_WORD },
      passkey: { verify: VERIFY_MAGIC }
    })

    expect(await verify(PASSKEY_REQUEST, approverReplyTo(PASSKEY_REQUEST))).toBe('satisfied')
    expect(verifyCallsOf(node).map((call) => call.module)).toEqual([METHOD_PASSKEY])
  })

  it('is rejected where the module answers another word', async () => {
    const { verify } = worldOf({ ecdsa: { verify: OTHER_WORD } })

    expect(await verify(GUARDIAN_REQUEST, approverReplyTo(GUARDIAN_REQUEST))).toBe('rejected')
  })

  it('is rejected where the magic value comes with non-zero padding, as the manager refuses it', async () => {
    const { node, verify } = worldOf()
    node.answerWith(METHOD_ECDSA, VERIFY_SELECTOR, () => `${MAGIC_WORD.slice(0, -2)}01` as Hex)

    expect(await verify(GUARDIAN_REQUEST, approverReplyTo(GUARDIAN_REQUEST))).toBe('rejected')
  })

  it('is rejected where the magic word is followed by a trailing word, as the manager refuses it', async () => {
    const { node, verify } = worldOf()
    node.answerWith(METHOD_ECDSA, VERIFY_SELECTOR, () => concat([MAGIC_WORD, MAGIC_WORD]))

    expect(await verify(GUARDIAN_REQUEST, approverReplyTo(GUARDIAN_REQUEST))).toBe('rejected')
  })

  it('is rejected where the module reverts on the proof', async () => {
    const { verify } = worldOf({ ecdsa: { verify: reverting('0x08c379a0') } })

    expect(await verify(GUARDIAN_REQUEST, approverReplyTo(GUARDIAN_REQUEST))).toBe('rejected')
  })

  it('rejects with the failure where the provider could not make the read, so the check can be tried again', async () => {
    const failure = providerReadFailure('call', new Error('node down'))
    const { verify } = worldOf({ ecdsa: { verify: failure } })

    expect(await thrownBy(verify(GUARDIAN_REQUEST, approverReplyTo(GUARDIAN_REQUEST)))).toBe(
      failure
    )
  })

  it('rejects with the failure where every view of the module fails, whatever its verify would answer', async () => {
    const failure = providerReadFailure('call', new Error('node down'))
    const { verify } = worldOf({ ecdsa: { views: failure, verify: VERIFY_MAGIC } })

    expect(await thrownBy(verify(GUARDIAN_REQUEST, approverReplyTo(GUARDIAN_REQUEST)))).toBe(
      failure
    )
  })

  it('rejects with a read failure where the module answers no word, as an address with no code does', async () => {
    const { node, verify } = worldOf()
    node.answerWith(METHOD_ECDSA, VERIFY_SELECTOR, () => '0x')

    expect(
      await thrownBy(verify(GUARDIAN_REQUEST, approverReplyTo(GUARDIAN_REQUEST)))
    ).toMatchObject({ name: 'ProviderReadFailure', read: 'call' })
  })

  it('reads the module again on every verify', async () => {
    const { node, verify } = worldOf({ ecdsa: { verify: VERIFY_MAGIC } })
    const reply = approverReplyTo(GUARDIAN_REQUEST)

    await verify(GUARDIAN_REQUEST, reply)
    await verify(GUARDIAN_REQUEST, reply)

    expect(verifyCallsOf(node)).toHaveLength(2)
  })
})

describe('a reply that does not answer the request', () => {
  const without = <T extends object>(value: T, field: keyof T): T =>
    Object.fromEntries(Object.entries(value).filter(([key]) => key !== field)) as T

  const CASES: [string, () => [ApproverRequest, ApproverReply]][] = [
    [
      'a reply with no proof',
      () => [GUARDIAN_REQUEST, without(approverReplyTo(GUARDIAN_REQUEST), 'proof')]
    ],
    [
      'a reply of another kind',
      () => [
        GUARDIAN_REQUEST,
        {
          ...approverReplyTo(GUARDIAN_REQUEST),
          kind: 'recovery-proof-request'
        } as unknown as ApproverReply
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
      () => [GUARDIAN_REQUEST, approverReplyTo(GUARDIAN_REQUEST, { config: guardianAt(5).config })]
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
    const { node, verify } = worldOf({ ecdsa: { verify: VERIFY_MAGIC } })
    const [request, reply] = build()

    expect(await verify(request, reply)).toBe('rejected')
    expect(verifyCallsOf(node)).toEqual([])
    expect(node.calls).toEqual([])
  })

  it('matches the method, the config and the digest whatever their case', async () => {
    const { verify } = worldOf({ ecdsa: { verify: VERIFY_MAGIC } })
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
    const { node, verify } = worldOf({ ecdsa: { verify: VERIFY_MAGIC } })

    await verify(GUARDIAN_REQUEST, approverReplyTo(GUARDIAN_REQUEST))

    expect(node.calls.map(({ to }) => to.toLowerCase())).not.toContain(MANAGER.toLowerCase())
  })
})
