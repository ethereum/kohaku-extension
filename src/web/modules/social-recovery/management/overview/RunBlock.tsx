/**
 * A running management write in the shared states: the deposit blocker of
 * the gas check with its routes, a write the network dropped with its send
 * again, the screen's action held beside the fee line while the gas check
 * runs, and otherwise the shared submitting and failed states with the
 * screen's own words where it carries any, and the check again where the
 * receipt wait stalled or the refused operation may still land.
 */
import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { ActionsRow, SectionCard } from '@web/modules/social-recovery/shared/chrome'
import { mayStillLand, renderDepositStep } from '@web/modules/social-recovery/shared/writes'
import DepositStepView from '@web/modules/social-recovery/shared/writes/components/DepositStepView'
import WriteStateView from '@web/modules/social-recovery/shared/writes/components/WriteStateView'

import type { RunBlockProps } from './types'

const RunBlock = ({ run, write: kind, droppedLine, keysOf, action, testID }: RunBlockProps) => {
  const { t } = useTranslation()
  const { state } = run
  const { write } = state

  if (write.status === 'needsDeposit') {
    const rendered = renderDepositStep(write.step, {}, t)
    return (
      <SectionCard spacing="none">
        <DepositStepView step={write.step} variant="blocker" testID={`${testID}-gas`}>
          {rendered.routes.map((route) => (
            <View key={route.kind} style={spacings.mbSm}>
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
          <Button
            testID={`${testID}-gas-continue`}
            type="primary"
            size="small"
            text={t('socialRecovery.actions.continue')}
            onPress={run.recheck}
            hasBottomSpacing={false}
            style={flexbox.alignSelfStart}
          />
        </DepositStepView>
      </SectionCard>
    )
  }
  if (state.dropped) {
    return (
      <SectionCard spacing="none" testID={`${testID}-dropped`}>
        <Text fontSize={14} style={spacings.mbTy} testID={`${testID}-dropped-line`}>
          {t(droppedLine)}
        </Text>
        <Button
          testID={`${testID}-send-again`}
          type="secondary"
          size="small"
          text={t('socialRecovery.writes.tryAgain')}
          onPress={run.saveAgain}
          hasBottomSpacing={false}
          style={[flexbox.alignSelfStart, spacings.mtTy]}
        />
      </SectionCard>
    )
  }
  const checksAgain =
    write.status === 'submitting' &&
    ((!!write.transactionHash && !!state.stalled) ||
      (!write.transactionHash && state.follow === 'unread'))
  const keys = keysOf ? keysOf(write) : {}
  return (
    <SectionCard spacing="none">
      <WriteStateView
        state={kind ? { ...write, write: kind } : write}
        body={keys.body ? [t(keys.body)] : undefined}
        onRetry={run.start}
        testID={`${testID}-${write.status}`}
      >
        {write.status === 'checkingGas' && !!action && <ActionsRow primary={action} />}
        {checksAgain && (
          <Button
            testID={`${testID}-check-again`}
            type="secondary"
            size="small"
            text={t('socialRecovery.arm.checkAgain')}
            onPress={run.checkAgain}
            hasBottomSpacing={false}
            style={[flexbox.alignSelfStart, spacings.mtTy]}
          />
        )}
        {mayStillLand(write) && (
          <Button
            testID={`${testID}-check-chain`}
            type="secondary"
            size="small"
            text={t('socialRecovery.arm.checkAgain')}
            onPress={run.checkSetup}
            hasBottomSpacing={false}
            style={[flexbox.alignSelfStart, spacings.mtTy]}
          />
        )}
      </WriteStateView>
    </SectionCard>
  )
}

export default React.memo(RunBlock)
