/* eslint-disable no-console */
import { Interface } from 'ethers'
import { LeanIMT } from '@zk-kit/lean-imt'
import { poseidon } from 'maci-crypto/build/ts/hashing'
import type { UIProxyProvider } from '@web/services/provider/UIProxyProvider'

const PRIVACY_POOL_VERIFICATION_ABI = [
  'function currentRoot() view returns (uint256)',
  'function currentRootIndex() view returns (uint32)',
  'function roots(uint256 _index) view returns (uint256)'
]

const ENTRYPOINT_VERIFICATION_ABI = [
  'function latestRoot() view returns (uint256)',
  'function rootByIndex(uint256 _index) view returns (uint256)'
]

const poolVerificationInterface = new Interface(PRIVACY_POOL_VERIFICATION_ABI)
const entrypointVerificationInterface = new Interface(ENTRYPOINT_VERIFICATION_ABI)

const EMPTY_TREE_ROOT = '0'

const RPC_CALL_TIMEOUT_MS = 25_000
/** Small buffer for clock drift when comparing ASP vs provider timestamp (seconds). */
const CLOCK_DRIFT_BUFFER_SECONDS = 5
/** Wait duration for one block before retry when we think RPC is lagging (ms). */
const WAIT_ONE_BLOCK_MS = 12_000
/** Max number of wait-and-retry attempts when ASP timestamp is ahead of provider. */
const MAX_WAIT_RETRY_ATTEMPTS = 3
/** Max number of root-history indices to look back when ASP/chain state is behind. */
const MAX_LOOKBACK_INDICES = 10
/** Max indices to probe on Entrypoint to discover "current" index (no getter). */
const MAX_ENTRYPOINT_INDEX_PROBE = 100

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

async function ethCall(provider: UIProxyProvider, to: string, data: string): Promise<string> {
  return withTimeout(
    provider.send('eth_call', [{ to, data }, 'latest']),
    RPC_CALL_TIMEOUT_MS,
    `eth_call to ${to}`
  )
}

function normalizeTimestampToSeconds(timestamp: number | string): number {
  if (typeof timestamp === 'string') {
    const ms = Date.parse(timestamp)
    if (!Number.isFinite(ms)) return NaN
    return Math.floor(ms / 1000)
  }
  return timestamp > 1_000_000_000_000 ? Math.floor(timestamp / 1000) : Math.floor(timestamp)
}

function parseRpcTimestamp(timestamp: string | number | bigint): number {
  if (typeof timestamp === 'bigint') return Number(timestamp)
  if (typeof timestamp === 'number') return Math.floor(timestamp)
  return Number(BigInt(timestamp))
}

async function getLatestBlockTimestampSeconds(provider: UIProxyProvider): Promise<number> {
  const latestBlock = (await withTimeout(
    provider.send('eth_getBlockByNumber', ['latest', false]),
    RPC_CALL_TIMEOUT_MS,
    'eth_getBlockByNumber latest'
  )) as { timestamp?: string | number | bigint } | null

  if (!latestBlock || latestBlock.timestamp === undefined) {
    throw new Error('Verification failed: RPC provider did not return latest block timestamp')
  }

  const latestBlockTimestamp = parseRpcTimestamp(latestBlock.timestamp)
  if (!Number.isFinite(latestBlockTimestamp) || latestBlockTimestamp <= 0) {
    throw new Error('Verification failed: invalid latest block timestamp from RPC provider')
  }

  return latestBlockTimestamp
}

function calculateLocalRoot(leaves: string[]): string {
  const tree = new LeanIMT<bigint>((a, b) => poseidon([a, b]) as bigint)
  const bigintLeaves = leaves.map((leaf) => BigInt(leaf))
  tree.insertMany(bigintLeaves)
  return tree.root.toString()
}

/** Fetch Entrypoint's latestRoot via eth_call. */
async function fetchEntrypointLatestRoot(
  provider: UIProxyProvider,
  entrypointAddress: string
): Promise<string> {
  const callData = entrypointVerificationInterface.encodeFunctionData('latestRoot')
  const result = await ethCall(provider, entrypointAddress, callData)
  const decoded = entrypointVerificationInterface.decodeFunctionResult('latestRoot', result)
  return BigInt(decoded[0]).toString()
}

