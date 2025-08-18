import React from 'react'
import { Pressable, View } from 'react-native'

import { Banner } from '@ambire-common/interfaces/banner'
import AmbireBackgroundLogo from '@common/assets/svg/AmbireBackgroundLogo'
import CloseIcon from '@common/assets/svg/CloseIcon'
import Text from '@common/components/Text'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import ThemeColors, { THEME_TYPES } from '@common/styles/themeConfig'
import common from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'
import { openInTab } from '@web/extension-services/background/webapi/tab'
import useBackgroundService from '@web/hooks/useBackgroundService'
import { getUiType } from '@web/utils/uiType'

import getStyles from './styles'

const RELAYER_BANNER_TYPES = ['updates', 'rewards', 'new', 'vote', 'tips', 'alert'] as const

interface Props {
  banner: Banner
}

const typeEmojiMap: Record<string, string> = {
  updates: '💜',
  rewards: '💎',
  new: '📢',
  vote: '✋',
  tips: '💡'
}
interface BannerColors {
  background: string
  border: string
  logoColor: string
}

const typeBannerColorsMap: Record<string, BannerColors> = {
  updates: {
    background: '#9D7AFF',
    border: '#7B59E7',
    logoColor: '#7443F8'
  },
  rewards: {
    background: '#191B1F',
    border: '#323D73',
    logoColor: '#2D2467'
  },
  new: {
    background: '#B14904',
    border: '#CD6020',
    logoColor: '#E29101'
  },
  vote: {
    background: '#6C38F7',
    border: '#946EFD',
    logoColor: '#946EFD'
  },
  tips: {
    background: '#003A3C',
    border: '#3A6762',
    logoColor: '#188B89'
  }
}

const MarketingBanner: React.FC<Props> = ({ banner }) => {
  const { isTab, isPopup } = getUiType()
  const { dispatch } = useBackgroundService()
  const { styles } = useTheme(getStyles)
  const { text, type: bannerType = 'updates', actions } = banner
  const type = RELAYER_BANNER_TYPES.includes(bannerType as any) ? bannerType : 'updates'
  const url = actions?.find((action) => action.actionName === 'open-link')?.meta?.url || ''
  const colors = typeBannerColorsMap[type]

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          borderColor: colors.border
        }
      ]}
    >
      <View style={styles.backgroundLogo}>
        <AmbireBackgroundLogo color={typeBannerColorsMap[type]?.logoColor} />
      </View>
      <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.plSm]}>
        <View
          style={{
            width: 32,
            height: 33,
            ...flexbox.directionRow,
            ...flexbox.alignCenter,
            ...flexbox.justifyCenter,
            ...spacings.mrSm
          }}
        >
          <Text fontSize={24}>{typeEmojiMap[type] || ''}</Text>
        </View>
        <Text
          weight="medium"
          fontSize={isTab ? 16 : 14}
          color={ThemeColors.primaryText[THEME_TYPES.DARK]}
        >
          {text}
        </Text>
      </View>

      <View style={[flexbox.directionRow, flexbox.alignCenter]}>
        <Pressable
          testID="marketing-banner-button"
          onPress={async () => {
            await openInTab({ url, shouldCloseCurrentWindow: isPopup })
          }}
        >
          {({ hovered }: any) => (
            <View
              style={[
                flexbox.alignCenter,
                flexbox.justifyCenter,
                common.borderRadiusPrimary,
                {
                  minWidth: 80,
                  backgroundColor: hovered
                    ? '#1b2b2c'
                    : ThemeColors.primaryBackground[THEME_TYPES.DARK],
                  borderWidth: 1,
                  borderColor: ThemeColors.primary[THEME_TYPES.DARK],
                  padding: 8
                }
              ]}
            >
              <Text
                style={{ color: hovered ? '#FFFFFF' : ThemeColors.primary[THEME_TYPES.DARK] }}
                weight="medium"
                fontSize={14}
              >
                Open
              </Text>
            </View>
          )}
        </Pressable>

        <View>
          <Pressable
            onPress={() => {
              dispatch({
                type: 'DISMISS_BANNER',
                params: { bannerId: banner.id }
              })
            }}
            hitSlop={8}
          >
            {({ hovered }: any) => (
              <View
                style={[
                  spacings.mhSm,
                  spacings.mvSm,
                  spacings.pvTy,
                  spacings.phTy,
                  {
                    borderRadius: 50,
                    backgroundColor: hovered
                      ? '#1b2b2c'
                      : ThemeColors.primaryBackground[THEME_TYPES.DARK]
                  }
                ]}
              >
                <CloseIcon
                  strokeWidth="2"
                  width={10}
                  height={10}
                  color={hovered ? '#FFFFFF' : ThemeColors.primary[THEME_TYPES.DARK]}
                />
              </View>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  )
}

export default MarketingBanner
