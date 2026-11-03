/**
 * The wait over given props. Until a poll answers, the countdown shows from
 * the countdown's record with a line that says the chain is read, and Execute
 * held; a record without the executable time shows a waiting block. A failed
 * read renders with retry and no number; a failed poll also offers Back to
 * the route's entry. An answered poll stays on screen while a later round
 * reads, with the same line, and renders
 * its phase: the countdown, with the transaction that started it, where its
 * end comes from and the notes that the page can close, that the account's
 * own key can still cancel and who finishes it beside it; execution due under
 * its own title, with execute now; the recovery that can no longer execute with its cause alone,
 * no countdown beside it; the cancelled terminal by its canceller. A consumed
 * attempt says the recovery finishes while the screen goes on to the done
 * screen.
 */
import React from 'react'
import { View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { PageTitle, SectionCard, TwoColumn } from '@web/modules/social-recovery/shared/chrome'
import LoadingBlock from '@web/modules/social-recovery/shared/chrome/LoadingBlock'
import RefreshingLine from '@web/modules/social-recovery/shared/chrome/RefreshingLine'
import { renderHash } from '@web/modules/social-recovery/shared/display'

import CancelledBlock from './CancelledBlock'
import CannotExecuteBlock from './CannotExecuteBlock'
import CountdownBlock from './CountdownBlock'
import ExecuteBlock from './ExecuteBlock'
import { thresholdOneOf } from './phase'
import PollFailedBlock from './PollFailedBlock'
import type { WaitViewProps } from './types'

const WAIT = 'socialRecovery.wait'

const WaitView = ({
  account,
  networkName,
  client,
  keys,
  poll,
  polling,
  remainingMs,
  executableAt,
  startedAt,
  timeZone,
  configuration,
  execute,
  sending,
  holdsAccountKey,
  leave,
  onExecute,
  onRetryPoll,
  onRetryKeys,
  onRetryClient,
  onLeave,
  onBack,
  onMoveFunds,
  onOpenExplorer
}: WaitViewProps) => {
  const { t } = useTranslation()

  const failedRead = (testID: string, onRetry: () => void) => (
    <TwoColumn testID="wait-columns">
      <View testID={testID}>
        <Alert
          type="error"
          size="sm"
          title={t('socialRecovery.wait.readFailedTitle')}
          text={t('socialRecovery.wait.readFailedBody')}
        >
          <Button
            testID={`${testID}-retry`}
            type="secondary"
            size="small"
            text={t('socialRecovery.writes.tryAgain')}
            onPress={onRetry}
            hasBottomSpacing={false}
            style={[flexbox.alignSelfStart, spacings.mtSm]}
          />
        </Alert>
      </View>
    </TwoColumn>
  )

  if (client.status === 'update-the-wallet') {
    return (
      <TwoColumn testID="wait-columns">
        <View testID="wait-update-the-wallet">
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
  if (client.status === 'failed') {
    return failedRead('wait-client-failed', onRetryClient)
  }
  if (keys.status === 'failed') {
    return failedRead('wait-keys-failed', onRetryKeys)
  }
  if (poll.status === 'failed') {
    return (
      <TwoColumn testID="wait-columns">
        <View testID="wait">
          <PageTitle title={t(`${WAIT}.title`)} titleTestID="wait-title" />
          <PollFailedBlock onRetry={onRetryPoll} />
          <Button
            testID="wait-poll-back"
            type="outline"
            text={t('socialRecovery.actions.back')}
            onPress={onBack}
            hasBottomSpacing={false}
            style={flexbox.alignSelfStart}
          />
        </View>
      </TwoColumn>
    )
  }
  if (client.status === 'loading' || keys.status === 'loading' || poll.status === 'pending') {
    if (executableAt === null) {
      return (
        <View testID="wait-loading" style={flexbox.flex1}>
          <LoadingBlock variant="screen" message={t('socialRecovery.loading.countdown')} />
        </View>
      )
    }
    // The record's reading stays on screen, every decision held, until the chain answers.
    const dueByRecord = remainingMs !== null && remainingMs <= 0
    return (
      <TwoColumn testID="wait-columns">
        <View testID="wait">
          <PageTitle
            title={t(dueByRecord ? `${WAIT}.dueTitle` : `${WAIT}.title`)}
            lead={t(dueByRecord ? `${WAIT}.dueLead` : `${WAIT}.lead`)}
            titleTestID="wait-title"
          />
          <View testID="wait-refreshing" style={spacings.mbSm}>
            <RefreshingLine messageKey="socialRecovery.loading.refreshingAttempt" />
          </View>
          <CountdownBlock
            executableAt={executableAt}
            due={dueByRecord}
            account={account}
            networkName={networkName}
            newKey={keys.status === 'ready' ? keys.keys.newKey : undefined}
            remainingMs={remainingMs}
            startedAt={startedAt}
            timeZone={timeZone}
            configuration={configuration}
          />
          {dueByRecord && (
            <ExecuteBlock execute={execute} sending={sending} ready={false} onExecute={onExecute} />
          )}
        </View>
      </TwoColumn>
    )
  }

  const { phase } = poll
  if (phase.kind === 'consumed') {
    return (
      <View testID="wait-consumed" style={flexbox.flex1}>
        <LoadingBlock variant="screen" message={t('socialRecovery.loading.finishing')} />
      </View>
    )
  }
  if (phase.kind === 'cancelled') {
    return (
      <TwoColumn testID="wait-columns">
        <CancelledBlock
          account={account}
          by={phase.by}
          thresholdOne={!!configuration && thresholdOneOf(configuration)}
          leave={leave}
          onLeave={onLeave}
        />
      </TwoColumn>
    )
  }

  const note = (title: string, body: string[], testID: string) => (
    <SectionCard tone="muted" spacing="item" label={title} testID={testID}>
      {body.map((line) => (
        <Text key={line} fontSize={12} appearance="secondaryText" style={spacings.mbTy}>
          {line}
        </Text>
      ))}
    </SectionCard>
  )
  const executing = execute.write.status !== 'idle'
  const due = phase.kind === 'executionDue'
  const counting = phase.kind === 'waiting' || due
  const transactionHash = poll.story.started?.at.transactionHash

  const aside = (
    <>
      {counting && !!transactionHash && (
        <SectionCard
          tone="muted"
          spacing="item"
          label={t(`${WAIT}.startedOnChain`)}
          testID="wait-started-on-chain"
        >
          <Text fontSize={12} weight="number_medium" selectable testID="wait-start-hash">
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
        </SectionCard>
      )}
      {counting &&
        note(t(`${WAIT}.endFromChainTitle`), [t(`${WAIT}.endFromChain`)], 'wait-end-from-chain')}
      {phase.kind === 'waiting' &&
        note(t(`${WAIT}.canCloseTitle`), [t(`${WAIT}.canCloseBody`)], 'wait-can-close')}
      {phase.kind !== 'cannotExecute' &&
        note(
          t(`${WAIT}.ownerCanCancelTitle`),
          [t(`${WAIT}.ownCancelNote`), t(`${WAIT}.youWillSee`)],
          'wait-owner-can-cancel'
        )}
      {phase.kind === 'waiting' &&
        note(t(`${WAIT}.whoFinishesTitle`), [t(`${WAIT}.whoFinishesBody`)], 'wait-who-finishes')}
    </>
  )

  return (
    <TwoColumn testID="wait-columns" aside={aside}>
      <View testID="wait">
        <PageTitle
          title={t(due ? `${WAIT}.dueTitle` : `${WAIT}.title`)}
          lead={t(due ? `${WAIT}.dueLead` : `${WAIT}.lead`)}
          titleTestID="wait-title"
        />
        {polling && (
          <View testID="wait-refreshing" style={spacings.mbSm}>
            <RefreshingLine messageKey="socialRecovery.loading.refreshingAttempt" />
          </View>
        )}
        {(phase.kind === 'waiting' || phase.kind === 'executionDue') && (
          <CountdownBlock
            executableAt={phase.attempt.consumableAfter}
            due={due}
            account={account}
            networkName={networkName}
            newKey={keys.keys.newKey}
            remainingMs={remainingMs}
            startedAt={startedAt}
            timeZone={timeZone}
            configuration={configuration}
          />
        )}
        {phase.kind === 'cannotExecute' && (
          <CannotExecuteBlock
            cause={phase.cause}
            holdsAccountKey={holdsAccountKey}
            onMoveFunds={onMoveFunds}
          />
        )}
        {(due || executing) && (
          <ExecuteBlock
            execute={execute}
            sending={sending}
            ready={due && !!poll.story.started && !polling}
            onExecute={onExecute}
          />
        )}
      </View>
    </TwoColumn>
  )
}

export default React.memo(WaitView)
