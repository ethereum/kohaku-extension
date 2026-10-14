/** The pointer to the seed import, for a holder who still has the seed phrase. */
import React from 'react'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { SectionCard } from '@web/modules/social-recovery/shared/chrome'

import type { WarningImportPointerProps } from './types'

const WarningImportPointer = ({ pointer, onImportInstead, testID }: WarningImportPointerProps) => {
  const { t } = useTranslation()

  return (
    <SectionCard tone="muted" spacing="item" testID={`${testID}-pointer`}>
      <Text fontSize={14} style={spacings.mbTy}>
        {t(pointer.line)}
      </Text>
      <Button
        testID={`${testID}-import-instead`}
        type="secondary"
        size="small"
        text={t(pointer.action)}
        onPress={onImportInstead}
        hasBottomSpacing={false}
        style={flexbox.alignSelfStart}
      />
    </SectionCard>
  )
}

export default React.memo(WarningImportPointer)
