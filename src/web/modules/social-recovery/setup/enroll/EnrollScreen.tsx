/**
 * The enroll route: the settings chrome around the enroll view for the
 * selected account on the recovery chain, with the page's own helpers the
 * view uses: the ceremony's report channel, the name resolution, the chain
 * reads over the extension's provider, the keystore's keys and the request
 * queue that signs a guardian's test on this device.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { useLocation } from 'react-router-dom'
import { isAddress } from 'viem'

import type { MinNetworkConfig } from '@ambire-common/services/provider'
import { resolveENSDomain } from '@ambire-common/services/ensDomains'
import AmbireLogoHorizontal from '@common/components/AmbireLogoHorizontal'
import Panel from '@common/components/Panel'
import { getPanelPaddings } from '@common/components/Panel/Panel'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useNavigation from '@common/hooks/useNavigation'
import useTheme from '@common/hooks/useTheme'
import useWindowSize from '@common/hooks/useWindowSize'
import spacings from '@common/styles/spacings'
import common from '@common/styles/utils/common'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useKeystoreControllerState from '@web/hooks/useKeystoreControllerState'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import Sidebar from '@web/modules/settings/components/Sidebar'
import getStyles from '@web/modules/settings/contexts/SettingsRoutesContext/styles'
import {
  browserReportStore,
  browserReportSubscribe,
  pagePasskeysServed,
  pagePlatform
} from '@web/modules/social-recovery/shared/ceremony/screen'
import {
  CHAIN_IDS,
  createSignerFacade,
  extensionProviderFor,
  networkOf,
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
import { getRpcProviderForUI } from '@web/services/provider'

import { browserClipboard, saveChallengeFile } from './carriers'
import { guardianChainOf } from './chain'
import EnrollView from './EnrollView'
import { parseEnrollSearch } from './search'
import type { EnrollClient, EnrollDeps, GuardianChain, HeldKey } from './types'

const randomBytes = (length: number): Uint8Array =>
  globalThis.crypto.getRandomValues(new Uint8Array(length))

const EnrollScreen = () => {
  const { t } = useTranslation()
  const { styles } = useTheme(getStyles)
  const { maxWidthSize } = useWindowSize()
  const { navigate } = useNavigation()
  const location = useLocation()
  const { account: selected } = useSelectedAccountControllerState()
  const { accounts } = useAccountsControllerState()
  const { keys } = useKeystoreControllerState()
  const { networks } = useNetworksControllerState()
  const { dispatch, windowId } = useBackgroundService()

  const isScreenXxl = maxWidthSize('xxl')
  const isScreenXl = maxWidthSize('xl')

  // The selected account arrives from the background's state push.
  const account = selected && isAddress(selected.addr) ? selected.addr : undefined
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

  const deps = useMemo<EnrollDeps>(
    () => ({
      passkeysServed: pagePasskeysServed(),
      platform: pagePlatform(),
      reportStore: browserReportStore,
      reportSubscribe: browserReportSubscribe,
      newRequestId: newCeremonyRequestId,
      now: Date.now,
      randomBytes,
      resolveName: (name: string) =>
        resolveENSDomain(name, undefined, (config: MinNetworkConfig) =>
          getRpcProviderForUI(config, dispatch)
        ),
      chain,
      keys: heldKeys,
      signTypedData: (key, typedData, options) => signer.signTypedData(key, typedData, options),
      readClipboard: browserClipboard(),
      saveFile: saveChallengeFile
    }),
    [dispatch, chain, heldKeys, signer]
  )

  return (
    <View style={styles.background}>
      <View style={[styles.container, !isScreenXl ? common.fullWidth : {}]}>
        <Sidebar activeLink="account-recovery" />
        <View style={styles.contentContainer}>
          <View style={styles.header}>
            <AmbireLogoHorizontal />
          </View>
          <Panel
            style={[
              styles.panel,
              !isScreenXl ? common.fullWidth : {},
              { ...spacings.ph0, ...spacings.pv0 }
            ]}
          >
            <ScrollView contentContainerStyle={getPanelPaddings(maxWidthSize, 'large')}>
              <Text fontSize={12} appearance="secondaryText" style={spacings.mbSm}>
                {t('socialRecovery.chrome.breadcrumb')}
              </Text>
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
            </ScrollView>
          </Panel>
        </View>
        {isScreenXxl ? (
          <View style={styles.sideContainer}>
            <Sidebar activeLink="account-recovery" />
          </View>
        ) : null}
      </View>
    </View>
  )
}

export default React.memo(EnrollScreen)
