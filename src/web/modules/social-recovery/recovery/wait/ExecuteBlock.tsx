/**
 * Execution due: the waiting period ended and nobody executed yet. Execute
 * now runs the gas check on the sending key, the deposit step where it holds
 * too little, then one transaction; the shared write states render in the
 * execution's own words. A landed receipt waits on the poll, which reads the
 * attempt consumed before the done screen renders.
 */
import React from 'react'
import { ActivityIndicator, View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { SectionCard } from '@web/modules/social-recovery/shared/chrome'
import DepositStepView from '@web/modules/social-recovery/shared/writes/components/DepositStepView'
import WriteStateView from '@web/modules/social-recovery/shared/writes/components/WriteStateView'

import type { ExecuteBlockProps } from './types'

const DUE = 'socialRecovery.wait.executionDue'

const ExecuteBlock = ({ execute, sending, ready, onExecute }: ExecuteBlockProps) => {
  const { t } = useTranslation()
  const { write } = execute

  const body = () => {
    if (write.status === 'landed') {
      return <ActivityIndicator testID="wait-execute-confirming" />
    }
    if (write.status === 'needsDeposit') {
      return (
        <View testID="wait-execute-gas">
          <DepositStepView step={write.step} variant="blocker" testID="wait-execute-blocker" />
          <DepositStepView step={write.step} balance={execute.balance} testID="wait-execute-step" />
        </View>
      )
    }
    if (write.status === 'idle') {
      return (
        <>
          <Text fontSize={14} appearance="secondaryText" style={spacings.mbSm}>
            {t(`${DUE}.secondTransaction`)}
          </Text>
          {sending.status === 'unavailable' && (
            <Alert
              testID="wait-sending-unavailable"
              type="error"
              size="sm"
              style={spacings.mbSm}
              text={t('socialRecovery.wait.noSendingKey')}
            />
          )}
          <Button
            testID="wait-execute"
            type="primary"
            text={t(`${DUE}.action`)}
            disabled={!ready || sending.status !== 'ready'}
            onPress={onExecute}
            hasBottomSpacing={false}
            style={flexbox.alignSelfStart}
          />
        </>
      )
    }
    // A refusal before the chain, neither replaced nor of a route this wallet
    // cannot follow nor held by another request, reads the execution's own words.
    const plainNotSent =
      write.status === 'failedNotSent' &&
      !write.replaced &&
      !write.mayStillLand &&
      !write.otherRequest
    let lines: string[] | undefined
    if (write.status === 'submitting') {
      lines = [t(`${DUE}.executing`)]
    } else if (plainNotSent) {
      lines = [t(`${DUE}.notSent`)]
    }
    // Outside execution due nothing can run again, so no retry shows there: the poll is the way back.
    return (
      <WriteStateView
        state={write}
        body={lines}
        onRetry={ready ? onExecute : undefined}
        testID={`wait-execute-${write.status}`}
      />
    )
  }

  return (
    <SectionCard testID="wait-execution-due">
      <Text fontSize={14} style={spacings.mbSm} testID="wait-execution-due-lead">
        {t(`${DUE}.lead`)}
      </Text>
      {body()}
    </SectionCard>
  )
}

export default React.memo(ExecuteBlock)
