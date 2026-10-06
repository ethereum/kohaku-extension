/**
 * The access test's header both rows show: the test, recommended and never
 * enforced.
 */
import React from 'react'
import { View } from 'react-native'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'

const AccessTestHeader = () => {
  const { t } = useTranslation()

  return (
    <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.mbTy]}>
      <Text fontSize={14} weight="medium" style={spacings.mrSm}>
        {t('socialRecovery.enroll.accessTest')}
      </Text>
      <Text fontSize={12} appearance="secondaryText">
        {t('socialRecovery.enroll.recommended')}
      </Text>
    </View>
  )
}

export default React.memo(AccessTestHeader)
