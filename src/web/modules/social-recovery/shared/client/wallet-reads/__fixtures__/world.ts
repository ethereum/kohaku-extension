/**
 * A deployed or undeployed account on a scripted provider, with the wallet's
 * reads of it built over the SDK's own manager, action, event manager and
 * codec. The account's privilege writes and views are encoded with the
 * account ABIs the client carries.
 */
import {
  ACCOUNT_EVENTS_ABI,
  AmbireActionCodec,
  AmbireRecoveryAction,
  EventManager,
  PolicyManager,
  RECOVERY_ACTION_VIEWS_ABI
} from '@kohaku-eth/social-recovery'
import type { Address, BlockRange, BlockTag, FilterSpec } from '@kohaku-eth/social-recovery'
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionResult,
  getAddress,
  type Hex,
  pad,
  toFunctionSelector,
  zeroHash
} from 'viem'

import { ERC_4337_ENTRYPOINT } from '@ambire-common/consts/deploy'
import {
  ACCOUNT,
  ACCOUNT_CODE,
  ACTION,
  committedLog,
  CONTRACT_CODE,
  DEPLOYED_AT,
  DESCRIPTOR,
  HEAD,
  scriptedProvider
} from '@web/modules/social-recovery/shared/client/__fixtures__/scripted-provider'
import {
  ACCOUNT_PRIVILEGES_ABI,
  ACTION_IMMUTABLES_ABI
} from '@web/modules/social-recovery/shared/client/abi'
import { createActionViews } from '@web/modules/social-recovery/shared/client/deployment-checks'
import { LOG_CHUNK_BLOCKS } from '@web/modules/social-recovery/shared/client/events'
import { createWalletReads } from '@web/modules/social-recovery/shared/client/wallet-reads'

import type { AccountWorldOptions } from './types'

export const KEY_C: Address = '0xc3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3'
export const CONTROLLER: Address = '0xc4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4'
export const NEW_KEY: Address = '0xc5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5'
export const RELAYER: Address = '0xc6c6c6c6c6c6c6c6c6c6c6c6c6c6c6c6c6c6c6c6'
export const STRANGER: Address = '0xc7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7'
export const ACTION_HOLDER: Address = '0x6666666666666666666666666666666666666666'
export const ENTRY_POINT = getAddress(ERC_4337_ENTRYPOINT)
export const HOLDS: Hex = pad('0x01')
export const CREATION = { factoryAddr: ACTION_HOLDER, bytecode: '0x60', salt: zeroHash }
const COMMITMENT: Hex = `0x${'5a'.repeat(32)}`

export const [PRIVILEGE_TOPIC] = encodeEventTopics({
  abi: ACCOUNT_EVENTS_ABI,
  eventName: 'LogPrivilegeChanged'
})

export const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
const lower = (key: string) => key.toLowerCase()
/** A named key, whatever the case its source spelled it in. */
export const named = (key: Address) => ({
  kind: 'named',
  key: expect.stringMatching(new RegExp(`^${key}$`, 'i'))
})
const listed = (keys: readonly Address[], key: Address) => keys.some((held) => same(held, key))

let logIndex = 0
export const privilegeLog = (addr: Address, priv: Hex, blockNumber: number, removed = false) => {
  logIndex += 1
  return {
    address: ACCOUNT,
    topics: encodeEventTopics({
      abi: ACCOUNT_EVENTS_ABI,
      eventName: 'LogPrivilegeChanged',
      args: { addr }
    }) as Hex[],
    data: encodeAbiParameters([{ type: 'bytes32' }], [priv]),
    blockNumber,
    blockHash: pad(`0x${blockNumber.toString(16)}`),
    logIndex,
    transactionHash: pad(`0x${(blockNumber * 10 + logIndex).toString(16)}`),
    removed
  }
}

export const commitAt = (blockNumber: number, action: Address = ACTION) =>
  committedLog({ action, nonce: 1n, setupCommitment: COMMITMENT }, blockNumber)

/** The action's payload of a handover to `newAuthority`. */
export const handoverTo = (newAuthority: Address): Hex =>
  new AmbireActionCodec([ACTION]).encode({
    newAuthority,
    removedAuthority: '0x0000000000000000000000000000000000000bad'
  })

/** The ranges a scan from `from` to the pinned head reads, in the wallet's chunks. */
export const chunksFrom = (from: number) => {
  const chunks: BlockRange[] = []
  for (let start = from; start <= HEAD; start += LOG_CHUNK_BLOCKS) {
    chunks.push({ from: start, to: Math.min(start + LOG_CHUNK_BLOCKS - 1, HEAD) })
  }
  return chunks
}

