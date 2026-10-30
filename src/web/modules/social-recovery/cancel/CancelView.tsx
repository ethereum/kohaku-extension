/**
 * The owner's cancel, by state. Before any send: the fresh read of the
 * attempt (failed with a retry, or no attempt open), then the confirm for the
 * attempt the newest read finds open, with its facts and whether the page can
 * send it. While the fresh read runs, the watcher's last reading shows its
 * confirm with the send held beside a refreshing line, or a waiting block
 * where it names no open attempt. Then the shared write states: the gas check
 * with the confirm kept and its send held beside the fee line, the deposit
 * step naming the account's key with both routes, the cancel in progress (with
 * the attempt's ending where a followed request's attempt ended meanwhile), the
 * two readings of the failed state with the move-funds action where the state
 * offers it, after a landing the reads until they name what the cancel
 * ended, then the cancelled terminal.
 */
import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { isSendRefusal } from '@web/modules/social-recovery/shared/client'
import { SectionCard } from '@web/modules/social-recovery/shared/chrome'
import LoadingBlock from '@web/modules/social-recovery/shared/chrome/LoadingBlock'
import RefreshingLine from '@web/modules/social-recovery/shared/chrome/RefreshingLine'
import {
  mayStillLand,
  offersMoveFunds,
  otherRequestPending,
  renderDepositStep,
  WRITES_KEYS
} from '@web/modules/social-recovery/shared/writes'
import type { WriteMachineState } from '@web/modules/social-recovery/shared/writes'
import DepositStepView from '@web/modules/social-recovery/shared/writes/components/DepositStepView'
import WriteStateView from '@web/modules/social-recovery/shared/writes/components/WriteStateView'
import type { WatchedAttempt, WatcherReading } from '@web/modules/social-recovery/watcher'

import { AttemptFacts, CancelledBlock, EndedBlock } from './CancelBlocks'
import type { CancelViewProps, ConfirmWait } from './types'

const BANNER = 'socialRecovery.watcher.banner'
const CANCEL = 'socialRecovery.cancel'

/**
 * Whether a not-sent cancel reads the cancel's own sentence, that the wallet
 * rejected it. A refusal that may still land, one for another request, a
 * replaced transaction, and the run's own gate refusing the add (the claim no
 * longer the run's, or the wait over) read the shared line alone.
 */
const ownNotSentBody = (write: WriteMachineState): boolean =>
  write.status === 'failedNotSent' &&
  !mayStillLand(write) &&
  !otherRequestPending(write) &&
  !write.replaced &&
  !(isSendRefusal(write.error) && write.error.reason === 'timeout')

