/* eslint-disable @typescript-eslint/no-unused-vars */
import 'reflect-metadata'

import { ethErrors } from 'eth-rpc-errors'
import { toBeHex } from 'ethers'
import cloneDeep from 'lodash/cloneDeep'
import { nanoid } from 'nanoid'

import { ORIGINS_WHITELISTED_TO_ALL_ACCOUNTS } from '@ambire-common/consts/dappCommunication'
import { MainController } from '@ambire-common/controllers/main/main'
import { DappProviderRequest } from '@ambire-common/interfaces/dapp'
import {
  getFailureStatus,
  getPendingStatus,
  getSuccessStatus,
  getVersion
} from '@ambire-common/libs/5792/5792'
import { getBaseAccount } from '@ambire-common/libs/account/getBaseAccount'
import {
  AccountOpIdentifiedBy,
  fetchTxnId,
  isIdentifiedByMultipleTxn
} from '@ambire-common/libs/accountOp/submittedAccountOp'
import { getBundlerByName, getDefaultBundler } from '@ambire-common/services/bundlers/getBundler'
import { getRpcProvider } from '@ambire-common/services/provider'
import { getBenzinUrlParams } from '@ambire-common/utils/benzin'
import formatDecimals from '@ambire-common/utils/formatDecimals/formatDecimals'
import { APP_VERSION } from '@common/config/env'
import { SAFE_RPC_METHODS } from '@web/constants/common'
import { notificationManager } from '@web/extension-services/background/webapi/notification'

import { createTab } from '../webapi/tab'
import { RequestRes, Web3WalletPermission } from './types'

type ProviderRequest = DappProviderRequest & { requestRes: RequestRes }

const handleSignMessage = (requestRes: RequestRes) => {
  if (requestRes) {
    if (requestRes?.error) {
      throw ethErrors.rpc.invalidParams({
        message: requestRes?.error
      })
    }

    return requestRes?.hash
  }

  throw new Error('Internal error: request result not found', requestRes)
}

const networkChainIdToHex = (chainId: number | bigint) => {
  try {
    // Remove leading zero in hex representation
    // to match the format expected by dApps (e.g., "0xa" instead of "0x0a")
    return toBeHex(chainId).replace(/^0x0/, '0x')
  } catch (error) {
    return `0x${chainId.toString(16)}`
  }
}

export class ProviderController {
  mainCtrl: MainController

  isUnlocked: boolean

  constructor(mainCtrl: MainController) {
    this.mainCtrl = mainCtrl

    this.isUnlocked = this.mainCtrl.keystore.isReadyToStoreKeys
      ? this.mainCtrl.keystore.isUnlocked
      : true
  }

  _internalGetAccounts = (origin: string) => {
    if (ORIGINS_WHITELISTED_TO_ALL_ACCOUNTS.includes(origin)) {
      const allOtherAccountAddresses = this.mainCtrl.accounts.accounts.reduce((prevValue, acc) => {
        if (acc.addr !== this.mainCtrl.selectedAccount.account?.addr) {
          prevValue.push(acc.addr)
        }

        return prevValue
      }, [] as string[])

      // Selected account goes first in the list
      return [this.mainCtrl.selectedAccount.account?.addr, ...allOtherAccountAddresses]
    }

    return this.mainCtrl.selectedAccount.account?.addr
      ? [this.mainCtrl.selectedAccount.account?.addr]
      : []
  }

  getDappNetwork = (id: string) => {
    const defaultNetwork = this.mainCtrl.networks.networks.find((n) => n.chainId === 1n)
    if (!defaultNetwork)
      throw new Error(
        'Missing default network data, which should never happen. Please contact support.'
      )

    const dappChainId = this.mainCtrl.dapps.getDapp(id)?.chainId
    if (!dappChainId) return defaultNetwork

    return (
      this.mainCtrl.networks.networks.find((n) => n.chainId === BigInt(dappChainId)) ||
      defaultNetwork
    )
  }

  ethRpc = async (request: DappProviderRequest) => {
    const {
      method,
      params,
      session: { id }
    } = request

    const chainId = this.getDappNetwork(id).chainId
    const provider = this.mainCtrl.providers.providers[chainId.toString()]

    if (!this.mainCtrl.dapps.hasPermission(id) && !SAFE_RPC_METHODS.includes(method)) {
      throw ethErrors.provider.unauthorized()
    }

    return provider.send(method, params)
  }

