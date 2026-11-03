/** The approval's step counter, drawn under the brand line. */
import React from 'react'

import { StepCounter } from '@web/modules/social-recovery/shared/chrome'

import { GUARDIAN_STAGE_COUNTER_KEY, GUARDIAN_STAGES } from './constants'
import type { StageLineProps } from './types'

const StageLine = ({ step }: StageLineProps) => (
  <StepCounter
    labelKey={GUARDIAN_STAGE_COUNTER_KEY}
    step={step}
    total={GUARDIAN_STAGES}
    testID="guardian-stage-counter"
  />
)

export default React.memo(StageLine)
