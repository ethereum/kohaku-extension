/**
 * A write that landed while the read after its receipt runs: the transaction
 * hash stays on screen above the line that says the result is read.
 */
import React from 'react'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { SectionCard } from '@web/modules/social-recovery/shared/chrome'
import LoadingBlock from '@web/modules/social-recovery/shared/chrome/LoadingBlock'
import { renderHash } from '@web/modules/social-recovery/shared/display'

import type { ConfirmingBlockProps } from './types'

const ConfirmingBlock = ({ transactionHash, testID }: ConfirmingBlockProps) => {
  const { t } = useTranslation()
  return (
    <SectionCard testID={testID}>
      {!!transactionHash && (
        <Text
          fontSize={14}
          weight="number_medium"
          selectable
          style={spacings.mbTy}
          testID={`${testID}-hash`}
        >
          {renderHash(transactionHash)}
        </Text>
      )}
      <LoadingBlock variant="block" message={t('socialRecovery.loading.landed')} />
    </SectionCard>
  )
}

export default React.memo(ConfirmingBlock)
