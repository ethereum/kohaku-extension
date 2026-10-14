/**
 * The running recovery as the last poll read it: its chip, the day it started
 * (on chain, the attempt's end less the setup's waiting period, where this
 * device holds the setup; else the day the submission landed here), the
 * countdown against the pinned block's time while the wait runs, the end in
 * the reader's zone from the attempt the manager reports (in the past tense
 * once execution is due), the account and the new key, the
 * recovery path where this device holds the setup (one line by its shape,
 * else its rule lines), and the transaction that started it on chain.
 */
import React, { useMemo } from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import common from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'
import { SectionCard, SectionLabel, StatusChip } from '@web/modules/social-recovery/shared/chrome'
import { addressBookOf, WALLET_RECOVERY_CHAIN } from '@web/modules/social-recovery/shared/client'
import {
  renderChip,
  renderCountdown,
  renderHash,
  renderShortAddress,
  renderValueLabel
} from '@web/modules/social-recovery/shared/display'
import { dateOf } from '@web/modules/social-recovery/recovery/checklist'
import { ruleLinesOf } from '@web/modules/social-recovery/setup/review'

import { pathLineOf } from './path'
import type { CountdownBlockProps } from './types'

const WAIT = 'socialRecovery.wait'

const CountdownBlock = ({
  round,
  account,
  newKey,
  remainingMs,
  startedAt,
  timeZone,
  configuration,
  onOpenExplorer
}: CountdownBlockProps) => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const { phase, story } = round
  const book = useMemo(() => addressBookOf(WALLET_RECOVERY_CHAIN), [])
  const pathLines = useMemo(() => {
    if (!configuration) {
      return []
    }
    const line = pathLineOf(configuration, book, t)
    return line ? [line] : ruleLinesOf(configuration, book, t)
  }, [configuration, book, t])

  if (phase.kind !== 'waiting' && phase.kind !== 'executionDue') {
    return null
  }
  const startedMs = configuration
    ? (phase.attempt.consumableAfter - Number(configuration.wait)) * 1000
    : startedAt

  const due = phase.kind === 'executionDue'
  const chip = renderChip('attempt', due ? 'executionDue' : 'recoveryInProgress', t)
  const tone = due ? 'success' : 'default'
  const transactionHash = story.started?.at.transactionHash

  const value = (label: string, text: string, testID: string) => (
    <View
      style={[
        common.borderRadiusPrimary,
        spacings.phSm,
        spacings.pvSm,
        spacings.mbTy,
        { backgroundColor: theme.secondaryBackground }
      ]}
    >
      <SectionLabel>{label}</SectionLabel>
      <Text fontSize={14} weight="number_medium" selectable testID={testID}>
        {text}
      </Text>
    </View>
  )

  return (
    <SectionCard testID="wait-countdown">
      <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.mbTy]}>
        <StatusChip testID="wait-chip" text={chip} tone={tone} style={spacings.mrSm} />
        <Text fontSize={12} appearance="secondaryText" testID="wait-started">
          {t(`${WAIT}.started`, { date: dateOf(startedMs, timeZone) })}
        </Text>
      </View>
      {!due && remainingMs !== null && (
        <Text fontSize={20} weight="number_medium" style={spacings.mbTy} testID="wait-time-left">
          {renderCountdown({ remainingMs }, t)}
        </Text>
      )}
      <Text fontSize={14} style={spacings.mbTy} testID="wait-finishes">
        {t(due ? `${WAIT}.ended` : `${WAIT}.finishes`, {
          date: dateOf(phase.attempt.consumableAfter * 1000, timeZone)
        })}
      </Text>
      <Text
        fontSize={12}
        appearance="secondaryText"
        style={spacings.mbSm}
        testID="wait-end-from-chain"
      >
        {t(`${WAIT}.endFromChain`)}
      </Text>
      {value(
        renderValueLabel('accountBeingRecovered', t),
        renderShortAddress(account),
        'wait-account'
      )}
      {!!newKey && value(renderValueLabel('newKey', t), renderShortAddress(newKey), 'wait-new-key')}
      {pathLines.length > 0 && (
        <View style={spacings.mbTy} testID="wait-path">
          <SectionLabel>{t('socialRecovery.display.nouns.recoveryPath')}</SectionLabel>
          {pathLines.map((line) => (
            <Text key={line} fontSize={14} style={spacings.mbMi}>
              {line}
            </Text>
          ))}
        </View>
      )}
      {!!transactionHash && (
        <View style={spacings.mtTy} testID="wait-started-on-chain">
          <SectionLabel>{t(`${WAIT}.startedOnChain`)}</SectionLabel>
          <Text fontSize={14} weight="number_medium" selectable testID="wait-start-hash">
            {renderHash(transactionHash)}
          </Text>
          <Button
            testID="wait-explorer"
            type="ghost"
            size="small"
            text={t(`${WAIT}.explorer`)}
            onPress={() => onOpenExplorer(transactionHash)}
            hasBottomSpacing={false}
            style={[flexbox.alignSelfStart, spacings.mtTy]}
          />
        </View>
      )}
    </SectionCard>
  )
}

export default React.memo(CountdownBlock)
