import React from 'react'
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native'

import ReceiveIcon from '@common/assets/svg/ReceiveIcon'
import SendIcon from '@common/assets/svg/SendIcon'
import KohakuLogo from '@common/components/HokahuLogo'
import Text from '@common/components/Text/Text'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import { ThemeProps } from '@common/styles/themeConfig'
import { BORDER_RADIUS_PRIMARY } from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'
import useNavigation from '@common/hooks/useNavigation'
import { WEB_ROUTES } from '@common/modules/router/constants/common'

type ActiveView = 'public' | 'private'

interface Style {
  actionButton: ViewStyle
}

const getStyles = (theme: ThemeProps) =>
  StyleSheet.create<Style>({
    actionButton: {
      width: 80,
      height: 60,
      backgroundColor: theme.secondaryBackground,
      borderRadius: BORDER_RADIUS_PRIMARY,
      borderWidth: 1,
      borderColor: theme.primaryBorder,
      ...flexbox.alignCenter,
      ...flexbox.justifyCenter
    }
  })

interface Props {
  activeView: ActiveView
  onReceive: () => void
}

const publicActions = [
  { label: 'SHIELD', Icon: KohakuLogo },
  { label: 'SEND', Icon: SendIcon, id: 'send' },
  { label: 'RECEIVE', Icon: ReceiveIcon }
]

const privateActions = [{ label: 'PRIVATE SEND', Icon: SendIcon, id: 'send' }]

const ActionButtons = ({ activeView, onReceive }: Props) => {
  const { styles } = useTheme(getStyles)
  const { navigate } = useNavigation()
  const onShield = () => navigate(WEB_ROUTES.pp1Deposit)
  const onSend = () =>
    navigate(activeView === 'private' ? WEB_ROUTES.pp1Transfer : WEB_ROUTES.transfer)

  const actionsFn = {
    shield: onShield,
    send: onSend,
    receive: onReceive
  }

  const actions = activeView === 'private' ? privateActions : publicActions

  return (
    <View style={[flexbox.directionRow, flexbox.justifyCenter, spacings.phMd, spacings.pvSm]}>
      {actions.map((action) => {
        const onPress =
          actionsFn[(action.id || action.label.toLowerCase()) as keyof typeof actionsFn]

        return (
          <Pressable
            key={action.label}
            style={[styles.actionButton, spacings.mrSm]}
            onPress={onPress}
          >
            <action.Icon width={20} height={20} />
            <Text
              type="info"
              weight="medium"
              appearance="secondaryText"
              style={[spacings.mtMi, { textAlign: 'center' }]}
            >
              {action.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export default ActionButtons
