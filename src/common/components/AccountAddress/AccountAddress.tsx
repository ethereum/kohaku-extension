import React, { FC } from 'react'
import { View } from 'react-native'

import Text from '@common/components/Text'
import useReverseLookup from '@common/hooks/useReverseLookup'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'

import { zeroAddress } from 'viem'
import SkeletonLoader from '../SkeletonLoader'
import { SkeletonLoaderProps } from '../SkeletonLoader/types'
import PlainAddress from './PlainAddress'
import PlainAddressWithCopy from './PlainAddressWithCopy'

interface Props extends ReturnType<typeof useReverseLookup> {
  address: string
  plainAddressMaxLength?: number
  withCopy?: boolean
  skeletonAppearance?: SkeletonLoaderProps['appearance']
}

const AccountAddress: FC<Props> = ({
  isLoading,
  ens,
  address,
  plainAddressMaxLength = 42,
  withCopy = true,
  skeletonAppearance
}) => {
  if (isLoading) {
    return <SkeletonLoader width={200} height={18} appearance={skeletonAppearance} />
  }

  return (
    address !== zeroAddress && (
      <View style={[flexbox.flex1, { height: 18 }]} testID="address">
        {ens ? (
          <View style={[flexbox.flex1, flexbox.directionRow, flexbox.alignCenter]}>
            <Text fontSize={12} weight="semiBold" appearance="primary" numberOfLines={1}>
              {ens}
            </Text>
            {withCopy ? (
              <PlainAddressWithCopy maxLength={18} address={address} style={spacings.mlMi} />
            ) : (
              <PlainAddress maxLength={18} address={address} style={spacings.mlMi} />
            )}
          </View>
        ) : withCopy ? (
          <PlainAddressWithCopy
            maxLength={plainAddressMaxLength}
            address={address}
            hideParentheses
          />
        ) : (
          <PlainAddress maxLength={plainAddressMaxLength} address={address} hideParentheses />
        )}
      </View>
    )
  )
}

export default React.memo(AccountAddress)
