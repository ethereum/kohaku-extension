/**
 * The committed values beside the path: the waiting period, the recovery
 * password and the privacy level, each with the step that changes it, and the
 * line that a printed Recovery Card goes stale where the edit makes it so.
 * Every change holds while the path is checked.
 */
import React from 'react'
import { View } from 'react-native'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { privacyLevelOf } from '@web/modules/social-recovery/shared/client'
import { renderNoun, renderPasswordName } from '@web/modules/social-recovery/shared/display'
import { privacyLinesOf, renderWait } from '@web/modules/social-recovery/setup/review'

import { EDITOR } from './constants'
import type { ValuesBlockProps } from './types'
import ValueRow from './ValueRow'

const ValuesBlock = ({
  draft,
  addressBook,
  passwordChanged,
  stale,
  disabled,
  onStage
}: ValuesBlockProps) => {
  const { t } = useTranslation()
  const level = privacyLevelOf(draft.privacy)

  return (
    <View testID="manage-values">
      <ValueRow
        label={renderNoun('waitingPeriod', t)}
        text={renderWait(draft.wait, t)}
        action={t(`${EDITOR}.values.change`)}
        stage="wait"
        disabled={disabled}
        onStage={onStage}
      />
      {level !== 'public' && (
        <ValueRow
          label={renderPasswordName('recoveryPassword', t)}
          text={t(`${EDITOR}.values.${passwordChanged ? 'passwordChanged' : 'passwordKept'}`)}
          action={t(`${EDITOR}.password.action`)}
          stage="password"
          disabled={disabled}
          onStage={onStage}
        />
      )}
      <ValueRow
        label={t('socialRecovery.review.privacyHeader')}
        text={privacyLinesOf(draft, addressBook, true, t)[0]}
        action={t(`${EDITOR}.values.change`)}
        stage="privacy"
        disabled={disabled}
        onStage={onStage}
      />
      {stale && (
        <Text fontSize={14} weight="medium" style={spacings.mbSm} testID="manage-values-stale-card">
          {t(`${EDITOR}.staleCard`)}
        </Text>
      )}
    </View>
  )
}

export default React.memo(ValuesBlock)
