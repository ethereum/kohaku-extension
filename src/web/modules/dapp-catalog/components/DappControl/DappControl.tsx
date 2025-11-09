import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, View } from 'react-native'

import predefinedDapps from '@ambire-common/consts/dappCatalog.json'
import { Dapp } from '@ambire-common/interfaces/dapp'
import CloseIcon from '@common/assets/svg/CloseIcon'
import DAppsIcon from '@common/assets/svg/DAppsIcon'
import ManifestFallbackIcon from '@common/assets/svg/ManifestFallbackIcon'
import PowerIcon from '@common/assets/svg/PowerIcon'
import StarIcon from '@common/assets/svg/StarIcon'
import UpArrowIcon from '@common/assets/svg/UpArrowIcon'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import ManifestImage from '@web/components/ManifestImage'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'

import getStyles from './styles'

type Props = {
  dapp: Dapp | null
  isHovered?: boolean
  inModal?: boolean
  isCurrentDapp?: boolean
  openBottomSheet: (dest?: 'top' | 'default' | undefined) => void
  closeBottomSheet: (dest?: 'default' | 'alwaysOpen' | undefined) => void
}

const DappControl = ({
  dapp,
  inModal,
  isHovered,
  isCurrentDapp,
  openBottomSheet,
  closeBottomSheet
}: Props) => {
  const { styles, theme } = useTheme(getStyles)
  const { dispatch } = useBackgroundService()
  const { t } = useTranslation()
  const { networks } = useNetworksControllerState()

  const network = useMemo(
    () =>
      networks.filter((n) => Number(n.chainId) === dapp?.chainId)[0] ||
      networks.filter((n) => n.chainId === 1n)[0],
    [dapp?.chainId, networks]
  )

  const sessionAccount = useMemo(() => {
    if (!dapp) return null
    return dapp.account || null
  }, [dapp])

  const showDisconnectButton = !!dapp?.isConnected && (isHovered || inModal)

  const isPredefinedDapp = useMemo(
    () => predefinedDapps.find((d) => d.url === dapp?.url),
    [dapp?.url]
  )

  return (
    <View>
      <View style={styles.titleWrapper}>
        <Text weight="medium" fontSize={12} appearance="secondaryText">
          {t(`Manage ${isCurrentDapp ? 'current ' : ''}app (${sessionAccount ? `${sessionAccount}` : 'ERROR: NO SESSION ACCOUNT'})`)}
        </Text>
      </View>

      <View style={styles.border}>
        {dapp ? (
          <View style={styles.currentDApp}>
            <ManifestImage
              uri={dapp.icon || ''}
              size={32}
              fallback={() => <ManifestFallbackIcon />}
            />
            <View style={[spacings.mlMi, flexbox.flex1]}>
              <View style={[flexbox.directionRow, flexbox.flex1]}>
                <Text fontSize={12} weight="medium" numberOfLines={1} style={spacings.mrTy}>
                  {dapp.name}
                </Text>
                {(!!dapp.isConnected || !!isPredefinedDapp) && (
                  <Pressable
                    onPress={() => {
                      dispatch({
                        type: 'DAPP_CONTROLLER_UPDATE_DAPP',
                        params: { id: dapp.id, dapp: { favorite: !dapp.favorite } }
                      })
                    }}
                    style={[flexbox.alignSelfStart, spacings.mrLg]}
                  >
                    <StarIcon isFilled={dapp.favorite} />
                  </Pressable>
                )}
              </View>
              <Text
                weight="regular"
                color={dapp.isConnected ? theme.successText : theme.errorText}
                fontSize={10}
              >
                {dapp.isConnected ? t(`Connected on ${network.name}`) : t('Not connected')}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.currentDApp}>
            <DAppsIcon width={24} height={24} color={theme.secondaryText} />
            <Text fontSize={14} appearance="secondaryText" weight="regular" style={spacings.mlTy}>
              {t('No app found')}
            </Text>
          </View>
        )}
        <View style={flexbox.directionRow}>
          {!!showDisconnectButton && !!dapp?.url && (
            <Button
              type="danger"
              size="small"
              hasBottomSpacing={false}
              text={t('Disconnect')}
              style={spacings.mrTy}
              onPress={() => {
                dispatch({
                  type: 'DAPPS_CONTROLLER_DISCONNECT_DAPP',
                  params: dapp.id
                })
              }}
            >
              <View style={spacings.plTy}>
                <PowerIcon />
              </View>
            </Button>
          )}
          <Button
            type="secondary"
            size="small"
            hasBottomSpacing={false}
            text={inModal ? t('Close') : t('Manage')}
            disabled={!inModal && !dapp?.isConnected}
            onPress={() => {
              !inModal && openBottomSheet()
              inModal && closeBottomSheet()
            }}
          >
            <View style={spacings.plTy}>
              {!inModal && <UpArrowIcon color={theme.primary} />}
              {!!inModal && <CloseIcon color={theme.primary} />}
            </View>
          </Button>
        </View>
      </View>
    </View>
  )
}

export default React.memo(DappControl)
