import React, { useMemo } from 'react'
import { View } from 'react-native'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'

import { renderRulesPanel } from './copy'

/** The rules panel: every rule the editor applies, always shown. */
const RulesPanel = () => {
  const { t } = useTranslation()
  const rulesPanel = useMemo(() => renderRulesPanel(t), [t])

  return (
    <View style={spacings.mbLg} testID="editor-rules">
      <Text fontSize={16} weight="semiBold" style={spacings.mbSm} testID="editor-rules-header">
        {rulesPanel.header}
      </Text>
      {rulesPanel.lines.map((line) => (
        <Text
          key={line}
          fontSize={14}
          appearance="secondaryText"
          style={spacings.mbTy}
          testID="editor-rules-line"
        >
          {line}
        </Text>
      ))}
    </View>
  )
}

export default React.memo(RulesPanel)
