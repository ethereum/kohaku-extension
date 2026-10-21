/**
 * A provider scripted call by call, for the client's reads that judge what a
 * node answers at its edges, and the world of one made-up deployment and
 * account it answers for. The logs and the manager's answer are encoded with
 * the SDK's own event and view ABIs. Every address is made up; no test
 * reaches a network.
 */
import {
  ATTEMPT_STATES,
  MANAGER_EVENTS_ABI,
  POLICY_MANAGER_STATE_OF_ABI
} from '@kohaku-eth/social-recovery'
import type {
  Address,
  BlockRange,
  BlockTag,
  DeploymentDescriptor,
  FilterSpec,
  FilterTopic,
  Hex,
  RawLog,
  RawTransaction
} from '@kohaku-eth/social-recovery'
import {
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  encodeFunctionResult,
  pad,
  slice,
  zeroAddress,
  zeroHash
} from 'viem'

import { PROXY_AMBIRE_ACCOUNT } from '@ambire-common/consts/deploy'
import { revertedCall } from '@web/modules/social-recovery/shared/client/provider-adapter'

import type { CommittedFields, ProviderCall, ScriptedProvider, ScriptedState } from './types'

export const ACCOUNT: Address = '0x1111111111111111111111111111111111111111'
export const MANAGER: Address = '0xa1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1'
export const METHOD_ECDSA: Address = '0xa2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2'
export const METHOD_PASSKEY: Address = '0xa3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3'
export const METHOD_AADHAAR: Address = '0xa4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4'
export const METHOD_ZKPASSPORT: Address = '0xa5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5'
export const ACTION: Address = '0xa6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6'
export const OTHER_ACTION: Address = '0xa7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7'
export const KEY_A: Address = '0xb1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1'
export const KEY_B: Address = '0xb2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2'
export const ACCOUNT_CODE: Hex = '0x6080604052'
export const CONTRACT_CODE: Hex = '0x60806040'

export const DEPLOYED_AT = 1_000_000
export const HEAD = 1_000_400
export const HEAD_TIMESTAMP = 1_800_000_000

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

const topicMatches = (expected: FilterTopic | undefined, actual: Hex | undefined): boolean => {
  if (expected === null || expected === undefined) {
    return true
  }
  const wanted = (typeof expected === 'string' ? [expected] : expected).map((t) => t.toLowerCase())
  return actual !== undefined && wanted.includes(actual.toLowerCase())
}

export const scriptedProvider = (): ScriptedProvider => {
  const routes = new Map<string, Hex | Error | ((data: Hex) => Hex | Error)>()
  const handlers = new Map<string, (data: Hex) => Hex | Error>()
  const codes = new Map<string, { code: Hex; from: number }>()
  const logs: RawLog[] = []
  const senders = new Map<string, Address | Error>()
  const calls: ProviderCall[] = []
  const head = { number: HEAD, timestamp: HEAD_TIMESTAMP, hash: pad(`0x${HEAD.toString(16)}`) }
  const keyOf = (to: Address, data: Hex) => `${to.toLowerCase()}:${data.toLowerCase()}`
  const provider = {
    chainId: jest.fn(async () => DESCRIPTOR.chainId),
    call: jest.fn(async (to: Address, data: Hex, _from: Address, block: BlockTag) => {
      calls.push({ to, data, block })
      if (!codes.has(to.toLowerCase())) {
        return '0x'
      }
      const route = routes.get(keyOf(to, data))
      const answer =
        typeof route === 'function'
          ? route(data)
          : route ?? handlers.get(keyOf(to, slice(data, 0, 4)))?.(data)
      if (answer === undefined) {
        throw new Error(`The scripted provider has no answer for ${data} to ${to}.`)
      }
      if (answer instanceof Error) {
        throw answer
      }
      return answer
    }),
    logs: jest.fn(async (filter: FilterSpec, range: BlockRange) =>
      logs.filter(
        (log) =>
          filter.address.some((address) => address.toLowerCase() === log.address.toLowerCase()) &&
          filter.topics.every((topic, index) => topicMatches(topic, log.topics[index])) &&
          log.blockNumber >= range.from &&
          log.blockNumber <= range.to
      )
    ),
    block: jest.fn(async () => head),
    code: jest.fn(async (address: Address, block: BlockTag): Promise<Hex> => {
      const held = codes.get(address.toLowerCase())
      return held && (typeof block !== 'number' || block >= held.from) ? held.code : '0x'
    }),
    transaction: jest.fn(async (hash: Hex): Promise<RawTransaction | undefined> => {
      const sender = senders.get(hash.toLowerCase())
      if (sender instanceof Error) {
        throw sender
      }
      if (sender === undefined) {
        return undefined
      }
      return {
        hash,
        from: sender,
        to: MANAGER,
        input: '0x',
        blockNumber: head.number,
        blockHash: head.hash
      }
    })
  }
  return {
    provider,
    head,
    answer: (to, data, answer) => {
      routes.set(keyOf(to, data), answer)
    },
    answerWith: (to, selector, answer) => {
      handlers.set(keyOf(to, selector), answer)
    },
    setCode: (address, code, from = 0) => {
      codes.set(address.toLowerCase(), { code, from })
    },
    addLog: (log) => {
      logs.push(log)
    },
    setSender: (hash, sender) => {
      senders.set(hash.toLowerCase(), sender)
    },
    calls
  }
}