  ethRequestAccounts = async ({ session: { id, origin } }: DappProviderRequest) => {
    if (!this.mainCtrl.dapps.hasPermission(id) || !this.isUnlocked) {
      throw ethErrors.provider.unauthorized()
    }

    const account = this._internalGetAccounts(origin)

    await this.mainCtrl.dapps.broadcastDappSessionEvent('accountsChanged', account)

    return account
  }

  getPortfolioBalance = async ({ params: [chainParams], session: { id } }: DappProviderRequest) => {
    if (!this.mainCtrl.dapps.hasPermission(id) || !this.isUnlocked) {
      throw ethErrors.provider.unauthorized()
    }

    if (!this.mainCtrl.selectedAccount.account) {
      throw new Error('wallet account not selected')
    }

    let totalBalance: number = 0

    if (chainParams && chainParams.chainIds?.length) {
      chainParams.chainIds.forEach((chainId: string) => {
        const network = this.mainCtrl.networks.networks.find(
          (n) => Number(n.chainId) === Number(chainId)
        )
        if (!network) return

        totalBalance +=
          this.mainCtrl.selectedAccount.portfolio.balancePerNetwork[network.chainId.toString()] || 0
      })
    } else {
      totalBalance = this.mainCtrl.selectedAccount.portfolio.totalBalance
    }

    return {
      amount: totalBalance,
      amountFormatted: formatDecimals(totalBalance, 'price'),
      isReady: this.mainCtrl.selectedAccount.portfolio.isAllReady
    }
  }

  // ERC-7811 https://github.com/ethereum/ERCs/pull/709/
  // Adding 'custom' in then name as the ERC is still not completed and might update some
  // specifications.
  walletCustomGetAssets = async ({
    params: { account, assetFilter: _assetFilter },
    session: { id }
  }: DappProviderRequest) => {
    const assetFilter = _assetFilter as { [a: string]: string[] }

    if (!this.mainCtrl.dapps.hasPermission(id) || !this.isUnlocked) {
      throw ethErrors.provider.unauthorized()
    }

    if (!this.mainCtrl.selectedAccount.account) {
      throw new Error('wallet account not selected')
    }

    if (typeof assetFilter !== 'object') throw new Error('Wrong request data format')

    const res: { [chainId: string]: any[] } = {}

    Object.entries(assetFilter).forEach(([chainId, tokens]: [string, string[]]) => {
      if (!res[chainId]) res[chainId] = []
      const network = this.mainCtrl.networks.networks.find(
        (n) => Number(n.chainId) === Number(chainId)
      )
      if (!network) return
      const tokensInPortfolio = this.mainCtrl.selectedAccount.portfolio.tokens
      if (!tokensInPortfolio) return

      tokens.forEach((requestedTokenAddress) => {
        const token = (tokensInPortfolio || []).find(
          ({ address, chainId: tChainId, amount, amountPostSimulation }) => {
            return (
              address === requestedTokenAddress &&
              tChainId === network.chainId &&
              (typeof amount === 'bigint' || typeof amountPostSimulation === 'bigint')
            )
          }
        )
        if (!token) return
        res[chainId].push({
          address: token.address,
          balance: `0x${(token.amountPostSimulation || token.amount || 0).toString(16)}`,
          type: 'ERC20',
          metadata: {
            symbol: token.symbol,
            decimals: token.decimals,
            name: token.name
          }
        })
      })
    })

    return res
  }

  @Reflect.metadata('SAFE', true)
  ethAccounts = async ({ session: { id, origin } }: DappProviderRequest) => {
    if (!this.mainCtrl.dapps.hasPermission(id) || !this.isUnlocked) {
      return []
    }

    return this._internalGetAccounts(origin)
  }

  ethCoinbase = async ({ session: { id } }: DappProviderRequest) => {
    if (!this.mainCtrl.dapps.hasPermission(id) || !this.isUnlocked) {
      return null
    }

    return this.mainCtrl.selectedAccount.account?.addr || null
  }

