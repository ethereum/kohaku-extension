import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useModalize } from 'react-native-modalize'
import { useSearchParams } from 'react-router-dom'

import AddIcon from '@common/assets/svg/AddIcon'
import BackButton from '@common/components/BackButton'
import Button from '@common/components/Button'
import Input from '@common/components/Input'
import useNavigation from '@common/hooks/useNavigation/useNavigation.web'
import useTheme from '@common/hooks/useTheme'
import useToast from '@common/hooks/useToast'
import Header from '@common/modules/header/components/Header'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import {
  TabLayoutContainer,
  tabLayoutWidths,
  TabLayoutWrapperMainContent
} from '@web/components/TabLayoutWrapper/TabLayoutWrapper'
import { createTab } from '@web/extension-services/background/webapi/tab'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import Networks from '@web/modules/networks/components/Networks'

import AddNetworkBottomSheet from '../components/AddNetworkBottomSheet'
import AllNetworksOption from '../components/AllNetworksOption/AllNetworksOption'
import NetworkBottomSheet, {
  NO_BLOCK_EXPLORER_AVAILABLE_TOOLTIP
} from '../components/NetworkBottomSheet'

const NetworksScreen = () => {
  const { t } = useTranslation()
  const { addToast } = useToast()
  const { dispatch } = useBackgroundService()
  const { navigate } = useNavigation()
  const { theme } = useTheme()
  const { account, dashboardNetworkFilter } = useSelectedAccountControllerState()
  const [settingsChainId, setSettingsChainId] = useState<bigint | string | null>(null)
  const [searchParams] = useSearchParams()
  const [changedNetwork, setChangedNetwork] = useState<undefined | null | bigint | string>(
    undefined
  )

  const {
    ref: settingsBottomSheetRef,
    open: openSettingsBottomSheet,
    close: closeSettingsBottomSheet
  } = useModalize()
  const {
    ref: addNetworkBottomSheetRef,
    open: openAddNetworkBottomSheet,
    close: closeAddNetworkBottomSheet
  } = useModalize()
  const [search, setSearch] = useState('')

  // Navigate back to the dashboard only if `dashboardNetworkFilter` is already set in SelectedAccountControllerState.
  // Otherwise, a race condition occurs, and we navigate to the dashboard faster than `dashboardNetworkFilter` is set,
  // causing the dashboard to display data for the previous `dashboardNetworkFilter` for a brief moment.
  useEffect(() => {
    if (changedNetwork === dashboardNetworkFilter) {
      const prevSearchParams = searchParams.get('prevSearchParams')
      const url = prevSearchParams
        ? `${WEB_ROUTES.dashboard}?${decodeURIComponent(prevSearchParams)}`
        : WEB_ROUTES.dashboard

      navigate(url)
    }
  }, [changedNetwork, dashboardNetworkFilter, searchParams, navigate])

  const handleChangeNetwork = useCallback(
    (chainId: bigint | string | null) => {
      dispatch({
        type: 'SELECTED_ACCOUNT_SET_DASHBOARD_NETWORK_FILTER',
        params: { dashboardNetworkFilter: chainId }
      })
      setChangedNetwork(chainId)
    },
    [dispatch, setChangedNetwork]
  )

  const handleOpenSettingsBottomSheet = useCallback(
    (chainId: bigint | string) => {
      setSettingsChainId(chainId)
      openSettingsBottomSheet()
    },
    [openSettingsBottomSheet]
  )

  const handleCloseSettingsBottomSheet = useCallback(() => {
    setSettingsChainId(null)
    closeSettingsBottomSheet()
  }, [closeSettingsBottomSheet])

  const handleOpenAddNetworkBottomSheet = useCallback(() => {
    openAddNetworkBottomSheet()
  }, [openAddNetworkBottomSheet])

  const openBlockExplorer = useCallback(
    async (url?: string) => {
      if (!url) {
        addToast(NO_BLOCK_EXPLORER_AVAILABLE_TOOLTIP, {
          type: 'info'
        })
        return
      }

      try {
        await createTab(`${url}/address/${account?.addr}`)
      } catch {
        addToast(t('Failed to open block explorer in a new tab.'), {
          type: 'info'
        })
      }
    },
    [account?.addr, addToast, t]
  )

  return (
    <TabLayoutContainer
      // header={<Header customTitle="Networks" withAmbireLogo backgroundColor="transparent" />}
      header={<Header customTitle="Networks" withAmbireLogo backgroundColor="transparent" />}
      // footer={<BackButton />}
      width="lg"
      hideFooterInPopup
    >
      <View style={[flexbox.flex1, spacings.pb, { maxWidth: 656, marginHorizontal: 'auto' }]}>
        <TabLayoutWrapperMainContent>
          <NetworkBottomSheet
            chainId={settingsChainId}
            sheetRef={settingsBottomSheetRef}
            closeBottomSheet={handleCloseSettingsBottomSheet}
            openBlockExplorer={openBlockExplorer}
          />
          <AddNetworkBottomSheet
            sheetRef={addNetworkBottomSheetRef}
            closeBottomSheet={closeAddNetworkBottomSheet}
          />
          <Input
            autoFocus
            containerStyle={spacings.mb}
            value={search}
            onChangeText={setSearch}
            placeholder={t('Search for network')}
          />
          <AllNetworksOption onPress={handleChangeNetwork} />
          <Networks
            search={search}
            openBlockExplorer={openBlockExplorer}
            openSettingsBottomSheet={handleOpenSettingsBottomSheet}
            onPress={handleChangeNetwork}
          />
        </TabLayoutWrapperMainContent>
        <View
          style={[spacings.ptSm, flexbox.directionRow, flexbox.justifyCenter, { width: '100%' }]}
        >
          <BackButton />
          <Button
            text={t('Add New Network')}
            // type="secondary"
            type="primary"
            hasBottomSpacing={false}
            // style={{ maxWidth: tabLayoutWidths.lg, ...flexbox.alignSelfCenter, width: '100%' }}
            style={{ ...flexbox.alignSelfCenter, ...spacings.ml }}
            childrenPosition="left"
            onPress={handleOpenAddNetworkBottomSheet}
          >
            <AddIcon color={theme.primary} style={spacings.mrTy} />
          </Button>
        </View>
      </View>
    </TabLayoutContainer>
  )
}

export default React.memo(NetworksScreen)
