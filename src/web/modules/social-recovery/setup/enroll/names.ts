/**
 * A guardian's name resolves on Ethereum mainnet, where names live, whatever
 * chain the recovery runs on. The wallet configures no mainnet RPC, so the
 * reads go to public endpoints, tried in order, for name reads only. A name
 * that does not normalise, or that no endpoint could read, resolves to nothing.
 */
import { normalize } from 'viem/ens'

import { getRpcProvider } from '@ambire-common/services/provider/getRpcProvider'

import type { NameReaderFactory } from './types'

const MAINNET_CHAIN_ID = 1n

const MAINNET_NAME_RPC_URLS = [
  'https://ethereum-rpc.publicnode.com',
  'https://cloudflare-eth.com'
] as const

/** How long one endpoint may take to read a name before the next endpoint takes over. */
const NAME_READ_LIMIT_MS = 5_000

/** A plain JSON-RPC provider on mainnet; ethers knows mainnet's name registry from the chain id. */
export const mainnetNameReader: NameReaderFactory = (rpcUrl) =>
  getRpcProvider({ chainId: MAINNET_CHAIN_ID, rpcUrls: [rpcUrl] }, true)

/**
 * One endpoint's answer for a normalised name, or a rejection when it takes
 * longer than the limit; its provider is destroyed after the read either way.
 */
const readNameOn = async (
  normalized: string,
  rpcUrl: string,
  readerOf: NameReaderFactory
): Promise<string | null> => {
  const reader = readerOf(rpcUrl)
  let timer: ReturnType<typeof setTimeout> | undefined
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('The endpoint did not read the name in time')),
      NAME_READ_LIMIT_MS
    )
  })
  try {
    return await Promise.race([reader.resolveName(normalized), limit])
  } finally {
    clearTimeout(timer)
    reader.destroy()
  }
}

/**
 * Resolves a name to an address on mainnet, the empty string where nothing
 * resolves. An endpoint that throws or runs out of time hands the read to the
 * next one; an answer of no address is final.
 */
export const resolveMainnetName = async (
  name: string,
  readerOf: NameReaderFactory = mainnetNameReader
): Promise<string> => {
  let normalized: string
  try {
    normalized = normalize(name)
  } catch {
    return ''
  }
  return MAINNET_NAME_RPC_URLS.reduce<Promise<string | null>>(
    (previous, rpcUrl) => previous.catch(() => readNameOn(normalized, rpcUrl, readerOf)),
    Promise.reject(new Error('No endpoint read the name yet'))
  ).then(
    (address) => address ?? '',
    () => ''
  )
}
