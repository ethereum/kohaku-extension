import React, { FC, useCallback } from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Input from '@common/components/Input'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import usePrivacyPoolsForm from '../../hooks/usePrivacyPoolsForm'

type Props = {
  handleImportSecretNote: () => void
}

const ImportForm: FC<Props> = ({ handleImportSecretNote }) => {
  const { t } = useTranslation()
  const { seedPhrase, handleUpdateForm } = usePrivacyPoolsForm()

  const onInputChange = useCallback(
    (value: string) => {
      handleUpdateForm({ seedPhrase: value })
    },
    [handleUpdateForm]
  )

  return (
    <View>
      <Input
        onChangeText={onInputChange}
        label={t('PPv1 Account')}
        placeholder={t('Enter your mnemonic')}
        value={seedPhrase}
        inputStyle={spacings.mbSm}
        containerStyle={spacings.mbXl}
      />
      <Button
        disabled={!seedPhrase}
        text={t('Import PPv1 Account')}
        hasBottomSpacing={false}
        onPress={handleImportSecretNote}
      />
    </View>
  )
}

export default React.memo(ImportForm)
