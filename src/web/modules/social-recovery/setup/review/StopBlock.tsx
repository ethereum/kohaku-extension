import React from 'react'
import { ActivityIndicator, View } from 'react-native'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { SectionCard, StatusChip } from '@web/modules/social-recovery/shared/chrome'
import {
  renderFullAddress,
  renderNoun,
  renderShortAddress
} from '@web/modules/social-recovery/shared/display'

import { kindNameOf } from './lead'
import type { StopBlockProps, StopRow } from './types'

const STOP = 'socialRecovery.review.stop'

/**
 * The security stop block: one row per method of the path from its own
 * declaration and its stop read, the party that can stop it or that nobody
 * can, the address one acceptance away from that role, the line where one
 * party holds both roles, then the kit's own lack of a pause and the sentence
 * that this release ignores every stop. It offers no control.
 */
const StopBlock = ({ rows }: StopBlockProps) => {
  const { t } = useTranslation()

  const line = (text: string, testID?: string) => (
    <Text fontSize={12} appearance="secondaryText" style={spacings.mbTy} testID={testID}>
      {text}
    </Text>
  )

  const renderRow = ({ method, kind, stop }: StopRow, testID: string) => {
    const name = kind ? kindNameOf(kind, t) : renderFullAddress(method)
    if (stop.status === 'pending' || stop.status === 'unavailable') {
      return (
        <View style={[flexbox.directionRow, flexbox.alignCenter]}>
          <Text fontSize={14} weight="medium" style={spacings.mrSm} testID={`${testID}-method`}>
            {name}
          </Text>
          {stop.status === 'pending' ? (
            <ActivityIndicator testID={`${testID}-pending`} />
          ) : (
            <StatusChip
              text={t('socialRecovery.review.blocked.unavailable.chip')}
              tone="error"
              testID={`${testID}-unavailable`}
            />
          )}
        </View>
      )
    }
    return (
      <>
        <Text fontSize={14} weight="medium" style={spacings.mbMi} testID={`${testID}-method`}>
          {stop.paused
            ? t(`${STOP}.methodStopped`, { method: name })
            : t(`${STOP}.methodNotStopped`, { method: name })}
        </Text>
        {stop.pauseHolder
          ? line(
              t(`${STOP}.party`, { party: renderShortAddress(stop.pauseHolder) }),
              `${testID}-party`
            )
          : line(t(`${STOP}.nobody`), `${testID}-nobody`)}
        {!!stop.pendingPauseHolder &&
          line(
            t('socialRecovery.review.trust.oneAcceptanceAway', {
              address: renderFullAddress(stop.pendingPauseHolder)
            }),
            `${testID}-pending-holder`
          )}
        {!!stop.bothRoles &&
          line(
            t(`${STOP}.bothRoles`, { party: renderShortAddress(stop.bothRoles) }),
            `${testID}-both-roles`
          )}
      </>
    )
  }

  return (
    <SectionCard
      tone="muted"
      label={renderNoun('securityStop', t)}
      spacing="item"
      testID="review-stop-block"
    >
      {rows.map((row, index) => {
        const testID = `review-stop-${index}`
        return (
          <View key={row.method} testID={testID} style={spacings.mbSm}>
            {renderRow(row, testID)}
          </View>
        )
      })}
      {line(t(`${STOP}.noPause`), 'review-stop-no-pause')}
      {line(t(`${STOP}.ignoresStops`), 'review-stop-ignores-stops')}
    </SectionCard>
  )
}

export default React.memo(StopBlock)
