/**
 * The submission confirmation over given props: the title and its lead, which
 * say the transaction is being sent while the start is on its way, the four
 * values of the lead, Start recovery under them, locked with its reason until
 * the four values rendered and every approval verified, verify the details
 * under it, then the verify again of every approval and the run as it stands.
 * Beside them: the verified line and the second-funding note of the deposit
 * step.
 */
import React from 'react'
import { View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import {
  ActionsRow,
  PageTitle,
  SectionCard,
  TwoColumn
} from '@web/modules/social-recovery/shared/chrome'
import LoadingBlock from '@web/modules/social-recovery/shared/chrome/LoadingBlock'
import { mayStillLand } from '@web/modules/social-recovery/shared/writes'
import { DepositStepAside } from '@web/modules/social-recovery/shared/writes/components'

import DetailsBlock from './DetailsBlock'
import { paymentValueOf, rowNameOf } from './lead'
import LeadBlock from './LeadBlock'
import { isLive, landedOf } from './run'
import RunBlock from './RunBlock'
import type { SubmitViewProps } from './types'

const SUBMIT = 'socialRecovery.submit'

const SubmitView = ({
  route,
  load,
  lead,
  verify,
  run,
  sending,
  onStart,
  onCheckAgain,
  onReread,
  onRetryVerify,
  onRetryLoad,
  onRetryRemoved,
  onRetrySending,
  onBack
}: SubmitViewProps) => {
  const { t } = useTranslation()

  const retryButton = (testID: string, onPress: () => void, text?: string) => (
    <Button
      testID={testID}
      type="secondary"
      size="small"
      text={text ?? t('socialRecovery.writes.tryAgain')}
      onPress={onPress}
      hasBottomSpacing={false}
      style={[flexbox.alignSelfStart, spacings.mtSm]}
    />
  )

  if (load.phase === 'loading') {
    return (
      <View testID="submit-loading" style={flexbox.flex1}>
        <LoadingBlock variant="screen" message={t('socialRecovery.loading.session')} />
      </View>
    )
  }
  if (load.phase === 'update-the-wallet') {
    return (
      <TwoColumn testID="submit-columns">
        <View testID="submit-update-the-wallet">
          <Alert
            type="error"
            size="sm"
            title={t('socialRecovery.client.updateTheWalletTitle')}
            text={t('socialRecovery.client.updateTheWalletBody')}
          />
        </View>
      </TwoColumn>
    )
  }
  if (load.phase === 'failed') {
    return (
      <TwoColumn testID="submit-columns">
        <View testID="submit-load-failed">
          <Alert
            type="error"
            size="sm"
            title={t('socialRecovery.client.unavailableTitle')}
            text={t('socialRecovery.client.unavailableBody')}
          >
            {retryButton('submit-load-retry', onRetryLoad)}
          </Alert>
        </View>
      </TwoColumn>
    )
  }

  const { write } = run
  const submitting = write.status === 'submitting' && !landedOf(run)

  const verifyBlock = () => {
    switch (verify.status) {
      case 'checking':
        return (
          <Text fontSize={14} appearance="secondaryText" testID="submit-checking">
            {t(`${SUBMIT}.checking`)}
          </Text>
        )
      case 'rejected':
        return (
          <Alert
            testID="submit-not-verified"
            type="error"
            size="sm"
            text={t(`${SUBMIT}.approvalNotVerified`, {
              row: rowNameOf(load.layout, verify.place, t) ?? String(verify.place)
            })}
          >
            {retryButton(
              'submit-not-verified-back',
              onBack,
              t('socialRecovery.checklist.backToChecklist')
            )}
          </Alert>
        )
      case 'failed':
      default:
        return (
          <Alert
            testID="submit-check-failed"
            type="error"
            size="sm"
            text={t(`${SUBMIT}.checkFailed`)}
          >
            {retryButton('submit-check-retry', onRetryVerify)}
          </Alert>
        )
    }
  }

  const sendingBlock = () => {
    if (sending.status === 'unavailable') {
      return (
        <Alert
          testID="submit-sending-unavailable"
          type="error"
          size="sm"
          text={t(`${SUBMIT}.noSendingKey`)}
        />
      )
    }
    if (sending.status !== 'failed') {
      return null
    }
    return (
      <Alert
        testID="submit-sending-failed"
        type="error"
        size="sm"
        title={t('socialRecovery.client.unavailableTitle')}
        text={t('socialRecovery.client.unavailableBody')}
      >
        {retryButton('submit-sending-retry', onRetrySending)}
      </Alert>
    )
  }

  const payment = paymentValueOf(load.session.gathering, t)
  const sendingPlan = sending.status === 'ready' ? sending.plan : undefined
  const valuesRendered = !!lead.newKey && lead.removed.status === 'named' && payment !== null
  const unlocked = valuesRendered && verify.status === 'verified' && sending.status === 'ready'
  const idle = write.status === 'idle' && !run.refusal
  const canStart = unlocked && idle && run.lookup !== 'reading'
  // While the fee is checked, Start stays on screen, held.
  const checkingFee = write.status === 'checkingGas'
  // Back wherever nothing is on its way to the chain, and on the deposit step.
  const showsBack =
    write.status === 'needsDeposit' ||
    (!isLive(run) && !landedOf(run) && !mayStillLand(write) && !run.refusal)

  const actions = (idle || checkingFee || showsBack) && (
    <ActionsRow
      testID="submit-actions"
      primary={
        idle || checkingFee ? (
          <Button
            testID="submit-action"
            type="primary"
            text={t(`${SUBMIT}.action`)}
            disabled={!canStart}
            onPress={onStart}
            hasBottomSpacing={false}
          />
        ) : null
      }
      secondary={
        showsBack ? (
          <Button
            testID="submit-back"
            type="outline"
            text={t('socialRecovery.actions.back')}
            onPress={onBack}
            hasBottomSpacing={false}
          />
        ) : undefined
      }
      note={idle && !unlocked ? t(`${SUBMIT}.unlockReason`) : undefined}
      noteTestID="submit-unlock-reason"
    />
  )

  const aside = (
    <>
      {verify.status === 'verified' && (
        <SectionCard
          tone="muted"
          spacing="item"
          label={t(`${SUBMIT}.checkLineTitle`)}
          testID="submit-verify"
        >
          <Text fontSize={12} appearance="secondaryText" testID="submit-check-line">
            {t(`${SUBMIT}.checkLine`)}
          </Text>
        </SectionCard>
      )}
      {write.status === 'needsDeposit' && (
        <DepositStepAside step={write.step} testID="submit-gas-second-funding" />
      )}
    </>
  )

  return (
    <TwoColumn testID="submit-columns" aside={aside}>
      <View testID="submit">
        <PageTitle
          title={t(submitting ? `${SUBMIT}.submittingTitle` : `${SUBMIT}.title`)}
          lead={t(submitting ? 'socialRecovery.writes.submittingBody' : `${SUBMIT}.lead`)}
          titleTestID="submit-title"
        />
        <LeadBlock
          route={route}
          lead={lead}
          payment={payment}
          sendingPlan={sendingPlan}
          onRetryRemoved={onRetryRemoved}
        />
        {actions}
        <View style={spacings.mtSm}>
          <DetailsBlock route={route} ready={load} />
        </View>
        {verify.status !== 'verified' && (
          <SectionCard style={spacings.mtSm} testID="submit-verify">
            {verifyBlock()}
          </SectionCard>
        )}
        {sendingBlock()}
        <View style={spacings.mtSm}>
          <RunBlock
            run={run}
            onStart={onStart}
            onCheckAgain={onCheckAgain}
            onReread={onReread}
            onBack={onBack}
          />
        </View>
      </View>
    </TwoColumn>
  )
}

export default React.memo(SubmitView)
