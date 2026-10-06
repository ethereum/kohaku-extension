/**
 * A deployed kit's setup client over a node scripted by hand. Every answer is
 * ABI-encoded here from hand-written signatures; the client reads through the
 * real chain reads, setup events and module reads over that node. Every
 * address is made up. No test reaches a network.
 */
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  encodeFunctionResult,
  type Hex,
  pad,
  parseAbi,
  parseAbiParameters,
  zeroAddress,
  zeroHash
} from 'viem'

import { PROXY_AMBIRE_ACCOUNT } from '@ambire-common/consts/deploy'
import { defaultClientConfiguration } from '@web/modules/social-recovery/sdk-doubles'
import type {
  Address,
  BlockRange,
  BlockTag,
  Configuration,
  Credential,
  DeploymentDescriptor,
  FilterSpec,
  PreparedBatch,
  PreparedCall,
  PrivacyLevel,
  RawLog,
  SetupDraft
} from '@web/modules/social-recovery/sdk-interfaces'
import { shapeNoteOf } from '@web/modules/social-recovery/shared/client'
import { createSetupEvents } from '@web/modules/social-recovery/shared/client/kit/events'
import {
  createActionReads,
  createManagerReads,
  createMethodReads
} from '@web/modules/social-recovery/shared/client/kit/reads'
import {
  createKitSetupClient,
  moduleReadsOf
} from '@web/modules/social-recovery/shared/client/kit/setup-client'
import { revertedCall } from '@web/modules/social-recovery/shared/client/provider-adapter'

import type {
  CommittedFields,
  FakeNode,
  KitWorld,
  KitWorldOptions,
  NodeCall,
  ScriptedAction,
  ScriptedMethod,
  ScriptedState
} from '@web/modules/social-recovery/shared/client/kit/setup-client/__fixtures__/types'

export const ACCOUNT: Address = '0x1111111111111111111111111111111111111111'
export const MANAGER: Address = '0xa1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1'
export const METHOD_ECDSA: Address = '0xa2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2'
export const METHOD_PASSKEY: Address = '0xa3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3'
export const METHOD_AADHAAR: Address = '0xa4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4'
export const METHOD_ZKPASSPORT: Address = '0xa5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5'
export const ACTION: Address = '0xa6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6'
export const OTHER_ACTION: Address = '0xa7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7'
export const THIRD_ACTION: Address = '0xa8a8a8a8a8a8a8a8a8a8a8a8a8a8a8a8a8a8a8a8'
export const KEY_A: Address = '0xb1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1'
export const KEY_B: Address = '0xb2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2'
export const ACCOUNT_CODE: Hex = '0x6080604052'
export const CONTRACT_CODE: Hex = '0x60806040'

export const DEPLOYED_AT = 1_000_000
export const HEAD = 1_000_400
export const HEAD_TIMESTAMP = 1_800_000_000
export const PASSWORD = 'correct horse battery staple'

export const MANAGER_ABI = parseAbi([
  'function stateOf(address account, address action) view returns ((bytes32, uint64, uint64, uint48, (uint64, uint64, uint48, uint8, bool, bytes32, (address, uint256, address), address[])))',
  'function commitSetup(address action, bytes32 setupCommitment, uint64 nonce, bytes publicMetadata, bytes privateMetadata)',
  'function clearSetup(address action, uint64 nonce)',
  'event SetupCommitted(address indexed account, address indexed action, uint64 nonce, bytes32 setupCommitment, bytes publicMetadata, bytes privateMetadata)',
  'event SetupCleared(address indexed account, address indexed action, uint64 nonce)',
  'error PolicyManager_WrongSetupNonce(uint64 supplied, uint64 expected)',
  'error PolicyManager_InvalidCommitment(bytes32 supplied)'
])

export const ACTION_ABI = parseAbi([
  'function MANAGER() view returns (address)',
  'function AMBIRE_IMPLEMENTATION() view returns (address)',
  'function KIT_SLOT() view returns (address)',
  'function BINDING() view returns (bytes32)',
  'function isAuthorized(address account) view returns (bool)',
  'function isAuthority(address account, address key) view returns (bool)',
  'function supportsAccount(address account) view returns (bool)',
  'function name() view returns (string)',
  'function version() view returns (string)',
  'function supportsInterface(bytes4 id) view returns (bool)'
])

