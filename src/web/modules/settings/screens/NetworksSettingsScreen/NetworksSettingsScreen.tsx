import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useModalize } from 'react-native-modalize'

// import AddIcon from '@common/assets/svg/AddIcon'
// import ChainlistIcon from '@common/assets/svg/ChainlistIcon'
// import Button from '@common/components/Button'
import BottomSheet from '@common/components/BottomSheet'
import ScrollableWrapper from '@common/components/ScrollableWrapper'
import Search from '@common/components/Search'
import Text from '@common/components/Text'
import useRoute from '@common/hooks/useRoute'
import useTheme from '@common/hooks/useTheme'
import useWindowSize from '@common/hooks/useWindowSize'
import spacings from '@common/styles/spacings'
import { THEME_TYPES } from '@common/styles/themeConfig'
import flexbox from '@common/styles/utils/flexbox'
import text from '@common/styles/utils/text'
import NetworkAvailableFeatures from '@web/components/NetworkAvailableFeatures'
import NetworkDetails from '@web/components/NetworkDetails'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import SettingsPageHeader from '@web/modules/settings/components/SettingsPageHeader'
import { SettingsRoutesContext } from '@web/modules/settings/contexts/SettingsRoutesContext'
import Network from '@web/modules/settings/screens/NetworksSettingsScreen/Network'
import NetworkForm from '@web/modules/settings/screens/NetworksSettingsScreen/NetworkForm'

