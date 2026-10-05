import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { SectionCard } from '@web/modules/social-recovery/shared/chrome'
import { renderRuleLines, RULE_LINE_KEYS } from '@web/modules/social-recovery/shared/rule-lines'

import type { RuleLinesProps } from './types'

/**
 * The rule-lines block: the lines of the path as it stands, with the offer to
 * add a second method under its line and the offer to make the required rows
 * one group under the sizing line.
 */
const RuleLines = ({ ruleLines, checking, onMakeItAGroup, onAddSecondMethod }: RuleLinesProps) => {
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
            {line.key === RULE_LINE_KEYS.sizingRule && (
              <Button
                testID="editor-make-it-a-group"
                type="secondary"
                size="small"
                text={t('socialRecovery.editor.makeItAGroup')}
                onPress={onMakeItAGroup}
                disabled={checking}
                hasBottomSpacing={false}
                style={[flexbox.alignSelfStart, spacings.mtTy]}
              />
            )}
            {line.key === RULE_LINE_KEYS.secondMethodOffer && (
              <Button
                testID="editor-add-second-method"
                type="secondary"
                size="small"
                text={t('socialRecovery.editor.addSecondMethod')}
                onPress={onAddSecondMethod}
                disabled={checking}
                hasBottomSpacing={false}
                style={[flexbox.alignSelfStart, spacings.mtTy]}
              />
            )}
          </View>
        )
      })}
    </SectionCard>
  )
}

export default React.memo(RuleLines)
