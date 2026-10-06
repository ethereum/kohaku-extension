/**
 * The guardian key's access test: signed on this device through the request
 * queue where the wallet holds the key, with the offline block one choice
 * away, and the wait for the sign screen that the holder can withdraw.
 */
import React from 'react'
import { Pressable, View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { ActionsRow, SectionCard } from '@web/modules/social-recovery/shared/chrome'

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
    <View testID="guardian-test-block">
      <SectionCard tone="muted" spacing="none">
        <AccessTestHeader />
        <TestResultLines row="guardian" lineKey={lineKey} outcome={testOutcome} />
        {enrollment.test !== 'not-supported' && (
          <ActionsRow
            primary={
              <Button
                testID="guardian-test"
                type="secondary"
                size="small"
                text={
                  enrollment.test === 'failed' || enrollment.test === 'unavailable'
                    ? t('socialRecovery.writes.tryAgain')
                    : t('socialRecovery.enroll.guardian.testThisKey')
                }
                disabled={busy}
                onPress={() => runTest(false)}
                hasBottomSpacing={false}
              />
            }
            secondary={
              canTestOffline && (
                <Button
                  testID="guardian-test-offline"
                  type="ghost"
                  size="small"
                  text={t('socialRecovery.enroll.offline.title')}
                  disabled={busy}
                  onPress={() => runTest(true)}
                  hasBottomSpacing={false}
                />
              )
            }
          />
        )}
        {waiting && (
          <View testID="guardian-test-waiting" style={[spacings.mtSm, flexbox.alignStart]}>
            <Text fontSize={14} style={spacings.mbTy}>
              {t('socialRecovery.enroll.guardian.waitingForSignScreen')}
            </Text>
            <Pressable
              testID="guardian-test-withdraw"
              accessibilityRole="button"
              onPress={withdraw}
            >
              <Text fontSize={14} weight="medium" appearance="primary" underline>
                {t('socialRecovery.enroll.guardian.testOfflineInstead')}
              </Text>
            </Pressable>
          </View>
        )}
      </SectionCard>
      <Text fontSize={12} appearance="secondaryText" style={spacings.mtTy}>
        {t('socialRecovery.enroll.guardian.howMany')}
      </Text>
    </View>
  )
}

export default React.memo(GuardianTestBlock)
