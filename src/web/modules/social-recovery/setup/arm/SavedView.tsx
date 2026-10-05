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

  return (
    <View testID="arm-saved">
      <Text
        fontSize={12}
        weight="medium"
        appearance="successText"
        style={spacings.mbTy}
        testID="arm-saved-chip"
      >
        {renderChip('recovery', 'setUp', t)}
      </Text>
      <Text fontSize={20} weight="semiBold" style={spacings.mbTy} testID="arm-saved-title">
        {t(`${ARM}.title`)}
      </Text>
      <Text fontSize={14} appearance="secondaryText" style={spacings.mbLg} testID="arm-saved-live">
        {t(`${ARM}.live`)}
      </Text>

      <View style={spacings.mbLg} testID="arm-saved-transaction">
        {!!transactionHash && (
          <>
            <Text fontSize={12} weight="semiBold" appearance="secondaryText" style={spacings.mbTy}>
              {t(`${ARM}.savedOnChain`)}
            </Text>
            <Text fontSize={14} weight="number_medium" selectable style={spacings.mbTy}>
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
          </>
        )}
        {line(t(`${ARM}.oneTransaction`), 'arm-saved-one-transaction')}
        {level === 'hidden' && line(t(`${ARM}.hiddenBehindPassword`), 'arm-saved-hidden')}
      </View>

      <View style={spacings.mbLg} testID="arm-saved-account">
        {!!name && line(name.name, 'arm-saved-account-label')}
        {line(renderFullAddress(account.address), 'arm-saved-account-address')}
        {line(t(`${ARM}.writtenTo`), 'arm-saved-written-to')}
        {!!name?.caveat && line(name.caveat, 'arm-saved-account-caveat')}
      </View>

      <Button
        testID="arm-saved-continue"
        type="primary"
        text={t('socialRecovery.actions.continue')}
        onPress={() => navigate(cardPathOf(level))}
        hasBottomSpacing={false}
      />
      <Text fontSize={12} appearance="secondaryText" style={spacings.mtSm}>
        {t(`${ARM}.settingsLine`)}
      </Text>
    </View>
  )
}

export default React.memo(SavedView)
