/**
 * The line that removing recovery cancels the attempt in progress.
 */
import React from 'react'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'

import { REMOVE } from './constants'

const RemoveCancelsLine = () => {
  const { t } = useTranslation()
  return (
    <Text fontSize={14} weight="medium" style={spacings.mbSm} testID="manage-remove-cancels">
      {t(`${REMOVE}.cancelsLine`)}
    </Text>
  )
}

export default React.memo(RemoveCancelsLine)
