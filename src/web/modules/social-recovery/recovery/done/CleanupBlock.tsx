/**
 * What one passkey of the path implies after the recovery. A passkey may still
 * follow the account that syncs it, so the block states the repair in its one
 * order (sign the lost device out of that account, add a fresh method that
 * does not sync to it, then remove the old row) and points a holder who
 * cannot reach that account at removing the row in the editor: with a method
 * added first where removing it would leave none, and with the method that
 * would remain as the whole rule, and its single-method warning, where one
 * would. Every passkey of the path gets this block.
 */
import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { SectionCard } from '@web/modules/social-recovery/shared/chrome'

import { rowNameOf } from './copy'
import type { CleanupBlockProps, RemovalExit } from './types'

const DONE = 'socialRecovery.done'

const CleanupBlock = ({ block, row, disabled, onEdit }: CleanupBlockProps) => {
  const { t } = useTranslation()

  const line = (text: string, testID: string) => (
    <Text key={testID} fontSize={14} style={spacings.mbTy} testID={testID}>
      {text}
    </Text>
  )
  const exitLines = (exit: RemovalExit, prefix: string) => {
    if (exit.kind === 'addFirst') {
      return [line(t(`${DONE}.synced.addFirst`), `${prefix}-add-first`)]
    }
    if (exit.kind === 'leavesWholeRule') {
      return [
        line(
          t(`${DONE}.synced.leavesWholeRule`, { method: rowNameOf(exit.remaining, t) }),
          `${prefix}-whole-rule`
        ),
        line(t('socialRecovery.ruleLines.singleMethod'), `${prefix}-single-method`)
      ]
    }
    return []
  }
  const name = row ? (
    <Text fontSize={14} weight="medium" style={spacings.mbTy} testID="done-cleanup-row">
      {rowNameOf(row, t)}
    </Text>
  ) : null

  return (
    <SectionCard testID={`done-cleanup-synced-${block.place}`}>
      <Text fontSize={16} weight="medium" style={spacings.mbTy} testID="done-synced-title">
        {t(`${DONE}.synced.title`)}
      </Text>
      {name}
      {line(t(`${DONE}.synced.follows`), 'done-synced-follows')}
      {line(t(`${DONE}.synced.order`), 'done-synced-order')}
      <View style={spacings.mtSm} testID="done-cannot-reach">
        <Text fontSize={14} weight="medium" style={spacings.mbTy}>
          {t(`${DONE}.synced.cannotReachTitle`)}
        </Text>
        {line(t(`${DONE}.synced.cannotReachBody`), 'done-cannot-reach-body')}
        {exitLines(block.exit, 'done-synced')}
        <Button
          testID="done-remove-in-editor"
          type="secondary"
          size="small"
          text={t(`${DONE}.synced.removeInEditor`)}
          disabled={disabled}
          onPress={onEdit}
          hasBottomSpacing={false}
          style={[flexbox.alignSelfStart, spacings.mbTy]}
        />
        <Text fontSize={12} appearance="secondaryText" testID="done-editor-shows">
          {t(`${DONE}.synced.editorShows`)}
        </Text>
      </View>
    </SectionCard>
  )
}

export default React.memo(CleanupBlock)
