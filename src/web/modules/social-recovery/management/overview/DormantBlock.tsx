/**
 * The warning of a dormant setup with re-authorize and clear. While an
 * attempt is open the re-authorize is absent with the wallet's reason in its
 * place, and the clear carries the sentence that it ends the recovery in
 * progress.
 */
import React from 'react'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { ActionsRow, SectionCard } from '@web/modules/social-recovery/shared/chrome'

import { OVERVIEW } from './constants'
import type { DormantBlockProps } from './types'

const DormantBlock = ({ attemptOpen, onOpen }: DormantBlockProps) => {
  const { t } = useTranslation()
  return (
    <SectionCard testID="overview-dormant">
      <Text fontSize={16} weight="medium" style={spacings.mbTy} testID="overview-dormant-title">
        {t(`${OVERVIEW}.dormant.title`)}
      </Text>
      <Text fontSize={14} style={spacings.mbTy} testID="overview-dormant-body">
        {t(`${OVERVIEW}.dormant.body`)}
      </Text>
      {attemptOpen && (
        <>
          <Text
            fontSize={14}
            weight="medium"
            style={spacings.mbTy}
            testID="overview-dormant-pending"
          >
            {t(`${OVERVIEW}.dormant.pendingLine`)}
          </Text>
          <Text
            fontSize={14}
            appearance="secondaryText"
            style={spacings.mbTy}
            testID="overview-dormant-refused"
          >
            {t(`${OVERVIEW}.dormant.refused`)}
          </Text>
          <Text
            fontSize={14}
            weight="medium"
            style={spacings.mtTy}
            testID="overview-dormant-clear-cancels"
          >
            {t(`${OVERVIEW}.dormant.clearCancels`)}
          </Text>
        </>
      )}
      <ActionsRow
        primary={
          attemptOpen ? (
            <Button
              testID="overview-clear"
              type="secondary"
              text={t(`${OVERVIEW}.dormant.clear`)}
              onPress={() => onOpen('clear')}
              hasBottomSpacing={false}
            />
          ) : (
            <Button
              testID="overview-reauthorize"
              type="primary"
              text={t(`${OVERVIEW}.dormant.reauthorize`)}
              onPress={() => onOpen('reauthorize')}
              hasBottomSpacing={false}
            />
          )
        }
        secondary={
          attemptOpen ? undefined : (
            <Button
              testID="overview-clear"
              type="secondary"
              text={t(`${OVERVIEW}.dormant.clear`)}
              onPress={() => onOpen('clear')}
              hasBottomSpacing={false}
            />
          )
        }
        note={attemptOpen ? undefined : t(`${OVERVIEW}.dormant.reauthorizeNote`)}
        noteTestID="overview-reauthorize-note"
      />
    </SectionCard>
  )
}

export default React.memo(DormantBlock)
