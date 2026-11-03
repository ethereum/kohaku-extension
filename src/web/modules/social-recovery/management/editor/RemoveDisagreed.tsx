/**
 * The removal whose check after the landing disagreed: the chain still reads
 * a setup or an authorization for the account. The holder reads the check
 * again, or opens the overview, which reads what stands.
 */
import React from 'react'
import { View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { OVERVIEW } from '@web/modules/social-recovery/management/overview/constants'

import { REMOVE } from './constants'
import type { RemoveDisagreedProps } from './types'

const RemoveDisagreed = ({ reading, onReadAgain, onOverview }: RemoveDisagreedProps) => {
  const { t } = useTranslation()
  return (
    <Alert
      testID="manage-remove-check-disagreed"
      type="error"
      size="sm"
      style={spacings.mbSm}
      title={t(`${REMOVE}.disagreedTitle`)}
      text={t(`${REMOVE}.disagreedBody`)}
    >
      <View style={[flexbox.directionRow, flexbox.wrap, spacings.mtTy]}>
        <Button
          testID="manage-remove-check-disagreed-read-again"
          type="primary"
          size="small"
          text={t(`${REMOVE}.readAgain`)}
          onPress={onReadAgain}
          disabled={reading}
          style={spacings.mrTy}
          hasBottomSpacing={false}
        />
        <Button
          testID="manage-remove-check-disagreed-overview"
          type="secondary"
          size="small"
          text={t(`${OVERVIEW}.writes.openOverview`)}
          onPress={onOverview}
          hasBottomSpacing={false}
        />
      </View>
    </Alert>
  )
}

export default React.memo(RemoveDisagreed)
