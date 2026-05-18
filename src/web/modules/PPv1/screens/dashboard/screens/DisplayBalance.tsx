import Text from '@common/components/Text/Text'
import { View } from 'react-native'
import flexbox from '@common/styles/utils/flexbox'
import { ActiveView } from './types'

const NewDisplayBalance = ({
  activeView,
  integer,
  decimal
}: {
  activeView: ActiveView
  integer: string
  decimal?: string
}) => {
  return (
    <View style={[flexbox.directionRow, { alignItems: 'baseline' }]}>
      <Text
        fontSize={36}
        weight="number_regular"
        shouldScale={false}
        appearance="primaryText"
        // color={activeView === 'private' ? '#F9F6E9' : '#000000'}
        color="#F9F6E9"
      >
        {integer}
      </Text>
      {decimal && (
        <Text
          fontSize={20}
          weight="number_regular"
          shouldScale={false}
          appearance="secondaryText"
          color="#7F7F7F"
        >
          .{decimal}
        </Text>
      )}
    </View>
  )
}

export default NewDisplayBalance
