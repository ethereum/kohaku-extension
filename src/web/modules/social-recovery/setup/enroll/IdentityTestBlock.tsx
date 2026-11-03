/**
 * An identity's access test: offered and skippable while the document is not
 * tested, and run again once it passed, failed or could not run. A document
 * the method cannot serve reads not supported, and a network that cannot run
 * the method says so; neither offers a retry, since the answer will not change.
 */
import React from 'react'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import { ActionsRow, SectionCard } from '@web/modules/social-recovery/shared/chrome'

import AccessTestHeader from './AccessTestHeader'
import { testLineKeyOf } from './outcome'
import TestResultLines from './TestResultLines'
import type { IdentityTestBlockProps } from './types'

const IdentityTestBlock = ({
  copy,
  enrollment,
  testOutcome,
  skipped,
  skip,
  unsupported,
  canLaunch,
  runTest
}: IdentityTestBlockProps) => {
  const { t } = useTranslation()
  const { row } = copy
  const lineKey = unsupported
    ? 'socialRecovery.ceremony.notOnThisNetworkLine'
    : testLineKeyOf(enrollment, skipped, copy.testPassed)
  const testable = !unsupported && enrollment.test !== 'not-supported'
  // A result the method's own check refused, as a proof of another document's
  // identifier, says what to try; a mismatch on chain reads its own line.
  const rejected =
    !unsupported &&
    enrollment.test === 'failed' &&
    !!enrollment.cause?.startsWith('material-rejected')
  const offered = testable && enrollment.test === 'not-tested' && !skipped
  const again =
    testable &&
    (enrollment.test === 'passed' ||
      enrollment.test === 'failed' ||
      enrollment.test === 'unavailable')
  const run =
    testable && ((enrollment.test === 'not-tested' && skipped) || enrollment.test === 'live')

  return (
    <SectionCard tone="muted" spacing="none" testID={`${row}-test`}>
      <AccessTestHeader />
      {offered && (
        <>
          <Text fontSize={14}>{t(copy.testLead)}</Text>
          <ActionsRow
            primary={
              <Button
                testID={`${row}-run-test`}
                type="primary"
                size="small"
                text={t('socialRecovery.actions.runTheTest')}
                disabled={!canLaunch}
                onPress={runTest}
                hasBottomSpacing={false}
              />
            }
            secondary={
              <Button
                testID={`${row}-skip-test`}
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
      <TestResultLines row={row} lineKey={lineKey} outcome={testOutcome} dismissalNotes={copy}>
        {rejected && (
          <Text testID={`${row}-test-cause`} fontSize={14}>
            {t('socialRecovery.ceremony.rejectedCause')}
          </Text>
        )}
      </TestResultLines>
      {(again || run) && (
        <ActionsRow
          primary={
            <Button
              testID={again ? `${row}-run-test-again` : `${row}-run-test`}
              type="secondary"
              size="small"
              text={t(
                again
                  ? 'socialRecovery.actions.runTheTestAgain'
                  : 'socialRecovery.actions.runTheTest'
              )}
              disabled={!canLaunch}
              onPress={runTest}
              hasBottomSpacing={false}
            />
          }
        />
      )}
    </SectionCard>
  )
}

export default React.memo(IdentityTestBlock)
