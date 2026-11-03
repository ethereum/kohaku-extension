/**
 * The recovery can no longer execute: its chip, the cause this wallet read
 * (with the repair where the account no longer authorizes the action), that
 * the approvals die with the attempt, that there is no retry,
 * who clears the account's one recovery slot, and that moving funds and a new
 * setup are the account's own writes. Move funds is enabled only where this
 * wallet holds the account's own key. No retry and no new recovery: the poll
 * goes on, since the account's key may make the recovery executable again.
 */
import React from 'react'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { SectionCard, StatusChip } from '@web/modules/social-recovery/shared/chrome'
import { renderChip } from '@web/modules/social-recovery/shared/display'

import type { CannotExecuteBlockProps } from './types'

const CANNOT = 'socialRecovery.wait.cannotExecute'

const CannotExecuteBlock = ({ cause, holdsAccountKey, onMoveFunds }: CannotExecuteBlockProps) => {
  const { t } = useTranslation()

  const line = (text: string, testID?: string) => (
    <Text fontSize={14} style={spacings.mbTy} testID={testID}>
      {text}
    </Text>
  )

  let causeLine: string
  if (cause === 'notAuthorized') {
    causeLine = t(`${CANNOT}.notAuthorized`)
  } else if (cause === 'upgradedAway') {
    causeLine = t(`${CANNOT}.upgradedAway`)
  } else if (cause === 'privilegeMoved') {
    causeLine = t(`${CANNOT}.movedPrivilege`)
  } else {
    causeLine = t(`${CANNOT}.unmatched`)
  }

  return (
    <SectionCard testID="wait-cannot-execute">
      <StatusChip
        testID="wait-cannot-execute-chip"
        text={renderChip('recovery', 'cannotExecute', t)}
        tone="error"
        style={{ ...spacings.mbSm, ...flexbox.alignSelfStart }}
      />
      <Text fontSize={16} weight="medium" style={spacings.mbTy} testID="wait-cannot-execute-title">
        {t(`${CANNOT}.title`)}
      </Text>
      {line(causeLine, `wait-cannot-execute-${cause}`)}
      {cause === 'notAuthorized' &&
        line(t(`${CANNOT}.notAuthorizedRepair`), 'wait-cannot-execute-repair')}
      {line(t(`${CANNOT}.approvalsDie`))}
      {line(t(`${CANNOT}.noRetry`))}
      {line(t(`${CANNOT}.slotClosed`))}
      {line(t(`${CANNOT}.exitsNeedKey`))}
      <Button
        testID="wait-move-funds"
        type="secondary"
        size="small"
        text={t(`${CANNOT}.moveFunds`)}
        disabled={!holdsAccountKey}
        onPress={onMoveFunds}
        hasBottomSpacing={false}
        style={[flexbox.alignSelfStart, spacings.mtTy]}
      />
    </SectionCard>
  )
}

export default React.memo(CannotExecuteBlock)
