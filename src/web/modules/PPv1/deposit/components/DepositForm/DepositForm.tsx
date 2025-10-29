import React, { ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { View } from 'react-native'

import ScrollableWrapper from '@common/components/ScrollableWrapper'
import Text from '@common/components/Text'
import TokenIcon from '@common/components/TokenIcon'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import { formatEther, parseEther, zeroAddress } from 'viem'
import { PoolInfo } from '@ambire-common/controllers/privacyPools/config'
import { getTokenAmount } from '@ambire-common/libs/portfolio/helpers'
import PrivacyIcon from '@common/assets/svg/PrivacyIcon'
import Select from '@common/components/Select'
import { SelectValue } from '@common/components/Select/types'
import Avatar from '@common/components/Avatar'
import { isSmartAccount } from '@ambire-common/libs/account/account'
import shortenAddress from '@ambire-common/utils/shortenAddress'
import SendToken from '../SendToken'
import styles from './styles'

const DepositForm = ({
  poolInfo,
  depositAmount,
  amountErrorMessage,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  formTitle,
  selectedToken,
  handleUpdateForm,
  chainId
}: {
  poolInfo?: PoolInfo
  depositAmount?: string
  selectedToken: any
  amountErrorMessage: string
  formTitle: string | ReactNode
  handleUpdateForm: (params: { [key: string]: any }) => void
  chainId: bigint
}) => {
  const { account: selectedAccount, portfolio: selectedAccountPortfolio } =
    useSelectedAccountControllerState()
  const { accounts } = useAccountsControllerState()
  const { dispatch } = useBackgroundService()
  const { t } = useTranslation()
  const [displayAmount, setDisplayAmount] = useState('')
  const [selectedAccountAddr, setSelectedAccountAddr] = useState<string | null>(null)

  // Filter out private account (zeroAddress)
  const regularAccounts = useMemo(
    () => accounts.filter((acc) => acc.addr !== zeroAddress),
    [accounts]
  )

  // Set initial selected account
  useEffect(() => {
    if (!selectedAccountAddr && selectedAccount && selectedAccount.addr !== zeroAddress) {
      setSelectedAccountAddr(selectedAccount.addr)
    }
  }, [selectedAccount, selectedAccountAddr])

  // Get ETH balance for the currently selected account
  // When user selects a different account in the dropdown, we immediately switch to it
  const portfolio = selectedAccountPortfolio

  const sepoliaEth = portfolio?.tokens?.find(
    (token: any) => token.chainId === chainId && token.address === zeroAddress
  )

  const ethBalance = sepoliaEth ? getTokenAmount(sepoliaEth) : 0n

  // Create account options for the selector
  const accountOptions: SelectValue[] = useMemo(() => {
    return regularAccounts.map((account) => {
      return {
        label: account.preferences.label || shortenAddress(account.addr, 10),
        value: account.addr,
        icon: <Avatar pfp={account.preferences.pfp} size={30} isSmart={isSmartAccount(account)} />
      }
    })
  }, [regularAccounts])

  const selectedAccountValue = useMemo(() => {
    return accountOptions.find((opt) => opt.value === selectedAccountAddr) || null
  }, [accountOptions, selectedAccountAddr])

  const handleAccountChange = useCallback(
    (value: SelectValue) => {
      const newAccountAddr = value.value as string
      setSelectedAccountAddr(newAccountAddr)

      // Switch to the selected account immediately to load its portfolio
      if (selectedAccount?.addr !== newAccountAddr) {
        dispatch({
          type: 'MAIN_CONTROLLER_SELECT_ACCOUNT',
          params: { accountAddr: newAccountAddr }
        })
      }

      // Reset amount when changing accounts
      setDisplayAmount('')
      handleUpdateForm({ depositAmount: '0' })
    },
    [handleUpdateForm, selectedAccount?.addr, dispatch]
  )

  const handleSetMaxAmount = () => {
    if (ethBalance && ethBalance > 0n) {
      const formattedAmount = formatEther(ethBalance)
      setDisplayAmount(formattedAmount)
      handleUpdateForm({ depositAmount: parseEther(formattedAmount).toString() })
    } else {
      setDisplayAmount('')
      handleUpdateForm({ depositAmount: '0' })
    }
  }

  const handleAmountChange = (inputValue: string) => {
    setDisplayAmount(inputValue)

    try {
      if (inputValue === '') {
        handleUpdateForm({ depositAmount: '0' })
        return
      }

      if (inputValue.endsWith('.') || inputValue === '0.' || /^\d*\.0*$/.test(inputValue)) {
        return
      }

      const numValue = parseFloat(inputValue)
      if (Number.isNaN(numValue) || numValue < 0) {
        return
      }

      const weiAmount = parseEther(inputValue)
      handleUpdateForm({ depositAmount: weiAmount.toString() })
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Invalid ETH amount entered:', inputValue)
    }
  }

  // Initialize selectedToken with default ETH token if not set
  useEffect(() => {
    if (!selectedToken && portfolio?.isReadyToVisualize && ethBalance !== undefined) {
      const defaultToken = portfolio?.tokens.find(
        (token) => token.chainId === chainId && token.address === zeroAddress
      )
      handleUpdateForm({ selectedToken: defaultToken, maxAmount: formatEther(ethBalance) })
    }
  }, [
    selectedToken,
    portfolio?.isReadyToVisualize,
    portfolio?.tokens,
    ethBalance,
    handleUpdateForm,
    chainId
  ])

  useEffect(() => {
    if (depositAmount && depositAmount !== '0') {
      try {
        setDisplayAmount(formatEther(BigInt(depositAmount)))
      } catch {
        setDisplayAmount('')
      }
    } else {
      setDisplayAmount('')
    }
  }, [depositAmount])

  if (!poolInfo) {
    return (
      <ScrollableWrapper contentContainerStyle={styles.container}>
        <View style={spacings.mbLg}>
          <Text appearance="secondaryText" fontSize={14} weight="regular" style={spacings.mbMi}>
            {t('No privacy pool available on this chain. Please switch to Sepolia testnet.')}
          </Text>
        </View>
      </ScrollableWrapper>
    )
  }

  const ethTokenIcon = (
    <TokenIcon
      key="eth-sepolia"
      containerHeight={30}
      containerWidth={30}
      networkSize={12}
      withContainer
      withNetworkIcon
      address={zeroAddress}
      chainId={chainId}
    />
  )

  const vettingFeeEth = useMemo(() => {
    // Vetting Fee in PPv1 is 1% of the deposit amount
    let vettingFeeEthValue = '0'
    try {
      if (depositAmount && depositAmount !== '0') {
        const feeWei = BigInt(depositAmount) / 100n
        vettingFeeEthValue = formatEther(feeWei)
      }
    } catch {
      vettingFeeEthValue = '0'
    }
    return vettingFeeEthValue
  }, [depositAmount])

  return (
    <ScrollableWrapper contentContainerStyle={styles.container}>
      <View>
        <Text appearance="secondaryText" fontSize={14} weight="light">
          {t('Account')}
        </Text>
        <Select
          setValue={handleAccountChange}
          options={accountOptions}
          value={selectedAccountValue}
          testID="account-select"
          bottomSheetTitle={t('Select Account')}
          searchPlaceholder={t('Search for account...')}
          emptyListPlaceholderText={t('No accounts found.')}
          mode="bottomSheet"
        />
      </View>

      <View>
        <Text appearance="secondaryText" fontSize={14} weight="light">
          {t('Amount')}
        </Text>
        <SendToken
          fromTokenOptions={[
            {
              label: `ETH (${ethBalance ? formatEther(ethBalance) : '0'})`,
              value: 'eth',
              icon: ethTokenIcon
            }
          ]}
          fromTokenValue={{
            label: 'ETH',
            value: 'eth',
            icon: ethTokenIcon
          }}
          fromAmountValue={displayAmount}
          fromTokenAmountSelectDisabled={false}
          handleChangeFromToken={() => {}}
          fromSelectedToken={sepoliaEth || null}
          fromAmount={depositAmount ? formatEther(BigInt(depositAmount)) : '0'}
          fromAmountInFiat="0"
          fromAmountFieldMode="token"
          maxFromAmount={ethBalance ? formatEther(ethBalance) : '0'}
          validateFromAmount={{ success: !amountErrorMessage, message: amountErrorMessage }}
          onFromAmountChange={handleAmountChange}
          handleSetMaxFromAmount={handleSetMaxAmount}
          inputTestId="amount-field"
          selectTestId="tokens-select"
          title=""
          maxAmountDisabled={!ethBalance || ethBalance === 0n}
        />
      </View>

      <View style={spacings.mbLg}>
        <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]}>
          <Text appearance="secondaryText" fontSize={14} weight="light">
            {t('Provider')}
          </Text>
          <View style={[flexbox.directionRow, flexbox.alignCenter]}>
            <PrivacyIcon width={15} height={15} />
            <Text fontSize={14} weight="light" style={spacings.mlMi}>
              {t('Privacy Pools')}
            </Text>
          </View>
        </View>
      </View>

      <View style={spacings.mbLg}>
        <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]}>
          <Text appearance="secondaryText" fontSize={14} weight="light">
            {t('Vetting fee')}
          </Text>
          <View style={[flexbox.directionRow, flexbox.alignCenter]}>
            <TokenIcon
              chainId={chainId}
              address={zeroAddress}
              width={20}
              height={20}
              withNetworkIcon={false}
            />
            <Text fontSize={14} weight="light" style={spacings.mlMi}>
              {vettingFeeEth} ETH
            </Text>
          </View>
        </View>
      </View>
    </ScrollableWrapper>
  )
}

export default React.memo(DepositForm)
