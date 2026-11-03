/**
 * The removal before its run: the failed read of the stored write with
 * retry, what the one transaction does, the typed confirmation, the
 * view-only refusal, the line that removing cancels the attempt in progress,
 * and the action once the stored write has been read, with the way back.
 * Once the removal is on its way, what it does and the typed word stay, the
 * word no longer editable, and the run takes the place of the rest.
 */
import React from 'react'
import { View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import Input from '@common/components/Input'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { ActionsRow } from '@web/modules/social-recovery/shared/chrome'
import LoadingBlock from '@web/modules/social-recovery/shared/chrome/LoadingBlock'
import ReadFailedBlock from '@web/modules/social-recovery/shared/chrome/ReadFailedBlock'

import { REMOVE } from './constants'
import RemoveCancelsLine from './RemoveCancelsLine'
import type { RemoveArrivalProps } from './types'

const RemoveArrival = ({
  heldFailed,
  onRetryHeld,
  lookingUp,
  word,
  typed,
  onType,
  facts,
  attemptOpen,
  canRemove,
  lookupFailed,
  onRemove,
  onLookAgain,
  keep,
  run
}: RemoveArrivalProps) => {
  const { t } = useTranslation()

  if (heldFailed && !run) {
    return (
      <ReadFailedBlock
        testID="manage-remove-held-failed"
        title={t('socialRecovery.records.loadFailed')}
        onRetry={onRetryHeld}
      />
    )
  }
  // The view-only refusal, the line that removing cancels the attempt, and the action with the way back.
  const actions = () => (
    <>
      {facts && !facts.key && (
        <Alert
          testID="manage-remove-view-only"
          type="error"
          size="sm"
          style={spacings.mbSm}
          text={t('socialRecovery.arm.viewOnly')}
        />
      )}
      {attemptOpen && <RemoveCancelsLine />}
      {lookingUp ? (
        <View testID="manage-remove-lookup">
          <LoadingBlock variant="row" message={t('socialRecovery.loading.unfinishedSave')} />
        </View>
      ) : (
        <ActionsRow
          primary={
            <Button
              testID="manage-remove-action"
              type="danger"
              text={t(`${REMOVE}.action`)}
              disabled={!canRemove}
              onPress={onRemove}
              hasBottomSpacing={false}
            />
          }
          secondary={keep}
        />
      )}
      {lookupFailed && (
        <ReadFailedBlock
          testID="manage-remove-lookup-failed"
          title={t('socialRecovery.records.loadFailed')}
          onRetry={onLookAgain}
        />
      )}
    </>
  )

  return (
    <View testID="manage-remove-arrival">
      <Text fontSize={14} style={spacings.mbSm} testID="manage-remove-body">
        {t(`${REMOVE}.body`)}
      </Text>
      <Input
        testID="manage-remove-word"
        label={t(`${REMOVE}.typeToConfirm`, { word })}
        accessibilityLabel={t(`${REMOVE}.typeToConfirm`, { word })}
        placeholder={word}
        value={typed}
        onChangeText={onType}
        disabled={!!run}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {run ?? actions()}
    </View>
  )
}

export default React.memo(RemoveArrival)
