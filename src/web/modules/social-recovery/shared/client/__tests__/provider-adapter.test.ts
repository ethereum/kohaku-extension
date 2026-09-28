/**
 * The provider adapter answers `IProvider`'s four reads, each routed once
 * through the extension's own provider with the arguments the SDK fixes. A read
 * the adapter could not make reaches the SDK as a failure, never as an empty
 * answer, and a reverted call rejects with the raw revert data. The balance and
 * gas reads run on the same provider beside the adapter, since the SDK's
 * provider answers four reads and no balance.
 *
 * The SDK fixes the arguments, not the ethers member, so the first checks of
 * each read accept the high-level ethers member or the raw JSON-RPC `send`. The
 * checks after them pin the member each read takes on the ethers provider, and
 * what the ethers provider the extension builds then sends the node.
 */
import { AbiCoder, makeError } from 'ethers'

import type { Network } from '@ambire-common/interfaces/network'

import { ScriptedChain } from '@web/modules/social-recovery/sdk-doubles'
import type {
  Address,
  BlockTag,
  FilterSpec,
  Hex,
  IProvider,
  PreparedCall
} from '@web/modules/social-recovery/sdk-interfaces'

import {
  adapterOver,
  callException,
  createChainReads,
  createProviderAdapter,
  ethersOver,
  EthersMock,
  ExtensionProvider,
  extensionProviderFor,
  failEverything,
  functionMembersOf,
  gasCallOf,
  isProviderReadFailure,
  isRevertedCall,
  NODE_ANSWERS,
  nodeRevert,
  ProviderRead,
  SEPOLIA,
  thrownBy,
  underlyingCalls
} from './harness'

const TO = '0x1111111111111111111111111111111111111111' as Address
const FROM = '0x2222222222222222222222222222222222222222' as Address
const DATA = '0xdeadbeef00000000000000000000000000000000000000000000000000000001' as Hex
const TOPIC = `0x${'ab'.repeat(32)}` as Hex
const REVERT = `0x08c379a0${'00'.repeat(31)}20` as Hex

const hexOf = (n: number): string => `0x${n.toString(16)}`

/** A block tag as ethers or JSON-RPC would carry it: the name, the number, or its hex. */
const sameTag = (seen: unknown, tag: BlockTag): boolean =>
  seen === tag ||
  (typeof tag === 'number' &&
    (seen === BigInt(tag) ||
      (typeof seen === 'string' && seen.startsWith('0x') && Number(seen) === tag)))

const sameNumber = (seen: unknown, n: number): boolean =>
  seen === n || seen === BigInt(n) || (typeof seen === 'string' && Number(seen) === n)

const lower = (a: unknown) => (typeof a === 'string' ? a.toLowerCase() : a)

interface World {
  chain: ScriptedChain
  ethers: EthersMock
  adapter: IProvider
}

const world = (): World => {
  const chain = new ScriptedChain()
  const ethers = ethersOver(chain)
  return { chain, ethers, adapter: adapterOver(ethers) }
}

const onlyCall = (ethers: EthersMock): [string, unknown[]] => {
  const calls = underlyingCalls(ethers)
  expect(calls).toHaveLength(1)
  return calls[0]
}

/** The CALL_EXCEPTION ethers' JSON-RPC provider builds from a node's revert. */
const ethersRevert = (action: 'call' | 'estimateGas', data: Hex) =>
  AbiCoder.getBuiltinCallException(action, { to: TO, data: DATA }, data)

/** The error Colibri's EIP-1193 `request` throws: an `Error` carrying the node's code and data. */
const colibriError = (code: number, message: string, data?: Hex) =>
  Object.assign(new Error(message), { name: 'ProviderRpcError', code, data })

const readOf = (caught: unknown) => (caught as { read?: unknown }).read

