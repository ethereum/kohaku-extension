import {
  addressOf,
  levelOfDraft,
  levelOfMetadata,
  readPublicNote,
  type CodedError
} from '@web/modules/social-recovery/sdk-doubles'
import type {
  ApproverReply,
  AttemptRequest,
  Configuration,
  Credential,
  Finding,
  Gathering,
  Hex,
  Notification,
  SetupDraft,
  ValidationRefusal
} from '@web/modules/social-recovery/sdk-interfaces'
import { hashTypedData, keccak256, sha256, stringToHex } from 'viem'

import {
  completedRequest,
  createWorld,
  eachIt,
  expectThrown,
  momentOf,
  NO_PAYMENT,
  openRecovery,
  PASSWORD,
  replyFor,
  WINDOW,
  World,
  ZERO
} from '@web/modules/social-recovery/sdk-doubles/__tests__/harness'

const codes = (findings: Finding[]) => findings.map((f) => f.code)
const wallet = (world: World, label: string, extra: Partial<Credential> = {}): Credential => ({
  method: world.descriptor.methodEcdsa,
  config: world.methods.wallet.codec.encodeConfig({ address: addressOf(label) }),
  ...extra
})
const draftOf = (world: World, clauses: SetupDraft['clauses']): SetupDraft => ({
  ...world.draft('private'),
  clauses
})
const refusalOf = async (run: () => Promise<unknown>) =>
  (await expectThrown(run)) as ValidationRefusal
const coded = async (run: () => unknown) => {
  let caught: unknown
  try {
    await run()
  } catch (e) {
    caught = e
  }
  expect(caught).toBeInstanceOf(Error)
  return caught as CodedError
}

