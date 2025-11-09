import React, { FC } from 'react'
import { Pressable, View } from 'react-native'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useNavigation from '@common/hooks/useNavigation'
import useTheme from '@common/hooks/useTheme'
import useToast from '@common/hooks/useToast'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import { THEME_TYPES } from '@common/styles/themeConfig'
import { BORDER_RADIUS_PRIMARY } from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'
import { createTab } from '@web/extension-services/background/webapi/tab'

interface Props {
  routeItem: {
    icon: any
    label: string
    route?: string
    isExternal: boolean
    disabled?: boolean
    onPress?: () => void
    testID?: string
    scale: number
    scaleOnHover: number
  }
  index: number
  routeItemsLength: number
}

const ITEM_HEIGHT = 44

const RouteItem: FC<Props> = ({ routeItem, index, routeItemsLength }) => {
  const { theme, themeType } = useTheme()
  const { t } = useTranslation()
  const { navigate } = useNavigation()
  const { addToast } = useToast()

  return (
    <Pressable
      key={routeItem.label}
      style={[flexbox.alignCenter, index !== routeItemsLength - 1 && spacings.mr]}
      disabled={routeItem.disabled}
      onPress={async () => {
        if (routeItem?.onPress) {
          routeItem.onPress()
          return
        }

        if (routeItem.isExternal && routeItem.route) {
          try {
            await createTab(routeItem.route)
          } catch {
            addToast(t('Failed to open new tab.'), { type: 'error' })
          }
          return
        }
        if (!routeItem.route) return

        navigate(routeItem.route)
      }}
    >
      {({ hovered }: any) => (
        <>
          <View
            testID={routeItem.testID}
            style={{
              height: ITEM_HEIGHT,
              paddingHorizontal: 9, // this way it gets equal to ITEM_HEIGHT (when square), and flexible otherwise
              borderRadius: BORDER_RADIUS_PRIMARY,
              backgroundColor: hovered
                ? themeType === THEME_TYPES.DARK
                  ? '#1b2b2c'
                  : '#141833CC'
                : themeType === THEME_TYPES.DARK
                ? theme.primaryBackground
                : theme.primaryText,
              ...flexbox.center,
              ...spacings.mbTy
            }}
          >
            <View
              style={[
                flexbox.center,
                flexbox.alignCenter,
                routeItem.route === WEB_ROUTES.swapAndBridge && { width: 70, height: 24 }
              ]}
            >
              <routeItem.icon
                color={
                  themeType === THEME_TYPES.DARK
                    ? theme.primary
                    : hovered
                    ? theme.infoDecorative
                    : theme.primaryBackground
                }
                height={ITEM_HEIGHT}
              />
            </View>
          </View>
          <Text
            color={
              themeType === THEME_TYPES.DARK
                ? theme.primaryBackgroundInverted
                : theme.primaryBackground
            }
            weight="regular"
            fontSize={12}
            style={routeItem.disabled && { opacity: 0.4 }}
          >
            {routeItem.label}
          </Text>
        </>
      )}
    </Pressable>
  )
}

export default React.memo(RouteItem)