/** Fetch Entrypoint root at index via eth_call. */
async function fetchEntrypointRootByIndex(
  provider: UIProxyProvider,
  entrypointAddress: string,
  index: number
): Promise<string> {
  const callData = entrypointVerificationInterface.encodeFunctionData('rootByIndex', [index])
  const result = await ethCall(provider, entrypointAddress, callData)
  const decoded = entrypointVerificationInterface.decodeFunctionResult('rootByIndex', result)
  return BigInt(decoded[0]).toString()
}

/**
 * Find the Entrypoint index whose root equals latestRoot (current tip).
 * Entrypoint has no currentIndex getter, so we probe rootByIndex(0), (1), ... until match.
 */
async function findEntrypointCurrentRootIndex(
  provider: UIProxyProvider,
  entrypointAddress: string
): Promise<number | null> {
  const latest = await fetchEntrypointLatestRoot(provider, entrypointAddress)
  for (let i = 0; i < MAX_ENTRYPOINT_INDEX_PROBE; i++) {
    // Sequential RPC calls required to find index matching latestRoot
    // eslint-disable-next-line no-await-in-loop
    const root = await fetchEntrypointRootByIndex(provider, entrypointAddress, i)
    if (root === latest) return i
  }
  return null
}

async function verifyAspRoot({
  verificationProvider,
  entrypointAddress,
  aspReportedMtRoot,
  aspReportedTimestamp,
  aspLeaves
}: {
  verificationProvider: UIProxyProvider
  entrypointAddress: string
  aspReportedMtRoot: string
  aspReportedTimestamp: number | string
  aspLeaves: string[]
}): Promise<void> {
  const expectedAspRoot = BigInt(aspReportedMtRoot).toString()
  const expectedAspTimestampSeconds = normalizeTimestampToSeconds(aspReportedTimestamp)

  console.log(
    '[PPv1] ASP timestamp:',
    expectedAspTimestampSeconds,
    `(${new Date(expectedAspTimestampSeconds * 1000).toISOString()})`
  )

  if (!Number.isFinite(expectedAspTimestampSeconds) || expectedAspTimestampSeconds <= 0) {
    throw new Error(
      `Verification failed: ASP response has invalid timestamp (${aspReportedTimestamp})`
    )
  }

  if (aspLeaves.length > 0) {
    console.log('[PPv1] Calculating local ASP root...')
    const localAspRoot = calculateLocalRoot(aspLeaves)
    console.log('[PPv1] Local ASP root calculated:', localAspRoot)
    if (localAspRoot !== expectedAspRoot) {
      throw new Error(
        'Data corrupted: ASP reported root does not match downloaded ASP leaves ' +
          `(aspReported=${expectedAspRoot}, local=${localAspRoot})`
      )
    }
  } else if (expectedAspRoot !== EMPTY_TREE_ROOT) {
    throw new Error(
      'ASP verification failed: ASP returned empty leaves but a non-empty root ' +
        `(aspReported=${expectedAspRoot})`
    )
  }

  // ——— 1. Initial check ———
  let onchainAspRoot = await fetchEntrypointLatestRoot(verificationProvider, entrypointAddress)
  console.log('[PPv1] Onchain ASP root:', onchainAspRoot, 'Expected:', expectedAspRoot)

  if (onchainAspRoot === expectedAspRoot) {
    console.log('[PPv1] ASP root verified successfully (initial check)')
    return
  }

  // ——— 2. Compare timestamps: if ASP is ahead of RPC we wait & retry; else we look back ———
  const providerTimestampSeconds = await getLatestBlockTimestampSeconds(verificationProvider)
  const aspAheadOfProvider =
    expectedAspTimestampSeconds > providerTimestampSeconds + CLOCK_DRIFT_BUFFER_SECONDS

  if (aspAheadOfProvider) {
    // RPC likely lagging: wait & retry (sequential wait then re-check is intentional)
    for (let attempt = 1; attempt <= MAX_WAIT_RETRY_ATTEMPTS; attempt++) {
      console.log(
        `[PPv1] ASP ahead of provider; waiting ~1 block (attempt ${attempt}/${MAX_WAIT_RETRY_ATTEMPTS})...`
      )
      // eslint-disable-next-line no-await-in-loop -- wait one block then re-fetch
      await new Promise<void>((resolve) => {
        setTimeout(resolve, WAIT_ONE_BLOCK_MS)
      })
      // eslint-disable-next-line no-await-in-loop
      onchainAspRoot = await fetchEntrypointLatestRoot(verificationProvider, entrypointAddress)
      if (onchainAspRoot === expectedAspRoot) {
        console.log('[PPv1] ASP root verified successfully (after wait & retry)')
        return
      }
    }
    throw new Error(
      'ASP verification failed: reported ASP root did not match Entrypoint latestRoot after ' +
        `${MAX_WAIT_RETRY_ATTEMPTS} wait-and-retry attempts (RPC may be lagging) ` +
        `(aspReported=${expectedAspRoot}, latestOnChain=${onchainAspRoot})`
    )
  }

  // ASP timestamp <= provider: chain has moved on, lookback
  const currentIndex = await findEntrypointCurrentRootIndex(verificationProvider, entrypointAddress)
  if (currentIndex === null) {
    throw new Error(
      'ASP verification failed: could not determine Entrypoint current root index (probe limit reached)'
    )
  }
  for (let offset = 1; offset <= MAX_LOOKBACK_INDICES; offset++) {
    const idx = currentIndex - offset
    if (idx < 0) break
    // eslint-disable-next-line no-await-in-loop
    const root = await fetchEntrypointRootByIndex(verificationProvider, entrypointAddress, idx)
    if (root === expectedAspRoot) {
      console.log(`[PPv1] ASP root verified successfully (historical index: ${idx})`)
      return
    }
  }

  throw new Error(
    'ASP verification failed: reported ASP root not found in Entrypoint recent history ' +
      `(aspReported=${expectedAspRoot}, latestOnChain=${onchainAspRoot})`
  )
}

