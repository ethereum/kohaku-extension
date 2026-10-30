/**
 * The removal on its way: the line that removing cancels the attempt in
 * progress, the write in the shared states with the removal held while the
 * gas check runs, and the way back wherever nothing is on its way to the
 * chain.
 */
import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import RunBlock from '@web/modules/social-recovery/management/overview/RunBlock'

import { REMOVE } from './constants'
import { nothingOnItsWay } from './readings'
import RemoveCancelsLine from './RemoveCancelsLine'
import type { RemoveRunProps } from './types'

const RemoveRun = ({ run, attemptOpen, keep }: RemoveRunProps) => {
  const { t } = useTranslation()
  return (
    <View>
      {attemptOpen && <RemoveCancelsLine />}
      <RunBlock
        run={run}
        write="ownerWrite"
        droppedLine="socialRecovery.arm.dropped"
        action={
          <Button
            testID="manage-remove-action"
            type="danger"
            text={t(`${REMOVE}.action`)}
            disabled
            hasBottomSpacing={false}
          />
        }
        testID="manage-remove-run"
      />
      {nothingOnItsWay(run.state) && (
        <View style={[flexbox.directionRow, spacings.mtSm]}>{keep}</View>
      )}
    </View>
  )
}

export default React.memo(RemoveRun)
