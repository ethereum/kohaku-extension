/**
 * The deployed kit's setup client over a node scripted by hand: the state, the
 * description, the validation's read rows, the commit's prepare, its check
 * after the landing and the restore, each over the real formats, reads,
 * events and backup.
 */
import { encodeErrorResult, getAddress, maxUint48, size, zeroHash } from 'viem'

import type {
  Configuration,
  Finding,
  Hex,
  PreparedBatch,
  PreparedCall,
  SetupDraft
} from '@web/modules/social-recovery/sdk-interfaces'
import {
  BACKUP_SEALED_SIZE,
  clearBackupOf,
  openBackup,
  openClearBackup
} from '@web/modules/social-recovery/shared/client/kit/backup'
import {
  commitSetupData,
  kitBindingOf,
  kitSlotOf,
  setupBodyOf,
  setupCommitmentOf
} from '@web/modules/social-recovery/shared/client/kit/formats'
import { providerReadFailure } from '@web/modules/social-recovery/shared/client/provider-adapter'

import {
  ACCOUNT,
  ACCOUNT_CODE,
  ACTION,
  ACTION_CALLS,
  armingArgsOf,
  clearedLog,
  commitArgsOf,
  commitCallOf,
  committedLog,
  CONFIGURATION,
  DEPLOYED_AT,
  draftAt,
  guardianAt,
  HEAD,
  HEAD_TIMESTAMP,
  KEY_A,
  KEY_B,
  MANAGER,
  MANAGER_ABI,
  METHOD_CALLS,
  METHOD_ECDSA,
  METHOD_PASSKEY,
  METHOD_ZKPASSPORT,
  OTHER_ACTION,
  passkeyAt,
  PASSWORD,
  reverting,
  scriptAction,
  scriptMethod,
  scriptState,
  stateOfCall,
  THIRD_ACTION,
  thrownBy,
  kitWorld,
  word
} from '@web/modules/social-recovery/shared/client/kit/setup-client/__tests__/harness'

const codes = (findings: Finding[]) => findings.map((f) => f.code)

const ARMED = '0x0000000000000000000000000000000000000000000000000000000000000001'

/** The commitment the chain closes over for a configuration at a nonce. */
const commitmentOf = (configuration: Configuration, nonce: bigint): Hex =>
  setupCommitmentOf(ACCOUNT, ACTION, nonce, setupBodyOf(ACCOUNT, configuration))

const lowerMethods = (configuration: Configuration) =>
  configuration.clauses.map((clause) => ({
    threshold: clause.threshold,
    credentials: clause.credentials.map((c) => ({
      method: c.method.toLowerCase(),
      config: c.config
    }))
  }))

const callsTo = (world: ReturnType<typeof kitWorld>, data: Hex) =>
  world.node.calls.filter((c) => c.data.toLowerCase() === data.toLowerCase())

describe('setupState', () => {
  it('reads a fresh account with no code as unarmed and with no setup, at the pinned block', async () => {
    const world = kitWorld()
    const state = await world.setup.setupState()
    expect(state).toEqual({
      isAuthorized: false,
      hasSetup: false,
      setupCommitment: zeroHash,
      setupNonce: 0n,
      setupCommittedAtBlock: 0,
      attemptActive: false,
      block: world.node.head
    })
    expect(callsTo(world, ACTION_CALLS.isAuthorized)).toEqual([])
    expect(world.node.codeRead.code).toHaveBeenCalledWith(ACCOUNT, HEAD)
  })

  it('reads an armed account with code and its standing setup at the pinned block', async () => {
    const world = kitWorld({ accountCode: ACCOUNT_CODE })
    scriptAction(world.node, { supportsAccount: true, authorized: true })
    const commitment: Hex = `0x${'5a'.repeat(32)}`
    scriptState(world.node, {
      setupCommitment: commitment,
      setupNonce: 3n,
      setupCommittedAtBlock: HEAD - 50,
      attemptState: 1
    })
    const state = await world.setup.setupState()
    expect(state).toEqual({
      isAuthorized: true,
      hasSetup: true,
      setupCommitment: commitment,
      setupNonce: 3n,
      setupCommittedAtBlock: HEAD - 50,
      attemptActive: true,
      block: world.node.head
    })
    expect(callsTo(world, ACTION_CALLS.isAuthorized).map((c) => c.block)).toEqual([HEAD])
  })

  it('reads an account with code the action does not hold as armed as unarmed', async () => {
    const world = kitWorld({ accountCode: ACCOUNT_CODE })
    scriptAction(world.node, { supportsAccount: true, authorized: false })
    expect((await world.setup.setupState()).isAuthorized).toBe(false)
    expect(callsTo(world, ACTION_CALLS.isAuthorized)).toHaveLength(1)
  })

  it("names a contract's revert as the kit's error", async () => {
    const world = kitWorld()
    world.node.answer(
      MANAGER,
      stateOfCall(),
      reverting(
        encodeErrorResult({
          abi: MANAGER_ABI,
          errorName: 'PolicyManager_WrongSetupNonce',
          args: [2n, 1n]
        })
      )
    )
    const thrown = await thrownBy(world.setup.setupState())
    expect(thrown).toMatchObject({
      name: 'LandingRevert',
      code: 'WrongSetupNonce',
      error: {
        kind: 'known',
        source: 'manager',
        name: 'WrongSetupNonce',
        args: { supplied: 2n, expected: 1n }
      }
    })
  })

  it('rejects with the read failure where the node cannot answer', async () => {
    const world = kitWorld()
    world.node.provider.block.mockRejectedValueOnce(providerReadFailure('block', new Error('down')))
    expect(await thrownBy(world.setup.setupState())).toMatchObject({
      name: 'ProviderReadFailure',
      read: 'block'
    })
  })
})