/** A revert as the provider adapter throws it, with its raw data. */
export const reverting = (data: Hex = '0x'): Error => revertedCall('call', data)

/** Settles a promise into the value it threw; fails where it resolved. */
export const thrownBy = async (run: Promise<unknown>): Promise<unknown> => {
  try {
    await run
  } catch (thrown: unknown) {
    return thrown
  }
  throw new Error('Expected a rejection, the promise resolved.')
}

// ---------------------------------------------------------------------------
// The manager
// ---------------------------------------------------------------------------

export const stateOfCall = (action: Address = ACTION): Hex =>
  encodeFunctionData({
    abi: POLICY_MANAGER_STATE_OF_ABI,
    functionName: 'stateOf',
    args: [ACCOUNT, action]
  })

export const stateAnswer = (state: ScriptedState): Hex =>
  encodeFunctionResult({
    abi: POLICY_MANAGER_STATE_OF_ABI,
    functionName: 'stateOf',
    result: {
      setupCommitment: state.setupCommitment,
      setupNonce: state.setupNonce,
      nextAttemptId: state.nextAttemptId ?? 1n,
      setupCommittedAtBlock: state.setupCommittedAtBlock,
      attempt: {
        attemptId: state.attemptId ?? 0n,
        setupNonce: state.attemptId === undefined ? 0n : state.setupNonce,
        consumableAfter: state.consumableAfter ?? 0,
        state: state.attemptState ?? ATTEMPT_STATES.indexOf('None'),
        ignoresPause: false,
        payloadHash: zeroHash,
        order: { token: zeroAddress, amount: 0n, payee: zeroAddress },
        usedMethods: []
      }
    }
  })

export const scriptState = (node: ScriptedProvider, state: ScriptedState): void =>
  node.answer(MANAGER, stateOfCall(), stateAnswer(state))

// ---------------------------------------------------------------------------
// The manager's logs
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

const managerTopics = (
  eventName: 'SetupCommitted' | 'AttemptStarted' | 'AttemptConsumed',
  action: Address
): Hex[] =>
  encodeEventTopics({
    abi: MANAGER_EVENTS_ABI,
    eventName,
    args: { account: ACCOUNT, action }
  }) as Hex[]

const [, , ATTEMPT_STARTED] = MANAGER_EVENTS_ABI

export const committedLog = (fields: CommittedFields, blockNumber: number): RawLog =>
  logAt(
    managerTopics('SetupCommitted', fields.action ?? ACTION),
    encodeAbiParameters(
      [{ type: 'uint64' }, { type: 'bytes32' }, { type: 'bytes' }, { type: 'bytes' }],
      [
        fields.nonce,
        fields.setupCommitment,
        fields.publicMetadata ?? '0x',
        fields.privateMetadata ?? '0x'
      ]
    ),
    blockNumber
  )

/** An attempt's start at `action` carrying `payload`, every other field fixed. */
export const attemptStartedLog = (
  attemptId: bigint,
  payload: Hex,
  blockNumber: number,
  action: Address = ACTION
): RawLog =>
  logAt(
    managerTopics('AttemptStarted', action),
    encodeAbiParameters(
      ATTEMPT_STARTED.inputs.filter((input) => !input.indexed),
      [
        attemptId,
        1n,
        '0x',
        [0n],
        [METHOD_ECDSA],
        payload,
        { token: zeroAddress, amount: 0n, payee: zeroAddress },
        0
      ]
    ),
    blockNumber
  )

export const attemptConsumedLog = (
  attemptId: bigint,
  blockNumber: number,
  action: Address = ACTION
): RawLog =>
  logAt(
    managerTopics('AttemptConsumed', action),
    encodeAbiParameters([{ type: 'uint64' }], [attemptId]),
    blockNumber
  )
