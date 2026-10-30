/**
 * "I cannot complete this path": the confirmation that abandoning wipes every
 * approval collected on this device, with the abandon and the way back.
 */
import React, { useState } from 'react'
import { View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { ActionsRow, SectionCard } from '@web/modules/social-recovery/shared/chrome'

import type { AbandonBlockProps } from './types'

const ABANDON = 'socialRecovery.checklist.abandon'

const AbandonBlock = ({ busy, failed, onAbandon }: AbandonBlockProps) => {
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <View style={spacings.mtSm}>
        <Button
          testID="checklist-cannot-complete"
          type="ghost"
          size="small"
          text={t('socialRecovery.checklist.cannotComplete')}
          disabled={busy}
          onPress={() => setConfirming(true)}
          hasBottomSpacing={false}
          textUnderline
        />
      </View>
    )
  }
  return (
    <SectionCard tone="muted" spacing="item" style={spacings.mtSm} testID="checklist-abandon">
      <Text fontSize={14} weight="medium">
        {t(`${ABANDON}.action`)}
      </Text>
      <Text fontSize={14} style={spacings.mtTy} testID="checklist-abandon-confirm">
        {t(`${ABANDON}.confirm`)}
      </Text>
      {failed && (
        <Alert
          type="error"
          size="sm"
          style={spacings.mtSm}
          text={
            <Alert.Text size="sm" type="error" testID="checklist-abandon-failed">
              {t('socialRecovery.checklist.writeFailed')}
            </Alert.Text>
          }
        />
      )}
      <ActionsRow
        primary={
          <Button
            testID="checklist-abandon-action"
            type="danger"
            size="small"
            text={t(`${ABANDON}.confirmAction`)}
            disabled={busy}
            onPress={onAbandon}
            hasBottomSpacing={false}
          />
        }
        secondary={
          <Button
            testID="checklist-abandon-keep"
            type="ghost"
            size="small"
            text={t(`${ABANDON}.keep`)}
            disabled={busy}
            onPress={() => setConfirming(false)}
            hasBottomSpacing={false}
          />
        }
      />
    </SectionCard>
  )
}

export default React.memo(AbandonBlock)
