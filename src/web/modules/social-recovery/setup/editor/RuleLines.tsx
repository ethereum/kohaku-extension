import React from 'react'
import { View } from 'react-native'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { SectionCard } from '@web/modules/social-recovery/shared/chrome'
import { renderRuleLines } from '@web/modules/social-recovery/shared/rule-lines'

import type { RuleLinesProps } from './types'

/** The rule-lines block: the lines of the path as it stands, text only. */
const RuleLines = ({ ruleLines }: RuleLinesProps) => {
  const { t } = useTranslation()

  return (
    <SectionCard tone="muted" label={t('socialRecovery.shape.header')} testID="editor-rule-lines">
      {ruleLines.map((line, index) => {
        const [text] = renderRuleLines([line], t)
        return (
          <View
            // Two groups of one shape share a line's words; the list is rebuilt
            // from the path on every render, so a line's place is its identity.
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            style={index < ruleLines.length - 1 ? spacings.mbTy : undefined}
          >
            <Text fontSize={14} testID="editor-rule-line">
              {text}
            </Text>
          </View>
        )
      })}
    </SectionCard>
  )
}

export default React.memo(RuleLines)
