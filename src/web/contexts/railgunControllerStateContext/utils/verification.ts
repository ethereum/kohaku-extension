/* eslint-disable no-console */
import type { Indexer, RailgunAccount } from '@kohaku-eth/railgun'
import { hexlify, Interface, toBeHex } from 'ethers'
import type { UIProxyProvider } from '@web/services/provider/UIProxyProvider'

const RAILGUN_VERIFICATION_ABI = [
  'function merkleRoot() view returns (bytes32)',
  'function nullifiers(uint256,bytes32) view returns (bool)'
]

const verificationInterface = new Interface(RAILGUN_VERIFICATION_ABI)

const NOTE_VERIFICATION_CONCURRENCY = 8
const RPC_CALL_TIMEOUT_MS = 25_000
const VERIFICATION_TOTAL_TIMEOUT_MS = 120_000

const normalizeHex = (value: string) => value.toLowerCase()

const getHexRoot = (root: Uint8Array) => normalizeHex(hexlify(root))

type NoteLike = {
  getHash: () => Promise<Uint8Array>
  getNullifier: (leafIndex: number) => Promise<Uint8Array>
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Verification timed out: ${label} did not complete within ${ms}ms`))
    }, ms)
    promise.then(
      (val) => {
        clearTimeout(timer)
        resolve(val)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

async function processInBatches<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(batch.map(fn))
  }
}

function buildLeafIndexByLeafHex(
  leaves: Array<Uint8Array | null | undefined>
): Map<string, number> {
  const leafIndexByLeafHex = new Map<string, number>()
  leaves.forEach((leaf, i) => {
    if (!leaf) return
    const leafHex = normalizeHex(hexlify(leaf))
    if (!leafIndexByLeafHex.has(leafHex)) {
      leafIndexByLeafHex.set(leafHex, i)
    }
  })
  return leafIndexByLeafHex
}

async function ethCall(
  provider: UIProxyProvider,
  to: string,
  data: string,
  block: number
): Promise<string> {
  return withTimeout(
    provider.send('eth_call', [{ to, data }, toBeHex(block)]),
    RPC_CALL_TIMEOUT_MS,
    `eth_call to ${to} at block ${block}`
  )
}

export async function verifyMerkleRoot({
  account,
  verificationProvider,
  railgunAddress,
  toBlock
}: {
  account: RailgunAccount
  verificationProvider: UIProxyProvider
  railgunAddress: string
  toBlock: number
}) {
  console.log(`[RailgunContext - LPA] Verifying merkle root at block ${toBlock}...`)
  const localRoot = getHexRoot(account.getLatestMerkleRoot())
  const callData = verificationInterface.encodeFunctionData('merkleRoot')
  const callResult = await ethCall(verificationProvider, railgunAddress, callData, toBlock)
  const decoded = verificationInterface.decodeFunctionResult('merkleRoot', callResult)
  const onChainRoot = normalizeHex(String(decoded[0]))

  if (localRoot !== onChainRoot) {
    throw new Error(
      `Logs could not be verified -- merkle root mismatch at block ${toBlock} ` +
        `(local=${localRoot}, onChain=${onChainRoot})`
    )
  }
  console.log('[RailgunContext - LPA] Merkle root verified successfully')
}

export async function verifyNullifiers({
  account,
  indexer,
  verificationProvider,
  railgunAddress,
  toBlock
}: {
  account: RailgunAccount
  indexer: Indexer
  verificationProvider: UIProxyProvider
  railgunAddress: string
  toBlock: number
}) {
  console.log(`[RailgunContext - LPA] Verifying nullifiers at block ${toBlock}...`)

  const verifyAllTrees = async () => {
    const trees = indexer.getTrees()

    for (let treeIndex = 0; treeIndex < trees.length; treeIndex++) {
      const tree = trees[treeIndex]
      if (!tree) {
        // eslint-disable-next-line no-continue
        continue
      }

      const treeNumber = tree.treeNumber ?? treeIndex
      const localNullifiers = new Set(tree.nullifiers.map((value) => normalizeHex(hexlify(value))))

      const leaves = tree.tree?.[0] ?? []
      const leafIndexByLeafHex = buildLeafIndexByLeafHex(leaves)

      let rawNotes: Array<NoteLike | null | undefined>
      try {
        rawNotes = account.getAllNotes(treeNumber) as Array<NoteLike | null | undefined>
      } catch {
        // Account has no notes for this tree (e.g. tree exists in
        // checkpoint data but no notes belong to this account) — nothing to verify.
        // eslint-disable-next-line no-continue
        continue
      }
      const notes = rawNotes.filter((n): n is NoteLike => !!n)

      // eslint-disable-next-line no-await-in-loop
      await processInBatches(notes, NOTE_VERIFICATION_CONCURRENCY, async (note) => {
        const noteHash = await note.getHash()
        const noteHashHex = normalizeHex(hexlify(noteHash))
        const leafIndex = leafIndexByLeafHex.get(noteHashHex)
        if (leafIndex === undefined) {
          throw new Error(
            `Logs could not be verified -- note commitment ${noteHashHex} not found ` +
              `in merkle tree (tree=${treeNumber}, block=${toBlock})`
          )
        }

        const noteNullifier = await note.getNullifier(leafIndex)
        const nullifierHex = normalizeHex(hexlify(noteNullifier))
        const callData = verificationInterface.encodeFunctionData('nullifiers', [
          treeNumber,
          nullifierHex
        ])
        const callResult = await ethCall(verificationProvider, railgunAddress, callData, toBlock)
        const decoded = verificationInterface.decodeFunctionResult('nullifiers', callResult)
        const isNullifiedOnChain = Boolean(decoded[0])
        const isNullifiedLocally = localNullifiers.has(nullifierHex)

        if (isNullifiedOnChain !== isNullifiedLocally) {
          const direction = isNullifiedOnChain
            ? 'nullified on-chain but not locally'
            : 'nullified locally but not on-chain'
          throw new Error(
            `Logs could not be verified -- nullifier mismatch: ${direction} ` +
              `(tree=${treeNumber}, nullifier=${nullifierHex}, block=${toBlock})`
          )
        }
      })
    }
  }

  await withTimeout(verifyAllTrees(), VERIFICATION_TOTAL_TIMEOUT_MS, 'nullifier verification')
  console.log('[RailgunContext - LPA] Nullifiers verified successfully')
}