describe('the provider adapter, IProvider over the extension provider', () => {
  it('answers the four reads and nothing else', () => {
    expect(functionMembersOf(world().adapter).sort()).toEqual(['block', 'call', 'chainId', 'logs'])
  })

  describe('chainId()', () => {
    it('reads the chain id once and answers it as a number', async () => {
      const w = world()
      await expect(w.adapter.chainId()).resolves.toBe(w.chain.descriptor.chainId)
      const [member, args] = onlyCall(w.ethers)
      if (member === 'send') expect(args).toEqual(['eth_chainId', []])
      else expect(member).toBe('getNetwork')
    })

    it('surfaces a provider failure as a thrown value', async () => {
      const w = world()
      failEverything(w.ethers, new Error('the node did not answer'))
      const caught = await thrownBy(w.adapter.chainId())
      expect(isProviderReadFailure(caught)).toBe(true)
      expect((caught as { read?: string }).read).toBe('chainId')
    })
  })

  describe('call(to, data, from, block)', () => {
    const CALL_CASES: [string, Address | undefined, BlockTag][] = [
      ['a from address at latest', FROM, 'latest'],
      ['no from address at finalized', undefined, 'finalized'],
      ['a from address at a block number', FROM, 1234]
    ]
    CALL_CASES.forEach(([title, from, tag]) =>
      it(`runs one eth_call with the target, the calldata, ${title}`, async () => {
        const w = world()
        w.chain.calls.set(`${TO.toLowerCase()}:${DATA.toLowerCase()}`, { result: '0xcafe' })
        await expect(w.adapter.call(TO, DATA, from, tag)).resolves.toBe('0xcafe')
        const [member, args] = onlyCall(w.ethers)
        let tx: Record<string, unknown>
        let seenTag: unknown
        if (member === 'send') {
          expect(args[0]).toBe('eth_call')
          const params = args[1] as unknown[]
          expect(params).toHaveLength(2)
          tx = params[0] as Record<string, unknown>
          seenTag = params[1]
        } else {
          expect(member).toBe('call')
          tx = args[0] as Record<string, unknown>
          seenTag = tx.blockTag
        }
        expect(lower(tx.to)).toBe(TO.toLowerCase())
        expect(lower(tx.data)).toBe(DATA.toLowerCase())
        if (from) expect(lower(tx.from)).toBe(from.toLowerCase())
        else expect(tx.from).toBeUndefined()
        expect(sameTag(seenTag, tag)).toBe(true)
      })
    )

    const REVERT_CASES: [string, unknown][] = [
      ['an ethers CALL_EXCEPTION', callException(REVERT)],
      ["the node's own JSON-RPC revert", nodeRevert(REVERT)]
    ]
    REVERT_CASES.forEach(([title, thrown]) =>
      it(`rejects a reverted call with the raw revert data, from ${title}`, async () => {
        const w = world()
        failEverything(w.ethers, thrown)
        const caught = await thrownBy(w.adapter.call(TO, DATA, FROM, 'latest'))
        expect(isRevertedCall(caught)).toBe(true)
        expect((caught as { data?: unknown }).data).toBe(REVERT)
      })
    )

    it('surfaces a transport failure as a thrown value, never an empty answer nor a revert', async () => {
      const w = world()
      failEverything(w.ethers, new Error('the node did not answer'))
      const caught = await thrownBy(w.adapter.call(TO, DATA, FROM, 'latest'))
      expect(isProviderReadFailure(caught)).toBe(true)
      expect(isRevertedCall(caught)).toBe(false)
    })
  })

  describe('logs(filterSpec, range)', () => {
    const filter: FilterSpec = { addresses: [TO], topics: [TOPIC, null] }

    it('runs one eth_getLogs over the addresses, the topics and the two blocks of the range', async () => {
      const w = world()
      await w.adapter.logs(filter, { from: 900, to: 1900 })
      const [member, args] = onlyCall(w.ethers)
      let spec: Record<string, unknown>
      if (member === 'send') {
        expect(args[0]).toBe('eth_getLogs')
        spec = (args[1] as unknown[])[0] as Record<string, unknown>
      } else {
        expect(member).toBe('getLogs')
        spec = args[0] as Record<string, unknown>
      }
      const addresses = ([] as unknown[]).concat(spec.address).map(lower)
      expect(addresses).toEqual([TO.toLowerCase()])
      expect(spec.topics).toEqual([TOPIC, null])
      expect(sameNumber(spec.fromBlock, 900)).toBe(true)
      expect(sameNumber(spec.toBlock, 1900)).toBe(true)
    })

    it('answers raw logs with numeric block numbers and log indexes', async () => {
      const w = world()
      const log = {
        address: TO,
        topics: [TOPIC],
        data: '0x01',
        blockNumber: hexOf(950),
        blockHash: `0x${'cd'.repeat(32)}`,
        logIndex: hexOf(3),
        transactionHash: `0x${'ef'.repeat(32)}`,
        removed: false
      }
      w.ethers.getLogs.mockResolvedValue([{ ...log, blockNumber: 950, index: 3 }])
      w.ethers.send.mockImplementation(async (method: string) => {
        if (method !== 'eth_getLogs') throw new Error(method)
        return [log]
      })
      const logs = await w.adapter.logs(filter, { from: 900, to: 1900 })
      expect(logs).toHaveLength(1)
      expect(logs[0]).toMatchObject({
        topics: [TOPIC],
        data: '0x01',
        blockNumber: 950,
        blockHash: log.blockHash,
        logIndex: 3,
        transactionHash: log.transactionHash
      })
      expect(lower(logs[0].address)).toBe(TO.toLowerCase())
    })

    it('surfaces a provider failure as a thrown value, never an empty list', async () => {
      const w = world()
      failEverything(w.ethers, new Error('the node did not answer'))
      const caught = await thrownBy(w.adapter.logs(filter, { from: 900, to: 1900 }))
      expect(isProviderReadFailure(caught)).toBe(true)
    })
  })

  describe('block(tag)', () => {
    const BLOCK_TAGS: BlockTag[] = ['latest', 'finalized', 950]
    BLOCK_TAGS.forEach((tag) =>
      it(`reads one block for ${tag} and answers its number, timestamp and hash`, async () => {
        const w = world()
        const expected = w.chain.blockAt(tag)
        const header = await w.adapter.block(tag)
        expect(header).toEqual({
          number: expected.number,
          timestamp: expected.timestamp,
          hash: expected.hash
        })
        const [member, args] = onlyCall(w.ethers)
        if (member === 'send') {
          expect(args[0]).toBe('eth_getBlockByNumber')
          expect(sameTag((args[1] as unknown[])[0], tag)).toBe(true)
        } else {
          expect(member).toBe('getBlock')
          expect(sameTag(args[0], tag)).toBe(true)
        }
      })
    )

    it('surfaces a provider failure as a thrown value', async () => {
      const w = world()
      failEverything(w.ethers, new Error('the node did not answer'))
      const caught = await thrownBy(w.adapter.block('latest'))
      expect(isProviderReadFailure(caught)).toBe(true)
    })

    it('surfaces a block the node does not know as a thrown value, never an empty answer', async () => {
      const w = world()
      w.ethers.getBlock.mockResolvedValue(null)
      w.ethers.send.mockResolvedValue(null)
      const caught = await thrownBy(w.adapter.block(123456789))
      expect(isProviderReadFailure(caught)).toBe(true)
    })
  })
})

