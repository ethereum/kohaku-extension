import React from 'react'
import { View } from 'react-native'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import TextArea from '@common/components/TextArea'
import Alert from '@common/components/Alert'
import Heading from '@common/components/Heading'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'

interface SeedPhraseManagerProps {
  message: { type: 'success' | 'error'; text: string } | null
  seedPhrase?: string
  isGenerating?: boolean
  isLoadingAccount?: boolean
  isLoading?: boolean
  onLoadAccount?: () => void
  onGenerateSeedPhrase?: () => void
  onUpdateForm: (params: { [key: string]: any }) => void
}

const SeedPhraseManager = ({
  message,
  seedPhrase,
  isGenerating,
  isLoadingAccount,
  isLoading,
  onLoadAccount,
  onGenerateSeedPhrase,
  onUpdateForm
}: SeedPhraseManagerProps) => {
  return (
    <View style={[spacings.mb24]}>
      <Heading style={[spacings.mb16, { textAlign: 'center' }]}>Account Manager</Heading>

      <Text appearance="secondaryText" style={[spacings.mb24]}>
        Generate a new seed phrase or enter an existing one to load your privacy pool account.
      </Text>

      <View style={[spacings.mb24]}>
        <TextArea
          label="Seed Phrase"
          value={seedPhrase}
          onChange={(event: any) => onUpdateForm({ seedPhrase: event.target.value })}
          placeholder="Enter your 12 or 24 word seed phrase..."
          multiline
          numberOfLines={4}
          style={{ minHeight: 80 }}
        />
      </View>

      <View style={[flexbox.directionRow, flexbox.justifySpaceBetween, spacings.mb16]}>
        <Button
          type="primary"
          onPress={onGenerateSeedPhrase}
          disabled={isGenerating || isLoadingAccount || isLoading}
          text={isGenerating ? 'Generating...' : 'Generate New Seed Phrase'}
        />

        <Button
          type="secondary"
          onPress={onLoadAccount}
          disabled={!seedPhrase?.trim() || isGenerating || isLoadingAccount || isLoading}
          text={isLoadingAccount ? 'Loading Account...' : 'Load Existing Account'}
        />
      </View>

      {message && <Alert type={message.type} text={message.text} style={spacings.mt16} />}
    </View>
  )
}

export default React.memo(SeedPhraseManager)
