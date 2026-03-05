/* eslint-disable react/jsx-no-useless-fragment */
import React, { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, View, ViewStyle } from 'react-native'
import { useModalize } from 'react-native-modalize'

import DownArrowIcon from '@common/assets/svg/DownArrowIcon'
import EditPenIcon from '@common/assets/svg/EditPenIcon'
import UpArrowIcon from '@common/assets/svg/UpArrowIcon'
import BottomSheet from '@common/components/BottomSheet'
import Button from '@common/components/Button'
import Dialog from '@common/components/Dialog'
import DialogButton from '@common/components/Dialog/DialogButton'
import DialogFooter from '@common/components/Dialog/DialogFooter'
import NetworkIcon from '@common/components/NetworkIcon'
import Text from '@common/components/Text'
import useRoute from '@common/hooks/useRoute'
import useTheme from '@common/hooks/useTheme'
import { ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import { THEME_TYPES } from '@common/styles/themeConfig'
import flexbox from '@common/styles/utils/flexbox'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import NetworkForm from '@web/modules/settings/screens/NetworksSettingsScreen/NetworkForm'

import getStyles from './styles'

type Props = {
  name: string
  iconUrls?: string[]
  selectedRpcUrl: string
  rpcUrls: string[]
  chainId: bigint | string
  explorerUrl: string
  nativeAssetSymbol: string
  nativeAssetName: string
  allowRemoveNetwork?: boolean
  autoOpenEditForm?: boolean
  style?: ViewStyle
  type?: 'vertical' | 'horizontal'
}

const NetworkDetails = ({
  name,
  iconUrls = [],
  selectedRpcUrl,
  rpcUrls,
  chainId,
  explorerUrl,
  nativeAssetSymbol,
  nativeAssetName,
  allowRemoveNetwork,
  autoOpenEditForm,
  style,
  type = 'horizontal'
}: Props) => {
  const { t } = useTranslation()
  const { theme, styles, themeType } = useTheme(getStyles)
  const { dispatch } = useBackgroundService()
  const { statuses, allNetworks } = useNetworksControllerState()
  const { ref: dialogRef, open: openDialog, close: closeDialog } = useModalize()

  const { pathname } = useRoute()
  const { ref: sheetRef, open: openBottomSheet, close: closeBottomSheet } = useModalize()
  const [showAllRpcUrls, setShowAllRpcUrls] = useState(false)
  const isEmpty = useMemo(
    () => [name, rpcUrls[0], chainId].some((p) => p === '-'),
    [chainId, name, rpcUrls]
  )

  const networkData = useMemo(
    () => allNetworks.find((network) => network.chainId.toString() === chainId.toString()),
    [allNetworks, chainId]
  )

  const shouldDisplayEditButton = useMemo(
    () => pathname?.includes(ROUTES.networksSettings) && !isEmpty,
    [pathname, isEmpty]
  )

  const shouldDisplayDisableButton = useMemo(
    () =>
      pathname?.includes(ROUTES.networksSettings) &&
      !isEmpty &&
      allowRemoveNetwork &&
      String(chainId) !== '1',
    [pathname, isEmpty, allowRemoveNetwork, chainId]
  )

  const updateNetworkDisabled = useCallback(() => {
    if (statuses.updateNetwork !== 'INITIAL') return
    dispatch({
      type: 'MAIN_CONTROLLER_UPDATE_NETWORK',
      params: {
        chainId: BigInt(chainId),
        network: {
          disabled: !networkData?.disabled
        }
      }
    })
    closeDialog()
  }, [chainId, closeDialog, dispatch, networkData?.disabled, statuses.updateNetwork])

  const toggleNetworkDisabled = useCallback(() => {
    if (networkData?.disabled) {
      updateNetworkDisabled()
    } else {
      openDialog()
    }
  }, [networkData?.disabled, openDialog, updateNetworkDisabled])

  const renderInfoItem = useCallback(
    (title: string, value: string, withBottomSpacing = true) => {
      return (
        <View
          style={[
            type === 'horizontal' && flexbox.directionRow,
            type === 'horizontal' && flexbox.alignCenter,
            !!withBottomSpacing && (type === 'vertical' ? spacings.mbSm : spacings.mbMd)
          ]}
        >
          <Text
            fontSize={14}
            appearance="tertiaryText"
            style={[type === 'horizontal' ? spacings.mr : {}]}
            numberOfLines={1}
          >
            {title}
          </Text>
          <View
            style={[
              flexbox.directionRow,
              flexbox.alignCenter,
              flexbox.flex1,
              type === 'horizontal' && flexbox.justifyEnd
            ]}
          >
            {title === 'Network Name' && value !== '-' && (
              <View style={spacings.mrMi}>
                <NetworkIcon
                  key={name.toLowerCase() as any}
                  id={chainId.toString()}
                  name={name}
                  uris={iconUrls.length ? iconUrls : undefined}
                  size={type === 'vertical' ? 26 : 32}
                />
              </View>
            )}
            <Text
              fontSize={14}
              appearance={value === 'Invalid Chain ID' ? 'errorText' : 'primaryText'}
              numberOfLines={1}
              selectable
            >
              {value}
            </Text>
          </View>
        </View>
      )
    },
    [name, iconUrls, chainId, type]
  )

  const sortedRpcUrls = useMemo(
    () => [selectedRpcUrl, ...rpcUrls.filter((u) => u !== selectedRpcUrl)],
    [rpcUrls, selectedRpcUrl]
  )

  const showMoreRpcUrlsButton = useMemo(() => {
    return sortedRpcUrls.length > 1 ? (
      <Pressable
        style={[
          spacings.ptMi,
          flexbox.directionRow,
          flexbox.alignCenter,
          type === 'horizontal' && spacings.mbMi
        ]}
        onPress={() => setShowAllRpcUrls((p) => !p)}
      >
        <Text
          style={spacings.mrMi}
          fontSize={12}
          color={themeType === THEME_TYPES.DARK ? theme.linkText : theme.featureDecorative}
          underline
        >
          {!showAllRpcUrls &&
            t('show {{number}} more', {
              number: sortedRpcUrls.length - 1
            })}
          {!!showAllRpcUrls &&
            t('hide {{number}} urls', {
              number: sortedRpcUrls.length - 1
            })}
        </Text>
        {!!showAllRpcUrls && (
          <UpArrowIcon
            width={12}
            height={6}
            color={themeType === THEME_TYPES.DARK ? theme.linkText : theme.featureDecorative}
            strokeWidth="1.7"
          />
        )}
        {!showAllRpcUrls && (
          <DownArrowIcon
            width={12}
            height={6}
            color={themeType === THEME_TYPES.DARK ? theme.linkText : theme.featureDecorative}
            strokeWidth="1.7"
          />
        )}
      </Pressable>
    ) : null
  }, [showAllRpcUrls, sortedRpcUrls.length, t, theme, type, themeType])

  const renderRpcUrlsItem = useCallback(() => {
    return (
      <View
        style={[
          type === 'horizontal' && flexbox.directionRow,
          type === 'vertical' ? spacings.mbSm : spacings.mbMd
        ]}
      >
        <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]}>
          <Text
            fontSize={type === 'horizontal' ? 14 : 16}
            appearance="tertiaryText"
            style={[spacings.mr]}
            numberOfLines={1}
          >
            {t(`RPC URL${sortedRpcUrls.length ? '(s)' : ''}`)}
          </Text>
          {type === 'vertical' && showMoreRpcUrlsButton}
        </View>
        <View style={[flexbox.flex1, type === 'horizontal' && flexbox.alignEnd]}>
          {!showAllRpcUrls ? (
            <Text fontSize={14} appearance="primaryText" numberOfLines={1} selectable>
              {sortedRpcUrls[0]}
            </Text>
          ) : (
            sortedRpcUrls.map((rpcUrl: string, i) => (
              <Text
                key={rpcUrl}
                fontSize={14}
                appearance={i === 0 ? 'primaryText' : 'secondaryText'}
                weight={i === 0 ? 'regular' : 'light'}
                numberOfLines={1}
                style={i !== sortedRpcUrls.length - 1 && spacings.mbMi}
                selectable
              >
                {rpcUrl}
              </Text>
            ))
          )}
          {type === 'horizontal' && showMoreRpcUrlsButton}
        </View>
      </View>
    )
  }, [showAllRpcUrls, t, type, sortedRpcUrls, showMoreRpcUrlsButton])

  return (
    <>
      <View style={[styles.container, shouldDisplayEditButton && spacings.ptSm, style]}>
        <View
          style={[
            flexbox.directionRow,
            flexbox.alignCenter,
            type === 'vertical' ? spacings.mbSm : spacings.mbMd
          ]}
        >
          <Text
            fontSize={18}
            weight="medium"
            style={[flexbox.flex1, spacings.mrTy]}
            numberOfLines={1}
          >
            {t('Network details')}
          </Text>
          {!!shouldDisplayEditButton && (
            <Button
              style={[{ maxHeight: 32 }, !!shouldDisplayDisableButton && spacings.mrTy]}
              text={t('Edit')}
              type="secondary"
              onPress={openBottomSheet as any}
              hasBottomSpacing={false}
            >
              <View style={spacings.plTy}>
                <EditPenIcon width={12} height={12} color={theme.primary} />
              </View>
            </Button>
          )}
          {!!shouldDisplayDisableButton && (
            <Button
              style={{ maxHeight: 32 }}
              disabled={statuses.updateNetwork !== 'INITIAL'}
              text={!networkData?.disabled ? t('Disable') : t('Enable')}
              testID="disable-network-btn" // @TODO
              type={!networkData?.disabled ? 'danger' : 'primary'}
              onPress={() => {
                if (!chainId || !allowRemoveNetwork) return

                toggleNetworkDisabled()
              }}
              hasBottomSpacing={false}
            />
          )}
          {}
        </View>
        <View style={flexbox.flex1}>
          {renderInfoItem(t('Network Name'), name)}
          {renderRpcUrlsItem()}
          {renderInfoItem(t('Chain ID'), chainId.toString())}
          {renderInfoItem(t('Currency Symbol'), nativeAssetSymbol)}
          {renderInfoItem(t('Currency Name'), nativeAssetName)}
          {renderInfoItem(t('Block Explorer URL'), explorerUrl, false)}
        </View>
      </View>
      <Dialog
        dialogRef={dialogRef}
        id="disable-network"
        title={t(`Disable ${name}`)}
        text={t(
          `Are you sure you want to disable ${name}? Any assets associated with this network will no longer be visible in your wallet.`
        )}
        closeDialog={closeDialog}
      >
        <DialogFooter horizontalAlignment="justifyEnd">
          <DialogButton text={t('Close')} type="secondary" onPress={() => closeDialog()} />
          <DialogButton
            style={spacings.ml}
            text={t('Disable')}
            testID="disable-network-confirm-btn"
            type="danger"
            onPress={updateNetworkDisabled}
          />
        </DialogFooter>
      </Dialog>
      <BottomSheet
        id="edit-network-bottom-sheet"
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
        autoOpen={autoOpenEditForm}
      >
        <NetworkForm
          selectedChainId={chainId.toString()}
          onCancel={closeBottomSheet}
          onSaved={closeBottomSheet}
        />
      </BottomSheet>
    </>
  )
}

export default React.memo(NetworkDetails)
