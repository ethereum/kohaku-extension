/**
 * The saved screen: the setup is live, the one transaction that saved it with
 * its explorer page, the account it was written to, and Continue to the
 * Recovery Card at the level it shows.
 */
import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import {
  ActionsRow,
  SectionCard,
  SectionLabel,
  StatusChip
} from '@web/modules/social-recovery/shared/chrome'
import {
  renderChip,
  renderFullAddress,
  renderHash,
  renderResolvedName
} from '@web/modules/social-recovery/shared/display'

import { cardPathOf, explorerTransactionUrlOf } from './saved'
import type { SavedViewProps } from './types'

const ARM = 'socialRecovery.arm'

const SavedView = ({
  transactionHash,
  chain,
  account,
  level,
  navigate,
  openUrl
}: SavedViewProps) => {
  const { t } = useTranslation()
  const name = account.label ? renderResolvedName(account.label, 'besideAddressToCheck', t) : null

  const line = (text: string, testID?: string) => (
    <Text fontSize={14} style={spacings.mbTy} testID={testID}>
      {text}
    </Text>
  )
  const muted = (text: string, testID?: string) => (
    <Text fontSize={12} appearance="secondaryText" style={spacings.mbTy} testID={testID}>
      {text}
    </Text>
  )

  return (
    <View testID="arm-saved">
      <View style={spacings.mbLg}>
        <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.wrap, spacings.mbTy]}>
          <Text fontSize={20} weight="medium" testID="arm-saved-title">
            {t(`${ARM}.title`)}
          </Text>
          <StatusChip
            text={renderChip('recovery', 'setUp', t)}
            tone="success"
            style={spacings.mlSm}
            testID="arm-saved-chip"
          />
        </View>
        <Text fontSize={14} appearance="secondaryText" testID="arm-saved-live">
          {t(`${ARM}.live`)}
        </Text>
      </View>

      <SectionCard testID="arm-saved-transaction">
        {!!transactionHash && (
          <>
            <SectionLabel>{t(`${ARM}.savedOnChain`)}</SectionLabel>
            <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.wrap, spacings.mbTy]}>
              <Text fontSize={14} weight="number_medium" selectable style={spacings.mrSm}>
                {renderHash(transactionHash)}
              </Text>
              <Button
                testID="arm-saved-explorer"
                type="ghost"
                size="small"
                text={t(`${ARM}.explorer`)}
                onPress={() => openUrl(explorerTransactionUrlOf(chain, transactionHash))}
                hasBottomSpacing={false}
              />
            </View>
          </>
        )}
        {muted(t(`${ARM}.oneTransaction`), 'arm-saved-one-transaction')}
      </SectionCard>

      {level === 'hidden' && (
        <View style={spacings.mbLg}>
          {line(t(`${ARM}.hiddenBehindPassword`), 'arm-saved-hidden')}
        </View>
      )}

      <SectionCard testID="arm-saved-account">
        {!!name && (
          <Text
            fontSize={16}
            weight="medium"
            style={spacings.mbTy}
            testID="arm-saved-account-label"
          >
            {name.name}
          </Text>
        )}
        <Text
          fontSize={14}
          weight="number_medium"
          selectable
          style={spacings.mbTy}
          testID="arm-saved-account-address"
        >
          {renderFullAddress(account.address)}
        </Text>
        {muted(t(`${ARM}.writtenTo`), 'arm-saved-written-to')}
        {!!name?.caveat && muted(name.caveat, 'arm-saved-account-caveat')}
      </SectionCard>

      <ActionsRow
        primary={
          <Button
            testID="arm-saved-continue"
            type="primary"
            text={t('socialRecovery.actions.continue')}
            onPress={() => navigate(cardPathOf(level))}
            hasBottomSpacing={false}
          />
        }
        note={t(`${ARM}.settingsLine`)}
      />
    </View>
  )
}

export default React.memo(SavedView)
