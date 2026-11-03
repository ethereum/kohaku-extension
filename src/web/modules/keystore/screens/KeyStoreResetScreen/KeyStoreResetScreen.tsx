import React, { useCallback, useEffect, useMemo } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useModalize } from 'react-native-modalize'

import { EmailVaultState } from '@ambire-common/controllers/emailVault/emailVault'
import { isEmail } from '@ambire-common/services/validations'
import BottomSheet from '@common/components/BottomSheet'
import ModalHeader from '@common/components/BottomSheet/ModalHeader'
import Button from '@common/components/Button'
import Input from '@common/components/Input'
import Text from '@common/components/Text'
import { isWeb } from '@common/config/env'
import useNavigation from '@common/hooks/useNavigation'
import useTheme from '@common/hooks/useTheme'
import Header from '@common/modules/header/components/Header'
import { SPACING_3XL, SPACING_LG } from '@common/styles/spacings'
import { THEME_TYPES } from '@common/styles/themeConfig'
import flexbox from '@common/styles/utils/flexbox'
import {
  TabLayoutContainer,
  TabLayoutWrapperMainContent
} from '@web/components/TabLayoutWrapper/TabLayoutWrapper'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useEmailVaultControllerState from '@web/hooks/useEmailVaultControllerState'
import useKeystoreControllerState from '@web/hooks/useKeystoreControllerState'
import EmailConfirmation from '@web/modules/keystore/components/EmailConfirmation'
import KeyStoreLogo from '@web/modules/keystore/components/KeyStoreLogo'
import ResetEntryGate from '@web/modules/social-recovery/onboarding/recover/ResetEntryGate'

import KeystoreResetForm from '../../components/KeyStoreResetForm'
import styles from './styles'

