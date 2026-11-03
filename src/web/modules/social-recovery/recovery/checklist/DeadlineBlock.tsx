/**
 * The request's deadline above the first row: the date and the time left,
 * that every approval dies together where more than one approval makes the
 * request, and that anyone holding the request can submit it until then. The
 * time left renders again every minute from the page's clock, and once more
 * the moment the deadline passes, which the block reports at once.
 */
import React, { useEffect, useState } from 'react'
import { View } from 'react-native'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'

import { DEADLINE_TICK_MS, MAX_TIMER_MS } from './constants'
import { deadlineLineOf } from './lines'
import { oneApprovalOf } from './paste'
import { deadlinePassed } from './poll'
import type { DeadlineBlockProps } from './types'

const DeadlineBlock = ({ gathering, layout, now, timeZone, onPassed }: DeadlineBlockProps) => {
  const { t } = useTranslation()
  const [clock, setClock] = useState<number>(() => now())

  useEffect(() => {
    setClock(now())
    const timer = setInterval(() => setClock(now()), DEADLINE_TICK_MS)
    return () => clearInterval(timer)
  }, [now])

  // One tick lands just past the deadline, so it never waits for the next minute.
  const { validUntil } = gathering.request
  useEffect(() => {
    const untilPassed = (Number(validUntil) + 1) * 1000 - now()
    if (untilPassed <= 0 || untilPassed > MAX_TIMER_MS) {
      return undefined
    }
    const timer = setTimeout(() => setClock(now()), untilPassed)
    return () => clearTimeout(timer)
  }, [validUntil, now])

  const passed = deadlinePassed(gathering, clock)
  useEffect(() => {
    if (passed) {
      onPassed()
    }
  }, [passed, onPassed])

  const line = deadlineLineOf(gathering, clock, timeZone, t, oneApprovalOf(layout))
  if (!line) {
    return null
  }
  return (
    <View style={spacings.mbSm}>
      <Text fontSize={14} testID="checklist-deadline">
        {line}
      </Text>
      <Text
        fontSize={12}
        appearance="secondaryText"
        style={spacings.mtTy}
        testID="checklist-submittable"
      >
        {t('socialRecovery.checklist.submittable')}
      </Text>
    </View>
  )
}

export default React.memo(DeadlineBlock)
