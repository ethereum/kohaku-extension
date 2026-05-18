import React from 'react'
import { Pressable, View } from 'react-native'

import DiagonalRightArrowIcon from '@common/assets/svg/DiagonalRightArrowIcon'
import AddIcon from '@common/assets/svg/AddIcon'
import ReceiveIcon from '@common/assets/svg/ReceiveIcon'
import Text from '@common/components/Text/Text'
import useTheme from '@common/hooks/useTheme'
import useNavigation from '@common/hooks/useNavigation'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { WEB_ROUTES } from '@common/modules/router/constants/common'

interface Props {
  onReceive: () => void
}

const NewPrivateActionButtons = ({ onReceive }: Props) => {
  const { theme } = useTheme()
  const { navigate } = useNavigation()

  const onShield = () => navigate(WEB_ROUTES.pp1Deposit)
  const onPrivateSend = () => navigate(WEB_ROUTES.pp1Transfer)

  const buttons = [
    { label: 'Shield funds', Icon: AddIcon, onPress: onShield },
    { label: 'Private send', Icon: DiagonalRightArrowIcon, onPress: onPrivateSend },
    { label: 'Receive', Icon: ReceiveIcon, onPress: onReceive }
  ]

  return (
    <View style={[flexbox.directionRow, flexbox.justifyCenter, spacings.pvMd]}>
      {buttons.map((btn, index) => (
        <Pressable
          key={btn.label}
          onPress={btn.onPress}
          style={[flexbox.center, index > 0 && spacings.mlXl, { display: 'flex' }]}
        >
          <View
            style={[
              flexbox.center,
              {
                backgroundColor: '#04364D',
                display: 'flex',
                width: 44,
                height: 44,
                borderWidth: 1,
                borderColor: '#021B26',
                borderRadius: 999,

                // iOS
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.2,
                shadowRadius: 10,

                // Android
                elevation: 5
              }
            ]}
          >
            <btn.Icon width={16} height={16} color={String(theme.kohakuAccent)} />
          </View>
          <Text
            fontSize={16}
            weight="regular"
            appearance="secondaryText"
            color="#F9F6E9"
            style={[spacings.mtMi, { textAlign: 'center' }]}
          >
            {btn.label}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

export default NewPrivateActionButtons