describe('the balance and gas reads beside the adapter', () => {
  it('reads a native balance and a gas estimate on the same extension provider', async () => {
    const w = world()
    const reads = createChainReads(w.ethers)
    await expect(reads.nativeBalance(FROM)).resolves.toBe(NODE_ANSWERS.balance)
    await expect(reads.estimateGas({ from: FROM, to: TO, data: DATA })).resolves.toBe(
      NODE_ANSWERS.gas
    )
    const methods = underlyingCalls(w.ethers).map(([member, args]) =>
      member === 'send' ? args[0] : member
    )
    expect(methods).toEqual(['getBalance', 'estimateGas'])
  })

  it('surfaces a balance read the provider could not make as a thrown value', async () => {
    const w = world()
    failEverything(w.ethers, new Error('the node did not answer'))
    const caught = await thrownBy(createChainReads(w.ethers).nativeBalance(FROM))
    expect(isProviderReadFailure(caught)).toBe(true)
  })

  it('reads the gas price with one eth_gasPrice and answers it in wei', async () => {
    const w = world()
    await expect(createChainReads(w.ethers).gasPrice()).resolves.toBe(NODE_ANSWERS.gasPrice)
    expect(underlyingCalls(w.ethers)).toEqual([['send', ['eth_gasPrice', []]]])
  })

  it('estimates the gas of the transaction it was given, the sender included', async () => {
    const w = world()
    await createChainReads(w.ethers).estimateGas({ from: FROM, to: TO, data: DATA, value: 5n })
    const [member, args] = onlyCall(w.ethers)
    expect(member).toBe('estimateGas')
    expect(args[0]).toMatchObject({ from: FROM, to: TO, data: DATA })
    expect(sameNumber((args[0] as { value: unknown }).value, 5)).toBe(true)
  })

  it('rejects the estimate of a call that would revert with its raw revert data', async () => {
    const w = world()
    failEverything(w.ethers, callException(REVERT))
    const caught = await thrownBy(
      createChainReads(w.ethers).estimateGas({ from: FROM, to: TO, data: DATA })
    )
    expect(isRevertedCall(caught)).toBe(true)
    expect((caught as { data?: unknown; read?: unknown }).data).toBe(REVERT)
    expect((caught as { read?: unknown }).read).toBe('estimateGas')
  })

  it('surfaces an estimate the provider could not make as a read failure, not a revert', async () => {
    const w = world()
    failEverything(w.ethers, new Error('the node did not answer'))
    const caught = await thrownBy(
      createChainReads(w.ethers).estimateGas({ from: FROM, to: TO, data: DATA })
    )
    expect(isProviderReadFailure(caught)).toBe(true)
    expect(isRevertedCall(caught)).toBe(false)
  })
})

