import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatUnits, parseUnits } from 'viem'

import { AddressStateOptional } from '@ambire-common/interfaces/domains'
import { AccountOpStatus } from '@ambire-common/libs/accountOp/types'
import { getBenzinUrlParams } from '@ambire-common/utils/benzin'
import { ZERO_ADDRESS } from '@ambire-common/services/socket/constants'

import BackButton from '@common/components/BackButton'
import Text from '@common/components/Text'
import useAddressInput from '@common/hooks/useAddressInput'
import useNavigation from '@common/hooks/useNavigation'
import useToast from '@common/hooks/useToast'
import { ROUTES } from '@common/modules/router/constants/common'

import useActivityControllerState from '@web/hooks/useActivityControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useSyncedState from '@web/hooks/useSyncedState'
import usePrivacyPoolsControllerState from '@web/hooks/usePrivacyPoolsControllerState'
import useRailgunControllerState from '@web/hooks/useRailgunControllerState'
import useRailgunForm from '@web/modules/railgun/hooks/useRailgunForm'
import Buttons from '@web/modules/PPv1/deposit/components/Buttons'
import TrackProgress from '@web/modules/sign-account-op/components/OneClick/TrackProgress'
import Completed from '@web/modules/sign-account-op/components/OneClick/TrackProgress/ByStatus/Completed'
import Failed from '@web/modules/sign-account-op/components/OneClick/TrackProgress/ByStatus/Failed'
import InProgress from '@web/modules/sign-account-op/components/OneClick/TrackProgress/ByStatus/InProgress'
import useTrackAccountOp from '@web/modules/sign-account-op/hooks/OneClick/useTrackAccountOp'
import { getUiType } from '@web/utils/uiType'

import { View } from 'react-native'
import flexbox from '@common/styles/utils/flexbox'
import TransferForm from '../components/TransferForm/TransferForm'
import RailgunTransferForm from '../components/RailgunTransferForm/RailgunTransferForm'
import Tabs, { TransferTabType } from '../components/Tabs/Tabs'
import usePrivacyPoolsForm from '../../hooks/usePrivacyPoolsForm'
import { Wrapper, Content, Form } from '../components/TransfersScreen'

const { isActionWindow } = getUiType()

