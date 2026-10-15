/**
 * Verify the details, the page's expander: the setup number, the attempt number, the network as a fixed label and the
 * manager the request is aimed at, in full.
 */
import React, { useState } from 'react'
import { Pressable, View } from 'react-native'

import DownArrowIcon from '@common/assets/svg/DownArrowIcon'
import UpArrowIcon from '@common/assets/svg/UpArrowIcon'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import common from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'
import { SectionCard, SectionLabel } from '@web/modules/social-recovery/shared/chrome'

import type { DetailsBlockProps } from './types'
import { fullAddressOf } from './values'

const DETAILS = 'socialRecovery.guardianPage.details'

const DetailsBlock = ({ described, networkName }: DetailsBlockProps) => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const [expanded, setExpanded] = useState(false)
  const { description } = described

  const row = (label: string, value: string, testID: string) => (
    <View key={testID} style={spacings.mbSm}>
      <SectionLabel>{label}</SectionLabel>
      <Text fontSize={14} weight="number_medium" selectable testID={testID}>
        {value}
      </Text>
    </View>
  )

  return (
    <View testID="guardian-details">
      <Pressable
        testID="guardian-verify-details"
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((open) => !open)}
        style={[
          flexbox.directionRow,
          flexbox.alignCenter,
          flexbox.justifySpaceBetween,
          common.borderRadiusPrimary,
          spacings.ph,
          spacings.pvSm,
          expanded ? spacings.mbTy : spacings.mbLg,
          {
            borderWidth: 1,
            borderColor: theme.secondaryBorder,
            backgroundColor: theme.secondaryBackground
          }
        ]}
      >
        <Text fontSize={14} weight="medium">
          {t(`${DETAILS}.title`)}
        </Text>
        {expanded ? <UpArrowIcon /> : <DownArrowIcon />}
      </Pressable>
      {expanded && (
        <SectionCard testID="guardian-details-rows">
          {row(
            t(`${DETAILS}.setupNumber`),
            description.setupNonce.toString(),
            'guardian-details-setup-number'
          )}
          {row(
            t(`${DETAILS}.attemptNumber`),
            description.attemptId.toString(),
            'guardian-details-attempt-number'
          )}
          {row(t(`${DETAILS}.network`), networkName, 'guardian-details-network')}
          {row(
            t(`${DETAILS}.registry`),
            fullAddressOf(described.request.manager) ?? described.request.manager,
            'guardian-details-registry'
          )}
        </SectionCard>
      )}
    </View>
  )
}

export default React.memo(DetailsBlock)