describe('the four reads on the typed members of the ethers provider', () => {
  describe('chainId()', () => {
    it("asks the node with one eth_chainId request, never the provider's network record", async () => {
      const w = world()
      await w.adapter.chainId()
      expect(underlyingCalls(w.ethers)).toEqual([['send', ['eth_chainId', []]]])
    })

    const ANSWERS: [string, number][] = [
      ['0x1', 1],
      ['0xaa36a7', SEPOLIA]
    ]
    ANSWERS.forEach(([answer, chainId]) =>
      it(`reads the node's quantity ${answer} as chain ${chainId}`, async () => {
        const w = world()
        w.ethers.send.mockResolvedValue(answer)
        await expect(w.adapter.chainId()).resolves.toBe(chainId)
      })
    )

    const NOT_CHAIN_IDS: [string, unknown][] = [
      ['the empty quantity 0x', '0x'],
      ['a name', 'sepolia'],
      ['a number, not a quantity', SEPOLIA],
      ['a chain id beyond 2^53', `0x${(2n ** 53n).toString(16)}`]
    ]
    NOT_CHAIN_IDS.forEach(([title, answer]) =>
      it(`surfaces ${title} as a failed chainId read, never a chain id`, async () => {
        const w = world()
        w.ethers.send.mockResolvedValue(answer)
        const caught = await thrownBy(w.adapter.chainId())
        expect(isProviderReadFailure(caught)).toBe(true)
        expect(readOf(caught)).toBe('chainId')
      })
    )
  })

  describe('call(to, data, from, block)', () => {
    it('makes one call carrying the target, the calldata, the sender and the block tag', async () => {
      const w = world()
      w.ethers.call.mockResolvedValue('0xcafe')
      await expect(w.adapter.call(TO, DATA, FROM, 1234)).resolves.toBe('0xcafe')
      expect(underlyingCalls(w.ethers)).toEqual([
        ['call', [{ to: TO, data: DATA, from: FROM, blockTag: 1234 }]]
      ])
    })

    it('names no sender where none is given', async () => {
      const w = world()
      w.ethers.call.mockResolvedValue('0x')
      await w.adapter.call(TO, DATA, undefined, 'finalized')
      const [[, [request]]] = underlyingCalls(w.ethers)
      expect(request).toEqual({ to: TO, data: DATA, blockTag: 'finalized' })
    })

    it('rejects a CALL_EXCEPTION ethers throws from call with the raw revert data', async () => {
      const w = world()
      w.ethers.call.mockRejectedValue(ethersRevert('call', REVERT))
      const caught = await thrownBy(w.adapter.call(TO, DATA, FROM, 'latest'))
      expect(isRevertedCall(caught)).toBe(true)
      expect(caught).toMatchObject({ read: 'call', data: REVERT })
    })

    it('rejects a revert that carried no data with the empty data', async () => {
      const w = world()
      w.ethers.call.mockRejectedValue(ethersRevert('call', '0x'))
      const caught = await thrownBy(w.adapter.call(TO, DATA, FROM, 'latest'))
      expect(isRevertedCall(caught)).toBe(true)
      expect(caught).toMatchObject({ read: 'call', data: '0x' })
    })

    it("rejects the node's own revert error, as Colibri throws it through call, with the raw revert data", async () => {
      const w = world()
      w.ethers.call.mockRejectedValue(colibriError(3, 'execution reverted', REVERT))
      const caught = await thrownBy(w.adapter.call(TO, DATA, FROM, 'latest'))
      expect(isRevertedCall(caught)).toBe(true)
      expect(caught).toMatchObject({ read: 'call', data: REVERT })
    })

    it('surfaces any other error Colibri throws as a failed call read, not a revert', async () => {
      const w = world()
      w.ethers.call.mockRejectedValue(colibriError(-32603, 'Internal error'))
      const caught = await thrownBy(w.adapter.call(TO, DATA, FROM, 'latest'))
      expect(isProviderReadFailure(caught)).toBe(true)
      expect(readOf(caught)).toBe('call')
    })
  })

  describe('logs(filterSpec, range)', () => {
    const filter: FilterSpec = { addresses: [TO], topics: [TOPIC, null] }
    const ethersLog = {
      address: TO,
      topics: Object.freeze([TOPIC]),
      data: '0x01',
      blockNumber: 950,
      blockHash: `0x${'cd'.repeat(32)}`,
      index: 3,
      transactionHash: `0x${'ef'.repeat(32)}`,
      transactionIndex: 0,
      removed: true
    }

    it('makes one getLogs over the addresses, the topics and the two block numbers', async () => {
      const w = world()
      await w.adapter.logs(filter, { from: 900, to: 1900 })
      expect(underlyingCalls(w.ethers)).toEqual([
        ['getLogs', [{ address: [TO], topics: [TOPIC, null], fromBlock: 900, toBlock: 1900 }]]
      ])
    })

    it('answers each ethers log in the SDK log shape, its index as the log index', async () => {
      const w = world()
      w.ethers.getLogs.mockResolvedValue([ethersLog])
      await expect(w.adapter.logs(filter, { from: 900, to: 1900 })).resolves.toEqual([
        {
          address: TO,
          topics: [TOPIC],
          data: '0x01',
          blockNumber: 950,
          blockHash: ethersLog.blockHash,
          logIndex: 3,
          transactionHash: ethersLog.transactionHash,
          removed: true
        }
      ])
    })

    it('surfaces a log whose data is not hex as a failed logs read, never a partial list', async () => {
      const w = world()
      w.ethers.getLogs.mockResolvedValue([ethersLog, { ...ethersLog, data: 'not hex' }])
      const caught = await thrownBy(w.adapter.logs(filter, { from: 900, to: 1900 }))
      expect(isProviderReadFailure(caught)).toBe(true)
      expect(readOf(caught)).toBe('logs')
    })
  })

  describe('block(tag)', () => {
    const ethersBlock = {
      number: 950,
      timestamp: 1_700_000_000,
      hash: `0x${'12'.repeat(32)}`,
      parentHash: `0x${'34'.repeat(32)}`,
      gasLimit: 30_000_000n,
      transactions: []
    }

    const TAGS: BlockTag[] = ['finalized', 950]
    TAGS.forEach((tag) =>
      it(`makes one getBlock at ${tag} and answers the number, the timestamp and the hash alone`, async () => {
        const w = world()
        w.ethers.getBlock.mockResolvedValue(ethersBlock)
        await expect(w.adapter.block(tag)).resolves.toEqual({
          number: 950,
          timestamp: 1_700_000_000,
          hash: ethersBlock.hash
        })
        expect(underlyingCalls(w.ethers)).toEqual([['getBlock', [tag]]])
      })
    )

    const NO_HEADER: [string, unknown][] = [
      ['no block at the tag', null],
      ['a block without a hash, as a pending block is', { ...ethersBlock, hash: null }]
    ]
    NO_HEADER.forEach(([title, answer]) =>
      it(`surfaces ${title} as a failed block read, never an empty header`, async () => {
        const w = world()
        w.ethers.getBlock.mockResolvedValue(answer)
        const caught = await thrownBy(w.adapter.block('latest'))
        expect(isProviderReadFailure(caught)).toBe(true)
        expect(readOf(caught)).toBe('block')
      })
    )
  })
})

