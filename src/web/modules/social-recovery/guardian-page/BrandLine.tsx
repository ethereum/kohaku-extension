/** The eyebrow above every screen of the page: whose page this is. */
import React from 'react'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'

const BrandLine = () => {
  const { t } = useTranslation()

  return (
    <Text fontSize={12} appearance="secondaryText" style={spacings.mbTy} testID="guardian-brand">
      {t('socialRecovery.guardianPage.brand')}
    </Text>
  )
}

export default React.memo(BrandLine)
