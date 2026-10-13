/**
 * The submission confirmation over given props: the title and its lead, the
 * submitting state above the lead while the start is on its way, the three
 * values of the lead, verify the details, the verify again of every approval,
 * the run as it stands, and Start recovery, locked with its reason until the
 * three values and the payment line rendered and every approval verified.
 */
import React, { useCallback, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { ActionsRow, PageTitle, SectionCard } from '@web/modules/social-recovery/shared/chrome'
import { mayStillLand } from '@web/modules/social-recovery/shared/writes'

import DetailsBlock from './DetailsBlock'
import { namesNoPayment, rowNameOf } from './lead'
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
  // The payment line renders only inside the expander, so the lock waits until it opened once.
  const [detailsOpened, setDetailsOpened] = useState(false)
  const onDetailsOpened = useCallback(() => setDetailsOpened(true), [])

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
    return <ActivityIndicator testID="submit-loading" />
  }
  if (load.phase === 'update-the-wallet') {
    return (
      <View testID="submit-update-the-wallet">
        <Alert
          type="error"
          size="sm"
          title={t('socialRecovery.client.updateTheWalletTitle')}
          text={t('socialRecovery.client.updateTheWalletBody')}
        />
      </View>
    )
  }
  if (load.phase === 'failed') {
    return (
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
      case 'verified':
        return (
          <Text fontSize={14} testID="submit-check-line">
            {t(`${SUBMIT}.checkLine`)}
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

  const valuesRendered =
    !!lead.newKey &&
    lead.removed.status === 'named' &&
    detailsOpened &&
    namesNoPayment(load.session.gathering)
  const unlocked = valuesRendered && verify.status === 'verified' && sending.status === 'ready'
  const idle = write.status === 'idle' && !run.refusal
  const canStart = unlocked && idle && run.lookup !== 'reading'
  // Back wherever nothing is on its way to the chain, and on the deposit step.
  const showsBack =
    write.status === 'needsDeposit' ||
    (!isLive(run) && !landedOf(run) && !mayStillLand(write) && !run.refusal)

  return (
    <View testID="submit">
      <PageTitle
        title={t(`${SUBMIT}.title`)}
        lead={t(`${SUBMIT}.lead`)}
        titleTestID="submit-title"
      />
      {submitting && (
        <View style={spacings.mbSm}>
          <RunBlock
            run={run}
            onStart={onStart}
            onCheckAgain={onCheckAgain}
            onReread={onReread}
            onBack={onBack}
          />
        </View>
      )}
      <LeadBlock route={route} lead={lead} onRetryRemoved={onRetryRemoved} />
      <DetailsBlock route={route} ready={load} onOpened={onDetailsOpened} />
      <SectionCard testID="submit-verify">{verifyBlock()}</SectionCard>
      {sendingBlock()}
      {!submitting && (
        <RunBlock
          run={run}
          onStart={onStart}
          onCheckAgain={onCheckAgain}
          onReread={onReread}
          onBack={onBack}
        />
      )}
      {(idle || showsBack) && (
        <ActionsRow
          testID="submit-actions"
          primary={
            idle ? (
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
      )}
    </View>
  )
}

export default React.memo(SubmitView)
