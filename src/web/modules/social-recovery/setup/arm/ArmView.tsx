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

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import common from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'
import { PageTitle, SectionCard, SectionLabel } from '@web/modules/social-recovery/shared/chrome'
import { publisherKeyOf } from '@web/modules/social-recovery/shared/client'
import {
  renderFullAddress,
  renderNoun,
  renderResolvedName,
  renderValueLabel
} from '@web/modules/social-recovery/shared/display'
import {
  mayStillLand,
  renderDepositStep,
  type WriteStatus
} from '@web/modules/social-recovery/shared/writes'
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

// The write states that draw lines of their own; the gas check's spinner and
// the states that render nothing stay outside a card.
const CARDED_WRITE_STATUSES: readonly WriteStatus[] = [
  'gasReadError',
  'submitting',
  'failedNotSent',
  'failedReverted'
]

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
  const { theme } = useTheme()
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
  const muted = (text: string, testID?: string) => (
    <Text fontSize={12} appearance="secondaryText" style={spacings.mbTy} testID={testID}>
      {text}
    </Text>
  )
  // A refusal with no body of its own reads as one sentence.
  const refusal = (title: string, body: string | null, onPress?: () => void) => (
    <View testID="arm-unavailable">
      <Alert type="error" size="sm" title={body !== null ? title : undefined} text={body ?? title}>
        {!!onPress && (
          <Button
            testID="arm-arrival-retry"
            type="secondary"
            size="small"
            text={t('socialRecovery.writes.tryAgain')}
            onPress={onPress}
            hasBottomSpacing={false}
            style={[flexbox.alignSelfStart, spacings.mtSm]}
          />
        )}
      </Alert>
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
          <View style={flexbox.directionRow}>
            <Button
              testID="arm-save"
              type="primary"
              text={t(`${REVIEW}.save`)}
              onPress={onSave}
              hasBottomSpacing={false}
            />
          </View>
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
        <SectionCard spacing="none">
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
              size="small"
              text={t('socialRecovery.actions.continue')}
              onPress={onRecheck}
              hasBottomSpacing={false}
              style={flexbox.alignSelfStart}
            />
          </DepositStepView>
        </SectionCard>
      )
    }
    // A dropped save offers one move: release it and save again.
    if (state.dropped) {
      return (
        <SectionCard spacing="none" testID="arm-dropped">
          <Text fontSize={14} style={spacings.mbTy} testID="arm-dropped-line">
            {t('socialRecovery.arm.dropped')}
          </Text>
          <Button
            testID="arm-save-again"
            type="secondary"
            size="small"
            text={t('socialRecovery.arm.saveAgain')}
            onPress={onSaveAgain}
            hasBottomSpacing={false}
            style={[flexbox.alignSelfStart, spacings.mtTy]}
          />
        </SectionCard>
      )
    }
    const keys = saveWriteKeysOf(write, state.follow)
    // Check again waits for the receipt of a stalled hash, or reads again a
    // followed request whose read did not answer.
    const checksAgain =
      write.status === 'submitting' &&
      ((!!write.transactionHash && !!state.stalled) ||
        (!write.transactionHash && state.follow === 'unread'))
    const view = (
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
            type="secondary"
            size="small"
            text={t('socialRecovery.arm.checkAgain')}
            onPress={onCheckAgain}
            hasBottomSpacing={false}
            style={[flexbox.alignSelfStart, spacings.mtTy]}
          />
        )}
        {mayStillLand(write) && (
          <Button
            testID="arm-check-setup"
            type="secondary"
            size="small"
            text={t('socialRecovery.arm.checkAgain')}
            onPress={onCheckSetup}
            hasBottomSpacing={false}
            style={[flexbox.alignSelfStart, spacings.mtTy]}
          />
        )}
      </WriteStateView>
    )
    return CARDED_WRITE_STATUSES.includes(write.status) ? (
      <SectionCard spacing="none">{view}</SectionCard>
    ) : (
      view
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
      <PageTitle title={t('socialRecovery.routes.setupSave')} titleTestID="arm-title" />

      <SectionCard label={t(`${REVIEW}.account.header`)} testID="arm-account">
        {!!name && (
          <Text fontSize={16} weight="medium" style={spacings.mbTy} testID="arm-account-label">
            {name.name}
          </Text>
        )}
        <Text
          fontSize={14}
          weight="number_medium"
          selectable
          style={spacings.mbTy}
          testID="arm-account-address"
        >
          {renderFullAddress(account.address)}
        </Text>
        {muted(t(`${REVIEW}.account.check`))}
        {!!name?.caveat && muted(name.caveat, 'arm-account-caveat')}
        {!!account.removedKey && (
          <View style={spacings.mtTy} testID="arm-removed-key">
            <View
              style={[
                common.borderRadiusPrimary,
                spacings.phSm,
                spacings.pvSm,
                spacings.mbTy,
                { backgroundColor: theme.secondaryBackground }
              ]}
            >
              <SectionLabel>{renderValueLabel('keyBeingRemoved', t)}</SectionLabel>
              <Text
                fontSize={14}
                weight="number_medium"
                selectable
                testID="arm-removed-key-address"
              >
                {renderFullAddress(account.removedKey)}
              </Text>
            </View>
            <Text fontSize={12} appearance="secondaryText">
              {t(`${REVIEW}.keyRemovedLine`)}
            </Text>
          </View>
        )}
      </SectionCard>

      {!!action && (
        <SectionCard testID="arm-module">
          <Text fontSize={16} weight="medium" style={spacings.mbTy}>
            {action.kind === 'audited'
              ? t(`${REVIEW}.trust.moduleRow`, { publisher: t(publisherKeyOf(action)) })
              : renderNoun('recoveryModule', t)}
          </Text>
          {line(t(`${REVIEW}.trust.moduleAuthority`))}
          {line(t(`${REVIEW}.trust.auditedOnly`))}
        </SectionCard>
      )}

      {account.deployed !== undefined && (
        <SectionCard>
          {line(t(costLineKeyOf(account.deployed)), 'arm-cost-line')}
          <Text fontSize={12} appearance="secondaryText">
            {t(`${REVIEW}.oneConfirmation`)}
          </Text>
        </SectionCard>
      )}

      <View>
        {screen === 'arrival' && arrivalBlock()}
        {screen === 'run' && runBlock()}
        {screen === 'already-set-up' && blocker({ kind: 'already-set-up' })}
        {screen === 'confirming' && <ActivityIndicator testID="arm-confirming" />}
      </View>

      {(screen === 'arrival' && arrival.kind !== 'ready' && arrival.kind !== 'loading') ||
      (screen === 'run' && stopped) ||
      screen === 'already-set-up' ? (
        <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.mtSm]}>{back}</View>
      ) : null}
    </View>
  )
}

export default React.memo(ArmView)
