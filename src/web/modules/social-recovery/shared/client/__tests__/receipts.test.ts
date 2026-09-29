/**
 * The receipt wait follows a transaction the wallet broadcast over the
 * extension's own provider. The caller reads the chain's block before the
 * send, and the wait scans for a replacement from that block. It answers
 * ethers' receipt, and lets ethers' `CALL_EXCEPTION` for a revert and
 * `TRANSACTION_REPLACED` for a replacement through as ethers threw them, since
 * the writes read them as they are. A hash the node does not know yet is asked
 * again at each new block, for a bounded time.
 *
 * The provider is the extension's own, over the scripted node of harness.ts,
 * so ethers' own wait decides every answer. The tests watch the value ethers'
 * wait settled with, to check that the receipt wait hands on that very value.
 */
import { isError } from 'ethers'

import type { Address, Hex } from '@web/modules/social-recovery/sdk-interfaces'

import {
  BLOCK_POLL_MS,
  createReceiptWait,
  mineAndWait,
  NodeReceipt,
  NodeScript,
  NodeTransaction,
  ScriptedNode,
  scriptedNode,
  thrownBy,
  track,
  UNKNOWN_TRANSACTION_MS,
  watchEthersWaits
} from './harness'

const SENDER = '0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A' as Address
const TARGET = '0x0000000000000000000000000000000000c70101' as Address
const OTHER_TARGET = '0x0000000000000000000000000000000000c70106' as Address
const DATA: Hex = '0x1a2b3c4d'

const HASH: Hex = `0x${'ab'.repeat(32)}`
const REPLACEMENT_HASH: Hex = `0x${'cd'.repeat(32)}`

/** The block read before the send; the transaction and any replacement are mined from it on. */
const START = 100

const sent = (overrides: Partial<NodeTransaction> = {}): NodeTransaction => ({
  hash: HASH,
  from: SENDER,
  to: TARGET,
  nonce: 5,
  data: DATA,
  value: 0n,
  ...overrides
})

const receiptFor = (tx: NodeTransaction, status: 0 | 1): NodeReceipt => ({
  hash: tx.hash,
  from: tx.from,
  to: tx.to,
  blockNumber: tx.blockNumber ?? START,
  status,
  gasUsed: 51_234n,
  gasPrice: 2_000_000_000n
})

let nodes: ScriptedNode[] = []

const nodeWith = (script: Partial<NodeScript>): ScriptedNode => {
  const node = scriptedNode(script)
  nodes.push(node)
  return node
}

/** The node where the transaction was mined in START with the given status. */
const minedWith = (status: 0 | 1) => {
  const tx = sent({ blockNumber: START })
  return nodeWith({
    blockNumber: START + 1,
    transactions: [tx],
    receipts: [receiptFor(tx, status)],
    nonces: { [SENDER.toLowerCase()]: 6 }
  })
}

/**
 * The node at block `at`, where another transaction of the same sender and
 * nonce was mined in block `minedIn` in place of the pending one.
 */
const replacedBy = (replacement: Partial<NodeTransaction>, minedIn = START, at = START) => {
  const tx = sent({ hash: REPLACEMENT_HASH, blockNumber: minedIn, ...replacement })
  return nodeWith({
    blockNumber: at,
    transactions: [sent(), tx],
    receipts: [receiptFor(tx, 1)],
    nonces: { [SENDER.toLowerCase()]: 6 }
  })
}

const outcomeOf = (run: Promise<unknown>): Promise<unknown> =>
  run.then(
    (value) => value,
    (error: unknown) => error
  )

afterEach(() => {
  jest.restoreAllMocks()
  nodes.forEach((node) => node.provider.destroy())
  nodes = []
  jest.clearAllTimers()
  jest.useRealTimers()
})

