/**
 * An identity row before the slot holds a credential: the action that opens
 * the ceremony tab, the note a creation that did not pass left with its retry
 * (none for a document the method cannot serve), or the line that this
 * network cannot run the method at all.
 */
import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { browserErrorNameOf } from '@web/modules/social-recovery/shared/ceremony'
import { ActionsRow, SectionCard } from '@web/modules/social-recovery/shared/chrome'

import { rowNoteKeyOf } from './outcome'
import type { IdentityCreateBlockProps } from './types'

const IdentityCreateBlock = ({
  copy,
  enrollOutcome,
  unsupported,
  canLaunch,
  create
}: IdentityCreateBlockProps) => {
  const { t } = useTranslation()
  const { row } = copy
  const enrollNote = enrollOutcome ? rowNoteKeyOf(enrollOutcome, 'enroll', copy) : null
  const enrollError = enrollOutcome ? browserErrorNameOf(enrollOutcome) : null
  const enrollRetry = !!enrollOutcome && (enrollOutcome.kind === 'dismissed' || enrollOutcome.retry)
  // A document the method cannot serve gets no second ceremony: it would be refused again.
  const notServed = enrollOutcome?.kind === 'verdict' && enrollOutcome.verdict === 'notSupported'

  return (
    <SectionCard tone="muted" spacing="none" testID={`${row}-create`}>
      <Text testID={`${row}-none-yet`} fontSize={16} weight="medium" style={spacings.mbTy}>
        {t(copy.noneYet)}
      </Text>
      {unsupported ? (
        <Text testID={`${row}-not-on-network`} fontSize={14} appearance="errorText">
          {t('socialRecovery.ceremony.notOnThisNetworkLine')}
        </Text>
      ) : (
        <>
          {!!enrollNote && (
            <Text testID={`${row}-enroll-note`} fontSize={14} appearance="errorText">
              {t(enrollNote)}
            </Text>
          )}
          {!!enrollError && (
            <Text testID={`${row}-enroll-error`} fontSize={12} appearance="secondaryText">
              {enrollError}
            </Text>
          )}
          {!notServed && (
            <>
              <View style={[spacings.mtSm, spacings.mbTy]}>
                <Text fontSize={14}>{t(copy.actionLine)}</Text>
              </View>
              <ActionsRow
                primary={
                  <Button
                    testID={enrollRetry ? `${row}-try-again` : `${row}-start`}
                    type="primary"
                    text={t(enrollRetry ? 'socialRecovery.ceremony.tryAgainAction' : copy.action)}
                    disabled={!canLaunch}
                    onPress={create}
                    hasBottomSpacing={false}
                  />
                }
              />
            </>
          )}
        </>
      )}
    </SectionCard>
  )
}

export default React.memo(IdentityCreateBlock)
