import React, { FC, useCallback } from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import TextArea from '@common/components/TextArea'
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
      />
      <Button
        disabled={!seedPhrase}
        text={t('Import Account')}
        hasBottomSpacing={false}
        onPress={handleImportSecretNote}
      />
    </View>
  )
}

export default React.memo(ImportForm)
