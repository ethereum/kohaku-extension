/**
 * The submission as it stands once it started: the gas check, the deposit
 * step that reads the balance again by itself, the shared submitting and
 * failed states in the submission's own words, the refusal for an attempt
 * already running with no retry, the read after a landed receipt, and a
 * start the network dropped, offered again.
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
import { mayStillLand } from '@web/modules/social-recovery/shared/writes'
import DepositStepView from '@web/modules/social-recovery/shared/writes/components/DepositStepView'
import WriteStateView from '@web/modules/social-recovery/shared/writes/components/WriteStateView'

import { revertedRunning } from './refusal'
import { landedOf } from './run'
import type { RunBlockProps } from './types'

const SUBMIT = 'socialRecovery.submit'

const RunBlock = ({ run, onStart, onCheckAgain, onReread, onBack }: RunBlockProps) => {
  const { t } = useTranslation()
  const { write } = run

  const button = (testID: string, text: string, onPress: () => void, primary = false) => (
    <Button
      testID={testID}
      type={primary ? 'primary' : 'secondary'}
      size="small"
      text={text}
      onPress={onPress}
      hasBottomSpacing={false}
      style={[flexbox.alignSelfStart, spacings.mtTy]}
    />
  )

  // A revert that names an attempt running reads as landed once the attempt is this request's own.
  if (landedOf(run)) {
    if (run.after === 'unread') {
      return (
        <View testID="submit-unread">
          <Alert
            type="error"
            size="sm"
            title={t(`${SUBMIT}.landingReadFailedTitle`)}
            text={t(`${SUBMIT}.landingReadFailedBody`)}
          >
            {button('submit-reread', t('socialRecovery.writes.tryAgain'), onReread)}
          </Alert>
        </View>
      )
    }
    return <ActivityIndicator testID="submit-confirming" />
  }

  if (run.refusal || revertedRunning(write)) {
    return (
      <SectionCard testID="submit-already-running">
        <Text fontSize={16} weight="medium" style={spacings.mbTy}>
          {t(`${SUBMIT}.failedTitle`)}
        </Text>
        <Text fontSize={14} style={spacings.mbTy}>
          {t(`${SUBMIT}.alreadyRunning.cannotHelp`)}
        </Text>
        <Text fontSize={14} style={spacings.mbTy}>
          {t(`${SUBMIT}.alreadyRunning.whatYouCanDo`)}
        </Text>
        {button('submit-back-to-checklist', t(`${SUBMIT}.alreadyRunning.view`), onBack)}
      </SectionCard>
    )
  }

  if (write.status === 'needsDeposit') {
    return (
      <SectionCard spacing="none">
        <Text fontSize={14} style={spacings.mbSm} testID="submit-gas-lead">
          {t(`${SUBMIT}.gas.lead`)}
        </Text>
        <DepositStepView step={write.step} balance={run.balance} testID="submit-gas-step">
          <Button
            testID="submit-gas-continue"
            type="primary"
            size="small"
            text={t('socialRecovery.actions.continue')}
            disabled
            onPress={() => undefined}
            hasBottomSpacing={false}
            style={flexbox.alignSelfStart}
          />
        </DepositStepView>
        <Text fontSize={14} style={spacings.mtSm} testID="submit-gas-collected-stays">
          {t(`${SUBMIT}.gas.collectedStays`)}
        </Text>
      </SectionCard>
    )
  }

  if (write.status === 'idle') {
    return run.dropped ? (
      <View testID="submit-dropped">
        <Alert
          type="warning"
          size="sm"
          title={t(`${SUBMIT}.droppedTitle`)}
          text={t(`${SUBMIT}.droppedBody`)}
        />
      </View>
    ) : null
  }

  // A refusal before the chain, neither replaced nor of a route this wallet
  // cannot follow nor held by another request, reads the submission's own words.
  const plainNotSent =
    write.status === 'failedNotSent' &&
    !write.replaced &&
    !write.mayStillLand &&
    !write.otherRequest
  const failed = write.status === 'failedNotSent' || write.status === 'failedReverted'
  const checks =
    (write.status === 'submitting' && (!!write.transactionHash || !!run.follow)) ||
    mayStillLand(write)
  const view = (
    <WriteStateView
      state={write}
      title={failed ? t(`${SUBMIT}.failedTitle`) : undefined}
      body={plainNotSent ? [t(`${SUBMIT}.notSent`)] : undefined}
      onRetry={onStart}
      testID={`submit-write-${write.status}`}
    >
      {checks && button('submit-check-again', t(`${SUBMIT}.checkAgain`), onCheckAgain)}
    </WriteStateView>
  )
  return write.status === 'checkingGas' ? view : <SectionCard spacing="none">{view}</SectionCard>
}

export default React.memo(RunBlock)
