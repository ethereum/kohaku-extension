/**
 * The logged-in entry's first stage: the condensed warning, then which of the
 * wallet's accounts receives control, with the key each installs. Every
 * choice and continue stay disabled until the holder ticks the warning's
 * acknowledgment, or the holder arrives having acknowledged the full warning
 * on the screen before, where the warning shows ticked. A wallet with one account that can receive control shows it
 * chosen; a wallet with none says so and offers no continue.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import WarningGate from '@web/modules/social-recovery/onboarding/recover/WarningGate'
import {
  ActionsRow,
  PageTitle,
  SectionCard,
  SectionLabel,
  TwoColumn
} from '@web/modules/social-recovery/shared/chrome'
import LoadingBlock from '@web/modules/social-recovery/shared/chrome/LoadingBlock'
import {
  renderFullAddress,
  renderShortAddress,
  renderValueLabel
} from '@web/modules/social-recovery/shared/display'
import type { Address } from '@kohaku-eth/social-recovery'

import { choiceFor } from './receiving'
import ReceivingRow from './ReceivingRow'
import type { OwnerStageViewProps } from './types'

const OWNER = 'socialRecovery.entry.owner'

const OwnerStageView = ({
  initiallyAcknowledged,
  choices,
  loaded,
  onContinue,
  onCancel
}: OwnerStageViewProps) => {
  const { t } = useTranslation()
  // The warning reports its acknowledgment but not its unmount; the flag lives
  // beside it in this component, so a new warning never meets a stale tick.
  // Each mount starts from the acknowledgment the holder arrived with, if any.
  const [acknowledged, setAcknowledged] = useState(initiallyAcknowledged)
  useEffect(() => setAcknowledged(initiallyAcknowledged), [initiallyAcknowledged])
  const [picked, setPicked] = useState<Address | null>(null)

  const only = choices.length === 1 ? choices[0] : undefined
  const chosen = only ?? (picked ? choiceFor(choices, picked) : undefined)

  const proceed = useCallback(() => {
    if (acknowledged && chosen) {
      onContinue(chosen.address)
    }
  }, [acknowledged, chosen, onContinue])

  const line = (key: string, testID: string) => (
    <Text fontSize={14} style={spacings.mbTy} testID={testID}>
      {t(key)}
    </Text>
  )

  const cancel = (
    <Button
      testID="entry-owner-cancel"
      type="ghost"
      text={t('socialRecovery.actions.cancel')}
      onPress={onCancel}
      hasBottomSpacing={false}
    />
  )

  let body: React.ReactNode
  if (!loaded) {
    body = (
      <View testID="entry-owner-loading">
        <LoadingBlock variant="block" message={t('socialRecovery.loading.accounts')} />
      </View>
    )
  } else if (choices.length === 0) {
    body = (
      <>
        <Text fontSize={14} appearance="errorText" testID="entry-owner-none">
          {t(`${OWNER}.noEligibleAccount`)}
        </Text>
        <ActionsRow primary={cancel} />
      </>
    )
  } else {
    body = (
      <>
        <View testID="entry-owner-choices">
          {choices.map((choice) => (
            <ReceivingRow
              key={choice.address}
              choice={choice}
              selected={chosen?.address === choice.address}
              disabled={!acknowledged}
              onSelect={setPicked}
            />
          ))}
        </View>
        <SectionCard tone="muted" spacing="item" testID="entry-owner-sentences">
          {!!chosen && (
            <>
              <SectionLabel>{renderValueLabel('newKey', t)}</SectionLabel>
              <Text
                fontSize={14}
                weight="number_medium"
                selectable
                style={spacings.mbSm}
                testID="entry-owner-new-key"
              >
                {renderFullAddress(chosen.key.addr)}
              </Text>
            </>
          )}
          {!!chosen && (
            <Text fontSize={14} style={spacings.mbTy} testID="entry-owner-installs">
              {t(`${OWNER}.installs`, {
                account: chosen.account.preferences.label || renderShortAddress(chosen.address)
              })}
            </Text>
          )}
          {line(`${OWNER}.twoAccounts`, 'entry-owner-two-accounts')}
          {line(`${OWNER}.nothingMerges`, 'entry-owner-nothing-merges')}
          {line(`${OWNER}.keepsAddress`, 'entry-owner-keeps-address')}
        </SectionCard>
        <ActionsRow
          primary={
            <Button
              testID="entry-owner-continue"
              type="primary"
              text={t('socialRecovery.actions.continue')}
              disabled={!acknowledged || !chosen}
              onPress={proceed}
              hasBottomSpacing={false}
            />
          }
          secondary={cancel}
        />
      </>
    )
  }

  return (
    <TwoColumn testID="entry-owner-columns">
      <View testID="entry-owner">
        <PageTitle
          title={t(`${OWNER}.title`)}
          lead={t(`${OWNER}.lead`)}
          titleTestID="entry-owner-title"
        />
        <WarningGate
          form="condensed"
          initiallyAcknowledged={initiallyAcknowledged}
          onAcknowledgedChange={setAcknowledged}
        />
        <View style={spacings.mtLg}>{body}</View>
      </View>
    </TwoColumn>
  )
}

export default React.memo(OwnerStageView)
