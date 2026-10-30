/**
 * The enroll route: the settings chrome around the enroll view for the
 * setup tab's account on the recovery chain, with the page's own helpers the
 * view uses: the ceremony's report channel, the name resolution on mainnet,
 * the chain reads over the extension's provider, the keystore's keys and the
 * request queue that signs a guardian's test on this device.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { isAddress } from 'viem'

import useNavigation from '@common/hooks/useNavigation'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useKeystoreControllerState from '@web/hooks/useKeystoreControllerState'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import {
  browserReportStore,
  browserReportSubscribe,
  pagePasskeysServed,
  pagePlatform
} from '@web/modules/social-recovery/shared/ceremony/screen'
import {
  SETUP_STAGE_COUNTER_KEY,
  SETUP_STAGES
} from '@web/modules/social-recovery/shared/chrome/constants'
import SetupChrome from '@web/modules/social-recovery/shared/chrome/SetupChrome'
import useSetupAccount from '@web/modules/social-recovery/shared/chrome/useSetupAccount'
import {
  CHAIN_IDS,
  createSignerFacade,
  extensionProviderFor,
  networkOf,
  sameAddress,
  signRequestPort,
  WALLET_RECOVERY_CHAIN
} from '@web/modules/social-recovery/shared/client'
import type { ListedAccount } from '@web/modules/social-recovery/shared/client'
import { useRecoveryClient } from '@web/modules/social-recovery/shared/client/useRecoveryClient'
import {
  createWalletRecords,
  extensionRecordStorage,
  newCeremonyRequestId
} from '@web/modules/social-recovery/shared/records'

import { browserClipboard, saveChallengeFile } from './carriers'
import { guardianChainOf } from './chain'
import EnrollView from './EnrollView'
import { resolveMainnetName } from './names'
import { parseEnrollSearch } from './search'
import type { EnrollClient, EnrollDeps, GuardianChain, HeldKey } from './types'

const randomBytes = (length: number): Uint8Array =>
  globalThis.crypto.getRandomValues(new Uint8Array(length))

const EnrollScreen = () => {
  const { navigate } = useNavigation()
  const location = useLocation()
  const { account } = useSetupAccount()
  const { accounts } = useAccountsControllerState()
  const { keys } = useKeystoreControllerState()
  const { networks } = useNetworksControllerState()
  const { dispatch, windowId } = useBackgroundService()

  const clientState = useRecoveryClient(account)
  const records = useMemo(() => createWalletRecords({ storage: extensionRecordStorage }), [])
  const search = useMemo(() => parseEnrollSearch(location.search), [location.search])

  const { status, retry } = clientState
  const kit = clientState.status === 'ready' ? clientState.client : null
  const client = useMemo<EnrollClient>(() => {
    if (kit) {
      return { status: 'ready', client: kit }
    }
    if (status === 'loading') {
      return { status: 'loading' }
    }
    if (status === 'update-the-wallet') {
      return { status: 'update-the-wallet', retry }
    }
    return { status: 'failed', retry }
  }, [kit, status, retry])

  // The provider the chain reads use, rebuilt when the network's RPC changes
  // and destroyed when the screen leaves.
  const network = networkOf(networks, WALLET_RECOVERY_CHAIN)
  const networkRef = useRef(network)
  networkRef.current = network
  const networkKey = network
    ? JSON.stringify([
        network.chainId.toString(),
        network.rpcUrls,
        network.selectedRpcUrl,
        network.rpcProvider ?? 'rpc'
      ])
    : null
  const [chain, setChain] = useState<GuardianChain | null>(null)
  useEffect(() => {
    const current = networkRef.current
    if (!networkKey || !current) {
      setChain(null)
      return undefined
    }
    let provider: ReturnType<typeof extensionProviderFor>
    try {
      provider = extensionProviderFor(current)
    } catch {
      setChain(null)
      return undefined
    }
    setChain(guardianChainOf(provider))
    return () => {
      setChain(null)
      provider.destroy()
    }
  }, [networkKey])

  const accountsRef = useRef<readonly ListedAccount[] | undefined>(accounts)
  accountsRef.current = accounts
  const signer = useMemo(
    () =>
      createSignerFacade(
        signRequestPort(dispatch, () => accountsRef.current, windowId),
        {
          chainId: CHAIN_IDS[WALLET_RECOVERY_CHAIN]
        }
      ),
    [dispatch, windowId]
  )

  const heldKeys = useMemo<HeldKey[]>(
    () =>
      (keys ?? []).flatMap((key) =>
        isAddress(key.addr)
          ? [
              {
                addr: key.addr,
                type: key.type,
                ...(key.type === 'internal' && key.meta?.fromSeedId
                  ? { fromSeedId: key.meta.fromSeedId }
                  : {})
              }
            ]
          : []
      ),
    [keys]
  )

  // The seeds of the keys that control the account, so a guardian from one of
  // them reads as sharing the account's seed and one from another seed does not.
  const ownSeedIds = useMemo(() => {
    const listed = account
      ? accounts?.find((candidate) => sameAddress(candidate.addr, account))
      : undefined
    return heldKeys.flatMap((key) =>
      key.fromSeedId &&
      listed?.associatedKeys.some((associated) => sameAddress(associated, key.addr))
        ? [key.fromSeedId]
        : []
    )
  }, [accounts, account, heldKeys])

  const deps = useMemo<EnrollDeps>(
    () => ({
      passkeysServed: pagePasskeysServed(),
      platform: pagePlatform(),
      reportStore: browserReportStore,
      reportSubscribe: browserReportSubscribe,
      newRequestId: newCeremonyRequestId,
      now: Date.now,
      randomBytes,
      resolveName: resolveMainnetName,
      chain,
      keys: heldKeys,
      ownSeedIds,
      signTypedData: (key, typedData, options) => signer.signTypedData(key, typedData, options),
      readClipboard: browserClipboard(),
      saveFile: saveChallengeFile
    }),
    [chain, heldKeys, ownSeedIds, signer]
  )

  return (
    <SetupChrome
      // An enrollment the management editor opened is no step of the setup.
      counter={
        search?.returnTo
          ? undefined
          : {
              labelKey: SETUP_STAGE_COUNTER_KEY,
              step: 2,
              total: SETUP_STAGES,
              testID: 'enroll-stage'
            }
      }
    >
      {!!account && (
        <EnrollView
          key={account}
          records={records}
          chainId={CHAIN_IDS[WALLET_RECOVERY_CHAIN]}
          account={account}
          navigate={navigate}
          search={search}
          client={client}
          deps={deps}
        />
      )}
    </SetupChrome>
  )
}

export default React.memo(EnrollScreen)
