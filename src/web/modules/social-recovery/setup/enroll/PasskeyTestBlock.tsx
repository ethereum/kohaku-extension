/**
 * The passkey's access test: offered and skippable while the passkey is not
 * tested, run again once it passed, and tried again or replaced by a new
 * passkey where it did not pass.
 */
import React from 'react'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import { ActionsRow, SectionCard } from '@web/modules/social-recovery/shared/chrome'
import { renderHash } from '@web/modules/social-recovery/shared/display'

import AccessTestHeader from './AccessTestHeader'
import { testLineKeyOf } from './outcome'
import TestResultLines from './TestResultLines'
import type { PasskeyTestBlockProps } from './types'

const PasskeyTestBlock = ({
  enrollment,
  testOutcome,
  signedSalt,
  skipped,
  skip,
  canTest,
  busy,
  served,
  runTest,
  create
}: PasskeyTestBlockProps) => {
  const { t } = useTranslation()
  const lineKey = testLineKeyOf(enrollment, skipped, 'socialRecovery.enroll.passkey.testPassed')
  // The note says "just now", so it shows only for the test this row ran and stored.
  const signedNow =
    !!signedSalt && enrollment.test === 'passed' && enrollment.lastTest?.salt === signedSalt

  return (
    <SectionCard tone="muted" spacing="none" testID="passkey-test">
      <AccessTestHeader />
      {enrollment.test === 'not-tested' && !skipped && (
        <>
          <Text fontSize={14}>{t('socialRecovery.enroll.passkey.testLead')}</Text>
          <ActionsRow
            primary={
              <Button
                testID="passkey-run-test"
                type="primary"
                size="small"
                text={t('socialRecovery.actions.runTheTest')}
                disabled={!canTest}
                onPress={runTest}
                hasBottomSpacing={false}
              />
            }
            secondary={
              <Button
                testID="passkey-skip-test"
                type="ghost"
                size="small"
                text={t('socialRecovery.actions.skipTheTest')}
                onPress={skip}
                hasBottomSpacing={false}
              />
            }
          />
        </>
      )}
      <TestResultLines row="passkey" lineKey={lineKey} outcome={testOutcome}>
        {signedNow && !!enrollment.lastTest && (
          <Text testID="passkey-signed-note" fontSize={12} appearance="secondaryText">
            {t('socialRecovery.enroll.passkey.signedNote', {
              hash: renderHash(enrollment.lastTest.salt)
            })}
          </Text>
        )}
      </TestResultLines>
      {enrollment.test === 'passed' && (
        <ActionsRow
          primary={
            <Button
              testID="passkey-run-test-again"
              type="secondary"
              size="small"
              text={t('socialRecovery.actions.runTheTestAgain')}
              disabled={!canTest}
              onPress={runTest}
              hasBottomSpacing={false}
            />
          }
        />
      )}
      {enrollment.test === 'not-tested' && skipped && (
        <ActionsRow
          primary={
            <Button
              testID="passkey-run-test"
              type="secondary"
              size="small"
              text={t('socialRecovery.actions.runTheTest')}
              disabled={!canTest}
              onPress={runTest}
              hasBottomSpacing={false}
            />
          }
        />
      )}
      {(enrollment.test === 'failed' || enrollment.test === 'unavailable') && (
        <ActionsRow
          primary={
            <Button
              testID="passkey-test-retry"
              type="secondary"
              size="small"
              text={t('socialRecovery.writes.tryAgain')}
              disabled={!canTest}
              onPress={runTest}
              hasBottomSpacing={false}
            />
          }
          secondary={
            enrollment.test === 'failed' && (
              <Button
                testID="passkey-create-new"
                type="ghost"
                size="small"
                text={t('socialRecovery.enroll.passkey.createNew')}
                disabled={!served || busy}
                onPress={() => create(false)}
                hasBottomSpacing={false}
              />
            )
          }
        />
      )}
    </SectionCard>
  )
}

export default React.memo(PasskeyTestBlock)