describe('describeSetup', () => {
  it("judges the candidate keys of an account with no code by its creation's privileges", async () => {
    const world = kitWorld({
      initialPrivileges: [
        [KEY_A, ARMED],
        [KEY_B, zeroHash]
      ]
    })
    const described = await world.setup.describeSetup(world.draft('private'))
    expect(described.candidateKeys).toEqual([
      { address: KEY_A, isAuthority: true },
      { address: KEY_B, isAuthority: false }
    ])
    const isAuthoritySelector = ACTION_CALLS.isAuthority(KEY_A).slice(0, 10)
    expect(world.node.calls.filter((c) => c.data.startsWith(isAuthoritySelector))).toEqual([])
  })

  it('judges the candidate keys of an account with code by the action, at the pinned block', async () => {
    const world = kitWorld({
      accountCode: ACCOUNT_CODE,
      initialPrivileges: [
        [KEY_A, ARMED],
        [KEY_B, zeroHash]
      ]
    })
    scriptAction(world.node, { supportsAccount: true, authorities: [KEY_B] })
    const described = await world.setup.describeSetup(world.draft('private'))
    expect(described.candidateKeys).toEqual([
      { address: KEY_A, isAuthority: false },
      { address: KEY_B, isAuthority: true }
    ])
    expect(callsTo(world, ACTION_CALLS.isAuthority(KEY_B)).map((c) => c.block)).toEqual([HEAD])
  })

  it('names the removed key the wallet reads name, and none otherwise', async () => {
    const named = kitWorld({ removedKey: { kind: 'named', key: KEY_B } })
    expect((await named.setup.describeSetup(named.draft('private'))).removedKey).toBe(KEY_B)
    const unnamed = kitWorld({ removedKey: { kind: 'unavailable', cause: 'several-key-entries' } })
    expect((await unnamed.setup.describeSetup(unnamed.draft('private'))).removedKey).toBe(
      'no-creation-triple'
    )
  })

  it("describes the draft's methods, the action and the privacy as the review reads them", async () => {
    const world = kitWorld()
    const draft = world.draft('shape-visible', {
      clauses: [
        { threshold: 2, credentials: [guardianAt(0), guardianAt(1), passkeyAt(0)] },
        { threshold: 1, credentials: [guardianAt(2)] }
      ]
    })
    const described = await world.setup.describeSetup(draft)
    expect(described.methodStanding).toEqual([
      {
        method: METHOD_ECDSA,
        shipped: true,
        declares: true,
        moduleInfo: {
          answered: true,
          value: { name: 'method-ecdsa', version: '1.0.0', supportsInterface: true }
        },
        tier: 'primary',
        paused: { answered: true, value: false }
      },
      {
        method: METHOD_PASSKEY,
        shipped: true,
        declares: true,
        moduleInfo: {
          answered: true,
          value: { name: 'method-passkey', version: '1.0.0', supportsInterface: true }
        },
        tier: 'primary',
        paused: { answered: true, value: false }
      }
    ])
    expect(described.failureDomains).toEqual([
      {
        clause: 0,
        methods: [
          { method: METHOD_ECDSA, count: 2 },
          { method: METHOD_PASSKEY, count: 1 }
        ]
      },
      { clause: 1, methods: [{ method: METHOD_ECDSA, count: 1 }] }
    ])
    expect(described.passkeyDomains).toEqual([
      {
        place: 2,
        rpIdHash: `0x${'00'.repeat(31)}03`,
        diesWithDomain: true,
        cancelByVeto: false
      }
    ])
    expect(described.privacy).toEqual({
      level: 'shape-visible',
      publicMetadata: draft.privacy.publicMetadata
    })
    expect(described.reveals).toEqual({ publicMetadata: true })
    expect(described.upgrade).toEqual({
      action: ACTION,
      actionInfo: { name: 'AmbireRecoveryAction', version: '1.0.0', supportsInterface: true },
      fits: false
    })
  })
})

