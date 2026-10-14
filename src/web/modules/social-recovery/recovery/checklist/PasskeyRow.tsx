/**
 * A passkey row: answered on this device, or through the browser's hand-off
 * to a phone, in the ceremony's full tab. A passkey whose config commits
 * another origin's relying-party hash cannot answer here and offers no action.
 * A ceremony that did not pass leaves its note with a retry. The lines for a
 * device that holds no passkey show from the start on the fresh install, a
 * new device, and on the logged-in wallet once a claim found none here.
 */
import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { browserErrorNameOf, noteKeyOfOutcome } from '@web/modules/social-recovery/shared/ceremony'
import { ActionsRow, SectionCard } from '@web/modules/social-recovery/shared/chrome'

import { dateOf } from './lines'
import RowFrame from './RowFrame'
import { deviceHoldsNoPasskey, passkeyAnswersHere } from './rows'
import type { PasskeyRowProps } from './types'

const PASSKEY = 'socialRecovery.checklist.passkey'

const PasskeyRow = ({
  row,
  state,
  request,
  outcome,
  answered,
  rpIdHash,
  served,
  busy,
  timeZone,
  route,
  launch
}: PasskeyRowProps) => {
  const { t } = useTranslation()
  const { place } = row
  const answersHere = passkeyAnswersHere(row.gatheringPlace.config, rpIdHash)
  const stopped =
    outcome && !(outcome.outcome.kind === 'verdict' && outcome.outcome.verdict === 'passed')
  const noteKey = stopped ? noteKeyOfOutcome(outcome.outcome, 'createClaim') : null
  const errorName = stopped ? browserErrorNameOf(outcome.outcome) : null
  const canRetry =
    !!stopped && (outcome.outcome.kind === 'dismissed' || outcome.outcome.retry === true)
  const holdsNone =
    route === 'fresh-install' || (!!outcome && deviceHoldsNoPasskey(outcome.outcome))
  const open = !state.replied && state.chip !== 'notNeeded'

  const line = (key: string, testID?: string) => (
    <Text fontSize={12} appearance="secondaryText" style={spacings.mtTy} testID={testID}>
      {t(key)}
    </Text>
  )

  const answeredLine = () => {
    if (!state.replied || !answered) {
      return null
    }
    return (
      <Text fontSize={14} style={spacings.mtTy} testID={`checklist-row-${place}-answered`}>
        {t(answered.phone ? `${PASSKEY}.answeredPhone` : `${PASSKEY}.answeredHere`, {
          date: dateOf(answered.at, timeZone)
        })}
      </Text>
    )
  }

  const body = () => {
    if (!answersHere) {
      return (
        <Text
          fontSize={14}
          appearance="errorText"
          style={spacings.mtTy}
          testID={`checklist-row-${place}-mismatch`}
        >
          {t('socialRecovery.ceremony.relyingPartyMismatch')}
        </Text>
      )
    }
    if (!open || !request) {
      return answeredLine()
    }
    if (!served) {
      return line('socialRecovery.ceremony.chromeOnly', `checklist-row-${place}-not-served`)
    }
    return (
      <>
        {!!noteKey && (
          <Text
            fontSize={14}
            appearance="errorText"
            style={spacings.mtTy}
            testID={`checklist-row-${place}-note`}
          >
            {t(noteKey)}
          </Text>
        )}
        {!!errorName && (
          <Text fontSize={12} appearance="secondaryText">
            {errorName}
          </Text>
        )}
        {canRetry && (
          <ActionsRow
            primary={
              <Button
                testID={`checklist-row-${place}-retry`}
                type="secondary"
                size="small"
                text={t('socialRecovery.ceremony.tryAgainAction')}
                disabled={busy}
                onPress={() => launch(request, outcome.handOff)}
                hasBottomSpacing={false}
              />
            }
          />
        )}
        {holdsNone ? (
          <SectionCard tone="muted" spacing="item" style={spacings.mtSm}>
            <Text fontSize={14} weight="medium" testID={`checklist-row-${place}-no-passkey`}>
              {t(`${PASSKEY}.noPasskeyHeader`)}
            </Text>
            {line(`${PASSKEY}.newDevice`)}
            <ActionsRow
              primary={
                <Button
                  testID={`checklist-row-${place}-scan`}
                  type="primary"
                  size="small"
                  text={t(`${PASSKEY}.scanSynced`)}
                  disabled={busy}
                  onPress={() => launch(request, true)}
                  hasBottomSpacing={false}
                />
              }
              secondary={
                <Button
                  testID={`checklist-row-${place}-security-key`}
                  type="ghost"
                  size="small"
                  text={t(`${PASSKEY}.securityKey`)}
                  disabled={busy}
                  onPress={() => launch(request, false)}
                  hasBottomSpacing={false}
                  textUnderline
                />
              }
            />
            {line(`${PASSKEY}.vendorTunnel`)}
            {line(`${PASSKEY}.phoneSigns`)}
            {line(`${PASSKEY}.sameBuild`)}
          </SectionCard>
        ) : (
          <>
            {line(`${PASSKEY}.syncedHint`)}
            <ActionsRow
              primary={
                <Button
                  testID={`checklist-row-${place}-answer-here`}
                  type="primary"
                  size="small"
                  text={t(`${PASSKEY}.answerHere`)}
                  disabled={busy}
                  onPress={() => launch(request, false)}
                  hasBottomSpacing={false}
                />
              }
              secondary={
                <Button
                  testID={`checklist-row-${place}-phone`}
                  type="ghost"
                  size="small"
                  text={t('socialRecovery.ceremony.continueOnPhone')}
                  disabled={busy}
                  onPress={() => launch(request, true)}
                  hasBottomSpacing={false}
                  textUnderline
                />
              }
            />
          </>
        )}
        <View style={spacings.mtSm}>
          {line(`${PASSKEY}.anyDevice`, `checklist-row-${place}-any-device`)}
          {line(`${PASSKEY}.otherBrowser`, `checklist-row-${place}-other-browser`)}
        </View>
      </>
    )
  }

  return (
    <RowFrame
      row={row}
      state={state}
      title={t('socialRecovery.methodNames.passkey')}
      label={row.gatheringPlace.label?.trim() || undefined}
    >
      {body()}
    </RowFrame>
  )
}

export default React.memo(PasskeyRow)
