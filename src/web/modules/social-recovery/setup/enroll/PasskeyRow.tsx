/**
 * The passkey row. The ceremony tab creates the credential on this device or
 * over the browser's phone hand-off, in this same full tab, and returns here
 * with its report. The access test is offered right after and never enforced;
 * the row records the synced or device-bound kind from the ceremony's own
 * facts whatever the holder does with the test.
 */
import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'

import { kindNameKeyOf } from './passkey'
import PasskeyCreateBlock from './PasskeyCreateBlock'
import PasskeyEnrolledSummary from './PasskeyEnrolledSummary'
import PasskeyRowNotes from './PasskeyRowNotes'
import PasskeyTestBlock from './PasskeyTestBlock'
import type { RowProps } from './types'
import usePasskeyRow from './usePasskeyRow'

const PasskeyRow = (props: RowProps) => {
  const { deps, enrollment } = props
  const { t } = useTranslation()
  const row = usePasskeyRow(props)
  const facts = enrollment?.facts

  return (
    <View testID="enroll-passkey">
      <Text fontSize={20} weight="semiBold" style={spacings.mbTy}>
        {t('socialRecovery.enroll.passkey.title')}
      </Text>
      <Text testID="passkey-kind-name" fontSize={16} weight="medium" style={spacings.mbTy}>
        {t(kindNameKeyOf(facts ?? (row.phone ? { place: 'phone' } : undefined)))}
      </Text>
      <Text fontSize={14} appearance="secondaryText" style={spacings.mbTy}>
        {t('socialRecovery.enroll.passkey.authenticators')}
      </Text>
      <Button
        testID="passkey-learn-more"
        type="ghost"
        text={t('socialRecovery.actions.learnMore')}
        onPress={row.toggleExplainer}
        hasBottomSpacing={false}
      />
      {row.explainer && (
        <Text testID="passkey-explainer" fontSize={14} style={spacings.mbSm}>
          {t('socialRecovery.enroll.passkey.explainer')}
        </Text>
      )}
      {!deps.passkeysServed && (
        <Text
          testID="passkey-chrome-only"
          fontSize={14}
          appearance="errorText"
          style={spacings.mbSm}
        >
          {t('socialRecovery.ceremony.chromeOnly')}
        </Text>
      )}

      {!enrollment && (
        <PasskeyCreateBlock
          name={row.name}
          setName={row.setName}
          enrollOutcome={row.enrollOutcome}
          busy={row.busy}
          phone={row.phone}
          create={row.create}
          served={deps.passkeysServed}
        />
      )}

      {!!enrollment && (
        <View testID="passkey-enrolled">
          <PasskeyEnrolledSummary enrollment={enrollment} platform={deps.platform} />
          <PasskeyTestBlock
            enrollment={enrollment}
            testOutcome={row.testOutcome}
            signedSalt={row.signedSalt}
            skipped={row.skipped}
            skip={row.skip}
            canTest={row.canTest}
            busy={row.busy}
            served={deps.passkeysServed}
            runTest={row.runTest}
            create={row.create}
          />
        </View>
      )}

      <PasskeyRowNotes
        undelivered={row.undelivered}
        stale={row.stale}
        canRetryUndelivered={row.canRetryUndelivered}
        retryUndelivered={row.retryUndelivered}
        duplicate={row.duplicate}
        writeFailed={row.writeFailed}
        pending={row.pending}
        busy={row.busy}
        place={row.place}
      />
    </View>
  )
}

export default React.memo(PasskeyRow)