describe('validateSetup over the reads', () => {
  const readCodes = (findings: Finding[]) =>
    codes(findings).filter((code) => /^(method|action|manager)\./.test(code))

  it('adds no read row for the deployed methods and the audited action on a fresh account', async () => {
    const world = kitWorld()
    const { errors, warnings } = await world.setup.validateSetup(world.draft('private'))
    expect(errors).toEqual([])
    expect(readCodes(warnings)).toEqual([])
  })

  it('warns method.unshipped for a method outside the shipped list', async () => {
    const world = kitWorld({ descriptor: { shippedMethods: [METHOD_PASSKEY] } })
    const { warnings } = await world.setup.validateSetup(world.draft('private'))
    expect(warnings.filter((f) => f.code === 'method.unshipped').map((f) => f.values)).toEqual([
      { method: METHOD_ECDSA, probe: true, list: [METHOD_PASSKEY], listFrom: 'descriptor' }
    ])
  })

  it('warns method.no-declaration for a method whose views revert', async () => {
    const world = kitWorld()
    scriptMethod(world.node, METHOD_ECDSA, { views: reverting() })
    const { warnings } = await world.setup.validateSetup(world.draft('private'))
    expect(readCodes(warnings)).toEqual(['method.no-declaration'])
  })

  it('warns method.stopped for a method whose stop word is one, and not for another word', async () => {
    const world = kitWorld()
    scriptMethod(world.node, METHOD_ECDSA, { paused: word(1n) })
    const stopped = await world.setup.validateSetup(world.draft('private', { ignoresPause: true }))
    expect(
      stopped.warnings.filter((f) => f.code === 'method.stopped').map((f) => f.values)
    ).toEqual([{ method: METHOD_ECDSA, ignoresPause: true }])
    scriptMethod(world.node, METHOD_ECDSA, { paused: word(2n) })
    expect(readCodes((await world.setup.validateSetup(world.draft('private'))).warnings)).toEqual(
      []
    )
  })

  it('refuses read.unanswered where the stop read of a method goes unanswered', async () => {
    const world = kitWorld()
    scriptMethod(world.node, METHOD_ECDSA, {
      paused: providerReadFailure('call', new Error('down'))
    })
    expect(await thrownBy(world.setup.validateSetup(world.draft('private')))).toMatchObject({
      name: 'CodedError',
      code: 'read.unanswered',
      values: { read: 'manager.paused', module: METHOD_ECDSA }
    })
  })

  it("refuses read.unanswered where a method's declaration read goes unanswered", async () => {
    const world = kitWorld()
    scriptMethod(world.node, METHOD_ECDSA, {
      views: providerReadFailure('call', new Error('down'))
    })
    expect(await thrownBy(world.setup.validateSetup(world.draft('private')))).toMatchObject({
      code: 'read.unanswered',
      values: { read: 'manager.moduleInfo', module: METHOD_ECDSA }
    })
  })

  it('refuses read.unanswered for a method with no code', async () => {
    const world = kitWorld()
    const draft = world.draft('private', {
      clauses: [
        {
          threshold: 1,
          credentials: [guardianAt(0), { ...guardianAt(1), method: METHOD_ZKPASSPORT }]
        }
      ]
    })
    expect(await thrownBy(world.setup.validateSetup(draft))).toMatchObject({
      code: 'read.unanswered',
      values: { module: METHOD_ZKPASSPORT }
    })
  })

  describe('the fit check, three ways', () => {
    it('passes an account the action supports', async () => {
      const world = kitWorld({
        accountCode: ACCOUNT_CODE,
        config: { accountImplementation: undefined }
      })
      scriptAction(world.node, { supportsAccount: true })
      expect(readCodes((await world.setup.validateSetup(world.draft('private'))).warnings)).toEqual(
        []
      )
      expect(callsTo(world, ACTION_CALLS.supportsAccount).map((c) => c.block)).toEqual([HEAD])
    })

    it('passes an account not yet deployed whose implementation is the one served', async () => {
      const world = kitWorld()
      const { errors, warnings } = await world.setup.validateSetup(world.draft('private'))
      expect(readCodes(errors)).toEqual([])
      expect(readCodes(warnings)).toEqual([])
    })

    it('refuses action.unsupported for an implementation the action does not serve', async () => {
      const other = '0x00000000000000000000000000000000000001aa'
      const world = kitWorld({ config: { accountImplementation: other } })
      const { errors } = await world.setup.validateSetup(world.draft('private'))
      expect(errors.map((f) => [f.code, f.values])).toEqual([
        [
          'action.unsupported',
          {
            action: ACTION,
            account: ACCOUNT,
            supportsAccount: false,
            implementation: other,
            served: world.descriptor.servedImplementation
          }
        ]
      ])
    })

    it('warns action.fit-unchecked where no implementation is named', async () => {
      const world = kitWorld({ config: { accountImplementation: undefined } })
      const { errors, warnings } = await world.setup.validateSetup(world.draft('private'))
      expect(readCodes(errors)).toEqual([])
      expect(
        warnings.filter((f) => f.code === 'action.fit-unchecked').map((f) => f.values)
      ).toEqual([{ action: ACTION, account: ACCOUNT }])
    })
  })

  it('warns action.unaudited for an action outside the audited list or failing its probe', async () => {
    const unlisted = kitWorld({ descriptor: { auditedActions: [OTHER_ACTION] } })
    const listed = await unlisted.setup.validateSetup(unlisted.draft('private'))
    expect(
      listed.warnings.filter((f) => f.code === 'action.unaudited').map((f) => f.values)
    ).toEqual([{ action: ACTION, probe: true, list: [OTHER_ACTION], listFrom: 'descriptor' }])
    const unprobed = kitWorld()
    scriptAction(unprobed.node, { probe: false })
    const probed = await unprobed.setup.validateSetup(unprobed.draft('private'))
    expect(
      probed.warnings.filter((f) => f.code === 'action.unaudited').map((f) => f.values)
    ).toEqual([{ action: ACTION, probe: false, list: [ACTION], listFrom: 'descriptor' }])
  })

  describe('manager.already-armed', () => {
    const armedOf = async (world: ReturnType<typeof kitWorld>) =>
      (await world.setup.validateSetup(world.draft('private'))).warnings
        .filter((f) => f.code === 'manager.already-armed')
        .map((f) => ({ action: getAddress(f.values.action as string), nonce: f.values.nonce }))

    it("names each other action whose last setup write is a commit, at that commit's nonce", async () => {
      const world = kitWorld()
      const commitment: Hex = `0x${'5a'.repeat(32)}`
      world.node.addLog(
        committedLog(
          { action: OTHER_ACTION, nonce: 1n, setupCommitment: commitment },
          DEPLOYED_AT + 1
        )
      )
      world.node.addLog(clearedLog(OTHER_ACTION, 2n, DEPLOYED_AT + 2))
      world.node.addLog(
        committedLog(
          { action: OTHER_ACTION, nonce: 3n, setupCommitment: commitment },
          DEPLOYED_AT + 3
        )
      )
      world.node.addLog(
        committedLog(
          { action: THIRD_ACTION, nonce: 1n, setupCommitment: commitment },
          DEPLOYED_AT + 4
        )
      )
      world.node.addLog(clearedLog(THIRD_ACTION, 2n, DEPLOYED_AT + 5))
      world.node.addLog(
        committedLog({ action: ACTION, nonce: 1n, setupCommitment: commitment }, DEPLOYED_AT + 6)
      )
      expect(await armedOf(world)).toEqual([{ action: getAddress(OTHER_ACTION), nonce: 3n }])
    })

    it("scans the manager's logs from its deployment block to the pinned block", async () => {
      const world = kitWorld()
      const commitment: Hex = `0x${'5a'.repeat(32)}`
      world.node.addLog(
        committedLog(
          { action: OTHER_ACTION, nonce: 1n, setupCommitment: commitment },
          DEPLOYED_AT - 1
        )
      )
      world.node.addLog(
        committedLog({ action: THIRD_ACTION, nonce: 1n, setupCommitment: commitment }, HEAD + 1)
      )
      expect(await armedOf(world)).toEqual([])
      const ranges = world.node.provider.logs.mock.calls.map(([, range]) => range)
      expect(ranges[0].from).toBe(DEPLOYED_AT)
      expect(ranges[ranges.length - 1].to).toBe(HEAD)
    })

    it('finds a commit at the deployment block itself', async () => {
      const world = kitWorld()
      world.node.addLog(
        committedLog(
          { action: OTHER_ACTION, nonce: 1n, setupCommitment: `0x${'5a'.repeat(32)}` },
          DEPLOYED_AT
        )
      )
      expect(await armedOf(world)).toEqual([{ action: getAddress(OTHER_ACTION), nonce: 1n }])
    })
  })

  it("judges the wait's field against the pinned block's timestamp", async () => {
    const world = kitWorld()
    const room = maxUint48 - BigInt(HEAD_TIMESTAMP)
    const fits = await world.setup.validateSetup(world.draft('private', { wait: room }))
    expect(codes(fits.errors)).not.toContain('wait.field-width')
    const past = await world.setup.validateSetup(world.draft('private', { wait: room + 1n }))
    expect(past.errors.find((f) => f.code === 'wait.field-width')?.values).toEqual({
      wait: room + 1n,
      room
    })
  })
})

