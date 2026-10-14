/**
 * The done screen over given props. Until the consume event's read answers it
 * renders loading; a failed read renders failed with retry; a read that found
 * no consume renders nothing of done (the screen goes back to the wait). The
 * done text waits for the add of the recovered account to this wallet and
 * renders its failure with retry.
 *
 * Then: the account is the holder's again since the consume's block time; the
 * account with the set-up chip; the key that now controls it as the consume's
 * transaction reports it, with the line by route (one fresh key on this
 * device, and the account is now in this wallet; or the receiving account's
 * key now shared by two accounts) and its one limit; the key the recovery
 * removed; what the recovery did; one cleanup block for each passkey of the
 * path; that other doors may exist; that the setup survived, with edit or
 * replace and the recovery password change; and the last act.
 */
import React from 'react'
import { ActivityIndicator, View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import common from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'
import {
  ActionsRow,
  PageTitle,
  SectionCard,
  SectionLabel,
  StatusChip
} from '@web/modules/social-recovery/shared/chrome'
import {
  renderApprovalValueName,
  renderChip,
  renderFullAddress,
  renderValueLabel
} from '@web/modules/social-recovery/shared/display'
import { dateOf } from '@web/modules/social-recovery/recovery/checklist'

import CleanupBlock from './CleanupBlock'
import RecoveryDidBlock from './RecoveryDidBlock'
import type { DoneViewProps } from './types'

const DONE = 'socialRecovery.done'

const DoneView = ({
  account,
  accountName,
  route,
  receivingName,
  read,
  add,
  summary,
  timeZone,
  finish,
  onRetryRead,
  onRetryAdd,
  onClose,
  onEdit
}: DoneViewProps) => {
  const { t } = useTranslation()
  const { theme } = useTheme()

  const failedRead = (testID: string, onRetry: () => void) => (
    <View testID={testID}>
      <Alert
        type="error"
        size="sm"
        title={t(`${DONE}.readFailedTitle`)}
        text={t(`${DONE}.readFailedBody`)}
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

  if (read.status === 'failed') {
    return failedRead('done-read-failed', onRetryRead)
  }
  if (read.status === 'pending' || read.reading.kind === 'none' || !summary) {
    return <ActivityIndicator testID="done-loading" />
  }
  const { event } = read.reading

  if (add.status === 'adding') {
    return (
      <View testID="done-adding">
        <PageTitle title={t(`${DONE}.title`)} titleTestID="done-title" />
        <ActivityIndicator testID="done-add-loading" />
      </View>
    )
  }
  if (add.status === 'failed') {
    return (
      <View testID="done-add-failed">
        <PageTitle title={t(`${DONE}.title`)} titleTestID="done-title" />
        <Alert type="error" size="sm" text={t(`${DONE}.addFailed`)}>
          <Button
            testID="done-add-retry"
            type="secondary"
            size="small"
            text={t(`${DONE}.addRetry`)}
            onPress={onRetryAdd}
            hasBottomSpacing={false}
            style={[flexbox.alignSelfStart, spacings.mtSm]}
          />
        </Alert>
      </View>
    )
  }

  const value = (label: string, text: string, testID: string, lines: string[]) => (
    <View
      style={[
        common.borderRadiusPrimary,
        spacings.phSm,
        spacings.pvSm,
        spacings.mbTy,
        { backgroundColor: theme.secondaryBackground }
      ]}
    >
      <SectionLabel>{label}</SectionLabel>
      <Text
        fontSize={14}
        weight="number_medium"
        selectable
        style={lines.length > 0 ? spacings.mbTy : undefined}
        testID={testID}
      >
        {text}
      </Text>
      {lines.map((line, index) => (
        <Text
          key={line}
          fontSize={12}
          appearance="secondaryText"
          style={index < lines.length - 1 ? spacings.mbMi : undefined}
          testID={`${testID}-line-${index}`}
        >
          {line}
        </Text>
      ))}
    </View>
  )

  const controlledLines: string[] = []
  if (route === 'fresh-install') {
    controlledLines.push(t(`${DONE}.freshKey`))
  } else if (route === 'logged-in' && receivingName) {
    controlledLines.push(t(`${DONE}.sharedKey`, { account: receivingName }))
  }
  controlledLines.push(t(`${DONE}.keyLimit`))
  const accountLine = accountName
    ? t('socialRecovery.display.nameWithAccount', {
        account: renderFullAddress(account),
        name: accountName
      })
    : renderFullAddress(account)
  const busy = finish === 'finishing'

  return (
    <View testID="done">
      <View style={spacings.mbLg}>
        <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.wrap, spacings.mbTy]}>
          <Text fontSize={20} weight="medium" testID="done-title">
            {t(`${DONE}.title`)}
          </Text>
          <StatusChip
            text={renderChip('recovery', 'setUp', t)}
            tone="success"
            style={spacings.mlSm}
            testID="done-chip"
          />
        </View>
        <Text fontSize={14} appearance="secondaryText" testID="done-lead">
          {t(`${DONE}.lead`, { date: dateOf(event.time * 1000, timeZone) })}
        </Text>
        {route === 'fresh-install' && (
          <Text fontSize={14} style={spacings.mtTy} testID="done-now-in-wallet">
            {t(`${DONE}.nowInWallet`)}
          </Text>
        )}
      </View>

      <SectionCard testID="done-keys">
        {value(renderValueLabel('account', t), accountLine, 'done-account', [])}
        {value(
          renderApprovalValueName('newKey', { doneScreen: true }, t),
          renderFullAddress(event.granted),
          'done-controlled-by',
          controlledLines
        )}
        {value(
          renderApprovalValueName('keyBeingRemoved', { doneScreen: true }, t),
          renderFullAddress(event.removed),
          'done-removed',
          [t(`${DONE}.removedLine`)]
        )}
      </SectionCard>

      <RecoveryDidBlock summary={summary} />

      {summary.cleanup.map((block) => (
        <CleanupBlock
          key={block.place}
          block={block}
          row={summary.rows.find((row) => row.place === block.place)}
          disabled={busy}
          onEdit={onEdit}
        />
      ))}

      <SectionCard testID="done-next">
        <Text fontSize={14} style={spacings.mbTy} testID="done-other-doors">
          {t(`${DONE}.otherDoors`)}
        </Text>
        <Text fontSize={14} style={spacings.mbTy} testID="done-survived">
          {t(`${DONE}.survived`)}
        </Text>
        <Text fontSize={14} style={spacings.mbSm} testID="done-password-change">
          {t(`${DONE}.passwordChange`)}
        </Text>
        <Button
          testID="done-edit"
          type="secondary"
          size="small"
          text={t(`${DONE}.editOrReplace`)}
          disabled={busy}
          onPress={onEdit}
          hasBottomSpacing={false}
          style={flexbox.alignSelfStart}
        />
      </SectionCard>

      {finish === 'failed' && (
        <Alert
          testID="done-finish-failed"
          type="error"
          size="sm"
          style={spacings.mbSm}
          text={t(`${DONE}.lastActFailed`)}
        />
      )}
      <ActionsRow
        primary={
          <Button
            testID="done-close"
            type="primary"
            text={t(`${DONE}.close`)}
            disabled={busy}
            onPress={onClose}
            hasBottomSpacing={false}
          />
        }
      />
    </View>
  )
}

export default React.memo(DoneView)
