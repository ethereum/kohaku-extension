/**
 * The approval page over the request its link carries: the notice that the
 * page shows what its link says, the lead, verify the details, then in the
 * sign action's place the acknowledgment and the actions while the request
 * lives, the reads not answered yet or failed, or the waiting recovery or the
 * death that ended the request. A live request the account no longer
 * authorizes reads as dormant beside its values, and its sign action stays
 * disabled. The lead's values are the link's, never a chain read, so they
 * stay while a read runs or fails, and so does the tick.
 */
import React, { useMemo, useState } from 'react'
import { View } from 'react-native'

import Alert from '@common/components/Alert'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'

import DetailsBlock from './DetailsBlock'
import LeadBlock from './LeadBlock'
import OutcomeBlock from './OutcomeBlock'
import { signEnabled } from './reading'
import SignBlock from './SignBlock'
import StatusBlock from './StatusBlock'
import type { ApproveViewProps } from './types'
import { approvalValuesOf, deadlineViewOf } from './values'

const PAGE = 'socialRecovery.guardianPage'

const ApproveView = ({
  described,
  reading,
  networkName,
  now,
  timeZone,
  onClose,
  onDecline,
  onRetry
}: ApproveViewProps) => {
  const { t } = useTranslation()
  const [acknowledged, setAcknowledged] = useState(false)
  const { description } = described

  const values = useMemo(() => approvalValuesOf(description, t), [description, t])
  const deadline = deadlineViewOf(description.validUntil, now, timeZone, t)
  const enabled = signEnabled({ values, deadline, reading, acknowledged })

  const inSignPlace = () => {
    if (reading.kind === 'live') {
      return (
        <>
          {!reading.authorized && (
            <Alert
              testID="guardian-dormant"
              type="warning"
              size="sm"
              style={spacings.mbSm}
              text={t(`${PAGE}.dormant`)}
            />
          )}
          <SignBlock
            acknowledged={acknowledged}
            onAcknowledged={setAcknowledged}
            enabled={enabled}
            onDecline={onDecline}
          />
        </>
      )
    }
    if (reading.kind === 'reading' || reading.kind === 'failed') {
      return <StatusBlock reading={reading} onRetry={onRetry} />
    }
    return <OutcomeBlock reading={reading} now={now} timeZone={timeZone} onClose={onClose} />
  }

  return (
    <View testID="guardian-page">
      <Text fontSize={12} appearance="secondaryText" style={spacings.mbTy}>
        {t(`${PAGE}.brand`)}
      </Text>
      <Text fontSize={12} appearance="secondaryText" style={spacings.mbLg} testID="guardian-notice">
        {t(`${PAGE}.notice`)}
      </Text>
      <LeadBlock values={values} />
      <DetailsBlock described={described} deadline={deadline} networkName={networkName} />
      {inSignPlace()}
    </View>
  )
}

export default React.memo(ApproveView)
