import React, { FC, memo } from 'react'
import { StyleProp, View, ViewStyle } from 'react-native'

import { IrCall } from '@ambire-common/libs/humanizer/interfaces'
import HumanizerAddress from '@common/components/HumanizerAddress'
import Text from '@common/components/Text'
import TokenOrNft from '@common/components/TokenOrNft'
import useTheme from '@common/hooks/useTheme'
import spacings, { SPACING_SM, SPACING_TY } from '@common/styles/spacings'
import { BORDER_RADIUS_PRIMARY } from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'
import ImageIcon from '@web/assets/svg/ImageIcon'
import ManifestImage from '@web/components/ManifestImage'

import { COLLECTIBLE_SIZE } from '../Collectible/styles'
import ChainVisualization from './ChainVisualization/ChainVisualization'
import DeadlineItem from './DeadlineItem'

function stopPropagation(e: React.MouseEvent) {
  e.stopPropagation()
}

interface Props {
  data: IrCall['fullVisualization']
  sizeMultiplierSize?: number
  textSize?: number
  chainId: bigint
  isHistory?: boolean
  testID?: string
  hasPadding?: boolean
  imageSize?: number
  hideLinks?: boolean
  style?: StyleProp<ViewStyle>
}

const HumanizedVisualization: FC<Props> = ({
  data = [],
  sizeMultiplierSize = 1,
  textSize = 16,
  chainId,
  isHistory,
  testID,
  hasPadding = true,
  imageSize = 36,
  hideLinks = false,
  style
}) => {
  const marginRight = SPACING_TY * sizeMultiplierSize
  const { theme } = useTheme()
  return (
    <View
      testID={testID}
      style={[
        flexbox.flex1,
        flexbox.directionRow,
        flexbox.alignCenter,
        flexbox.wrap,
        {
          marginHorizontal: hasPadding ? SPACING_SM * sizeMultiplierSize : 0
        },
        style
      ]}
    >
      {data.map((item) => {
        if (!item || item.isHidden) return null
        const key = item.id
        if (item.type === 'token') {
          return (
            <TokenOrNft
              key={key}
              sizeMultiplierSize={sizeMultiplierSize}
              value={item.value}
              address={item.address!}
              textSize={textSize}
              chainId={chainId}
              hideLinks={hideLinks}
            />
          )
        }

        if (item.type === 'address' && item.address) {
          return (
            <View key={key} style={{ marginRight }}>
              <HumanizerAddress fontSize={textSize} address={item.address} chainId={chainId} />
            </View>
          )
        }

        if (item.type === 'deadline' && item.value && !isHistory)
          return (
            <DeadlineItem
              key={key}
              deadline={item.value}
              textSize={textSize}
              marginRight={marginRight}
            />
          )
        if (item.type === 'chain' && item.chainId)
          return (
            <ChainVisualization
              chainId={item.chainId}
              key={key}
              marginRight={marginRight}
              hideLinks={hideLinks}
            />
          )

        if (item.type === 'image' && item.content) {
          return (
            <ManifestImage
              key={key}
              uri={item.content}
              containerStyle={spacings.mrSm}
              size={imageSize}
              skeletonAppearance="primaryBackground"
              fallback={() => (
                <View
                  style={[
                    flexbox.flex1,
                    flexbox.center,
                    { backgroundColor: theme.primaryBackground, width: '100%' }
                  ]}
                >
                  <ImageIcon
                    color={theme.secondaryText}
                    width={COLLECTIBLE_SIZE / 2}
                    height={COLLECTIBLE_SIZE / 2}
                  />
                </View>
              )}
              imageStyle={{
                borderRadius: BORDER_RADIUS_PRIMARY,
                backgroundColor: 'transparent',
                marginRight: 0
              }}
            />
          )
        }
        if (item.type === 'link' && !hideLinks) {
          return (
            <a
              onClick={stopPropagation}
              style={{ maxWidth: '100%', marginRight }}
              key={key}
              href={item.url!}
            >
              <Text fontSize={textSize} weight="semiBold" appearance="successText">
                {item.content}
              </Text>
            </a>
          )
        }
        if (item.content) {
          return (
            <Text
              key={key}
              style={{ maxWidth: '100%', marginRight }}
              fontSize={textSize}
              weight={item.isBold || item.type === 'action' ? 'semiBold' : 'regular'}
              appearance={
                item.warning
                  ? 'warningText'
                  : item.type === 'label'
                  ? 'secondaryText'
                  : item.type === 'action'
                  ? 'successText'
                  : 'primaryText'
              }
            >
              {item.content}
            </Text>
          )
        }

        return null
      })}
    </View>
  )
}

export default memo(HumanizedVisualization)
