import React, { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useModalize } from 'react-native-modalize'
import { IHandles } from 'react-native-modalize/lib/options'

import predefinedDapps from '@ambire-common/consts/dappCatalog.json'
import { Dapp } from '@ambire-common/interfaces/dapp'
import { Network } from '@ambire-common/interfaces/network'
import { getDappIdFromUrl } from '@ambire-common/libs/dapps/helpers'
import DeleteIcon from '@common/assets/svg/DeleteIcon'
import BottomSheet from '@common/components/BottomSheet'
import Button from '@common/components/Button'
import Dialog from '@common/components/Dialog'
import DialogButton from '@common/components/Dialog/DialogButton'
import DialogFooter from '@common/components/Dialog/DialogFooter'
import NetworkIcon from '@common/components/NetworkIcon'
import Select from '@common/components/Select'
import Text from '@common/components/Text'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useDappsControllerState from '@web/hooks/useDappsControllerState'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import DappControl from '@web/modules/dapp-catalog/components/DappControl'

import getStyles from './styles'

type Props = {
  dapp: Dapp | null
  isCurrentDapp?: boolean
  sheetRef: React.RefObject<IHandles>
  openBottomSheet: (dest?: 'top' | 'default' | undefined) => void
  closeBottomSheet: (dest?: 'default' | 'alwaysOpen' | undefined) => void
}

type NetworkOption = {
  value: string
  label: JSX.Element
  icon: JSX.Element
}

const ManageDapp = ({
  dapp,
  isCurrentDapp,
  sheetRef,
  openBottomSheet,
  closeBottomSheet
}: Props) => {
  const { styles, theme } = useTheme(getStyles)
  const { t } = useTranslation()
  const { ref: dialogRef, open: openDialog, close: closeDialog } = useModalize()
  const { networks } = useNetworksControllerState()
  const { state } = useDappsControllerState()

  const [network, setNetwork] = useState<Network>(
    networks.filter((n) => Number(n.chainId) === dapp?.chainId)[0] ||
      networks.filter((n) => n.chainId.toString() === '1')[0]
  )
  const { dispatch } = useBackgroundService()

  const networksOptions: NetworkOption[] = useMemo(
    () =>
      networks.map((n) => ({
        value: n.name,
        label: (
          <Text weight="medium" numberOfLines={1}>
            {n.name}
          </Text>
        ),
        icon: <NetworkIcon key={n.chainId.toString()} id={n.chainId.toString()} size={30} />
      })),
    [networks]
  )

  const handleSetNetworkValue = useCallback(
    (networkOption: NetworkOption) => {
      if (dapp?.id) {
        const newNetwork = networks.filter((n) => n.name === networkOption.value)[0]
        setNetwork(newNetwork)
        dispatch({
          type: 'CHANGE_CURRENT_DAPP_NETWORK',
          params: {
            id: dapp.id,
            chainId: Number(newNetwork.chainId)
          }
        })
      }
    },
    [networks, dapp?.id, dispatch]
  )

  const shouldShowRemoveDappFromCatalog = useMemo(() => {
    return (
      !!state.dapps?.find((d) => d.id === dapp?.id) &&
      !predefinedDapps.find((d) => getDappIdFromUrl(d.url) === dapp?.id)
    )
  }, [dapp?.url, state.dapps])

  const promptRemoveDApp = useCallback(() => {
    openDialog()
  }, [openDialog])

  const removeDappFromCatalog = () => {
    dispatch({
      type: 'DAPP_CONTROLLER_REMOVE_DAPP',
      params: dapp?.id!
    })
    closeDialog()
    closeBottomSheet()
  }

  return (
    <BottomSheet id="dapp-footer" sheetRef={sheetRef} closeBottomSheet={closeBottomSheet}>
      <Dialog
        dialogRef={dialogRef}
        id="remove-dapp"
        title={t('Remove App')}
        text={
          dapp?.isConnected
            ? t(
                `Are you sure you want to remove ${dapp?.name} from your App Catalog. This action will also disconnect the app from Ambire Wallet.`
              )
            : t(`Are you sure you want to remove ${dapp?.name} from your App Catalog.`)
        }
        closeDialog={closeDialog}
      >
        <DialogFooter horizontalAlignment="justifyEnd">
          <DialogButton text={t('Close')} type="secondary" onPress={() => closeDialog()} />
          <DialogButton
            style={spacings.ml}
            text={t('Remove')}
            type="danger"
            onPress={removeDappFromCatalog}
          />
        </DialogFooter>
      </Dialog>
      <View style={[spacings.mbLg, spacings.ptSm]}>
        <DappControl
          dapp={dapp}
          inModal
          isCurrentDapp={isCurrentDapp}
          openBottomSheet={openBottomSheet}
          closeBottomSheet={closeBottomSheet}
        />
      </View>
      <View
        style={[
          styles.networkSelectorContainer,
          shouldShowRemoveDappFromCatalog ? spacings.mb3Xl : spacings.mb0
        ]}
      >
        <Text fontSize={14} style={flexbox.flex1}>
          {t('Select App Network')}
        </Text>
        <Select
          setValue={handleSetNetworkValue as any}
          menuOptionHeight={48}
          containerStyle={{ width: 230 }}
          selectStyle={{ height: 40 }}
          options={networksOptions}
          value={networksOptions.filter((opt) => opt.value === network?.name)[0]}
        />
      </View>
      {!!shouldShowRemoveDappFromCatalog && (
        <View style={flexbox.alignCenter}>
          <Button
            size="small"
            type="ghost"
            textUnderline
            textStyle={{ color: theme.errorDecorative }}
            text={t('Remove from App Catalog')}
            hasBottomSpacing={false}
            onPress={promptRemoveDApp}
            innerContainerStyle={(hovered: boolean) => ({
              backgroundColor: hovered ? theme.errorBackground : 'transparent'
            })}
          >
            <DeleteIcon
              color={theme.errorDecorative}
              width={16}
              style={spacings.mlTy}
              strokeWidth="1.8"
            />
          </Button>
        </View>
      )}
    </BottomSheet>
  )
}

export default React.memo(ManageDapp)
