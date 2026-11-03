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
import flexbox from '@common/styles/utils/flexbox'
import { PageTitle, SectionCard, TwoColumn } from '@web/modules/social-recovery/shared/chrome'

import { kindNameKeyOf } from './passkey'
import PasskeyCreateBlock from './PasskeyCreateBlock'
import PasskeyEnrolledSummary from './PasskeyEnrolledSummary'
import PasskeyTestBlock from './PasskeyTestBlock'
import RowNotes from './RowNotes'
import type { RowProps } from './types'
import usePasskeyRow from './usePasskeyRow'

const PasskeyRow = (props: RowProps) => {
  const { deps, enrollment, actions } = props
  const { t } = useTranslation()
  const row = usePasskeyRow(props)
  const facts = enrollment?.facts
  const { pending } = row

  // The explainer the learn-more control opens is the only text here that
  // informs without asking anything, so it alone draws beside the row.
  const aside = row.explainer ? (
    <SectionCard
      tone="muted"
      spacing="item"
      label={t('socialRecovery.enroll.passkey.explainerHeader')}
    >
      <Text testID="passkey-explainer" fontSize={12} appearance="secondaryText">
        {t('socialRecovery.enroll.passkey.explainer')}
      </Text>
    </SectionCard>
  ) : undefined

  return (
    <TwoColumn testID="enroll-columns" aside={aside}>
      <View testID="enroll-passkey">
        <PageTitle title={t('socialRecovery.enroll.passkey.title')} />
        <SectionCard>
          <View
            style={[
              flexbox.directionRow,
              flexbox.alignCenter,
              flexbox.justifySpaceBetween,
              spacings.mbSm
            ]}
          >
            <View style={[flexbox.flex1, spacings.mrSm]}>
              <Text testID="passkey-kind-name" fontSize={16} weight="medium">
                {t(kindNameKeyOf(facts ?? (row.phone ? { place: 'phone' } : undefined)))}
              </Text>
              <Text fontSize={12} appearance="secondaryText">
                {t('socialRecovery.enroll.passkey.authenticators')}
              </Text>
            </View>
            <Button
              testID="passkey-learn-more"
              type="ghost"
              size="small"
              text={t('socialRecovery.actions.learnMore')}
              onPress={row.toggleExplainer}
              hasBottomSpacing={false}
              textUnderline
            />
          </View>
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
        </SectionCard>

        <RowNotes
          row="passkey"
          undelivered={row.undelivered}
          staleWaiting={!!row.stale}
          canRetryUndelivered={row.canRetryUndelivered}
          retryUndelivered={row.retryUndelivered}
          duplicate={row.duplicate}
          writeFailed={row.writeFailed}
          retryPlace={pending ? () => row.place(pending) : null}
          busy={row.busy}
        />
        {actions}
      </View>
    </TwoColumn>
  )
}

export default React.memo(PasskeyRow)
