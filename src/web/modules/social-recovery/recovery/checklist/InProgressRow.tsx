/**
 * One recovery this device started and did not submit: the account, its
 * chip, when it started, its headline, whether this device still holds the
 * unlocked path, and the two actions, continue and abandon behind its
 * confirmation.
 */
import React, { useState } from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { ActionsRow, MethodRow, StatusChip } from '@web/modules/social-recovery/shared/chrome'
import { renderChip, renderFullAddress } from '@web/modules/social-recovery/shared/display'

import { dateOf } from './lines'
import type { InProgressRowProps } from './types'

const IN_PROGRESS = 'socialRecovery.inProgress'

const InProgressRow = ({
  item,
  holds,
  useHeadline,
  timeZone,
  busy,
  onContinue,
  onAbandon
}: InProgressRowProps) => {
  const { t } = useTranslation()
  const headline = useHeadline(item)
  const [confirming, setConfirming] = useState(false)
  const id = item.account.toLowerCase()

  return (
    <MethodRow testID={`in-progress-${id}`}>
      <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]}>
        <Text
          fontSize={14}
          weight="number_medium"
          selectable
          style={[flexbox.flex1, spacings.mrSm]}
          testID={`in-progress-${id}-account`}
        >
          {renderFullAddress(item.account)}
        </Text>
        <StatusChip text={renderChip('session', 'notSubmitted', t)} />
      </View>
      <Text fontSize={14} style={spacings.mtTy} testID={`in-progress-${id}-started`}>
        {t(`${IN_PROGRESS}.started`, { date: dateOf(item.startedAt, timeZone) })}
      </Text>
      {!!headline && (
        <Text
          fontSize={14}
          weight="medium"
          style={spacings.mtTy}
          testID={`in-progress-${id}-progress`}
        >
          {t('socialRecovery.checklist.progress', { done: headline.done, total: headline.total })}
        </Text>
      )}
      {holds !== undefined && (
        <Text
          fontSize={12}
          appearance="secondaryText"
          style={spacings.mtTy}
          testID={`in-progress-${id}-path`}
        >
          {t(holds ? `${IN_PROGRESS}.holdsPath` : `${IN_PROGRESS}.asksPassword`)}
        </Text>
      )}
      {confirming ? (
        <>
          <Text fontSize={14} style={spacings.mtSm} testID={`in-progress-${id}-abandon-confirm`}>
            {t('socialRecovery.checklist.abandon.confirm')}
          </Text>
          <ActionsRow
            primary={
              <Button
                testID={`in-progress-${id}-abandon-action`}
                type="danger"
                size="small"
                text={t('socialRecovery.checklist.abandon.confirmAction')}
                disabled={busy}
                onPress={() => onAbandon(item)}
                hasBottomSpacing={false}
              />
            }
            secondary={
              <Button
                testID={`in-progress-${id}-abandon-keep`}
                type="ghost"
                size="small"
                text={t('socialRecovery.checklist.abandon.keep')}
                disabled={busy}
                onPress={() => setConfirming(false)}
                hasBottomSpacing={false}
              />
            }
          />
        </>
      ) : (
        <ActionsRow
          primary={
            <Button
              testID={`in-progress-${id}-continue`}
              type="primary"
              size="small"
              text={t(`${IN_PROGRESS}.continue`)}
              disabled={busy || holds === undefined}
              onPress={() => onContinue(item, !!holds)}
              hasBottomSpacing={false}
            />
          }
          secondary={
            <Button
              testID={`in-progress-${id}-abandon`}
              type="ghost"
              size="small"
              text={t('socialRecovery.checklist.abandon.action')}
              disabled={busy}
              onPress={() => setConfirming(true)}
              hasBottomSpacing={false}
              textUnderline
            />
          }
        />
      )}
    </MethodRow>
  )
}

export default React.memo(InProgressRow)