/** Fetch Pool currentRoot via eth_call. */
async function fetchPoolCurrentRoot(
  provider: UIProxyProvider,
  poolAddress: string
): Promise<string> {
  const callData = poolVerificationInterface.encodeFunctionData('currentRoot')
  const result = await ethCall(provider, poolAddress, callData)
  return BigInt(poolVerificationInterface.decodeFunctionResult('currentRoot', result)[0]).toString()
}

/** Fetch Pool currentRootIndex via eth_call. */
async function fetchPoolCurrentRootIndex(
  provider: UIProxyProvider,
  poolAddress: string
): Promise<number> {
  const callData = poolVerificationInterface.encodeFunctionData('currentRootIndex')
  const result = await ethCall(provider, poolAddress, callData)
  return Number(poolVerificationInterface.decodeFunctionResult('currentRootIndex', result)[0])
}

/** Fetch Pool root at index via eth_call. */
async function fetchPoolRootByIndex(
  provider: UIProxyProvider,
  poolAddress: string,
  index: number
): Promise<string> {
  const callData = poolVerificationInterface.encodeFunctionData('roots', [index])
  const result = await ethCall(provider, poolAddress, callData)
  return BigInt(poolVerificationInterface.decodeFunctionResult('roots', result)[0]).toString()
}