describe('the balance and gas reads on the typed members of the ethers provider', () => {
  const TAGS: [string, BlockTag | undefined, BlockTag][] = [
    ['no block, at latest', undefined, 'latest'],
    ['the finalized block', 'finalized', 'finalized'],
    ['a block number', 1234, 1234]
  ]
  TAGS.forEach(([title, given, sent]) =>
    it(`reads a native balance with one getBalance of the address at ${title}`, async () => {
      const w = world()
      w.ethers.getBalance.mockResolvedValue(42n)
      await expect(createChainReads(w.ethers).nativeBalance(FROM, given)).resolves.toBe(42n)
      expect(underlyingCalls(w.ethers)).toEqual([['getBalance', [FROM, sent]]])
    })
  )

  it('estimates with one estimateGas of the sender, the target, the calldata and a zero value as given', async () => {
    const w = world()
    await expect(
      createChainReads(w.ethers).estimateGas({ from: FROM, to: TO, data: DATA, value: 0n })
    ).resolves.toBe(NODE_ANSWERS.gas)
    expect(underlyingCalls(w.ethers)).toEqual([
      ['estimateGas', [{ from: FROM, to: TO, data: DATA, value: 0n }]]
    ])
  })

  it('rejects an estimate ethers refuses with a CALL_EXCEPTION as a reverted call carrying the raw data', async () => {
    const w = world()
    w.ethers.estimateGas.mockRejectedValue(ethersRevert('estimateGas', REVERT))
    const caught = await thrownBy(
      createChainReads(w.ethers).estimateGas({ from: FROM, to: TO, data: DATA })
    )
    expect(isRevertedCall(caught)).toBe(true)
    expect(caught).toMatchObject({ read: 'estimateGas', data: REVERT })
  })

  const OTHER_FAILURES: [string, unknown][] = [
    [
      "ethers' INSUFFICIENT_FUNDS",
      makeError('insufficient funds', 'INSUFFICIENT_FUNDS', {
        transaction: { from: FROM, to: TO, data: DATA }
      })
    ],
    ['a transport error', new Error('socket hang up')]
  ]
  OTHER_FAILURES.forEach(([title, thrown]) =>
    it(`surfaces ${title} from estimateGas as a failed estimateGas read, not a revert`, async () => {
      const w = world()
      w.ethers.estimateGas.mockRejectedValue(thrown)
      const caught = await thrownBy(
        createChainReads(w.ethers).estimateGas({ from: FROM, to: TO, data: DATA })
      )
      expect(isProviderReadFailure(caught)).toBe(true)
      expect(isRevertedCall(caught)).toBe(false)
      expect(readOf(caught)).toBe('estimateGas')
    })
  )

  it('surfaces a balance ethers could not read as a failed nativeBalance read', async () => {
    const w = world()
    w.ethers.getBalance.mockRejectedValue(new Error('the node did not answer'))
    const caught = await thrownBy(createChainReads(w.ethers).nativeBalance(FROM))
    expect(isProviderReadFailure(caught)).toBe(true)
    expect(readOf(caught)).toBe('nativeBalance')
  })

  it('reads a gas price the node answers without a leading zero, as nodes answer quantities', async () => {
    const w = world()
    w.ethers.send.mockResolvedValue(`0x${NODE_ANSWERS.gasPrice.toString(16)}`)
    await expect(createChainReads(w.ethers).gasPrice()).resolves.toBe(NODE_ANSWERS.gasPrice)
  })

  const NOT_PRICES: [string, unknown][] = [
    ['the empty quantity 0x', '0x'],
    ['a text', 'seven gwei'],
    ['a number, not a quantity', 7],
    ['no answer', null]
  ]
  NOT_PRICES.forEach(([title, answer]) =>
    it(`surfaces ${title} as a failed gasPrice read, never a price`, async () => {
      const w = world()
      w.ethers.send.mockResolvedValue(answer)
      const caught = await thrownBy(createChainReads(w.ethers).gasPrice())
      expect(isProviderReadFailure(caught)).toBe(true)
      expect(readOf(caught)).toBe('gasPrice')
    })
  )
})

