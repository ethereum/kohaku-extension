import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { SectionCard } from '@web/modules/social-recovery/shared/chrome'
import { renderRuleLines, RULE_LINE_KEYS } from '@web/modules/social-recovery/shared/rule-lines'
import type { RuleLineKey } from '@web/modules/social-recovery/shared/rule-lines'

import KindMenuButton from './KindMenuButton'
import { SECOND_METHOD_KINDS } from './operations'
import type { RuleLinesProps } from './types'

/** The lines that offer a second method, under which the menu that adds one draws. */
const SECOND_METHOD_OFFERS: readonly RuleLineKey[] = [
  RULE_LINE_KEYS.secondMethodOffer,
  RULE_LINE_KEYS.secondMethodOfferAny
]

/**
 * The rule-lines block: the lines of the path as it stands, with the menu
 * that adds a second method under its line, and after the lines the offer
 * to make two required rows one group.
 */
const RuleLines = ({
  ruleLines,
  checking,
  secondMenuOpen,
  canMakeItAGroup,
  onMakeItAGroup,
  onToggleSecondMenu,
  onPickKind,
  onCloseMenu
}: RuleLinesProps) => {
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
            {SECOND_METHOD_OFFERS.includes(line.key) && (
              <KindMenuButton
                testID="editor-add-second-method"
                text={t('socialRecovery.editor.addSecondMethod')}
                open={secondMenuOpen}
                kinds={SECOND_METHOD_KINDS}
                onToggle={onToggleSecondMenu}
                onPick={onPickKind}
                onClose={onCloseMenu}
                disabled={checking}
                style={spacings.mtTy}
              />
            )}
          </View>
        )
      })}
      {canMakeItAGroup && (
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
    </SectionCard>
  )
}

export default React.memo(RuleLines)
