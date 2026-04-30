import { isHexString } from 'ethers'
import React, { FC, useEffect, useMemo, useState } from 'react'
import { View } from 'react-native'

import { SigningStatus } from '@ambire-common/controllers/signAccountOp/signAccountOp'
import { Network } from '@ambire-common/interfaces/network'
import { isSmartAccount } from '@ambire-common/libs/account/account'
import { has7702DelegationRequest } from '@ambire-common/libs/accountOp/delegation'
import { ZERO_ADDRESS } from '@ambire-common/services/socket/constants'
import SuccessIcon from '@common/assets/svg/SuccessIcon'
import Alert from '@common/components/Alert'
import ScrollableWrapper from '@common/components/ScrollableWrapper'
import Text from '@common/components/Text'
import Nft from '@common/components/TokenOrNft/components/Nft'
import { Trans, useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import useSignAccountOpControllerState from '@web/hooks/useSignAccountOpControllerState'
import PendingTokenSummary from '@web/modules/sign-account-op/components/PendingTokenSummary'

import SimulationSkeleton from './SimulationSkeleton'
import getStyles from './styles'

interface Props {
  network?: Network
  // marks whether the estimation has been done regardless
  // of whether the estimation returned an error or not
  isEstimationComplete: boolean
  isViewOnly: boolean
}

const Simulation: FC<Props> = ({ network, isEstimationComplete, isViewOnly }) => {
  const { t } = useTranslation()
  const { styles, theme } = useTheme(getStyles)
  const signAccountOpState = useSignAccountOpControllerState()
  const {
    portfolio: { tokens, collections, pending, networkSimulatedAccountOp }
  } = useSelectedAccountControllerState()
  const [initialSimulationLoaded, setInitialSimulationLoaded] = useState(false)
  const [shouldRespectIsLoading, setShouldRespectIsLoading] = useState(true)
  const { networks } = useNetworksControllerState()

  const pendingTokens = useMemo(() => {
    if (signAccountOpState?.accountOp && network) {
      const pendingData = pending[network.chainId.toString()]

      if (!pendingData || !pendingData.isReady || !pendingData.result) return []

      return tokens.filter((token) => token.chainId === network.chainId && !!token.simulationAmount)
    }
    return []
  }, [network, pending, signAccountOpState?.accountOp, tokens])

  const portfolioStatePending = useMemo(() => {
    if (!signAccountOpState?.accountOp || !network?.chainId) return null

    return pending[network.chainId.toString()]
  }, [network?.chainId, pending, signAccountOpState?.accountOp])

  const pendingSendTokens = useMemo(
    () => pendingTokens.filter((token) => token.simulationAmount! < 0),
    [pendingTokens]
  )
  const pendingSendCollection = useMemo(() => {
    if (signAccountOpState?.accountOp?.accountAddr && network?.chainId)
      return (
        collections?.filter(
          (i) => i.postSimulation?.sending && i.postSimulation.sending.length > 0
        ) || []
      )
    return []
  }, [collections, network?.chainId, signAccountOpState?.accountOp?.accountAddr])

  const pendingReceiveCollection = useMemo(() => {
    if (signAccountOpState?.accountOp?.accountAddr && network?.chainId)
      return (
        collections?.filter(
          (i) => i.postSimulation?.receiving && i.postSimulation.receiving.length > 0
        ) || []
      )
    return []
  }, [signAccountOpState?.accountOp?.accountAddr, network?.chainId, collections])

  const pendingReceiveTokens = useMemo(
    () => pendingTokens.filter((token) => token.simulationAmount! > 0),
    [pendingTokens]
  )

  const simulationErrorMsg = useMemo(() => {
    if (portfolioStatePending?.isLoading && !initialSimulationLoaded) return ''

    if (portfolioStatePending?.criticalError) {
      if (isHexString(portfolioStatePending?.criticalError.simulationErrorMsg)) {
        return `Please report this error to our team: ${portfolioStatePending?.criticalError.simulationErrorMsg}`
      }
      return portfolioStatePending?.criticalError.simulationErrorMsg || 'Unknown error'
    }

    const simulationError = portfolioStatePending?.errors.find((err) => err.simulationErrorMsg)
    if (simulationError) {
      if (isHexString(simulationError)) {
        return `Please report this error to our team: ${simulationError.simulationErrorMsg}`
      }
      return simulationError.simulationErrorMsg
    }

    return ''
  }, [
    initialSimulationLoaded,
    portfolioStatePending?.criticalError,
    portfolioStatePending?.errors,
    portfolioStatePending?.isLoading
  ])

  const haveCallsChanged = useMemo(() => {
    if (!network?.chainId || !initialSimulationLoaded) return false

    const portfolioAccountOpCalls = networkSimulatedAccountOp[String(network.chainId)]?.calls
    const signAccountOpCalls = signAccountOpState?.accountOp.calls

    // If the portfolio state has no calls and there is a simulation error,
    // it means that the simulation is not reloading
    if (!portfolioAccountOpCalls && simulationErrorMsg) return false

    // New calls are reflected immediately in the signAccountOpState,
    // while the portfolio update takes some time to reflect the changes.
    // The interval between the two updates is the time it takes for the
    // simulation to reload.
    return portfolioAccountOpCalls?.length !== signAccountOpCalls?.length
  }, [
    initialSimulationLoaded,
    network?.chainId,
    networkSimulatedAccountOp,
    signAccountOpState?.accountOp.calls,
    simulationErrorMsg
  ])

  useEffect(() => {
    if (haveCallsChanged) setShouldRespectIsLoading(true)
  }, [haveCallsChanged])

  useEffect(() => {
    if (!portfolioStatePending) return
    if (!portfolioStatePending.isLoading) setShouldRespectIsLoading(false)
  }, [portfolioStatePending])

  const isReloading = useMemo(() => {
    if (!network?.chainId || !initialSimulationLoaded) return false
    if (!isEstimationComplete) return true
    return false
  }, [initialSimulationLoaded, isEstimationComplete, network?.chainId])

  const shouldShowLoader = useMemo(
    () =>
      (!!portfolioStatePending?.isLoading && shouldRespectIsLoading) ||
      isReloading ||
      !signAccountOpState?.isInitialized,
    [
      shouldRespectIsLoading,
      isReloading,
      portfolioStatePending?.isLoading,
      signAccountOpState?.isInitialized
    ]
  )

  const simulationView:
    | 'no-changes'
    | 'changes'
    | 'error'
    | 'error-handled-elsewhere'
    | 'simulation-not-supported'
    | null = useMemo(() => {
    if (shouldShowLoader || !signAccountOpState?.isInitialized) return null

    // If the user is view only we are not displaying the error elsewhere
    // thus we have to show it in the Simulation
    if (signAccountOpState.status?.type === SigningStatus.EstimationError && !isViewOnly)
      return 'error-handled-elsewhere'

    if (simulationErrorMsg) return 'error'

    if (pendingSendCollection.length || pendingReceiveCollection.length || pendingTokens.length)
      return 'changes'

    const isDelegationOnlyTxn =
      has7702DelegationRequest(signAccountOpState.accountOp) &&
      signAccountOpState.accountOp.calls.length === 1 &&
      signAccountOpState.accountOp.calls[0]?.to === ZERO_ADDRESS &&
      signAccountOpState.accountOp.calls[0]?.data === '0x' &&
      signAccountOpState.accountOp.calls[0]?.value === 0n

    if (isDelegationOnlyTxn) return 'no-changes'

    // no-changes from here
    if (!isSmartAccount(signAccountOpState.account) && !!network?.rpcNoStateOverride)
      return 'simulation-not-supported'

    return 'no-changes'
  }, [
    shouldShowLoader,
    signAccountOpState?.isInitialized,
    signAccountOpState?.status?.type,
    signAccountOpState?.account,
    isViewOnly,
    simulationErrorMsg,
    pendingSendCollection.length,
    pendingReceiveCollection.length,
    pendingTokens.length,
    network?.rpcNoStateOverride,
    signAccountOpState?.accountOp
  ])

  useEffect(() => {
    if (simulationView && !initialSimulationLoaded) {
      setInitialSimulationLoaded(true)
    }
  }, [initialSimulationLoaded, simulationView])

  return (
    <View style={styles.simulationSection}>
      {simulationView === 'changes' && (
        <View style={[flexbox.directionRow, flexbox.flex1]}>
          {(!!pendingSendTokens.length || !!pendingSendCollection.length) && (
            <View
              style={[styles.simulationContainer, !!pendingReceiveTokens.length && spacings.mrTy]}
            >
              <View style={styles.simulationContainerHeader}>
                <Text fontSize={14} appearance="secondaryText" numberOfLines={1}>
                  {t('Assets out')}
                </Text>
              </View>
              <ScrollableWrapper
                style={styles.simulationScrollView}
                contentContainerStyle={{ flexGrow: 1 }}
              >
                {pendingSendTokens?.map((token, i) => {
                  return (
                    <PendingTokenSummary
                      key={token.address}
                      token={token}
                      chainId={network?.chainId}
                      hasBottomSpacing={i < pendingTokens.length - 1}
                    />
                  )
                })}
                {pendingSendCollection
                  .map(({ name, postSimulation, address }) =>
                    postSimulation?.sending?.map((itemId: bigint) => {
                      if (!network) return null

                      return (
                        <Nft
                          key={address + itemId}
                          tokenId={itemId}
                          network={network}
                          networks={networks}
                          address={address}
                          nftInfo={{
                            name
                          }}
                          hideSendNft
                          style={spacings.mbMi}
                        />
                      )
                    })
                  )
                  .flat()}
              </ScrollableWrapper>
            </View>
          )}
          {(!!pendingReceiveTokens.length || !!pendingReceiveCollection.length) && (
            <View style={[styles.simulationContainer, spacings.mlTy]}>
              <View style={styles.simulationContainerHeader}>
                <Text fontSize={14} appearance="secondaryText" numberOfLines={1}>
                  {t('Assets in')}
                </Text>
              </View>
              <ScrollableWrapper
                style={styles.simulationScrollView}
                contentContainerStyle={{ flexGrow: 1 }}
              >
                {pendingReceiveTokens?.map((token, i) => {
                  return (
                    <PendingTokenSummary
                      key={token.address}
                      token={token}
                      chainId={network?.chainId}
                      hasBottomSpacing={
                        i < pendingTokens.length - 1 || pendingReceiveCollection.length > 0
                      }
                    />
                  )
                })}
                {pendingReceiveCollection
                  .map(({ name, postSimulation, address }) =>
                    postSimulation?.receiving?.map((itemId: bigint) => {
                      if (!network) return null

                      return (
                        <Nft
                          key={address + itemId}
                          tokenId={itemId}
                          network={network}
                          networks={networks}
                          address={address}
                          nftInfo={{
                            name
                          }}
                          hideSendNft
                          style={spacings.mbMi}
                        />
                      )
                    })
                  )
                  .flat()}
              </ScrollableWrapper>
            </View>
          )}
        </View>
      )}

      {simulationView === 'error-handled-elsewhere' && (
        <Alert
          type="info"
          title={t('The simulation could not be completed because of the transaction problem.')}
        />
      )}

      {simulationView === 'error' && (
        <Alert type="error" title={t('Unable to simulate the transaction. Proceed with caution')} />
      )}
      {simulationView === 'no-changes' && (
        <View style={[flexbox.directionRow, flexbox.flex1, flexbox.alignCenter]}>
          <SuccessIcon color={theme.successDecorative} />
          <Text
            color={theme.successDecorative}
            style={spacings.mlSm}
            fontSize={16}
            appearance="secondaryText"
            numberOfLines={1}
          >
            {t('No token balance changes detected')}
          </Text>
        </View>
      )}
      {simulationView === 'simulation-not-supported' && (
        <Alert
          type="warning"
          isTypeLabelHidden
          title={
            <Trans>
              The RPC cannot perform simulations for EOA accounts. Try changing the RPC from
              Settings. If you wish to proceed regardless, please carefully review the transaction
              preview below.
            </Trans>
          }
        />
      )}
      {shouldShowLoader && <SimulationSkeleton />}
    </View>
  )
}

export default React.memo(Simulation)
