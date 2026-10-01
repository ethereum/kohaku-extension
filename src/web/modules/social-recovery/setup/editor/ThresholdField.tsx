import React from 'react'
import { View } from 'react-native'

import Input from '@common/components/Input'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'

import { renderHeldThreshold } from './copy'
import type { ThresholdFieldProps } from './types'

/**
 * "Require N of M", with N typed by the holder. Text that is not a whole
 * number stays on screen with its refusal line and never reaches the path;
 * otherwise the field shows the path's threshold.
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
  const held = heldText !== undefined

  return (
    <View>
      <View style={[flexbox.directionRow, flexbox.alignCenter]}>
        <Text fontSize={14} style={spacings.mrTy}>
          {t('socialRecovery.shape.require')}
        </Text>
        <Input
          testID={testID}
          value={held ? heldText : String(threshold)}
          onChangeText={onChangeText}
          keyboardType="numeric"
          disabled={disabled}
          containerStyle={{ ...spacings.mb0, width: 64 }}
        />
        <Text fontSize={14} style={spacings.mlTy}>
          {`${t('socialRecovery.shape.of')} ${members}`}
        </Text>
      </View>
      {held && (
        <Text
          fontSize={14}
          appearance="errorText"
          style={spacings.mtTy}
          testID={testID ? `${testID}-refusal` : undefined}
        >
          {renderHeldThreshold(t)}
        </Text>
      )}
    </View>
  )
}

export default React.memo(ThresholdField)
