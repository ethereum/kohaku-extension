/**
 * The in-page prover at work: the progress line of its step and the stop.
 */
import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Spinner from '@common/components/Spinner'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'

import type { ProverBlockProps } from './types'

const ProverBlock = ({ step, onStop }: ProverBlockProps) => {
  const { t } = useTranslation()

  const stepLine = () => {
    switch (step) {
      case 'fetchingFiles':
        return t('socialRecovery.ceremony.fetchingFiles')
      case 'proving':
        return t('socialRecovery.ceremony.proving')
      default:
        return t('socialRecovery.ceremony.checkingResult')
    }
  }

  return (
    <View style={[flexbox.alignCenter]}>
      <Spinner style={spacings.mbSm} />
      <Text style={{ textAlign: 'center' }}>{stepLine()}</Text>
      <Button
        type="secondary"
        text={t('socialRecovery.ceremony.stopAction')}
        onPress={onStop}
        style={spacings.mtLg}
      />
    </View>
  )
}

export default React.memo(ProverBlock)
