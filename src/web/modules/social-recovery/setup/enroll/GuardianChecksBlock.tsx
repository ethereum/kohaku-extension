/**
 * The guardian's advisory checks, each a line the holder reads and none a
 * gate. Each line carries an icon and a colour for its tone beside its text,
 * so the meaning never rests on the colour alone.
 */
import React from 'react'
import { View } from 'react-native'

import CheckIcon from '@common/assets/svg/CheckIcon'
import ErrorIcon from '@common/assets/svg/ErrorIcon'
import WarningIcon from '@common/assets/svg/WarningIcon'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { SectionCard, SectionLabel } from '@web/modules/social-recovery/shared/chrome'

import type { CheckToneIconProps, GuardianChecksBlockProps } from './types'

const ICON_SIZE = 18

const ToneIcon = ({ tone }: CheckToneIconProps) => {
  const { theme } = useTheme()
  const testID = `guardian-check-icon-${tone}`
  if (tone === 'good') {
    return (
      <CheckIcon
        testID={testID}
        width={ICON_SIZE}
        height={ICON_SIZE}
        color={theme.successDecorative}
      />
    )
  }
  if (tone === 'warning') {
    return (
      <WarningIcon
        testID={testID}
        width={ICON_SIZE}
        height={ICON_SIZE}
        color={theme.warningDecorative}
      />
    )
  }
  return (
    <ErrorIcon testID={testID} width={ICON_SIZE} height={ICON_SIZE} color={theme.errorDecorative} />
  )
}

const GuardianChecksBlock = ({ lines }: GuardianChecksBlockProps) => {
  const { t } = useTranslation()

  return (
    <SectionCard tone="muted" spacing="item" testID="guardian-checks">
      <SectionLabel>{t('socialRecovery.enroll.guardian.checksHeader')}</SectionLabel>
      {lines.map((line) => (
        <View key={line.key} style={[flexbox.directionRow, flexbox.alignCenter, spacings.mbTy]}>
          <View style={spacings.mrTy}>
            <ToneIcon tone={line.tone} />
          </View>
          <Text testID="guardian-check" fontSize={14} style={flexbox.flex1}>
            {t(line.key, line.values)}
          </Text>
        </View>
      ))}
      <Text fontSize={12} appearance="secondaryText">
        {t('socialRecovery.enroll.guardian.advisory')}
      </Text>
    </SectionCard>
  )
}

export default React.memo(GuardianChecksBlock)
