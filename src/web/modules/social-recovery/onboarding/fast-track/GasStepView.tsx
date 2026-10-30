/**
 * The gas step of the fast track: the deposit step for the key that sends the
 * recovery while it holds too little, under the account being recovered, with
 * the second-funding note beside it; a failed read with retry; or a waiting
 * block that says the balance and the fee are read. Continue stays disabled: the
 * step moves on by itself once the funds arrive. Back returns to the readout;
 * where no key in this wallet can send the recovery, nothing can be retried
 * here and Back returns to the account step.
 */
import React from 'react'
import { View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import AccountLine from '@web/modules/social-recovery/recovery/entry/AccountLine'
import { ActionsRow, TwoColumn } from '@web/modules/social-recovery/shared/chrome'
import LoadingBlock from '@web/modules/social-recovery/shared/chrome/LoadingBlock'
import {
  DepositStepAside,
  DepositStepView
} from '@web/modules/social-recovery/shared/writes/components'

import type { GasStepViewProps } from './types'

const GasStepView = ({
  state,
  account,
  networkName,
  onRetry,
  onBack,
  onBackToAccount
}: GasStepViewProps) => {
  const { t } = useTranslation()

  const backButton = (onPress: () => void) => (
    <Button
      testID="fast-track-gas-back"
      type="outline"
      text={t('socialRecovery.ceremony.backAction')}
      onPress={onPress}
      hasBottomSpacing={false}
    />
  )

  const columns = (main: React.ReactNode, aside?: React.ReactNode) => (
    <TwoColumn testID="fast-track-gas-columns" aside={aside}>
      {main}
    </TwoColumn>
  )

  if (state.kind === 'noSendingKey') {
    return columns(
      <View testID="fast-track-gas-no-key">
        <Alert type="error" size="sm" text={t('socialRecovery.writes.gasCheckFailed')} />
        <ActionsRow testID="fast-track-gas-actions" primary={backButton(onBackToAccount)} />
      </View>
    )
  }

  if (state.kind === 'failed') {
    return columns(
      <View testID="fast-track-gas-failed">
        <Alert type="error" size="sm" text={t('socialRecovery.writes.gasCheckFailed')}>
          <Button
            testID="fast-track-gas-retry"
            type="secondary"
            size="small"
            text={t('socialRecovery.writes.tryAgain')}
            onPress={onRetry}
            hasBottomSpacing={false}
            style={[flexbox.alignSelfStart, spacings.mtSm]}
          />
        </Alert>
        <ActionsRow testID="fast-track-gas-actions" primary={backButton(onBack)} />
      </View>
    )
  }

  if (state.kind !== 'deposit') {
    return (
      <View testID="fast-track-gas-waiting" style={flexbox.flex1}>
        <LoadingBlock variant="screen" message={t('socialRecovery.loading.balance')} />
      </View>
    )
  }

  return columns(
    <DepositStepView
      step={state.step}
      header={
        account ? (
          <AccountLine
            account={account}
            networkName={networkName}
            testID="fast-track-gas-account"
          />
        ) : undefined
      }
      testID="fast-track-gas"
    >
      <ActionsRow
        testID="fast-track-gas-actions"
        primary={
          <Button
            testID="fast-track-gas-continue"
            type="primary"
            text={t('socialRecovery.actions.continue')}
            disabled
            hasBottomSpacing={false}
          />
        }
        secondary={backButton(onBack)}
      />
    </DepositStepView>,
    <DepositStepAside step={state.step} testID="fast-track-gas-second-funding" />
  )
}

export default React.memo(GasStepView)