describe('validateSetup computes its own findings', () => {
  it('raises clause.shared-failure on a clause whose credentials share one method', async () => {
    const world = createWorld()
    const { warnings } = await (await world.setupClient()).validateSetup(world.draft('private'))
    const shared = warnings.filter((f) => f.code === 'clause.shared-failure')
    expect(shared.map((f) => f.values.clause)).toContain(0)
    expect(shared.every((f) => f.subject === 'clause')).toBe(true)
  })

  it('raises clause.single-point for a 2-of-2 and for a 1-of-1', async () => {
    const world = createWorld()
    const draft = draftOf(world, [
      { threshold: 2, credentials: [wallet(world, 'a'), wallet(world, 'b')] },
      { threshold: 1, credentials: [wallet(world, 'c')] }
    ])
    const { warnings } = await (await world.setupClient()).validateSetup(draft)
    const single = warnings.filter((f) => f.code === 'clause.single-point')
    expect(single.map((f) => f.values.clause).sort()).toEqual([0, 1])
  })

  it('raises clause.secondary-only on a clause of identity methods alone', async () => {
    const world = createWorld()
    const zk = (id: string): Credential => ({
      method: world.descriptor.methodZkpassport,
      config: world.methods.zkPassport.codec.encodeConfig({
        uniqueIdentifier: keccak256(stringToHex(id))
      })
    })
    const draft = draftOf(world, [
      { threshold: 2, credentials: [wallet(world, 'a'), wallet(world, 'b'), wallet(world, 'c')] },
      { threshold: 1, credentials: [zk('passport-1'), zk('passport-2')] }
    ])
    const { warnings } = await (await world.setupClient()).validateSetup(draft)
    const secondary = warnings.filter((f) => f.code === 'clause.secondary-only')
    expect(secondary.map((f) => f.values.clause)).toEqual([1])
  })

  it('raises rule.too-wide where the costliest satisfying set passes the bound', async () => {
    const world = createWorld()
    world.chain.verifyCosts.set(world.descriptor.methodEcdsa.toLowerCase(), 5_000_000n)
    const setup = await world.setupClient()
    const { errors } = await setup.validateSetup(world.draft('private'))
    const wide = errors.find((f) => f.code === 'rule.too-wide')
    expect(wide).toBeDefined()
    expect(wide!.values.cost).toBe(15_000_000n)
    const refusal = await refusalOf(() =>
      setup.prepareCommitSetup(world.draft('private'), PASSWORD)
    )
    expect(codes(refusal.findings.errors)).toContain('rule.too-wide')
  })

  it('raises backup.too-wide where the backup outgrows its one padding size', async () => {
    const world = createWorld()
    const many = Array.from({ length: 50 }, (_, i) => wallet(world, `guardian-${i}`))
    const { errors } = await (
      await world.setupClient()
    ).validateSetup(draftOf(world, [{ threshold: 1, credentials: many }]))
    expect(codes(errors)).toContain('backup.too-wide')
  })

  it('raises rule.repeated-person where one label stands at two places', async () => {
    const world = createWorld()
    const draft = draftOf(world, [
      {
        threshold: 2,
        credentials: [
          wallet(world, 'ana-phone', { label: 'Ana' }),
          wallet(world, 'ana-laptop', { label: 'Ana' }),
          wallet(world, 'ben', { label: 'Ben' })
        ]
      }
    ])
    const { warnings } = await (await world.setupClient()).validateSetup(draft)
    const repeated = warnings.find((f) => f.code === 'rule.repeated-person')
    expect(repeated).toBeDefined()
    expect(repeated!.values.places).toEqual([0, 1])
  })

  it('raises action.unaudited for an action outside the audited list, and not for a listed one', async () => {
    const audited = createWorld()
    const listed = await (await audited.setupClient()).validateSetup(audited.draft('private'))
    expect(codes(listed.warnings)).not.toContain('action.unaudited')
    const world = createWorld({ descriptor: { auditedActions: [] } })
    const { warnings } = await (await world.setupClient()).validateSetup(world.draft('private'))
    const unaudited = warnings.filter((f) => f.code === 'action.unaudited')
    expect(unaudited).toHaveLength(1)
    expect(unaudited[0]!.subject).toBe('action')
    expect(String(unaudited[0]!.values.action).toLowerCase()).toBe(
      world.descriptor.action.toLowerCase()
    )
  })

  eachIt([
    ['a negative threshold', -1],
    ['a fractional threshold', 1.5]
  ] as const)('refuses %s with clause.threshold-too-wide', async ([, threshold]) => {
    const world = createWorld()
    const draft = draftOf(world, [
      { threshold, credentials: [wallet(world, 'a'), wallet(world, 'b')] }
    ])
    const setup = await world.setupClient()
    const { errors } = await setup.validateSetup(draft)
    const wide = errors.filter((f) => f.code === 'clause.threshold-too-wide')
    expect(wide.map((f) => f.values.clause)).toEqual([0])
    const refusal = await refusalOf(() => setup.prepareCommitSetup(draft, PASSWORD))
    expect(codes(refusal.findings.errors)).toContain('clause.threshold-too-wide')
  })

  it('refuses a negative wait with wait.field-width', async () => {
    const world = createWorld()
    const draft: SetupDraft = { ...world.draft('private'), wait: -1n }
    const setup = await world.setupClient()
    const { errors } = await setup.validateSetup(draft)
    expect(codes(errors)).toContain('wait.field-width')
    const refusal = await refusalOf(() => setup.prepareCommitSetup(draft, PASSWORD))
    expect(codes(refusal.findings.errors)).toContain('wait.field-width')
  })

  it('raises manager.already-armed for another action whose setup still stands', async () => {
    const world = createWorld()
    const other = addressOf('another-action')
    world.chain.commitOtherAction(other)
    const { warnings } = await (await world.setupClient()).validateSetup(world.draft('private'))
    const armed = warnings.find((f) => f.code === 'manager.already-armed')
    expect(armed).toBeDefined()
    expect(String(armed!.values.action).toLowerCase()).toBe(other.toLowerCase())
  })

  it('does not raise manager.already-armed once that action was cleared', async () => {
    const world = createWorld()
    const other = addressOf('another-action')
    world.chain.commitOtherAction(other)
    world.chain.clearOtherAction(other)
    const { warnings } = await (await world.setupClient()).validateSetup(world.draft('private'))
    expect(codes(warnings)).not.toContain('manager.already-armed')
  })

  it('fills passkeyDomains in describeSetup, one row per passkey place', async () => {
    const world = createWorld()
    const rpIdHash = sha256(stringToHex('wallet.example'))
    const passkey: Credential = {
      method: world.descriptor.methodPasskey,
      config: world.methods.passkey.codec.encodeConfig({ x: rpIdHash, y: rpIdHash, rpIdHash })
    }
    const draft = draftOf(world, [{ threshold: 1, credentials: [wallet(world, 'a'), passkey] }])
    const described = await (await world.setupClient()).describeSetup(draft)
    const domains = described.passkeyDomains as { place: number; rpIdHash: Hex }[]
    expect(domains).toHaveLength(1)
    expect(domains[0]!.place).toBe(1)
    expect(domains[0]!.rpIdHash).toBe(rpIdHash)
  })

  it('appends a scripted row to validateSetup and refuses the commit on an appended error', async () => {
    const world = createWorld()
    world.chain.appendFindings('setup.validateSetup', {
      warnings: [{ code: 'method.unshipped', subject: 'credential', values: {} }],
      errors: [{ code: 'credential.duplicate', subject: 'credential', values: {} }]
    })
    const setup = await world.setupClient()
    const findings = await setup.validateSetup(world.draft('private'))
    expect(codes(findings.warnings)).toContain('method.unshipped')
    expect(codes(findings.errors)).toContain('credential.duplicate')
    const refusal = await refusalOf(() =>
      setup.prepareCommitSetup(world.draft('private'), PASSWORD)
    )
    expect(codes(refusal.findings.errors)).toContain('credential.duplicate')
  })

  it('appends a scripted row to request validation, refusing the start', async () => {
    const opened = await openRecovery()
    const { request, now } = await completedRequest(opened)
    opened.world.chain.appendFindings('recovery.validateRequest', {
      errors: [{ code: 'request.stale-attempt', subject: 'request', values: {} }]
    })
    const refusal = await refusalOf(() => opened.recovery.prepareStartAttempt(request, now))
    expect(codes(refusal.findings.errors)).toContain('request.stale-attempt')
  })
})

