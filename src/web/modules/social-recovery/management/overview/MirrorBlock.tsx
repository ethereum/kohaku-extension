/** The warning of an authorization with no setup behind it, with its one action. */
import React from 'react'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { ActionsRow, SectionCard } from '@web/modules/social-recovery/shared/chrome'

import { OVERVIEW } from './constants'
import type { MirrorBlockProps } from './types'

const MirrorBlock = ({ onOpen }: MirrorBlockProps) => {
  const { t } = useTranslation()
  return (
    <SectionCard testID="overview-mirror">
      <Text fontSize={16} weight="medium" style={spacings.mbTy} testID="overview-mirror-title">
        {t(`${OVERVIEW}.mirror.title`)}
      </Text>
      <Text fontSize={14} style={spacings.mbTy} testID="overview-mirror-body">
        {t(`${OVERVIEW}.mirror.body`)}
      </Text>
      <ActionsRow
        primary={
          <Button
            testID="overview-remove-authorization"
            type="primary"
            text={t(`${OVERVIEW}.mirror.action`)}
            onPress={() => onOpen('removeAuthorization')}
            hasBottomSpacing={false}
          />
        }
      />
    </SectionCard>
  )
}

export default React.memo(MirrorBlock)
