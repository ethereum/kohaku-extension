/**
 * One committed value beside the path: its name, the value as it stands, and
 * the action that opens the step that changes it.
 */
import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { SectionCard } from '@web/modules/social-recovery/shared/chrome'

import type { ValueRowProps } from './types'

const ValueRow = ({ label, text, action, stage, onStage }: ValueRowProps) => (
  <SectionCard label={label} spacing="item" testID={`manage-value-${stage}`}>
    <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.wrap]}>
      {!!text && (
        <Text
          fontSize={14}
          weight="medium"
          style={spacings.mrSm}
          testID={`manage-value-${stage}-text`}
        >
          {text}
        </Text>
      )}
      <Button
        testID={`manage-value-${stage}-change`}
        type="secondary"
        size="small"
        text={action}
        onPress={() => onStage(stage)}
        hasBottomSpacing={false}
      />
    </View>
  </SectionCard>
)

export default React.memo(ValueRow)
