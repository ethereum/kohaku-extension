import React, { createContext, FC, useContext, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ColorValue, StyleProp, View, ViewStyle } from 'react-native'

import LockIcon from '@common/assets/svg/LockIcon'
import TransactionsIcon from '@common/assets/svg/TransactionsIcon'
import VisibilityIcon from '@common/assets/svg/VisibilityIcon'
import Text, { Props as TextProps } from '@common/components/Text'
import useTheme from '@common/hooks/useTheme'
import spacings, { SPACING_SM } from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'

const dAppPermissionWrapperContext = createContext({
  responsiveSizeMultiplier: 1
})

const DAppPermissionWrapper = ({
  children,
  responsiveSizeMultiplier,
  style
}: {
  children: React.ReactNode
  responsiveSizeMultiplier: number
  style?: StyleProp<ViewStyle>
}) => {
  const contextValue = useMemo(() => ({ responsiveSizeMultiplier }), [responsiveSizeMultiplier])

  return (
    <dAppPermissionWrapperContext.Provider value={contextValue}>
      <View
        style={[
          flexbox.directionRow,
          flexbox.alignCenter,
          {
            marginBottom: SPACING_SM * responsiveSizeMultiplier
          },
          style
        ]}
      >
        {children}
      </View>
    </dAppPermissionWrapperContext.Provider>
  )
}

const DAppPermissionIcon = ({
  children,
  backgroundColor
}: {
  children: React.ReactNode
  backgroundColor: ColorValue | string
}) => {
  const { responsiveSizeMultiplier } = useContext(dAppPermissionWrapperContext)
  return (
    <View
      style={{
        backgroundColor,
        width: responsiveSizeMultiplier * 32,
        height: responsiveSizeMultiplier * 32,
        ...flexbox.center,
        // ...spacings.mrTy,
        marginRight: 10,
        borderRadius: 25
      }}
    >
      {children}
    </View>
  )
}

const DAppPermissionText = ({ children, ...rest }: { children: React.ReactNode } & TextProps) => {
  const { responsiveSizeMultiplier } = useContext(dAppPermissionWrapperContext)

  return (
    <Text appearance="secondaryText" fontSize={responsiveSizeMultiplier * 14} {...rest}>
      {children}
    </Text>
  )
}

const DAppPermissions: FC<{
  responsiveSizeMultiplier: number
}> = ({ responsiveSizeMultiplier }) => {
  const { theme } = useTheme()
  const { t } = useTranslation()

  return (
    <View
      style={[
        spacings.phLg,
        spacings.pvMd,
        {
          backgroundColor: theme.primaryBackground
          // marginBottom: SPACING_TY * responsiveSizeMultiplier
        }
      ]}
    >
      <Text fontSize={13} weight="medium" numberOfLines={1} style={spacings.mbSm}>
        {t('Connecting with this app will:')}
      </Text>
      <DAppPermissionWrapper responsiveSizeMultiplier={responsiveSizeMultiplier}>
        <DAppPermissionIcon backgroundColor={theme.info2Background}>
          <VisibilityIcon
            width={responsiveSizeMultiplier * 24}
            height={responsiveSizeMultiplier * 24}
            color={theme.info2Decorative}
          />
        </DAppPermissionIcon>
        <DAppPermissionText style={[{ fontSize: 13 }]}>
          Allow the app to{' '}
          <DAppPermissionText weight="medium">{t('see your addresses')}</DAppPermissionText>
        </DAppPermissionText>
      </DAppPermissionWrapper>
      <DAppPermissionWrapper responsiveSizeMultiplier={responsiveSizeMultiplier}>
        <DAppPermissionIcon backgroundColor={theme.infoBackground}>
          <TransactionsIcon
            width={responsiveSizeMultiplier * 18}
            height={responsiveSizeMultiplier * 18}
            color={theme.infoDecorative}
          />
        </DAppPermissionIcon>
        <DAppPermissionText style={[{ fontSize: 13 }]}>
          Allow the app to{' '}
          <DAppPermissionText weight="medium">{t('propose transactions')}</DAppPermissionText>
        </DAppPermissionText>
      </DAppPermissionWrapper>
      <DAppPermissionWrapper
        responsiveSizeMultiplier={responsiveSizeMultiplier}
        style={{ marginBottom: 0 }}
      >
        <DAppPermissionIcon backgroundColor={theme.successBackground}>
          <LockIcon
            width={responsiveSizeMultiplier * 22}
            height={responsiveSizeMultiplier * 22}
            color={theme.successDecorative}
          />
        </DAppPermissionIcon>
        <DAppPermissionText style={[{ fontSize: 13 }]}>
          The app <DAppPermissionText weight="medium">{t('cannot move funds')}</DAppPermissionText>{' '}
          without your permission
        </DAppPermissionText>
      </DAppPermissionWrapper>
    </View>
  )
}

export default React.memo(DAppPermissions)
