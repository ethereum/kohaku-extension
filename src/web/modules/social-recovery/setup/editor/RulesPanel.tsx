import React, { useMemo } from 'react'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { SectionCard, SectionLabel } from '@web/modules/social-recovery/shared/chrome'

import { renderRulesPanel } from './copy'

/** The rules panel: every rule the editor applies, always shown. */
const RulesPanel = () => {
  const { t } = useTranslation()
  const rulesPanel = useMemo(() => renderRulesPanel(t), [t])

  return (
    <SectionCard tone="muted" testID="editor-rules">
      <SectionLabel testID="editor-rules-header">{rulesPanel.header}</SectionLabel>
      {rulesPanel.lines.map((line) => (
        <Text
          key={line}
          fontSize={12}
          appearance="secondaryText"
          style={spacings.mbMi}
          testID="editor-rules-line"
        >
          {line}
        </Text>
      ))}
    </SectionCard>
  )
}

export default React.memo(RulesPanel)
