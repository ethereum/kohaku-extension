/**
 * The review's route: the settings chrome around the review of the selected
 * account's setup records, with the recovery client that reads the trust list
 * and the provider kind of the recovery chain's network.
 */
import React, { useMemo } from 'react'
import { ScrollView, View } from 'react-native'
import { isAddress } from 'viem'

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
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import Sidebar from '@web/modules/settings/components/Sidebar'
import getStyles from '@web/modules/settings/contexts/SettingsRoutesContext/styles'
import {
  CHAIN_IDS,
  networkOf,
  WALLET_RECOVERY_CHAIN
} from '@web/modules/social-recovery/shared/client'
import { useRecoveryClient } from '@web/modules/social-recovery/shared/client/useRecoveryClient'
import {
  createWalletRecords,
  extensionRecordStorage
} from '@web/modules/social-recovery/shared/records'

import ReviewView from './ReviewView'
import type { ReviewClient } from './types'

const ReviewScreen = () => {
  const { t } = useTranslation()
  const { styles } = useTheme(getStyles)
  const { maxWidthSize } = useWindowSize()
  const { navigate } = useNavigation()
  const { account: selected } = useSelectedAccountControllerState()
  const { networks } = useNetworksControllerState()

  const isScreenXxl = maxWidthSize('xxl')
  const isScreenXl = maxWidthSize('xl')
  const records = useMemo(() => createWalletRecords({ storage: extensionRecordStorage }), [])

  // The selected account arrives from the background's state push.
  const account = selected && isAddress(selected.addr) ? selected.addr : undefined
  const accountLabel = selected?.preferences?.label || undefined
  const providerKind = networkOf(networks, WALLET_RECOVERY_CHAIN)?.rpcProvider
  const clientState = useRecoveryClient(account)

  const { status, retry } = clientState
  const kit = clientState.status === 'ready' ? clientState.client : null
  const client = useMemo<ReviewClient>(() => {
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
                <ReviewView
                  key={account}
                  records={records}
                  chainId={CHAIN_IDS[WALLET_RECOVERY_CHAIN]}
                  account={account}
                  client={client}
                  providerKind={providerKind}
                  accountLabel={accountLabel}
                  navigate={navigate}
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

export default React.memo(ReviewScreen)