describe('prepareCommitSetup', () => {
  /** The prepares the tests below read, each sealed once. */
  let unarmedPrivate: PreparedCall | PreparedBatch
  let unarmedWorld: ReturnType<typeof kitWorld>
  let shapeVisible: PreparedCall | PreparedBatch
  let shapeDraft: SetupDraft

  beforeAll(async () => {
    unarmedWorld = kitWorld()
    unarmedPrivate = await unarmedWorld.setup.prepareCommitSetup(draftAt('private'), PASSWORD)
    const shapeWorld = kitWorld()
    shapeDraft = draftAt('shape-visible')
    shapeVisible = await shapeWorld.setup.prepareCommitSetup(shapeDraft, PASSWORD)
  })

  it('batches the arming call first and the commit second for an account the action does not hold as armed', () => {
    expect(unarmedPrivate.kind).toBe('batch')
    const batch = unarmedPrivate as PreparedBatch
    const block = { number: HEAD, hash: unarmedWorld.node.head.hash }
    expect(batch.atomic).toBe(true)
    expect(batch.block).toEqual(block)
    expect(batch.calls.map((c) => [c.kind, c.target, c.value, c.sender, c.block])).toEqual([
      ['call', ACCOUNT, 0n, 'account', block],
      ['call', MANAGER, 0n, 'account', block]
    ])
    const arming = armingArgsOf(batch.calls[0]!)
    expect(arming.slot).toBe(kitSlotOf(ACTION))
    expect(arming.value).toBe(kitBindingOf(ACTION))
    expect(getAddress(commitArgsOf(batch.calls[1]!).action)).toBe(getAddress(ACTION))
  })

  it('commits at the stored nonce plus one, over the setup body of the draft', () => {
    const args = commitArgsOf(commitCallOf(unarmedPrivate))
    expect(args.nonce).toBe(1n)
    expect(args.setupCommitment).toBe(commitmentOf(CONFIGURATION, 1n))
  })

  it('seals the backup at the private level, bound to the account, the action, the commitment and the nonce', async () => {
    const args = commitArgsOf(commitCallOf(unarmedPrivate))
    expect(args.publicMetadata).toBe('0x')
    expect(size(args.privateMetadata)).toBe(BACKUP_SEALED_SIZE)
    expect(BACKUP_SEALED_SIZE).toBe(2502)
    const opened = await openBackup(args.privateMetadata, PASSWORD, {
      account: ACCOUNT,
      action: ACTION,
      setupCommitment: args.setupCommitment,
      setupNonce: 1n
    })
    expect(lowerMethods(opened)).toEqual(lowerMethods(CONFIGURATION))
    expect(opened.wait).toBe(CONFIGURATION.wait)
  })

  it('writes the public note and seals the backup at the shape-visible level', () => {
    const args = commitArgsOf(commitCallOf(shapeVisible))
    expect(args.publicMetadata).toBe(shapeDraft.privacy.publicMetadata)
    expect(args.publicMetadata).not.toBe('0x')
    expect(size(args.privateMetadata)).toBe(BACKUP_SEALED_SIZE)
  })

  it('commits one call at the next nonce for an armed account, with the clear backup and no note at the public level', async () => {
    const world = kitWorld({ accountCode: ACCOUNT_CODE })
    scriptAction(world.node, { supportsAccount: true, authorized: true })
    scriptState(world.node, {
      setupCommitment: `0x${'5a'.repeat(32)}`,
      setupNonce: 4n,
      setupCommittedAtBlock: HEAD - 10
    })
    const draft = draftAt('public', {
      privacy: { publicMetadata: '0xc0ffee', backup: 'clear' }
    })
    const prepared = await world.setup.prepareCommitSetup(draft)
    expect(prepared.kind).toBe('call')
    const call = prepared as PreparedCall
    expect([call.target, call.sender, call.value]).toEqual([MANAGER, 'account', 0n])
    expect(call.data).toBe(
      commitSetupData({
        action: ACTION,
        setupCommitment: commitmentOf(CONFIGURATION, 5n),
        nonce: 5n,
        publicMetadata: '0x',
        privateMetadata: clearBackupOf(CONFIGURATION)
      })
    )
    expect(lowerMethods(openClearBackup(commitArgsOf(call).privateMetadata))).toEqual(
      lowerMethods(CONFIGURATION)
    )
  })

  it('writes no backup and no note for an empty backup', async () => {
    const world = kitWorld()
    const prepared = await world.setup.prepareCommitSetup(
      draftAt('private', { privacy: { publicMetadata: '0x', backup: 'empty' } })
    )
    const args = commitArgsOf(commitCallOf(prepared))
    expect([args.publicMetadata, args.privateMetadata]).toEqual(['0x', '0x'])
  })

  it('refuses a draft the validation refuses, with its findings', async () => {
    const world = kitWorld()
    const thrown = await thrownBy(
      world.setup.prepareCommitSetup(draftAt('private', { clauses: [] }), PASSWORD)
    )
    expect(thrown).toMatchObject({ name: 'ValidationRefusal' })
    expect(codes((thrown as { findings: { errors: Finding[] } }).findings.errors)).toEqual([
      'rule.empty'
    ])
    expect(callsTo(world, ACTION_CALLS.isAuthorized)).toEqual([])
  })

  it('refuses a sealed backup with no password', async () => {
    const world = kitWorld()
    expect(await thrownBy(world.setup.prepareCommitSetup(draftAt('private')))).toMatchObject({
      name: 'CodedError',
      code: 'setup.password-missing'
    })
    expect(await thrownBy(world.setup.prepareCommitSetup(draftAt('private'), ''))).toMatchObject({
      code: 'setup.password-missing'
    })
  })

  describe('confirmSetup', () => {
    /** The manager's state once the prepared commit landed and stands. */
    const SAVED = {
      setupCommitment: commitmentOf(CONFIGURATION, 1n),
      setupNonce: 1n,
      setupCommittedAtBlock: HEAD
    }
    const landedWorld = (
      log: ReturnType<typeof committedLog> | undefined,
      authorized = true,
      state = SAVED
    ) => {
      const world = kitWorld({ accountCode: ACCOUNT_CODE })
      scriptAction(world.node, { supportsAccount: true, authorized })
      if (log) {
        world.node.addLog(log)
        scriptState(world.node, state)
      }
      return world
    }
    const commitLogAt = (blockNumber: number) => {
      const args = commitArgsOf(commitCallOf(unarmedPrivate))
      return committedLog(
        {
          nonce: args.nonce,
          setupCommitment: args.setupCommitment,
          privateMetadata: args.privateMetadata
        },
        blockNumber
      )
    }

    it('finds the commit that landed from the prepared block on, with the account armed', async () => {
      const log = commitLogAt(HEAD)
      const world = landedWorld(log)
      const confirmation = await world.setup.confirmSetup(draftAt('private'), unarmedPrivate)
      expect(confirmation).toEqual({
        landed: true,
        nonce: 1n,
        setupCommitment: commitmentOf(CONFIGURATION, 1n),
        isAuthorized: true,
        position: {
          blockNumber: HEAD,
          blockHash: log.blockHash,
          logIndex: log.logIndex,
          transactionHash: log.transactionHash,
          removed: false
        }
      })
      expect(world.node.provider.logs.mock.calls[0][1].from).toBe(HEAD)
    })

    it('reads the arming apart from the landing', async () => {
      const world = landedWorld(commitLogAt(HEAD), false)
      const confirmation = await world.setup.confirmSetup(draftAt('private'), unarmedPrivate)
      expect([confirmation.landed, confirmation.isAuthorized]).toEqual([true, false])
    })

    it('misses a commit that has not landed, and one before the prepared block', async () => {
      const none = await landedWorld(undefined).setup.confirmSetup(
        draftAt('private'),
        unarmedPrivate
      )
      expect(none).toEqual({
        landed: false,
        nonce: 1n,
        setupCommitment: commitmentOf(CONFIGURATION, 1n),
        isAuthorized: true
      })
      const earlier = await landedWorld(commitLogAt(HEAD - 1)).setup.confirmSetup(
        draftAt('private'),
        unarmedPrivate
      )
      expect(earlier.landed).toBe(false)
    })

    it('misses a commit that landed and was then cleared, with the arming kept', async () => {
      const world = landedWorld(commitLogAt(HEAD), true, {
        setupCommitment: zeroHash,
        setupNonce: 1n,
        setupCommittedAtBlock: 0
      })
      const confirmation = await world.setup.confirmSetup(draftAt('private'), unarmedPrivate)
      expect(confirmation).toEqual({
        landed: false,
        nonce: 1n,
        setupCommitment: commitmentOf(CONFIGURATION, 1n),
        isAuthorized: true
      })
    })

    it('misses a commit that landed and was then replaced by a later setup', async () => {
      const world = landedWorld(commitLogAt(HEAD), true, {
        setupCommitment: `0x${'5a'.repeat(32)}`,
        setupNonce: 2n,
        setupCommittedAtBlock: HEAD - 1
      })
      const confirmation = await world.setup.confirmSetup(draftAt('private'), unarmedPrivate)
      expect(confirmation.landed).toBe(false)
      expect(confirmation).not.toHaveProperty('position')
    })

    it("reads the manager's state at the block the log scan ends and the arming is read", async () => {
      const world = landedWorld(commitLogAt(HEAD))
      await world.setup.confirmSetup(draftAt('private'), unarmedPrivate)
      expect(world.node.provider.logs.mock.calls.map((call) => call[1].to)).toEqual([HEAD])
      expect(callsTo(world, stateOfCall()).map((c) => c.block)).toEqual([HEAD])
      expect(callsTo(world, ACTION_CALLS.isAuthorized).map((c) => c.block)).toEqual([HEAD])
    })

    it('reads from the deployment block where the stored save carries no block', async () => {
      const world = landedWorld(commitLogAt(DEPLOYED_AT + 1))
      const stored = { ...unarmedPrivate, block: undefined } as unknown as PreparedBatch
      expect((await world.setup.confirmSetup(draftAt('private'), stored)).landed).toBe(true)
      expect(world.node.provider.logs.mock.calls[0][1].from).toBe(DEPLOYED_AT)
    })

    it('refuses confirm.commitment-mismatch for a draft that recomputes to another commitment', async () => {
      const world = landedWorld(commitLogAt(HEAD))
      const thrown = await thrownBy(
        world.setup.confirmSetup(
          draftAt('private', { wait: CONFIGURATION.wait + 1n }),
          unarmedPrivate
        )
      )
      expect(thrown).toMatchObject({
        name: 'CodedError',
        code: 'confirm.commitment-mismatch',
        values: { carried: commitmentOf(CONFIGURATION, 1n) }
      })
      expect(world.node.provider.logs).not.toHaveBeenCalled()
    })

    it('refuses confirm.no-commit-call for a save that carries no commit of this action', async () => {
      const world = landedWorld(commitLogAt(HEAD))
      const batch = unarmedPrivate as PreparedBatch
      const armingAlone = batch.calls[0]!
      const otherAction: PreparedCall = {
        ...batch.calls[1]!,
        data: commitSetupData({
          action: OTHER_ACTION,
          setupCommitment: commitmentOf(CONFIGURATION, 1n),
          nonce: 1n,
          publicMetadata: '0x',
          privateMetadata: '0x'
        })
      }
      const otherTarget: PreparedCall = { ...batch.calls[1]!, target: OTHER_ACTION }
      const garbled: PreparedCall = { ...batch.calls[1]!, data: '0x11d78064beef' }
      const refused = [
        armingAlone,
        otherAction,
        otherTarget,
        garbled,
        { ...batch, calls: [armingAlone, otherAction] },
        { ...batch, calls: 'not a list' } as unknown as PreparedBatch
      ]
      const thrown = await Promise.all(
        refused.map((prepared) => thrownBy(world.setup.confirmSetup(draftAt('private'), prepared)))
      )
      thrown.forEach((refusal) => expect(refusal).toMatchObject({ code: 'confirm.no-commit-call' }))
    })
  })

  describe('getSetup', () => {
    const restoreWorld = (
      state: { setupCommitment: Hex; setupNonce: bigint },
      privateMetadata?: Hex,
      logCommitment: Hex = state.setupCommitment
    ) => {
      const world = kitWorld()
      scriptState(world.node, { ...state, setupCommittedAtBlock: HEAD - 10 })
      if (privateMetadata !== undefined) {
        world.node.addLog(
          committedLog(
            { nonce: state.setupNonce, setupCommitment: logCommitment, privateMetadata },
            HEAD - 10
          )
        )
      }
      return world
    }
    const sealedState = () => {
      const args = commitArgsOf(commitCallOf(unarmedPrivate))
      return {
        state: { setupCommitment: args.setupCommitment, setupNonce: 1n },
        sealed: args.privateMetadata
      }
    }
    const causeOf = async (run: Promise<unknown>) => {
      const thrown = (await thrownBy(run)) as { name: string; cause: Finding }
      expect(thrown.name).toBe('RestoreRefusal')
      return [thrown.cause.code, thrown.cause.values]
    }

    it('opens the sealed backup of the standing setup with the password', async () => {
      const { state, sealed } = sealedState()
      const restored = await restoreWorld(state, sealed).setup.getSetup({ password: PASSWORD })
      expect(lowerMethods(restored)).toEqual(lowerMethods(CONFIGURATION))
      expect([restored.wait, restored.ignoresPause]).toEqual([CONFIGURATION.wait, false])
    })

    it('opens a clear backup with any password', async () => {
      const state = { setupCommitment: commitmentOf(CONFIGURATION, 2n), setupNonce: 2n }
      const restored = await restoreWorld(state, clearBackupOf(CONFIGURATION)).setup.getSetup({
        password: 'anything'
      })
      expect(lowerMethods(restored)).toEqual(lowerMethods(CONFIGURATION))
    })

    it('refuses restore.no-backup where no setup stands, no commit log is found, or the backup is empty', async () => {
      expect(await causeOf(kitWorld().setup.getSetup({ password: PASSWORD }))).toEqual([
        'restore.no-backup',
        { setup: 'none' }
      ])
      const state = { setupCommitment: commitmentOf(CONFIGURATION, 1n), setupNonce: 1n }
      expect(await causeOf(restoreWorld(state).setup.getSetup({ password: PASSWORD }))).toEqual([
        'restore.no-backup',
        { setup: 'standing', backup: 'none' }
      ])
      expect(
        await causeOf(
          restoreWorld(state, clearBackupOf(CONFIGURATION), `0x${'77'.repeat(32)}`).setup.getSetup({
            password: PASSWORD
          })
        )
      ).toEqual(['restore.no-backup', { setup: 'standing', backup: 'none' }])
      expect(
        await causeOf(restoreWorld(state, '0x').setup.getSetup({ password: PASSWORD }))
      ).toEqual(['restore.no-backup', { setup: 'standing', backup: 'none' }])
    })

    it('refuses restore.backup-unopened for a wrong password or a backup that does not open', async () => {
      const { state, sealed } = sealedState()
      expect(
        await causeOf(restoreWorld(state, sealed).setup.getSetup({ password: 'not the password' }))
      ).toEqual(['restore.backup-unopened', { reason: 'unopened' }])
      expect(
        await causeOf(restoreWorld(state, '0x02beef').setup.getSetup({ password: PASSWORD }))
      ).toEqual(['restore.backup-unopened', { reason: 'malformed' }])
      expect(
        await causeOf(restoreWorld(state, '0x07beef').setup.getSetup({ password: PASSWORD }))
      ).toEqual(['restore.backup-unopened', { reason: 'unknown-version' }])
    })

    it('refuses restore.commitment-mismatch for a backup of another configuration', async () => {
      const state = { setupCommitment: commitmentOf(CONFIGURATION, 1n), setupNonce: 1n }
      const other = { ...CONFIGURATION, wait: CONFIGURATION.wait + 1n }
      expect(
        await causeOf(
          restoreWorld(state, clearBackupOf(other)).setup.getSetup({ password: PASSWORD })
        )
      ).toEqual([
        'restore.commitment-mismatch',
        { committed: state.setupCommitment, recomputed: commitmentOf(other, 1n) }
      ])
    })

    it('checks a configuration given as the source against the commitment, reading no backup', async () => {
      const state = { setupCommitment: commitmentOf(CONFIGURATION, 1n), setupNonce: 1n }
      const world = restoreWorld(state)
      expect(await world.setup.getSetup(CONFIGURATION)).toBe(CONFIGURATION)
      const other = { ...CONFIGURATION, wait: CONFIGURATION.wait + 1n }
      expect((await causeOf(world.setup.getSetup(other)))[0]).toBe('restore.commitment-mismatch')
      expect(world.node.provider.logs).not.toHaveBeenCalled()
    })
  })
})