  @Reflect.metadata('SAFE', true)
  ethChainId = async ({ session: { id } }: DappProviderRequest) => {
    if (this.mainCtrl.dapps.hasPermission(id)) {
      return networkChainIdToHex(this.mainCtrl.dapps.getDapp(id)?.chainId || 1)
    }
    return networkChainIdToHex(1)
  }

  @Reflect.metadata('ACTION_REQUEST', ['SendTransaction', false])
  ethSendTransaction = async (request: ProviderRequest) => {
    const { requestRes } = cloneDeep(request)
    if (requestRes?.hash) return requestRes.hash
    throw new Error('Transaction failed!')
  }

  @Reflect.metadata('SAFE', true)
  netVersion = ({ session: { id } }: any) => this.getDappNetwork(id).chainId.toString()

  @Reflect.metadata('SAFE', true)
  web3ClientVersion = () => {
    return `Ambire v${APP_VERSION}`
  }

  @Reflect.metadata('ACTION_REQUEST', ['SignText', false])
  personalSign = async ({ requestRes }: ProviderRequest) => {
    return handleSignMessage(requestRes)
  }

  @Reflect.metadata('ACTION_REQUEST', ['SignTypedData', false])
  ethSignTypedData = async ({ requestRes }: ProviderRequest) => {
    return handleSignMessage(requestRes)
  }

  @Reflect.metadata('ACTION_REQUEST', ['SignTypedData', false])
  ethSignTypedDataV1 = async ({ requestRes }: ProviderRequest) => {
    return handleSignMessage(requestRes)
  }

  @Reflect.metadata('ACTION_REQUEST', ['SignTypedData', false])
  ethSignTypedDataV3 = async ({ requestRes }: ProviderRequest) => {
    return handleSignMessage(requestRes)
  }

  @Reflect.metadata('ACTION_REQUEST', ['SignTypedData', false])
  ethSignTypedDataV4 = async ({ requestRes }: ProviderRequest) => {
    return handleSignMessage(requestRes)
  }

  @Reflect.metadata('ACTION_REQUEST', [
    'AddChain',
    ({ request }: { request: ProviderRequest; mainCtrl: MainController }) => {
      const { params } = request
      if (!params[0]) {
        throw ethErrors.rpc.invalidParams('params is required but got []')
      }
      if (!params[0]?.chainId) {
        throw ethErrors.rpc.invalidParams('chainId is required')
      }

      return false
    }
  ])
  walletAddEthereumChain = async ({ params: [chainParams], session: { id } }: ProviderRequest) => {
    let chainId = chainParams.chainId
    if (typeof chainId === 'string') {
      chainId = Number(chainId)
    }

    const network = this.mainCtrl.networks.networks.find((n) => Number(n.chainId) === chainId)

    if (!network) {
      throw new Error('This chain is not supported by Ambire yet.')
    }

    this.mainCtrl.dapps.updateDapp(id, { chainId })
    await this.mainCtrl.dapps.broadcastDappSessionEvent(
      'chainChanged',
      {
        chain: `0x${network.chainId.toString(16)}`,
        networkVersion: `${network.chainId}`
      },
      id
    )

    return null
  }

