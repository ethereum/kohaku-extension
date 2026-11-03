/**
 * The four values in full, each under its label, or the words that it cannot
 * be read. The lead, the signing step and the offline block draw the same
 * lines, so the guardian compares one form of each value.
 */
import React from 'react'
import { View } from 'react-native'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import common from '@common/styles/utils/common'
import { SectionLabel } from '@web/modules/social-recovery/shared/chrome'

import type { ValueLinesProps } from './types'

const ValueLines = ({ values, testID }: ValueLinesProps) => {
  const { t } = useTranslation()
  const { theme } = useTheme()

  return (
    <>
      {values.lines.map(({ name, label, value }) => (
        <View
          key={name}
          style={[
            common.borderRadiusPrimary,
            spacings.phSm,
            spacings.pvSm,
            spacings.mbTy,
            { backgroundColor: theme.secondaryBackground }
          ]}
        >
          <SectionLabel>{label}</SectionLabel>
          {value !== null ? (
            <Text fontSize={14} weight="number_medium" selectable testID={`${testID}-${name}`}>
              {value}
            </Text>
          ) : (
            <Text fontSize={14} appearance="errorText" testID={`${testID}-${name}-unreadable`}>
              {t('socialRecovery.guardianPage.notReadable')}
            </Text>
          )}
        </View>
      ))}
    </>
  )
}

export default React.memo(ValueLines)
