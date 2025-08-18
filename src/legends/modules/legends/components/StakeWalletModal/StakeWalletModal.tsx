import {
  AbiCoder,
  BrowserProvider,
  Contract,
  formatUnits,
  Interface,
  JsonRpcProvider,
  keccak256,
  parseEther,
  parseUnits,
  WeiPerEther
} from 'ethers'
import LottieView from 'lottie-react'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

import { STK_WALLET, WALLET_STAKING_ADDR, WALLET_TOKEN } from '@ambire-common/consts/addresses'
import formatDecimals from '@ambire-common/utils/formatDecimals/formatDecimals'
import WarningIcon from '@common/assets/svg/WarningIcon'
import { RELAYER_URL } from '@env'
import HumanReadableError from '@legends/classes/HumanReadableError'
import CloseIcon from '@legends/components/CloseIcon'
import Input from '@legends/components/Input'
import Modal from '@legends/components/Modal'
import { ERROR_MESSAGES } from '@legends/constants/errors/messages'
import { ETHEREUM_CHAIN_ID } from '@legends/constants/networks'
import useAccountContext from '@legends/hooks/useAccountContext'
import useErc5792 from '@legends/hooks/useErc5792'
import useEscModal from '@legends/hooks/useEscModal'
import usePortfolioControllerState from '@legends/hooks/usePortfolioControllerState/usePortfolioControllerState'
import useSwitchNetwork from '@legends/hooks/useSwitchNetwork'
import useToast from '@legends/hooks/useToast'
import { humanizeError } from '@legends/modules/legends/utils/errors/humanizeError'

import loadingAnimation from './icons/LoadingAnimation.json'
import styles from './StakeWalletModal.module.scss'

const walletIface = new Interface([
  'function approve(address,uint)',
  'function balanceOf(address) view returns (uint256)'
])

const stkWalletIface = new Interface([
  'function unwrap(uint256 shareAmount)',
  'function enter(uint256 amount) external',
  'function balanceOf(address) view returns (uint256)'
])
const xWalletIface = new Interface([
  'function shareValue() public view returns(uint)',
  'function leave(uint256 shares, bool skipMint)',
  'function lockedShares(address) public view returns(uint)',
  'function commitments(bytes32) public view returns(uint)',
  'function balanceOf(address) view returns (uint256)',
  'function withdraw(uint shares, uint unlocksAt, bool skipMint) external',
  'event LogLeave(address indexed owner, uint256 shares, uint256 unlocksAt, uint256 maxTokens)'
])