describe('the gathering derives under the descriptor’s digest version', () => {
  it('keeps the descriptor’s digestVersion after the chain’s domain version moves', async () => {
    const world = createWorld()
    world.script.setupCommitted('private')
    const recovery = await world.recoveryClient()
    world.chain.manager.domain = { ...world.chain.manager.domain, version: '99' }
    const gathering = await recovery.initRecoveryGathering(
      world.configuration,
      { newAuthority: world.keys.fresh, removedAuthority: world.keys.held },
      NO_PAYMENT,
      { window: WINDOW }
    )
    expect(gathering.request.digestVersion).toBe(world.descriptor.digestVersion)
    recovery
      .getApproverRequests(gathering)
      .forEach((r) => expect(r.digestVersion).toBe(world.descriptor.digestVersion))
  })
})

describe('an all-zero rule satisfies nothing', () => {
  it('assesses unsatisfied and refuses to complete with request.rule-unsatisfied', async () => {
    const world = createWorld()
    const zero: Configuration = {
      ...world.configuration,
      clauses: world.configuration.clauses.map((c) => ({ ...c, threshold: 0 }))
    }
    world.chain.commitSetup({ level: 'private', configuration: zero, password: PASSWORD })
    const recovery = await world.recoveryClient()
    const gathering = await recovery.initRecoveryGathering(
      zero,
      { newAuthority: world.keys.fresh, removedAuthority: world.keys.held },
      NO_PAYMENT,
      { window: WINDOW }
    )
    let filled: Gathering = gathering
    // eslint-disable-next-line no-restricted-syntax
    for (const r of recovery.getApproverRequests(gathering)) {
      // eslint-disable-next-line no-await-in-loop
      filled = recovery.addApproverReply(filled, await replyFor(world, r)).gathering
    }
    const now = momentOf(gathering)
    expect(recovery.assess(filled, now).ruleSatisfied).toBe(false)
    const refusal = await refusalOf(async () => recovery.complete(filled, undefined, now))
    expect(codes(refusal.findings.errors)).toContain('request.rule-unsatisfied')
  })
})

describe('a zero key is handover.malformed, under the request subject', () => {
  it('refuses a zero newAuthority at the opening init', async () => {
    const world = createWorld()
    world.script.setupCommitted('private')
    const recovery = await world.recoveryClient()
    const refusal = await refusalOf(() =>
      recovery.initRecoveryGathering(
        world.configuration,
        { newAuthority: ZERO, removedAuthority: world.keys.held },
        NO_PAYMENT,
        { window: WINDOW }
      )
    )
    const malformed = refusal.findings.errors.find((f) => f.code === 'handover.malformed')
    expect(malformed?.subject).toBe('request')
  })

  it('refuses a zero newAuthority at the start', async () => {
    const opened = await openRecovery()
    const { request, now } = await completedRequest(opened)
    const zeroed: AttemptRequest = {
      ...request,
      payload: opened.world.codec.encode({
        newAuthority: ZERO,
        removedAuthority: opened.world.keys.held
      })
    }
    const refusal = await refusalOf(() => opened.recovery.prepareStartAttempt(zeroed, now))
    const malformed = refusal.findings.errors.find((f) => f.code === 'handover.malformed')
    expect(malformed?.subject).toBe('request')
  })
})

