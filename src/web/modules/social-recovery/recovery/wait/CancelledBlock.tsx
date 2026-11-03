/**
 * The recovery was cancelled: its chip, the account, who cancelled it as the
 * manager's event names it, that every approval was wiped, and the next act.
 * The account's own key, which may be the lost device, and a full set of
 * approvals signed for cancel point at starting again; the set adds that the
 * same credential can cancel again where one approval satisfies the rule. A
 * setup change or removal points at a new recovery, and so does a security
 * stop's cancel, which this release reads in the setup change's words. The
 * action ends the countdown, clears the entry and goes to the route's entry.
 */
import React from 'react'
import { View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import common from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'
import {
  PageTitle,
  SectionCard,
  SectionLabel,
  StatusChip
} from '@web/modules/social-recovery/shared/chrome'
import {
  renderChip,
  renderFullAddress,
  renderValueLabel
} from '@web/modules/social-recovery/shared/display'

import type { CancelledBlockProps } from './types'

const CANCELLED = 'socialRecovery.wait.cancelled'

const CancelledBlock = ({ account, by, thresholdOne, leave, onLeave }: CancelledBlockProps) => {
  const { t } = useTranslation()
  const { theme } = useTheme()

  const lines: string[] = []
  let heading: string | null = null
  let action = t(`${CANCELLED}.startAgain`)
  if (by === 'cancelByOwner') {
    heading = t(`${CANCELLED}.byOwnerTitle`)
    lines.push(t(`${CANCELLED}.byOwnerBody`))
  } else if (by === 'cancelByProofs') {
    heading = t(`${CANCELLED}.byApprovalsTitle`)
    lines.push(t(`${CANCELLED}.byApprovalsBody`))
    if (thresholdOne) {
      lines.push(t(`${CANCELLED}.byApprovalsThresholdOne`))
    }
  } else if (by === 'setupWrite' || by === 'cancelByVeto') {
    lines.push(t(`${CANCELLED}.bySetupBody`))
    action = t(`${CANCELLED}.startNew`)
  }

  return (
    <View testID={`wait-cancelled-${by ?? 'unnamed'}`}>
      <PageTitle title={t(`${CANCELLED}.title`)} titleTestID="wait-cancelled-title" />
      <SectionCard>
        <StatusChip
          testID="wait-cancelled-chip"
          text={renderChip('attempt', 'cancelled', t)}
          tone="error"
          style={{ ...spacings.mbSm, ...flexbox.alignSelfStart }}
        />
        <View
          style={[
            common.borderRadiusPrimary,
            spacings.phSm,
            spacings.pvSm,
            spacings.mbSm,
            { backgroundColor: theme.secondaryBackground }
          ]}
        >
          <SectionLabel>{renderValueLabel('accountBeingRecovered', t)}</SectionLabel>
          <Text fontSize={14} weight="number_medium" selectable testID="wait-cancelled-account">
            {renderFullAddress(account)}
          </Text>
        </View>
        {!!heading && (
          <Text fontSize={16} weight="medium" style={spacings.mbTy} testID="wait-cancelled-by">
            {heading}
          </Text>
        )}
        {lines.map((line) => (
          <Text key={line} fontSize={14} style={spacings.mbTy}>
            {line}
          </Text>
        ))}
        <Text
          fontSize={14}
          appearance="secondaryText"
          style={spacings.mbSm}
          testID="wait-cancelled-wiped"
        >
          {t(`${CANCELLED}.wiped`)}
        </Text>
        {leave === 'failed' && (
          <Alert
            testID="wait-leave-failed"
            type="error"
            size="sm"
            style={spacings.mbSm}
            text={t('socialRecovery.wait.leaveFailed')}
          />
        )}
        <Button
          testID="wait-cancelled-action"
          type="primary"
          text={action}
          disabled={leave === 'leaving'}
          onPress={onLeave}
          hasBottomSpacing={false}
          style={flexbox.alignSelfStart}
        />
      </SectionCard>
    </View>
  )
}

export default React.memo(CancelledBlock)
