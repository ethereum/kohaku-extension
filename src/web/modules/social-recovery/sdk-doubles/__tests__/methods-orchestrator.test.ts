import { replyReadable, requestReadable } from '@web/modules/social-recovery/sdk-doubles'
import {
  METHOD_FAILURE_CAUSES,
  VERDICTS,
  type ApproverReply,
  type ApproverRequest,
  type Hex,
  type ReplyFailure
} from '@web/modules/social-recovery/sdk-interfaces'

import { getAddress, isAddress } from 'viem'

import {
  createWorld,
  eachIt,
  expectThrown,
  isHex,
  openRecovery,
  replyFor
} from '@web/modules/social-recovery/sdk-doubles/__tests__/harness'

const firstRequest = async () => {
  const { world, requests } = await openRecovery()
  // The request crosses a JSON round trip, the way a link carries it.
  const request = JSON.parse(JSON.stringify(requests[0])) as ApproverRequest
  return { world, request }
}

describe('methods orchestrator double', () => {
  it('describes a request from the request alone', async () => {
    const { world, request } = await firstRequest()
    const described = world.orchestrator().describeRequest(request)
    expect(described.account).toBe(request.account)
    expect(described.manager).toBe(request.manager)
    expect(described.action).toBe(request.action)
    expect(described.chainId).toBe(BigInt(request.chainId))
    expect(described.attemptId).toBe(BigInt(request.attemptId))
    expect(described.setupNonce).toBe(BigInt(request.setupNonce))
    expect(described.purpose).toBe('approval')
    expect(described.place).toBe(request.place)
    expect(described.validUntil).toBe(Number(request.validUntil))
    // Addresses compare case-insensitively: the codec decodes checksummed ones.
    const { handover } = described
    if (!handover?.decoded) {
      throw new Error('the handover did not decode')
    }
    expect(handover.value.newAuthority.toLowerCase()).toBe(world.keys.fresh.toLowerCase())
    expect(handover.value.removedAuthority.toLowerCase()).toBe(world.keys.held.toLowerCase())
  })

  it('builds the signing input and the reply from the request alone', async () => {
    const { world, request } = await firstRequest()
    const orchestrator = world.orchestrator()
    const input = orchestrator.signingInput(request)
    expect(input).toBeDefined()
    const reply = (await orchestrator.replyFrom(
      request,
      input,
      world.material(request)
    )) as ApproverReply
    expect(reply.kind).toBe('recovery-proof-reply')
    ;(['chainId', 'manager', 'account', 'action', 'attemptId', 'purpose'] as const).forEach(
      (field) => expect(reply[field]).toBe(request[field])
    )
    expect(reply.place).toBe(request.place)
    expect(reply.method).toBe(request.method)
    expect(reply.config).toBe(request.config)
    expect(reply.salt).toBe(request.salt)
    expect(isHex(reply.digest)).toBe(true)
    expect(isHex(reply.proof)).toBe(true)
  })

  it('hands the wallet EIP-712 typed data: domain, types, primaryType, message, no digest', async () => {
    const { world, request } = await firstRequest()
    const input = world.orchestrator().signingInput(request) as Record<string, unknown>
    expect(Object.keys(input).sort()).toEqual(['domain', 'message', 'primaryType', 'types'])
    const domain = input.domain as Record<string, unknown>
    const types = input.types as Record<string, { name: string; type: string }[]>
    expect(['number', 'bigint']).toContain(typeof domain.chainId)
    expect(Number(domain.chainId)).toBe(Number(request.chainId))
    expect(String(domain.verifyingContract).toLowerCase()).toBe(request.manager.toLowerCase())
    expect(input.primaryType).toBe('Approval')
    expect(Array.isArray(types[input.primaryType as string])).toBe(true)
    types[input.primaryType as string]!.forEach((field) => {
      expect(typeof field.name).toBe('string')
      expect(typeof field.type).toBe('string')
    })
    // The wallet derives the digest itself; none travels inside what it signs.
    const text = JSON.stringify(input, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
    expect(text).not.toMatch(/"digest"/)
  })

  it('returns a scripted reply failure as a typed result, never a thrown error', async () => {
    const { world, request } = await firstRequest()
    world.script.replyFailure('device-refused')
    const orchestrator = world.orchestrator()
    let reply: ReplyFailure | undefined
    await expect(
      (async () => {
        reply = (await orchestrator.replyFrom(
          request,
          orchestrator.signingInput(request),
          world.material(request)
        )) as ReplyFailure
      })()
    ).resolves.toBeUndefined()
    expect(reply).toEqual({ kind: 'reply-failure', cause: 'device-refused' })
    expect(METHOD_FAILURE_CAUSES).toContain(reply!.cause)
  })

  it('throws signingInput when scripted to refuse', async () => {
    const { world, request } = await firstRequest()
    world.script.refuse('orchestrator.signingInput', 'request.expired')
    const orchestrator = world.orchestrator()
    await expectThrown(async () => orchestrator.signingInput(request))
  })

  it('answers a verdict, never a refusal: satisfied for a good proof, rejected for another', async () => {
    const { world, request } = await firstRequest()
    const orchestrator = world.orchestrator()
    const reply = (await orchestrator.replyFrom(
      request,
      orchestrator.signingInput(request),
      world.material(request)
    )) as ApproverReply
    const good = await orchestrator.verify(request, request.place, reply.proof)
    const bad = await orchestrator.verify(request, request.place, `0x${'ab'.repeat(65)}`)
    expect(VERDICTS).toContain(good)
    expect(good).toBe('satisfied')
    expect(bad).toBe('rejected')
  })

  it('enrolls through enrollInput and configFrom, a failure being a typed result', async () => {
    const world = createWorld()
    const orchestrator = world.orchestrator()
    const method = world.descriptor.methodEcdsa
    const input = orchestrator.enrollInput(method, { address: world.keys.held })
    const config = await orchestrator.configFrom(method, input, world.keys.held)
    expect(isHex(config)).toBe(true)
    world.script.enrollFailure('material-rejected')
    const failed = await world.orchestrator().configFrom(method, input, world.keys.held)
    expect(failed).toEqual({ kind: 'enroll-failure', cause: 'material-rejected' })
  })

  it('answers a wallet address with a wrong checksum as material-rejected, never a thrown error', async () => {
    const world = createWorld()
    const orchestrator = world.orchestrator()
    const method = world.descriptor.methodEcdsa
    const checksummed = getAddress(world.keys.fresh)
    const at = checksummed.search(/[A-F]/)
    expect(at).toBeGreaterThan(-1)
    const wrong = `${checksummed.slice(0, at)}${checksummed[at]!.toLowerCase()}${checksummed.slice(
      at + 1
    )}`
    expect(isAddress(wrong, { strict: false })).toBe(true)
    expect(isAddress(wrong, { strict: true })).toBe(false)
    const input = orchestrator.enrollInput(method, { address: wrong })
    await expect(orchestrator.configFrom(method, input, wrong)).resolves.toEqual({
      kind: 'enroll-failure',
      cause: 'material-rejected'
    })
    const good = orchestrator.enrollInput(method, { address: checksummed })
    expect(isHex(await orchestrator.configFrom(method, good, checksummed))).toBe(true)
  })

  it('throws enrollInput when scripted to refuse', async () => {
    const world = createWorld()
    world.script.refuse('orchestrator.enrollInput', 'request.expired')
    const orchestrator = world.orchestrator()
    await expectThrown(async () =>
      orchestrator.enrollInput(world.descriptor.methodEcdsa, { address: world.keys.held })
    )
  })
})

describe('a record whose hex member is not plain 0x hex', () => {
  /** The hex members of each record, a nested one by its dotted path. */
  const REQUEST_HEX = [
    'manager',
    'account',
    'action',
    'setupBodyHash',
    'method',
    'config',
    'salt',
    'payload',
    'order.token',
    'order.payee'
  ]
  const REPLY_HEX = ['manager', 'account', 'action', 'method', 'config', 'salt', 'digest', 'proof']

  const valueAt = (record: object, path: string): Hex =>
    path
      .split('.')
      .reduce<unknown>((value, key) => (value as Record<string, unknown>)[key], record) as Hex

  const withValue = <T extends object>(record: T, path: string, value: string): T => {
    const [head, ...rest] = path.split('.') as [string, ...string[]]
    const inner = (record as Record<string, unknown>)[head] as object
    return { ...record, [head]: rest.length ? withValue(inner, rest.join('.'), value) : value }
  }

  const opened = async () => {
    const o = await openRecovery()
    const request = o.requests[0]!
    return { ...o, request, reply: await replyFor(o.world, request) }
  }

  eachIt([
    ['an upper-case 0X prefix', (v: Hex) => `0X${v.slice(2)}`],
    ['a space among its digits', (v: Hex) => `${v.slice(0, 4)} ${v.slice(4)}`],
    ['a digit outside hex', (v: Hex) => `${v}g`]
  ] as const)('is not read where the member has %s', async ([, malform]) => {
    const { world, recovery, gathering, request, reply } = await opened()
    const reads = world.walletReads()
    expect(requestReadable(request)).toBe(true)
    expect(replyReadable(reply)).toBe(true)
    const requestVerdicts = await Promise.all(
      REQUEST_HEX.map(async (path) => {
        const bad = withValue(request, path, malform(valueAt(request, path)))
        return [path, requestReadable(bad), await reads.verifyReply(bad, reply)]
      })
    )
    expect(requestVerdicts).toEqual(REQUEST_HEX.map((path) => [path, false, 'rejected']))
    const replyVerdicts = await Promise.all(
      REPLY_HEX.map(async (path) => {
        const bad = withValue(reply, path, malform(valueAt(reply, path)))
        return [
          path,
          replyReadable(bad),
          await reads.verifyReply(request, bad),
          recovery.addApproverReply(gathering, bad).reason?.cause
        ]
      })
    )
    expect(replyVerdicts).toEqual(
      REPLY_HEX.map((path) => [path, false, 'rejected', 'version-unread'])
    )
  })

  it('is read where its hex digits are upper-case', async () => {
    const { world, recovery, gathering, request, reply } = await opened()
    const loud = (v: Hex) => `0x${v.slice(2).toUpperCase()}`
    const loudRequest = REQUEST_HEX.reduce(
      (r, path) => withValue(r, path, loud(valueAt(r, path))),
      request
    )
    const loudReply = REPLY_HEX.reduce(
      (r, path) => withValue(r, path, loud(valueAt(r, path))),
      reply
    )
    expect(loudRequest.config).not.toBe(request.config)
    expect(loudReply.proof).not.toBe(reply.proof)
    expect(requestReadable(loudRequest)).toBe(true)
    expect(replyReadable(loudReply)).toBe(true)
    expect(await world.walletReads().verifyReply(request, loudReply)).toBe('satisfied')
    expect(recovery.addApproverReply(gathering, loudReply).reason).toBeUndefined()
  })
})
