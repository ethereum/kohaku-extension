/* eslint-disable no-console */
import type { RailgunAccount } from '@kohaku-eth/railgun'
import { hexlify, Interface, toBeHex } from 'ethers'
import type { UIProxyProvider } from '@web/services/provider/UIProxyProvider'

const RAILGUN_VERIFICATION_ABI = ['function merkleRoot() view returns (bytes32)']

const verificationInterface = new Interface(RAILGUN_VERIFICATION_ABI)

const RPC_CALL_TIMEOUT_MS = 25_000

const normalizeHex = (value: string) => value.toLowerCase()

const getHexRoot = (root: Uint8Array) => normalizeHex(hexlify(root))

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
      `Merkle root verification failed: local and on-chain roots differ at block ${toBlock} ` +
        `(local=${localRoot}, onChain=${onChainRoot}). Note: nullifier spent-state is not independently verified.`
    )
  }
  console.log('[RailgunContext - LPA] Merkle root verification succeeded')
}
