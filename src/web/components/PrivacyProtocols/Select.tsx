import { useMemo } from 'react'
import { StyleProp, View, ViewStyle } from 'react-native'

import Text from '@common/components/Text'
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
        <RailgunIcon width={15} height={15} />
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
        <PrivacyIcon width={15} height={15} />
        <Text fontSize={14} weight="light">
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
}

const PrivacyProtocolSelector = ({
  selectedProtocol,
  changeProtocol,
  selectStyle,
  viewStyle
}: PrivacyProtocolSelectorProps) => {
  const { t } = useTranslation()
  const providerOptions = useMemo(() => getPrivacyProtocolOptions(t), [t])

  return (
    <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]}>
      <Text appearance="secondaryText" fontSize={14} weight="light">
        {t('Privacy Protocol')}
      </Text>
      <View style={[flexbox.directionRow, flexbox.alignCenter, viewStyle]}>
        <Select
          options={providerOptions}
          value={selectedProtocol}
          setValue={changeProtocol}
          selectStyle={{ minWidth: 150, ...selectStyle }}
          testID="provider-dropdown"
        />
      </View>
    </View>
  )
}

export default PrivacyProtocolSelector
