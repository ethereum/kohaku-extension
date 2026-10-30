/**
 * The path this device last opened, shown while the account's setup is read
 * from the chain, with its actions held until that read answers.
 */
import React, { useMemo } from 'react'

import { useTranslation } from '@common/config/localization'
import { readablePathOf } from '@web/modules/social-recovery/recovery/entry/readout'
import ReadoutPathBlock from '@web/modules/social-recovery/recovery/entry/ReadoutPathBlock'
import { SectionCard } from '@web/modules/social-recovery/shared/chrome'

import PathActions from './PathActions'
import type { CachedPathBlockProps } from './types'

const CachedPathBlock = ({ configuration, context, navigate }: CachedPathBlockProps) => {
  const { t } = useTranslation()
  const path = useMemo(() => readablePathOf(configuration, context, t), [configuration, context, t])
  return (
    <SectionCard testID="overview-path-cached">
      <ReadoutPathBlock path={path} />
      <PathActions disabled navigate={navigate} />
    </SectionCard>
  )
}

export default React.memo(CachedPathBlock)
