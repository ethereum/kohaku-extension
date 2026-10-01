/**
 * The guardian's advisory checks, each a line the holder reads and none a
 * gate.
 */
import React from 'react'
import { View } from 'react-native'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'

import type { GuardianChecksBlockProps } from './types'

const GuardianChecksBlock = ({ lines }: GuardianChecksBlockProps) => {
  const { t } = useTranslation()

  return (
    <View testID="guardian-checks" style={spacings.mbSm}>
      <Text fontSize={12} weight="medium" appearance="secondaryText" style={spacings.mbTy}>
        {t('socialRecovery.enroll.guardian.checksHeader')}
      </Text>
      {lines.map((line) => (
        <Text key={line.key} testID="guardian-check" fontSize={14}>
          {t(line.key, line.values)}
        </Text>
      ))}
      <Text fontSize={12} appearance="secondaryText">
        {t('socialRecovery.enroll.guardian.advisory')}
      </Text>
    </View>
  )
}

export default React.memo(GuardianChecksBlock)