const CancelView = ({
  read,
  last,
  run,
  readiness,
  timeZone,
  onRetryRead,
  onRetryReady,
  onSend,
  onRecheck,
  onCheckAgain,
  onBack,
  onDone,
  onMoveFunds,
  moveFundsBusy
}: CancelViewProps) => {
  const { t } = useTranslation()
  const { write, target, after } = run

  const backButton = (
    <Button
      testID="cancel-back"
      type="secondary"
      size="small"
      text={t(`${CANCEL}.confirm.back`)}
      onPress={onBack}
      hasBottomSpacing={false}
      style={[flexbox.alignSelfStart, spacings.mtTy]}
    />
  )
  const moveFundsButton = (key: string) => (
    <Button
      testID="cancel-move-funds"
      type="secondary"
      size="small"
      text={t(key)}
      onPress={onMoveFunds}
      disabled={moveFundsBusy}
      hasBottomSpacing={false}
      style={[flexbox.alignSelfStart, spacings.mtTy]}
    />
  )
  const checkAgainButton = (key: string) => (
    <Button
      testID="cancel-check-again"
      type="secondary"
      size="small"
      text={t(key)}
      onPress={onCheckAgain}
      hasBottomSpacing={false}
      style={[flexbox.alignSelfStart, spacings.mtTy]}
    />
  )

  // The confirm for an open attempt; while it waits on a read, its send is held.
  const confirmBlock = (reading: WatcherReading, open: WatchedAttempt, wait: ConfirmWait) => (
    <SectionCard testID="cancel-confirm">
      <Text fontSize={20} weight="medium" style={spacings.mbSm} testID="cancel-confirm-title">
        {t(`${CANCEL}.confirm.title`)}
      </Text>
      <Text fontSize={14} style={spacings.mbTy} testID="cancel-confirm-lead">
        {t(`${CANCEL}.confirm.lead`)}
      </Text>
      <Text fontSize={14} style={spacings.mbSm} testID="cancel-confirm-one-transaction">
        {t(`${CANCEL}.confirm.oneTransaction`)}
      </Text>
      {wait === 'refreshing' && (
        <View testID="cancel-refreshing" style={spacings.mbSm}>
          <RefreshingLine messageKey="socialRecovery.loading.refreshingAttempt" />
        </View>
      )}
      <AttemptFacts attempt={open} dormant={reading.dormant} timeZone={timeZone} />
      <Text
        fontSize={14}
        appearance="secondaryText"
        style={spacings.mbSm}
        testID="cancel-only-own-key"
      >
        {t(`${BANNER}.onlyOwnKey`)}
      </Text>
      {wait === 'fee' && <WriteStateView state={write} testID="cancel-checkingGas" />}
      <View style={[flexbox.directionRow, flexbox.wrap, flexbox.alignCenter]}>
        <Button
          testID="cancel-send"
          type="primary"
          size="small"
          text={t(`${CANCEL}.confirm.send`)}
          onPress={() => onSend(open.attemptId)}
          disabled={readiness !== 'ready' || wait !== null}
          hasBottomSpacing={false}
          style={[spacings.mrSm, spacings.mtTy]}
        />
        {backButton}
      </View>
      {readiness === 'noKey' && (
        <Text fontSize={14} style={spacings.mtSm} testID="cancel-view-only">
          {t(`${CANCEL}.confirm.viewOnly`)}
        </Text>
      )}
      {readiness === 'failed' && (
        <View style={spacings.mtSm} testID="cancel-ready-failed">
          <Text fontSize={14} style={spacings.mbTy} testID="cancel-ready-failed-line">
            {t(`${CANCEL}.confirm.clientFailed`)}
          </Text>
          <Button
            testID="cancel-ready-retry"
            type="secondary"
            size="small"
            text={t(WRITES_KEYS.tryAgain)}
            onPress={onRetryReady}
            hasBottomSpacing={false}
            style={flexbox.alignSelfStart}
          />
        </View>
      )}
    </SectionCard>
  )

  if (after.stage === 'cancelled' || after.stage === 'otherRoad') {
    return (
      <CancelledBlock
        after={after}
        onMoveFunds={onMoveFunds}
        moveFundsBusy={moveFundsBusy}
        onDone={onDone}
      />
    )
  }

  // The newest reading: the one in which the run found its attempt no longer open, else the arrival's.
  const newest = run.gone ?? (read.status === 'read' ? read.arrival.reading : undefined)

  switch (write.status) {
    case 'checkingGas':
      return newest?.attempt ? (
        confirmBlock(newest, newest.attempt, 'fee')
      ) : (
        <SectionCard testID="cancel-loading">
          <LoadingBlock variant="block" message={t('socialRecovery.loading.fee')} />
        </SectionCard>
      )
    case 'needsDeposit': {
      const rendered = renderDepositStep(write.step, {}, t)
      return (
        <SectionCard testID="cancel-gas">
          <DepositStepView step={write.step} variant="blocker" testID="cancel-gas-blocker">
            {rendered.routes.map((route) => (
              <View
                key={route.kind}
                style={spacings.mbSm}
                testID={`cancel-gas-route-${route.kind}`}
              >
                <Text fontSize={14} weight="medium">
                  {route.line}
                </Text>
                {!!route.note && (
                  <Text fontSize={12} appearance="secondaryText">
                    {route.note}
                  </Text>
                )}
              </View>
            ))}
            {rendered.notes.map((note) => (
              <Text key={note} fontSize={14} appearance="secondaryText" style={spacings.mbSm}>
                {note}
              </Text>
            ))}
            <View style={[flexbox.directionRow, flexbox.wrap]}>
              <Button
                testID="cancel-gas-continue"
                type="primary"
                size="small"
                text={t('socialRecovery.actions.continue')}
                onPress={onRecheck}
                hasBottomSpacing={false}
                style={[spacings.mrSm, spacings.mtTy]}
              />
              {backButton}
            </View>
          </DepositStepView>
        </SectionCard>
      )
    }
    case 'submitting':
      return (
        <>
          <SectionCard testID="cancel-in-progress">
            <WriteStateView
              state={{ status: 'submitting', write: 'cancel' }}
              title={t(`${CANCEL}.inProgress.title`)}
              body={[t(`${CANCEL}.inProgress.body`)]}
            >
              {run.stalled ? checkAgainButton(WRITES_KEYS.tryAgain) : null}
            </WriteStateView>
          </SectionCard>
          {!!run.followGone && (
            <EndedBlock reading={run.followGone} target={target} onBack={onBack} held />
          )}
        </>
      )
    case 'landed':
      return (
        <SectionCard testID="cancel-landed">
          <Text fontSize={16} weight="medium" style={spacings.mbTy} testID="cancel-landed-title">
            {t(`${CANCEL}.landed.title`)}
          </Text>
          <Text fontSize={14} style={spacings.mbTy} testID="cancel-landed-body">
            {t(`${CANCEL}.landed.body`)}
          </Text>
          {after.stage === 'unread' ? (
            <>
              <Text
                fontSize={14}
                appearance="secondaryText"
                style={spacings.mbTy}
                testID="cancel-landed-unread"
              >
                {t(`${CANCEL}.landed.unread`)}
              </Text>
              {checkAgainButton(`${CANCEL}.landed.checkAgain`)}
            </>
          ) : (
            <View testID="cancel-landed-reading">
              <RefreshingLine messageKey="socialRecovery.loading.refreshingAttempt" />
            </View>
          )}
        </SectionCard>
      )
    case 'failedNotSent':
      return (
        <SectionCard testID="cancel-not-sent">
          <WriteStateView
            state={write}
            title={t(`${CANCEL}.failed.title`)}
            body={ownNotSentBody(write) ? [t(`${CANCEL}.failed.body`)] : undefined}
            onRetry={target !== undefined ? () => onSend(target) : undefined}
          >
            {offersMoveFunds(write) && moveFundsButton(`${CANCEL}.failed.moveFunds`)}
            {backButton}
          </WriteStateView>
        </SectionCard>
      )
    case 'failedReverted':
      return (
        <SectionCard testID="cancel-reverted">
          <WriteStateView
            state={write}
            onRetry={target !== undefined ? () => onSend(target) : undefined}
          >
            {offersMoveFunds(write) && moveFundsButton(`${CANCEL}.reverted.moveFunds`)}
            {backButton}
          </WriteStateView>
        </SectionCard>
      )
    case 'gasReadError':
      return (
        <SectionCard testID="cancel-check-failed">
          <WriteStateView
            state={write}
            onRetry={target !== undefined ? () => onSend(target) : undefined}
          >
            {backButton}
          </WriteStateView>
        </SectionCard>
      )
    default:
      break
  }

  let reading = run.gone
  if (!reading) {
    if (read.status === 'loading') {
      // The watcher's last reading shows until the fresh read answers; nothing is sent on it.
      return last?.attempt ? (
        confirmBlock(last, last.attempt, 'refreshing')
      ) : (
        <SectionCard testID="cancel-loading">
          <LoadingBlock variant="block" message={t('socialRecovery.loading.attempt')} />
        </SectionCard>
      )
    }
    if (read.status === 'failed') {
      return (
        <SectionCard testID="cancel-read-failed">
          <Text fontSize={14} style={spacings.mbTy} testID="cancel-read-failed-line">
            {t(`${CANCEL}.confirm.readFailed`)}
          </Text>
          <Button
            testID="cancel-read-retry"
            type="primary"
            size="small"
            text={t(WRITES_KEYS.tryAgain)}
            onPress={onRetryRead}
            hasBottomSpacing={false}
            style={flexbox.alignSelfStart}
          />
          {backButton}
        </SectionCard>
      )
    }
    reading = read.arrival.reading
  }
  const open = reading.attempt
  if (!open) {
    return (
      <EndedBlock
        reading={reading}
        target={run.gone ? target : undefined}
        onBack={onBack}
        onCheckAgain={run.gone ? onCheckAgain : onRetryRead}
      />
    )
  }

  return confirmBlock(reading, open, null)
}

export default React.memo(CancelView)
