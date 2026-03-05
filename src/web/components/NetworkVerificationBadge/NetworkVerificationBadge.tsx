import React from 'react'
import { Pressable, View, ViewStyle } from 'react-native'

import Text from '@common/components/Text'
import Tooltip from '@common/components/Tooltip'
import useTheme from '@common/hooks/useTheme'
import useNavigation from '@common/hooks/useNavigation'

import useRpcVerificationBadgeState from './useRpcVerificationBadgeState'
import getStyles from './styles'

type Props = {
  style?: ViewStyle
  testID?: string
}

const NetworkVerificationBadge = ({ style, testID }: Props) => {
  const badge = useRpcVerificationBadgeState()
  const { styles } = useTheme(getStyles)
  const { navigate } = useNavigation()

  const tooltipId = 'rpc-verification-badge-global'

  if (badge.kind === 'hidden') return null

  const isVerified =
    badge.kind === 'helios' || badge.kind === 'colibri' || badge.kind === 'verified'
  const containerStyle = isVerified
    ? styles.verifiedContainer
    : badge.kind === 'rpc'
    ? styles.unverifiedContainer
    : styles.mixedContainer

  const dotStyle = isVerified
    ? styles.verifiedDot
    : badge.kind === 'rpc'
    ? styles.unverifiedDot
    : styles.mixedDot

  return (
    <>
      <Pressable
        testID={testID}
        style={[containerStyle, style]}
        onPress={() => navigate(badge.targetUrl)}
        // @ts-ignore missing type, but prop is valid
        dataSet={{ tooltipId }}
      >
        <View style={dotStyle} />
        <Text fontSize={12} weight="medium" style={styles.label}>
          {badge.label}
        </Text>
      </Pressable>
      <Tooltip id={tooltipId} content={badge.tooltip} />
    </>
  )
}

export default React.memo(NetworkVerificationBadge)