export const METHOD_ABI = parseAbi([
  'function name() view returns (string)',
  'function version() view returns (string)',
  'function supportsInterface(bytes4 id) view returns (bool)',
  'function trustedParties() view returns (address, address, bytes32[], address, address)',
  'function paused() view returns (bool)'
])

export const ACCOUNT_ABI = parseAbi(['function setAddrPrivilege(address addr, bytes32 priv)'])

/** The interface the methods and the action declare, as the deployed contracts answer them. */
export const METHOD_PROBE: Hex = '0xf057a368'
export const ACTION_PROBE: Hex = '0x59cd148e'

const topicMatches = (expected: FilterSpec['topics'][number], actual: Hex | undefined): boolean => {
  if (expected === null || expected === undefined) {
    return true
  }
  const wanted = (Array.isArray(expected) ? expected : [expected]).map((t) => t.toLowerCase())
  return actual !== undefined && wanted.includes(actual.toLowerCase())
}

export const fakeNode = (): FakeNode => {
  const routes = new Map<string, Hex | Error>()
  const codes = new Map<string, Hex>()
  const logs: RawLog[] = []
  const calls: NodeCall[] = []
  const head = { number: HEAD, timestamp: HEAD_TIMESTAMP, hash: pad(`0x${HEAD.toString(16)}`) }
  const keyOf = (to: Address, data: Hex) => `${to.toLowerCase()}:${data.toLowerCase()}`
  const provider = {
    chainId: jest.fn(async () => 11155111),
    call: jest.fn(async (to: Address, data: Hex, _from: Address | undefined, block: BlockTag) => {
      calls.push({ to, data, block })
      if (!codes.has(to.toLowerCase())) {
        return '0x'
      }
      const answer = routes.get(keyOf(to, data))
      if (answer === undefined) {
        throw new Error(`The fake node has no answer for ${data} to ${to}.`)
      }
      if (answer instanceof Error) {
        throw answer
      }
      return answer
    }),
    logs: jest.fn(async (filter: FilterSpec, range: BlockRange) =>
      logs.filter(
        (log) =>
          filter.addresses.some((address) => address.toLowerCase() === log.address.toLowerCase()) &&
          filter.topics.every((topic, index) => topicMatches(topic, log.topics[index])) &&
          log.blockNumber >= range.from &&
          log.blockNumber <= range.to
      )
    ),
    block: jest.fn(async () => head)
  }
  return {
    provider,
    codeRead: {
      code: jest.fn(async (address: Address) => codes.get(address.toLowerCase()) ?? '0x')
    },
    head,
    answer: (to, data, answer) => {
      routes.set(keyOf(to, data), answer)
    },
    setCode: (address, code) => {
      codes.set(address.toLowerCase(), code)
    },
    addLog: (log) => {
      logs.push(log)
    },
    calls
  }
}

/** A revert as the provider adapter throws it, with its raw data. */
export const reverting = (data: Hex = '0x'): Error => revertedCall('call', data)

// ---------------------------------------------------------------------------
// The manager
// ---------------------------------------------------------------------------

export const NO_STATE: ScriptedState = {
  setupCommitment: zeroHash,
  setupNonce: 0n,
  setupCommittedAtBlock: 0
}

export const stateOfCall = (action: Address = ACTION): Hex =>
  encodeFunctionData({ abi: MANAGER_ABI, functionName: 'stateOf', args: [ACCOUNT, action] })

export const stateAnswer = (state: ScriptedState): Hex =>
  encodeFunctionResult({
    abi: MANAGER_ABI,
    functionName: 'stateOf',
    result: [
      state.setupCommitment,
      state.setupNonce,
      1n,
      state.setupCommittedAtBlock,
      [0n, 0n, 0, state.attemptState ?? 0, false, zeroHash, [zeroAddress, 0n, zeroAddress], []]
    ]
  })

export const scriptState = (node: FakeNode, state: ScriptedState): void =>
  node.answer(MANAGER, stateOfCall(), stateAnswer(state))

// ---------------------------------------------------------------------------
// The methods and the action
// ---------------------------------------------------------------------------