/** A network record the extension reads over plain JSON-RPC; no request leaves the test. */
const PLAIN_RPC_NETWORK = {
  chainId: BigInt(SEPOLIA),
  name: 'Sepolia',
  rpcUrls: ['http://127.0.0.1:1'],
  selectedRpcUrl: 'http://127.0.0.1:1',
  rpcProvider: 'rpc'
} as Network

/** The batch transport under an ethers JSON-RPC provider's `send`. */
interface JsonRpcTransport {
  _send(payload: unknown): Promise<unknown[]>
}

describe('through the ethers provider the extension builds for a network', () => {
  const built: ExtensionProvider[] = []
  afterEach(() => built.splice(0).forEach((provider) => provider.destroy()))

  const providerOf = (network: Network): ExtensionProvider => {
    const provider = extensionProviderFor(network)
    built.push(provider)
    return provider
  }

  /**
   * The provider with its `send`, the member `ColibriRpcProvider` overrides,
   * answering as the node: ethers' typed reads build each JSON-RPC request, and
   * the node's answer or thrown error comes back through ethers.
   */
  const nodeAnswering = (answers: Record<string, unknown>) => {
    const provider = providerOf(PLAIN_RPC_NETWORK)
    const send = jest.spyOn(provider, 'send').mockImplementation(async (method: string) => {
      if (!(method in answers)) throw new Error(`The node does not answer ${method}.`)
      const answer = answers[method]
      if (answer instanceof Error) throw answer
      return answer
    })
    return { provider, requests: (): [string, unknown][] => send.mock.calls }
  }

  const CHECKSUMMED = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed' as Address
  /** The same address with the case of its first three letters changed, so its checksum is wrong. */
  const BAD_CHECKSUM = '0x5AaEb6053F3E94C9b9A09f33669435E7Ef1BeAed' as Address

  /** One log as a node answers it. */
  const NODE_LOG = {
    address: CHECKSUMMED.toLowerCase(),
    topics: [TOPIC],
    data: '0x01',
    blockNumber: '0x3b6',
    blockHash: `0x${'cd'.repeat(32)}`,
    logIndex: '0x3',
    transactionHash: `0x${'ef'.repeat(32)}`,
    transactionIndex: '0x0',
    removed: false
  }

  /** Block 950 as a node answers it without transactions. */
  const NODE_BLOCK = {
    hash: `0x${'12'.repeat(32)}`,
    parentHash: `0x${'34'.repeat(32)}`,
    number: '0x3b6',
    timestamp: '0x6553f100',
    nonce: '0x0000000000000000',
    difficulty: '0x0',
    gasLimit: '0x1c9c380',
    gasUsed: '0x0',
    miner: `0x${'00'.repeat(20)}`,
    extraData: '0x',
    baseFeePerGas: '0x7',
    transactions: []
  }

  /** The requests the node received, their parameters in lower case, as JSON-RPC compares them. */
  const lowerCased = (requests: [string, unknown][]): [string, unknown][] =>
    requests.map(([method, params]) => [
      method,
      JSON.parse(JSON.stringify(params), (_key, v) => (typeof v === 'string' ? v.toLowerCase() : v))
    ])

  it("reads the node's own chain id, not the provider's network record", async () => {
    const node = nodeAnswering({ eth_chainId: '0x1' })
    await expect(createProviderAdapter(node.provider).chainId()).resolves.toBe(1)
    expect(node.requests()).toEqual([['eth_chainId', []]])
  })

  it('sends one eth_getBalance of the address at the block number as a quantity', async () => {
    const node = nodeAnswering({ eth_getBalance: '0xde0b6b3a7640000' })
    await expect(createChainReads(node.provider).nativeBalance(FROM, 1234)).resolves.toBe(
      10n ** 18n
    )
    expect(lowerCased(node.requests())).toEqual([['eth_getBalance', [FROM, '0x4d2']]])
  })

  it('sends one eth_estimateGas carrying a zero value as the quantity 0x0', async () => {
    const node = nodeAnswering({ eth_estimateGas: '0x5208' })
    await expect(
      createChainReads(node.provider).estimateGas({ from: FROM, to: TO, data: DATA, value: 0n })
    ).resolves.toBe(21_000n)
    expect(lowerCased(node.requests())).toEqual([
      ['eth_estimateGas', [{ from: FROM, to: TO, data: DATA, value: '0x0' }]]
    ])
  })

  it('sends one eth_call carrying the sender, at the block tag', async () => {
    const node = nodeAnswering({ eth_call: '0xcafe' })
    await expect(
      createProviderAdapter(node.provider).call(TO, DATA, FROM, 'finalized')
    ).resolves.toBe('0xcafe')
    expect(lowerCased(node.requests())).toEqual([
      ['eth_call', [{ from: FROM, to: TO, data: DATA }, 'finalized']]
    ])
  })

  it('refuses a call answer of odd length as a failed call read, since ethers reads no such bytes', async () => {
    const node = nodeAnswering({ eth_call: '0xabc' })
    const caught = await thrownBy(
      createProviderAdapter(node.provider).call(TO, DATA, FROM, 'latest')
    )
    expect(isProviderReadFailure(caught)).toBe(true)
    expect(readOf(caught)).toBe('call')
  })

  it('sends one eth_getLogs over the range as quantities and answers the log with its checksummed address', async () => {
    const node = nodeAnswering({ eth_getLogs: [NODE_LOG] })
    const logs = await createProviderAdapter(node.provider).logs(
      { addresses: [CHECKSUMMED], topics: [TOPIC, null] },
      { from: 900, to: 1900 }
    )
    expect(logs).toEqual([
      {
        address: CHECKSUMMED,
        topics: [TOPIC],
        data: '0x01',
        blockNumber: 950,
        blockHash: NODE_LOG.blockHash,
        logIndex: 3,
        transactionHash: NODE_LOG.transactionHash,
        removed: false
      }
    ])
    expect(node.requests()).toHaveLength(1)
    const [method, [spec]] = node.requests()[0] as [string, Record<string, unknown>[]]
    expect(method).toBe('eth_getLogs')
    expect(([] as unknown[]).concat(spec.address).map(lower)).toEqual([CHECKSUMMED.toLowerCase()])
    expect(spec).toMatchObject({ topics: [TOPIC, null], fromBlock: '0x384', toBlock: '0x76c' })
  })

  it('sends one eth_getBlockByNumber at the tag without transactions', async () => {
    const node = nodeAnswering({ eth_getBlockByNumber: NODE_BLOCK })
    await expect(createProviderAdapter(node.provider).block(950)).resolves.toEqual({
      number: 950,
      timestamp: 0x6553f100,
      hash: NODE_BLOCK.hash
    })
    expect(node.requests()).toEqual([['eth_getBlockByNumber', ['0x3b6', false]]])
  })

  const WITH_A_BAD_CHECKSUM: [
    string,
    ProviderRead,
    (provider: ExtensionProvider) => Promise<unknown>
  ][] = [
    [
      'the target of a call',
      'call',
      (provider) => createProviderAdapter(provider).call(BAD_CHECKSUM, DATA, FROM, 'latest')
    ],
    [
      'the sender of a call',
      'call',
      (provider) => createProviderAdapter(provider).call(TO, DATA, BAD_CHECKSUM, 'latest')
    ],
    [
      'the address of a balance',
      'nativeBalance',
      (provider) => createChainReads(provider).nativeBalance(BAD_CHECKSUM)
    ],
    [
      'the sender of an estimate',
      'estimateGas',
      (provider) =>
        createChainReads(provider).estimateGas({ from: BAD_CHECKSUM, to: TO, data: DATA })
    ],
    [
      'the target of an estimate',
      'estimateGas',
      (provider) =>
        createChainReads(provider).estimateGas({ from: FROM, to: BAD_CHECKSUM, data: DATA })
    ],
    [
      'an address of the logs filter',
      'logs',
      (provider) =>
        createProviderAdapter(provider).logs(
          { addresses: [TO, BAD_CHECKSUM], topics: [TOPIC] },
          { from: 900, to: 1900 }
        )
    ]
  ]
  WITH_A_BAD_CHECKSUM.forEach(([title, read, run]) =>
    it(`refuses a mixed-case address with a wrong checksum as ${title}: a failed ${read} read, nothing sent`, async () => {
      const node = nodeAnswering({
        eth_call: '0x',
        eth_getBalance: '0x1',
        eth_estimateGas: '0x5208',
        eth_getLogs: []
      })
      const caught = await thrownBy(run(node.provider))
      expect(isProviderReadFailure(caught)).toBe(true)
      expect(readOf(caught)).toBe(read)
      expect(node.requests()).toEqual([])
    })
  )

  it("refuses a '0x' balance and a '0x' estimate as failed reads, never as zero", async () => {
    const node = nodeAnswering({ eth_getBalance: '0x', eth_estimateGas: '0x' })
    const balance = await thrownBy(createChainReads(node.provider).nativeBalance(FROM))
    const estimate = await thrownBy(
      createChainReads(node.provider).estimateGas({ from: FROM, to: TO, data: DATA })
    )
    expect(isProviderReadFailure(balance)).toBe(true)
    expect(readOf(balance)).toBe('nativeBalance')
    expect(isProviderReadFailure(estimate)).toBe(true)
    expect(isRevertedCall(estimate)).toBe(false)
    expect(readOf(estimate)).toBe('estimateGas')
  })

  it('reads a balance the node answers as a decimal string', async () => {
    const node = nodeAnswering({ eth_getBalance: '1000' })
    await expect(createChainReads(node.provider).nativeBalance(FROM)).resolves.toBe(1000n)
  })

  const withoutTransactionIndex = Object.fromEntries(
    Object.entries(NODE_LOG).filter(([field]) => field !== 'transactionIndex')
  )
  const BROKEN_LOGS: [string, Record<string, unknown>][] = [
    ['without a transaction index', withoutTransactionIndex],
    ["with the log index '0x'", { ...NODE_LOG, logIndex: '0x' }],
    ['with data of odd length', { ...NODE_LOG, data: '0xabc' }]
  ]
  BROKEN_LOGS.forEach(([title, log]) =>
    it(`refuses a log ${title} as a failed logs read, never a partial list`, async () => {
      const node = nodeAnswering({ eth_getLogs: [NODE_LOG, log] })
      const caught = await thrownBy(
        createProviderAdapter(node.provider).logs(
          { addresses: [CHECKSUMMED], topics: [TOPIC] },
          { from: 900, to: 1900 }
        )
      )
      expect(isProviderReadFailure(caught)).toBe(true)
      expect(readOf(caught)).toBe('logs')
    })
  )

  it('refuses a block answer without the header fields ethers requires as a failed block read', async () => {
    const { number, timestamp, hash } = NODE_BLOCK
    const node = nodeAnswering({ eth_getBlockByNumber: { number, timestamp, hash } })
    const caught = await thrownBy(createProviderAdapter(node.provider).block(950))
    expect(isProviderReadFailure(caught)).toBe(true)
    expect(readOf(caught)).toBe('block')
  })

  it('rejects a revert Colibri throws from its send with the raw revert data, for a call and an estimate', async () => {
    const revert = colibriError(3, 'execution reverted', REVERT)
    const node = nodeAnswering({ eth_call: revert, eth_estimateGas: revert })
    const call = await thrownBy(createProviderAdapter(node.provider).call(TO, DATA, FROM, 'latest'))
    const estimate = await thrownBy(
      createChainReads(node.provider).estimateGas({ from: FROM, to: TO, data: DATA })
    )
    expect(isRevertedCall(call)).toBe(true)
    expect(call).toMatchObject({ read: 'call', data: REVERT })
    expect(isRevertedCall(estimate)).toBe(true)
    expect(estimate).toMatchObject({ read: 'estimateGas', data: REVERT })
  })

  it("rejects a node's JSON-RPC revert, mapped by ethers' own transport, with the raw revert data", async () => {
    const provider = providerOf(PLAIN_RPC_NETWORK)
    jest
      .spyOn(provider as unknown as JsonRpcTransport, '_send')
      .mockImplementation(async (payload) =>
        ([] as { id: number }[]).concat(payload as { id: number }).map(({ id }) => ({
          id,
          jsonrpc: '2.0',
          error: { code: 3, message: 'execution reverted', data: REVERT }
        }))
      )
    const call = await thrownBy(createProviderAdapter(provider).call(TO, DATA, FROM, 'latest'))
    const estimate = await thrownBy(
      createChainReads(provider).estimateGas({ from: FROM, to: TO, data: DATA })
    )
    expect(isRevertedCall(call)).toBe(true)
    expect(call).toMatchObject({ read: 'call', data: REVERT })
    expect(isRevertedCall(estimate)).toBe(true)
    expect(estimate).toMatchObject({ read: 'estimateGas', data: REVERT })
  })
})

describe('gasCallOf, the transaction a key sends for a prepared call', () => {
  const block = { number: 1, hash: `0x${'00'.repeat(32)}` as Hex }
  const prepared = (sender: 'account' | 'anyone'): PreparedCall => ({
    kind: 'call',
    target: TO,
    value: 7n,
    data: DATA,
    sender,
    block
  })

  it('turns a call anyone may send into the call to estimate from the given key', () => {
    expect(gasCallOf(prepared('anyone'), FROM)).toEqual({
      from: FROM,
      to: TO,
      data: DATA,
      value: 7n
    })
  })

  it('refuses a call the account sends, which the account library estimates', () => {
    expect(() => gasCallOf(prepared('account'), FROM)).toThrow()
  })
})