const KeyStoreResetContent = () => {
  const { t } = useTranslation()

  const {
    watch,
    control,
    formState: { errors, isValid },
    handleSubmit
  } = useForm({
    mode: 'all',
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      isRecoveryByEmailEnabled: false
    }
  })

  const formEmail = watch('email')
  const { theme, themeType } = useTheme()
  const { dispatch } = useBackgroundService()
  const {
    ref: passwordSetModalRef,
    open: openPasswordSetModal,
    close: closePasswordSetModal
  } = useModalize()
  const {
    ref: confirmationModalRef,
    open: openConfirmationModal,
    close: closeConfirmationModal
  } = useModalize()

  const keystoreState = useKeystoreControllerState()
  const ev = useEmailVaultControllerState()
  const isWaitingConfirmation = ev.currentState === EmailVaultState.WaitingEmailConfirmation
  const email = useMemo(
    () => Object.keys(ev.emailVaultStates.email)[0],
    [ev.emailVaultStates.email]
  )

  const handleSendResetEmail = useCallback(() => {
    dispatch({
      type: 'EMAIL_VAULT_CONTROLLER_HANDLE_MAGIC_LINK_KEY',
      params: { email: formEmail, flow: 'recovery' }
    })
  }, [dispatch, formEmail])

  const handleCancelLoginAttempt = useCallback(() => {
    dispatch({
      type: 'EMAIL_VAULT_CONTROLLER_CANCEL_CONFIRMATION'
    })
  }, [dispatch])

  const handleCompleteReset = useCallback(() => {
    handleSubmit(({ password }) => {
      dispatch({
        type: 'EMAIL_VAULT_CONTROLLER_RECOVER_KEYSTORE',
        params: { email, newPass: password }
      })
    })()
  }, [dispatch, email, handleSubmit])

  useEffect(() => {
    if (keystoreState.isUnlocked) {
      openPasswordSetModal()
      return
    }

    closePasswordSetModal()
  }, [closePasswordSetModal, keystoreState.isUnlocked, openPasswordSetModal])

  useEffect(() => {
    if (isWaitingConfirmation) {
      openConfirmationModal()
      return
    }

    closeConfirmationModal()
  }, [closeConfirmationModal, isWaitingConfirmation, openConfirmationModal])

  return (
    <TabLayoutContainer
      width="xs"
      header={
        <Header
          customTitle={t('Restore extension password')}
          withAmbireLogo
          mode="image-and-title"
        />
      }
      footer={
        <View style={[flexbox.flex1, flexbox.alignEnd]}>
          <Button
            disabled={!isValid || isWaitingConfirmation}
            size="large"
            onPress={!ev.hasConfirmedRecoveryEmail ? handleSendResetEmail : handleCompleteReset}
            style={styles.button}
            hasBottomSpacing={false}
            text={
              !ev.hasConfirmedRecoveryEmail
                ? t('Send Confirmation Email')
                : t('Change extension password')
            }
          />
        </View>
      }
    >
      <TabLayoutWrapperMainContent>
        <>
          <KeyStoreLogo width={120} height={120} style={styles.logo} />
          {!ev.hasConfirmedRecoveryEmail ? (
            <>
              <Text style={styles.title} weight="regular" fontSize={14}>
                We don&apos;t store your device password.
              </Text>
              <Text>
                {'\n'}
                To reset it, insert your email, enter the code you receive, and set a new password.
                {'\n'}
                This keeps your wallet secure and accessible only to you.{'\n'}
                {'\n'}
                *Recovery works only if you have already enabled it in settings.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.text} weight="regular" fontSize={14}>
                {t('Your email is confirmed')}.
              </Text>
              <Text style={styles.text} weight="regular" fontSize={14}>
                {t(
                  'To finish the extension password recovery procedure, simply add your new password when prompted'
                )}
                .
              </Text>
            </>
          )}
          {!ev.hasConfirmedRecoveryEmail && (
            <View
              style={[
                {
                  marginVertical: SPACING_LG
                }
              ]}
            >
              <Controller
                control={control}
                rules={{
                  validate: isEmail
                }}
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label={t('Please insert your email')}
                    onBlur={onBlur}
                    placeholder={t('Email Address')}
                    onChangeText={onChange}
                    onSubmitEditing={handleSendResetEmail}
                    value={value}
                    autoFocus={isWeb}
                    isValid={isEmail(value)}
                    error={!!errors.email && (t('Please fill in a valid email.') as string)}
                  />
                )}
                name="email"
              />
            </View>
          )}
          {ev.hasConfirmedRecoveryEmail && (
            <View
              style={[
                styles.currentEmailContainer,
                {
                  marginBottom: SPACING_LG,
                  backgroundColor: theme.secondaryBackground
                }
              ]}
            >
              <Text style={styles.currentEmailLabel} weight="regular" fontSize={14}>
                {t('The recovery email for current extension is')}{' '}
                <Text appearance="primary" fontSize={14} weight="medium">
                  {email}
                </Text>
              </Text>
            </View>
          )}
          {ev.hasConfirmedRecoveryEmail && (
            <KeystoreResetForm
              control={control}
              errors={errors}
              password={watch('password')}
              modalRef={passwordSetModalRef}
              handleChangeKeystorePassword={handleCompleteReset}
            />
          )}
        </>
        <BottomSheet
          id="keystore-reset-confirmation-modal"
          sheetRef={confirmationModalRef}
          backgroundColor={
            themeType === THEME_TYPES.DARK ? 'secondaryBackground' : 'primaryBackground'
          }
          style={{ minWidth: 500, paddingVertical: SPACING_3XL }}
        >
          <ModalHeader title={t('Email Confirmation Required')} />
          <EmailConfirmation
            email={formEmail}
            handleCancelLoginAttempt={handleCancelLoginAttempt}
          />
        </BottomSheet>
      </TabLayoutWrapperMainContent>
    </TabLayoutContainer>
  )
}

const KeyStoreResetScreen = () => {
  const { canGoBack, goBack, navigate } = useNavigation()

  const leave = useCallback(() => {
    if (canGoBack) {
      goBack()
      return
    }
    navigate('/')
  }, [canGoBack, goBack, navigate])

  return (
    <ResetEntryGate onLeave={leave}>
      <KeyStoreResetContent />
    </ResetEntryGate>
  )
}

export default KeyStoreResetScreen
