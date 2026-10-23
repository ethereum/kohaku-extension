/**
 * The fake node under the real SDK: a seeded setup reads back through the
 * SDK's setup client and restores from its sealed backup, a landed prepared
 * batch changes what the manager answers, and a failed read rejects as the
 * provider would, a revert in the SDK's revert shape. A deployment that
 * disagrees with the build, and a privilege write, answer as they were seeded.
 * An Aadhaar module judges a proof by the bindings, the window and the age of
 * the QR code the deployed verifier checks; the zero address judges nothing.
 */
import {
  BUILDER_CHAIN_MISMATCH_MESSAGE,
  BUILDER_DIGEST_VERSION_MESSAGE,
  isProviderRevert,
  SocialRecoveryBuilder,
  configurationBody,
  configurationCommitment,
  encodeSetupBody,
  ERRORS_MANAGER_ABI,
  FORMATS_START_ATTEMPT_ABI,
  KitRefusalError,
  METHOD_ECDSA_CONFIG_ABI,
  POLICY_MANAGER_WRITES_ABI,
  POLICY_METHOD_VERIFY_ABI,
  setupCommitment as commitmentOf,
  VERDICT_MAGIC_VALUE
} from '@kohaku-eth/social-recovery'
import type {
  Address,
  Configuration,
  DeploymentDescriptor,
  Hex,
  PreparedCall
} from '@kohaku-eth/social-recovery'
import { anonAadhaarMethod } from '@kohaku-eth/social-recovery/recovery-methods'
import {
  decodeErrorResult,
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  keccak256,
  zeroAddress,
  zeroHash
} from 'viem'

import { ACTION_IMMUTABLES_ABI } from '@web/modules/social-recovery/shared/client/abi'
import {
  createScriptedAadhaarStack,
  ScriptedNode
} from '@web/modules/social-recovery/shared/client/scripted'

const at = (n: number): Address => `0x${n.toString(16).padStart(40, '0')}` as Address

const DESCRIPTOR: DeploymentDescriptor = {
  chainId: 11155111,
  manager: at(0xc70101),
  methodEcdsa: at(0xc70102),
  methodPasskey: at(0xc70103),
  methodAadhaar: at(0xc70104),
  methodZkpassport: at(0xc70105),
  action: at(0xc70106),
  servedImplementation: at(0xa11ce),
  deployedAt: 0,
  digestVersion: '1',
  managerVersion: '1.0.0',
  shippedMethods: [at(0xc70102), at(0xc70103)],
  auditedActions: [at(0xc70106)]
}
const ACCOUNT = at(0xacc0)
const GUARDIAN = at(0x6a12d)

const CONFIGURATION: Configuration = {
  wait: 3 * 24 * 3600,
  ignoresPause: false,
  clauses: [
    {
      threshold: 1,
      credentials: [
        {
          method: DESCRIPTOR.methodEcdsa,
          config: encodeAbiParameters(METHOD_ECDSA_CONFIG_ABI, [GUARDIAN])
        }
      ]
    }
  ]
}

const nodeOf = () =>
  new ScriptedNode({ descriptor: DESCRIPTOR, account: ACCOUNT, clock: () => 1_790_000_000 })

const clientsOver = (node: ScriptedNode) =>
  SocialRecoveryBuilder.from({ provider: node, account: ACCOUNT, descriptor: DESCRIPTOR }).build()

const startOf = (node: ScriptedNode, setupBody: Hex): PreparedCall =>
  ({
    kind: 'call',
    target: DESCRIPTOR.manager,
    value: 0n,
    sender: 'anyone',
    data: encodeFunctionData({
      abi: FORMATS_START_ATTEMPT_ABI,
      functionName: 'startAttempt',
      args: [
        {
          account: ACCOUNT,
          action: DESCRIPTOR.action,
          attemptId: node.manager.nextAttemptId,
          setupNonce: node.manager.setupNonce,
          setupBody,
          payload: '0x',
          order: { token: zeroAddress, amount: 0n, payee: zeroAddress },
          validUntil: 1_790_100_000,
          proofs: []
        }
      ]
    })
  } as unknown as PreparedCall)

const ownerWriteOf = (functionName: 'clearSetup' | 'cancelByOwner', word: bigint): PreparedCall =>
  ({
    kind: 'call',
    target: DESCRIPTOR.manager,
    value: 0n,
    sender: 'account',
    data: encodeFunctionData({
      abi: POLICY_MANAGER_WRITES_ABI,
      functionName,
      args: [DESCRIPTOR.action, word]
    })
  } as unknown as PreparedCall)