describe('every handover finding carries the request subject', () => {
  it('raises new-holds-privilege and removed-not-authority under the request subject', async () => {
    const world = createWorld()
    world.script.setupCommitted('private')
    const recovery = await world.recoveryClient()
    const refusal = await refusalOf(() =>
      recovery.initRecoveryGathering(
        world.configuration,
        { newAuthority: world.keys.held, removedAuthority: world.keys.fresh },
        NO_PAYMENT,
        { window: WINDOW }
      )
    )
    const handover = refusal.findings.errors.filter((f) => f.code.startsWith('handover.'))
    expect(codes(handover).sort()).toEqual([
      'handover.new-holds-privilege',
      'handover.removed-not-authority'
    ])
    handover.forEach((f) => expect(f.subject).toBe('request'))
  })

  it('raises same-authority under the request subject', async () => {
    const world = createWorld()
    world.script.setupCommitted('private')
    const recovery = await world.recoveryClient()
    const refusal = await refusalOf(() =>
      recovery.initRecoveryGathering(
        world.configuration,
        { newAuthority: world.keys.held, removedAuthority: world.keys.held },
        NO_PAYMENT,
        { window: WINDOW }
      )
    )
    const same = refusal.findings.errors.find((f) => f.code === 'handover.same-authority')
    expect(same?.subject).toBe('request')
  })
})

describe('one privacy level rule for drafts and chain fields', () => {
  it('reads an opaque public note as shape-visible in the draft and on the chain after land', async () => {
    const world = createWorld()
    const note: Hex = '0xdeadbeef'
    const draft: SetupDraft = {
      ...world.draft('private'),
      privacy: { publicMetadata: note, backup: 'encrypted' }
    }
    expect(levelOfDraft(draft)).toBe('shape-visible')
    const setup = await world.setupClient()
    world.chain.land(await setup.prepareCommitSetup(draft, PASSWORD))
    const at = await world.provider.block('latest')
    const [event] = (
      await world.events.fetch(world.events.accountFilter(), {
        from: world.descriptor.deployedAt,
        to: at.number
      })
    ).filter(
      (n): n is Extract<Notification, { kind: 'setup-committed' }> => n.kind === 'setup-committed'
    )
    expect(event!.publicMetadata).toBe(note)
    expect(levelOfMetadata(event!.publicMetadata, event!.privateMetadata)).toBe('shape-visible')
    expect(world.chain.setup.status === 'committed' && world.chain.setup.level).toBe(
      'shape-visible'
    )
    expect(readPublicNote(event!.publicMetadata)).toEqual({ kind: 'opaque', bytes: note })
  })

  it('reads the notes the three levels write back through readPublicNote', () => {
    const world = createWorld()
    expect(readPublicNote(world.draft('private').privacy.publicMetadata)).toEqual({ kind: 'none' })
    expect(readPublicNote(world.draft('shape-visible').privacy.publicMetadata).kind).toBe('shape')
    expect(readPublicNote(world.draft('public').privacy.publicMetadata).kind).toBe('clear')
  })
})

describe('every refusal carries a code', () => {
  it('builder.frozen: a setter after the first build', async () => {
    const world = createWorld()
    const builder = world.builder()
    await builder.buildSetupClient()
    const error = await coded(() => builder.account(world.keys.fresh))
    expect(error.code).toBe('builder.frozen')
  })

  it('version-unread: requests from a record this build does not read', async () => {
    const opened = await openRecovery()
    const unread = { ...opened.gathering, version: 999 }
    const error = await coded(() => opened.recovery.getApproverRequests(unread))
    expect(error.code).toBe('version-unread')
  })

  it('method-unsupported: a signing input for a method no implementation serves', async () => {
    const opened = await openRecovery()
    const request = { ...opened.requests[0]!, method: addressOf('unregistered-method') }
    const error = await coded(() => opened.orchestrator.signingInput(request))
    expect(error.code).toBe('method-unsupported')
  })

  it('confirm.commitment-mismatch: a draft that does not recompute to the prepared commit', async () => {
    const world = createWorld()
    const setup = await world.setupClient()
    const prepared = await setup.prepareCommitSetup(world.draft('private'), PASSWORD)
    const other = { ...world.draft('private'), wait: world.configuration.wait + 1n }
    const error = await coded(() => setup.confirmSetup(other, prepared))
    expect(error.code).toBe('confirm.commitment-mismatch')
  })

  it('MalformedHandover: the codec refuses bytes its encoder would not reproduce', async () => {
    const error = await coded(() => createWorld().codec.decode('0x1234'))
    expect(error.code).toBe('MalformedHandover')
  })

  it('setup.password-missing: an encrypted backup with no password', async () => {
    const world = createWorld()
    const setup = await world.setupClient()
    const error = await coded(() => setup.prepareCommitSetup(world.draft('private')))
    expect(error.code).toBe('setup.password-missing')
  })
})

