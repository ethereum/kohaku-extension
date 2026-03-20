import { FC } from 'react'
import { Controller, FieldErrorsImpl } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { isValidPassword } from '@ambire-common/services/validations'
import Input from '@common/components/Input'
import InputPassword from '@common/components/InputPassword'
import { isWeb } from '@common/config/env'
import useNavigation from '@common/hooks/useNavigation'
import { ROUTES } from '@common/modules/router/constants/common'
import PasswordSetModal from '@web/components/PasswordSetModal'

import styles from './styles'

interface Props {
  password: string
  control: any
  errors: Partial<
    FieldErrorsImpl<{
      password: string
      confirmPassword: string
    }>
  >
  modalRef: any
  handleChangeKeystorePassword: () => void
}

const KeystoreResetForm: FC<Props> = ({
  password,
  control,
  errors,
  modalRef,
  handleChangeKeystorePassword
}) => {
  const { t } = useTranslation()
  const { navigate } = useNavigation()

  return (
    <>
      <Controller
        control={control}
        rules={{ validate: isValidPassword }}
        render={({ field: { onChange, onBlur, value } }) => (
          <InputPassword
            onBlur={onBlur}
            placeholder={t('Enter Password')}
            onChangeText={onChange}
            isValid={isValidPassword(value)}
            autoFocus={isWeb}
            value={value}
            error={
              errors.password && (t('Please fill in at least 8 characters for password.') as string)
            }
            containerStyle={styles.passwordInput}
            onSubmitEditing={handleChangeKeystorePassword}
          />
        )}
        name="password"
      />
      <Controller
        control={control}
        rules={{
          validate: (value) => password === value
        }}
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            onBlur={onBlur}
            placeholder={t('Repeat Password')}
            onChangeText={onChange}
            value={value}
            isValid={!!value && password === value}
            secureTextEntry
            error={errors.confirmPassword && (t("Passwords don't match.") as string)}
            autoCorrect={false}
            containerStyle={styles.confirmPasswordInput}
            onSubmitEditing={handleChangeKeystorePassword}
          />
        )}
        name="confirmPassword"
      />
      <PasswordSetModal modalRef={modalRef} onPress={() => navigate(ROUTES.mainDashboard)} />
    </>
  )
}

export default KeystoreResetForm
