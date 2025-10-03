import React, { useCallback } from 'react'
import { View, ColorValue } from 'react-native'

import { Wrapper, Content } from '@web/components/TransactionsScreen'
import Text from '@common/components/Text'
import useNavigation from '@common/hooks/useNavigation'
import { ROUTES } from '@common/modules/router/constants/common'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { BORDER_RADIUS_PRIMARY } from '@common/styles/utils/common'
import AccountsIcon from '@common/assets/svg/AccountsIcon'
import SendIcon from '@common/assets/svg/SendIcon'
import { AnimatedPressable, useCustomHover } from '@web/hooks/useHover'
import usePrivacyPoolsForm from '../../hooks/usePrivacyPoolsForm'

const SettingsOption = ({
  label,
  onPress,
  Icon,
  disabled
}: {
  label: string
  onPress: () => void
  Icon: React.FC<{ width: number; height: number; color: ColorValue }>
  disabled?: boolean
}) => {
  const { theme } = useTheme()
  const [bindAnim, animStyle, isHovered] = useCustomHover({
    property: 'backgroundColor',
    values: {
      from: theme.secondaryBackground,
      to: theme.tertiaryBackground
    }
  })

  const color = isHovered ? theme.primaryText : theme.secondaryText

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      style={[
        flexbox.directionRow,
        flexbox.alignCenter,
        spacings.pl,
        spacings.pv,
        spacings.mbMi,
        {
          borderRadius: BORDER_RADIUS_PRIMARY,
          width: '100%'
        },
        animStyle,
        disabled ? { opacity: 0.6 } : {}
      ]}
      {...bindAnim}
    >
      <View style={flexbox.directionRow}>
        <Icon width={24} height={24} color={color} />
        <Text style={spacings.ml} color={color} fontSize={16} weight="medium">
          {label}
        </Text>
      </View>
    </AnimatedPressable>
  )
}

const SettingsScreen = () => {
  const headerTitle = 'Settings'
  const { navigate } = useNavigation()
  const { totalPendingBalance, totalDeclinedBalance } = usePrivacyPoolsForm()

  const handleGoBack = useCallback(() => {
    navigate(ROUTES.pp1Home)
  }, [navigate])

  const handleSwitchAccount = useCallback(() => {
    navigate(ROUTES.pp1Import)
  }, [navigate])

  const handleRagequitAll = useCallback(() => {
    navigate(ROUTES.pp1Ragequit)
  }, [navigate])

  const ragequitableCount =
    totalPendingBalance.accounts.filter((acc) => !acc.ragequit).length +
    totalDeclinedBalance.accounts.filter((acc) => !acc.ragequit).length

  return (
    <Wrapper title={headerTitle} handleGoBack={handleGoBack} buttons={<>,</>}>
      <Content buttons={<>,</>}>
        <View style={[spacings.phTy, spacings.pvLg, flexbox.flex1]}>
          <SettingsOption
            label="Use a different Privacy Pool Account"
            onPress={handleSwitchAccount}
            Icon={AccountsIcon}
          />
          <SettingsOption
            label="Ragequit all pending funds"
            onPress={handleRagequitAll}
            Icon={SendIcon}
            disabled={ragequitableCount === 0}
          />
        </View>
      </Content>
    </Wrapper>
  )
}

export default React.memo(SettingsScreen)