  // explain to the dapp what features the wallet has for the selected account
  walletGetCapabilities = async (data: any) => {
    if (!this.mainCtrl.dapps.hasPermission(data.session.id) || !this.isUnlocked) {
      throw ethErrors.provider.unauthorized()
    }

    if (!data.params || !data.params.length) {
      throw ethErrors.rpc.invalidParams('params is required but got []')
    }

    const accountAddr = data.params[0]
    const state = this.mainCtrl.accounts.accountStates[accountAddr]
    if (!state) {
      throw ethErrors.rpc.invalidParams(`account with address ${accountAddr} does not exist`)
    }

    const states = await this.mainCtrl.accounts.getOrFetchAccountStates(accountAddr)
    const capabilities: any = {}
    this.mainCtrl.networks.networks.forEach((network) => {
      const accountState = states[network.chainId.toString()]

      // if there's no account state for some reason (RPC not working atm),
      // we should play it safe and return false for everything
      if (!accountState) {
        capabilities[networkChainIdToHex(network.chainId)] = {
          atomicBatch: {
            supported: false
          },
          auxiliaryFunds: {
            supported: false
          },
          paymasterService: {
            supported: false
          },
          atomic: {
            status: 'unsupported'
          }
        }
        return
      }

      const accout = this.mainCtrl.accounts.accounts.find((acc) => acc.addr === accountAddr)!
      const baseAccount = getBaseAccount(
        accout,
        accountState,
        this.mainCtrl.keystore.keys.filter((key) => accout.associatedKeys.includes(key.addr)),
        network
      )
      const isSmart = baseAccount.getAtomicStatus() !== 'unsupported'

      capabilities[networkChainIdToHex(network.chainId)] = {
        atomicBatch: {
          supported: true
        },
        auxiliaryFunds: {
          supported: isSmart
        },
        paymasterService: {
          supported:
            isSmart &&
            // enabled: obvious, it means we're operaring with 4337
            // hasBundlerSupport means it might not be 4337 but we support it
            // our default may be the relayer but we will broadcast an userOp
            // in case of sponsorships
            (network.erc4337.enabled || network.erc4337.hasBundlerSupport)
        },
        atomic: {
          status: baseAccount.getAtomicStatus()
        }
      }
    })
    return capabilities
  }

  @Reflect.metadata('ACTION_REQUEST', ['SendTransaction', false])
  walletSendCalls = async (data: any) => {
    if (data.requestRes && data.requestRes.hash) {
      return data.requestRes.hash
    }

    throw new Error('Transaction failed!')
  }

  walletGetCallsStatus = async (data: any) => {
    if (!data.params || !data.params.length) {
      throw ethErrors.rpc.invalidParams('params is required but got []')
    }

    const id = data.params[0]
    if (!id) throw ethErrors.rpc.invalidParams('no identifier passed')

    const splitInParts = id.split(':')
    if (splitInParts.length < 2) throw ethErrors.rpc.invalidParams('invalid identifier passed')

    const type = splitInParts[0]
    const identifier = splitInParts[1]
    const bundlerName = splitInParts.length >= 3 ? splitInParts[2] : undefined
    const identifiedBy: AccountOpIdentifiedBy = {
      type,
      identifier,
      bundler: bundlerName
    }

    const dappNetwork = this.getDappNetwork(data.session.id)
    const network = this.mainCtrl.networks.networks.filter(
      (n) => n.chainId === dappNetwork.chainId
    )[0]
    const accOp = this.mainCtrl.selectedAccount.account
      ? this.mainCtrl.activity.findByIdentifiedBy(
          identifiedBy,
          this.mainCtrl.selectedAccount.account.addr,
          network.chainId
        )
      : undefined
    const version = getVersion(accOp)

    const txnIdData = await fetchTxnId(
      identifiedBy,
      network,
      this.mainCtrl.fetch,
      this.mainCtrl.callRelayer
    )
    if (txnIdData.status === 'rejected') {
      return {
        status: getFailureStatus(version)
      }
    }
    if (txnIdData.status !== 'success') {
      return {
        status: getPendingStatus(version)
      }
    }

    const isMultipleTxn = isIdentifiedByMultipleTxn(identifiedBy)
    const txnId = txnIdData.txnId as string
    const provider = getRpcProvider(network.rpcUrls, network.chainId, network.selectedRpcUrl)
    const isUserOp = identifiedBy.type === 'UserOperation'
    const bundler = bundlerName ? getBundlerByName(bundlerName) : getDefaultBundler(network)

    const receipts = []
    if (isUserOp) {
      const userOpReceipt = await bundler
        .getReceipt(identifiedBy.identifier, network)
        .catch(() => null)
      if (!userOpReceipt) {
        return {
          status: getPendingStatus(version)
        }
      }

      receipts.push(userOpReceipt)
    } else if (!isMultipleTxn) {
      const txnReceipt = await provider.getTransactionReceipt(txnId).catch(() => null)
      if (!txnReceipt) {
        return {
          status: getPendingStatus(version)
        }
      }

      receipts.push(txnReceipt)
    } else {
      const txnIds = identifiedBy.identifier.split('-')
      const txnReceipts = await Promise.all(
        txnIds.map((oneTxnId) => provider.getTransactionReceipt(oneTxnId).catch(() => null))
      )
      const foundTxnReceipts = txnReceipts.filter((r) => r)

      if (!foundTxnReceipts.length || foundTxnReceipts.length < txnIds.length) {
        return {
          status: getPendingStatus(version)
        }
      }

      receipts.push(...foundTxnReceipts)
    }

    return {
      version,
      id: identifiedBy,
      atomic: !isMultipleTxn,
      status: getSuccessStatus(version),
      receipts: receipts.map((receipt) => {
        const txnStatus = isUserOp
          ? toBeHex(receipt.receipt.status as number, 1)
          : toBeHex(receipt.status as number, 1)
        const status = txnStatus === '0x01' || txnStatus === '0x1' ? '0x1' : '0x0'
        return {
          logs: receipt.logs,
          status,
          chainId: networkChainIdToHex(network.chainId),
          blockHash: isUserOp ? receipt.receipt.blockHash : receipt.blockHash,
          blockNumber: isUserOp
            ? receipt.receipt.blockNumber
            : toBeHex(receipt.blockNumber as number),
          gasUsed: isUserOp ? receipt.receipt.gasUsed : toBeHex(receipt.gasUsed),
          transactionHash: isUserOp ? receipt.receipt.transactionHash : receipt.hash
        }
      })
    }
  }

