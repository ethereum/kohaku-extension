import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { TouchableOpacity, View } from 'react-native'

import { isValidPassword } from '@ambire-common/services/validations'
import AmbireLogoWithTextMonochrome from '@common/assets/svg/AmbireLogoWithTextMonochrome'
import LockIcon from '@common/assets/svg/LockIcon'
import UnlockScreenBackground from '@common/assets/svg/UnlockScreenBackground'
import Button from '@common/components/Button'
import InputPassword from '@common/components/InputPassword'
import Text from '@common/components/Text'
import { isDev, isTesting, isWeb } from '@common/config/env'
import { useTranslation } from '@common/config/localization'
import useDisableNavigatingBack from '@common/hooks/useDisableNavigatingBack'
import useElementSize from '@common/hooks/useElementSize'
import useNavigation from '@common/hooks/useNavigation'
import useTheme from '@common/hooks/useTheme'
import Header from '@common/modules/header/components/Header'
import { ROUTES } from '@common/modules/router/constants/common'
import spacings, { SPACING } from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import text from '@common/styles/utils/text'
import { DEFAULT_KEYSTORE_PASSWORD_DEV } from '@env'
import { TabLayoutContainer, TabLayoutWrapperMainContent } from '@web/components/TabLayoutWrapper'
import { POPUP_WIDTH } from '@web/constants/spacings'
import { openInTab } from '@web/extension-services/background/webapi/tab'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useKeystoreControllerState from '@web/hooks/useKeystoreControllerState'
import { getUiType } from '@web/utils/uiType'

import getStyles from './styles'

const FOOTER_BUTTON_HIT_SLOP = { top: 10, bottom: 15 }
const MIN_PANEL_SIZE = 480

const isPopup = getUiType().isPopup

const Container = isPopup ? View : TabLayoutWrapperMainContent

