/**
 * What the page draws while no answered reading stands: the reads not
 * answered yet, a client or a read that failed, with a retry, and a request
 * aimed at another deployment, with none. The sign action beneath stays
 * disabled.
 */
import React from 'react'
import { View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import LoadingBlock from '@web/modules/social-recovery/shared/chrome/LoadingBlock'

import type { StatusBlockProps } from './types'

const PAGE = 'socialRecovery.guardianPage'

const StatusBlock = ({ reading, onRetry }: StatusBlockProps) => {
  const { t } = useTranslation()

  const disabledSign = (
    <Button
      testID="guardian-sign"
      type="primary"
      text={t(`${PAGE}.actions.sign`)}
      disabled
      hasBottomSpacing={false}
    />
  )

  if (reading.kind === 'reading') {
    return (
      <View>
        <View
          testID="guardian-reading"
          style={[flexbox.directionRow, flexbox.alignCenter, spacings.mbSm]}
        >
          <LoadingBlock variant="row" message={t(`${PAGE}.reading`)} />
        </View>
        {disabledSign}
      </View>
    )
  }

  if (reading.kind === 'failed') {
    return (
      <View testID="guardian-read-failed">
        <Alert type="error" size="sm" style={spacings.mbSm} title={t(`${PAGE}.readFailed`)}>
          <View style={[flexbox.directionRow, spacings.mtTy]}>
            <Button
              testID="guardian-read-retry"
              type="secondary"
              size="small"
              text={t(`${PAGE}.actions.tryAgain`)}
              onPress={onRetry}
              hasBottomSpacing={false}
            />
          </View>
        </Alert>
        {disabledSign}
      </View>
    )
  }

  if (reading.kind === 'other-deployment') {
    return (
      <View testID="guardian-other-deployment">
        <Alert type="error" size="sm" style={spacings.mbSm} title={t(`${PAGE}.otherDeployment`)} />
        {disabledSign}
      </View>
    )
  }

  return null
}

export default React.memo(StatusBlock)
