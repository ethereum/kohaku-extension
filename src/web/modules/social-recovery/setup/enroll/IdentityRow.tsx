/**
 * An identity row, a passport or an Aadhaar identity. The ceremony tab runs
 * the document's own flow, a code the zkPassport app scans on the phone or the
 * QR image the holder uploads and proves in the browser, in this same full
 * tab, and returns here with its report. The access test is offered right
 * after and never enforced; the deployed method's own check on chain judges it.
 * Both rows say what the method shows and what a recovery publishes.
 */
import React from 'react'
import { View } from 'react-native'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import {
  PageTitle,
  SectionCard,
  StatusChip,
  TwoColumn
} from '@web/modules/social-recovery/shared/chrome'
import { renderChip } from '@web/modules/social-recovery/shared/display'

import IdentityCreateBlock from './IdentityCreateBlock'
import { IDENTITY_COPY } from './identity'
import { TEST_CHIPS } from './outcome'
import IdentityTestBlock from './IdentityTestBlock'
import RowNotes from './RowNotes'
import type { IdentityRowProps } from './types'
import useIdentityRow from './useIdentityRow'

const IdentityRow = (props: IdentityRowProps) => {
  const { kind, enrollment, actions } = props
  const { t } = useTranslation()
  const row = useIdentityRow(props)
  const copy = IDENTITY_COPY[kind]
  const { pending } = row

  return (
    <TwoColumn testID="enroll-columns">
      <View testID={`enroll-${copy.row}`}>
        <PageTitle title={t(copy.title)} />
        <SectionCard>
          <Text testID={`${copy.row}-lead`} fontSize={14} style={spacings.mbTy}>
            {t(copy.lead)}
          </Text>
          <Text
            testID={`${copy.row}-device-line`}
            fontSize={12}
            appearance="secondaryText"
            style={spacings.mbSm}
          >
            {t(copy.deviceLine)}
          </Text>

          {!enrollment && (
            <IdentityCreateBlock
              copy={copy}
              enrollOutcome={row.enrollOutcome}
              unsupported={row.unsupported}
              canLaunch={row.canLaunch}
              create={row.create}
            />
          )}

          {!!enrollment && (
            <View testID={`${copy.row}-enrolled`}>
              <View
                style={[
                  flexbox.directionRow,
                  flexbox.alignCenter,
                  flexbox.justifySpaceBetween,
                  spacings.mbSm
                ]}
              >
                <Text
                  testID={`${copy.row}-enrolled-line`}
                  fontSize={14}
                  style={[flexbox.flex1, spacings.mrSm]}
                >
                  {t(copy.enrolledLine)}
                </Text>
                <StatusChip
                  testID={`${copy.row}-chip`}
                  text={renderChip('method', TEST_CHIPS[enrollment.test], t)}
                  tone={
                    enrollment.test === 'passed' || enrollment.test === 'live'
                      ? 'success'
                      : 'default'
                  }
                />
              </View>
              <IdentityTestBlock
                copy={copy}
                enrollment={enrollment}
                testOutcome={row.testOutcome}
                skipped={row.skipped}
                skip={row.skip}
                unsupported={row.unsupported}
                canLaunch={row.canLaunch}
                runTest={row.runTest}
              />
            </View>
          )}
        </SectionCard>

        <SectionCard tone="muted" spacing="item" testID={`${copy.row}-disclosures`}>
          {copy.disclosures.map((key) => (
            <Text
              key={key}
              testID={`${copy.row}-disclosure`}
              fontSize={12}
              appearance="secondaryText"
              style={spacings.mbTy}
            >
              {t(key)}
            </Text>
          ))}
        </SectionCard>

        <RowNotes
          row={copy.row}
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

export default React.memo(IdentityRow)
