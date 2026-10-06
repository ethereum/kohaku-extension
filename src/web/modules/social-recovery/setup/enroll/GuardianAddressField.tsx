/**
 * The guardian field: an address or a name, pasted or typed, with the full
 * address a resolved name points to.
 */
import React from 'react'
import { View } from 'react-native'

import Input from '@common/components/Input'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { renderFullAddress, renderResolvedName } from '@web/modules/social-recovery/shared/display'

import type { GuardianAddressFieldProps } from './types'

const GuardianAddressField = ({
  value,
  setValue,
  paste,
  canPaste,
  nameCheck,
  address
}: GuardianAddressFieldProps) => {
  const { t } = useTranslation()
  const resolved =
    nameCheck?.status === 'resolved'
      ? renderResolvedName(nameCheck.name, 'besideAddressToCheck', t)
      : null

  return (
    <View testID="guardian-field">
      <Input
        testID="guardian-address"
        value={value}
        onChangeText={setValue}
        button={canPaste ? t('socialRecovery.actions.paste') : null}
        onButtonPress={paste}
      />
      <Text fontSize={12} appearance="secondaryText" style={spacings.mbSm}>
        {t('socialRecovery.enroll.guardian.pasteHint')}
      </Text>
      {!!resolved && !!address && (
        <View testID="guardian-resolved" style={spacings.mbSm}>
          <Text fontSize={14} weight="number_medium" selectable>
            {renderFullAddress(address)}
          </Text>
          {!!resolved.caveat && (
            <Text fontSize={12} appearance="secondaryText">
              {resolved.caveat}
            </Text>
          )}
        </View>
      )}
    </View>
  )
}

export default React.memo(GuardianAddressField)
