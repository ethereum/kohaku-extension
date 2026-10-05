import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { SectionCard, StatusChip } from '@web/modules/social-recovery/shared/chrome'
import { chipKey } from '@web/modules/social-recovery/shared/display'
import type { Translate } from '@web/modules/social-recovery/shared/display'

import type { CannotRecoverBlock, SaveBlock, SaveBlockCopy, SaveBlockerProps } from './types'

const BLOCKED = 'socialRecovery.review.blocked'

const RETRY = {
  label: 'socialRecovery.writes.tryAgain',
  handler: 'onRetry',
  testID: 'review-blocked-retry'
} as const

/** What each block renders, in order: its chip, its title, its body and its action. */
const BLOCKS: Record<SaveBlock['kind'], SaveBlockCopy> = {
  'empty-slot': {
    body: `${BLOCKED}.emptySlot`,
    action: {
      label: `${BLOCKED}.emptySlotAction`,
      handler: 'onEditor',
      testID: 'review-blocked-editor'
    }
  },
  'password-missing': {
    body: `${BLOCKED}.passwordMissing`,
    action: {
      label: `${BLOCKED}.passwordMissingAction`,
      handler: 'onPrivacy',
      testID: 'review-blocked-privacy'
    }
  },
  unavailable: {
    chip: `${BLOCKED}.unavailable.chip`,
    title: `${BLOCKED}.unavailable.title`,
    body: `${BLOCKED}.unavailable.body`,
    action: RETRY
  },
  'removed-key-unreadable': {
    title: `${BLOCKED}.removedKeyUnreadable.title`,
    body: `${BLOCKED}.removedKeyUnreadable.body`,
    action: RETRY
  },
  // The body names the reason the block carries.
  'cannot-recover': {
    chip: chipKey('recovery', 'cannotRecover'),
    title: `${BLOCKED}.cannotRecover.title`
  },
  'already-set-up': {
    chip: `${BLOCKED}.alreadySetUp.chip`,
    title: `${BLOCKED}.alreadySetUp.title`,
    body: `${BLOCKED}.alreadySetUp.body`,
    action: {
      label: `${BLOCKED}.alreadySetUp.open`,
      handler: 'onOpen',
      testID: 'review-blocked-open'
    }
  }
}

const reasonOf = (blocked: CannotRecoverBlock, t: Translate): string => {
  if (blocked.reason === 'not-supported') {
    return t(`${BLOCKED}.cannotRecover.reasonNotSupported`)
  }
  return blocked.count === undefined
    ? t(`${BLOCKED}.cannotRecover.reasonSeveralKeys`)
    : t(`${BLOCKED}.cannotRecover.reasonKeyCount`, { count: blocked.count })
}

const titleOf = (text: string) => (
  <Text fontSize={16} weight="medium" testID="review-blocked-title">
    {text}
  </Text>
)

const bodyOf = (text: string) => (
  <Text fontSize={14} appearance="secondaryText" style={spacings.mbTy} testID="review-blocked-body">
    {text}
  </Text>
)

const actionOf = (text: string, onPress: () => void, testID: string) => (
  <View style={[flexbox.directionRow, spacings.mtTy]}>
    <Button
      testID={testID}
      type="secondary"
      size="small"
      text={text}
      onPress={onPress}
      hasBottomSpacing={false}
    />
  </View>
)

/** Why Save cannot run, on screen beside it, with the action that clears it where one does. */
const SaveBlocker = ({ blocked, ...handlers }: SaveBlockerProps) => {
  const { t } = useTranslation()
  const { chip, title, body, action } = BLOCKS[blocked.kind]

  return (
    <SectionCard testID={`review-blocked-${blocked.kind}`}>
      {(chip !== undefined || title !== undefined) && (
        <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.wrap, spacings.mbTy]}>
          {chip !== undefined && (
            <StatusChip
              text={t(chip)}
              tone="error"
              testID="review-blocked-chip"
              style={spacings.mrSm}
            />
          )}
          {title !== undefined && titleOf(t(title))}
        </View>
      )}
      {body !== undefined && bodyOf(t(body))}
      {blocked.kind === 'cannot-recover' && bodyOf(reasonOf(blocked, t))}
      {action !== undefined && actionOf(t(action.label), handlers[action.handler], action.testID)}
    </SectionCard>
  )
}

export default SaveBlocker
