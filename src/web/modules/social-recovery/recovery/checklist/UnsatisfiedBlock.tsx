/**
 * Why the path is not satisfied yet, named from the holder's own rows: a
 * required method that did not answer this time, with every approval kept; a
 * group whose rows still open cannot reach its threshold; a guardian row
 * still open; or rows outstanding.
 */
import React from 'react'

import Alert from '@common/components/Alert'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'

import type { UnsatisfiedBlockProps } from './types'

const UNSATISFIED = 'socialRecovery.checklist.unsatisfied'

const UnsatisfiedBlock = ({ reading }: UnsatisfiedBlockProps) => {
  const { t } = useTranslation()
  const testID = `checklist-unsatisfied-${reading.kind}`

  switch (reading.kind) {
    case 'didNotAnswer':
      return (
        <Alert
          testID={testID}
          type="warning"
          size="sm"
          style={spacings.mbSm}
          title={t(`${UNSATISFIED}.didNotAnswerTitle`)}
          text={`${t(`${UNSATISFIED}.didNotAnswer`)} ${t(`${UNSATISFIED}.approvalsKept`)}`}
        />
      )
    case 'groupCannotReach':
      return (
        <Alert
          testID={testID}
          type="warning"
          size="sm"
          style={spacings.mbSm}
          text={t(`${UNSATISFIED}.groupCannotReach`)}
        />
      )
    case 'guardianOpen':
      return (
        <Alert
          testID={testID}
          type="info"
          size="sm"
          style={spacings.mbSm}
          text={t(`${UNSATISFIED}.guardianOpen`)}
        />
      )
    case 'needsMore':
    default:
      return (
        <Alert
          testID={testID}
          type="info"
          size="sm"
          style={spacings.mbSm}
          title={t(`${UNSATISFIED}.needsMoreTitle`)}
          text={t(`${UNSATISFIED}.needsMore`)}
        />
      )
  }
}

export default React.memo(UnsatisfiedBlock)
