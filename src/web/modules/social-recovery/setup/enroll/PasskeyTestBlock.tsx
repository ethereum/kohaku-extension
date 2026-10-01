/**
 * The passkey's access test: offered and skippable while the passkey is not
 * tested, run again once it passed, and tried again or replaced by a new
 * passkey where it did not pass.
 */
import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
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
    <View testID="passkey-test" style={spacings.mbSm}>
      <AccessTestHeader />
      {enrollment.test === 'not-tested' && !skipped && (
        <>
          <Text fontSize={14} style={spacings.mbTy}>
            {t('socialRecovery.enroll.passkey.testLead')}
          </Text>
          <View style={[flexbox.directionRow, flexbox.alignCenter]}>
            <Button
              testID="passkey-run-test"
              type="primary"
              text={t('socialRecovery.actions.runTheTest')}
              disabled={!canTest}
              onPress={runTest}
              hasBottomSpacing={false}
              style={spacings.mrSm}
            />
            <Button
              testID="passkey-skip-test"
              type="ghost"
              text={t('socialRecovery.actions.skipTheTest')}
              onPress={skip}
              hasBottomSpacing={false}
            />
          </View>
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
        <Button
          testID="passkey-run-test-again"
          type="outline"
          text={t('socialRecovery.actions.runTheTestAgain')}
          disabled={!canTest}
          onPress={runTest}
          hasBottomSpacing={false}
        />
      )}
      {enrollment.test === 'not-tested' && skipped && (
        <Button
          testID="passkey-run-test"
          type="outline"
          text={t('socialRecovery.actions.runTheTest')}
          disabled={!canTest}
          onPress={runTest}
          hasBottomSpacing={false}
        />
      )}
      {(enrollment.test === 'failed' || enrollment.test === 'unavailable') && (
        <View style={[flexbox.directionRow, flexbox.alignCenter]}>
          <Button
            testID="passkey-test-retry"
            type="outline"
            text={t('socialRecovery.writes.tryAgain')}
            disabled={!canTest}
            onPress={runTest}
            hasBottomSpacing={false}
            style={spacings.mrSm}
          />
          {enrollment.test === 'failed' && (
            <Button
              testID="passkey-create-new"
              type="ghost"
              text={t('socialRecovery.enroll.passkey.createNew')}
              disabled={!served || busy}
              onPress={() => create(false)}
              hasBottomSpacing={false}
            />
          )}
        </View>
      )}
    </View>
  )
}

export default React.memo(PasskeyTestBlock)
