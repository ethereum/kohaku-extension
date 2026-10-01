/**
 * The guardian key's access test: signed on this device through the request
 * queue where the wallet holds the key, with the offline block one choice
 * away, and the wait for the sign screen that the holder can withdraw.
 */
import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'

import AccessTestHeader from './AccessTestHeader'
import { testLineKeyOf } from './outcome'
import TestResultLines from './TestResultLines'
import type { GuardianTestBlockProps } from './types'

const GuardianTestBlock = ({
  enrollment,
  testOutcome,
  busy,
  waiting,
  canTestOffline,
  runTest,
  withdraw
}: GuardianTestBlockProps) => {
  const { t } = useTranslation()
  const lineKey = testLineKeyOf(enrollment, false, 'socialRecovery.enroll.guardian.testedLine')

  return (
    <View testID="guardian-test-block" style={spacings.mbSm}>
      <Text fontSize={12} appearance="secondaryText" style={spacings.mbSm}>
        {t('socialRecovery.enroll.guardian.howMany')}
      </Text>

      <AccessTestHeader />
      <TestResultLines row="guardian" lineKey={lineKey} outcome={testOutcome} />
      {enrollment.test !== 'not-supported' && (
        <View style={[flexbox.directionRow, flexbox.alignCenter]}>
          <Button
            testID="guardian-test"
            type="outline"
            text={
              enrollment.test === 'failed' || enrollment.test === 'unavailable'
                ? t('socialRecovery.writes.tryAgain')
                : t('socialRecovery.enroll.guardian.testThisKey')
            }
            disabled={busy}
            onPress={() => runTest(false)}
            hasBottomSpacing={false}
            style={spacings.mrSm}
          />
          {canTestOffline && (
            <Button
              testID="guardian-test-offline"
              type="ghost"
              text={t('socialRecovery.enroll.offline.title')}
              disabled={busy}
              onPress={() => runTest(true)}
              hasBottomSpacing={false}
            />
          )}
        </View>
      )}
      {waiting && (
        <View testID="guardian-test-waiting" style={spacings.mtSm}>
          <Text fontSize={14} style={spacings.mbTy}>
            {t('socialRecovery.enroll.guardian.waitingForSignScreen')}
          </Text>
          <Button
            testID="guardian-test-withdraw"
            type="ghost"
            text={t('socialRecovery.enroll.guardian.testOfflineInstead')}
            onPress={withdraw}
            hasBottomSpacing={false}
          />
        </View>
      )}
    </View>
  )
}

export default React.memo(GuardianTestBlock)
