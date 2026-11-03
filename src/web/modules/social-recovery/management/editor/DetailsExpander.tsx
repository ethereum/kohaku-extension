/**
 * The press that opens and closes the trust details, drawn as the setup
 * review draws its own: the label, the arrow of its state, and the expanded
 * state for assistive technology.
 */
import React from 'react'
import { Pressable } from 'react-native'

import DownArrowIcon from '@common/assets/svg/DownArrowIcon'
import UpArrowIcon from '@common/assets/svg/UpArrowIcon'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import common from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'

import type { DetailsExpanderProps } from './types'

const DetailsExpander = ({ expanded, onToggle, testID }: DetailsExpanderProps) => {
  const { t } = useTranslation()
  const { theme } = useTheme()

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      // react-native-web renders this as aria-expanded; the React Native
      // types do not declare it, so it travels in a spread
      {...{ accessibilityExpanded: expanded }}
      onPress={onToggle}
      style={[
        flexbox.directionRow,
        flexbox.alignCenter,
        flexbox.justifySpaceBetween,
        common.borderRadiusPrimary,
        spacings.ph,
        spacings.pvSm,
        spacings.mbSm,
        {
          borderWidth: 1,
          borderColor: theme.secondaryBorder,
          backgroundColor: theme.secondaryBackground
        }
      ]}
    >
      <Text fontSize={14} weight="medium">
        {t('socialRecovery.review.verifyDetails')}
      </Text>
      {expanded ? <UpArrowIcon /> : <DownArrowIcon />}
    </Pressable>
  )
}

export default React.memo(DetailsExpander)