const methodCall = (
  functionName: 'name' | 'version' | 'trustedParties' | 'paused' | 'supportsInterface'
): Hex =>
  functionName === 'supportsInterface'
    ? encodeFunctionData({ abi: METHOD_ABI, functionName, args: [METHOD_PROBE] })
    : encodeFunctionData({ abi: METHOD_ABI, functionName })

export const METHOD_CALLS = {
  name: methodCall('name'),
  version: methodCall('version'),
  supportsInterface: methodCall('supportsInterface'),
  trustedParties: methodCall('trustedParties'),
  paused: methodCall('paused')
}

/** A word `paused()` answers: 1 for a stopped method. */
export const word = (value: bigint): Hex =>
  encodeAbiParameters(parseAbiParameters('uint256'), [value])

export const scriptMethod = (
  node: FakeNode,
  method: Address,
  script: ScriptedMethod = {}
): void => {
  node.setCode(method, CONTRACT_CODE)
  const view = (answer: Hex): Hex | Error => script.views ?? answer
  node.answer(
    method,
    METHOD_CALLS.name,
    view(
      encodeFunctionResult({
        abi: METHOD_ABI,
        functionName: 'name',
        result: script.name ?? 'method'
      })
    )
  )
  node.answer(
    method,
    METHOD_CALLS.version,
    view(
      encodeFunctionResult({
        abi: METHOD_ABI,
        functionName: 'version',
        result: script.version ?? '1.0.0'
      })
    )
  )
  node.answer(
    method,
    METHOD_CALLS.supportsInterface,
    view(
      encodeFunctionResult({
        abi: METHOD_ABI,
        functionName: 'supportsInterface',
        result: script.probe ?? true
      })
    )
  )
  node.answer(
    method,
    METHOD_CALLS.trustedParties,
    view(
      encodeFunctionResult({
        abi: METHOD_ABI,
        functionName: 'trustedParties',
        result: [zeroAddress, zeroAddress, [], zeroAddress, zeroAddress]
      })
    )
  )
  // The deployed methods carry no stop: `paused()` reverts with no data.
  node.answer(method, METHOD_CALLS.paused, script.paused ?? reverting())
}

const boolOf = (
  functionName: 'isAuthorized' | 'isAuthority' | 'supportsAccount' | 'supportsInterface',
  result: boolean
): Hex => encodeFunctionResult({ abi: ACTION_ABI, functionName, result })

export const ACTION_CALLS = {
  isAuthorized: encodeFunctionData({
    abi: ACTION_ABI,
    functionName: 'isAuthorized',
    args: [ACCOUNT]
  }),
  supportsAccount: encodeFunctionData({
    abi: ACTION_ABI,
    functionName: 'supportsAccount',
    args: [ACCOUNT]
  }),
  isAuthority: (key: Address): Hex =>
    encodeFunctionData({ abi: ACTION_ABI, functionName: 'isAuthority', args: [ACCOUNT, key] })
}

export const scriptAction = (node: FakeNode, script: ScriptedAction = {}): void => {
  const at = script.at ?? ACTION
  node.setCode(at, CONTRACT_CODE)
  const fits = script.supportsAccount ?? false
  node.answer(
    at,
    ACTION_CALLS.supportsAccount,
    fits instanceof Error ? fits : boolOf('supportsAccount', fits)
  )
  node.answer(at, ACTION_CALLS.isAuthorized, boolOf('isAuthorized', script.authorized ?? false))
  ;[KEY_A, KEY_B].forEach((key) =>
    node.answer(
      at,
      ACTION_CALLS.isAuthority(key),
      boolOf(
        'isAuthority',
        (script.authorities ?? []).some((held) => held.toLowerCase() === key.toLowerCase())
      )
    )
  )
  node.answer(
    at,
    encodeFunctionData({ abi: ACTION_ABI, functionName: 'name' }),
    encodeFunctionResult({ abi: ACTION_ABI, functionName: 'name', result: 'AmbireRecoveryAction' })
  )
  node.answer(
    at,
    encodeFunctionData({ abi: ACTION_ABI, functionName: 'version' }),
    encodeFunctionResult({ abi: ACTION_ABI, functionName: 'version', result: '1.0.0' })
  )
  node.answer(
    at,
    encodeFunctionData({
      abi: ACTION_ABI,
      functionName: 'supportsInterface',
      args: [ACTION_PROBE]
    }),
    boolOf('supportsInterface', script.probe ?? true)
  )
}

