/**
 * The chrome a recovery screen draws by its route. On the fresh install it is
 * the plain header with the screen's title and no counter. On the logged-in
 * route, and where the route is not known, it is the settings chrome, with the
 * stage counter where the screen gives a stage. A recovery leaves the setup
 * tab's account alone, so the settings chrome skips the account latch.
 */
import React from 'react'

import { useTranslation } from '@common/config/localization'

import { RECOVERY_STAGE_COUNTER_KEY, RECOVERY_STAGES } from './constants'
import PlainChrome from './PlainChrome'
import SetupChrome from './SetupChrome'
import StepCounter from './StepCounter'
import type { RecoveryChromeProps } from './types'

const RecoveryChrome = ({ route, titleKey, stage, children, testID }: RecoveryChromeProps) => {
  const { t } = useTranslation()

  if (route === 'fresh-install') {
    return (
      <PlainChrome title={t(titleKey)} testID={testID}>
        {children}
      </PlainChrome>
    )
  }
  return (
    <SetupChrome testID={testID} skipAccountLatch>
      {!!stage && (
        <StepCounter
          labelKey={RECOVERY_STAGE_COUNTER_KEY}
          step={stage.step}
          total={RECOVERY_STAGES}
          testID={stage.testID}
        />
      )}
      {children}
    </SetupChrome>
  )
}

export default React.memo(RecoveryChrome)
