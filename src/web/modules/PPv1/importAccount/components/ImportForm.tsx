import React, { FC, useCallback } from 'react'
import { View } from 'react-native'

import ButtonWithLoader from '@common/components/ButtonWithLoader/ButtonWithLoader'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import TextArea from '@common/components/TextArea'
import usePrivacyPoolsForm from '../../hooks/usePrivacyPoolsForm'

type Props = {
  handleImportSecretNote: () => void
  isDuplicate: boolean
  isCheckingDuplicate: boolean
}

const ImportForm: FC<Props> = ({ handleImportSecretNote, isDuplicate, isCheckingDuplicate }) => {
  const { t } = useTranslation()
  const { seedPhrase, handleUpdateForm } = usePrivacyPoolsForm()

  const onInputChange = useCallback(
    (value: string) => {
      handleUpdateForm({ seedPhrase: value })
    },
    [handleUpdateForm]
  )

  const isButtonDisabled = !seedPhrase || isDuplicate || isCheckingDuplicate

  return (
    <View>
      <TextArea
        onChangeText={onInputChange}
        label={t('')}
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