// ---------------------------------------------------------------------------
// The setup logs
// ---------------------------------------------------------------------------

let logIndex = 0

const logAt = (topics: Hex[], data: Hex, blockNumber: number): RawLog => {
  logIndex += 1
  return {
    address: MANAGER,
    topics,
    data,
    blockNumber,
    blockHash: pad(`0x${blockNumber.toString(16)}`),
    logIndex,
    transactionHash: pad(`0x${(blockNumber * 1000 + logIndex).toString(16)}`),
    removed: false
  }
}

export const committedLog = (fields: CommittedFields, blockNumber: number): RawLog =>
  logAt(
    encodeEventTopics({
      abi: MANAGER_ABI,
      eventName: 'SetupCommitted',
      args: { account: ACCOUNT, action: fields.action ?? ACTION }
    }) as Hex[],
    encodeAbiParameters(parseAbiParameters('uint64, bytes32, bytes, bytes'), [
      fields.nonce,
      fields.setupCommitment,
      fields.publicMetadata ?? '0x',
      fields.privateMetadata ?? '0x'
    ]),
    blockNumber
  )

export const clearedLog = (action: Address, nonce: bigint, blockNumber: number): RawLog =>
  logAt(
    encodeEventTopics({
      abi: MANAGER_ABI,
      eventName: 'SetupCleared',
      args: { account: ACCOUNT, action }
    }) as Hex[],
    encodeAbiParameters(parseAbiParameters('uint64'), [nonce]),
    blockNumber
  )

// ---------------------------------------------------------------------------
// Drafts and decoded calls
// ---------------------------------------------------------------------------

export const guardianAt = (index: number, extra: Partial<Credential> = {}): Credential => ({
  method: METHOD_ECDSA,
  config: encodeAbiParameters(parseAbiParameters('address'), [
    pad(`0x${(index + 1).toString(16)}`, { size: 20 })
  ]),
  ...extra
})

export const passkeyAt = (index: number): Credential => ({
  method: METHOD_PASSKEY,
  config: encodeAbiParameters(parseAbiParameters('bytes32, bytes32, bytes32'), [
    pad(`0x${(index + 1).toString(16)}`),
    pad(`0x${(index + 2).toString(16)}`),
    pad(`0x${(index + 3).toString(16)}`)
  ])
})

export const CONFIGURATION: Configuration = {
  clauses: [
    { threshold: 2, credentials: [guardianAt(0), guardianAt(1), guardianAt(2)] },
    { threshold: 1, credentials: [guardianAt(3)] }
  ],
  wait: 432_000n,
  ignoresPause: false
}

export const draftAt = (level: PrivacyLevel, overrides: Partial<SetupDraft> = {}): SetupDraft => {
  const configuration: Configuration = {
    clauses: overrides.clauses ?? CONFIGURATION.clauses,
    wait: overrides.wait ?? CONFIGURATION.wait,
    ignoresPause: overrides.ignoresPause ?? CONFIGURATION.ignoresPause
  }
  return {
    ...configuration,
    privacy: {
      publicMetadata: level === 'shape-visible' ? shapeNoteOf(configuration) : '0x',
      backup: level === 'public' ? 'clear' : 'encrypted'
    },
    ...overrides
  }
}

export const commitArgsOf = (call: PreparedCall) => {
  const decoded = decodeFunctionData({ abi: MANAGER_ABI, data: call.data })
  if (decoded.functionName !== 'commitSetup') {
    throw new Error(`Not a commitSetup call: ${decoded.functionName}.`)
  }
  const [action, setupCommitment, nonce, publicMetadata, privateMetadata] = decoded.args
  return { action, setupCommitment, nonce, publicMetadata, privateMetadata }
}

export const armingArgsOf = (call: PreparedCall) => {
  const { args } = decodeFunctionData({ abi: ACCOUNT_ABI, data: call.data })
  return { slot: args[0], value: args[1] }
}

export const commitCallOf = (prepared: PreparedCall | PreparedBatch): PreparedCall => {
  if (prepared.kind === 'call') {
    return prepared
  }
  const last = prepared.calls[prepared.calls.length - 1]
  if (!last) {
    throw new Error('The batch carries no call.')
  }
  return last
}

