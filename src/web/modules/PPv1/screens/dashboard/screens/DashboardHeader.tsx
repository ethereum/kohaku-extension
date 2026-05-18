import React, { useCallback } from 'react'
import { Pressable, View } from 'react-native'

import SettingsIcon from '@common/assets/svg/SettingsIcon'
import KohakuLogo from '@common/components/HokahuLogo'
import Text from '@common/components/Text/Text'
import useTheme from '@common/hooks/useTheme'
import useNavigation from '@common/hooks/useNavigation'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import { getUiType } from '@web/utils/uiType'
import Button from '@common/components/Button'
import { openInTab } from '@web/extension-services/background/webapi/tab'
import MaximizeIcon from '@common/assets/svg/MaximizeIcon'
import Tooltip from '@common/components/Tooltip'
import { useTranslation } from 'react-i18next'
import { ActiveView } from './types'

const { isPopup } = getUiType()

const expandViewTooltipId = 'expand-view-tooltip'

const ExpandView = () => {
  const { t } = useTranslation()
  // const { theme } = useTheme()
  return (
    <View style={[flexbox.directionRow, flexbox.alignCenter]}>
      <Button
        type="ghost2"
        size="small"
        hasBottomSpacing={false}
        onPress={() =>
          openInTab({
            url: `tab.html#/${WEB_ROUTES.mainDashboard}`,
            shouldCloseCurrentWindow: true
          })
        }
      >
        <MaximizeIcon
          // color={theme.secondaryBackgroundInverted}
          color="#FF0A6F"
          // @ts-ignore missing type, but the prop is valid
          dataSet={{ tooltipId: expandViewTooltipId }}
          width={16}
          height={16}
        />
      </Button>

      <Tooltip content={t('Expand view')} id={expandViewTooltipId} />
    </View>
  )
}

const NewDashboardHeader = ({ activeView }: { activeView: ActiveView }) => {
  const { theme } = useTheme()
  const { navigate } = useNavigation()

  const openSettings = useCallback(() => {
    navigate(isPopup ? WEB_ROUTES.menu : WEB_ROUTES.generalSettings)
  }, [navigate])

  return (
    <View
      style={[
        flexbox.directionRow,
        flexbox.justifySpaceBetween,
        flexbox.alignCenter,
        spacings.pvTy,
        !isPopup && spacings.phMd,
        {
          borderColor: theme.primaryBorder,
          borderLeftWidth: isPopup ? 0 : 1,
          borderRightWidth: isPopup ? 0 : 1,
          marginLeft: isPopup ? 10 : 80,
          marginRight: isPopup ? 10 : 80
        }
      ]}
    >
      <KohakuLogo width={40} height={40} />

      <View style={[flexbox.directionRow, flexbox.alignCenter]}>
        <Text
          fontSize={12}
          weight="medium"
          // color={activeView === 'private' ? undefined : '#000000'}
        >
          How does Kohaku work?
        </Text>

        <Pressable onPress={openSettings} style={spacings.mlSm}>
          <SettingsIcon
            width={20}
            height={20}
            // color={activeView === 'private' ? '#F9F6E9' : '#000000'}
            color="#F9F6E9"
          />
        </Pressable>

        {isPopup && <ExpandView />}
      </View>
    </View>
  )
}

export default NewDashboardHeader
