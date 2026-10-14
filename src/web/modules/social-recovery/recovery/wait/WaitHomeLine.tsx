/**
 * One submitted recovery on the home surface: the account being recovered
 * with the waiting period running and its countdown, or execution due, as the
 * latest attempt read gives it, and the way to open the wait. While that read
 * loads, fails, names another reading or names an attempt that is not the one
 * the submission landed, the line names the account alone.
 */
import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { MethodRow, StatusChip } from '@web/modules/social-recovery/shared/chrome'
import {
  renderChip,
  renderCountdown,
  renderShortAddress
} from '@web/modules/social-recovery/shared/display'

import type { WaitHomeLineProps } from './types'
import useCountdownClock from './useCountdownClock'
import useCountdownHeadline from './useCountdownHeadline'

const HOME = 'socialRecovery.home'

const WaitHomeLine = ({
  account,
  useHeadline = useCountdownHeadline,
  onOpen
}: WaitHomeLineProps) => {
  const { t } = useTranslation()
  const headline = useHeadline(account)
  const remainingMs = useCountdownClock(headline?.kind === 'waiting' ? headline.anchor : null)
  const id = account.toLowerCase()
  const short = renderShortAddress(account)

  let line = t(`${HOME}.recovering`, { account: short })
  let chip: string | null = null
  if (headline?.kind === 'waiting') {
    line = t(`${HOME}.waitingRunning`, { account: short })
    chip = renderChip('attempt', 'recoveryInProgress', t)
  } else if (headline?.kind === 'executionDue') {
    line = t(`${HOME}.executionDue`, { account: short })
    chip = renderChip('attempt', 'executionDue', t)
  }

  return (
    <MethodRow testID={`home-countdown-${id}`}>
      <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]}>
        <View style={[flexbox.flex1, spacings.mrSm]}>
          <Text fontSize={14} weight="semiBold" testID={`home-countdown-${id}-line`}>
            {line}
          </Text>
          {headline?.kind === 'waiting' && remainingMs !== null && (
            <Text fontSize={12} appearance="secondaryText" testID={`home-countdown-${id}-time`}>
              {renderCountdown({ remainingMs }, t)}
            </Text>
          )}
        </View>
        {!!chip && (
          <StatusChip testID={`home-countdown-${id}-chip`} text={chip} style={spacings.mrSm} />
        )}
        <Button
          testID={`home-countdown-${id}-open`}
          type="secondary"
          size="small"
          text={t(`${HOME}.open`)}
          onPress={onOpen}
          hasBottomSpacing={false}
        />
      </View>
    </MethodRow>
  )
}

export default React.memo(WaitHomeLine)