const refusalOf = (node: ScriptedNode, call: PreparedCall) => {
  try {
    node.land(call)
    return undefined
  } catch (error: unknown) {
    return decodeErrorResult({ abi: ERRORS_MANAGER_ABI, data: (error as { data: Hex }).data })
  }
}

describe('the fake node under the SDK', () => {
  it('reads a seeded setup back through the setup client and restores it from its backup', async () => {
    const node = nodeOf()
    const { nonce, setupCommitment } = await node.commitSetup(
      CONFIGURATION,
      { publicMetadata: '0x', backup: 'encrypted' },
      'correct horse'
    )
    const { setupClient } = await clientsOver(node)

    const state = await setupClient.setupState()
    expect(state.hasSetup).toBe(true)
    expect(state.setupNonce).toBe(nonce)
    expect(state.setupCommitment).toBe(setupCommitment)
    const restored = await setupClient.getSetup({ password: 'correct horse' })
    expect(configurationCommitment(restored, ACCOUNT, DESCRIPTOR.action, nonce)).toBe(
      setupCommitment
    )
  })

  it('lands a prepared commit, so the manager holds it and the account authorizes the action', async () => {
    const node = nodeOf()
    const { setupClient } = await clientsOver(node)
    const draft = {
      ...CONFIGURATION,
      privacy: { publicMetadata: '0x', backup: 'empty' }
    } as const
    expect((await setupClient.setupState()).hasSetup).toBe(false)

    const prepared = await setupClient.prepareCommitSetup(draft)
    expect(prepared.kind).toBe('batch')
    node.land(prepared)

    const state = await setupClient.setupState()
    expect(state.hasSetup).toBe(true)
    expect(state.isAuthorized).toBe(true)
    expect((await setupClient.confirmSetup(draft, prepared)).landed).toBe(true)
  })

  it("lands a start that waits the committed setup's wait, counted from its block", async () => {
    const node = nodeOf()
    const { setupClient } = await clientsOver(node)
    const draft = {
      ...CONFIGURATION,
      privacy: { publicMetadata: '0x', backup: 'empty' }
    } as const
    node.land(await setupClient.prepareCommitSetup(draft))

    node.land(startOf(node, encodeSetupBody(configurationBody(CONFIGURATION, ACCOUNT))))

    expect(node.manager.attempt?.consumableAfter).toBe(node.head.timestamp + CONFIGURATION.wait)
  })

  it('refuses a start whose body does not match the commitment or does not decode, and lands nothing', async () => {
    const node = nodeOf()
    const { setupClient } = await clientsOver(node)
    const draft = {
      ...CONFIGURATION,
      privacy: { publicMetadata: '0x', backup: 'empty' }
    } as const
    node.land(await setupClient.prepareCommitSetup(draft))
    const head = node.head.number
    const { attempt } = node.manager
    const committed = node.manager.setupCommitment

    const otherBody = encodeSetupBody(
      configurationBody({ ...CONFIGURATION, wait: 24 * 3600 }, ACCOUNT)
    )
    const mismatch = (() => {
      try {
        node.land(startOf(node, otherBody))
        return undefined
      } catch (error: unknown) {
        return error
      }
    })()
    expect(isProviderRevert(mismatch)).toBe(true)
    expect(
      decodeErrorResult({ abi: ERRORS_MANAGER_ABI, data: (mismatch as { data: Hex }).data })
    ).toMatchObject({
      errorName: 'PolicyManager_SetupCommitmentMismatch',
      args: [
        commitmentOf(ACCOUNT, DESCRIPTOR.action, node.manager.setupNonce, otherBody),
        committed
      ]
    })
    await expect(
      node.call(DESCRIPTOR.manager, startOf(node, otherBody).data, ACCOUNT, 'latest')
    ).rejects.toMatchObject({ data: (mismatch as { data: Hex }).data })

    const undecodable: Hex = '0xdeadbeef'
    node.manager.setupCommitment = commitmentOf(
      ACCOUNT,
      DESCRIPTOR.action,
      node.manager.setupNonce,
      undecodable
    )
    expect(() => node.land(startOf(node, undecodable))).toThrow(
      expect.objectContaining({ name: 'RevertedCall', data: '0x' })
    )

    expect(node.manager.attempt).toEqual(attempt)
    expect(node.head.number).toBe(head)
  })

  it("lands the owner's clear the SDK prepares, and refuses another nonce or no setup", async () => {
    const node = nodeOf()
    const { setupClient } = await clientsOver(node)
    expect(refusalOf(node, ownerWriteOf('clearSetup', 0n))).toMatchObject({
      errorName: 'PolicyManager_NoSetup',
      args: [getAddress(ACCOUNT), getAddress(DESCRIPTOR.action)]
    })
    const { nonce } = await node.commitSetup(CONFIGURATION, {
      publicMetadata: '0x',
      backup: 'clear'
    })
    const head = node.head.number
    expect(refusalOf(node, ownerWriteOf('clearSetup', nonce + 1n))).toMatchObject({
      errorName: 'PolicyManager_WrongSetupNonce',
      args: [nonce + 1n, nonce]
    })
    expect(node.head.number).toBe(head)

    node.land(await setupClient.prepareClearSetup())

    expect(node.manager.setupCommitment).toBe(zeroHash)
  })

  it("lands the owner's cancel the SDK prepares, and refuses another attempt id or no waiting attempt", async () => {
    const node = nodeOf()
    const { recoveryClient } = await clientsOver(node)
    await node.commitSetup(CONFIGURATION, { publicMetadata: '0x', backup: 'clear' })
    expect(refusalOf(node, ownerWriteOf('cancelByOwner', 1n))).toMatchObject({
      errorName: 'PolicyManager_NoActiveAttempt',
      args: [getAddress(ACCOUNT), getAddress(DESCRIPTOR.action)]
    })
    await expect(recoveryClient.prepareCancelByOwner()).rejects.toBeInstanceOf(KitRefusalError)
    await expect(recoveryClient.prepareCancelByOwner()).rejects.toMatchObject({
      findings: { errors: [{ code: 'request.no-active-attempt' }] }
    })

    node.openAttempt()
    const { attemptId } = node.manager.attempt
    expect(refusalOf(node, ownerWriteOf('cancelByOwner', attemptId + 1n))).toMatchObject({
      errorName: 'PolicyManager_WrongAttemptId',
      args: [attemptId + 1n, attemptId]
    })
    expect(node.manager.attempt.state).toBe('Waiting')

    node.land(await recoveryClient.prepareCancelByOwner())

    expect(node.manager.attempt.state).toBe('Cancelled')
  })

  it('answers a deployment that disagrees with the build as it was seeded, through the SDK', async () => {
    const node = nodeOf()
    node.setChainId(1)
    await expect(clientsOver(node)).rejects.toThrow(BUILDER_CHAIN_MISMATCH_MESSAGE)

    const other = nodeOf()
    other.setDomain({ version: '2' })
    await expect(clientsOver(other)).rejects.toThrow(BUILDER_DIGEST_VERSION_MESSAGE)

    const moved = nodeOf()
    moved.setConstants({ manager: GUARDIAN })
    const answer = await moved.call(
      DESCRIPTOR.action,
      encodeFunctionData({ abi: ACTION_IMMUTABLES_ABI, functionName: 'MANAGER' }),
      zeroAddress,
      'latest'
    )
    expect(
      decodeFunctionResult({ abi: ACTION_IMMUTABLES_ABI, functionName: 'MANAGER', data: answer })
    ).toBe(getAddress(GUARDIAN))

    moved.setContractCode(DESCRIPTOR.manager, false)
    await expect(moved.code(DESCRIPTOR.manager, 'latest')).resolves.toBe('0x')
    await expect(
      moved.call(
        DESCRIPTOR.manager,
        encodeFunctionData({ abi: ACTION_IMMUTABLES_ABI, functionName: 'MANAGER' }),
        zeroAddress,
        'latest'
      )
    ).resolves.toBe('0x')
  })

  it('writes a privilege on the account with its log, as the account would', async () => {
    const node = nodeOf()
    node.setPrivilege(GUARDIAN)
    const { setupClient } = await clientsOver(node)
    const writes = await setupClient.events.fetch(setupClient.events.privilegeFilter(), {
      from: 0,
      to: node.head.number
    })
    expect(writes).toMatchObject([{ kind: 'privilege-changed', addr: getAddress(GUARDIAN) }])

    node.setPrivilege(GUARDIAN, zeroHash)
    expect(node.privileges.has(GUARDIAN.toLowerCase())).toBe(false)
  })

  it('rejects a failed read as a transport failure, and a scripted revert in the revert shape', async () => {
    const node = nodeOf()
    const { setupClient } = await clientsOver(node)
    node.failRead('stateOf')
    await expect(setupClient.setupState()).rejects.toThrow()

    node.failRead('stateOf', { kind: 'revert', data: '0xdeadbeef' })
    const thrown = await setupClient.setupState().catch((error: unknown) => error)
    expect(isProviderRevert(thrown)).toBe(true)

    node.restoreRead()
    expect((await setupClient.setupState()).setupCommitment).toBe(zeroHash)
  })
})

