/**
 * The condensed warning in front of a recovery screen reached with no
 * acknowledgment from the screen before, for example by a direct URL, with
 * its own continue. The warning reports its acknowledgment but not its
 * unmount; the flag lives beside it in this component, so a new warning never
 * meets a stale tick.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import { useTranslation } from '@common/config/localization'
import WarningGate from '@web/modules/social-recovery/onboarding/recover/WarningGate'
import { ActionsRow } from '@web/modules/social-recovery/shared/chrome'

import type { CondensedGateProps } from './types'

const CondensedGate = ({ onPass }: CondensedGateProps) => {
  const { t } = useTranslation()
  const [acknowledged, setAcknowledged] = useState(false)
  useEffect(() => setAcknowledged(false), [])

  const proceed = useCallback(() => {
    if (acknowledged) {
      onPass()
    }
  }, [acknowledged, onPass])

  return (
    <View testID="entry-gate">
      <WarningGate form="condensed" onAcknowledgedChange={setAcknowledged} />
      <ActionsRow
        primary={
          <Button
            testID="entry-gate-continue"
            type="primary"
            text={t('socialRecovery.actions.continue')}
            disabled={!acknowledged}
            onPress={proceed}
            hasBottomSpacing={false}
          />
        }
      />
    </View>
  )
}

export default React.memo(CondensedGate)
