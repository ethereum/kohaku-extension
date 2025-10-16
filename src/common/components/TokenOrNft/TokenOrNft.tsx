import { Contract } from 'ethers'
import React, { FC, memo, useCallback, useEffect, useMemo, useState } from 'react'

import { RPCProvider } from '@ambire-common/interfaces/provider'
import { CollectionResult, TokenResult } from '@ambire-common/libs/portfolio'
import { resolveAssetInfo } from '@ambire-common/services/assetInfo'
import { getRpcProvider } from '@ambire-common/services/provider'
import useBenzinNetworksContext from '@benzin/hooks/useBenzinNetworksContext'
import SkeletonLoader from '@common/components/SkeletonLoader'
import { useTranslation } from '@common/config/localization'
import useToast from '@common/hooks/useToast'
import { SPACING_TY } from '@common/styles/spacings'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'

import HumanizerAddress from '../HumanizerAddress'
import Nft from './components/Nft'
import Token from './components/Token'

interface Props {
  address: string
  value: bigint
  sizeMultiplierSize?: number
  textSize?: number
  chainId: bigint
  hideLinks?: boolean
}

const TokenOrNft: FC<Props> = ({
  value,
  address,
  textSize = 16,
  chainId,
  sizeMultiplierSize = 1,
  hideLinks = false
}) => {
  const marginRight = SPACING_TY * sizeMultiplierSize
  const { addToast } = useToast()
  const [assetInfo, setAssetInfo] = useState<{
    tokenInfo?: TokenResult
    nftInfo?: CollectionResult
  }>({})
  const [provider, setProvider] = useState<RPCProvider | null>(null)
  const { portfolio } = useSelectedAccountControllerState()

  const { t } = useTranslation()
  const { networks: controllerNetworks } = useNetworksControllerState()
  const { benzinNetworks, addNetwork } = useBenzinNetworksContext()
  // Component used across Benzin and Extension, make sure to always set networks
  const networks = controllerNetworks ?? benzinNetworks
  const network = useMemo(
    () => networks.find((n) => n.chainId === chainId) || null,
    [networks, chainId]
  )

  const [fallbackName, setFallbackName] = useState()

  useEffect(() => {
    if (!network) return
    const rpcUrl = network.selectedRpcUrl || network.rpcUrls[0]
    if (!provider) setProvider(getRpcProvider({ ...network, rpcUrls: [rpcUrl] }))
    return () => {
      if (provider && provider.destroy) provider.destroy()
    }
  }, [network, provider])

  const fetchFallbackNameIfNeeded = useCallback(
    async (_assetInfo: any) => {
      if (!network) return
      if (_assetInfo.nftInfo || _assetInfo.tokenInfo) return
      if (!provider) return
      const contract = new Contract(address, ['function name() view returns(string)'], provider)
      const name = await contract.name().catch(console.error)
      setFallbackName(name)
    },
    [network, address, provider]
  )

  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const timeout = setTimeout(() => setIsLoading(false), 3000)
    return () => clearTimeout(timeout)
  }, [])

  useEffect(() => {
    if (addNetwork && chainId && !network) {
      addNetwork(chainId)
      return
    }
    const tokenFromPortfolio = portfolio?.tokens?.find(
      (token) =>
        token.address.toLowerCase() === address.toLowerCase() && token.chainId === network?.chainId
    )
    const nftFromPortfolio = portfolio?.collections?.find(
      (c) => c.address.toLowerCase() === address.toLowerCase() && c.chainId === network?.chainId
    )
    if (tokenFromPortfolio || nftFromPortfolio)
      setAssetInfo({ tokenInfo: tokenFromPortfolio, nftInfo: nftFromPortfolio })
    else if (network)
      resolveAssetInfo(address, network, (_assetInfo: any) => {
        setAssetInfo(_assetInfo)
        fetchFallbackNameIfNeeded(_assetInfo).catch(console.error)
      }).catch((e) => {
        fetchFallbackNameIfNeeded({}).catch(console.error)
        console.error(e)
      })
  }, [
    fetchFallbackNameIfNeeded,
    address,
    network,
    addToast,
    portfolio?.collections,
    portfolio?.tokens,
    t,
    addNetwork,
    chainId
  ])

  if (!assetInfo.nftInfo && !assetInfo.tokenInfo)
    if (isLoading) return <SkeletonLoader width={140} height={24} appearance="tertiaryBackground" />
    // @NOTE: temporary solution as a fallback mechanism for ERC-1155 tokens which we do not support currently
    else if (fallbackName)
      return (
        <HumanizerAddress
          address={address}
          highestPriorityAlias={`${fallbackName} #${value}`}
          marginRight={marginRight}
          fontSize={textSize}
          hideLinks={hideLinks}
          chainId={chainId}
        />
      )
    else
      return (
        <Token
          textSize={textSize}
          network={network ?? undefined}
          address={address}
          amount={value}
          tokenInfo={assetInfo?.tokenInfo}
          marginRight={marginRight}
          hideLinks={hideLinks}
          chainId={chainId}
        />
      )

  if (network && assetInfo.nftInfo && !assetInfo.tokenInfo)
    return (
      <Nft
        address={address}
        network={network}
        networks={networks}
        tokenId={value}
        nftInfo={assetInfo.nftInfo}
        hideSendNft
      />
    )

  return (
    <Token
      textSize={textSize}
      network={network ?? undefined}
      address={address}
      amount={value}
      tokenInfo={assetInfo?.tokenInfo}
      marginRight={marginRight}
      hideLinks={hideLinks}
      chainId={chainId}
    />
  )
}

export default memo(TokenOrNft)
