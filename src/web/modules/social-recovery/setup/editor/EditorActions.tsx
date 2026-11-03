import React, { ReactNode } from 'react'
import { View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { CHAIN_NAMES } from '@web/modules/social-recovery/recovery/entry/constants'
import { ActionsRow } from '@web/modules/social-recovery/shared/chrome'
import LoadingBlock from '@web/modules/social-recovery/shared/chrome/LoadingBlock'
import RefreshingLine from '@web/modules/social-recovery/shared/chrome/RefreshingLine'
import { WALLET_RECOVERY_CHAIN } from '@web/modules/social-recovery/shared/client'

import { renderClientRefusal, renderFinding } from './copy'
import RefusalList from './RefusalList'
import type { EditorActionsProps } from './types'

/**
 * A failed write with its retry, the wallet's own refusals of the path, the
 * path check's findings, the lines of a client that cannot run the path
 * check, and the actions:
 * Back, and Continue or what stands in its place while the client is refused
 * or the check fails. While the client loads or the check runs, Continue
 * stays on screen, held, with a line that says what runs. Continue holds
 * while a threshold field holds text that is not a whole number.
 */
const EditorActions = ({
  client,
  clientRefusal,
  walletRefusals,
  roles,
  findings,
  methodCount,
  checking,
  checkFailed,
  writeFailed,
  thresholdHeld,
  onRetryWrite,
  onContinue,
  onBack,
  continueLabel
}: EditorActionsProps) => {
  const { t } = useTranslation()
  const refusalLines = clientRefusal ? renderClientRefusal(clientRefusal, t) : null

  const continueButton = (disabled: boolean) => (
    <Button
      testID="editor-continue"
      type="primary"
      text={continueLabel ?? t('socialRecovery.actions.continue')}
      disabled={disabled}
      onPress={onContinue}
      hasBottomSpacing={false}
    />
  )

  let primary: ReactNode = null
  if (client.status === 'loading' || (client.status === 'ready' && checking)) {
    primary = (
      <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.wrap]}>
        {continueButton(true)}
        <View testID="editor-waiting" style={spacings.mlSm}>
          {client.status === 'loading' ? (
            <LoadingBlock
              variant="row"
              message={t('socialRecovery.loading.client', {
                network: CHAIN_NAMES[WALLET_RECOVERY_CHAIN]
              })}
            />
          ) : (
            <RefreshingLine messageKey="socialRecovery.loading.checks" />
          )}
        </View>
      </View>
    )
  } else if (client.status === 'update-the-wallet' || client.status === 'failed') {
    primary = (
      <Button
        testID="editor-client-retry"
        type="primary"
        text={t('socialRecovery.writes.tryAgain')}
        onPress={client.retry}
        hasBottomSpacing={false}
      />
    )
  } else if (client.status === 'ready' && checkFailed) {
    primary = (
      <Button
        testID="editor-check-retry"
        type="primary"
        text={t('socialRecovery.writes.tryAgain')}
        disabled={thresholdHeld}
        onPress={onContinue}
        hasBottomSpacing={false}
      />
    )
  } else if (client.status === 'ready') {
    primary = continueButton(methodCount === 0 || writeFailed || thresholdHeld)
  }

  return (
    <>
      {writeFailed && (
        <Alert
          type="error"
          size="sm"
          style={spacings.mbMd}
          text={
            <Alert.Text size="sm" type="error" testID="editor-write-failed">
              {t('socialRecovery.records.writeFailed')}
            </Alert.Text>
          }
        >
          <Button
            testID="editor-write-retry"
            type="secondary"
            size="small"
            text={t('socialRecovery.writes.tryAgain')}
            onPress={onRetryWrite}
            disabled={checking}
            hasBottomSpacing={false}
            style={[flexbox.alignSelfStart, spacings.mtTy]}
          />
        </Alert>
      )}

      <RefusalList refusals={walletRefusals} roles={roles} />

      {findings.length > 0 && (
        <Alert
          type="error"
          size="sm"
          style={spacings.mbMd}
          testID="editor-findings"
          text={findings.map((finding, index) => (
            <Alert.Text
              // Two findings can share a code and differ only in their values.
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              size="sm"
              type="error"
              style={index < findings.length - 1 ? spacings.mbTy : undefined}
              testID="editor-finding"
            >
              {renderFinding(finding, t)}
            </Alert.Text>
          ))}
        />
      )}

      {!!refusalLines && (
        <Alert
          type="error"
          size="sm"
          style={spacings.mbMd}
          title={refusalLines.title}
          text={refusalLines.body}
          testID="editor-client-refusal"
        />
      )}

      <ActionsRow
        primary={primary}
        secondary={
          <Button
            testID="editor-back"
            type="outline"
            text={t('socialRecovery.ceremony.backAction')}
            onPress={onBack}
            hasBottomSpacing={false}
          />
        }
        note={methodCount === 0 ? t('socialRecovery.editor.continueUnlock') : undefined}
      />
    </>
  )
}

export default React.memo(EditorActions)
