import React, { FC, useCallback, useMemo } from 'react'
import { View } from 'react-native'

import ButtonWithLoader from '@common/components/ButtonWithLoader/ButtonWithLoader'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import TextArea from '@common/components/TextArea'
import Input from '@common/components/Input'
import PrivacyProtocolSelector from '@web/components/PrivacyProtocols'
import { usePrivacyPoolsDepositForm } from '@web/hooks/useDepositForm'
import { SelectValue } from '@common/components/Select/types'
import { validateSeedPhrase } from '../../utils/validation'

type Props = {
  handleImportSecretNote: () => void
  isDuplicate: boolean
  isCheckingDuplicate: boolean
  accountName: string
  onAccountNameChange: (name: string) => void
  changeProtocol: (protocol: SelectValue) => void
  selectedProtocol: SelectValue
}

const ImportForm: FC<Props> = ({
  handleImportSecretNote,
  isDuplicate,
  isCheckingDuplicate,
  changeProtocol,
  selectedProtocol,
  accountName,
  onAccountNameChange
}) => {
  const { t } = useTranslation()
  const { seedPhrase, handleUpdateForm } = usePrivacyPoolsDepositForm()

  const seedPhraseValidation = useMemo(() => validateSeedPhrase(seedPhrase), [seedPhrase])

  // TODO: mnemonics are currently not supported
  const onInputChange = useCallback(() => {
    // handleUpdateForm({ seedPhrase: value })
  }, [handleUpdateForm])

  const isButtonDisabled =
    !seedPhrase ||
    !seedPhraseValidation.isValid ||
    isDuplicate ||
    isCheckingDuplicate ||
    !accountName.trim()

  return (
    <View>
      <PrivacyProtocolSelector
        changeProtocol={changeProtocol}
        selectedProtocol={selectedProtocol}
        direction="column"
        labelWeight="regular"
        containerStyle={[spacings.mbMi]}
      />
      <Input
        disabled={selectedProtocol.value === 'railgun'}
        value={accountName}
        onChangeText={onAccountNameChange}
        label={t('Account Name')}
        placeholder={t('Enter account name')}
        inputStyle={spacings.mbSm}
        containerStyle={spacings.mbXl}
      />
      <TextArea
        disabled={selectedProtocol.value === 'railgun'}
        onChangeText={onInputChange}
        label={t('Recovery Phrase')}
        placeholder={t(
          `Write or paste your ${
            selectedProtocol.value === 'railgun' ? 'Railgun' : 'Privacy Pool'
          } recovery phrase`
        )}
        multiline
        numberOfLines={4}
        style={{ minHeight: 80 }}
        value={seedPhrase}
        inputStyle={spacings.mbSm}
        containerStyle={spacings.mbXl}
        error={
          isDuplicate && seedPhrase
            ? 'This recovery phrase has already been imported'
            : seedPhraseValidation.error || ''
        }
      />
      <ButtonWithLoader
        disabled={selectedProtocol.value === 'railgun' || isButtonDisabled}
        text={t(selectedProtocol.value === 'railgun' ? 'Railgun coming soon' : 'Import Account')}
        isLoading={isCheckingDuplicate}
        style={{ ...spacings.ml0 }}
        onPress={handleImportSecretNote}
      />
    </View>
  )
}

export default React.memo(ImportForm)