const StakeWalletModal: React.FC<{ isOpen: boolean; handleClose: () => void }> = ({
  isOpen,
  handleClose
}) => {
  const [inputAmount, setInputAmount] = useState('')
  const [onchainData, setOnchainData] = useState<{
    walletBalance: bigint
    shareValue: bigint
    lockedShares: bigint
    stkWalletBalance: bigint
    xWalletBalance: bigint
  } | null>()

  const [isLoadingOnchainData, setIsLoadingOnchainData] = useState(true)
  const [isLoadingLogs, setIsLoadingLogs] = useState(true)
  const [isSigning, setIsSigning] = useState(false)
  const [activeTab, setActiveTab] = useState<'stake' | 'unstake'>('stake')
  const [leaveLogs, setLeaveLogs] = useState<{ topics: string[]; data: string }[] | null>(null)
  const [firstToCollect, setFirstToCollect] = useState<null | {
    unlocksAt: bigint
    maxTokens: bigint
    shares: bigint
  }>(null)
  const { connectedAccount, v1Account } = useAccountContext()
  const { walletTokenInfo } = usePortfolioControllerState()
  const { sendCalls, getCallsStatus, chainId } = useErc5792()
  const switchNetwork = useSwitchNetwork()
  const { addToast } = useToast()
  const [isWarningModalOpen, setIsWarningModalOpen] = useState(false)

  const handleEsc = useCallback(() => {
    if (isWarningModalOpen) setIsWarningModalOpen(false)
    else handleClose()
  }, [handleClose, isWarningModalOpen, setIsWarningModalOpen])

  useEscModal(isOpen, handleEsc)

  const isConnected = useMemo(() => !!connectedAccount && !v1Account, [connectedAccount, v1Account])

  useEffect(() => {
    if (!isConnected || !isOpen) {
      setIsLoadingOnchainData(false)
      return
    }
    setIsLoadingOnchainData(true)
    const provider = new JsonRpcProvider('https://invictus.ambire.com/ethereum')
    const walletContract = new Contract(WALLET_TOKEN, walletIface, provider)
    const xWalletContract = new Contract(WALLET_STAKING_ADDR, xWalletIface, provider)
    const stkWalletContract = new Contract(STK_WALLET, stkWalletIface, provider)
    Promise.all([
      walletContract.balanceOf(connectedAccount),
      xWalletContract.shareValue(),
      stkWalletContract.balanceOf(connectedAccount),
      xWalletContract.lockedShares(connectedAccount),
      xWalletContract.balanceOf(connectedAccount)
    ])
      .then(([walletBalance, shareValue, stkWalletBalance, lockedShares, xWalletBalance]) =>
        setOnchainData({
          walletBalance,
          shareValue,
          stkWalletBalance,
          lockedShares,
          xWalletBalance
        })
      )
      .catch(() => addToast('Failed to fetch token data.', { type: 'error' }))
      .finally(() => setIsLoadingOnchainData(false))
  }, [connectedAccount, addToast, isConnected, isOpen])

  useEffect(() => {
    if (!isConnected || !isOpen) return setIsLoadingLogs(false)
    setIsLoadingLogs(true)

    fetch(`${RELAYER_URL}/v2/identity/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identity: connectedAccount,
        address: WALLET_STAKING_ADDR,
        requestedTopic: xWalletIface.getEvent('LogLeave')!.topicHash
      })
    })
      .then((res) => res.json())
      .then(({ success, message, data }) => {
        if (!success) addToast(`Getting unstake logs: ${message}`, { type: 'error' })
        else setLeaveLogs(data?.logs)
      })
      // eslint-disable-next-line no-console
      .catch((err) => console.error(err))
  }, [isConnected, isOpen, connectedAccount, addToast])

  useEffect(() => {
    if (!leaveLogs) return
    const parsedLogs = leaveLogs
      .filter(
        ({ topics }) =>
          // just in case the relayer implementation changes
          topics[0] === xWalletIface.getEvent('LogLeave')!.topicHash
      )
      .map(({ topics, data }) => {
        const { owner, shares, unlocksAt, maxTokens } = xWalletIface.decodeEventLog(
          'LogLeave',
          data,
          topics
        )
        return { owner, shares, unlocksAt, maxTokens }
      })
      .filter(({ owner }) => owner === connectedAccount)
    const provider = new JsonRpcProvider('https://invictus.ambire.com/ethereum')
    const xWalletContract = new Contract(WALLET_STAKING_ADDR, xWalletIface, provider)

    Promise.all(
      parsedLogs.map(({ shares, owner, unlocksAt }) => {
        const abiCoder = new AbiCoder()
        const encoded = abiCoder.encode(
          ['address', 'uint256', 'uint256'],
          [owner, shares, unlocksAt]
        )
        const commitmentId = keccak256(encoded)
        return xWalletContract
          .commitments(commitmentId)
          .then((maxTokens) => [maxTokens, { shares, owner, unlocksAt, maxTokens }])
      })
    )
      .then((allCommitments) => {
        const uncollected = allCommitments
          .filter(([maxTokens]) => maxTokens)
          .map(([, commitment]) => commitment)
          .sort(([a, b]) => a.unlocksAt - b.unlocksAt)

        const firstUncollected = uncollected[0]
        if (!firstUncollected) return
        const { maxTokens, unlocksAt, shares } = firstUncollected
        setFirstToCollect({ unlocksAt, maxTokens, shares })
      })
      .catch(() => addToast('Error getting pending withdraw data', { type: 'error' }))
      .finally(() => setIsLoadingLogs(false))
  }, [addToast, connectedAccount, firstToCollect, leaveLogs, onchainData])

  const stakeAction = useCallback(
    async (dataFromInput: string) => {
      try {
        if (!connectedAccount) throw new HumanReadableError('No connected account.')

        await switchNetwork(ETHEREUM_CHAIN_ID)
        const amount = parseEther(dataFromInput)
        const calls = [
          {
            to: WALLET_TOKEN,
            data: walletIface.encodeFunctionData('approve', [STK_WALLET, amount])
          },
          { to: STK_WALLET, data: stkWalletIface.encodeFunctionData('enter', [amount]) }
        ]
        setIsSigning(true)
        const signer = await new BrowserProvider(window.ambire).getSigner(connectedAccount)

        const txId = await sendCalls(chainId, await signer.getAddress(), calls, false)
        await getCallsStatus(txId)
        addToast('Staked successfully!', { type: 'success' })
        handleClose()
        setInputAmount('')
      } catch (e: any) {
        addToast(humanizeError(e, ERROR_MESSAGES.transactionSigningFailed), { type: 'error' })
      } finally {
        setIsSigning(false)
      }
    },
    [
      addToast,
      chainId,
      connectedAccount,
      getCallsStatus,
      handleClose,
      inputAmount,
      sendCalls,
      switchNetwork
    ]
  )

  const goToSwap = useCallback(() => {
    window.ambire
      .request({
        method: 'open-wallet-route',
        params: { route: 'swap-and-bridge' }
      })
      .catch((e) => {
        console.log(e)
        addToast('Failed to go to internal swap.', { type: 'error' })
      })
  }, [addToast])

  const requestWithdrawAction = useCallback(
    async (dataFromInput: string) => {
      try {
        if (!connectedAccount) throw new HumanReadableError('No connected account.')
        if (!onchainData) throw new HumanReadableError('We were unable to fetch unstaking data.')
        await switchNetwork(ETHEREUM_CHAIN_ID)

        const amount = parseUnits(dataFromInput, 36) / onchainData.shareValue
        const calls = [
          { to: STK_WALLET, data: stkWalletIface.encodeFunctionData('unwrap', [amount]) },
          {
            to: WALLET_STAKING_ADDR,
            data: xWalletIface.encodeFunctionData('leave', [amount, false])
          }
        ]

        setIsSigning(true)
        const signer = await new BrowserProvider(window.ambire).getSigner(connectedAccount)

        const txId = await sendCalls(chainId, await signer.getAddress(), calls, false)
        await getCallsStatus(txId)
        addToast('Withdraw requested successfully!', { type: 'success' })
        handleClose()
        setInputAmount('')
      } catch (e: any) {
        console.log(e)
        addToast(humanizeError(e, ERROR_MESSAGES.transactionSigningFailed), { type: 'error' })
      } finally {
        setIsSigning(false)
      }
    },
    [
      addToast,
      chainId,
      connectedAccount,
      firstToCollect,
      getCallsStatus,
      handleClose,
      inputAmount,
      onchainData,
      sendCalls,
      switchNetwork
    ]
  )

  const withdrawAction = useCallback(async () => {
    try {
      if (!firstToCollect) throw new HumanReadableError('Enter a valid amount.')
      if (!connectedAccount) throw new HumanReadableError('No connected account.')
      if (!onchainData) throw new HumanReadableError('We were unable to fetch unstaking data.')
      await switchNetwork(ETHEREUM_CHAIN_ID)

      if (onchainData.xWalletBalance < onchainData.lockedShares)
        throw new HumanReadableError(
          'No $xWALLET tokens to withdraw. Send them back to this account to be able to withdraw.'
        )
      const { shares, unlocksAt } = firstToCollect

      const calls = [
        {
          to: WALLET_STAKING_ADDR,
          data: xWalletIface.encodeFunctionData('withdraw', [shares, unlocksAt, true])
        }
      ]

      setIsSigning(true)
      const signer = await new BrowserProvider(window.ambire).getSigner(connectedAccount)

      const txId = await sendCalls(chainId, await signer.getAddress(), calls, false)
      await getCallsStatus(txId)
      addToast('Withdrawn successfully!', { type: 'success' })
      handleClose()
      setInputAmount('')
    } catch (e: any) {
      console.log(e)
      addToast(humanizeError(e, ERROR_MESSAGES.transactionSigningFailed), { type: 'error' })
    } finally {
      setIsSigning(false)
    }
  }, [
    addToast,
    chainId,
    connectedAccount,
    firstToCollect,
    getCallsStatus,
    handleClose,
    onchainData,
    sendCalls,
    switchNetwork
  ])

  function formatDuration(ms: number) {
    const totalMinutes = Math.floor(ms / 60000)
    const days = Math.floor(totalMinutes / 1440)
    const hours = Math.floor((totalMinutes % 1440) / 60)
    const minutes = totalMinutes % 60
    return `${days}d ${hours}h ${minutes}m`
  }
  const displayWarningOrUnstake = useCallback(() => {
    if (!onchainData || !inputAmount) return
    const walletsInXwallet = +formatUnits(onchainData.shareValue * onchainData.xWalletBalance, 36)
    const walletsInStkWallet = +formatUnits(onchainData.stkWalletBalance)
    const totalStakedWallets = walletsInStkWallet + walletsInXwallet

    if (Number(inputAmount) > totalStakedWallets * 0.65) setIsWarningModalOpen(true)
    else requestWithdrawAction(inputAmount)
  }, [onchainData, inputAmount, setIsWarningModalOpen, requestWithdrawAction])
  const buttonState = useMemo((): { text: string; action?: () => any } => {
    if (!isConnected) return { text: 'Connect a new account' }
    if (isLoadingLogs || isLoadingOnchainData) return { text: 'Loading...' }
    if (isSigning) return { text: 'Signing...' }
    if (activeTab === 'stake')
      return onchainData?.walletBalance
        ? { text: 'Stake', action: inputAmount ? () => stakeAction(inputAmount) : undefined }
        : { text: 'Buy $WALLET', action: goToSwap }

    // then it is in unstake
    if (!onchainData?.lockedShares) {
      return onchainData?.stkWalletBalance
        ? {
            text: 'Unstake',
            action: inputAmount ? displayWarningOrUnstake : undefined
          }
        : { text: 'No $WALLET staked to withdraw' }
    }

    if (!firstToCollect) return { text: 'Withdraw' }
    const { unlocksAt } = firstToCollect
    const unlockDate = new Date(Number(unlocksAt) * 1000)
    return unlockDate < new Date()
      ? { text: 'Withdraw', action: withdrawAction }
      : { text: 'Withdraw' }
  }, [
    inputAmount,
    activeTab,
    firstToCollect,
    goToSwap,
    isConnected,
    isLoadingLogs,
    isLoadingOnchainData,
    isSigning,
    onchainData?.lockedShares,
    onchainData?.stkWalletBalance,
    onchainData?.walletBalance,
    requestWithdrawAction,
    stakeAction,
    withdrawAction
  ])

  const formatToken = useCallback(
    (value: bigint): { usd: string; token: string } => {
      const tokenAsNumber = parseFloat(formatUnits(value, 18))

      const balanceUSD = (walletTokenInfo?.walletPrice || 0) * tokenAsNumber
      const usd = formatDecimals(balanceUSD, 'value')
      const token = formatDecimals(tokenAsNumber, 'amount')

      return { usd, token }
    },
    [walletTokenInfo]
  )

  const handleCloseClick = () => {
    setInputAmount('')
    handleClose()
  }

  const timeRemainingToWithdraw = useMemo(() => {
    if (!firstToCollect) return false
    const { unlocksAt } = firstToCollect
    const time = new Date(Number(unlocksAt * 1000n))
    return Math.max(0, time.getTime() - new Date().getTime())
  }, [firstToCollect])

  const meaningfulToken = useMemo(() => {
    return activeTab === 'stake'
      ? { balance: onchainData?.walletBalance || 0n, symbol: 'WALLET' }
      : { balance: onchainData?.stkWalletBalance || 0n, symbol: 'stkWALLET' }
  }, [onchainData, activeTab])

  const inputValidationError = useMemo(() => {
    if (meaningfulToken.balance < parseEther(inputAmount || '0')) return 'Insufficient balance'
    return ''
  }, [meaningfulToken, inputAmount])

  const setPercentage = useCallback(
    (percentage: number) => {
      const inWei = (meaningfulToken.balance * BigInt(percentage)) / 100n
      const toSet = formatUnits(inWei, 18)
      setInputAmount(toSet)
    },
    [meaningfulToken]
  )

  if (!isOpen) return null

  return createPortal(
    <div className={styles.backdrop}>
      <div className={styles.wrapper}>
        <button type="button" className={styles.closeButton} onClick={handleCloseClick}>
          <CloseIcon />
        </button>
        <div className={styles.contentWrapper}>
          <h2 className={styles.title}>Stake $WALLET</h2>
          <p className={styles.learnMore}>
            Learn more about{' '}
            <a
              target="_blank"
              href="https://help.ambire.com/hc/en-us/sections/4421155466130-Staking/"
              rel="noreferrer"
            >
              how staking works
            </a>
          </p>
          <div className={styles.tabs}>
            <button
              type="button"
              className={`${styles.tab} ${activeTab === 'stake' ? styles.activeTab : ''}`}
              onClick={() => {
                setInputAmount('')
                setActiveTab('stake')
              }}
            >
              Stake
            </button>
            <button
              type="button"
              className={`${styles.tab} ${activeTab === 'unstake' ? styles.activeTab : ''}`}
              onClick={() => {
                setInputAmount('')
                setActiveTab('unstake')
              }}
              data-tooltip-id="unstake"
            >
              Unstake
            </button>
          </div>
          <div className={`${styles.infoWrapper}`}>
            {!!onchainData?.lockedShares &&
              activeTab === 'unstake' &&
              (timeRemainingToWithdraw ? (
                <div className={styles.timerContainer}>
                  <LottieView
                    style={{ width: 80, height: 80 }}
                    animationData={loadingAnimation}
                    loop
                  />
                  <p>
                    {
                      formatToken(
                        ((firstToCollect?.shares || 0n) * (onchainData?.shareValue || 0n)) /
                          WeiPerEther
                      ).token
                    }{' '}
                    $WALLET
                  </p>
                  <p>will be available in</p>
                  <p>{formatDuration(timeRemainingToWithdraw)}</p>
                </div>
              ) : (
                <div className={styles.readyToWithdrawText}>
                  {firstToCollect ? (
                    <>
                      <div>Ready to withdraw</div>
                      <div>{formatToken(firstToCollect?.maxTokens || 0n).token}</div>
                      <div>$WALLET</div>
                    </>
                  ) : (
                    <div style={{ maxWidth: '20rem', textAlign: 'center' }}>
                      {
                        formatToken(
                          ((onchainData?.lockedShares || 0n) * (onchainData?.shareValue || 0n)) /
                            WeiPerEther
                        ).token
                      }{' '}
                      $WALLET tokens will be available to withdraw in up to one month
                    </div>
                  )}
                </div>
              ))}
            <div className={`${styles.infoRow} ${styles.apyInfo}`}>
              <div style={{ marginRight: '1rem' }}>APY</div> {walletTokenInfo?.apy.toFixed(2)}%
            </div>
            <div
              className={`${activeTab === 'unstake' && onchainData?.lockedShares && styles.blur}`}
            >
              <div className={styles.infoRow}>
                <div className={styles.actionLabel}>
                  {activeTab === 'stake' ? 'Stake' : 'Unstake'}
                </div>
              </div>

              <div className={styles.infoRow}>
                <div className={styles.label}>
                  ${(Number(inputAmount || '0') * (walletTokenInfo?.walletPrice || 0)).toFixed(2)}
                </div>

                <div className={styles.label}>
                  Balance: {formatToken(meaningfulToken.balance).token}
                </div>
              </div>
              <div className={`${styles.stakeInputRow} `}>
                <div>
                  <Input.Field
                    type="number"
                    value={
                      parseFloat(inputAmount)
                        ? parseFloat(parseFloat(inputAmount).toFixed(10)).toString()
                        : ''
                    }
                    disabled={
                      isLoadingLogs ||
                      isLoadingOnchainData ||
                      isSigning ||
                      (activeTab === 'unstake' && !!onchainData?.lockedShares)
                    }
                    onChange={(e) => setInputAmount(e.target.value)}
                    className={styles.stakeInput}
                    placeholder="0.00"
                  />
                  <div
                    style={{
                      maxHeight: 0,
                      position: 'relative',
                      right: activeTab === 'stake' ? '-16em' : '-15rem',
                      top: '-2.4rem'
                    }}
                  >
                    ${meaningfulToken.symbol}
                  </div>
                </div>
                <div className={styles.stakeInputErrorWrapper}>
                  <Input.ValidationAndInfo
                    validation={{ message: inputValidationError, isError: true }}
                  />
                </div>
              </div>

              <div className={styles.stakeButtons}>
                {[25, 50, 75, 100].map((n) => (
                  <button
                    onClick={() => setPercentage(n)}
                    className={styles.percentageButton}
                    disabled={
                      isLoadingLogs ||
                      isLoadingOnchainData ||
                      isSigning ||
                      (activeTab === 'unstake' && !!onchainData?.lockedShares)
                    }
                    style={
                      isLoadingLogs ||
                      isLoadingOnchainData ||
                      isSigning ||
                      (activeTab === 'unstake' && !!onchainData?.lockedShares)
                        ? { pointerEvents: 'none' }
                        : {}
                    }
                    type="button"
                    key={n}
                  >
                    {n}%
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div
            className={`${styles.lockPeriodInfo} ${
              activeTab === 'unstake' && styles.visibleLockPeriodInfo
            }`}
          >
            {onchainData?.lockedShares
              ? 'You will be able to withdraw and unstake more as soon as the locking period has ended.'
              : 'The selected amount will have a 1 month locking period.'}
          </div>
          <button
            type="button"
            className={styles.stakeButton}
            onClick={buttonState.action}
            disabled={!!inputValidationError || !buttonState.action}
          >
            {buttonState.text}
          </button>
        </div>
      </div>
      <Modal
        isOpen={isWarningModalOpen}
        handleClose={() => setIsWarningModalOpen(false)}
        className={styles.warningModal}
      >
        <Modal.Heading className={styles.heading}>Confirm Unstake</Modal.Heading>
        <WarningIcon height={45} width={45} strokeWidth={1} color="#E7AA27" />
        <p className={styles.infoText}>
          If you confirm unstaking a significant amount of your stkWALLET, you won’t be earning XP
          for the unstake period.
        </p>
        <div className={styles.buttonWrapper}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={() => setIsWarningModalOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.confirmButton}
            onClick={() => {
              setIsWarningModalOpen(false)
              requestWithdrawAction(inputAmount)
            }}
          >
            Confirm
          </button>
        </div>
      </Modal>
    </div>,
    document.getElementById('modal-root') as HTMLElement
  )
}

export default StakeWalletModal
