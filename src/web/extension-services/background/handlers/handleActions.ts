/* eslint-disable no-await-in-loop */
/* eslint-disable no-param-reassign */
/* eslint-disable @typescript-eslint/return-await */
import { BIP44_STANDARD_DERIVATION_TEMPLATE } from '@ambire-common/consts/derivation'
import { MainController } from '@ambire-common/controllers/main/main'
import {
  SIGN_ACCOUNT_OP_MAIN,
  SIGN_ACCOUNT_OP_SWAP,
  SIGN_ACCOUNT_OP_TRANSFER,
  SIGN_ACCOUNT_OP_PRIVACY_POOLS,
  SignAccountOpType
} from '@ambire-common/controllers/signAccountOp/helper'
import { KeyIterator } from '@ambire-common/libs/keyIterator/keyIterator'
import wait from '@ambire-common/utils/wait'
import { browser } from '@web/constants/browserapi'
import { Action } from '@web/extension-services/background/actions'
import AutoLockController from '@web/extension-services/background/controllers/auto-lock'
import { ExtensionUpdateController } from '@web/extension-services/background/controllers/extension-update'
import { WalletStateController } from '@web/extension-services/background/controllers/wallet-state'
import { controllersNestedInMainMapping } from '@web/extension-services/background/types'
import { Port, PortMessenger } from '@web/extension-services/messengers'
import LatticeKeyIterator from '@web/modules/hardware-wallet/libs/latticeKeyIterator'
import LedgerKeyIterator from '@web/modules/hardware-wallet/libs/ledgerKeyIterator'
import TrezorKeyIterator from '@web/modules/hardware-wallet/libs/trezorKeyIterator'

import sessionStorage from '../webapi/sessionStorage'

