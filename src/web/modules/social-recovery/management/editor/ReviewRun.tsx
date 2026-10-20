/**
 * The save on its way: the refusal of a setup the account no longer
 * authorizes while an attempt is open, the line that saving cancels the
 * attempt in progress, the write in the shared states, and the way back to
 * the editor wherever nothing is on its way to the chain.
 */
import React from 'react'
import { View } from 'react-native'

import Alert from '@common/components/Alert'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import RunBlock from '@web/modules/social-recovery/management/overview/RunBlock'

import { REVIEW } from './constants'
import { nothingOnItsWay } from './readings'
import type { ReviewRunProps } from './types'

const ReviewRun = ({ run, attemptOpen, dormantRefused, backToEditor }: ReviewRunProps) => {
  const { t } = useTranslation()
  return (
    <View>
      {dormantRefused && (
        <Alert
          testID="manage-review-run-dormant-refused"
          type="error"
          size="sm"
          style={spacings.mbSm}
          text={t(`${REVIEW}.dormantRefused`)}
        />
      )}
      {attemptOpen && !dormantRefused && (
        <Text fontSize={14} weight="medium" style={spacings.mbSm}>
          {t(`${REVIEW}.cancelsLine`)}
        </Text>
      )}
      <RunBlock
        run={run}
        write="edit"
        droppedLine="socialRecovery.arm.dropped"
        testID="manage-review-run"
      />
      {nothingOnItsWay(run.state) && (
        <View style={[flexbox.directionRow, spacings.mtSm]}>{backToEditor}</View>
      )}
    </View>
  )
}

export default React.memo(ReviewRun)