  // open benzina in a separate tab upon a dapp request
  walletShowCallsStatus = async (data: any) => {
    if (!data.params || !data.params.length) {
      throw ethErrors.rpc.invalidParams('params is required but got []')
    }

    const id = data.params[0]
    if (!id) throw ethErrors.rpc.invalidParams('no identifier passed')

    const splitInParts = id.split(':')
    if (splitInParts.length < 2) throw ethErrors.rpc.invalidParams('invalid identifier passed')

    const type = splitInParts[0]
    const identifier = splitInParts[1]
    const bundlerName = splitInParts.length >= 3 ? splitInParts[2] : undefined
    const identifiedBy: AccountOpIdentifiedBy = {
      type,
      identifier,
      bundler: bundlerName
    }

    const dappNetwork = this.getDappNetwork(data.session.id)
    const network = this.mainCtrl.networks.networks.filter(
      (n) => n.chainId === dappNetwork.chainId
    )[0]
    const chainId = Number(network.chainId)

    const link = `https://explorer.ambire.com/${getBenzinUrlParams({
      txnId: identifiedBy.type === 'Transaction' ? identifiedBy.identifier : null,
      chainId,
      identifiedBy
    })}`

    await createTab(link)
  }

  @Reflect.metadata('ACTION_REQUEST', [
    'AddChain',
    ({ request, mainCtrl }: { request: ProviderRequest; mainCtrl: MainController }) => {
      const { params, session } = request
      if (!params[0]) {
        throw ethErrors.rpc.invalidParams('params is required but got []')
      }
      if (!params[0]?.chainId) {
        throw ethErrors.rpc.invalidParams('chainId is required')
      }
      const dapp = mainCtrl.dapps.getDapp(session.id)
      const { chainId } = params[0]
      const network = mainCtrl.networks.networks.find(
        (n: any) => Number(n.chainId) === Number(chainId)
      )
      if (!dapp?.isConnected) return false

      if (!network) {
        throw ethErrors.provider.custom({
          code: 4902,
          message:
            'Unrecognized chain ID. Try adding the chain using wallet_addEthereumChain first.'
        })
      }
      return true
    }
  ])
  walletSwitchEthereumChain = async ({
    params: [chainParams],
    session: { id, origin, name }
  }: ProviderRequest) => {
    let chainId = chainParams.chainId
    if (typeof chainId === 'string') chainId = Number(chainId)

    const network = this.mainCtrl.networks.networks.find((n) => Number(n.chainId) === chainId)
    if (!network) throw new Error('This chain is not supported by Ambire yet.')

    const dapp = this.mainCtrl.dapps.getDapp(id)

    if (!dapp) return null

    if (dapp?.chainId !== chainId) {
      this.mainCtrl.dapps.updateDapp(id, { chainId })
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      ;(async () => {
        await notificationManager.create({
          title: 'Successfully switched network',
          message: `Network switched to ${network.name} for ${name || origin}.`
        })
      })()
      await this.mainCtrl.dapps.broadcastDappSessionEvent(
        'chainChanged',
        {
          chain: `0x${network.chainId.toString(16)}`,
          networkVersion: `${network.chainId}`
        },
        id
      )
    }

    return null
  }

