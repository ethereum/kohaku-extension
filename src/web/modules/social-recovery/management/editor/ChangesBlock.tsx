/**
 * What the edit changes, one line per changed value, or the line that nothing
 * changed yet; and the line that a printed Recovery Card goes stale where a
 * changed password or privacy level makes it so.
 */
import React from 'react'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { SectionCard } from '@web/modules/social-recovery/shared/chrome'

import { EDITOR } from './constants'
import { renderChange } from './copy'
import type { ChangesBlockProps } from './types'

const ChangesBlock = ({ rows, stale }: ChangesBlockProps) => {
  const { t } = useTranslation()

  return (
    <SectionCard label={t(`${EDITOR}.changes.title`)} testID="manage-changes">
      {rows.length === 0 && (
        <Text fontSize={14} appearance="secondaryText" testID="manage-changes-none">
          {t(`${EDITOR}.changes.none`)}
        </Text>
      )}
      {rows.map((row) => (
        <Text
          key={row.kind}
          fontSize={14}
          style={spacings.mbTy}
          testID={`manage-change-${row.kind}`}
        >
          {renderChange(row, t)}
        </Text>
      ))}
      {stale && (
        <Text fontSize={14} weight="medium" style={spacings.mtTy} testID="manage-stale-card">
          {t(`${EDITOR}.staleCard`)}
        </Text>
      )}
    </SectionCard>
  )
}

export default React.memo(ChangesBlock)
