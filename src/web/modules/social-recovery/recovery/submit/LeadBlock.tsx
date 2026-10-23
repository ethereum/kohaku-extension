/**
 * The confirmation's lead: the values a phisher would forge, each in full.
 * The account being recovered with the line that it keeps its address and,
 * beside a resolved name, the name's caveat; the new key with its line by
 * route; the key being removed as this wallet read it; the payment, with the
 * key or account that sends the request and pays its gas once it is read.
 */
import React from 'react'
import { View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import common from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'
import { SectionCard, SectionLabel } from '@web/modules/social-recovery/shared/chrome'
import LoadingBlock from '@web/modules/social-recovery/shared/chrome/LoadingBlock'
import {
  renderFullAddress,
  renderShortAddress,
  renderValueLabel
} from '@web/modules/social-recovery/shared/display'

import { accountNameOf, newKeyLineOf } from './lead'
import { sendingAddressOf } from './sendingKey'
import type { LeadBlockProps } from './types'

const SUBMIT = 'socialRecovery.submit'

const LeadBlock = ({ route, lead, payment, sendingPlan, onRetryRemoved }: LeadBlockProps) => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const name = accountNameOf(lead.name, t)
  const newKeyLine = newKeyLineOf(route, lead.receivingName, t)

  const muted = (text: string, testID?: string) => (
    <Text fontSize={12} appearance="secondaryText" style={spacings.mbTy} testID={testID}>
      {text}
    </Text>
  )

  const valueCard = (label: string, body: React.ReactNode) => (
    <View
      style={[
        common.borderRadiusPrimary,
        spacings.phSm,
        spacings.pvSm,
        spacings.mbTy,
        { backgroundColor: theme.secondaryBackground }
      ]}
    >
      <SectionLabel>{label}</SectionLabel>
      {body}
    </View>
  )

  const value = (label: string, address: string, testID: string) =>
    valueCard(
      label,
      <Text fontSize={14} weight="number_medium" selectable testID={testID}>
        {address}
      </Text>
    )

  // A value still being read keeps its label, with a line that says it is read.
  const reading = (label: string, testID: string) =>
    valueCard(
      label,
      <View testID={testID}>
        <LoadingBlock variant="row" message={t('socialRecovery.loading.key')} />
      </View>
    )

  const removedBlock = () => {
    const { removed } = lead
    switch (removed.status) {
      case 'named':
        return (
          <>
            {value(
              renderValueLabel('keyBeingRemoved', t),
              renderFullAddress(removed.key),
              'submit-removed-key'
            )}
            {muted(t('socialRecovery.display.asThisWalletRead'), 'submit-removed-key-line')}
          </>
        )
      case 'unavailable':
        return (
          <Alert
            testID="submit-removed-key-unavailable"
            type="error"
            size="sm"
            text={t(`${SUBMIT}.removedKeyUnavailable`)}
          />
        )
      case 'failed':
        return (
          <Alert
            testID="submit-removed-key-failed"
            type="error"
            size="sm"
            title={t('socialRecovery.client.unavailableTitle')}
            text={t('socialRecovery.client.unavailableBody')}
          >
            <Button
              testID="submit-removed-key-retry"
              type="secondary"
              size="small"
              text={t('socialRecovery.writes.tryAgain')}
              onPress={onRetryRemoved}
              hasBottomSpacing={false}
              style={[flexbox.alignSelfStart, spacings.mtSm]}
            />
          </Alert>
        )
      case 'loading':
      default:
        return reading(renderValueLabel('keyBeingRemoved', t), 'submit-removed-key-loading')
    }
  }

  return (
    <SectionCard testID="submit-lead">
      <View style={spacings.mbSm} testID="submit-account">
        {value(
          renderValueLabel('accountBeingRecovered', t),
          renderFullAddress(lead.account),
          'submit-account-address'
        )}
        {muted(name.line, 'submit-account-name')}
        {!!name.caveat && muted(name.caveat, 'submit-account-caveat')}
      </View>
      <View style={spacings.mbSm} testID="submit-new-key-block">
        {lead.newKey
          ? value(renderValueLabel('newKey', t), renderFullAddress(lead.newKey), 'submit-new-key')
          : reading(renderValueLabel('newKey', t), 'submit-new-key-loading')}
        {!!lead.newKey && !!newKeyLine && muted(newKeyLine, 'submit-new-key-line')}
      </View>
      <View style={payment !== null ? spacings.mbSm : undefined} testID="submit-removed-key-block">
        {removedBlock()}
      </View>
      {payment !== null && (
        <View testID="submit-payment">
          {value(renderValueLabel('payment', t), payment, 'submit-no-payment')}
          {!!sendingPlan &&
            (sendingPlan.kind === 'key'
              ? muted(
                  t(`${SUBMIT}.ownKeyPays`, {
                    key: renderShortAddress(sendingAddressOf(sendingPlan))
                  }),
                  'submit-own-key-pays'
                )
              : muted(
                  t(`${SUBMIT}.accountPays`, {
                    account: renderShortAddress(sendingAddressOf(sendingPlan))
                  }),
                  'submit-account-pays'
                ))}
        </View>
      )}
    </SectionCard>
  )
}

export default React.memo(LeadBlock)
