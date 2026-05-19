import { useMemo } from 'react'
import { StyleProp, View, ViewStyle } from 'react-native'

import Text, { TextWeight } from '@common/components/Text'
import { TFunction, useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import PrivacyIcon from '@common/assets/svg/PrivacyIcon'
import Select from '@common/components/Select'
import { SelectValue } from '@common/components/Select/types'
import RailgunIcon from '@common/assets/svg/RailgunIcon'

export const getPrivacyProtocolOptions = (t: TFunction<'translation', undefined>) => [
  {
    label: (
      <View style={[flexbox.directionRow, flexbox.alignCenter]}>
        <RailgunIcon width={12} height={12} />
        <Text fontSize={14} weight="light" style={spacings.mlMi}>
          {t('Railgun')}
        </Text>
      </View>
    ),
    value: 'railgun'
  },
  {
    label: (
      <View style={[flexbox.directionRow, flexbox.alignCenter]}>
        <PrivacyIcon width={12} height={12} />
        <Text fontSize={14} weight="light" style={spacings.mlMi}>
          {t('Privacy Pools')}
        </Text>
      </View>
    ),
    value: 'privacy-pools'
  }
]

interface PrivacyProtocolSelectorProps {
  selectedProtocol: SelectValue | null
  changeProtocol: (protocol: SelectValue) => void
  selectStyle?: ViewStyle
  viewStyle?: StyleProp<ViewStyle>
  containerStyle?: StyleProp<ViewStyle>
  direction?: 'row' | 'column'
  labelWeight?: TextWeight
  disabled?: boolean
}

const PrivacyProtocolSelector = ({
  selectedProtocol,
  changeProtocol,
  selectStyle,
  viewStyle,
  containerStyle,
  direction = 'row',
  labelWeight = 'light',
  disabled
}: PrivacyProtocolSelectorProps) => {
  const { t } = useTranslation()
  const providerOptions = useMemo(() => getPrivacyProtocolOptions(t), [t])

  const contStyle: StyleProp<ViewStyle> =
    direction === 'row'
      ? [flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]
      : []

  const updateProtocol = (val: SelectValue) => {
    if (disabled || val.value === selectedProtocol?.value) return

    changeProtocol(val)
  }

  return (
    <View style={[...contStyle, containerStyle]}>
      <Text
        appearance="muted"
        fontSize={14}
        weight={labelWeight}
        style={direction === 'row' ? undefined : [spacings.mbMi]}
      >
        {t('Privacy Protocol')}
      </Text>
      <View style={[flexbox.directionRow, flexbox.alignCenter, viewStyle]}>
        <Select
          options={providerOptions}
          value={selectedProtocol}
          setValue={updateProtocol}
          selectStyle={{
            minWidth: 150,
            height: 'auto',
            ...spacings.pvMi,
            ...spacings.phSm,
            ...selectStyle
          }}
          testID="provider-dropdown"
          disabled={disabled}
        />
      </View>
    </View>
  )
}

export default PrivacyProtocolSelector