  @Reflect.metadata('ACTION_REQUEST', ['WalletWatchAsset', false])
  walletWatchAsset = () => true

  @Reflect.metadata('ACTION_REQUEST', ['GetEncryptionPublicKey', false])
  ethGetEncryptionPublicKey = ({ requestRes }: ProviderRequest) => ({
    result: requestRes
  })

  walletRequestPermissions = ({ params: permissions, session }: DappProviderRequest) => {
    const result: Web3WalletPermission[] = []

    if (permissions && 'eth_accounts' in permissions[0]) {
      const dapp = this.mainCtrl.dapps.getDapp(session.id)
      const grantedPermissionId = dapp?.grantedPermissionId || nanoid(21)
      const grantedPermissionAt = dapp?.grantedPermissionAt || Date.now()
      const account = this._internalGetAccounts(session.origin)

      result.push({
        id: grantedPermissionId,
        parentCapability: 'eth_accounts',
        invoker: session.origin,
        caveats: [{ type: 'restrictReturnedAccounts', value: account }],
        date: grantedPermissionAt
      })

      // TODO: Undecided yet if we should support this `parentCapability` permission too
      // const chainIds = this.mainCtrl.networks.networks.map((n) => networkChainIdToHex(n.chainId))
      // result.push({
      //   id: grantedPermissionId,
      //   parentCapability: 'endowment:permitted-chains',
      //   invoker: session.origin,
      //   caveats: [{ type: 'restrictNetworkSwitching', value: chainIds }],
      //   date: grantedPermissionAt
      // })

      this.mainCtrl.dapps.updateDapp(session.id, { grantedPermissionId, grantedPermissionAt })
    }

    return result
  }

  /**
   * Revokes the current dapp permissions. Experimental, but supported in MetaMask. Specified by MIP-2:
   * {@link https://github.com/MetaMask/metamask-improvement-proposals/blob/main/MIPs/mip-2.md}
   */
  @Reflect.metadata('SAFE', true)
  walletRevokePermissions = async ({ session: { id } }: DappProviderRequest) => {
    await this.mainCtrl.dapps.broadcastDappSessionEvent('disconnect', undefined, id)
    this.mainCtrl.dapps.updateDapp(id, {
      isConnected: false,
      grantedPermissionId: undefined,
      grantedPermissionAt: undefined
    })
    return null
  }

  @Reflect.metadata('SAFE', true)
  walletGetPermissions = ({ session: { id, origin } }: DappProviderRequest) => {
    const result: Web3WalletPermission[] = []
    const { grantedPermissionId, grantedPermissionAt } = this.mainCtrl.dapps.getDapp(id) || {}

    // Do not check if extension is unlocked, always return the permissions if one are granted
    const hasGrantedPermission =
      !!grantedPermissionId && !!grantedPermissionAt && this.mainCtrl.dapps.hasPermission(id)
    if (hasGrantedPermission) {
      const account = this._internalGetAccounts(origin)

      result.push({
        id: grantedPermissionId,
        parentCapability: 'eth_accounts',
        invoker: origin,
        caveats: [{ type: 'restrictReturnedAccounts', value: account }],
        date: grantedPermissionAt
      })

      // TODO: Undecided yet if we should support this `parentCapability` permission too
      // const chainIds = this.mainCtrl.networks.networks.map((n) => networkChainIdToHex(n.chainId))
      // result.push({
      //   id: grantedPermissionId,
      //   parentCapability: 'endowment:permitted-chains',
      //   invoker: origin,
      //   caveats: [{ type: 'restrictNetworkSwitching', value: chainIds }],
      //   date: grantedPermissionAt
      // })
    }

    return result
  }

  personalEcRecover = ({ params: [data, sig, extra = {}] }: DappProviderRequest) => {
    // TODO:
  }

  @Reflect.metadata('SAFE', true)
  netListening = () => {
    return true
  }
}
