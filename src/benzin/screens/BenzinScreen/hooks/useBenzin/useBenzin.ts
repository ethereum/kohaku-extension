import { useCallback, useEffect, useMemo, useState } from 'react'
import { Linking } from 'react-native'

import { allBundlers, BUNDLER } from '@ambire-common/consts/bundlers'
import {
  AccountOpIdentifiedBy,
  SubmittedAccountOp
} from '@ambire-common/libs/accountOp/submittedAccountOp'
import { relayerCall } from '@ambire-common/libs/relayerCall/relayerCall'
import { getDefaultBundler } from '@ambire-common/services/bundlers/getBundler'
import { getRpcProvider } from '@ambire-common/services/provider'
import { getBenzinUrlParams } from '@ambire-common/utils/benzin'
import useBenzinNetworksContext from '@benzin/hooks/useBenzinNetworksContext'
import useSteps from '@benzin/screens/BenzinScreen/hooks/useSteps'
import { ActiveStepType } from '@benzin/screens/BenzinScreen/interfaces/steps'
import useRoute from '@common/hooks/useRoute'
import useToast from '@common/hooks/useToast'
import { setStringAsync } from '@common/utils/clipboard'
import { RELAYER_URL } from '@env'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'

const fetch = window.fetch.bind(window) as any
const standardOptions = {
  fetch,
  callRelayer: relayerCall.bind({ url: RELAYER_URL, fetch })
}

interface Props {
  onOpenExplorer?: () => void
  extensionAccOp?: SubmittedAccountOp
}

const getParams = (search?: string) => {
  const params = new URLSearchParams(search)

  return {
    txnId: params.get('txnId') ?? null,
    userOpHash: params.get('userOpHash') ?? null,
    relayerId: params.get('relayerId') ?? null,
    isRenderedInternally: typeof params.get('isInternal') === 'string',
    chainId: params.get('chainId'),
    bundler: params.get('bundler') ?? null
  }
}

const useBenzin = ({ onOpenExplorer, extensionAccOp }: Props = {}) => {
  const { addToast } = useToast()
  const route = useRoute()
  const { txnId, userOpHash, relayerId, isRenderedInternally, chainId, bundler } = getParams(
    route?.search
  )

  const { networks } = useNetworksControllerState()
  const { benzinNetworks, loadingBenzinNetworks = [], addNetwork } = useBenzinNetworksContext()
  const bigintChainId = BigInt(chainId || '') || 0n
  const actualNetworks = networks ?? benzinNetworks
  const areRelayerNetworksLoaded = actualNetworks && actualNetworks.length
  const network = actualNetworks.find((n) => n.chainId === bigintChainId) || null
  const provider =
    network && chainId ? getRpcProvider({ ...network, chainId: bigintChainId }) : null
  const isNetworkLoading = loadingBenzinNetworks.includes(bigintChainId)
  const [activeStep, setActiveStep] = useState<ActiveStepType>('signed')
  const isInitialized = !isNetworkLoading && areRelayerNetworksLoaded

  const userOpBundler = useMemo(() => {
    if (bundler && allBundlers.includes(bundler)) return bundler as BUNDLER
    if (!network) return undefined
    return getDefaultBundler(network).getName()
  }, [bundler, network])

  const stepsState = useSteps({
    txnId,
    userOpHash,
    relayerId,
    network,
    standardOptions,
    setActiveStep,
    provider,
    bundler: userOpBundler,
    extensionAccOp,
    networks: actualNetworks
  })

  const identifiedBy: AccountOpIdentifiedBy = useMemo(() => {
    if (relayerId) return { type: 'Relayer', identifier: relayerId }
    if (userOpHash) return { type: 'UserOperation', identifier: userOpHash, bundler: userOpBundler }
    return { type: 'Transaction', identifier: txnId as string }
  }, [relayerId, userOpHash, txnId, userOpBundler])

  useEffect(() => {
    if (areRelayerNetworksLoaded && !network && bigintChainId) {
      addNetwork(bigintChainId)
    }
  }, [bigintChainId, network, isNetworkLoading, addNetwork, areRelayerNetworksLoaded])

  const handleCopyText = useCallback(async () => {
    try {
      let address = window.location.href

      if (chainId) {
        address = `https://explorer.ambire.com/${getBenzinUrlParams({
          chainId,
          txnId: stepsState.txnId,
          identifiedBy
        })}`
      }

      await setStringAsync(address)
    } catch {
      addToast('Error copying to clipboard', { type: 'error' })
    }
    addToast('Copied to clipboard!')
  }, [addToast, chainId, stepsState.txnId, identifiedBy])

  const handleOpenExplorer = useCallback(async () => {
    if (!network?.explorerUrl) return

    const link = stepsState.txnId
      ? `${network.explorerUrl}/tx/${stepsState.txnId}`
      : `https://jiffyscan.xyz/userOpHash/${userOpHash}?network=${network.name.toLowerCase()}`

    try {
      await Linking.openURL(link)
    } catch {
      addToast('Error opening explorer', { type: 'error' })
    }
    onOpenExplorer && onOpenExplorer()
  }, [network, userOpHash, stepsState.txnId, onOpenExplorer, addToast])

  const showCopyBtn = useMemo(() => {
    if (!network) return true

    const isRejected = stepsState.finalizedStatus?.status === 'rejected'
    return !isRejected
  }, [network, stepsState.finalizedStatus?.status])

  const showOpenExplorerBtn = useMemo(() => {
    if (!network) return false
    // do not show the button until a txId is confirmed
    if (!stepsState.txnId) return false

    const isRejected = stepsState.finalizedStatus?.status === 'rejected'
    return !isRejected
  }, [network, stepsState.finalizedStatus?.status, stepsState.txnId])

  if (!chainId || (!txnId && !userOpHash && !relayerId)) return null

  return {
    activeStep,
    handleCopyText,
    handleOpenExplorer,
    stepsState,
    network,
    txnId: stepsState.txnId,
    userOpHash,
    isRenderedInternally,
    showCopyBtn,
    showOpenExplorerBtn,
    isInitialized
  }
}

export default useBenzin
