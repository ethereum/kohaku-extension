/**
 * The save over given props: the account the save writes to with the key a
 * recovery would remove, the module that will hold the account's authority,
 * the cost line, and below them the save as it stands: the arrival's block or
 * the Save button, the gas blocker naming the shortfall and the controlling
 * key, the shared submitting and failed states in the save's own words, a
 * save the network dropped with the one way to save again, a setup the run
 * found already there, the check after the landing, then the
 * saved screen or the disagreed one.
 */
import React from 'react'
import { ActivityIndicator, View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { publisherKeyOf } from '@web/modules/social-recovery/shared/client'
import {
  renderFullAddress,
  renderNoun,
  renderResolvedName,
  renderValueLabel
} from '@web/modules/social-recovery/shared/display'
import { mayStillLand, renderDepositStep } from '@web/modules/social-recovery/shared/writes'
import DepositStepView from '@web/modules/social-recovery/shared/writes/components/DepositStepView'
import WriteStateView from '@web/modules/social-recovery/shared/writes/components/WriteStateView'
import type { SaveBlock } from '@web/modules/social-recovery/setup/review'
import SaveBlocker from '@web/modules/social-recovery/setup/review/SaveBlocker'

import { armScreenOf } from './arrival'
import { saveWriteKeysOf } from './copy'
import { costLineKeyOf } from './cost'
import DisagreedView from './DisagreedView'
import SavedView from './SavedView'
import type { ArmViewProps } from './types'

const REVIEW = 'socialRecovery.review'

const ArmView = ({
  arrival,
  state,
  account,
  action,
  chain,
  level,
  onRetryReads,
  onRetryArrival,
  onSave,
  onRetry,
  onCheckAgain,
  onCheckSetup,
  onSaveAgain,
  onRecheck,
  onReread,
  navigate,
  openUrl
}: ArmViewProps) => {
  const { t } = useTranslation()
  const screen = armScreenOf(state)
  const { write } = state
  // A save that landed while no page followed its hash shows no hash.
  const landed = write.status === 'landed' || !!state.landedUnseen
  const transactionHash = write.status === 'landed' ? write.transactionHash : undefined

  if (screen === 'saved' && landed) {
    return (
      <SavedView
        transactionHash={transactionHash}
        chain={chain}
        account={account}
        level={level}
        navigate={navigate}
        openUrl={openUrl}
      />
    )
  }
  if ((screen === 'disagreed' || screen === 'unread') && landed) {
    return (
      <DisagreedView
        transactionHash={transactionHash}
        chain={chain}
        check={state.after.stage === 'disagreed' ? state.after.check : undefined}
        onReread={onReread}
        navigate={navigate}
        openUrl={openUrl}
      />
    )
  }

  const header = (text: string) => (
    <Text fontSize={12} weight="semiBold" appearance="secondaryText" style={spacings.mbTy}>
      {text}
    </Text>
  )
  const line = (text: string, testID?: string) => (
    <Text fontSize={14} style={spacings.mbTy} testID={testID}>
      {text}
    </Text>
  )
  const name = account.label ? renderResolvedName(account.label, 'besideAddressToCheck', t) : null
  const back = (
    <Button
      testID="arm-back"
      type="outline"
      text={t('socialRecovery.ceremony.backAction')}
      onPress={() => navigate(WEB_ROUTES.socialRecoverySetupReview)}
      hasBottomSpacing={false}
    />
  )
  const refusal = (title: string, body: string | null, onPress?: () => void) => (
    <View style={spacings.mbMd} testID="arm-unavailable">
      <Text fontSize={14} weight="medium" style={spacings.mbSm}>
        {title}
      </Text>
      {body !== null && (
        <Text fontSize={14} appearance="secondaryText" style={spacings.mbSm}>
          {body}
        </Text>
      )}
      {!!onPress && (
        <Button
          testID="arm-arrival-retry"
          type="outline"
          size="small"
          text={t('socialRecovery.writes.tryAgain')}
          onPress={onPress}
          hasBottomSpacing={false}
        />
      )}
    </View>
  )

  const blocker = (blocked: SaveBlock) => (
    <SaveBlocker
      blocked={blocked}
      onRetry={onRetryReads}
      onOpen={() => navigate(WEB_ROUTES.socialRecoveryManage)}
      onEditor={() => navigate(WEB_ROUTES.socialRecoverySetupEditor)}
      onPrivacy={() => navigate(WEB_ROUTES.socialRecoverySetupPrivacy)}
    />
  )

  const arrivalBlock = () => {
    switch (arrival.kind) {
      case 'unavailable':
        // The shared body asks to try again, so it shows only beside a retry.
        if (arrival.retry) {
          return refusal(
            t('socialRecovery.client.unavailableTitle'),
            t('socialRecovery.client.unavailableBody'),
            onRetryArrival
          )
        }
        return refusal(
          t('socialRecovery.client.unavailableTitle'),
          t(
            arrival.cause === 'view-only'
              ? 'socialRecovery.arm.viewOnly'
              : 'socialRecovery.arm.notListed'
          )
        )
      case 'update-the-wallet':
        return refusal(
          t('socialRecovery.client.updateTheWalletTitle'),
          t('socialRecovery.client.updateTheWalletBody')
        )
      case 'load-failed':
        return refusal(t('socialRecovery.records.loadFailed'), null, onRetryArrival)
      case 'blocked':
        return blocker(arrival.block)
      case 'ready':
        return onSave ? (
          <Button
            testID="arm-save"
            type="primary"
            text={t(`${REVIEW}.save`)}
            onPress={onSave}
            hasBottomSpacing={false}
          />
        ) : (
          <ActivityIndicator testID="arm-spinner" />
        )
      default:
        return <ActivityIndicator testID="arm-spinner" />
    }
  }

  const runBlock = () => {
    if (write.status === 'needsDeposit') {
      const rendered = renderDepositStep(write.step, {}, t)
      return (
        <DepositStepView step={write.step} variant="blocker" testID="arm-gas-blocker">
          {rendered.routes.map((route) => (
            <View key={route.kind} style={spacings.mbSm} testID={`arm-gas-route-${route.kind}`}>
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
            testID="arm-gas-continue"
            type="primary"
            text={t('socialRecovery.actions.continue')}
            onPress={onRecheck}
            hasBottomSpacing={false}
          />
        </DepositStepView>
      )
    }
    // A dropped save offers one move: release it and save again.
    if (state.dropped) {
      return (
        <View testID="arm-dropped">
          <Text fontSize={14} style={spacings.mbSm} testID="arm-dropped-line">
            {t('socialRecovery.arm.dropped')}
          </Text>
          <Button
            testID="arm-save-again"
            type="primary"
            text={t('socialRecovery.arm.saveAgain')}
            onPress={onSaveAgain}
            hasBottomSpacing={false}
          />
        </View>
      )
    }
    const keys = saveWriteKeysOf(write, state.follow)
    // Check again waits for the receipt of a stalled hash, or reads again a
    // followed request whose read did not answer.
    const checksAgain =
      write.status === 'submitting' &&
      ((!!write.transactionHash && !!state.stalled) ||
        (!write.transactionHash && state.follow === 'unread'))
    return (
      <WriteStateView
        state={write}
        title={keys.title ? t(keys.title) : undefined}
        body={keys.body ? [t(keys.body)] : undefined}
        note={keys.note ? t(keys.note) : undefined}
        onRetry={onRetry}
        testID={`arm-write-${write.status}`}
      >
        {checksAgain && (
          <Button
            testID="arm-check-again"
            type="outline"
            size="small"
            text={t('socialRecovery.arm.checkAgain')}
            onPress={onCheckAgain}
            hasBottomSpacing={false}
          />
        )}
        {mayStillLand(write) && (
          <Button
            testID="arm-check-setup"
            type="outline"
            size="small"
            text={t('socialRecovery.arm.checkAgain')}
            onPress={onCheckSetup}
            hasBottomSpacing={false}
          />
        )}
      </WriteStateView>
    )
  }

  // Back to the review wherever nothing is on its way to the chain, or the
  // network dropped the save; a save that may still land keeps its stored
  // save in flight, so it offers none.
  const stopped =
    !!state.dropped ||
    (write.status === 'failedNotSent' && !mayStillLand(write)) ||
    write.status === 'failedReverted' ||
    write.status === 'gasReadError' ||
    write.status === 'needsDeposit'

  return (
    <View testID="arm">
      <Text fontSize={20} weight="semiBold" style={spacings.mbLg} testID="arm-title">
        {t('socialRecovery.routes.setupSave')}
      </Text>

      <View style={spacings.mbLg} testID="arm-account">
        {header(t(`${REVIEW}.account.header`))}
        {!!name && line(name.name, 'arm-account-label')}
        {line(renderFullAddress(account.address), 'arm-account-address')}
        {line(t(`${REVIEW}.account.check`))}
        {!!name?.caveat && line(name.caveat, 'arm-account-caveat')}
        {!!account.removedKey && (
          <View style={spacings.mtSm} testID="arm-removed-key">
            {header(renderValueLabel('keyBeingRemoved', t))}
            {line(renderFullAddress(account.removedKey), 'arm-removed-key-address')}
            {line(t(`${REVIEW}.keyRemovedLine`))}
          </View>
        )}
      </View>

      {!!action && (
        <View style={spacings.mbLg} testID="arm-module">
          <Text fontSize={14} weight="medium" style={spacings.mbTy}>
            {action.kind === 'audited'
              ? t(`${REVIEW}.trust.moduleRow`, { publisher: t(publisherKeyOf(action)) })
              : renderNoun('recoveryModule', t)}
          </Text>
          {line(t(`${REVIEW}.trust.moduleAuthority`))}
          {line(t(`${REVIEW}.trust.auditedOnly`))}
        </View>
      )}

      {account.deployed !== undefined && (
        <View style={spacings.mbLg}>
          {line(t(costLineKeyOf(account.deployed)), 'arm-cost-line')}
          <Text fontSize={12} appearance="secondaryText">
            {t(`${REVIEW}.oneConfirmation`)}
          </Text>
        </View>
      )}

      <View style={spacings.mbLg}>
        {screen === 'arrival' && arrivalBlock()}
        {screen === 'run' && runBlock()}
        {screen === 'already-set-up' && blocker({ kind: 'already-set-up' })}
        {screen === 'confirming' && <ActivityIndicator testID="arm-confirming" />}
      </View>

      {(screen === 'arrival' && arrival.kind !== 'ready' && arrival.kind !== 'loading') ||
      (screen === 'run' && stopped) ||
      screen === 'already-set-up' ? (
        <View style={[flexbox.directionRow, flexbox.alignCenter]}>{back}</View>
      ) : null}
    </View>
  )
}

export default React.memo(ArmView)
