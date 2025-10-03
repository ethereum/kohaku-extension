import React, { FC, useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Animated, Easing, Pressable, View } from 'react-native'

import { Action } from '@ambire-common/libs/selectedAccount/errors'
import WarningIcon from '@common/assets/svg/WarningIcon'
import Alert from '@common/components/Alert'
import BottomSheet from '@common/components/BottomSheet'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import Tooltip from '@common/components/Tooltip'
import { isWeb } from '@common/config/env'
import useTheme from '@common/hooks/useTheme'
import useBalanceAffectingErrors from '@web/modules/PPv1/screens/dashboard/hooks/useBalanceAffectingErrors'
import spacings from '@common/styles/spacings'
import { THEME_TYPES } from '@common/styles/themeConfig'
import flexbox from '@common/styles/utils/flexbox'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'

import BalanceAffectingErrorActions from './BalanceAffectingErrorActions'
import Header from './Header'

type Props = {
  networksWithErrors: string[]
  reloadAccount: () => void
} & Omit<ReturnType<typeof useBalanceAffectingErrors>, 'networksWithErrors'>

const BalanceAffectingErrors: FC<Props> = ({
  reloadAccount,
  sheetRef,
  balanceAffectingErrorsSnapshot,
  warningMessage,
  onIconPress,
  closeBottomSheetWrapped,
  isLoadingTakingTooLong
}) => {
  const { t } = useTranslation()
  const { theme, themeType } = useTheme()
  const { balanceAffectingErrors, portfolio } = useSelectedAccountControllerState()

  const areErrorsOutdatedAndPortfolioIsReady = useMemo(() => {
    return (
      balanceAffectingErrorsSnapshot.length > 0 &&
      portfolio.isAllReady &&
      !balanceAffectingErrors.length
    )
  }, [balanceAffectingErrors.length, balanceAffectingErrorsSnapshot.length, portfolio.isAllReady])

  const onButtonPress = useCallback(() => {
    if (!areErrorsOutdatedAndPortfolioIsReady) {
      reloadAccount()
    }

    closeBottomSheetWrapped()
  }, [areErrorsOutdatedAndPortfolioIsReady, closeBottomSheetWrapped, reloadAccount])

  const renderWarningIcon = useCallback(() => {
    return (
      <WarningIcon
        color={theme.warningDecorative2}
        style={spacings.mlTy}
        data-tooltip-id="balance-affecting-error"
        data-tooltip-content={warningMessage}
        width={21}
        height={21}
      />
    )
  }, [theme.warningDecorative2, warningMessage])

  const renderItem = useCallback(
    ({ item: { id, title, text, type, actions }, index }: any) => (
      <Alert
        key={id}
        style={index !== balanceAffectingErrorsSnapshot.length - 1 ? spacings.mbSm : spacings.mb0}
        title={title}
        text={text}
        type={type}
        testID="portfolio-error-alert"
      >
        {actions &&
          actions.map(({ actionName, ...rest }: Action) => {
            return (
              <BalanceAffectingErrorActions
                key={actionName}
                actionName={actionName}
                closeBottomSheet={closeBottomSheetWrapped}
                {...rest}
              />
            )
          })}
      </Alert>
    ),
    [balanceAffectingErrorsSnapshot.length, closeBottomSheetWrapped]
  )

  const flashingOpacity = useMemo(() => new Animated.Value(1), [])

  // This must be memoized!! Otherwise the bottom sheet will close when the user
  // opens a popup??
  const shouldDisplayWarningIcon = useMemo(() => {
    return warningMessage || balanceAffectingErrorsSnapshot.length
  }, [balanceAffectingErrorsSnapshot.length, warningMessage])

  useEffect(() => {
    if (isLoadingTakingTooLong) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(flashingOpacity, {
            toValue: 0.2,
            duration: 700,
            easing: Easing.out(Easing.ease),
            useNativeDriver: !isWeb
          }),
          Animated.timing(flashingOpacity, {
            toValue: 0.5,
            duration: 700,
            easing: Easing.out(Easing.ease),
            useNativeDriver: !isWeb
          })
        ])
      ).start()
    } else {
      flashingOpacity.setValue(1)
    }
  }, [isLoadingTakingTooLong, flashingOpacity])

  if (!shouldDisplayWarningIcon) return null

  return (
    <>
      {isLoadingTakingTooLong ? (
        <Animated.View style={{ opacity: flashingOpacity }}>{renderWarningIcon()}</Animated.View>
      ) : (
        <Pressable onPress={onIconPress} testID="balance-affecting-error-icon">
          {renderWarningIcon()}
        </Pressable>
      )}
      <Tooltip id="balance-affecting-error" />
      <BottomSheet
        style={{ maxWidth: 720, ...spacings.pvLg, ...spacings.phXl, width: '100%' }}
        id="portfolio-errors"
        backgroundColor={
          themeType === THEME_TYPES.DARK ? 'secondaryBackground' : 'primaryBackground'
        }
        sheetRef={sheetRef}
        closeBottomSheet={closeBottomSheetWrapped}
        flatListProps={{
          ListHeaderComponent: <Header />,
          stickyHeaderIndices: [0],
          ListFooterComponent: (
            <View
              style={[
                !areErrorsOutdatedAndPortfolioIsReady ? spacings.ptLg : spacings.ptMd,
                flexbox.alignCenter,
                flexbox.justifySpaceBetween
              ]}
            >
              {areErrorsOutdatedAndPortfolioIsReady ? (
                <Text fontSize={16} style={spacings.mbMd}>
                  {t('All errors have been resolved. Feel free to close this modal.')}
                </Text>
              ) : null}
              <Button
                style={{ width: '100%' }}
                hasBottomSpacing={false}
                text={!areErrorsOutdatedAndPortfolioIsReady ? t('Reload account') : t('Close')}
                onPress={onButtonPress}
              />
            </View>
          ),
          data: balanceAffectingErrorsSnapshot,
          extraData: areErrorsOutdatedAndPortfolioIsReady,
          keyExtractor: ({ id }) => id,
          renderItem
        }}
      />
    </>
  )
}

export default BalanceAffectingErrors
