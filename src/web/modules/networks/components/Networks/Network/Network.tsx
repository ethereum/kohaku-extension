import React, { FC, useCallback } from 'react'
import { Pressable, View } from 'react-native'

import formatDecimals from '@ambire-common/utils/formatDecimals/formatDecimals'
import KebabMenuIcon from '@common/assets/svg/KebabMenuIcon'
import OpenIcon from '@common/assets/svg/OpenIcon'
import NetworkIcon from '@common/components/NetworkIcon'
import Text from '@common/components/Text'
import Tooltip from '@common/components/Tooltip'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import { THEME_TYPES } from '@common/styles/themeConfig'
import flexbox from '@common/styles/utils/flexbox'
import { AnimatedPressable, DURATIONS, useCustomHover, useMultiHover } from '@web/hooks/useHover'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import { NO_BLOCK_EXPLORER_AVAILABLE_TOOLTIP } from '@web/modules/networks/components/NetworkBottomSheet'
import getStyles from '@web/modules/networks/screens/styles'

interface Props {
  chainId: bigint | string
  openBlockExplorer: (url?: string) => void
  openSettingsBottomSheet: (chainId: bigint | string) => void
  onPress: (chainId: bigint | string) => void
}

const Network: FC<Props> = ({ chainId, openBlockExplorer, openSettingsBottomSheet, onPress }) => {
  const { themeType, theme, styles } = useTheme(getStyles)
  const { networks } = useNetworksControllerState()
  const { portfolio, dashboardNetworkFilter } = useSelectedAccountControllerState()
  const [bindAnim, animStyle, isHovered, triggerHover] = useMultiHover({
    values: [
      {
        property: 'backgroundColor',
        from: `${String(theme.secondaryBackground)}00`,
        to: theme.secondaryBackground
      },
      {
        property: 'borderColor',
        from:
          themeType === THEME_TYPES.DARK
            ? `${String(theme.primaryLight)}00`
            : `${String(theme.secondaryBorder)}`,
        to: themeType === THEME_TYPES.DARK ? theme.primaryLight80 : theme.secondaryBorder
      }
    ],
    forceHoveredStyle: dashboardNetworkFilter === chainId
  })
  const isInternalNetwork = chainId === 'rewards' || chainId === 'gasTank'
  // Doesn't have to be binded
  const [, explorerIconAnimStyle] = useCustomHover({
    property: 'opacity',
    values: {
      from: 0,
      to: 1
    },
    forceHoveredStyle: (isHovered || dashboardNetworkFilter === chainId) && !isInternalNetwork,
    duration: DURATIONS.REGULAR
  })

  const networkData = networks.find((n) => n.chainId.toString() === chainId)
  const isBlockExplorerMissing = !networkData?.explorerUrl
  const tooltipBlockExplorerMissingId = `tooltip-for-block-explorer-missing-${chainId}`
  const handleOpenBlockExplorer = useCallback(async () => {
    if (isBlockExplorerMissing) return

    await openBlockExplorer(networkData?.explorerUrl)
  }, [networkData, openBlockExplorer, isBlockExplorerMissing])

  const networkBalance = portfolio.balancePerNetwork[chainId.toString()] || 0
  let networkName = networkData?.name

  if (chainId === 'rewards') {
    networkName = 'Ambire Rewards'
  } else if (chainId === 'gasTank') {
    networkName = 'Gas Tank'
  }

  const handleOnPress = useCallback(() => {
    onPress(chainId)
  }, [chainId, onPress])

  return (
    <AnimatedPressable
      key={chainId.toString()}
      onPress={handleOnPress}
      style={[styles.network, isInternalNetwork ? styles.noKebabNetwork : {}, animStyle]}
      {...bindAnim}
    >
      <View style={[flexbox.alignCenter, flexbox.directionRow]}>
        <NetworkIcon size={32} id={chainId.toString()} />
        <Text style={spacings.mlTy} fontSize={16}>
          {networkName}
        </Text>
        <AnimatedPressable
          onPress={handleOpenBlockExplorer}
          // @ts-ignore missing type, but the prop is valid
          dataSet={{
            tooltipId: tooltipBlockExplorerMissingId,
            tooltipContent: NO_BLOCK_EXPLORER_AVAILABLE_TOOLTIP
          }}
          style={[spacings.mlSm, explorerIconAnimStyle]}
          onHoverIn={triggerHover}
        >
          {({ hovered }: any) => (
            <OpenIcon
              width={16}
              height={16}
              color={hovered ? theme.primaryText : theme.secondaryText}
              style={isBlockExplorerMissing && { opacity: 0.4 }}
            />
          )}
        </AnimatedPressable>
        {isBlockExplorerMissing && <Tooltip id={tooltipBlockExplorerMissingId} />}
      </View>
      <View style={[flexbox.alignCenter, flexbox.directionRow]}>
        <Text fontSize={dashboardNetworkFilter === chainId ? 20 : 16} weight="semiBold">
          {`${formatDecimals(networkBalance, 'value')}` || '$-'}
        </Text>
        {!isInternalNetwork && (
          <Pressable
            onHoverIn={triggerHover}
            onPress={() => openSettingsBottomSheet(chainId)}
            style={spacings.mlSm}
          >
            {({ hovered }: any) => (
              <KebabMenuIcon
                width={16}
                height={16}
                color={hovered ? theme.primaryText : theme.secondaryText}
              />
            )}
          </Pressable>
        )}
      </View>
    </AnimatedPressable>
  )
}

export default React.memo(Network)
