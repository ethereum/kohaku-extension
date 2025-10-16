import {
  AbiCoder,
  Block,
  formatUnits,
  getAddress,
  isAddress,
  keccak256,
  TransactionReceipt,
  TransactionResponse,
  ZeroAddress
} from 'ethers'
import { useEffect, useMemo, useState } from 'react'

import { BUNDLER } from '@ambire-common/consts/bundlers'
import { AMBIRE_PAYMASTER, ERC_4337_ENTRYPOINT } from '@ambire-common/consts/deploy'
import { Fetch } from '@ambire-common/interfaces/fetch'
import { Network } from '@ambire-common/interfaces/network'
import { AccountOp } from '@ambire-common/libs/accountOp/accountOp'
import {
  AccountOpIdentifiedBy,
  fetchFrontRanTxnId,
  fetchTxnId,
  isIdentifiedByTxn,
  SubmittedAccountOp
} from '@ambire-common/libs/accountOp/submittedAccountOp'
import { Call } from '@ambire-common/libs/accountOp/types'
import { decodeFeeCall } from '@ambire-common/libs/calls/calls'
import { humanizeAccountOp } from '@ambire-common/libs/humanizer'
import { IrCall } from '@ambire-common/libs/humanizer/interfaces'
import { parseLogs } from '@ambire-common/libs/userOperation/userOperation'
import { resolveAssetInfo } from '@ambire-common/services/assetInfo'
import { getBenzinUrlParams } from '@ambire-common/utils/benzin'
import formatDecimals from '@ambire-common/utils/formatDecimals/formatDecimals'
import {
  handleOps060,
  handleOps070
} from '@benzin/screens/BenzinScreen/constants/humanizerInterfaces'
import { ActiveStepType, FinalizedStatusType } from '@benzin/screens/BenzinScreen/interfaces/steps'
import { UserOperation } from '@benzin/screens/BenzinScreen/interfaces/userOperation'

import { EIP7702Auth } from '@ambire-common/consts/7702'
import { RPCProvider } from '@ambire-common/interfaces/provider'
import { decodeUserOp, entryPointTxnSplit, reproduceCallsFromTxn } from './utils/reproduceCalls'

const REFETCH_TIME = 4000 // 4 seconds

export type FeePaidWith = {
  address: string
  amount: string
  symbol: string
  usdValue: string
  isErc20: boolean
  isSponsored: boolean
  chainId: bigint
}

interface Props {
  txnId: string | null
  userOpHash: string | null
  relayerId: string | null
  network: Network | null
  standardOptions: {
    fetch: Fetch
    callRelayer: any
  }
  setActiveStep: (step: ActiveStepType) => void
  provider: RPCProvider | null
  bundler?: BUNDLER
  extensionAccOp?: SubmittedAccountOp // only for in-app benzina
  networks: Network[]
}

export interface StepsData {
  blockData: null | Block
  finalizedStatus: FinalizedStatusType
  feePaidWith: FeePaidWith | null
  calls: IrCall[] | null
  pendingTime: number
  txnId: string | null
  from: string | null
  originatedFrom: string | null
  userOp: UserOperation | null
  delegation?: EIP7702Auth
}

// if the transaction hash is found, we make the top url the real txn id
// because user operation hashes are not reliable long term
const setUrlToTxnId = (
  transactionHash: string,
  userOpHash: string | null,
  relayerId: string | null,
  chainId: bigint,
  bundler?: BUNDLER
) => {
  const splitUrl = (window.location.href || '').split('?')
  const search = splitUrl[1]
  const searchParams = new URLSearchParams(search)
  const isInternal = typeof searchParams.get('isInternal') === 'string'

  const getIdentifiedBy = (): AccountOpIdentifiedBy => {
    if (relayerId) return { type: 'Relayer', identifier: relayerId }
    if (userOpHash) return { type: 'UserOperation', identifier: userOpHash, bundler }
    return { type: 'Transaction', identifier: transactionHash }
  }

  window.history.pushState(
    null,
    '',
    `${splitUrl[0]}${getBenzinUrlParams({
      chainId,
      txnId: transactionHash,
      identifiedBy: getIdentifiedBy(),
      isInternal
    })}`
  )
}