describe("the Aadhaar module's verdict on the fake node", () => {
  const NOW = 1_790_000_000
  const DAY = 24 * 3600
  const DIGEST: Hex = `0x${'ab'.repeat(32)}`
  const { codec } = anonAadhaarMethod({ stack: createScriptedAadhaarStack() })
  const NULLIFIER = 22n
  const SEED = 1n
  const TIMESTAMP_INPUT = 2
  const DISCLOSURE_INPUTS = [3, 4, 5, 6]

  const configOf = (freshnessWindow = BigInt(DAY)): Hex =>
    codec.encodeConfig({ nullifier: NULLIFIER, nullifierSeed: SEED, freshnessWindow })

  /** A proof that binds the config and the digest, signed a minute before the latest block, with one input changed. */
  const proofOf = (index?: number, value?: bigint): Hex => {
    const inputs = [
      99n,
      NULLIFIER,
      BigInt(NOW - 60),
      0n,
      0n,
      0n,
      0n,
      SEED,
      BigInt(keccak256(DIGEST)) / 8n
    ]
    if (index !== undefined && value !== undefined) {
      inputs[index] = value
    }
    return codec.encodeProof({
      a: [1n, 2n],
      b: [
        [3n, 4n],
        [5n, 6n]
      ],
      c: [7n, 8n],
      inputs
    })
  }

  const verdictOf = async (
    node: ScriptedNode,
    module: Address,
    config: Hex,
    proof: Hex
  ): Promise<string> => {
    const answer = await node.call(
      module,
      encodeFunctionData({
        abi: POLICY_METHOD_VERIFY_ABI,
        functionName: 'verify',
        args: [config, DIGEST, proof]
      }),
      ACCOUNT,
      'latest'
    )
    return answer === VERDICT_MAGIC_VALUE ? 'satisfied' : 'rejected'
  }

  const nodeAt = (descriptor: DeploymentDescriptor = DESCRIPTOR) =>
    new ScriptedNode({ descriptor, account: ACCOUNT, clock: () => NOW })

  it('satisfies a proof that binds the config and the digest, discloses nothing and was signed within the window', async () => {
    await expect(
      verdictOf(nodeAt(), DESCRIPTOR.methodAadhaar, configOf(), proofOf())
    ).resolves.toBe('satisfied')
  })

  const WINDOWS: [bigint, string][] = [
    [3599n, 'rejected'],
    [3600n, 'satisfied'],
    [0n, 'rejected']
  ]
  WINDOWS.forEach(([window, verdict]) =>
    it(`answers ${verdict} for a config whose window is ${window} seconds`, async () => {
      await expect(
        verdictOf(nodeAt(), DESCRIPTOR.methodAadhaar, configOf(window), proofOf())
      ).resolves.toBe(verdict)
    })
  )

  DISCLOSURE_INPUTS.forEach((index) =>
    it(`rejects a proof that discloses its input ${index}`, async () => {
      await expect(
        verdictOf(nodeAt(), DESCRIPTOR.methodAadhaar, configOf(), proofOf(index, 1n))
      ).resolves.toBe('rejected')
    })
  )

  const AGES: [string, number, string][] = [
    ['exactly the window', DAY, 'satisfied'],
    ['one second past the window', DAY + 1, 'rejected'],
    ['two days', 2 * DAY, 'rejected'],
    ['a time after the latest block', -600, 'satisfied']
  ]
  AGES.forEach(([what, age, verdict]) =>
    it(`answers ${verdict} for a QR code signed ${what} before the latest block`, async () => {
      await expect(
        verdictOf(
          nodeAt(),
          DESCRIPTOR.methodAadhaar,
          configOf(),
          proofOf(TIMESTAMP_INPUT, BigInt(NOW - age))
        )
      ).resolves.toBe(verdict)
    })
  )

  it('measures the age against the latest block, which follows the clock', async () => {
    let now = NOW
    const node = new ScriptedNode({ descriptor: DESCRIPTOR, account: ACCOUNT, clock: () => now })
    const proof = proofOf()
    await expect(verdictOf(node, DESCRIPTOR.methodAadhaar, configOf(), proof)).resolves.toBe(
      'satisfied'
    )
    now += DAY
    await expect(verdictOf(node, DESCRIPTOR.methodAadhaar, configOf(), proof)).resolves.toBe(
      'rejected'
    )
  })

  it('judges nothing at the zero address a deployment gives a method it omits, a seeded verdict included', async () => {
    const node = nodeAt({
      ...DESCRIPTOR,
      methodAadhaar: zeroAddress,
      methodZkpassport: zeroAddress
    })
    const config = configOf()
    await expect(verdictOf(node, zeroAddress, config, proofOf())).resolves.toBe('rejected')
    node.setVerdict(config, 'satisfied')
    await expect(verdictOf(node, zeroAddress, config, proofOf())).resolves.toBe('rejected')
  })
})
