import React from 'react'
import { useTranslation } from 'react-i18next'
import { Animated, View } from 'react-native'

import { isSmartAccount } from '@ambire-common/libs/account/account'
import shortenAddress from '@ambire-common/utils/shortenAddress'
import CopyIcon from '@common/assets/svg/CopyIcon'
import RightArrowIcon from '@common/assets/svg/RightArrowIcon'
import AccountKeyIcons from '@common/components/AccountKeyIcons'
import Avatar from '@common/components/Avatar'
import Text from '@common/components/Text'
import useNavigation from '@common/hooks/useNavigation'
import useTheme from '@common/hooks/useTheme'
import useToast from '@common/hooks/useToast'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import { THEME_TYPES } from '@common/styles/themeConfig'
import flexboxStyles from '@common/styles/utils/flexbox'
import { setStringAsync } from '@common/utils/clipboard'
import useHover, { AnimatedPressable, useCustomHover } from '@web/hooks/useHover'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'

import { NEUTRAL_BACKGROUND_HOVERED } from '../../screens/styles'
import getStyles from './styles'

const AccountButton = () => {
  const { t } = useTranslation()
  const { addToast } = useToast()
  const { navigate } = useNavigation()
  const { theme, styles, themeType } = useTheme(getStyles)

  const { account } = useSelectedAccountControllerState()
  const [bindAddressAnim, addressAnimStyle] = useHover({
    preset: 'opacity'
  })
  const [bindAccountBtnAnim, accountBtnAnimStyle, isAccountBtnHovered] = useCustomHover({
    property: 'left',
    values: {
      from: 0,
      to: 4
    }
  })

  if (!account) return null

  const handleCopyText = async () => {
    try {
      await setStringAsync(account.addr)
      addToast(t('Copied address to clipboard!') as string, { timeout: 2500 })
    } catch {
      addToast(t('Failed to copy address to clipboard!') as string, {
        timeout: 2500,
        type: 'error'
      })
    }
  }

  return (
    <View style={[flexboxStyles.directionRow, flexboxStyles.alignCenter]}>
      <AnimatedPressable
        testID="account-select-btn"
        style={[
          styles.accountButton,
          {
            backgroundColor: isAccountBtnHovered
              ? NEUTRAL_BACKGROUND_HOVERED
              : NEUTRAL_BACKGROUND_HOVERED
          }
        ]}
        onPress={() => navigate(WEB_ROUTES.accountSelect)}
        {...bindAccountBtnAnim}
      >
        <>
          <View style={styles.accountButtonInfo}>
            <Avatar pfp={account.preferences.pfp} size={32} isSmart={isSmartAccount(account)} />
            <Text
              numberOfLines={1}
              weight="semiBold"
              style={[spacings.mlTy, spacings.mrTy]}
              color={
                themeType === THEME_TYPES.DARK
                  ? theme.primaryBackgroundInverted
                  : theme.primaryBackground
              }
              fontSize={14}
            >
              {account.preferences.label}
            </Text>

            <AccountKeyIcons isExtended={false} account={account} />
          </View>
          <Animated.View style={accountBtnAnimStyle}>
            <RightArrowIcon
              style={styles.accountButtonRightIcon}
              width={12}
              color={
                themeType === THEME_TYPES.DARK
                  ? theme.primaryBackgroundInverted
                  : theme.primaryBackground
              }
            />
          </Animated.View>
        </>
      </AnimatedPressable>
      <AnimatedPressable
        style={[flexboxStyles.directionRow, flexboxStyles.alignCenter, addressAnimStyle]}
        onPress={handleCopyText}
        {...bindAddressAnim}
      >
        <Text
          color={
            themeType === THEME_TYPES.DARK
              ? theme.secondaryBackgroundInverted
              : theme.secondaryBackground
          }
          style={spacings.mrMi}
          weight="medium"
          fontSize={14}
        >
          ({shortenAddress(account.addr, 13)})
        </Text>
        <CopyIcon
          width={20}
          height={20}
          color={
            themeType === THEME_TYPES.DARK
              ? theme.secondaryBackgroundInverted
              : theme.secondaryBackground
          }
        />
      </AnimatedPressable>
    </View>
  )
}

export default React.memo(AccountButton)