describe('the receipt wait', () => {
  it("reads the chain's latest block, the block a send starts from", async () => {
    const node = minedWith(1)
    node.script.blockNumber = START - 3
    await expect(createReceiptWait(node.provider).blockNumber()).resolves.toBe(START - 3)
  })

  it("answers ethers' receipt of a transaction that ran, as ethers' wait answered it", async () => {
    const node = minedWith(1)
    const ethersWaits = await watchEthersWaits(node, HASH)
    const receipt = await createReceiptWait(node.provider).wait(HASH, START)
    expect(receipt).toMatchObject({
      hash: HASH,
      status: 1,
      blockNumber: START,
      gasUsed: 51_234n,
      gasPrice: 2_000_000_000n
    })
    expect(ethersWaits).toHaveLength(1)
    expect(receipt).toBe(await ethersWaits[0])
  })

  it("lets ethers' CALL_EXCEPTION for a reverted transaction through unchanged, with its receipt", async () => {
    const node = minedWith(0)
    const ethersWaits = await watchEthersWaits(node, HASH)
    const caught = await thrownBy(createReceiptWait(node.provider).wait(HASH, START))
    expect(isError(caught, 'CALL_EXCEPTION')).toBe(true)
    expect(caught).toMatchObject({ receipt: { hash: HASH, status: 0, blockNumber: START } })
    expect(ethersWaits).toHaveLength(1)
    expect(caught).toBe(await outcomeOf(ethersWaits[0]))
  })

  const REPLACEMENTS: [string, Partial<NodeTransaction>, 'cancelled' | 'replaced' | 'repriced'][] =
    [
      ['a transaction to itself that sends nothing', { to: SENDER, data: '0x' }, 'cancelled'],
      ['another call', { to: OTHER_TARGET }, 'replaced'],
      ['the same call at another fee', {}, 'repriced']
    ]
  REPLACEMENTS.forEach(([title, replacement, reason]) =>
    it(`lets ethers' TRANSACTION_REPLACED through unchanged for ${title} mined in its place`, async () => {
      const node = replacedBy(replacement)
      const ethersWaits = await watchEthersWaits(node, HASH)
      const caught = await thrownBy(createReceiptWait(node.provider).wait(HASH, START))
      expect(isError(caught, 'TRANSACTION_REPLACED')).toBe(true)
      expect(caught).toMatchObject({
        reason,
        cancelled: reason !== 'repriced',
        hash: REPLACEMENT_HASH,
        receipt: { hash: REPLACEMENT_HASH, status: 1 }
      })
      expect(ethersWaits).toHaveLength(1)
      expect(caught).toBe(await outcomeOf(ethersWaits[0]))
    })
  )

  it('lets a failed read of the node through as the provider threw it', async () => {
    const node = minedWith(1)
    const failure = new Error('The node is not reachable.')
    jest.spyOn(node.provider, 'getTransaction').mockRejectedValue(failure)
    await expect(createReceiptWait(node.provider).wait(HASH, START)).rejects.toBe(failure)
  })
})

describe('the block the wait scans from', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  it('finds a replacement mined after the block read before the send, before the wait began', async () => {
    const node = replacedBy({ to: OTHER_TARGET }, START + 1, START + 3)
    const fromSend = track(createReceiptWait(node.provider).wait(HASH, START))
    const fromWait = track(createReceiptWait(node.provider).wait(HASH, START + 3))
    await mineAndWait(node, 0, BLOCK_POLL_MS * 3)
    expect(fromSend.status).toBe('rejected')
    expect(isError(fromSend.value, 'TRANSACTION_REPLACED')).toBe(true)
    expect(fromSend.value).toMatchObject({ reason: 'replaced', hash: REPLACEMENT_HASH })
    expect(fromWait.status).toBe('pending')
  })
})

