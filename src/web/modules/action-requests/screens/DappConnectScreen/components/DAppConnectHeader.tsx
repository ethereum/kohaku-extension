import React, { FC, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { Dapp, DappProviderRequest } from '@ambire-common/interfaces/dapp'
import ErrorFilledIcon from '@common/assets/svg/ErrorFilledIcon'
import ManifestFallbackIcon from '@common/assets/svg/ManifestFallbackIcon'
import Text from '@common/components/Text'
import useTheme from '@common/hooks/useTheme'
import useWindowSize from '@common/hooks/useWindowSize'
import spacings, { SPACING, SPACING_LG, SPACING_MD } from '@common/styles/spacings'
import { THEME_TYPES } from '@common/styles/themeConfig'
import flexbox from '@common/styles/utils/flexbox'
import ManifestImage from '@web/components/ManifestImage'
import useDappsControllerState from '@web/hooks/useDappsControllerState'

import getStyles from '../styles'
import TrustedIcon from './TrustedIcon'

type Props = Partial<DappProviderRequest['session']> & {
  responsiveSizeMultiplier: number
  securityCheck: 'BLACKLISTED' | 'NOT_BLACKLISTED' | 'LOADING'
}

const DAppConnectHeader: FC<Props> = ({
  origin,
  name = 'Unknown App',
  icon,
  responsiveSizeMultiplier,
  securityCheck
}) => {
  const { t } = useTranslation()
  const { styles, theme, themeType } = useTheme(getStyles)
  const { state } = useDappsControllerState()
  const { minHeightSize } = useWindowSize()
  // When the user connects to a dApp, the dApp is added to the list of dApps.
  // If we don't use the initial list of dApps to determine if a dApp is trusted,
  // the dApp will be marked as trusted for a split second before the window closes.
  const [initialDappsList, setInitialDappsList] = useState<Dapp[]>([])

  const hostname = origin ? new URL(origin).hostname : ''

  useEffect(() => {
    if (!initialDappsList.length && state.dapps.length) {
      setInitialDappsList(state.dapps)
    }
  }, [initialDappsList, state.dapps])

  const isDAppTrusted = useMemo(() => {
    if (!hostname) return false

    return initialDappsList.some((dapp) => dapp.url.includes(hostname))
  }, [hostname, initialDappsList])

  // const spacingsStyle = useMemo(() => {
  //   return {
  //     paddingHorizontal: SPACING_LG * responsiveSizeMultiplier,
  //     paddingTop: SPACING_MD * responsiveSizeMultiplier,
  //     paddingBottom: SPACING_LG * responsiveSizeMultiplier
  //   }
  // }, [responsiveSizeMultiplier])

  //

  return (
    <View
      style={[
        styles.contentHeader,
        spacings.pvLg,
        spacings.phLg,
        {
          backgroundColor:
            securityCheck === 'BLACKLISTED'
              ? theme.errorBackground
              : themeType === THEME_TYPES.DARK
              ? theme.secondaryBackground
              : theme.tertiaryBackground
        },
        // spacingsStyle
      ]}
    >
      <Text
        weight="medium"
        // fontSize={responsiveSizeMultiplier * 20}
        fontSize={12}
        appearance="muted"
        style={{
          // marginBottom: SPACING * responsiveSizeMultiplier
          marginBottom: 14
        }}
      >
        {t('Connection request from')}
      </Text>
      <View style={[flexbox.directionRow, flexbox.alignCenter]}>
        <View style={spacings.mr}>
          <ManifestImage
            uri={icon}
            size={responsiveSizeMultiplier * 56}
            fallback={() => (
              <ManifestFallbackIcon
                width={responsiveSizeMultiplier * 56}
                height={responsiveSizeMultiplier * 56}
              />
            )}
          />

          {isDAppTrusted && securityCheck === 'NOT_BLACKLISTED' && (
            <View
              style={{
                position: 'absolute',
                right: -9,
                top: -5
              }}
            >
              <TrustedIcon borderColor={theme.tertiaryBackground} />
            </View>
          )}
          {securityCheck === 'BLACKLISTED' && (
            <View
              style={{
                position: 'absolute',
                right: -9,
                top: -4
              }}
            >
              <ErrorFilledIcon width={18} height={18} />
            </View>
          )}
        </View>
        <View style={flexbox.flex1}>
          <Text
            style={[!minHeightSize('m') && spacings.mbMi, flexbox.flex1, { lineHeight: 23 }]}
            // fontSize={responsiveSizeMultiplier * 20}
            fontSize={15}
            weight="semiBold"
            numberOfLines={2}
          >
            {name}
          </Text>
          <Text
            // fontSize={14 * responsiveSizeMultiplier}
            fontSize={12}
            appearance="muted"
          >
            {hostname}
          </Text>
        </View>
      </View>
    </View>
  )
}

export default React.memo(DAppConnectHeader)