export const worldOf = ({
  addr = ACCOUNT,
  code = ACCOUNT_CODE,
  deployedAt = DEPLOYED_AT,
  createdAt = deployedAt,
  logs = [],
  senders = [],
  holders = [],
  authorities = [],
  associatedKeys = [],
  initialPrivileges = [],
  creation = null,
  knownKeys,
  blockTags = { read: 'latest', watch: 'latest' },
  accountImplementation,
  supportsAccount = true
}: AccountWorldOptions = {}) => {
  const node = scriptedProvider()
  node.setCode(ACCOUNT, code, createdAt)
  node.setCode(ACTION, CONTRACT_CODE)
  logs.forEach((log) => node.addLog(log))
  senders.forEach(([hash, sender]) =>
    node.setSender(hash, sender instanceof Error ? sender : getAddress(sender))
  )
  node.answerWith(ACCOUNT, toFunctionSelector('privileges(address)'), (data) => {
    const {
      args: [key]
    } = decodeFunctionData({ abi: ACCOUNT_PRIVILEGES_ABI, data })
    return listed(holders, key) ? HOLDS : zeroHash
  })
  node.answerWith(ACTION, toFunctionSelector('isAuthority(address,address)'), (data) => {
    const decoded = decodeFunctionData({ abi: RECOVERY_ACTION_VIEWS_ABI, data })
    return encodeFunctionResult({
      abi: RECOVERY_ACTION_VIEWS_ABI,
      functionName: 'isAuthority',
      result: decoded.functionName === 'isAuthority' && listed(authorities, decoded.args[1])
    })
  })
  node.answerWith(ACTION, toFunctionSelector('supportsAccount(address)'), () =>
    encodeFunctionResult({
      abi: RECOVERY_ACTION_VIEWS_ABI,
      functionName: 'supportsAccount',
      result: supportsAccount
    })
  )
  node.answerWith(ACTION, toFunctionSelector('AMBIRE_IMPLEMENTATION()'), () =>
    encodeFunctionResult({
      abi: ACTION_IMMUTABLES_ABI,
      functionName: 'AMBIRE_IMPLEMENTATION',
      result: DESCRIPTOR.servedImplementation
    })
  )
  const descriptor = { ...DESCRIPTOR, deployedAt }
  const codec = new AmbireActionCodec([ACTION])
  const { provider } = node
  const reads = createWalletReads({
    account: { addr, associatedKeys, initialPrivileges, creation },
    knownKeys,
    accountImplementation,
    provider,
    descriptor,
    blockTags,
    logChunkSize: LOG_CHUNK_BLOCKS,
    policyManager: new PolicyManager(provider, descriptor, ACCOUNT, ACTION, blockTags),
    action: new AmbireRecoveryAction(provider, descriptor, ACCOUNT, ACTION, codec, blockTags),
    actionViews: createActionViews(provider, ACTION),
    events: new EventManager(provider, descriptor, ACCOUNT, ACTION, new Map(), {
      logChunkSize: LOG_CHUNK_BLOCKS
    }),
    codec
  })
  const askedPrivileges = () =>
    node.calls
      .filter(({ to }) => same(to, ACCOUNT))
      .map(({ data }) => lower(decodeFunctionData({ abi: ACCOUNT_PRIVILEGES_ABI, data }).args[0]))
  const askedAuthority = () =>
    node.calls
      .filter(({ to }) => same(to, ACTION))
      .flatMap(({ data, block }): [string, BlockTag][] => {
        const decoded = decodeFunctionData({ abi: RECOVERY_ACTION_VIEWS_ABI, data })
        return decoded.functionName === 'isAuthority' ? [[lower(decoded.args[1]), block]] : []
      })
  /** The action's views asked, by name and arguments, in order. */
  const askedAction = () =>
    node.calls
      .filter(({ to }) => same(to, ACTION))
      .map(({ data }) => {
        const decoded = decodeFunctionData({
          abi: [...RECOVERY_ACTION_VIEWS_ABI, ...ACTION_IMMUTABLES_ABI],
          data
        })
        return [decoded.functionName, ...(decoded.args ?? [])]
      })
  const scans = () =>
    (node.provider.logs.mock.calls as [FilterSpec, BlockRange][]).map(([filter, range]) => ({
      filter,
      range
    }))
  const scansOf = (address: Address) =>
    scans()
      .filter(({ filter }) => same(filter.address[0], address))
      .map(({ range }) => range)
  return { node, reads, askedPrivileges, askedAuthority, askedAction, scans, scansOf }
}
