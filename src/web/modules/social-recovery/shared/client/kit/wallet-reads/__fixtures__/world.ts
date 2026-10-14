/**
 * A deployed or undeployed account on a fake node, with the wallet's reads of
 * it built over the kit's own reads. The logs and the view answers are
 * encoded here from hand-written signatures.
 */
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionResult,
  getAddress,
  type Hex,
  pad,
  parseAbi,
  toFunctionSelector,
  zeroHash
} from 'viem'

import { ERC_4337_ENTRYPOINT } from '@ambire-common/consts/deploy'
import type { Address, BlockRange, FilterSpec } from '@web/modules/social-recovery/sdk-interfaces'
import { createKitEventManager } from '@web/modules/social-recovery/shared/client/kit/events'
import {
  createActionReads,
  createMethodReads
} from '@web/modules/social-recovery/shared/client/kit/reads'
import {
  ACCOUNT,
  ACCOUNT_CODE,
  ACTION,
  committedLog,
  CONTRACT_CODE,
  DEPLOYED_AT,
  DESCRIPTOR,
  fakeNode,
  HEAD
} from '@web/modules/social-recovery/shared/client/kit/setup-client/__tests__/harness'
import { createKitWalletReads } from '@web/modules/social-recovery/shared/client/kit/wallet-reads'
import type { AccountWorldOptions } from '@web/modules/social-recovery/shared/client/kit/wallet-reads/__fixtures__/types'

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

const PRIVILEGE_EVENT = parseAbi(['event LogPrivilegeChanged(address indexed addr, bytes32 priv)'])
const PRIVILEGES_VIEW = parseAbi(['function privileges(address) view returns (bytes32)'])
const IS_AUTHORITY = parseAbi([
  'function isAuthority(address account, address key) view returns (bool)'
])
export const [PRIVILEGE_TOPIC] = encodeEventTopics({
  abi: PRIVILEGE_EVENT,
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
      abi: PRIVILEGE_EVENT,
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
  encodeAbiParameters(
    [{ type: 'address' }, { type: 'address' }],
    [newAuthority, '0x0000000000000000000000000000000000000bad']
  )

/** The ranges a scan from `from` to the pinned head reads, in chunks of ten thousand blocks. */
export const chunksFrom = (from: number) => {
  const chunks: BlockRange[] = []
  for (let start = from; start <= HEAD; start += 10_000) {
    chunks.push({ from: start, to: Math.min(start + 9_999, HEAD) })
  }
  return chunks
}

export const worldOf = ({
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
  blockTags
}: AccountWorldOptions = {}) => {
  const node = fakeNode()
  node.setCode(ACCOUNT, code, createdAt)
  node.setCode(ACTION, CONTRACT_CODE)
  logs.forEach((log) => node.addLog(log))
  senders.forEach(([hash, sender]) =>
    node.setSender(hash, sender instanceof Error ? sender : getAddress(sender))
  )
  node.answerWith(ACCOUNT, toFunctionSelector('privileges(address)'), (data) => {
    const {
      args: [key]
    } = decodeFunctionData({ abi: PRIVILEGES_VIEW, data })
    return listed(holders, key) ? HOLDS : zeroHash
  })
  node.answerWith(ACTION, toFunctionSelector('isAuthority(address,address)'), (data) => {
    const {
      args: [, key]
    } = decodeFunctionData({ abi: IS_AUTHORITY, data })
    return encodeFunctionResult({
      abi: IS_AUTHORITY,
      functionName: 'isAuthority',
      result: listed(authorities, key)
    })
  })
  const descriptor = { ...DESCRIPTOR, deployedAt }
  const reads = createKitWalletReads({
    account: { addr: ACCOUNT, associatedKeys, initialPrivileges, creation },
    knownKeys,
    action: createActionReads({ provider: node.provider, codeRead: node.codeRead }, ACTION),
    moduleReads: createMethodReads(node.provider),
    codeRead: node.codeRead,
    provider: node.provider,
    blockTags,
    descriptor,
    events: createKitEventManager({ provider: node.provider, descriptor, account: ACCOUNT }),
    transactionRead: node.transactionRead
  })
  const askedPrivileges = () =>
    node.calls
      .filter(({ to }) => same(to, ACCOUNT))
      .map(({ data }) => lower(decodeFunctionData({ abi: PRIVILEGES_VIEW, data }).args[0]))
  const askedAuthority = () =>
    node.calls
      .filter(({ to }) => same(to, ACTION))
      .map(({ data, block }) => [
        lower(decodeFunctionData({ abi: IS_AUTHORITY, data }).args[1]),
        block
      ])
  const scans = () =>
    (node.provider.logs.mock.calls as [FilterSpec, BlockRange][]).map(([filter, range]) => ({
      filter,
      range
    }))
  const scansOf = (address: Address) =>
    scans()
      .filter(({ filter }) => same(filter.addresses[0], address))
      .map(({ range }) => range)
  return { node, reads, askedPrivileges, askedAuthority, scans, scansOf }
}
