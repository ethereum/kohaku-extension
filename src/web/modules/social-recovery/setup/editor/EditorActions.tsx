import React from 'react'
import { ActivityIndicator, View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'

import { renderClientRefusal, renderFinding } from './copy'
import type { EditorActionsProps } from './types'

/**
 * A failed write with its retry, the path check's findings, the lines of a
 * client that cannot run the path check, and the actions:
 * Back, and Continue or what stands in its place while the client loads, is
 * refused, or the check runs or fails. Continue holds while a threshold field
 * holds text that is not a whole number.
 */
const EditorActions = ({
  client,
  clientRefusal,
  findings,
  methodCount,
  checking,
  checkFailed,
  writeFailed,
  thresholdHeld,
  onRetryWrite,
  onContinue,
  onBack
}: EditorActionsProps) => {
  const { t } = useTranslation()
  const refusalLines = clientRefusal ? renderClientRefusal(clientRefusal, t) : null

  return (
    <>
      {writeFailed && (
        <View style={spacings.mbMd}>
          <Text
            fontSize={14}
            appearance="errorText"
            style={spacings.mbTy}
            testID="editor-write-failed"
          >
            {t('socialRecovery.records.writeFailed')}
          </Text>
          <Button
            testID="editor-write-retry"
            type="outline"
            size="small"
            text={t('socialRecovery.writes.tryAgain')}
            onPress={onRetryWrite}
            disabled={checking}
            hasBottomSpacing={false}
          />
        </View>
      )}

      {findings.length > 0 && (
        <View style={spacings.mbMd} testID="editor-findings">
          {findings.map((finding, index) => (
            <Text
              // Two findings can share a code and differ only in their values.
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              fontSize={14}
              appearance="errorText"
              style={spacings.mbTy}
              testID="editor-finding"
            >
              {renderFinding(finding, t)}
            </Text>
          ))}
        </View>
      )}

      {!!refusalLines && (
        <View style={spacings.mbMd} testID="editor-client-refusal">
          <Text fontSize={14} weight="semiBold" appearance="errorText" style={spacings.mbTy}>
            {refusalLines.title}
          </Text>
          <Text fontSize={14} appearance="secondaryText">
            {refusalLines.body}
          </Text>
        </View>
      )}

      {methodCount === 0 && (
        <Text fontSize={12} appearance="secondaryText" style={spacings.mbSm}>
          {t('socialRecovery.editor.continueUnlock')}
        </Text>
      )}
      <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]}>
        <Button
          testID="editor-back"
          type="outline"
          text={t('socialRecovery.ceremony.backAction')}
          onPress={onBack}
          hasBottomSpacing={false}
        />
        {client.status === 'loading' && <ActivityIndicator testID="editor-spinner" />}
        {(client.status === 'update-the-wallet' || client.status === 'failed') && (
          <Button
            testID="editor-client-retry"
            type="outline"
            text={t('socialRecovery.writes.tryAgain')}
            onPress={client.retry}
            hasBottomSpacing={false}
          />
        )}
        {client.status === 'ready' &&
          (checking ? (
            <ActivityIndicator testID="editor-spinner" />
          ) : checkFailed ? (
            <Button
              testID="editor-check-retry"
              type="outline"
              text={t('socialRecovery.writes.tryAgain')}
              disabled={thresholdHeld}
              onPress={onContinue}
              hasBottomSpacing={false}
            />
          ) : (
            <Button
              testID="editor-continue"
              type="primary"
              text={t('socialRecovery.actions.continue')}
              disabled={methodCount === 0 || writeFailed || thresholdHeld}
              onPress={onContinue}
              hasBottomSpacing={false}
            />
          ))}
      </View>
    </>
  )
}

export default React.memo(EditorActions)
