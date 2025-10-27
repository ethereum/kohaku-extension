import React, { useCallback } from 'react'
import { View } from 'react-native'

import { TransferController } from '@ambire-common/controllers/transfer/transfer'
import { TokenResult } from '@ambire-common/libs/portfolio'
import Checkbox from '@common/components/Checkbox'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import { THEME_TYPES } from '@common/styles/themeConfig'
import useHover, { AnimatedPressable } from '@web/hooks/useHover'

type Props = {
  onAddToAddressBook: () => any
  isRecipientAddressUnknown: boolean
  isRecipientHumanizerKnownTokenOrSmartContract: boolean
  isRecipientAddressUnknownAgreed: TransferController['isRecipientAddressUnknownAgreed']
  onRecipientCheckboxClick: () => void
  addressValidationMsg: string
  isSWWarningVisible: boolean
  isSWWarningAgreed: boolean
  isRecipientAddressSameAsSender: boolean
  selectedTokenSymbol?: TokenResult['symbol']
}

const ConfirmAddress = ({
  onAddToAddressBook,
  onRecipientCheckboxClick,
  isRecipientHumanizerKnownTokenOrSmartContract,
  isRecipientAddressUnknown,
  isRecipientAddressUnknownAgreed,
  addressValidationMsg,
  isSWWarningVisible,
  isRecipientAddressSameAsSender
}: Props) => {
  const { t } = useTranslation()
  const [bindAnim, animStyle] = useHover({
    preset: 'opacityInverted'
  })
  const { theme, themeType } = useTheme()

  return !isRecipientHumanizerKnownTokenOrSmartContract &&
    !!isRecipientAddressUnknown &&
    !isRecipientAddressSameAsSender &&
    addressValidationMsg !== 'Invalid address.' ? (
    <>
      <View style={spacings.mb}>
        <Checkbox
          value={isRecipientAddressUnknownAgreed}
          onValueChange={onRecipientCheckboxClick}
          label={
            isSWWarningVisible
              ? t(
                  'I confirm sending to this address and that it’s not a CEX (which won’t support ETH deposits from smart wallets).'
                )
              : t('Confirm sending to this address.')
          }
          style={spacings.mb0}
          testID="recipient-address-unknown-checkbox"
        />
      </View>
      <AnimatedPressable style={animStyle} onPress={onAddToAddressBook} {...bindAnim}>
        <Text
          testID='send-form-add-to-address-book-button'
          style={{
            textDecorationLine: 'underline',
            ...spacings.mbTy
          }}
          fontSize={14}
          color={themeType === THEME_TYPES.DARK ? theme.linkText : theme.primary}
        >
          {t('+ Add to Address Book')}
        </Text>
      </AnimatedPressable>
    </>
  ) : null
}

export default ConfirmAddress