async function verifyStateRoot({
  verificationProvider,
  poolAddress,
  aspReportedOnchainRoot,
  stateTreeLeaves,
  aspReportedTimestamp
}: {
  verificationProvider: UIProxyProvider
  poolAddress: string
  aspReportedOnchainRoot: string
  stateTreeLeaves: string[]
  aspReportedTimestamp: number | string
}): Promise<void> {
  const expectedStateRoot = BigInt(aspReportedOnchainRoot).toString()
  const expectedAspTimestampSeconds = normalizeTimestampToSeconds(aspReportedTimestamp)

  if (stateTreeLeaves.length > 0) {
    const localStateRoot = calculateLocalRoot(stateTreeLeaves)
    if (localStateRoot !== expectedStateRoot) {
      throw new Error(
        'Data corrupted: ASP reported state root does not match downloaded state leaves ' +
          `(aspReported=${expectedStateRoot}, local=${localStateRoot})`
      )
    }
  } else if (expectedStateRoot !== EMPTY_TREE_ROOT) {
    throw new Error(
      'State tree verification failed: ASP returned empty state leaves but a non-empty root ' +
        `(aspReported=${expectedStateRoot})`
    )
  }

  // ——— 1. Initial check ———
  let currentOnchainRoot = await fetchPoolCurrentRoot(verificationProvider, poolAddress)
  if (currentOnchainRoot === expectedStateRoot) {
    console.log('[PPv1] State root verified successfully (initial check)')
    return
  }

  // ——— 2. Compare timestamps: if ASP is ahead of RPC we wait & retry; else we look back ———
  const providerTimestampSeconds = await getLatestBlockTimestampSeconds(verificationProvider)
  console.log(
    '[PPv1] Latest block timestamp:',
    providerTimestampSeconds,
    `(${new Date(providerTimestampSeconds * 1000).toISOString()})`
  )
  const aspAheadOfProvider =
    expectedAspTimestampSeconds > providerTimestampSeconds + CLOCK_DRIFT_BUFFER_SECONDS

  if (aspAheadOfProvider) {
    // RPC likely lagging: wait & retry (sequential wait then re-check is intentional)
    for (let attempt = 1; attempt <= MAX_WAIT_RETRY_ATTEMPTS; attempt++) {
      console.log(
        `[PPv1] ASP ahead of provider; waiting ~1 block (attempt ${attempt}/${MAX_WAIT_RETRY_ATTEMPTS})...`
      )
      // eslint-disable-next-line no-await-in-loop -- wait one block then re-fetch
      await new Promise<void>((resolve) => {
        setTimeout(resolve, WAIT_ONE_BLOCK_MS)
      })
      // eslint-disable-next-line no-await-in-loop
      currentOnchainRoot = await fetchPoolCurrentRoot(verificationProvider, poolAddress)
      if (currentOnchainRoot === expectedStateRoot) {
        console.log('[PPv1] State root verified successfully (after wait & retry)')
        return
      }
    }
    throw new Error(
      'Verification failed: state root did not match Pool currentRoot after ' +
        `${MAX_WAIT_RETRY_ATTEMPTS} wait-and-retry attempts (RPC may be lagging) ` +
        `(aspReported=${expectedStateRoot}, currentOnChain=${currentOnchainRoot})`
    )
  }

  // ASP timestamp <= provider: lookback index-by-index
  const currentIndex = await fetchPoolCurrentRootIndex(verificationProvider, poolAddress)
  for (let offset = 1; offset <= MAX_LOOKBACK_INDICES; offset++) {
    const index = currentIndex - offset
    if (index < 0) break
    // eslint-disable-next-line no-await-in-loop
    const root = await fetchPoolRootByIndex(verificationProvider, poolAddress, index)
    if (root === expectedStateRoot) {
      console.log(`[PPv1] State root verified successfully (historical index: ${index})`)
      return
    }
  }

  throw new Error(
    'Verification failed: ASP state tree root not found in Pool recent root history ' +
      `(aspReported=${expectedStateRoot}, currentOnChain=${currentOnchainRoot})`
  )
}

export async function verifyPoolData({
  verificationProvider,
  poolAddress,
  entrypointAddress,
  aspReportedOnchainRoot,
  stateTreeLeaves,
  aspReportedMtRoot,
  aspReportedTimestamp,
  aspLeaves
}: {
  verificationProvider: UIProxyProvider
  poolAddress: string
  entrypointAddress: string
  aspReportedOnchainRoot: string
  stateTreeLeaves: string[]
  aspReportedMtRoot: string
  aspReportedTimestamp: number | string
  aspLeaves: string[]
}): Promise<void> {
  console.log('[PPv1] Verifying state tree and ASP roots...')

  await verifyAspRoot({
    verificationProvider,
    entrypointAddress,
    aspReportedMtRoot,
    aspReportedTimestamp,
    aspLeaves
  })

  await verifyStateRoot({
    verificationProvider,
    poolAddress,
    aspReportedOnchainRoot,
    stateTreeLeaves,
    aspReportedTimestamp
  })
}