const TransferScreen = () => {
  const hasRefreshedAccountRef = useRef(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState<TransferTabType>('privacy-pools')
  const { dispatch } = useBackgroundService()
  const {
    chainId,
    poolInfo,
    totalApprovedBalance,
    handleUpdateForm,
    refreshPrivateAccount,
    handleMultipleWithdrawal
  } = usePrivacyPoolsForm()
  const {
    validationFormMsgs,
    addressState,
    isRecipientAddressUnknown,
    latestBroadcastedAccountOp,
    latestBroadcastedToken,
    selectedToken,
    amountFieldMode,
    withdrawalAmount,
    amountInFiat,
    programmaticUpdateCounter,
    isRecipientAddressUnknownAgreed,
    maxAmount,
    relayerQuote,
    updateQuoteStatus,
    isRefreshing
  } = usePrivacyPoolsControllerState()

  const { navigate } = useNavigation()
  const { t } = useTranslation()
  const { accountsOps } = useActivityControllerState()
  const { addToast } = useToast()

  // Railgun state
  const {
    chainId: railgunChainId,
    validationFormMsgs: railgunValidationFormMsgs,
    addressState: railgunAddressState,
    isRecipientAddressUnknown: railgunIsRecipientAddressUnknown,
    selectedToken: railgunSelectedToken,
    amountFieldMode: railgunAmountFieldMode,
    withdrawalAmount: railgunWithdrawalAmount,
    amountInFiat: railgunAmountInFiat,
    programmaticUpdateCounter: railgunProgrammaticUpdateCounter,
    isRecipientAddressUnknownAgreed: railgunIsRecipientAddressUnknownAgreed,
    maxAmount: railgunMaxAmount,
    railgunAccountsState
  } = useRailgunControllerState()

  const railgunTotalApprovedBalance = useMemo(() => {
    if (railgunAccountsState.balances.length > 0) {
      let balance = BigInt(0)
      for (const bal of railgunAccountsState.balances) {
        if (bal.tokenAddress.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
          balance += BigInt(bal.amount)
        }
      }
      return { total: balance, accounts: [] }
    }
    return { total: 0n, accounts: [] }
  }, [railgunAccountsState])

  const handleRailgunUpdateForm = useCallback(
    (params: { [key: string]: any }) => {
      dispatch({
        type: 'RAILGUN_CONTROLLER_UPDATE_FORM',
        params: { ...params }
      })
    },
    [dispatch]
  )

  // Privacy Pools state
  const controllerAmountFieldValue = amountFieldMode === 'token' ? withdrawalAmount : amountInFiat
  const [amountFieldValue, setAmountFieldValue] = useSyncedState<string>({
    backgroundState: controllerAmountFieldValue,
    updateBackgroundState: (newAmount) => {
      handleUpdateForm({ withdrawalAmount: newAmount })
    },
    forceUpdateOnChangeList: [programmaticUpdateCounter, amountFieldMode]
  })
  const [addressStateFieldValue, setAddressStateFieldValue] = useSyncedState<string>({
    backgroundState: addressState.fieldValue,
    updateBackgroundState: (newAddress: string) => {
      handleUpdateForm({ addressState: { fieldValue: newAddress } })
    },
    forceUpdateOnChangeList: [programmaticUpdateCounter]
  })

  // Railgun state syncing
  const railgunControllerAmountFieldValue =
    railgunAmountFieldMode === 'token' ? railgunWithdrawalAmount : railgunAmountInFiat
  const [railgunAmountFieldValue, setRailgunAmountFieldValue] = useSyncedState<string>({
    backgroundState: railgunControllerAmountFieldValue,
    updateBackgroundState: (newAmount) => {
      handleRailgunUpdateForm({ withdrawalAmount: newAmount })
    },
    forceUpdateOnChangeList: [railgunProgrammaticUpdateCounter, railgunAmountFieldMode]
  })
  const [railgunAddressStateFieldValue, setRailgunAddressStateFieldValue] = useSyncedState<string>({
    backgroundState: railgunAddressState.fieldValue,
    updateBackgroundState: (newAddress: string) => {
      handleRailgunUpdateForm({ addressState: { fieldValue: newAddress } })
    },
    forceUpdateOnChangeList: [railgunProgrammaticUpdateCounter]
  })

  const submittedAccountOp = useMemo(() => {
    if (latestBroadcastedAccountOp?.meta?.isPrivacyPoolsWithdrawal) {
      return latestBroadcastedAccountOp as any
    }

    if (!accountsOps.privacyPools || !latestBroadcastedAccountOp?.signature) return

    return accountsOps.privacyPools.result.items.find(
      (accOp) => accOp.signature === latestBroadcastedAccountOp.signature
    )
  }, [accountsOps.privacyPools, latestBroadcastedAccountOp])

  const navigateOut = useCallback(() => {
    if (isActionWindow) {
      dispatch({
        type: 'CLOSE_SIGNING_ACTION_WINDOW',
        params: {
          type: 'transfer'
        }
      })
    } else {
      navigate(ROUTES.pp1Home)
    }

    dispatch({
      type: 'PRIVACY_POOLS_CONTROLLER_RESET_FORM'
    })
  }, [dispatch, navigate])

  const { sessionHandler, onPrimaryButtonPress } = useTrackAccountOp({
    address: latestBroadcastedAccountOp?.accountAddr,
    chainId: latestBroadcastedAccountOp?.chainId,
    sessionId: 'privacyPools',
    submittedAccountOp,
    navigateOut
  })

  const explorerLink = useMemo(() => {
    if (!submittedAccountOp) return

    const { chainId: submittedChainId, identifiedBy, txnId } = submittedAccountOp

    if (!submittedChainId || !identifiedBy || !txnId) return

    return `https://explorer.ambire.com/${getBenzinUrlParams({
      chainId: submittedChainId,
      txnId,
      identifiedBy
    })}`
  }, [submittedAccountOp])

  useEffect(() => {
    if (!latestBroadcastedAccountOp?.accountAddr || !latestBroadcastedAccountOp?.chainId) return
    sessionHandler.initSession()

    return () => {
      sessionHandler.killSession()
    }
  }, [latestBroadcastedAccountOp?.accountAddr, latestBroadcastedAccountOp?.chainId, sessionHandler])

  const displayedView: 'transfer' | 'track' = useMemo(() => {
    if (latestBroadcastedAccountOp) return 'track'

    return 'transfer'
  }, [latestBroadcastedAccountOp])

  useEffect(() => {
    return () => {
      dispatch({
        type: 'PRIVACY_POOLS_CONTROLLER_UNLOAD_SCREEN'
      })
      dispatch({
        type: 'RAILGUN_CONTROLLER_UNLOAD_SCREEN'
      })
    }
  }, [dispatch])

  // Used to resolve ENS, not to update the field value
  const setAddressState = useCallback(
    (newPartialAddressState: AddressStateOptional) => {
      dispatch({
        type: 'PRIVACY_POOLS_CONTROLLER_UPDATE_FORM',
        params: { addressState: newPartialAddressState }
      })
    },
    [dispatch]
  )

  const handleCacheResolvedDomain = useCallback(
    (address: string, domain: string, type: 'ens') => {
      dispatch({
        type: 'DOMAINS_CONTROLLER_SAVE_RESOLVED_REVERSE_LOOKUP',
        params: {
          type,
          address,
          name: domain
        }
      })
    },
    [dispatch]
  )

  // Privacy Pools address input
  const addressInputState = useAddressInput({
    addressState,
    setAddressState,
    overwriteError: !validationFormMsgs.recipientAddress.success
      ? validationFormMsgs.recipientAddress.message
      : '',
    overwriteValidLabel: validationFormMsgs?.recipientAddress.success
      ? validationFormMsgs.recipientAddress.message
      : '',
    handleCacheResolvedDomain
  })

  // Railgun address state handlers
  const setRailgunAddressState = useCallback(
    (newPartialAddressState: AddressStateOptional) => {
      dispatch({
        type: 'RAILGUN_CONTROLLER_UPDATE_FORM',
        params: { addressState: newPartialAddressState }
      })
    },
    [dispatch]
  )

  const handleRailgunCacheResolvedDomain = useCallback(
    (address: string, domain: string, type: 'ens') => {
      dispatch({
        type: 'DOMAINS_CONTROLLER_SAVE_RESOLVED_REVERSE_LOOKUP',
        params: {
          type,
          address,
          name: domain
        }
      })
    },
    [dispatch]
  )

  const railgunAddressInputState = useAddressInput({
    addressState: railgunAddressState,
    setAddressState: setRailgunAddressState,
    overwriteError: !railgunValidationFormMsgs.recipientAddress.success
      ? railgunValidationFormMsgs.recipientAddress.message
      : '',
    overwriteValidLabel: railgunValidationFormMsgs?.recipientAddress.success
      ? railgunValidationFormMsgs.recipientAddress.message
      : '',
    handleCacheResolvedDomain: handleRailgunCacheResolvedDomain
  })

  const amountErrorMessage = useMemo(() => {
    if (!withdrawalAmount || withdrawalAmount.trim() === '') return ''
    if (!poolInfo) return ''

    try {
      const amount = parseUnits(withdrawalAmount, 18)

      if (amount < poolInfo.minWithdrawal) {
        return `Minimum transfer amount is ${formatUnits(poolInfo.minWithdrawal, 18)} ETH`
      }

      if (amount > totalApprovedBalance.total) {
        return 'Insufficient amount'
      }

      // safety check if relayer feeBPS change in future
      if (relayerQuote?.relayFeeBPS) {
        const fee = (amount * BigInt(relayerQuote.relayFeeBPS)) / 10000n

        if (amount <= fee) {
          return 'Amount too small to cover relay fees'
        }
      }

      return ''
    } catch (error) {
      return 'Invalid amount'
    }
  }, [withdrawalAmount, totalApprovedBalance.total, poolInfo, relayerQuote])

  // Privacy Pools form validation
  const isTransferFormValid = useMemo(() => {
    return !!(
      amountFieldValue &&
      amountFieldValue !== '0' &&
      selectedToken &&
      relayerQuote &&
      !addressInputState.validation.isError &&
      !amountErrorMessage &&
      !isRefreshing
    )
  }, [
    amountFieldValue,
    amountErrorMessage,
    selectedToken,
    addressInputState.validation.isError,
    relayerQuote,
    isRefreshing
  ])

  // Get totalPrivateBalancesFormatted from useRailgunForm
  const railgunForm = useRailgunForm()
  const railgunTotalPrivateBalancesFormatted = railgunForm.totalPrivateBalancesFormatted

  // Railgun amount error message
  const railgunAmountErrorMessage = useMemo(() => {
    if (!railgunWithdrawalAmount || railgunWithdrawalAmount.trim() === '') return ''
    if (!railgunSelectedToken) return ''

    try {
      // Get the balance for the selected token
      const tokenAddressLower = railgunSelectedToken.address?.toLowerCase()
      const balanceInfo = railgunTotalPrivateBalancesFormatted[tokenAddressLower]
      
      if (!balanceInfo) {
        return 'No balance available for this token'
      }

      const decimals = balanceInfo.decimals || railgunSelectedToken.decimals || 18
      const amount = parseUnits(railgunWithdrawalAmount, decimals)
      const availableBalance = BigInt(balanceInfo.amount)

      if (amount > availableBalance) {
        return 'Insufficient funds for amount'
      }

      return ''
    } catch (error) {
      return 'Invalid amount'
    }
  }, [railgunWithdrawalAmount, railgunSelectedToken, railgunTotalPrivateBalancesFormatted])

  // Railgun form validation
  const isRailgunTransferFormValid = useMemo(() => {
    return !!(
      railgunAmountFieldValue &&
      railgunAmountFieldValue !== '0' &&
      railgunSelectedToken &&
      !railgunAddressInputState.validation.isError &&
      !railgunAmountErrorMessage
    )
  }, [
    railgunAmountFieldValue,
    railgunAmountErrorMessage,
    railgunSelectedToken,
    railgunAddressInputState.validation.isError
  ])

  const onBack = useCallback(() => {
    if (activeTab === 'privacy-pools') {
      dispatch({
        type: 'PRIVACY_POOLS_CONTROLLER_RESET_FORM'
      })
    } else {
      dispatch({
        type: 'RAILGUN_CONTROLLER_RESET_FORM'
      })
    }
    navigate(ROUTES.pp1Home)
  }, [navigate, dispatch, activeTab])

  const headerTitle = t('Private Transfer')
  const formTitle = t('Send')

  const handlePrimaryButtonPress = useCallback(() => {
    if (latestBroadcastedAccountOp?.meta?.isPrivacyPoolsWithdrawal) {
      navigateOut()
    } else {
      onPrimaryButtonPress()
    }
  }, [
    latestBroadcastedAccountOp?.meta?.isPrivacyPoolsWithdrawal,
    navigateOut,
    onPrimaryButtonPress
  ])

  const handleWithdrawal = useCallback(async () => {
    setIsSubmitting(true)
    try {
      await handleMultipleWithdrawal()
    } catch (error) {
      console.error('Withdrawal error:', error)
      addToast('Unable to generate proof for transfer. Please try again.', {
        type: 'error',
        timeout: 8000
      })
      setIsSubmitting(false)
    }
  }, [handleMultipleWithdrawal, addToast])

  const handleRailgunWithdrawal = useCallback(() => {
    console.log('Railgun withdrawal - amount:', railgunWithdrawalAmount)
    console.log('Railgun withdrawal - recipient:', railgunAddressStateFieldValue)
    console.log('Railgun withdrawal - chainId:', railgunChainId)
    console.log('Railgun withdrawal - selectedToken:', railgunSelectedToken)
    // TODO: Implement actual Railgun withdrawal logic
  }, [railgunWithdrawalAmount, railgunAddressStateFieldValue, railgunChainId, railgunSelectedToken])

  const buttons = useMemo(() => {
    if (activeTab === 'railgun') {
      return (
        <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]}>
          <BackButton onPress={onBack} />
          <Buttons
            handleSubmitForm={handleRailgunWithdrawal}
            proceedBtnText={t('Send')}
            isNotReadyToProceed={!isRailgunTransferFormValid}
            signAccountOpErrors={[]}
            networkUserRequests={[]}
            isLoading={false}
          />
        </View>
      )
    }

    return (
      <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]}>
        <BackButton onPress={onBack} />
        <Buttons
          handleSubmitForm={handleWithdrawal}
          proceedBtnText={isRefreshing ? t('Updating...') : t('Send')}
          isNotReadyToProceed={!isTransferFormValid || isRefreshing}
          signAccountOpErrors={[]}
          networkUserRequests={[]}
          isLoading={isSubmitting || isRefreshing}
        />
      </View>
    )
  }, [
    onBack,
    isTransferFormValid,
    isRailgunTransferFormValid,
    t,
    isSubmitting,
    isRefreshing,
    handleWithdrawal,
    handleRailgunWithdrawal,
    activeTab
  ])

  // Refresh merkle tree and private account after successful withdrawal
  useEffect(() => {
    if (
      !hasRefreshedAccountRef.current &&
      (submittedAccountOp?.status === AccountOpStatus.Success ||
        submittedAccountOp?.status === AccountOpStatus.UnknownButPastNonce)
    ) {
      hasRefreshedAccountRef.current = true

      refreshPrivateAccount(true)
        .then(() => {
          setIsSubmitting(false)
        })
        .catch((error) => {
          // eslint-disable-next-line no-console
          console.error('Failed to refresh after withdrawal:', error)
          addToast('Failed to refresh your privacy account. Please try again.', { type: 'error' })
          setIsSubmitting(false)
        })
    }
  }, [submittedAccountOp?.status, refreshPrivateAccount, addToast])

  if (displayedView === 'track') {
    return (
      <TrackProgress onPrimaryButtonPress={handlePrimaryButtonPress} handleClose={navigateOut}>
        {submittedAccountOp?.status === AccountOpStatus.BroadcastedButNotConfirmed && (
          <InProgress title={t('Confirming your transfer')}>
            <Text fontSize={16} weight="medium" appearance="secondaryText">
              {t('Almost there!')}
            </Text>
          </InProgress>
        )}
        {(submittedAccountOp?.status === AccountOpStatus.Success ||
          submittedAccountOp?.status === AccountOpStatus.UnknownButPastNonce) && (
          <Completed
            title={t('Transfer done!')}
            titleSecondary={t('{{symbol}} delivered!', {
              symbol: latestBroadcastedToken?.symbol || 'Token'
            })}
            explorerLink={explorerLink}
            openExplorerText="View Transfer"
          />
        )}
        {(submittedAccountOp?.status === AccountOpStatus.Failure ||
          submittedAccountOp?.status === AccountOpStatus.Rejected ||
          submittedAccountOp?.status === AccountOpStatus.BroadcastButStuck) && (
          <Failed
            title={t('Something went wrong!')}
            errorMessage={t(
              "We couldn't complete your transfer. Please try again later or contact Kohaku support."
            )}
          />
        )}
      </TrackProgress>
    )
  }

  return (
    <Wrapper title={headerTitle} buttons={buttons}>
      <Content buttons={buttons}>
        <Form>
          <Tabs activeTab={activeTab} onTabChange={setActiveTab} />
          {activeTab === 'privacy-pools' ? (
            <TransferForm
              addressInputState={addressInputState}
              amountErrorMessage={amountErrorMessage}
              isRecipientAddressUnknown={isRecipientAddressUnknown}
              formTitle={formTitle}
              amountFieldValue={amountFieldValue}
              setAmountFieldValue={setAmountFieldValue}
              addressStateFieldValue={addressStateFieldValue}
              setAddressStateFieldValue={setAddressStateFieldValue}
              handleUpdateForm={handleUpdateForm}
              selectedToken={selectedToken}
              maxAmount={maxAmount || '0'}
              quoteFee={relayerQuote?.estimatedFee || '0'}
              amountFieldMode={amountFieldMode}
              amountInFiat={amountInFiat}
              isRecipientAddressUnknownAgreed={isRecipientAddressUnknownAgreed || false}
              addressState={addressState}
              controllerAmount={withdrawalAmount}
              totalApprovedBalance={totalApprovedBalance}
              updateQuoteStatus={updateQuoteStatus}
              chainId={chainId ? BigInt(chainId) : BigInt(1)}
            />
          ) : (
            <RailgunTransferForm
              addressInputState={railgunAddressInputState}
              amountErrorMessage={railgunAmountErrorMessage}
              isRecipientAddressUnknown={railgunIsRecipientAddressUnknown}
              formTitle={formTitle}
              amountFieldValue={railgunAmountFieldValue}
              setAmountFieldValue={setRailgunAmountFieldValue}
              addressStateFieldValue={railgunAddressStateFieldValue}
              setAddressStateFieldValue={setRailgunAddressStateFieldValue}
              handleUpdateForm={handleRailgunUpdateForm}
              selectedToken={railgunSelectedToken}
              maxAmount={railgunMaxAmount || '0'}
              amountFieldMode={railgunAmountFieldMode}
              amountInFiat={railgunAmountInFiat}
              isRecipientAddressUnknownAgreed={railgunIsRecipientAddressUnknownAgreed || false}
              addressState={railgunAddressState}
              controllerAmount={railgunWithdrawalAmount}
              totalApprovedBalance={railgunTotalApprovedBalance}
              totalPrivateBalancesFormatted={railgunTotalPrivateBalancesFormatted}
              chainId={railgunChainId || 11155111}
            />
          )}
        </Form>
      </Content>
    </Wrapper>
  )
}

export default React.memo(TransferScreen)