export const handleActions = async (
  action: Action,
  {
    pm,
    port,
    mainCtrl,
    walletStateCtrl,
    autoLockCtrl,
    extensionUpdateCtrl,
    windowId
  }: {
    pm: PortMessenger
    port: Port
    mainCtrl: MainController
    walletStateCtrl: WalletStateController
    autoLockCtrl: AutoLockController
    extensionUpdateCtrl: ExtensionUpdateController
    windowId?: number
  }
) => {
  // @ts-ignore
  const { type, params } = action
  switch (type) {
    case 'UPDATE_PORT_URL': {
      if (port.sender) {
        port.sender.url = params.url
        if (port.sender.tab) port.sender.tab.url = params.url
      }
      break
    }
    case 'INIT_CONTROLLER_STATE': {
      if (params.controller === ('main' as any)) {
        const mainCtrlState: any = { ...mainCtrl.toJSON() }
        // We are removing the state of the nested controllers in main to avoid the CPU-intensive task of parsing + stringifying.
        // We should access the state of the nested controllers directly from their context instead of accessing them through the main ctrl state on the FE.
        // Keep in mind: if we just spread `ctrl` instead of calling `ctrl.toJSON()`, the getters won't be included.
        Object.keys(controllersNestedInMainMapping).forEach((nestedCtrlName) => {
          delete mainCtrlState[nestedCtrlName]
        })
        pm.send('> ui', { method: 'main', params: mainCtrlState })
      } else if (params.controller === ('walletState' as any)) {
        pm.send('> ui', { method: 'walletState', params: walletStateCtrl })
      } else if (params.controller === ('autoLock' as any)) {
        pm.send('> ui', { method: 'autoLock', params: autoLockCtrl })
      } else if (params.controller === ('extensionUpdate' as any)) {
        pm.send('> ui', { method: 'extensionUpdate', params: extensionUpdateCtrl })
      } else {
        pm.send('> ui', {
          method: params.controller,
          params: (mainCtrl as any)[params.controller]
        })
      }
      break
    }
    case 'MAIN_CONTROLLER_ON_POPUP_OPEN':
      return mainCtrl.onPopupOpen()
    case 'MAIN_CONTROLLER_LOCK':
      return mainCtrl.lock()
    case 'MAIN_CONTROLLER_ACCOUNT_PICKER_INIT_LEDGER': {
      return await mainCtrl.handleAccountPickerInitLedger(LedgerKeyIterator)
    }
    case 'MAIN_CONTROLLER_ACCOUNT_PICKER_INIT_TREZOR': {
      return await mainCtrl.handleAccountPickerInitTrezor(TrezorKeyIterator)
    }
    case 'MAIN_CONTROLLER_ACCOUNT_PICKER_INIT_LATTICE': {
      return await mainCtrl.handleAccountPickerInitLattice(LatticeKeyIterator)
    }
    case 'MAIN_CONTROLLER_ACCOUNT_PICKER_INIT_PRIVATE_KEY_OR_SEED_PHRASE': {
      const hdPathTemplate = BIP44_STANDARD_DERIVATION_TEMPLATE
      const keyIterator = new KeyIterator(params.privKeyOrSeed, params.seedPassphrase)
      await mainCtrl.accountPicker.setInitParams({ keyIterator, hdPathTemplate })
      break
    }
    case 'MAIN_CONTROLLER_ACCOUNT_PICKER_INIT_FROM_SAVED_SEED_PHRASE': {
      const keystoreSavedSeed = await mainCtrl.keystore.getSavedSeed(params.id)
      if (!keystoreSavedSeed) return

      const keyIterator = new KeyIterator(keystoreSavedSeed.seed, keystoreSavedSeed.seedPassphrase)
      await mainCtrl.accountPicker.setInitParams({
        keyIterator,
        hdPathTemplate: keystoreSavedSeed.hdPathTemplate
      })
      break
    }
    case 'MAIN_CONTROLLER_ADD_NETWORK': {
      return await mainCtrl.addNetwork(params)
    }
    case 'ACCOUNTS_CONTROLLER_UPDATE_ACCOUNT_PREFERENCES': {
      return await mainCtrl.accounts.updateAccountPreferences(params)
    }
    case 'ACCOUNTS_CONTROLLER_REORDER_ACCOUNTS': {
      return await mainCtrl.accounts.reorderAccounts(params)
    }
    case 'ACCOUNTS_CONTROLLER_UPDATE_ACCOUNT_STATE': {
      return await mainCtrl.accounts.updateAccountState(params.addr, 'latest', params.chainIds)
    }
    case 'ACCOUNTS_CONTROLLER_RESET_ACCOUNTS_NEWLY_ADDED_STATE': {
      return await mainCtrl.accounts.resetAccountsNewlyAddedState()
    }
    case 'SETTINGS_CONTROLLER_SET_NETWORK_TO_ADD_OR_UPDATE': {
      return await mainCtrl.networks.setNetworkToAddOrUpdate(params)
    }
    case 'SETTINGS_CONTROLLER_RESET_NETWORK_TO_ADD_OR_UPDATE': {
      return await mainCtrl.networks.setNetworkToAddOrUpdate(null)
    }
    case 'KEYSTORE_CONTROLLER_UPDATE_KEY_PREFERENCES': {
      return await mainCtrl.keystore.updateKeyPreferences(params)
    }
    case 'MAIN_CONTROLLER_UPDATE_NETWORK': {
      return await mainCtrl.networks.updateNetwork(params.network, params.chainId)
    }
    case 'MAIN_CONTROLLER_UPDATE_NETWORKS': {
      return await mainCtrl.networks.updateNetworks(params.network, params.chainIds)
    }
    case 'MAIN_CONTROLLER_SELECT_ACCOUNT': {
      return await mainCtrl.selectAccount(params.accountAddr)
    }
    case 'MAIN_CONTROLLER_ACCOUNT_PICKER_SELECT_ACCOUNT': {
      return mainCtrl.accountPicker.selectAccount(params.account)
    }
    case 'MAIN_CONTROLLER_ACCOUNT_PICKER_DESELECT_ACCOUNT': {
      return mainCtrl.accountPicker.deselectAccount(params.account)
    }
    case 'MAIN_CONTROLLER_ACCOUNT_PICKER_RESET': {
      await mainCtrl.accountPicker.reset()
      break
    }
    case 'MAIN_CONTROLLER_ACCOUNT_PICKER_INIT': {
      mainCtrl.accountPicker.init()
      break
    }
    case 'RESET_ACCOUNT_ADDING_ON_PAGE_ERROR': {
      await mainCtrl.accountPicker.reset()
      const accounts = [...mainCtrl.accounts.accounts]
      // eslint-disable-next-line no-restricted-syntax
      for (const account of accounts) {
        if (account.newlyAdded) {
          // eslint-disable-next-line no-await-in-loop
          await mainCtrl.removeAccount(account.addr)
        }
      }

      break
    }
    case 'MAIN_CONTROLLER_ACCOUNT_PICKER_RESET_ACCOUNTS_SELECTION': {
      mainCtrl.accountPicker.resetAccountsSelection()
      break
    }
    case 'MAIN_CONTROLLER_ACCOUNT_PICKER_SET_PAGE':
      return await mainCtrl.accountPicker.setPage(params)
    case 'MAIN_CONTROLLER_ACCOUNT_PICKER_SET_HD_PATH_TEMPLATE': {
      return await mainCtrl.accountPicker.setHDPathTemplate(params)
    }
    case 'MAIN_CONTROLLER_ACCOUNT_PICKER_ADD_ACCOUNTS': {
      await mainCtrl.accountPicker.addAccounts()
      break
    }
    case 'IMPORT_SMART_ACCOUNT_JSON': {
      // Add accounts first, because some of the next steps have validation
      // if accounts exists.
      await mainCtrl.accounts.addAccounts([params.readyToAddAccount])

      // Then add keys, because some of the next steps could have validation
      // if keys exists. Should be separate (not combined in Promise.all,
      // since firing multiple keystore actions is not possible
      // (the #wrapKeystoreAction listens for the first one to finish and
      // skips the parallel one, if one is requested).

      return await mainCtrl.keystore.addKeys(params.keys)
    }
    case 'MAIN_CONTROLLER_ADD_VIEW_ONLY_ACCOUNTS': {
      // Since these accounts are view-only, directly add them in the
      // MainController, bypassing the AccountPicker flow.
      await mainCtrl.accounts.addAccounts(params.accounts)
      break
    }
    case 'MAIN_CONTROLLER_REMOVE_ACCOUNT': {
      return await mainCtrl.removeAccount(params.accountAddr)
    }
    case 'MAIN_CONTROLLER_REJECT_SIGN_ACCOUNT_OP_CALL': {
      return mainCtrl.rejectSignAccountOpCall(params.callId)
    }
    case 'MAIN_CONTROLLER_REJECT_ACCOUNT_OP':
      return mainCtrl.rejectAccountOpAction(
        params.err,
        params.actionId,
        params.shouldOpenNextAction
      )
    case 'MAIN_CONTROLLER_SIGN_MESSAGE_INIT': {
      return await mainCtrl.signMessage.init(params)
    }
    case 'MAIN_CONTROLLER_SIGN_MESSAGE_RESET':
      return mainCtrl.signMessage.reset()
    case 'MAIN_CONTROLLER_HANDLE_SIGN_MESSAGE': {
      mainCtrl.signMessage.setSigningKey(params.keyAddr, params.keyType)
      return await mainCtrl.handleSignMessage()
    }
    case 'MAIN_CONTROLLER_ACTIVITY_SET_ACC_OPS_FILTERS':
      return mainCtrl.activity.filterAccountsOps(
        params.sessionId,
        params.filters,
        params.pagination
      )
    case 'MAIN_CONTROLLER_ACTIVITY_SET_SIGNED_MESSAGES_FILTERS':
      return mainCtrl.activity.filterSignedMessages(
        params.sessionId,
        params.filters,
        params.pagination
      )
    case 'MAIN_CONTROLLER_ACTIVITY_RESET_ACC_OPS_FILTERS':
      return mainCtrl.activity.resetAccountsOpsFilters(params.sessionId)
    case 'MAIN_CONTROLLER_ACTIVITY_RESET_SIGNED_MESSAGES_FILTERS':
      return mainCtrl.activity.resetSignedMessagesFilters(params.sessionId)
    case 'ACTIVITY_CONTROLLER_HIDE_BANNER':
      return await mainCtrl.activity.hideBanner(params)

    case 'MAIN_CONTROLLER_SIGN_ACCOUNT_OP_UPDATE':
      return mainCtrl?.signAccountOp?.update(params)
    case 'MAIN_CONTROLLER_SIGN_ACCOUNT_OP_UPDATE_STATUS':
      return mainCtrl?.signAccountOp?.updateStatus(params.status)
    case 'MAIN_CONTROLLER_HANDLE_SIGN_AND_BROADCAST_ACCOUNT_OP': {
      let signAccountOpType: SignAccountOpType

      console.log('DEBUG: MAIN_CONTROLLER_HANDLE_SIGN_AND_BROADCAST_ACCOUNT_OP', params.updateType)

      if (params.updateType === 'Main') {
        signAccountOpType = SIGN_ACCOUNT_OP_MAIN
      } else if (params.updateType === 'Swap&Bridge') {
        signAccountOpType = SIGN_ACCOUNT_OP_SWAP
      } else if (params.updateType === 'PrivacyPools') {
        signAccountOpType = SIGN_ACCOUNT_OP_PRIVACY_POOLS
      } else {
        signAccountOpType = SIGN_ACCOUNT_OP_TRANSFER
      }

      return await mainCtrl.handleSignAndBroadcastAccountOp(signAccountOpType)
    }
    case 'MAIN_CONTROLLER_SIGN_ACCOUNT_OP_INIT':
      return mainCtrl.initSignAccOp(params.actionId)
    case 'MAIN_CONTROLLER_SIGN_ACCOUNT_OP_DESTROY':
      return mainCtrl.destroySignAccOp()

    case 'REQUESTS_CONTROLLER_BUILD_REQUEST':
      return await mainCtrl.requests.build(params)
    case 'REQUESTS_CONTROLLER_ADD_USER_REQUEST':
      return await mainCtrl.requests.addUserRequests([params.userRequest], {
        actionPosition: params.actionPosition,
        actionExecutionType: params.actionExecutionType,
        allowAccountSwitch: params.allowAccountSwitch,
        skipFocus: params.skipFocus
      })
    case 'REQUESTS_CONTROLLER_REMOVE_USER_REQUEST':
      return mainCtrl.requests.removeUserRequests([params.id])
    case 'REQUESTS_CONTROLLER_RESOLVE_USER_REQUEST':
      return mainCtrl.requests.resolveUserRequest(params.data, params.id)
    case 'REQUESTS_CONTROLLER_REJECT_USER_REQUEST':
      return mainCtrl.requests.rejectUserRequests(params.err, [params.id])

    case 'SIGN_ACCOUNT_OP_UPDATE': {
      console.log('DEBUG: SIGN_ACCOUNT_OP_UPDATE', params)

      if (params.updateType === 'Main') {
        return mainCtrl?.signAccountOp?.update(params)
      }

      if (params.updateType === 'Swap&Bridge') {
        return mainCtrl?.swapAndBridge?.signAccountOpController?.update(params)
      }

      if (params.updateType === 'PrivacyPools') {
        return mainCtrl?.privacyPools?.signAccountOpController?.update(params)
      }

      // 'Transfer&TopUp'
      return mainCtrl?.transfer?.signAccountOpController?.update(params)
    }

    case 'SELECTED_ACCOUNT_SET_DASHBOARD_NETWORK_FILTER': {
      mainCtrl.selectedAccount.setDashboardNetworkFilter(params.dashboardNetworkFilter)
      break
    }

    case 'DISMISS_DEFI_POSITIONS_BANNER': {
      await mainCtrl.selectedAccount.dismissDefiPositionsBannerForTheSelectedAccount()
      break
    }

    case 'SWAP_AND_BRIDGE_CONTROLLER_INIT_FORM':
      return await mainCtrl.swapAndBridge.initForm(params.sessionId, {
        preselectedFromToken: params.preselectedFromToken,
        preselectedToToken: params.preselectedToToken ?? undefined,
        fromAmount: params.fromAmount ?? undefined,
        activeRouteIdToDelete: params.activeRouteIdToDelete ?? undefined
      })
    case 'SWAP_AND_BRIDGE_CONTROLLER_UNLOAD_SCREEN':
      return mainCtrl.swapAndBridge.unloadScreen(params.sessionId, params.forceUnload)
    case 'SWAP_AND_BRIDGE_CONTROLLER_UPDATE_FORM':
      return mainCtrl.swapAndBridge.updateForm(params.formValues, params.updateProps)
    case 'SWAP_AND_BRIDGE_CONTROLLER_SWITCH_FROM_AND_TO_TOKENS':
      return await mainCtrl.swapAndBridge.switchFromAndToTokens()
    case 'SWAP_AND_BRIDGE_CONTROLLER_ADD_TO_TOKEN_BY_ADDRESS':
      return await mainCtrl.swapAndBridge.addToTokenByAddress(params.address)
    case 'SWAP_AND_BRIDGE_CONTROLLER_SEARCH_TO_TOKEN':
      return await mainCtrl.swapAndBridge.searchToToken(params.searchTerm)
    case 'SWAP_AND_BRIDGE_CONTROLLER_SELECT_ROUTE':
      return await mainCtrl.swapAndBridge.selectRoute(params.route, params.isAutoSelectDisabled)
    case 'REQUESTS_CONTROLLER_SWAP_AND_BRIDGE_ACTIVE_ROUTE_BUILD_NEXT_USER_REQUEST':
      return await mainCtrl.requests.build({
        type: 'swapAndBridgeRequest',
        params: {
          openActionWindow: true,
          activeRouteId: params.activeRouteId,
          windowId
        }
      })
    case 'SWAP_AND_BRIDGE_CONTROLLER_UPDATE_QUOTE': {
      await mainCtrl.swapAndBridge.updateQuote({
        skipPreviousQuoteRemoval: true,
        skipQuoteUpdateOnSameValues: false,
        skipStatusUpdate: false
      })
      break
    }
    case 'SWAP_AND_BRIDGE_CONTROLLER_RESET_FORM':
      return mainCtrl.swapAndBridge.resetForm()
    case 'SWAP_AND_BRIDGE_CONTROLLER_MARK_SELECTED_ROUTE_AS_FAILED':
      return mainCtrl.swapAndBridge.markSelectedRouteAsFailed()
    case 'SWAP_AND_BRIDGE_CONTROLLER_SIGN_ACCOUNT_OP_UPDATE':
      return mainCtrl?.swapAndBridge?.signAccountOpController?.update(params)
    case 'SWAP_AND_BRIDGE_CONTROLLER_SIGN_ACCOUNT_OP_UPDATE_STATUS':
      return mainCtrl?.swapAndBridge?.signAccountOpController?.updateStatus(params.status)
    case 'SWAP_AND_BRIDGE_CONTROLLER_HAS_USER_PROCEEDED':
      return mainCtrl?.swapAndBridge.setUserProceeded(params.proceeded)
    case 'SWAP_AND_BRIDGE_CONTROLLER_IS_AUTO_SELECT_ROUTE_DISABLED':
      return mainCtrl?.swapAndBridge.setIsAutoSelectRouteDisabled(params.isDisabled)
    case 'SWAP_AND_BRIDGE_CONTROLLER_DESTROY_SIGN_ACCOUNT_OP':
      return mainCtrl?.swapAndBridge.destroySignAccountOp()
    case 'OPEN_SIGNING_ACTION_WINDOW': {
      if (!mainCtrl.selectedAccount.account) throw new Error('No selected account')

      const idSuffix = params.type === 'swapAndBridge' ? 'swap-and-bridge-sign' : 'transfer-sign'

      return mainCtrl.requests.actions.addOrUpdateActions(
        [
          {
            id: `${mainCtrl.selectedAccount.account.addr}-${idSuffix}`,
            type: params.type,
            userRequest: {
              meta: {
                accountAddr: mainCtrl.selectedAccount.account.addr
              }
            }
          }
        ],
        {
          position: 'last',
          executionType: 'open-action-window',
          baseWindowId: windowId
        }
      )
    }
    case 'CLOSE_SIGNING_ACTION_WINDOW': {
      if (!mainCtrl.selectedAccount.account) throw new Error('No selected account')

      const idSuffix = params.type === 'swapAndBridge' ? 'swap-and-bridge-sign' : 'transfer-sign'

      return mainCtrl.requests.actions.removeActions([
        `${mainCtrl.selectedAccount.account.addr}-${idSuffix}`
      ])
    }
    case 'TRANSFER_CONTROLLER_UPDATE_FORM':
      return mainCtrl.transfer.update(params.formValues)
    case 'TRANSFER_CONTROLLER_RESET_FORM':
      return mainCtrl.transfer.resetForm()
    case 'TRANSFER_CONTROLLER_UNLOAD_SCREEN':
      return mainCtrl.transfer.unloadScreen(false)
    case 'TRANSFER_CONTROLLER_DESTROY_LATEST_BROADCASTED_ACCOUNT_OP':
      return mainCtrl.transfer.destroyLatestBroadcastedAccountOp()
    case 'TRANSFER_CONTROLLER_HAS_USER_PROCEEDED':
      return mainCtrl.transfer.setUserProceeded(params.proceeded)
    case 'TRANSFER_CONTROLLER_SHOULD_SKIP_TRANSACTION_QUEUED_MODAL':
      mainCtrl.transfer.shouldSkipTransactionQueuedModal = params.shouldSkip
      return
    case 'TRANSFER_CONTROLLER_SIGN_ACCOUNT_OP_UPDATE':
      return mainCtrl?.transfer?.signAccountOpController?.update(params)
    case 'TRANSFER_CONTROLLER_SIGN_ACCOUNT_OP_UPDATE_STATUS':
      return mainCtrl?.transfer?.signAccountOpController?.updateStatus(params.status)
    case 'MAIN_CONTROLLER_REMOVE_ACTIVE_ROUTE':
      return mainCtrl.removeActiveRoute(params.activeRouteId)
    case 'PRIVACY_POOLS_CONTROLLER_SDK_LOADED':
      return mainCtrl.privacyPools.setSdkInitialized()
    case 'PRIVACY_POOLS_CONTROLLER_UPDATE_FORM':
      return mainCtrl.privacyPools.update(params)
    case 'PRIVACY_POOLS_CONTROLLER_UNLOAD_SCREEN':
      return mainCtrl.privacyPools.unloadScreen()
    case 'PRIVACY_POOLS_CONTROLLER_SIGN_ACCOUNT_OP_UPDATE':
      return mainCtrl.privacyPools?.signAccountOpController?.update(params)
    case 'PRIVACY_POOLS_CONTROLLER_SIGN_ACCOUNT_OP_UPDATE_STATUS':
      return mainCtrl.privacyPools?.signAccountOpController?.updateStatus(params.status)
    case 'PRIVACY_POOLS_CONTROLLER_HAS_USER_PROCEEDED':
      return mainCtrl.privacyPools.setUserProceeded(params.proceeded)
    case 'PRIVACY_POOLS_CONTROLLER_RESET_FORM':
      return mainCtrl.privacyPools.resetForm()
    case 'PRIVACY_POOLS_CONTROLLER_DESTROY_SIGN_ACCOUNT_OP':
      return mainCtrl.privacyPools.destroySignAccountOp()
    case 'PRIVACY_POOLS_CONTROLLER_DESTROY_LATEST_BROADCASTED_ACCOUNT_OP':
      return mainCtrl.privacyPools.destroyLatestBroadcastedAccountOp()
    case 'PRIVACY_POOLS_CONTROLLER_SYNC_SIGN_ACCOUNT_OP':
      return mainCtrl.privacyPools.syncSignAccountOp(params.calls)
    case 'PRIVACY_POOLS_CONTROLLER_GENERATE_PPV1_KEYS':
      return mainCtrl.privacyPools.generatePPv1Keys()
    case 'PRIVACY_POOLS_CONTROLLER_GENERATE_SECRET':
      return mainCtrl.privacyPools.generateSecret(params.appInfo)
    case 'PRIVACY_POOLS_CONTROLLER_DIRECT_BROADCAST_WITHDRAWAL':
      return mainCtrl.privacyPools.directBroadcastWithdrawal(params)
    case 'PRIVACY_POOLS_CONTROLLER_RESET_SECRET':
      return mainCtrl.privacyPools.resetSecret()
    case 'PRIVACY_POOLS_CONTROLLER_ADD_IMPORTED_ACCOUNT_TO_ACTIVITY_CONTROLLER': {
      return await mainCtrl.privacyPools.addImportedAccountToActivityController(params.accountName)
    }
    case 'ACTIONS_CONTROLLER_REMOVE_FROM_ACTIONS_QUEUE':
      return mainCtrl.requests.actions.removeActions([params.id], params.shouldOpenNextAction)
    case 'ACTIONS_CONTROLLER_FOCUS_ACTION_WINDOW':
      return mainCtrl.requests.actions.focusActionWindow()
    case 'ACTIONS_CONTROLLER_SET_CURRENT_ACTION_BY_ID':
      return mainCtrl.requests.actions.setCurrentActionById(params.actionId, {
        baseWindowId: windowId
      })
    case 'ACTIONS_CONTROLLER_SET_CURRENT_ACTION_BY_INDEX':
      return mainCtrl.requests.actions.setCurrentActionByIndex(params.index, {
        ...params.params,
        baseWindowId: windowId
      })
    case 'ACTIONS_CONTROLLER_SET_WINDOW_LOADED':
      return mainCtrl.requests.actions.setWindowLoaded()

    case 'MAIN_CONTROLLER_RELOAD_SELECTED_ACCOUNT': {
      return await mainCtrl.reloadSelectedAccount({
        chainIds: params?.chainId ? [BigInt(params?.chainId)] : undefined
      })
    }
    case 'MAIN_CONTROLLER_UPDATE_SELECTED_ACCOUNT_PORTFOLIO': {
      return await mainCtrl.updateSelectedAccountPortfolio(params)
    }

    case 'DEFI_CONTOLLER_ADD_SESSION': {
      mainCtrl.defiPositions.addSession(params.sessionId)
      break
    }
    case 'DEFI_CONTOLLER_REMOVE_SESSION': {
      mainCtrl.defiPositions.removeSession(params.sessionId)
      break
    }

    case 'PORTFOLIO_CONTROLLER_GET_TEMPORARY_TOKENS': {
      if (!mainCtrl.selectedAccount.account) return

      return await mainCtrl.portfolio.getTemporaryTokens(
        mainCtrl.selectedAccount.account.addr,
        params.chainId,
        params.additionalHint
      )
    }
    case 'PORTFOLIO_CONTROLLER_ADD_CUSTOM_TOKEN': {
      return await mainCtrl.portfolio.addCustomToken(
        params.token,
        mainCtrl.selectedAccount.account?.addr,
        params.shouldUpdatePortfolio
      )
    }
    case 'PORTFOLIO_CONTROLLER_REMOVE_CUSTOM_TOKEN': {
      return await mainCtrl.portfolio.removeCustomToken(
        params.token,
        mainCtrl.selectedAccount.account?.addr,
        params.shouldUpdatePortfolio
      )
    }
    case 'PORTFOLIO_CONTROLLER_TOGGLE_HIDE_TOKEN': {
      return await mainCtrl.portfolio.toggleHideToken(
        params.token,
        mainCtrl.selectedAccount.account?.addr,
        params.shouldUpdatePortfolio
      )
    }
    case 'PORTFOLIO_CONTROLLER_CHECK_TOKEN': {
      if (!mainCtrl.selectedAccount.account) return
      return await mainCtrl.portfolio.updateTokenValidationByStandard(
        params.token,
        mainCtrl.selectedAccount.account.addr
      )
    }
    case 'SELECTED_ACCOUNT_CONTROLLER_UPDATE_CASHBACK_STATUS': {
      return await mainCtrl.selectedAccount.changeCashbackStatus(params)
    }
    case 'KEYSTORE_CONTROLLER_ADD_SECRET':
      return await mainCtrl.keystore.addSecret(
        params.secretId,
        params.secret,
        params.extraEntropy,
        params.leaveUnlocked
      )
    case 'KEYSTORE_CONTROLLER_ADD_TEMP_SEED':
      return await mainCtrl.keystore.addTempSeed(params)
    case 'KEYSTORE_CONTROLLER_UPDATE_SEED':
      return await mainCtrl.keystore.updateSeed(params)
    case 'KEYSTORE_CONTROLLER_UNLOCK_WITH_SECRET':
      return await mainCtrl.keystore.unlockWithSecret(params.secretId, params.secret)
    case 'KEYSTORE_CONTROLLER_RESET_ERROR_STATE':
      return mainCtrl.keystore.resetErrorState()
    case 'KEYSTORE_CONTROLLER_CHANGE_PASSWORD':
      return await mainCtrl.keystore.changeKeystorePassword(
        params.newSecret,
        params.secret,
        params.extraEntropy
      )
    case 'KEYSTORE_CONTROLLER_CHANGE_PASSWORD_FROM_RECOVERY':
      // In the case we change the user's device password through the recovery process,
      // we don't know the old password, which is why we send only the new password.
      return await mainCtrl.keystore.changeKeystorePassword(
        params.newSecret,
        undefined,
        params.extraEntropy
      )
    case 'KEYSTORE_CONTROLLER_SEND_PRIVATE_KEY_TO_UI':
      return await mainCtrl.keystore.sendPrivateKeyToUi(params.keyAddr)
    case 'KEYSTORE_CONTROLLER_SEND_SEED_TO_UI':
      return await mainCtrl.keystore.sendSeedToUi(params.id)
    case 'KEYSTORE_CONTROLLER_SEND_TEMP_SEED_TO_UI':
      return await mainCtrl.keystore.sendTempSeedToUi()
    case 'KEYSTORE_CONTROLLER_DELETE_SEED':
      return await mainCtrl.keystore.deleteSeed(params.id)

    case 'EMAIL_VAULT_CONTROLLER_GET_INFO':
      return await mainCtrl.emailVault.getEmailVaultInfo(params.email)
    case 'EMAIL_VAULT_CONTROLLER_UPLOAD_KEYSTORE_SECRET':
      return await mainCtrl.emailVault.uploadKeyStoreSecret(params.email)
    case 'EMAIL_VAULT_CONTROLLER_HANDLE_MAGIC_LINK_KEY':
      return await mainCtrl.emailVault.handleMagicLinkKey(params.email, undefined, params.flow)
    case 'EMAIL_VAULT_CONTROLLER_CANCEL_CONFIRMATION':
      return mainCtrl.emailVault.cancelEmailConfirmation()
    case 'EMAIL_VAULT_CONTROLLER_RECOVER_KEYSTORE':
      return await mainCtrl.emailVault.recoverKeyStore(params.email, params.newPass)
    case 'EMAIL_VAULT_CONTROLLER_CLEAN_MAGIC_AND_SESSION_KEYS':
      return await mainCtrl.emailVault.cleanMagicAndSessionKeys()
    case 'EMAIL_VAULT_CONTROLLER_REQUEST_KEYS_SYNC':
      return await mainCtrl.emailVault.requestKeysSync(params.email, params.keys)
    case 'EMAIL_VAULT_CONTROLLER_DISMISS_BANNER':
      return mainCtrl.emailVault.dismissBanner()
    case 'ADDRESS_BOOK_CONTROLLER_ADD_CONTACT': {
      return await mainCtrl.addressBook.addContact(params.name, params.address)
    }
    case 'ADDRESS_BOOK_CONTROLLER_RENAME_CONTACT': {
      const { address, newName } = params

      const account = mainCtrl.accounts.accounts.find(
        ({ addr }) => addr.toLowerCase() === address.toLowerCase()
      )

      if (!account) {
        await mainCtrl.addressBook.renameManuallyAddedContact(address, newName)
        return
      }

      return await mainCtrl.accounts.updateAccountPreferences([
        {
          addr: address,
          preferences: {
            pfp: account.preferences.pfp,
            label: newName
          }
        }
      ])
    }
    case 'ADDRESS_BOOK_CONTROLLER_REMOVE_CONTACT':
      return await mainCtrl.addressBook.removeManuallyAddedContact(params.address)
    case 'DOMAINS_CONTROLLER_REVERSE_LOOKUP':
      return await mainCtrl.domains.reverseLookup(params.address)
    case 'DOMAINS_CONTROLLER_SAVE_RESOLVED_REVERSE_LOOKUP':
      return mainCtrl.domains.saveResolvedReverseLookup(params)
    case 'SET_IS_PINNED': {
      walletStateCtrl.isPinned = params.isPinned
      break
    }
    case 'SET_IS_SETUP_COMPLETE': {
      walletStateCtrl.isSetupComplete = params.isSetupComplete
      break
    }
    case 'AUTO_LOCK_CONTROLLER_SET_LAST_ACTIVE_TIME': {
      autoLockCtrl.setLastActiveTime()
      break
    }
    case 'AUTO_LOCK_CONTROLLER_SET_AUTO_LOCK_TIME': {
      autoLockCtrl.autoLockTime = params
      break
    }

    case 'INVITE_CONTROLLER_VERIFY': {
      return await mainCtrl.invite.verify(params.code)
    }
    case 'INVITE_CONTROLLER_BECOME_OG': {
      return await mainCtrl.invite.becomeOG()
    }
    case 'INVITE_CONTROLLER_REVOKE_OG': {
      return await mainCtrl.invite.revokeOG()
    }

    case 'DAPPS_CONTROLLER_DISCONNECT_DAPP': {
      await mainCtrl.dapps.broadcastDappSessionEvent('disconnect', undefined, params)
      mainCtrl.dapps.updateDapp(params, { isConnected: false })
      break
    }
    case 'CHANGE_CURRENT_DAPP_NETWORK': {
      mainCtrl.dapps.updateDapp(params.id, { chainId: params.chainId })
      await mainCtrl.dapps.broadcastDappSessionEvent(
        'chainChanged',
        {
          chain: `0x${params.chainId.toString(16)}`,
          networkVersion: `${params.chainId}`
        },
        params.id
      )
      break
    }
    case 'DAPP_CONTROLLER_UPDATE_DAPP': {
      return mainCtrl.dapps.updateDapp(params.id, params.dapp)
    }
    case 'DAPP_CONTROLLER_REMOVE_DAPP': {
      await mainCtrl.dapps.broadcastDappSessionEvent('disconnect', undefined, params)
      return mainCtrl.dapps.removeDapp(params)
    }
    case 'PHISHING_CONTROLLER_GET_IS_BLACKLISTED_AND_SEND_TO_UI': {
      return mainCtrl.phishing.sendIsBlacklistedToUi(params.url)
    }
    case 'EXTENSION_UPDATE_CONTROLLER_APPLY_UPDATE': {
      extensionUpdateCtrl.applyUpdate()
      break
    }

    case 'OPEN_EXTENSION_POPUP': {
      // eslint-disable-next-line no-inner-declarations
      async function waitForPopupOpen(timeout = 10000, interval = 100) {
        const startTime = Date.now()
        while (!pm.ports.some((p) => p.name === 'popup')) {
          if (Date.now() - startTime > timeout) break
          await wait(interval)
        }
      }

      try {
        const isLoading = await sessionStorage.get('isOpenExtensionPopupLoading', false)
        const isPopupAlreadyOpened = pm.ports.some((p) => p.name === 'popup')
        if (isLoading || isPopupAlreadyOpened) return

        await sessionStorage.set('isOpenExtensionPopupLoading', true)
        await browser.action.openPopup()
        await waitForPopupOpen()
      } catch (error) {
        try {
          await chrome.action.openPopup()
          await waitForPopupOpen()
        } catch (e) {
          pm.send('> ui', { method: 'navigate', params: { route: '/' } })
        }
      }
      await sessionStorage.set('isOpenExtensionPopupLoading', false)
      break
    }

    case 'SET_THEME_TYPE': {
      await walletStateCtrl.setThemeType(params.themeType)
      break
    }
    case 'SET_LOG_LEVEL': {
      await walletStateCtrl.setLogLevel(params.logLevel)
      break
    }
    case 'SET_CRASH_ANALYTICS': {
      await walletStateCtrl.setCrashAnalytics(params.enabled)
      break
    }

    case 'DISMISS_BANNER': {
      await mainCtrl.banner.dismissBanner(params.bannerId)
      break
    }

    default:
      // eslint-disable-next-line no-console
      return console.error(
        `Dispatched ${type} action, but handler in the extension background process not found!`
      )
  }
}
