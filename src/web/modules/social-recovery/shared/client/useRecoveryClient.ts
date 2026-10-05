/**
 * The hook that hands a screen the recovery kit client for one account, built
 * over the extension's own provider for the one chain this build reads, with
 * the balance and gas reads and the receipt wait on the same provider beside
 * it.
 *
 * Called with no facts, the client takes the listed account's own
 * (`clientFactsOf`, `creationPrivilegesOf`): a smart account's creation
 * record, associated keys and creation privileges, so the removed-key read can
 * name the key; a basic account gives none.
 *
 * A refused digest version comes back as the `update-the-wallet` state the
 * account step draws; any other failure as `failed`, with `retry`, never as an
 * empty answer.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import type { Address } from '@web/modules/social-recovery/sdk-interfaces'

import { clientFactsOf, creationPrivilegesOf } from './account-facts'
import { addressBookOf, sameAddress } from './addresses'
import { buildRecoveryClient, isDigestVersionRefusal } from './build-client'
import { createChainReads } from './chain-reads'
import { CHAIN_IDS, WALLET_RECOVERY_CHAIN } from './chains'
import { extensionProviderFor, networkOf, providerKeyOf } from './extension-provider'
import { createCodeRead, createProviderAdapter } from './provider-adapter'
import { createReceiptWait } from './receipts'
import type { AccountFacts, ExtensionProvider, RecoveryClientState } from './types'

export type { RecoveryClientState }

const LOADING: RecoveryClientState = { status: 'loading' }

/** Every input the effect builds from, as one key. */
const buildKeyOf = (
  account: Address | undefined,
  networkKey: string,
  factsKey: string,
  attempt: number
): string => JSON.stringify([account ?? null, networkKey, factsKey, attempt])

export const useRecoveryClient = (
  account: Address | undefined,
  given?: AccountFacts
): RecoveryClientState & { retry: () => void } => {
  const { networks } = useNetworksControllerState()
  const { accounts } = useAccountsControllerState()
  // With no facts given, the client takes the listed account's own.
  const listed = account
    ? accounts?.find((candidate) => sameAddress(candidate.addr, account))
    : undefined
  const facts =
    given ?? (listed ? { ...clientFactsOf(listed), ...creationPrivilegesOf(listed) } : {})
  const network = networkOf(networks, WALLET_RECOVERY_CHAIN)
  const networkRef = useRef(network)
  networkRef.current = network
  // A change to any field the provider is built from rebuilds the provider
  // and the client; the effect's cleanup releases the previous provider's
  // receipt waits and destroys that provider first.
  const networkKey = network ? providerKeyOf(network) : networks ? 'missing' : 'loading'
  const factsRef = useRef(facts)
  factsRef.current = facts
  // Until the wallet pushed its accounts, the listed account's facts are not
  // known, and the client waits for them rather than build without them.
  const factsKey = !given && !accounts ? 'loading' : JSON.stringify(facts)
  const [attempt, setAttempt] = useState(0)
  const buildKey = buildKeyOf(account, networkKey, factsKey, attempt)
  const [stored, setStored] = useState<{ key: string; state: RecoveryClientState }>({
    key: buildKey,
    state: LOADING
  })

  useEffect(() => {
    const key = buildKeyOf(account, networkKey, factsKey, attempt)
    const setState = (next: RecoveryClientState) => setStored({ key, state: next })
    const current = networkRef.current
    if (!account || networkKey === 'loading' || factsKey === 'loading') {
      setState(LOADING)
      return undefined
    }
    if (!current) {
      setState({
        status: 'failed',
        error: new Error(
          `The extension holds no network for chain ${CHAIN_IDS[WALLET_RECOVERY_CHAIN]}.`
        )
      })
      return undefined
    }
    let provider: ExtensionProvider
    try {
      provider = extensionProviderFor(current)
    } catch (error: unknown) {
      // `getRpcProvider` refuses a record with no usable RPC URL, or a provider
      // kind it does not know or the chain does not support.
      setState({ status: 'failed', error })
      return undefined
    }
    let live = true
    const release = new AbortController()
    setState(LOADING)
    buildRecoveryClient({
      ...factsRef.current,
      chain: WALLET_RECOVERY_CHAIN,
      account,
      addressBook: addressBookOf(WALLET_RECOVERY_CHAIN),
      provider: createProviderAdapter(provider),
      codeRead: createCodeRead(provider)
    })
      .then((client) => {
        if (live) {
          setState({
            status: 'ready',
            client,
            reads: createChainReads(provider),
            receipts: createReceiptWait(provider, { signal: release.signal })
          })
        }
      })
      .catch((error: unknown) => {
        if (!live) {
          return
        }
        setState(
          isDigestVersionRefusal(error)
            ? { status: 'update-the-wallet', refusal: error }
            : { status: 'failed', error }
        )
      })
    return () => {
      live = false
      release.abort()
      provider.destroy()
    }
  }, [account, networkKey, factsKey, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  // After an input changes, the render comes before the effect, and the same
  // commit destroys the stored client's provider: a state stored for other
  // inputs reads as loading.
  const state = stored.key === buildKey ? stored.state : LOADING
  return { ...state, retry }
}