describe('a hash the node does not know yet', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  /** The node at START, where the transaction is pending but not yet known by hash. */
  const notYetKnown = () =>
    nodeWith({
      blockNumber: START,
      transactions: [sent()],
      forgotten: [HASH],
      nonces: { [SENDER.toLowerCase()]: 5 }
    })

  it('is asked again at each new block, and only then', async () => {
    const node = notYetKnown()
    const waiting = track(createReceiptWait(node.provider).wait(HASH, START))
    await mineAndWait(node, 0)
    const asked = node.asked('eth_getTransactionByHash')
    expect(asked).toBeGreaterThanOrEqual(1)
    await mineAndWait(node, 0, BLOCK_POLL_MS * 3)
    expect(node.asked('eth_getTransactionByHash')).toBe(asked)
    await mineAndWait(node, 1)
    expect(node.asked('eth_getTransactionByHash')).toBe(asked + 1)
    await mineAndWait(node, 1)
    expect(node.asked('eth_getTransactionByHash')).toBe(asked + 2)
    expect(waiting.status).toBe('pending')
  })

  it('is waited for with the replacement scan from the start block once the node knows it', async () => {
    const node = notYetKnown()
    const waiting = track(createReceiptWait(node.provider).wait(HASH, START))
    await mineAndWait(node, 1)
    expect(waiting.status).toBe('pending')
    // The node learns the pending transaction, and a replacement is mined.
    node.script.forgotten = []
    node.script.transactions.push(
      sent({ hash: REPLACEMENT_HASH, to: OTHER_TARGET, blockNumber: START + 1 })
    )
    node.script.receipts.push(
      receiptFor(sent({ hash: REPLACEMENT_HASH, to: OTHER_TARGET, blockNumber: START + 1 }), 1)
    )
    node.script.nonces[SENDER.toLowerCase()] = 6
    await mineAndWait(node, 1)
    expect(waiting.status).toBe('rejected')
    expect(isError(waiting.value, 'TRANSACTION_REPLACED')).toBe(true)
    expect(waiting.value).toMatchObject({ reason: 'replaced', hash: REPLACEMENT_HASH })
  })

  it('answers the receipt once the node knows the transaction and it was mined', async () => {
    const node = notYetKnown()
    const waiting = track(createReceiptWait(node.provider).wait(HASH, START))
    await mineAndWait(node, 1)
    const mined = sent({ blockNumber: START + 2 })
    node.script.forgotten = []
    node.script.transactions = [mined]
    node.script.receipts = [receiptFor(mined, 1)]
    await mineAndWait(node, 1)
    expect(waiting.status).toBe('resolved')
    expect(waiting.value).toMatchObject({ hash: HASH, status: 1, blockNumber: START + 2 })
  })

  it('is given up, naming the hash, once the node still does not know it after the bounded time', async () => {
    const node = notYetKnown()
    const began = Date.now()
    const waiting = track(createReceiptWait(node.provider).wait(HASH, START))
    await mineAndWait(node, 0, UNKNOWN_TRANSACTION_MS - BLOCK_POLL_MS * 2)
    expect(waiting.status).toBe('pending')
    while (waiting.status === 'pending' && Date.now() - began < UNKNOWN_TRANSACTION_MS * 2) {
      // eslint-disable-next-line no-await-in-loop
      await mineAndWait(node, 1)
    }
    expect(waiting.status).toBe('rejected')
    expect(Date.now() - began).toBeGreaterThanOrEqual(UNKNOWN_TRANSACTION_MS)
    expect(Date.now() - began).toBeLessThanOrEqual(UNKNOWN_TRANSACTION_MS + BLOCK_POLL_MS * 3)
    expect(waiting.value).toBeInstanceOf(Error)
    expect((waiting.value as Error).message).toContain(HASH)
    expect(isError(waiting.value, 'TRANSACTION_REPLACED')).toBe(false)
    expect(isError(waiting.value, 'CALL_EXCEPTION')).toBe(false)
  })

  it('lets a failed read of the node while it asks again through as the provider threw it', async () => {
    const node = notYetKnown()
    const waiting = track(createReceiptWait(node.provider).wait(HASH, START))
    await mineAndWait(node, 1)
    const failure = new Error('The node is not reachable.')
    jest.spyOn(node.provider, 'getTransaction').mockRejectedValue(failure)
    await mineAndWait(node, 1)
    expect(waiting).toEqual({ status: 'rejected', value: failure })
  })
})

describe('once the caller releases the provider', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  const pendingAt = (script: Partial<NodeScript> = {}) =>
    nodeWith({
      blockNumber: START,
      transactions: [sent()],
      nonces: { [SENDER.toLowerCase()]: 5 },
      ...script
    })

  it('rejects a wait for a transaction the node does not know yet, naming the hash, and asks no more', async () => {
    const node = pendingAt({ forgotten: [HASH] })
    const release = new AbortController()
    const waiting = track(
      createReceiptWait(node.provider, { signal: release.signal }).wait(HASH, START)
    )
    await mineAndWait(node, 1)
    expect(waiting.status).toBe('pending')
    const asked = node.asked('eth_getTransactionByHash')
    release.abort()
    await mineAndWait(node, 1)
    expect(waiting.status).toBe('rejected')
    expect(waiting.value).toBeInstanceOf(Error)
    expect(waiting.value).toMatchObject({ name: 'ReceiptWaitReleased', transactionHash: HASH })
    expect(node.asked('eth_getTransactionByHash')).toBe(asked)
  })

  it('rejects a wait on a transaction the node knows but has not mined, naming the hash', async () => {
    const node = pendingAt()
    const release = new AbortController()
    const waiting = track(
      createReceiptWait(node.provider, { signal: release.signal }).wait(HASH, START)
    )
    await mineAndWait(node, 1)
    expect(waiting.status).toBe('pending')
    release.abort()
    await mineAndWait(node, 0)
    expect(waiting.status).toBe('rejected')
    expect(waiting.value).toMatchObject({ name: 'ReceiptWaitReleased', transactionHash: HASH })
  })

  it('rejects at once a wait that starts after the release, and asks the node nothing', async () => {
    const node = minedWith(1)
    const release = new AbortController()
    release.abort()
    await expect(
      createReceiptWait(node.provider, { signal: release.signal }).wait(HASH, START)
    ).rejects.toMatchObject({ name: 'ReceiptWaitReleased', transactionHash: HASH })
    expect(node.asked('eth_getTransactionByHash')).toBe(0)
  })

  it('answers the receipt as before for a wait that ends before the release', async () => {
    const node = minedWith(1)
    const release = new AbortController()
    const waiting = track(
      createReceiptWait(node.provider, { signal: release.signal }).wait(HASH, START)
    )
    await mineAndWait(node, 1)
    expect(waiting.status).toBe('resolved')
    expect(waiting.value).toMatchObject({ hash: HASH, status: 1 })
    release.abort()
    await mineAndWait(node, 0)
    expect(waiting.status).toBe('resolved')
  })
})
