import React, { FC, useCallback } from 'react'
import { View } from 'react-native'

import ButtonWithLoader from '@common/components/ButtonWithLoader/ButtonWithLoader'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import TextArea from '@common/components/TextArea'
import Input from '@common/components/Input'
import usePrivacyPoolsForm from '../../hooks/usePrivacyPoolsForm'

type Props = {
  handleImportSecretNote: () => void
  isDuplicate: boolean
  isCheckingDuplicate: boolean
  accountName: string
  onAccountNameChange: (name: string) => void
}

const ImportForm: FC<Props> = ({
  handleImportSecretNote,
  isDuplicate,
  isCheckingDuplicate,
  accountName,
  onAccountNameChange
}) => {
  const { t } = useTranslation()
  const { seedPhrase, handleUpdateForm } = usePrivacyPoolsForm()

  const onInputChange = useCallback(
    (value: string) => {
      handleUpdateForm({ seedPhrase: value })
    },
    [handleUpdateForm]
  )

  const isButtonDisabled = !seedPhrase || isDuplicate || isCheckingDuplicate || !accountName.trim()

  return (
    <View>
      <Input
        value={accountName}
        onChangeText={onAccountNameChange}
        label={t('Account Name')}
        placeholder={t('Enter account name')}
        inputStyle={spacings.mbSm}
        containerStyle={spacings.mbXl}
      />
      <TextArea
        onChangeText={onInputChange}
        label={t('Recovery Phrase')}
        placeholder={t('Write or paste your Privacy Pool recovery phrase')}
        multiline
        numberOfLines={4}
        style={{ minHeight: 80 }}
        value={seedPhrase}
        inputStyle={spacings.mbSm}
        containerStyle={spacings.mbXl}
        error={isDuplicate && seedPhrase ? 'This recovery phrase has already been imported' : ''}
      />
      <ButtonWithLoader
        disabled={isButtonDisabled}
        text={t('Import Account')}
        isLoading={isCheckingDuplicate}
        style={{ ...spacings.ml0 }}
        onPress={handleImportSecretNote}
      />
    </View>
  )
}

export default React.memo(ImportForm)
