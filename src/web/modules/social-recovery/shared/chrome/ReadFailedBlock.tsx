/** A read that did not answer: its title, its line, any further lines and a retry. */
import React from 'react'
import { View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'

import type { ReadFailedBlockProps } from './types'

const ReadFailedBlock = ({
  title,
  body,
  onRetry,
  testID,
  retryTestID,
  children
}: ReadFailedBlockProps) => {
  const { t } = useTranslation()

  return (
    <Alert testID={testID} type="error" size="sm" style={spacings.mbSm} title={title} text={body}>
      {children}
      <View style={[flexbox.directionRow, spacings.mtTy]}>
        <Button
          testID={retryTestID ?? `${testID}-retry`}
          type="secondary"
          size="small"
          text={t('socialRecovery.writes.tryAgain')}
          onPress={onRetry}
          hasBottomSpacing={false}
        />
      </View>
    </Alert>
  )
}

export default React.memo(ReadFailedBlock)