describe('an undeclared module is a contract answering, a failed provider is not', () => {
  it('answers moduleInfo and trustedParties with empty values and warns method.no-declaration', async () => {
    const world = createWorld()
    const module = addressOf('third-party-method')
    expect(await world.manager.moduleInfo(module)).toEqual({
      answered: true,
      value: { name: '', version: '', supportsInterface: false }
    })
    expect(await world.manager.trustedParties(module)).toEqual({
      answered: true,
      value: {
        admin: ZERO,
        pendingAdmin: ZERO,
        trustedKeys: [],
        pauseHolder: ZERO,
        pendingPauseHolder: ZERO
      }
    })
    const draft = draftOf(world, [
      { threshold: 1, credentials: [wallet(world, 'a'), { method: module, config: '0x01' }] }
    ])
    const { warnings } = await (await world.setupClient()).validateSetup(draft)
    const undeclared = warnings.filter((f) => f.code === 'method.no-declaration')
    expect(undeclared.map((f) => String(f.values.method).toLowerCase())).toEqual([
      module.toLowerCase()
    ])
  })

  it('answers { answered: false } for a scripted provider failure', async () => {
    const world = createWorld()
    const module = world.descriptor.methodEcdsa
    world.script.leaveUnanswered('manager.moduleInfo')
    world.script.leaveUnanswered('manager.trustedParties')
    expect(await world.manager.moduleInfo(module)).toEqual({ answered: false })
    expect(await world.manager.trustedParties(module)).toEqual({ answered: false })
  })
})

describe('verifyReply rejects a pasted reply with no digest', () => {
  it('answers rejected, without throwing', async () => {
    const opened = await openRecovery()
    const request = opened.requests[0]!
    const reply = await replyFor(opened.world, request)
    const reads = opened.world.walletReads()
    expect(await reads.verifyReply(request, reply)).toBe('satisfied')
    const noDigest: Partial<ApproverReply> = { ...reply }
    delete noDigest.digest
    expect(await reads.verifyReply(request, noDigest as ApproverReply)).toBe('rejected')
  })
})

describe('the wallet signs the approval’s typed data, whose hash is the reply’s digest', () => {
  it('holds the Approval members alone', async () => {
    const opened = await openRecovery()
    const request = opened.requests[0]!
    const input = opened.orchestrator.signingInput(request) as {
      message: Record<string, unknown>
    }
    expect(Object.keys(input.message).sort()).toEqual(
      [
        'account',
        'action',
        'attemptId',
        'setupNonce',
        'setupBodyHash',
        'payload',
        'order',
        'validUntil',
        'place'
      ].sort()
    )
    expect(Object.keys(input.message.order as object).sort()).toEqual(['amount', 'payee', 'token'])
    expect(String(input.message.account).toLowerCase()).toBe(request.account.toLowerCase())
    expect(BigInt(input.message.attemptId as bigint)).toBe(BigInt(request.attemptId))
    expect(BigInt(input.message.place as bigint)).toBe(BigInt(request.place))
    expect(input.message.setupBodyHash).toBe(request.setupBodyHash)
  })

  it('hashes, through viem’s hashTypedData, to the digest the reply carries', async () => {
    const opened = await openRecovery()
    const request = opened.requests[1]!
    const input = opened.orchestrator.signingInput(request)
    const reply = await replyFor(opened.world, request)
    expect(hashTypedData(input as Parameters<typeof hashTypedData>[0])).toBe(reply.digest)
  })
})