const parseHumanizer = (humanizedCalls: IrCall[]): IrCall[] => {
  // remove deadlines from humanizer
  const finalParsedCalls = humanizedCalls.map((call) => {
    const localCall: IrCall = { ...call }
    localCall.fullVisualization = call.fullVisualization?.filter(
      (visual) => visual.type !== 'deadline' && !visual.isHidden
    )
    localCall.warnings = call.warnings?.filter((warn) => warn.content !== 'Unknown address')
    return localCall
  })
  return finalParsedCalls
}

const useSteps = ({
  txnId,
  userOpHash,
  relayerId,
  network,
  standardOptions,
  setActiveStep,
  provider,
  bundler,
  extensionAccOp,
  networks
}: Props): StepsData => {
  const [txn, setTxn] = useState<null | TransactionResponse>(null)
  const [txnReceipt, setTxnReceipt] = useState<{
    actualGasCost: null | bigint
    originatedFrom: null | string
    blockNumber: null | bigint
  }>({ actualGasCost: null, originatedFrom: null, blockNumber: null })
  const [blockData, setBlockData] = useState<null | Block>(null)
  const [finalizedStatus, setFinalizedStatus] = useState<FinalizedStatusType>({
    status: 'fetching'
  })
  const [refetchTxnIdCounter, setRefetchTxnIdCounter] = useState<number>(0)
  const [refetchTxnCounter, setRefetchTxnCounter] = useState<number>(0)
  const [refetchReceiptCounter, setRefetchReceiptCounter] = useState<number>(0)
  const [feePaidWith, setFeePaidWith] = useState<FeePaidWith | null>(null)
  const [pendingTime, setPendingTime] = useState<number>(30)
  const [userOp, setUserOp] = useState<null | UserOperation>(null)
  const [foundTxnId, setFoundTxnId] = useState<null | string>(txnId)
  const [hasCheckedFrontRun, setHasCheckedFrontRun] = useState<boolean>(false)
  const [calls, setCalls] = useState<IrCall[]>([])
  const [feeCall, setFeeCall] = useState<Call | null>(null)
  const [from, setFrom] = useState<null | string>(null)
  const [isFrontRan, setIsFrontRan] = useState<boolean>(false)

  const identifiedBy: AccountOpIdentifiedBy = useMemo(() => {
    if (relayerId) return { type: 'Relayer', identifier: relayerId }
    if (userOpHash)
      return {
        type: 'UserOperation',
        identifier: userOpHash,
        bundler
      }
    return { type: 'Transaction', identifier: txnId as string }
  }, [relayerId, userOpHash, txnId, bundler])

  const receiptAlreadyFetched = useMemo(() => !!txnReceipt.blockNumber, [txnReceipt.blockNumber])

  useEffect(() => {
    let timeout: any

    if (!network || (!userOpHash && !relayerId) || txn || receiptAlreadyFetched) return

    fetchTxnId(identifiedBy, network, standardOptions.fetch, standardOptions.callRelayer)
      .then((result) => {
        if (result.status === 'rejected') {
          setFinalizedStatus({
            status: 'rejected',
            reason: 'Bundler has rejected the user operation'
          })
          setActiveStep('finalized')
          return
        }

        if (result.status === 'not_found') {
          timeout = setTimeout(() => {
            setRefetchTxnIdCounter((prev) => prev + 1)
          }, REFETCH_TIME)
          return
        }

        const resultTxnId = result.txnId as string
        if (resultTxnId !== foundTxnId) {
          setFoundTxnId(resultTxnId)
          setActiveStep('in-progress')
          setUrlToTxnId(resultTxnId, userOpHash, relayerId, network.chainId, bundler)
        }

        // if there's no txn and receipt, keep searching
        if (!txn && !receiptAlreadyFetched) {
          timeout = setTimeout(() => {
            setRefetchTxnIdCounter((prev) => prev + 1)
          }, REFETCH_TIME)
        }
      })
      .catch((e) => e)

    return () => {
      if (timeout) clearTimeout(timeout)
    }
  }, [
    network,
    identifiedBy,
    standardOptions.fetch,
    standardOptions.callRelayer,
    txnId,
    setActiveStep,
    foundTxnId,
    relayerId,
    userOpHash,
    txn,
    receiptAlreadyFetched,
    bundler,
    refetchTxnIdCounter
  ])

  // find the transaction
  useEffect(() => {
    let timeout: any

    if (txn || !foundTxnId || !provider) return

    provider
      .getTransaction(foundTxnId)
      .then((fetchedTxn: null | TransactionResponse) => {
        if (!fetchedTxn) {
          // if is EOA broadcast and we can't fetch the txn 15 times,
          // declare the txn dropped
          if (isIdentifiedByTxn(identifiedBy) && refetchTxnCounter >= 15) {
            setFinalizedStatus({ status: 'dropped' })
            setActiveStep('finalized')
            return
          }

          // start a refetch
          timeout = setTimeout(() => {
            setRefetchTxnCounter((prev) => prev + 1)
          }, REFETCH_TIME)
          return
        }

        setTxn(fetchedTxn)
      })
      .catch(() => null)

    return () => {
      if (timeout) clearTimeout(timeout)
    }
  }, [foundTxnId, txn, setActiveStep, provider, identifiedBy, refetchTxnCounter])

  useEffect(() => {
    let timeout: any
    if (!foundTxnId || !provider || receiptAlreadyFetched) return

    provider
      .getTransactionReceipt(foundTxnId)
      .then((receipt: null | TransactionReceipt) => {
        if (!receipt) {
          // if there is a txn but no receipt, it means it is pending
          if (txn) {
            timeout = setTimeout(() => setRefetchReceiptCounter((prev) => prev + 1), REFETCH_TIME)
            // Prevent unnecessary rerenders
            if (finalizedStatus?.status !== 'fetching') {
              setFinalizedStatus({ status: 'fetching' })
              setActiveStep('in-progress')
            }
            return
          }

          // just stop the execution if txn is null because we might
          // not have fetched it, yet
          // if txn is null, logic for dropping the txn is handled there
          return
        }

        // if the txn is still not fetched at this moment, do not proceed
        // as it will set incorrect data for sender (from)
        if (!txn) return

        // if there's a receipt, the status is failure and it's an userOp,
        // the txn might have been front ran. Try to find it
        if (!receipt.status && userOpHash && !hasCheckedFrontRun) {
          setIsFrontRan(true)
          return
        }

        setTxnReceipt({
          originatedFrom: receipt.from,
          actualGasCost: receipt.gasUsed * receipt.gasPrice,
          blockNumber: BigInt(receipt.blockNumber)
        })

        let userOpsLength = 0
        if (!userOpHash && txn) {
          try {
            // check the sighash
            const sigHash = txn.data.slice(0, 10)
            const handleOpsData =
              sigHash === handleOps060.getFunction('handleOps')!.selector
                ? handleOps060.decodeFunctionData('handleOps', txn.data)
                : handleOps070.decodeFunctionData('handleOps', txn.data)
            userOpsLength = handleOpsData[0].length
          } catch (e: any) {
            /* silence is bitcoin */
          }
        }

        const userOpLog = parseLogs(receipt.logs, userOpHash ?? '', userOpsLength)
        if (userOpLog && !userOpLog.success) {
          setFinalizedStatus({
            status: 'failed',
            reason: 'Inner calls failed'
          })
        } else {
          setFinalizedStatus(receipt.status ? { status: 'confirmed' } : { status: 'failed' })
        }
        setActiveStep('finalized')
      })
      .catch(() => null)

    return () => {
      if (timeout) clearTimeout(timeout)
    }
  }, [
    finalizedStatus?.status,
    foundTxnId,
    provider,
    setActiveStep,
    txn,
    receiptAlreadyFetched,
    userOpHash,
    refetchReceiptCounter,
    hasCheckedFrontRun
  ])

  // fix: front running
  useEffect(() => {
    if (!isFrontRan || !foundTxnId || !network) return

    fetchFrontRanTxnId(identifiedBy, foundTxnId, network)
      .then((frontRanTxnId) => {
        setFoundTxnId(frontRanTxnId)
        setActiveStep('in-progress')
        setUrlToTxnId(frontRanTxnId, userOpHash, relayerId, network.chainId, bundler)
        setIsFrontRan(false)
        setHasCheckedFrontRun(true)
      })
      .catch(() => null)
  }, [isFrontRan, identifiedBy, foundTxnId, network, bundler, relayerId, userOpHash, setActiveStep])

  // check for error reason
  useEffect(() => {
    if (
      !txn ||
      !txnReceipt ||
      (finalizedStatus && finalizedStatus.status !== 'failed') ||
      (finalizedStatus && finalizedStatus.reason) ||
      !provider
    )
      return

    provider
      .call({
        to: txn.to,
        from: txn.from,
        nonce: txn.nonce,
        gasLimit: txn.gasLimit,
        gasPrice: txn.gasPrice,
        data: txn.data,
        value: txn.value,
        chainId: txn.chainId,
        type: txn.type ?? undefined,
        accessList: txn.accessList
      })
      .then(() => null)
      .catch((error: Error) => {
        if (error.message.includes('missing revert data')) {
          setFinalizedStatus({
            status: 'failed',
            reason: 'Contract execution reverted'
          })
          return
        }

        setFinalizedStatus({
          status: 'failed',
          reason:
            error.message.length > 20
              ? `${error.message.substring(0, 25)}... (open explorer for further details)`
              : error.message
        })
      })
  }, [provider, txn, finalizedStatus, userOpHash, txnReceipt])

  // calculate pending time
  useEffect(() => {
    if (!txn || receiptAlreadyFetched || !provider || !network) return

    provider
      .getBlock('latest', true)
      .then((latestBlockData) => {
        if (!latestBlockData) return

        const gasPrice = txn.maxFeePerGas ?? txn.gasPrice
        if (network.feeOptions.is1559 && latestBlockData.baseFeePerGas != null) {
          setPendingTime(gasPrice > latestBlockData.baseFeePerGas ? 30 : 300)
        } else {
          const prices = latestBlockData.prefetchedTransactions
            .map((x) => x.gasPrice)
            .filter((x) => x > 0)

          if (prices.length === 0) {
            setPendingTime(30)
            return
          }

          const average = prices.reduce((a, b) => a + b, 0n) / BigInt(prices.length)
          setPendingTime(average - average / 8n > gasPrice ? 30 : 300)
        }
      })
      .catch(() => null)
  }, [txn, receiptAlreadyFetched, provider, network])

  // get block
  useEffect(() => {
    if (!txnReceipt.blockNumber || blockData !== null || !provider) return

    provider
      .getBlock(Number(txnReceipt.blockNumber))
      .then((fetchedBlockData) => {
        setBlockData(fetchedBlockData)
      })
      .catch(() => null)
  }, [provider, txnReceipt, blockData])

  // if it's an user op,
  // we need to call the entry point to fetch the hashes
  // and find the matching hash
  // only after pass to reproduce calls
  useEffect(() => {
    if (!userOpHash || !network || !txn || userOp) return

    const sigHash = txn.data.slice(0, 10)
    const is060 = sigHash === handleOps060.getFunction('handleOps')!.selector
    let handleOpsData = null
    try {
      handleOpsData = is060
        ? handleOps060.decodeFunctionData('handleOps', txn.data)
        : handleOps070.decodeFunctionData('handleOps', txn.data)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('this txn is an userOp but does not call handleOps')
      setUserOp({
        sender: '',
        callData: '',
        hashStatus: 'not_found'
      })
    }

    if (!handleOpsData) return

    const userOperations = handleOpsData[0]
    const abiCoder = new AbiCoder()

    let hashFound = false
    userOperations.forEach((opArray: any) => {
      const sender = opArray[0]
      const nonce = opArray[1]
      const hashInitCode = keccak256(opArray[2])
      const hashCallData = keccak256(opArray[3])

      let hash
      let paymasterAndData
      if (!is060) {
        const accountGasLimits = opArray[4]
        const preVerificationGas = opArray[5]
        const gasFees = opArray[6]
        paymasterAndData = opArray[7]
        const hashPaymasterAndData = keccak256(paymasterAndData)
        const packed = abiCoder.encode(
          ['address', 'uint256', 'bytes32', 'bytes32', 'bytes32', 'uint256', 'bytes32', 'bytes32'],
          [
            sender,
            nonce,
            hashInitCode,
            hashCallData,
            accountGasLimits,
            preVerificationGas,
            gasFees,
            hashPaymasterAndData
          ]
        )
        hash = keccak256(packed)
      } else {
        const callGasLimit = opArray[4]
        const verificationGasLimit = opArray[5]
        const preVerificationGas = opArray[6]
        const maxFeePerGas = opArray[7]
        const maxPriorityFeePerGas = opArray[8]
        paymasterAndData = opArray[9]
        const hashPaymasterAndData = keccak256(paymasterAndData)

        const packed = abiCoder.encode(
          [
            'address',
            'uint256',
            'bytes32',
            'bytes32',
            'uint256',
            'uint256',
            'uint256',
            'uint256',
            'uint256',
            'bytes32'
          ],
          [
            sender,
            nonce,
            hashInitCode,
            hashCallData,
            callGasLimit,
            verificationGasLimit,
            preVerificationGas,
            maxFeePerGas,
            maxPriorityFeePerGas,
            hashPaymasterAndData
          ]
        )

        hash = keccak256(packed)
      }
      const finalHash = keccak256(
        abiCoder.encode(
          ['bytes32', 'address', 'uint256'],
          [
            hash,
            is060 ? '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789' : ERC_4337_ENTRYPOINT,
            network.chainId
          ]
        )
      )
      const paymaster = isAddress(paymasterAndData.slice(0, 42))
        ? getAddress(paymasterAndData.slice(0, 42))
        : ''

      if (finalHash.toLowerCase() === userOpHash.toLowerCase()) {
        hashFound = true
        setUserOp({
          sender,
          callData: opArray[3],
          hashStatus: 'found',
          paymaster
        })
      }
    })
    if (!hashFound) {
      setUserOp({
        sender: '',
        callData: '',
        hashStatus: 'not_found'
      })
    }
  }, [network, txn, userOpHash, userOp])

  // update the gas feePaidWith
  useEffect(() => {
    if (feePaidWith || !network) return

    let isMounted = true
    let address: string | undefined
    let amount = 0n
    let isGasTank = false
    let tokenChainId = network.chainId

    // Smart account
    // Decode the fee call and get the token address and amount
    // that was used to cover the gas feePaidWith
    if (feeCall) {
      try {
        const {
          address: addr,
          amount: tokenAmount,
          isGasTank: isTokenGasTank,
          chainId
        } = decodeFeeCall(feeCall, network)

        address = addr
        amount = tokenAmount
        isGasTank = isTokenGasTank
        tokenChainId = chainId
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Error decoding fee call', e)
      }
    }

    // If the feeCall humanization failed or there isn't a feeCall
    // we should use the gas feePaidWith from the transaction receipt
    if (!address && txnReceipt.actualGasCost) {
      amount = txnReceipt.actualGasCost
      address = ZeroAddress
    }

    const isSponsored =
      (amount === 0n && isGasTank) ||
      (!!userOp && !!userOp.paymaster && userOp.paymaster !== AMBIRE_PAYMASTER)
    if (!address || (!amount && !isSponsored)) return

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    resolveAssetInfo(
      address,
      networks.find((net: Network) => net.chainId === tokenChainId)!,
      ({ tokenInfo }) => {
        if (!tokenInfo || (!amount && !isSponsored)) return
        const { decimals, priceIn } = tokenInfo
        const price = priceIn.length ? priceIn[0].price : null

        const fee = parseFloat(formatUnits(amount, decimals))

        if (!isMounted) return

        setFeePaidWith({
          amount: formatDecimals(fee),
          symbol: tokenInfo.symbol,
          usdValue: price ? formatDecimals(fee * priceIn[0].price, 'value') : '-$',
          isErc20: address !== ZeroAddress,
          address: address as string,
          isSponsored,
          chainId: tokenChainId
        })
      }
    ).catch(() => {
      if (!isMounted) return
      setFeePaidWith({
        amount: address === ZeroAddress ? formatDecimals(parseFloat(formatUnits(amount, 18))) : '-',
        symbol: address === ZeroAddress ? network.nativeAssetSymbol : '',
        usdValue: '-$',
        isErc20: false,
        address: address as string,
        isSponsored,
        chainId: network.chainId
      })
    })

    return () => {
      isMounted = false
    }
  }, [txnReceipt.actualGasCost, feePaidWith, feeCall, network, userOp, networks])

  useEffect(() => {
    if (!network) return

    // if we have the extension account op passed, we do not need to
    // wait to show the calls
    if (extensionAccOp) {
      const humanizedCalls = humanizeAccountOp(extensionAccOp, { network })
      setCalls(parseHumanizer(humanizedCalls))
      setFrom(extensionAccOp.accountAddr)
      if (extensionAccOp.feeCall) setFeeCall(extensionAccOp.feeCall)
      return
    }

    if (userOpHash && userOp?.hashStatus !== 'found') return
    if (
      userOp?.hashStatus !== 'found' &&
      txn &&
      txnId &&
      entryPointTxnSplit[txn.data.slice(0, 10)]
    ) {
      setCalls(entryPointTxnSplit[txn.data.slice(0, 10)](txn, network, txnId))
      return
    }

    if (txn) {
      const {
        calls: decodedCalls,
        from: account,
        feeCall: decodedFeeCall
      } = userOp ? decodeUserOp(userOp) : reproduceCallsFromTxn(txn)
      const accountOp: AccountOp = {
        accountAddr: userOp?.sender || account || txnReceipt.originatedFrom || 'Loading...',
        chainId: network.chainId,
        signingKeyAddr: txnReceipt.originatedFrom, // irrelevant
        signingKeyType: 'internal', // irrelevant
        nonce: BigInt(0), // irrelevant
        calls: decodedCalls,
        gasLimit: Number(txn.gasLimit),
        signature: '0x', // irrelevant
        gasFeePayment: null,
        accountOpToExecuteBefore: null
      }
      const humanizedCalls = humanizeAccountOp(accountOp, { network })

      setCalls(parseHumanizer(humanizedCalls))
      setFrom(accountOp.accountAddr)
      if (decodedFeeCall) {
        setFeeCall(decodedFeeCall)
      }
    }
  }, [network, txnReceipt, txn, userOpHash, userOp, txnId, extensionAccOp])

  return {
    blockData,
    finalizedStatus,
    feePaidWith,
    calls: calls || null,
    pendingTime,
    txnId: foundTxnId,
    from: from || null,
    originatedFrom: txnReceipt.originatedFrom,
    userOp,
    delegation:
      extensionAccOp && extensionAccOp.meta && extensionAccOp.meta.setDelegation !== undefined
        ? extensionAccOp.meta.delegation
        : undefined
  }
}

export default useSteps
