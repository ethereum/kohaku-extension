/**
 * The wait over given props. Until a poll answers, and whenever one fails,
 * it renders the loading or the failed read with retry and no number; a
 * failed poll also offers Back to the route's entry. An answered poll renders
 * its phase: the countdown with the notes that the page can close, that the
 * account's own key can still cancel and who finishes it; execution due with
 * execute now; the recovery that can no longer execute with its cause alone,
 * no countdown beside it; the cancelled terminal by its canceller. A consumed
 * attempt renders nothing of its own: the screen goes on to the done screen.
 */
import React from 'react'
import { ActivityIndicator, View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { PageTitle, SectionCard } from '@web/modules/social-recovery/shared/chrome'

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
  client,
  keys,
  poll,
  remainingMs,
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
  )

  if (client.status === 'update-the-wallet') {
    return (
      <View testID="wait-update-the-wallet">
        <Alert
          type="error"
          size="sm"
          title={t('socialRecovery.client.updateTheWalletTitle')}
          text={t('socialRecovery.client.updateTheWalletBody')}
        />
      </View>
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
    )
  }
  if (client.status === 'loading' || keys.status === 'loading' || poll.status === 'pending') {
    return <ActivityIndicator testID="wait-loading" />
  }

  const { phase } = poll
  if (phase.kind === 'consumed') {
    return <ActivityIndicator testID="wait-consumed" />
  }
  if (phase.kind === 'cancelled') {
    return (
      <CancelledBlock
        account={account}
        by={phase.by}
        thresholdOne={!!configuration && thresholdOneOf(configuration)}
        leave={leave}
        onLeave={onLeave}
      />
    )
  }

  const note = (title: string, body: string[], testID: string) => (
    <SectionCard testID={testID}>
      <Text fontSize={14} weight="medium" style={spacings.mbTy}>
        {title}
      </Text>
      {body.map((line) => (
        <Text key={line} fontSize={14} appearance="secondaryText" style={spacings.mbTy}>
          {line}
        </Text>
      ))}
    </SectionCard>
  )
  const executing = execute.write.status !== 'idle'

  return (
    <View testID="wait">
      <PageTitle title={t(`${WAIT}.title`)} lead={t(`${WAIT}.lead`)} titleTestID="wait-title" />
      <CountdownBlock
        round={poll}
        account={account}
        newKey={keys.keys.newKey}
        remainingMs={remainingMs}
        startedAt={startedAt}
        timeZone={timeZone}
        configuration={configuration}
        onOpenExplorer={onOpenExplorer}
      />
      {phase.kind === 'cannotExecute' && (
        <CannotExecuteBlock
          cause={phase.cause}
          holdsAccountKey={holdsAccountKey}
          onMoveFunds={onMoveFunds}
        />
      )}
      {(phase.kind === 'executionDue' || executing) && (
        <ExecuteBlock
          execute={execute}
          sending={sending}
          ready={phase.kind === 'executionDue' && !!poll.story.started}
          onExecute={onExecute}
        />
      )}
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
    </View>
  )
}

export default React.memo(WaitView)
