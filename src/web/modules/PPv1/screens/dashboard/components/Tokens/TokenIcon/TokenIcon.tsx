import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Image, ImageProps, View, ViewStyle } from 'react-native'

import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import PrivacyIcon from '@common/assets/svg/PrivacyIcon'

import useBenzinNetworksContext from '@benzin/hooks/useBenzinNetworksContext'
import MissingTokenIcon from '@common/assets/svg/MissingTokenIcon'
import useTheme from '@common/hooks/useTheme'
import { BORDER_RADIUS_PRIMARY } from '@common/styles/utils/common'
import { checkIfImageExists } from '@common/utils/checkIfImageExists'
import SkeletonLoader from '@common/components/SkeletonLoader'
import { SkeletonLoaderProps } from '@common/components/SkeletonLoader/types'

import getStyles from './styles'

interface Props extends Partial<ImageProps> {
  /* supports network id or chain id */
  chainId?: bigint
  address?: string
  containerStyle?: ViewStyle
  withContainer?: boolean
  withNetworkIcon?: boolean
  containerWidth?: number
  containerHeight?: number
  width?: number
  height?: number
  onGasTank?: boolean
  networkSize?: number
  uri?: string
  networkWrapperStyle?: ViewStyle
  skeletonAppearance?: SkeletonLoaderProps['appearance']
}

enum UriStatus {
  UNKNOWN = 'UNKNOWN',
  IMAGE_MISSING = 'IMAGE_MISSING',
  IMAGE_EXISTS = 'IMAGE_EXISTS'
}

const TokenIcon: React.FC<Props> = ({
  chainId,
  address = '',
  uri: fallbackUri,
  withContainer = false,
  withNetworkIcon = true,
  containerWidth = 34,
  containerHeight = 34,
  containerStyle,
  width = 20,
  height = 20,
  onGasTank = false,
  networkSize = 14,
  networkWrapperStyle,
  skeletonAppearance = 'primaryBackground',
  ...props
}) => {
  const { styles, theme } = useTheme(getStyles)
  const [uriStatus, setUriStatus] = useState<UriStatus>(UriStatus.UNKNOWN)
  const [imageUrl, setImageUrl] = useState<string | undefined>()
  const { networks: controllerNetworks } = useNetworksControllerState()
  const { benzinNetworks } = useBenzinNetworksContext()
  // Component used across Benzin and Extension, make sure to always set networks
  const networks = controllerNetworks ?? benzinNetworks

  const network = useMemo(
    () => networks.find((n) => String(n.chainId) === String(chainId)),
    [chainId, networks]
  )

  const handleImageLoaded = useCallback(() => setUriStatus(UriStatus.IMAGE_EXISTS), [])
  const attemptToLoadFallbackImage = useCallback(async () => {
    if (fallbackUri) {
      const doesFallbackUriImageExists = await checkIfImageExists(fallbackUri)
      if (doesFallbackUriImageExists) {
        setImageUrl(fallbackUri)
        setUriStatus(UriStatus.IMAGE_EXISTS)
        return
      }
    }

    setUriStatus(UriStatus.IMAGE_MISSING)
    setImageUrl(undefined)
  }, [fallbackUri])

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    ;(async () => {
      const hasAmbireUriRequiredData = !!(network?.platformId && address)
      if (hasAmbireUriRequiredData) {
        const ambireUri = `https://cena.ambire.com/iconProxy/${network.platformId}/${address}`
        // Skip checking if the this image exists for optimizing network calls.
        // Although the `checkIfImageExists` only retrieves headers (which is
        // quick), in the cast majority of cases, the (default) ambire URI will exist.
        // const doesAmbireUriImageExists = await checkIfImageExists(ambireUri)
        setImageUrl(ambireUri)
        setUriStatus(UriStatus.IMAGE_EXISTS)
        return
      }

      await attemptToLoadFallbackImage()
    })()
  }, [address, network?.platformId, fallbackUri, attemptToLoadFallbackImage, network])

  const memoizedContainerStyle = useMemo(
    () => [
      {
        width: withContainer ? containerWidth : width,
        height: withContainer ? containerHeight : height
      },
      withContainer && styles.withContainerStyle,
      withContainer && withNetworkIcon && { borderTopLeftRadius: 7 },
      containerStyle
    ],
    [
      containerStyle,
      withContainer,
      withNetworkIcon,
      containerWidth,
      width,
      containerHeight,
      height,
      styles.withContainerStyle
    ]
  )

  // Always show Privacy Pools badge instead of network icon
  const shouldDisplayPrivacyPoolsBadge = withNetworkIcon && !onGasTank

  return (
    <View style={memoizedContainerStyle}>
      {uriStatus === UriStatus.UNKNOWN ? (
        <SkeletonLoader
          width={width}
          height={height}
          style={styles.loader}
          appearance={skeletonAppearance}
        />
      ) : uriStatus === UriStatus.IMAGE_MISSING ? (
        <MissingTokenIcon
          width={withContainer ? containerWidth : width}
          height={withContainer ? containerHeight : height}
        />
      ) : (
        <Image
          source={{ uri: imageUrl }}
          style={{ width, height, borderRadius: BORDER_RADIUS_PRIMARY }}
          // Just in case the URI is valid and image exists, but still fails to load
          onError={attemptToLoadFallbackImage}
          onLoad={handleImageLoaded}
          {...props}
        />
      )}
      {shouldDisplayPrivacyPoolsBadge && (
        <View
          style={[
            styles.networkIconWrapper,
            withContainer ? { right: -1, bottom: -1 } : { left: -4, top: -4 },
            networkWrapperStyle
          ]}
        >
          <PrivacyIcon width={9} height={9} />
        </View>
      )}
    </View>
  )
}

export default React.memo(TokenIcon)