// ---------------------------------------------------------------------------
// The world
// ---------------------------------------------------------------------------

export const DESCRIPTOR: DeploymentDescriptor = {
  chainId: 11155111,
  manager: MANAGER,
  methodEcdsa: METHOD_ECDSA,
  methodPasskey: METHOD_PASSKEY,
  methodAadhaar: METHOD_AADHAAR,
  methodZkpassport: METHOD_ZKPASSPORT,
  action: ACTION,
  servedImplementation: PROXY_AMBIRE_ACCOUNT,
  deployedAt: DEPLOYED_AT,
  digestVersion: '1',
  managerVersion: '1.0.0',
  shippedMethods: [METHOD_ECDSA, METHOD_PASSKEY, METHOD_AADHAAR, METHOD_ZKPASSPORT],
  auditedActions: [ACTION]
}

/**
 * The world of a fresh account: no code, no setup, the action unarmed, the
 * two primary methods and the action deployed as the deployed ones answer.
 */
export const kitWorld = (options: KitWorldOptions = {}): KitWorld => {
  const node = fakeNode()
  const descriptor = { ...DESCRIPTOR, ...options.descriptor }
  const config = defaultClientConfiguration({
    candidateKeys: [KEY_A, KEY_B],
    accountImplementation: PROXY_AMBIRE_ACCOUNT,
    ...options.config
  })
  node.setCode(MANAGER, CONTRACT_CODE)
  if (options.accountCode) {
    node.setCode(ACCOUNT, options.accountCode)
  }
  scriptState(node, NO_STATE)
  scriptMethod(node, METHOD_ECDSA, { name: 'method-ecdsa' })
  scriptMethod(node, METHOD_PASSKEY, { name: 'method-passkey' })
  scriptAction(node, { supportsAccount: !!options.accountCode })
  const removedKey = jest.fn(
    async () => options.removedKey ?? ({ kind: 'named', key: KEY_A } as const)
  )
  const setup = createKitSetupClient({
    account: ACCOUNT,
    descriptor,
    config,
    provider: node.provider,
    codeRead: node.codeRead,
    manager: createManagerReads(node.provider, MANAGER),
    action: createActionReads({ provider: node.provider, codeRead: node.codeRead }, ACTION),
    moduleReads: moduleReadsOf(createMethodReads(node.provider)),
    events: createSetupEvents(node.provider, MANAGER),
    walletReads: { removedKey },
    initialPrivileges: options.initialPrivileges ?? []
  })
  return { node, descriptor, config, setup, removedKey, draft: draftAt }
}

/** Settles a promise into the value it threw; fails where it resolved. */
export const thrownBy = async (run: Promise<unknown>): Promise<unknown> => {
  try {
    await run
  } catch (thrown: unknown) {
    return thrown
  }
  throw new Error('Expected a rejection, the promise resolved.')
}

// Jest runs every file under __tests__, this one included; its own check runs
// only when Jest runs this file, never from a file that imports the harness.
if (expect.getState().testPath === __filename) {
  describe('harness', () => {
    it('answers no bytes at an address with no code, and refuses an unscripted call to a contract', async () => {
      const node = fakeNode()
      await expect(
        node.provider.call(ACTION, METHOD_CALLS.name, undefined, 'latest')
      ).resolves.toBe('0x')
      node.setCode(ACTION, CONTRACT_CODE)
      await expect(
        node.provider.call(ACTION, METHOD_CALLS.name, undefined, 'latest')
      ).rejects.toThrow('no answer')
    })

    it('filters the logs by the manager, the topics and the range, as a node does', async () => {
      const node = fakeNode()
      const commitment: Hex = `0x${'5a'.repeat(32)}`
      const inside = committedLog(
        { action: OTHER_ACTION, nonce: 1n, setupCommitment: commitment },
        10
      )
      node.addLog(inside)
      node.addLog(
        committedLog({ action: THIRD_ACTION, nonce: 1n, setupCommitment: commitment }, 30)
      )
      node.addLog(clearedLog(OTHER_ACTION, 2n, 12))
      const [topic, account] = inside.topics
      await expect(
        node.provider.logs({ addresses: [MANAGER], topics: [topic, account] }, { from: 0, to: 20 })
      ).resolves.toEqual([inside])
    })
  })
}
