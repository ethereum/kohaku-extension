/** The warning's header line, drawn by the forms that open with one. */
import React from 'react'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'

import type { WarningHeaderProps } from './types'

const WarningHeader = ({ header, testID }: WarningHeaderProps) => {
  const { t } = useTranslation()

  return (
    <Text
      fontSize={20}
      weight="medium"
      appearance="errorText"
      style={spacings.mbTy}
      testID={`${testID}-header`}
    >
      {t(header)}
    </Text>
  )
}

export default React.memo(WarningHeader)
