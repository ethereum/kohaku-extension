/**
 * An open attempt as the banner names it: the title where the banner's own
 * does not stand for it, the new key in full (or that it is still read), the
 * end in the reader's zone with the countdown against the reading's block
 * time, or, once the wait ended, that the recovery can execute at any moment.
 * While the account does not authorize the action, the dormant line stands
 * alone in place of all of these. Then the two actions, the line under them,
 * and the roads this release offers: only the account's own key cancels, and
 * editing the setup or removing recovery cancels too.
 */
import React, { useCallback, useMemo, useState } from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import {
  countdownStateOf,
  renderCountdownTime,
  renderDateTimeInZone,
  renderFullAddress,
  renderValueLabel
} from '@web/modules/social-recovery/shared/display'
import useCountdownClock from '@web/modules/social-recovery/recovery/wait/useCountdownClock'

import { anchorOf } from './readings'
import type { AttemptLinesProps } from './types'

const BANNER = 'socialRecovery.watcher.banner'

const AttemptLines = ({
  open,
  titled,
  account,
  timeZone,
  onCancel,
  onDismiss
}: AttemptLinesProps) => {
  const { t } = useTranslation()
  const { attempt, dormant } = open
  const id = account.toLowerCase()
  const anchor = useMemo(() => anchorOf(open), [open])
  const remainingMs = useCountdownClock(anchor)
  const [dismissing, setDismissing] = useState(false)

  const due =
    !dormant &&
    (attempt.executionDue ||
      (remainingMs !== null && countdownStateOf(remainingMs) === 'executionDue'))
  const endDate = renderDateTimeInZone(attempt.consumableAfter * 1000, timeZone).date

  const dismiss = useCallback(() => {
    setDismissing(true)
    onDismiss(account, attempt.attemptId)
      .catch(() => undefined)
      .finally(() => setDismissing(false))
  }, [onDismiss, account, attempt.attemptId])

  const line = (text: string, testID: string, secondary = false) => (
    <Text
      fontSize={14}
      appearance={secondary ? 'secondaryText' : 'primaryText'}
      style={spacings.mbTy}
      testID={testID}
    >
      {text}
    </Text>
  )

  let when: React.ReactNode
  if (dormant) {
    when = line(t(`${BANNER}.dormant`), `recovery-banner-${id}-dormant`)
  } else if (due) {
    when = (
      <>
        {line(t(`${BANNER}.dueBody`, { date: endDate }), `recovery-banner-${id}-due`)}
        {line(t(`${BANNER}.dueCancel`), `recovery-banner-${id}-due-cancel`)}
      </>
    )
  } else {
    when = (
      <>
        {line(t(`${BANNER}.finishes`, { date: endDate }), `recovery-banner-${id}-finishes`)}
        {remainingMs !== null &&
          line(
            t(`${BANNER}.waiting`, { countdown: renderCountdownTime(remainingMs) }),
            `recovery-banner-${id}-countdown`
          )}
      </>
    )
  }

  return (
    <View testID={`recovery-banner-${id}-attempt`}>
      {(due || titled) && (
        <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.wrap, spacings.mbTy]}>
          {due && (
            <Text
              fontSize={12}
              weight="semiBold"
              appearance="warningText"
              style={spacings.mrSm}
              testID={`recovery-banner-${id}-chip`}
            >
              {t(`${BANNER}.executionDue`)}
            </Text>
          )}
          {titled && (
            <Text fontSize={16} weight="medium" testID={`recovery-banner-${id}-title`}>
              {t(`${BANNER}.title`)}
            </Text>
          )}
        </View>
      )}
      <View style={spacings.mbTy}>
        <Text fontSize={12} appearance="secondaryText">
          {renderValueLabel('newKey', t)}
        </Text>
        <Text
          fontSize={14}
          weight="number_medium"
          selectable
          testID={`recovery-banner-${id}-new-key`}
        >
          {attempt.newKey ? renderFullAddress(attempt.newKey) : t(`${BANNER}.newKeyPending`)}
        </Text>
      </View>
      {when}
      <View style={[flexbox.directionRow, flexbox.wrap, spacings.mtTy, spacings.mbTy]}>
        <Button
          testID={`recovery-banner-${id}-not-me`}
          type="warning"
          size="small"
          text={t(`${BANNER}.notMe`)}
          onPress={() => onCancel(account)}
          hasBottomSpacing={false}
          style={spacings.mrSm}
        />
        <Button
          testID={`recovery-banner-${id}-is-me`}
          type="secondary"
          size="small"
          text={t(`${BANNER}.isMe`)}
          onPress={dismiss}
          disabled={dismissing}
          hasBottomSpacing={false}
        />
      </View>
      {line(t(`${BANNER}.hidesOnly`), `recovery-banner-${id}-hides-only`, true)}
      {line(t(`${BANNER}.onlyOwnKey`), `recovery-banner-${id}-only-own-key`, true)}
      {line(t(`${BANNER}.editCancels`), `recovery-banner-${id}-edit-cancels`, true)}
    </View>
  )
}

export default React.memo(AttemptLines)