const KeyStoreUnlockScreen = () => {
  const contentContainerRef = useRef(null)
  const { t } = useTranslation()
  const { styles, theme } = useTheme(getStyles)
  const { navigate } = useNavigation()
  const { dispatch } = useBackgroundService()
  const keystoreState = useKeystoreControllerState()
  const { height } = useElementSize(contentContainerRef)
  const {
    control,
    handleSubmit,
    watch,
    setError,
    formState: { errors }
  } = useForm({
    mode: 'all',
    defaultValues: {
      password: isDev && !isTesting ? DEFAULT_KEYSTORE_PASSWORD_DEV ?? '' : ''
    }
  })

  useDisableNavigatingBack()

  const passwordFieldValue = watch('password')

  useEffect(() => {
    if (keystoreState.errorMessage) setError('password', { message: keystoreState.errorMessage })
  }, [keystoreState.errorMessage, setError])

  useEffect(() => {
    if (keystoreState.isUnlocked) navigate('/')
  }, [navigate, keystoreState])

  const disableSubmit = useMemo(
    () => keystoreState.statuses.unlockWithSecret !== 'INITIAL' || !!keystoreState.errorMessage,
    [keystoreState.statuses.unlockWithSecret, keystoreState.errorMessage]
  )

  const passwordFieldError = useMemo(() => {
    if (!errors.password) return undefined

    if (passwordFieldValue.length < 8) {
      return t('Please fill in at least 8 characters for password.')
    }

    return errors.password.message || t('Invalid password')
  }, [errors.password, passwordFieldValue.length, t])

  const handleUnlock = useCallback(
    ({ password }: { password: string }) => {
      if (disableSubmit) return

      dispatch({
        type: 'KEYSTORE_CONTROLLER_UNLOCK_WITH_SECRET',
        params: { secretId: 'password', secret: password }
      })
    },
    [disableSubmit, dispatch]
  )

  const panelSize = useMemo(() => {
    const MAX_SIZE = POPUP_WIDTH
    if (isPopup) return POPUP_WIDTH
    if (height > MAX_SIZE) return POPUP_WIDTH

    const size = height - 2 * SPACING
    return size < MIN_PANEL_SIZE ? MIN_PANEL_SIZE : size
  }, [height])

  return (
    <TabLayoutContainer
      withHorizontalPadding={!isPopup}
      backgroundColor={theme.secondaryBackground}
      header={
        !isPopup && (
          <Header displayBackButtonIn="never" withAmbireLogo mode="custom-inner-content">
            <View
              style={[
                flexbox.flex1,
                flexbox.directionRow,
                flexbox.alignCenter,
                flexbox.justifyCenter
              ]}
            >
              <Text
                fontSize={20}
                weight="medium"
                style={[{ marginLeft: 18 + SPACING }, spacings.mr]}
              >
                {t('Welcome Back')}
              </Text>
              <LockIcon />
            </View>
          </Header>
        )
      }
    >
      <Container
        contentContainerStyle={[flexbox.alignCenter, spacings.pv0]}
        style={flexbox.flex1}
        wrapperRef={contentContainerRef}
        withScroll
      >
        <View
          style={[
            styles.container,
            { aspectRatio: 1, minHeight: MIN_PANEL_SIZE, maxHeight: panelSize }
          ]}
        >
          <View style={styles.backgroundWrapper}>
            <View style={styles.backgroundSVG}>
              <UnlockScreenBackground />
            </View>
            {!!isPopup && (
              <View style={styles.panelHeader}>
                <View
                  style={[
                    flexbox.flex1,
                    flexbox.directionRow,
                    flexbox.alignCenter,
                    flexbox.justifyCenter
                  ]}
                >
                  <Text
                    fontSize={20}
                    weight="medium"
                    color="white"
                    style={[{ marginLeft: 18 + SPACING }, spacings.mr]}
                  >
                    {t('Welcome Back')}
                  </Text>
                  <LockIcon color="white" />
                </View>
              </View>
            )}
            <View style={[flexbox.flex1, flexbox.alignCenter, flexbox.justifyCenter]}>
              <AmbireLogoWithTextMonochrome
                width={122}
                height={height < 550 && !isPopup ? 90 : 128}
              />
            </View>
            <View>
              <Text
                fontSize={14}
                weight="medium"
                color="white"
                style={[text.center, spacings.mbXl]}
              >
                {t('Easy and secure self-custody for the\nEthereum ecosystem')}
              </Text>
            </View>
          </View>
          <View
            style={[flexbox.alignCenter, flexbox.justifyCenter, spacings.pvLg, { minHeight: 240 }]}
          >
            <Controller
              control={control}
              render={({ field: { onChange, onBlur, value } }) => (
                <InputPassword
                  testID="passphrase-field"
                  onBlur={onBlur}
                  placeholder={t('Enter Your Password')}
                  autoFocus={isWeb}
                  onChangeText={(val: string) => {
                    onChange(val)
                    if (keystoreState.errorMessage) {
                      dispatch({ type: 'KEYSTORE_CONTROLLER_RESET_ERROR_STATE' })
                    }
                  }}
                  isValid={!errors.password && isValidPassword(value)}
                  value={value}
                  onSubmitEditing={handleSubmit((data) => handleUnlock(data))}
                  error={passwordFieldError}
                  containerStyle={{ ...spacings.mbLg, width: 342 }}
                />
              )}
              name="password"
            />
            <Button
              testID="button-unlock"
              style={{ width: 342, ...spacings.mbLg }}
              disabled={disableSubmit}
              text={
                keystoreState.statuses.unlockWithSecret === 'LOADING'
                  ? t('Unlocking...')
                  : t('Unlock')
              }
              onPress={handleSubmit((data) => handleUnlock(data))}
            />

            <TouchableOpacity
              onPress={() =>
                openInTab({
                  url: `tab.html#/${ROUTES.keyStoreReset}`,
                  shouldCloseCurrentWindow: true
                })
              }
              hitSlop={FOOTER_BUTTON_HIT_SLOP}
            >
              <Text weight="medium" appearance="secondaryText" fontSize={14} underline>
                {t('Forgot extension password?')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Container>
    </TabLayoutContainer>
  )
}

export default React.memo(KeyStoreUnlockScreen)