const NetworksSettingsScreen = () => {
  const { t } = useTranslation()
  const { search: searchParams } = useRoute()
  const { control, watch } = useForm({ defaultValues: { search: '' } })
  const { ref: sheetRef, close: closeBottomSheet } = useModalize()
  const { maxWidthSize } = useWindowSize()
  const { allNetworks } = useNetworksControllerState()

  const { setCurrentSettingsPage } = useContext(SettingsRoutesContext)
  const { theme, themeType } = useTheme()
  const [selectedChainId, setSelectedChainId] = useState(() => {
    const parsedSearchParams = new URLSearchParams(searchParams)
    if (parsedSearchParams.has('chainId'))
      return BigInt(parsedSearchParams.get('chainId') as string)

    return undefined
  })

  const shouldOpenBottomSheet = useMemo(() => {
    const parsedSearchParams = new URLSearchParams(searchParams)

    return parsedSearchParams.has('addNetwork')
  }, [searchParams])

  const shouldAutoOpenEditForm = useMemo(() => {
    const parsedSearchParams = new URLSearchParams(searchParams)

    return parsedSearchParams.has('chainId') && parsedSearchParams.has('openEditForm')
  }, [searchParams])

  const selectedNetwork = useMemo(
    () => allNetworks.find((n) => n.chainId === selectedChainId),
    [allNetworks, selectedChainId]
  )

  const search = watch('search')

  useEffect(() => {
    setCurrentSettingsPage('networks')
  }, [setCurrentSettingsPage])

  const filteredNetworkBySearch = useMemo(
    () =>
      allNetworks.filter((network) => network.name.toLowerCase().includes(search.toLowerCase())),
    [allNetworks, search]
  )

  const filteredEnabledNetworks = useMemo(
    () => filteredNetworkBySearch.filter((network) => !network.disabled),
    [filteredNetworkBySearch]
  )

  const filteredDisabledNetworks = useMemo(
    () => filteredNetworkBySearch.filter((network) => network.disabled),
    [filteredNetworkBySearch]
  )

  const handleSelectNetwork = useCallback((chainId: bigint) => {
    setSelectedChainId(chainId)
  }, [])

  return (
    <>
      <SettingsPageHeader title={t('Networks')} />
      <View style={[flexbox.directionRow, flexbox.flex1]}>
        <View style={[{ flex: 1 }]}>
          <Search
            placeholder={t('Search for network')}
            control={control}
            containerStyle={spacings.mb}
            autoFocus
          />
          <ScrollableWrapper contentContainerStyle={{ flexGrow: 1 }}>
            {filteredNetworkBySearch.length > 0 ? (
              <>
                {filteredEnabledNetworks.length > 0 && (
                  <View style={spacings.mb}>
                    {filteredEnabledNetworks.map((network) => (
                      <Network
                        key={network.chainId.toString()}
                        network={network}
                        selectedChainId={selectedChainId}
                        handleSelectNetwork={handleSelectNetwork}
                      />
                    ))}
                  </View>
                )}
                {filteredDisabledNetworks.length > 0 && (
                  <>
                    <Text weight="medium" fontSize={16} style={[spacings.mbTy]}>
                      {t('Disabled networks')}
                    </Text>

                    {filteredDisabledNetworks.map((network) => (
                      <Network
                        key={network.chainId.toString()}
                        network={network}
                        selectedChainId={selectedChainId}
                        handleSelectNetwork={handleSelectNetwork}
                      />
                    ))}
                  </>
                )}
              </>
            ) : (
              <View style={[flexbox.flex1, flexbox.alignCenter, flexbox.justifyCenter]}>
                <Text weight="regular" fontSize={14} style={[text.center]}>
                  {t('No networks found.')}
                </Text>
                <Text weight="regular" fontSize={14} style={[text.center]}>
                  {t('Try searching for a different network.')}
                </Text>
              </View>
            )}
          </ScrollableWrapper>
          <View style={spacings.pt}>
            {/*
              <Button
                type="primary"
                size="small"
                text={t('Add network from Chainlist')}
                testID="add-network-from-chainlist"
                onPress={navigateToChainlist}
                style={{ height: 48, ...spacings.mbTy }}
                childrenPosition="left"
              >
                <ChainlistIcon width={20} height={20} color={theme.primary} style={spacings.mrTy} />
              </Button>
              <Button
                type="secondary"
                size="small"
                text={t('Add network manually')}
                testID="add-network-manually"
                onPress={openBottomSheet as any}
                hasBottomSpacing={false}
                style={{ height: 48 }}
                childrenPosition="left"
              >
                <AddIcon color={theme.primary} style={spacings.mrTy} />
              </Button>
            */}
            <View
              style={[
                {
                  borderWidth: 1,
                  borderRadius: 12,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderColor: themeType === THEME_TYPES.DARK ? '#6b4a00' : '#ffe08a',
                  backgroundColor: themeType === THEME_TYPES.DARK ? '#2b210e' : '#fff7d6'
                }
              ]}
            >
              <Text
                weight="medium"
                fontSize={14}
                style={[
                  text.center,
                  { color: themeType === THEME_TYPES.DARK ? '#ffd166' : '#7a5a00' }
                ]}
              >
                {t('sepolia testnet ONLY, ethereum mainnet support coming soon')}
              </Text>
            </View>
          </View>
        </View>

        <View
          style={[
            { flex: 2 },
            maxWidthSize('xl') ? spacings.plXl : spacings.plLg,
            maxWidthSize('xl') ? spacings.mlXl : spacings.mlLg,
            { borderLeftWidth: 1, borderColor: theme.secondaryBorder }
          ]}
        >
          <ScrollableWrapper contentContainerStyle={{ flexGrow: 1 }}>
            <View style={spacings.mb}>
              <NetworkDetails
                name={selectedNetwork?.name || '-'}
                chainId={selectedNetwork?.chainId || '-'}
                rpcUrls={selectedNetwork?.rpcUrls || ['-']}
                selectedRpcUrl={selectedNetwork?.selectedRpcUrl || '-'}
                nativeAssetSymbol={selectedNetwork?.nativeAssetSymbol || '-'}
                nativeAssetName={selectedNetwork?.nativeAssetName || '-'}
                explorerUrl={selectedNetwork?.explorerUrl || '-'}
                allowRemoveNetwork
                autoOpenEditForm={shouldAutoOpenEditForm}
              />
            </View>
            {!!selectedNetwork && !!selectedChainId && (
              <NetworkAvailableFeatures
                features={selectedNetwork.features}
                chainId={selectedChainId}
              />
            )}
          </ScrollableWrapper>
        </View>
      </View>
      <BottomSheet
        id="add-new-network"
        sheetRef={sheetRef}
        closeBottomSheet={closeBottomSheet}
        scrollViewProps={{
          scrollEnabled: false,
          contentContainerStyle: { flex: 1 }
        }}
        containerInnerWrapperStyles={{ flex: 1 }}
        backgroundColor={
          themeType === THEME_TYPES.DARK ? 'secondaryBackground' : 'primaryBackground'
        }
        style={{ ...spacings.ph0, ...spacings.pv0, overflow: 'hidden' }}
        autoOpen={shouldOpenBottomSheet}
      >
        <NetworkForm onCancel={closeBottomSheet} onSaved={closeBottomSheet} />
      </BottomSheet>
    </>
  )
}

export default React.memo(NetworksSettingsScreen)