describe('the members the deployed kit does not serve', () => {
  it('refuses the clear and the events feed, naming each member', async () => {
    const world = kitWorld()
    expect(await thrownBy(world.setup.prepareClearSetup())).toMatchObject({
      name: 'NotServedRefusal',
      member: 'setup.prepareClearSetup'
    })
    const { events } = world.setup
    expect(
      await thrownBy(events.fetch({ addresses: [], topics: [] }, { from: 0, to: 1 }))
    ).toMatchObject({
      name: 'NotServedRefusal',
      member: 'setup.events.fetch'
    })
    expect(() => events.accountFilter()).toThrow(
      expect.objectContaining({ member: 'setup.events.accountFilter' })
    )
    expect(world.node.calls).toEqual([])
  })
})

describe('the method calls the client makes', () => {
  it('reads each method of a draft once, whatever its letter case', async () => {
    const world = kitWorld()
    const upper = `0x${METHOD_ECDSA.slice(2).toUpperCase()}` as Hex
    await world.setup.validateSetup(
      draftAt('private', {
        clauses: [
          { threshold: 1, credentials: [guardianAt(0), { ...guardianAt(1), method: upper }] }
        ]
      })
    )
    expect(callsTo(world, METHOD_CALLS.paused)).toHaveLength(1)
  })
})
