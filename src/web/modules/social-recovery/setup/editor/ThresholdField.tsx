import React from 'react'
import { View } from 'react-native'

import Input from '@common/components/Input'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'

import type { ThresholdFieldProps } from './types'

/**
 * "Require N of M", with N typed by the holder. Text that is not a whole
 * number stays in the field and never reaches the path; otherwise the field
 * shows the path's threshold.
 */
const ThresholdField = ({
  threshold,
  heldText,
  members,
  onChangeText,
  disabled,
  testID
}: ThresholdFieldProps) => {
  const { t } = useTranslation()
  const { theme } = useTheme()

  return (
    <View style={[flexbox.directionRow, flexbox.alignCenter]}>
      <Text fontSize={14} style={spacings.mrTy}>
        {t('socialRecovery.shape.require')}
      </Text>
      <Input
        testID={testID}
        value={heldText !== undefined ? heldText : String(threshold)}
        onChangeText={onChangeText}
        keyboardType="numeric"
        disabled={disabled}
        containerStyle={{ ...spacings.mb0, width: 56 }}
        nativeInputStyle={{ color: theme.primaryText }}
      />
      <Text fontSize={14} style={spacings.mlTy}>
        {`${t('socialRecovery.shape.of')} ${members}`}
      </Text>
    </View>
  )
}

export default React.memo(ThresholdField)
