/**
 * The lookup before it found a setup: the read running, a read that failed
 * with its retry, a client this wallet version cannot read with, and the one
 * dead end that says no setup was found, which renders only where the setup
 * read answered that the account has no setup commitment, under the address
 * looked up. Beside the dead end sit the Recovery Card note and the module
 * this wallet reads.
 */
import React from 'react'
import type { ReactNode } from 'react'
import { View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import {
  ActionsRow,
  SectionCard,
  SectionLabel,
  TwoColumn
} from '@web/modules/social-recovery/shared/chrome'
import LoadingBlock from '@web/modules/social-recovery/shared/chrome/LoadingBlock'
import ReadFailedBlock from '@web/modules/social-recovery/shared/chrome/ReadFailedBlock'
import { renderFullAddress } from '@web/modules/social-recovery/shared/display'

import type { LookupStateProps } from './types'

const ACCOUNT = 'socialRecovery.entry.account'
const NO_SETUP = 'socialRecovery.entry.noSetup'
const LABELS = 'socialRecovery.entry.labels'

const LookupState = ({
  target,
  networkName,
  client,
  setupState,
  onRetrySetup,
  onAnotherAddress,
  onClose,
  counter
}: LookupStateProps) => {
  const { t } = useTranslation()

  const columns = (body: ReactNode, aside?: ReactNode) => (
    <TwoColumn testID="entry-lookup-columns" aside={aside}>
      {counter}
      {body}
    </TwoColumn>
  )

  const another = (
    <Button
      testID="entry-lookup-another"
      type="outline"
      text={t(`${NO_SETUP}.tryAnother`)}
      onPress={onAnotherAddress}
      hasBottomSpacing={false}
    />
  )

  if (client.status === 'update-the-wallet') {
    // No setup read ran, so the state says nothing about whether a setup exists.
    return columns(
      <View testID="entry-lookup-update-the-wallet">
        <Alert
          testID="entry-lookup-refused"
          type="error"
          size="sm"
          style={spacings.mbSm}
          title={t('socialRecovery.client.updateTheWalletTitle')}
        />
        <Text fontSize={14} testID="entry-lookup-update-how">
          {t('socialRecovery.client.updateTheWalletHow')}
        </Text>
      </View>
    )
  }
  if (client.status === 'failed') {
    return columns(
      <View testID="entry-lookup-failed">
        <ReadFailedBlock
          testID="entry-lookup-read-failed"
          title={t(`${ACCOUNT}.errors.readFailedTitle`, { network: networkName })}
          body={t(`${ACCOUNT}.errors.readFailedHint`)}
          onRetry={client.retry}
        />
        <ActionsRow primary={another} />
      </View>
    )
  }
  if (client.status === 'loading' || setupState.status === 'pending') {
    return columns(
      <View testID="entry-lookup-loading">
        <LoadingBlock
          variant="block"
          message={t(`${ACCOUNT}.lookingUp`, { network: networkName })}
        />
      </View>
    )
  }
  if (setupState.status === 'failed') {
    return columns(
      <View testID="entry-lookup-failed">
        <ReadFailedBlock
          testID="entry-lookup-read-failed"
          title={t(`${ACCOUNT}.errors.readFailedTitle`, { network: networkName })}
          body={t(`${ACCOUNT}.errors.readFailedHint`)}
          onRetry={onRetrySetup}
        />
        <ActionsRow primary={another} />
      </View>
    )
  }
  if (setupState.value.hasSetup) {
    return null
  }

  const aside = (
    <>
      <SectionCard
        tone="muted"
        spacing="item"
        label={t(`${NO_SETUP}.cardTitle`)}
        testID="entry-no-setup-card"
      >
        <Text fontSize={12} appearance="secondaryText">
          {t(`${NO_SETUP}.cardBody`)}
        </Text>
      </SectionCard>
      <SectionCard
        tone="muted"
        spacing="item"
        label={t(`${NO_SETUP}.otherWalletTitle`)}
        testID="entry-no-setup-elsewhere"
      >
        <Text
          fontSize={12}
          appearance="secondaryText"
          style={spacings.mbTy}
          testID="entry-no-setup-other-wallet"
        >
          {t(`${NO_SETUP}.otherWallet`)}
        </Text>
        <Text
          fontSize={12}
          appearance="secondaryText"
          weight="number_medium"
          selectable
          testID="entry-no-setup-module"
        >
          {t(`${NO_SETUP}.module`, { module: renderFullAddress(client.client.descriptor.action) })}
        </Text>
      </SectionCard>
    </>
  )

  return columns(
    <View testID="entry-no-setup">
      <Text fontSize={20} weight="medium" style={spacings.mbSm} testID="entry-no-setup-title">
        {t(`${NO_SETUP}.title`, { network: networkName })}
      </Text>
      <Text fontSize={14} style={spacings.mbTy}>
        {t(`${NO_SETUP}.checkCard`)}
      </Text>
      <SectionCard testID="entry-no-setup-account">
        <SectionLabel>{t(`${LABELS}.accountLookedUp`)}</SectionLabel>
        <Text
          fontSize={14}
          weight="number_medium"
          selectable
          style={spacings.mbSm}
          testID="entry-no-setup-address"
        >
          {renderFullAddress(target.address)}
        </Text>
        <SectionLabel>{t(`${LABELS}.network`)}</SectionLabel>
        <Text fontSize={14} testID="entry-no-setup-network">
          {networkName}
        </Text>
      </SectionCard>
      <ActionsRow
        primary={
          <Button
            testID="entry-lookup-another"
            type="primary"
            text={t(`${NO_SETUP}.tryAnother`)}
            onPress={onAnotherAddress}
            hasBottomSpacing={false}
          />
        }
        secondary={
          onClose ? (
            <Button
              testID="entry-no-setup-close"
              type="outline"
              text={t(`${NO_SETUP}.close`)}
              onPress={onClose}
              hasBottomSpacing={false}
            />
          ) : undefined
        }
      />
    </View>,
    aside
  )
}

export default React.memo(LookupState)
