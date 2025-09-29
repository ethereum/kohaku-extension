import React, { FC, useCallback } from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Input from '@common/components/Input'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import useBackgroundService from '@web/hooks/useBackgroundService'
import usePrivacyPoolsControllerState from '@web/hooks/usePrivacyPoolsControllerState'

type Props = {
  handleImportSecretNote: () => void
}

const ImportForm: FC<Props> = ({ handleImportSecretNote }) => {
  const { t } = useTranslation()
  const { importedSecretNote } = usePrivacyPoolsControllerState()

  const { dispatch } = useBackgroundService()

  const onInputChange = useCallback(
    (value: string) => {
      dispatch({
        type: 'PRIVACY_POOLS_CONTROLLER_UPDATE_FORM',
        params: {
          importedSecretNote: value
        }
      })
    },
    [dispatch]
  )

  return (
    <View>
      <Input
        onChangeText={onInputChange}
        label={t('Secret Note')}
        placeholder={t('Enter your secret note')}
        value={importedSecretNote}
        inputStyle={spacings.mbSm}
        containerStyle={spacings.mbXl}
      />
      <Button
        disabled={!importedSecretNote}
        text={t('Import Secret Note')}
        hasBottomSpacing={false}
        onPress={handleImportSecretNote}
      />
    </View>
  )
}

export default React.memo(ImportForm)
