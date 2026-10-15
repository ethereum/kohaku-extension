/**
 * The approval page over the request its link carries: the notice that the
 * page shows what its link says, the lead, verify the details, then in the
 * sign action's place the signing step while the request lives, the reads
 * not answered yet or failed, or the waiting recovery or the death that ended
 * the request. A live request the account no longer authorizes reads as
 * dormant beside its values, and its sign action stays disabled. The lead's
 * values are the link's, never a chain read, so they stay while a read runs
 * or fails, and so does the tick. The offline block takes the place of the
 * whole page until the guardian goes back; the acknowledgment carries across
 * both.
 */
import React, { useCallback, useMemo, useState } from 'react'
import { View } from 'react-native'

import Alert from '@common/components/Alert'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'

import BrandLine from './BrandLine'
import DetailsBlock from './DetailsBlock'
import LeadBlock from './LeadBlock'
import OfflineBlock from './OfflineBlock'
import OutcomeBlock from './OutcomeBlock'
import { signEnabled } from './reading'
import SignBlock from './SignBlock'
import { keyAllowsSign } from './signing'
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
  keyReading,
  signing,
  typedData,
  onSign,
  onClose,
  onDecline,
  onRetry
}: ApproveViewProps) => {
  const { t } = useTranslation()
  const [acknowledged, setAcknowledged] = useState(false)
  const [offline, setOffline] = useState(false)
  const { description } = described

  const values = useMemo(() => approvalValuesOf(description, t), [description, t])
  const deadline = deadlineViewOf(description.validUntil, now, timeZone, t)
  // Every gate but the key: the values, the deadline, a live reading the
  // account authorizes, the tick, and typed data to sign.
  const gatesHold = signEnabled({ values, deadline, reading, acknowledged }) && typedData !== null
  const enabled = gatesHold && keyAllowsSign(keyReading)

  const sign = useCallback(() => {
    if (enabled) {
      onSign()
    }
  }, [enabled, onSign])
  const add = useCallback(
    (text: string) => {
      if (gatesHold && typedData) {
        signing.addSignature(typedData, text)
      }
    },
    [gatesHold, typedData, signing]
  )
  const openOffline = useCallback(() => setOffline(true), [])
  const back = useCallback(() => setOffline(false), [])

  const header = (
    <>
      <BrandLine />
      <Text fontSize={12} appearance="secondaryText" style={spacings.mbLg} testID="guardian-notice">
        {t(`${PAGE}.notice`)}
      </Text>
    </>
  )

  if (reading.kind === 'live' && offline) {
    return (
      <View testID="guardian-page">
        {header}
        <OfflineBlock
          described={described}
          values={values}
          deadline={deadline}
          typedData={typedData}
          acknowledged={acknowledged}
          onAcknowledged={setAcknowledged}
          enabled={gatesHold}
          busy={signing.busy}
          failure={signing.offlineFailure}
          onAdd={add}
          onBack={back}
          onDecline={onDecline}
        />
      </View>
    )
  }

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
            values={values}
            deadline={deadline}
            keyReading={keyReading}
            busy={signing.busy}
            failure={signing.failure}
            onSign={sign}
            onOpenOffline={openOffline}
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
      {header}
      <LeadBlock values={values} />
      <DetailsBlock described={described} deadline={deadline} networkName={networkName} />
      {inSignPlace()}
    </View>
  )
}

export default React.memo(ApproveView)
