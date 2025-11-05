import { HD_PATH_TEMPLATE_TYPE } from '@ambire-common/consts/derivation'
import {
  AccountOpAction,
  Action as ActionFromActionsQueue,
  ActionExecutionType,
  ActionPosition,
  OpenActionWindowParams
} from '@ambire-common/controllers/actions/actions'
import { Filters, Pagination } from '@ambire-common/controllers/activity/activity'
import { Contact } from '@ambire-common/controllers/addressBook/addressBook'
import { FeeSpeed, SigningStatus } from '@ambire-common/controllers/signAccountOp/signAccountOp'
import { Account, AccountPreferences, AccountStates } from '@ambire-common/interfaces/account'
import { Banner } from '@ambire-common/interfaces/banner'
import { Dapp } from '@ambire-common/interfaces/dapp'
import { MagicLinkFlow } from '@ambire-common/interfaces/emailVault'
import {
  ExternalKey,
  InternalKey,
  Key,
  KeyPreferences,
  KeystoreSeed,
  ReadyToAddKeys
} from '@ambire-common/interfaces/keystore'
import { AddNetworkRequestParams, ChainId, Network } from '@ambire-common/interfaces/network'
import { BuildRequest } from '@ambire-common/interfaces/requests'
import { CashbackStatus } from '@ambire-common/interfaces/selectedAccount'
import {
  SwapAndBridgeActiveRoute,
  SwapAndBridgeRoute,
  SwapAndBridgeToToken
} from '@ambire-common/interfaces/swapAndBridge'
import { TransferUpdate } from '@ambire-common/interfaces/transfer'
import { Message, UserRequest } from '@ambire-common/interfaces/userRequest'
import { AccountOp } from '@ambire-common/libs/accountOp/accountOp'
import { FullEstimation } from '@ambire-common/libs/estimate/interfaces'
import { GasRecommendation } from '@ambire-common/libs/gasPrice/gasPrice'
import { TokenResult } from '@ambire-common/libs/portfolio'
import { Call } from '@ambire-common/libs/accountOp/types'
import { CustomToken, TokenPreference } from '@ambire-common/libs/portfolio/customToken'
import { THEME_TYPES } from '@common/styles/themeConfig'
import { LOG_LEVELS } from '@web/utils/logger'

import { AUTO_LOCK_TIMES } from './controllers/auto-lock'
import { controllersMapping } from './types'

type UpdateNavigationUrl = {
  type: 'UPDATE_PORT_URL'
  params: { url: string }
}

type InitControllerStateAction = {
  type: 'INIT_CONTROLLER_STATE'
  params: {
    controller: keyof typeof controllersMapping
  }
}

type MainControllerAccountPickerInitLedgerAction = {
  type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_INIT_LEDGER'
}
type MainControllerAccountPickerInitTrezorAction = {
  type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_INIT_TREZOR'
}
type MainControllerAccountPickerInitLatticeAction = {
  type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_INIT_LATTICE'
}
type MainControllerAccountPickerInitPrivateKeyOrSeedPhraseAction = {
  type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_INIT_PRIVATE_KEY_OR_SEED_PHRASE'
  params: {
    privKeyOrSeed: string
    seedPassphrase?: string | null
    hdPathTemplate?: HD_PATH_TEMPLATE_TYPE
  }
}
type MainControllerAccountPickerInitFromSavedSeedPhraseAction = {
  type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_INIT_FROM_SAVED_SEED_PHRASE'
  params: { id: string }
}
type MainControllerSelectAccountAction = {
  type: 'MAIN_CONTROLLER_SELECT_ACCOUNT'
  params: {
    accountAddr: Account['addr']
  }
}
type MainControllerAccountPickerSelectAccountAction = {
  type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_SELECT_ACCOUNT'
  params: {
    account: Account
  }
}
type MainControllerAccountPickerDeselectAccountAction = {
  type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_DESELECT_ACCOUNT'
  params: {
    account: Account
  }
}

type MainControllerAccountPickerSetPageAction = {
  type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_SET_PAGE'
  params: {
    page: number
    pageSize?: number
    shouldSearchForLinkedAccounts?: boolean
    shouldGetAccountsUsedOnNetworks?: boolean
  }
}
type MainControllerAccountPickerSetHdPathTemplateAction = {
  type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_SET_HD_PATH_TEMPLATE'
  params: { hdPathTemplate: HD_PATH_TEMPLATE_TYPE }
}
type MainControllerAccountPickerAddAccounts = {
  type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_ADD_ACCOUNTS'
}
type MainControllerAddAccounts = {
  type: 'MAIN_CONTROLLER_ADD_VIEW_ONLY_ACCOUNTS'
  params: {
    accounts: (Account & {
      domainName: string | null
    })[]
  }
}
type MainControllerRemoveAccount = {
  type: 'MAIN_CONTROLLER_REMOVE_ACCOUNT'
  params: {
    accountAddr: Account['addr']
  }
}
type MainControllerAccountPickerResetAction = {
  type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_RESET'
}
type MainControllerAccountPickerInitAction = {
  type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_INIT'
}

type ResetAccountAddingOnPageErrorAction = {
  type: 'RESET_ACCOUNT_ADDING_ON_PAGE_ERROR'
}
type MainControllerAccountPickerResetAccountsSelectionAction = {
  type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_RESET_ACCOUNTS_SELECTION'
}

type MainControllerAddNetwork = {
  type: 'MAIN_CONTROLLER_ADD_NETWORK'
  params: AddNetworkRequestParams
}

type AccountsControllerUpdateAccountPreferences = {
  type: 'ACCOUNTS_CONTROLLER_UPDATE_ACCOUNT_PREFERENCES'
  params: { addr: string; preferences: AccountPreferences }[]
}

type AccountsControllerReorderAccountsAction = {
  type: 'ACCOUNTS_CONTROLLER_REORDER_ACCOUNTS'
  params: { fromIndex: number; toIndex: number }
}

type AccountsControllerUpdateAccountState = {
  type: 'ACCOUNTS_CONTROLLER_UPDATE_ACCOUNT_STATE'
  params: { addr: string; chainIds: bigint[] }
}
type AccountsControllerResetAccountsNewlyAddedStateAction = {
  type: 'ACCOUNTS_CONTROLLER_RESET_ACCOUNTS_NEWLY_ADDED_STATE'
}

type SettingsControllerSetNetworkToAddOrUpdate = {
  type: 'SETTINGS_CONTROLLER_SET_NETWORK_TO_ADD_OR_UPDATE'
  params: {
    chainId: Network['chainId']
    rpcUrl: string
  }
}

type SettingsControllerResetNetworkToAddOrUpdate = {
  type: 'SETTINGS_CONTROLLER_RESET_NETWORK_TO_ADD_OR_UPDATE'
}

type KeystoreControllerUpdateKeyPreferencesAction = {
  type: 'KEYSTORE_CONTROLLER_UPDATE_KEY_PREFERENCES'
  params: {
    addr: Key['addr']
    type: Key['type']
    preferences: KeyPreferences
  }[]
}

type MainControllerUpdateNetworkAction = {
  type: 'MAIN_CONTROLLER_UPDATE_NETWORK'
  params: {
    network: Partial<Network>
    chainId: ChainId
  }
}
type MainControllerRejectSignAccountOpCall = {
  type: 'MAIN_CONTROLLER_REJECT_SIGN_ACCOUNT_OP_CALL'
  params: { callId: string }
}
type MainControllerRejectAccountOpAction = {
  type: 'MAIN_CONTROLLER_REJECT_ACCOUNT_OP'
  params: { err: string; actionId: AccountOpAction['id']; shouldOpenNextAction: boolean }
}
type MainControllerSignMessageInitAction = {
  type: 'MAIN_CONTROLLER_SIGN_MESSAGE_INIT'
  params: {
    dapp: {
      name: string
      icon: string
    }
    messageToSign: Message
  }
}
type MainControllerSignMessageResetAction = {
  type: 'MAIN_CONTROLLER_SIGN_MESSAGE_RESET'
}
type MainControllerHandleSignMessage = {
  type: 'MAIN_CONTROLLER_HANDLE_SIGN_MESSAGE'
  params: { keyAddr: Key['addr']; keyType: Key['type'] }
}
type MainControllerActivitySetAccOpsFiltersAction = {
  type: 'MAIN_CONTROLLER_ACTIVITY_SET_ACC_OPS_FILTERS'
  params: { filters: Filters; pagination?: Pagination; sessionId: string }
}
type MainControllerActivitySetSignedMessagesFiltersAction = {
  type: 'MAIN_CONTROLLER_ACTIVITY_SET_SIGNED_MESSAGES_FILTERS'
  params: { filters: Filters; pagination?: Pagination; sessionId: string }
}
type MainControllerActivityResetAccOpsAction = {
  type: 'MAIN_CONTROLLER_ACTIVITY_RESET_ACC_OPS_FILTERS'
  params: { sessionId: string }
}
type MainControllerActivityResetSignedMessagesAction = {
  type: 'MAIN_CONTROLLER_ACTIVITY_RESET_SIGNED_MESSAGES_FILTERS'
  params: { sessionId: string }
}
type MainControllerActivityHideBanner = {
  type: 'ACTIVITY_CONTROLLER_HIDE_BANNER'
  params: { addr: string; chainId: bigint; timestamp: number }
}

type MainControllerReloadSelectedAccount = {
  type: 'MAIN_CONTROLLER_RELOAD_SELECTED_ACCOUNT'
  params?: { chainId?: bigint | string }
}

type MainControllerUpdateSelectedAccountPortfolio = {
  type: 'MAIN_CONTROLLER_UPDATE_SELECTED_ACCOUNT_PORTFOLIO'
  params?: {
    forceUpdate?: boolean
    networks?: Network[]
  }
}

type RequestsControllerAddUserRequestAction = {
  type: 'REQUESTS_CONTROLLER_ADD_USER_REQUEST'
  params: {
    userRequest: UserRequest
    actionPosition?: ActionPosition
    actionExecutionType?: ActionExecutionType
    allowAccountSwitch?: boolean
    skipFocus?: boolean
  }
}
type RequestsControllerBuildRequestAction = {
  type: 'REQUESTS_CONTROLLER_BUILD_REQUEST'
  params: BuildRequest
}
type RequestsControllerRemoveUserRequestAction = {
  type: 'REQUESTS_CONTROLLER_REMOVE_USER_REQUEST'
  params: { id: UserRequest['id'] }
}
type RequestsControllerResolveUserRequestAction = {
  type: 'REQUESTS_CONTROLLER_RESOLVE_USER_REQUEST'
  params: { data: any; id: UserRequest['id'] }
}
type RequestsControllerRejectUserRequestAction = {
  type: 'REQUESTS_CONTROLLER_REJECT_USER_REQUEST'
  params: { err: string; id: UserRequest['id'] }
}
type RequestsControllerSwapAndBridgeActiveRouteBuildNextUserRequestAction = {
  type: 'REQUESTS_CONTROLLER_SWAP_AND_BRIDGE_ACTIVE_ROUTE_BUILD_NEXT_USER_REQUEST'
  params: { activeRouteId: SwapAndBridgeActiveRoute['activeRouteId'] }
}

type DefiControllerAddSessionAction = {
  type: 'DEFI_CONTOLLER_ADD_SESSION'
  params: { sessionId: string }
}

type DefiControllerRemoveSessionAction = {
  type: 'DEFI_CONTOLLER_REMOVE_SESSION'
  params: { sessionId: string }
}

type SelectedAccountSetDashboardNetworkFilter = {
  type: 'SELECTED_ACCOUNT_SET_DASHBOARD_NETWORK_FILTER'
  params: { dashboardNetworkFilter: bigint | string | null }
}
type SelectedAccountDismissDefiPositionsBannerAction = {
  type: 'DISMISS_DEFI_POSITIONS_BANNER'
}

type PortfolioControllerGetTemporaryToken = {
  type: 'PORTFOLIO_CONTROLLER_GET_TEMPORARY_TOKENS'
  params: {
    additionalHint: TokenResult['address']
    chainId: bigint
  }
}

type PortfolioControllerAddCustomToken = {
  type: 'PORTFOLIO_CONTROLLER_ADD_CUSTOM_TOKEN'
  params: {
    token: CustomToken
    shouldUpdatePortfolio?: boolean
  }
}

type PortfolioControllerRemoveCustomToken = {
  type: 'PORTFOLIO_CONTROLLER_REMOVE_CUSTOM_TOKEN'
  params: {
    token: Omit<CustomToken, 'standard'>
    shouldUpdatePortfolio?: boolean
  }
}

type PortfolioControllerToggleHideToken = {
  type: 'PORTFOLIO_CONTROLLER_TOGGLE_HIDE_TOKEN'
  params: {
    token: Omit<TokenPreference, 'isHidden'>
    shouldUpdatePortfolio?: boolean
  }
}

type PortfolioControllerCheckToken = {
  type: 'PORTFOLIO_CONTROLLER_CHECK_TOKEN'
  params: {
    token: { address: TokenResult['address']; chainId: bigint }
  }
}

type PortfolioControllerUpdateConfettiToShown = {
  type: 'SELECTED_ACCOUNT_CONTROLLER_UPDATE_CASHBACK_STATUS'
  params: CashbackStatus
}

type MainControllerSignAccountOpInitAction = {
  type: 'MAIN_CONTROLLER_SIGN_ACCOUNT_OP_INIT'
  params: {
    actionId: AccountOpAction['id']
  }
}
type MainControllerSignAccountOpDestroyAction = {
  type: 'MAIN_CONTROLLER_SIGN_ACCOUNT_OP_DESTROY'
}
type MainControllerSignAccountOpUpdateMainDepsAction = {
  type: 'MAIN_CONTROLLER_SIGN_ACCOUNT_OP_UPDATE_MAIN_DEPS'
  params: {
    accounts?: Account[]
    networks?: Network[]
    accountStates?: AccountStates
  }
}
type MainControllerSignAccountOpUpdateAction = {
  type:
    | 'MAIN_CONTROLLER_SIGN_ACCOUNT_OP_UPDATE'
    | 'SWAP_AND_BRIDGE_CONTROLLER_SIGN_ACCOUNT_OP_UPDATE'
    | 'TRANSFER_CONTROLLER_SIGN_ACCOUNT_OP_UPDATE'
  params: {
    accountOp?: AccountOp
    gasPrices?: GasRecommendation[]
    estimation?: FullEstimation
    feeToken?: TokenResult
    paidBy?: string
    speed?: FeeSpeed
    signingKeyAddr?: Key['addr']
    signingKeyType?: InternalKey['type'] | ExternalKey['type']
    gasUsedTooHighAgreed?: boolean
  }
}
type SignAccountOpUpdateAction = {
  type: 'SIGN_ACCOUNT_OP_UPDATE'
  params: {
    updateType: 'Main' | 'Swap&Bridge' | 'Transfer&TopUp' | 'PrivacyPools'
    accountOp?: AccountOp
    gasPrices?: GasRecommendation[]
    estimation?: FullEstimation
    feeToken?: TokenResult
    paidBy?: string
    speed?: FeeSpeed
    signingKeyAddr?: Key['addr']
    signingKeyType?: Key['type']
    gasUsedTooHighAgreed?: boolean
  }
}
type MainControllerSignAccountOpUpdateStatus = {
  type:
    | 'MAIN_CONTROLLER_SIGN_ACCOUNT_OP_UPDATE_STATUS'
    | 'SWAP_AND_BRIDGE_CONTROLLER_SIGN_ACCOUNT_OP_UPDATE_STATUS'
    | 'TRANSFER_CONTROLLER_SIGN_ACCOUNT_OP_UPDATE_STATUS'
    | 'PRIVACY_POOLS_CONTROLLER_SIGN_ACCOUNT_OP_UPDATE_STATUS'
  params: {
    status: SigningStatus
  }
}
type MainControllerHandleSignAndBroadcastAccountOp = {
  type: 'MAIN_CONTROLLER_HANDLE_SIGN_AND_BROADCAST_ACCOUNT_OP'
  params: {
    updateType: 'Main' | 'Swap&Bridge' | 'Transfer&TopUp' | 'PrivacyPools'
  }
}

type MainControllerOnPopupOpenAction = {
  type: 'MAIN_CONTROLLER_ON_POPUP_OPEN'
}

type MainControllerLockAction = {
  type: 'MAIN_CONTROLLER_LOCK'
}

type KeystoreControllerAddSecretAction = {
  type: 'KEYSTORE_CONTROLLER_ADD_SECRET'
  params: { secretId: string; secret: string; extraEntropy: string; leaveUnlocked: boolean }
}
type KeystoreControllerAddTempSeedAction = {
  type: 'KEYSTORE_CONTROLLER_ADD_TEMP_SEED'
  params: Omit<KeystoreSeed, 'id' | 'label'>
}
type KeystoreControllerUpdateSeedAction = {
  type: 'KEYSTORE_CONTROLLER_UPDATE_SEED'
  params: {
    id: KeystoreSeed['id']
    label?: KeystoreSeed['label']
    hdPathTemplate?: KeystoreSeed['hdPathTemplate']
  }
}
type KeystoreControllerUnlockWithSecretAction = {
  type: 'KEYSTORE_CONTROLLER_UNLOCK_WITH_SECRET'
  params: { secretId: string; secret: string }
}
type KeystoreControllerResetErrorStateAction = {
  type: 'KEYSTORE_CONTROLLER_RESET_ERROR_STATE'
}
type KeystoreControllerChangePasswordAction = {
  type: 'KEYSTORE_CONTROLLER_CHANGE_PASSWORD'
  params: { secret: string; newSecret: string; extraEntropy: string }
}
type KeystoreControllerChangePasswordFromRecoveryAction = {
  type: 'KEYSTORE_CONTROLLER_CHANGE_PASSWORD_FROM_RECOVERY'
  params: { newSecret: string; extraEntropy: string }
}
type KeystoreControllerSendPrivateKeyToUiAction = {
  type: 'KEYSTORE_CONTROLLER_SEND_PRIVATE_KEY_TO_UI'
  params: { keyAddr: string }
}
type KeystoreControllerDeleteSeedAction = {
  type: 'KEYSTORE_CONTROLLER_DELETE_SEED'
  params: { id: string }
}
type KeystoreControllerSendSeedToUiAction = {
  type: 'KEYSTORE_CONTROLLER_SEND_SEED_TO_UI'
  params: { id: string }
}
type KeystoreControllerSendTempSeedToUiAction = {
  type: 'KEYSTORE_CONTROLLER_SEND_TEMP_SEED_TO_UI'
}

type EmailVaultControllerGetInfoAction = {
  type: 'EMAIL_VAULT_CONTROLLER_GET_INFO'
  params: { email: string }
}
type EmailVaultControllerUploadKeystoreSecretAction = {
  type: 'EMAIL_VAULT_CONTROLLER_UPLOAD_KEYSTORE_SECRET'
  params: { email: string }
}
type EmailVaultControllerCancelConfirmationAction = {
  type: 'EMAIL_VAULT_CONTROLLER_CANCEL_CONFIRMATION'
}
type EmailVaultControllerHandleMagicLinkKeyAction = {
  type: 'EMAIL_VAULT_CONTROLLER_HANDLE_MAGIC_LINK_KEY'
  params: { email: string; flow: MagicLinkFlow }
}
type EmailVaultControllerRecoverKeystoreAction = {
  type: 'EMAIL_VAULT_CONTROLLER_RECOVER_KEYSTORE'
  params: { email: string; newPass: string }
}
type EmailVaultControllerCleanMagicAndSessionKeysAction = {
  type: 'EMAIL_VAULT_CONTROLLER_CLEAN_MAGIC_AND_SESSION_KEYS'
}
type EmailVaultControllerRequestKeysSyncAction = {
  type: 'EMAIL_VAULT_CONTROLLER_REQUEST_KEYS_SYNC'
  params: { email: string; keys: string[] }
}

type EmailVaultControllerDismissBannerAction = {
  type: 'EMAIL_VAULT_CONTROLLER_DISMISS_BANNER'
}

type DomainsControllerReverseLookupAction = {
  type: 'DOMAINS_CONTROLLER_REVERSE_LOOKUP'
  params: { address: string }
}

type DomainsControllerSaveResolvedReverseLookupAction = {
  type: 'DOMAINS_CONTROLLER_SAVE_RESOLVED_REVERSE_LOOKUP'
  params: {
    address: string
    name: string
    type: 'ens'
  }
}

type DappsControllerRemoveConnectedSiteAction = {
  type: 'DAPPS_CONTROLLER_DISCONNECT_DAPP'
  params: Dapp['id']
}
type DappsControllerUpdateDappAction = {
  type: 'DAPP_CONTROLLER_UPDATE_DAPP'
  params: { id: string; dapp: Partial<Dapp> }
}
type DappsControllerRemoveDappAction = {
  type: 'DAPP_CONTROLLER_REMOVE_DAPP'
  params: Dapp['id']
}

type SwapAndBridgeControllerInitAction = {
  type: 'SWAP_AND_BRIDGE_CONTROLLER_INIT_FORM'
  params: {
    sessionId: string
    preselectedFromToken?: Pick<TokenResult, 'address' | 'chainId'>
    preselectedToToken?: Pick<TokenResult, 'address' | 'chainId'>
    fromAmount?: string
    activeRouteIdToDelete?: string
  }
}
type SwapAndBridgeControllerUserProceededAction = {
  type: 'SWAP_AND_BRIDGE_CONTROLLER_HAS_USER_PROCEEDED'
  params: { proceeded: boolean }
}
type SwapAndBridgeControllerIsAutoSelectRouteDisabled = {
  type: 'SWAP_AND_BRIDGE_CONTROLLER_IS_AUTO_SELECT_ROUTE_DISABLED'
  params: { isDisabled: boolean }
}
type SwapAndBridgeControllerUnloadScreenAction = {
  type: 'SWAP_AND_BRIDGE_CONTROLLER_UNLOAD_SCREEN'
  params: { sessionId: string; forceUnload?: boolean }
}
type SwapAndBridgeControllerUpdateFormAction = {
  type: 'SWAP_AND_BRIDGE_CONTROLLER_UPDATE_FORM'
  params: {
    formValues: {
      fromAmount?: string
      fromAmountInFiat?: string
      fromAmountFieldMode?: 'fiat' | 'token'
      shouldSetMaxAmount?: boolean
      fromChainId?: bigint | number
      fromSelectedToken?: TokenResult | null
      toChainId?: bigint | number
      toSelectedTokenAddr?: SwapAndBridgeToToken['address'] | null
      routePriority?: 'output' | 'time'
    }
    updateProps?: {
      emitUpdate?: boolean
      updateQuote?: boolean
      shouldIncrementFromAmountUpdateCounter?: boolean
    }
  }
}
type SwapAndBridgeControllerAddToTokenByAddress = {
  type: 'SWAP_AND_BRIDGE_CONTROLLER_ADD_TO_TOKEN_BY_ADDRESS'
  params: { address: string }
}
type SwapAndBridgeControllerSearchToToken = {
  type: 'SWAP_AND_BRIDGE_CONTROLLER_SEARCH_TO_TOKEN'
  params: { searchTerm: string }
}
type SwapAndBridgeControllerSwitchFromAndToTokensAction = {
  type: 'SWAP_AND_BRIDGE_CONTROLLER_SWITCH_FROM_AND_TO_TOKENS'
}
type SwapAndBridgeControllerSelectRouteAction = {
  type: 'SWAP_AND_BRIDGE_CONTROLLER_SELECT_ROUTE'
  params: { route: SwapAndBridgeRoute; isAutoSelectDisabled?: boolean }
}
type SwapAndBridgeControllerResetForm = {
  type: 'SWAP_AND_BRIDGE_CONTROLLER_RESET_FORM'
}
type SwapAndBridgeControllerUpdateQuoteAction = {
  type: 'SWAP_AND_BRIDGE_CONTROLLER_UPDATE_QUOTE'
}
type SwapAndBridgeControllerRemoveActiveRouteAction = {
  type: 'MAIN_CONTROLLER_REMOVE_ACTIVE_ROUTE'
  params: { activeRouteId: SwapAndBridgeActiveRoute['activeRouteId'] }
}
type SwapAndBridgeControllerMarkSelectedRouteAsFailed = {
  type: 'SWAP_AND_BRIDGE_CONTROLLER_MARK_SELECTED_ROUTE_AS_FAILED'
}
type SwapAndBridgeControllerDestroySignAccountOp = {
  type: 'SWAP_AND_BRIDGE_CONTROLLER_DESTROY_SIGN_ACCOUNT_OP'
}
type SwapAndBridgeControllerOpenSigningActionWindow = {
  type: 'SWAP_AND_BRIDGE_CONTROLLER_OPEN_SIGNING_ACTION_WINDOW'
}
type OpenSigningActionWindow = {
  type: 'OPEN_SIGNING_ACTION_WINDOW'
  params: {
    type: 'swapAndBridge' | 'transfer'
  }
}
type CloseSigningActionWindow = {
  type: 'CLOSE_SIGNING_ACTION_WINDOW'
  params: {
    type: 'swapAndBridge' | 'transfer'
  }
}
type TransferControllerUpdateForm = {
  type: 'TRANSFER_CONTROLLER_UPDATE_FORM'
  params: { formValues: TransferUpdate }
}
type TransferControllerResetForm = {
  type: 'TRANSFER_CONTROLLER_RESET_FORM'
}
type TransferControllerDestroyLatestBroadcastedAccountOp = {
  type: 'TRANSFER_CONTROLLER_DESTROY_LATEST_BROADCASTED_ACCOUNT_OP'
}
type TransferControllerUnloadScreen = {
  type: 'TRANSFER_CONTROLLER_UNLOAD_SCREEN'
}
type TransferControllerUserProceededAction = {
  type: 'TRANSFER_CONTROLLER_HAS_USER_PROCEEDED'
  params: { proceeded: boolean }
}
type TransferControllerShouldSkipTransactionQueuedModal = {
  type: 'TRANSFER_CONTROLLER_SHOULD_SKIP_TRANSACTION_QUEUED_MODAL'
  params: { shouldSkip: boolean }
}
type ActionsControllerRemoveFromActionsQueue = {
  type: 'ACTIONS_CONTROLLER_REMOVE_FROM_ACTIONS_QUEUE'
  params: { id: ActionFromActionsQueue['id']; shouldOpenNextAction: boolean }
}
type ActionsControllerFocusActionWindow = {
  type: 'ACTIONS_CONTROLLER_FOCUS_ACTION_WINDOW'
}

type ActionsControllerMakeAllActionsActive = {
  type: 'ACTIONS_CONTROLLER_MAKE_ALL_ACTIONS_ACTIVE'
}

type ActionsControllerSetCurrentActionById = {
  type: 'ACTIONS_CONTROLLER_SET_CURRENT_ACTION_BY_ID'
  params: {
    actionId: ActionFromActionsQueue['id']
  }
}

type ActionsControllerSetCurrentActionByIndex = {
  type: 'ACTIONS_CONTROLLER_SET_CURRENT_ACTION_BY_INDEX'
  params: {
    index: number
    params?: OpenActionWindowParams
  }
}

type ActionsControllerSetWindowLoaded = {
  type: 'ACTIONS_CONTROLLER_SET_WINDOW_LOADED'
}

type AddressBookControllerAddContact = {
  type: 'ADDRESS_BOOK_CONTROLLER_ADD_CONTACT'
  params: {
    address: Contact['address']
    name: Contact['name']
  }
}
type AddressBookControllerRenameContact = {
  type: 'ADDRESS_BOOK_CONTROLLER_RENAME_CONTACT'
  params: {
    address: Contact['address']
    newName: Contact['name']
  }
}
type AddressBookControllerRemoveContact = {
  type: 'ADDRESS_BOOK_CONTROLLER_REMOVE_CONTACT'
  params: {
    address: Contact['address']
  }
}

type ChangeCurrentDappNetworkAction = {
  type: 'CHANGE_CURRENT_DAPP_NETWORK'
  params: { chainId: number; id: string }
}

type SetIsPinnedAction = {
  type: 'SET_IS_PINNED'
  params: { isPinned: boolean }
}
type SetIsSetupCompleteAction = {
  type: 'SET_IS_SETUP_COMPLETE'
  params: { isSetupComplete: boolean }
}

type AutoLockControllerSetLastActiveTimeAction = {
  type: 'AUTO_LOCK_CONTROLLER_SET_LAST_ACTIVE_TIME'
}
type AutoLockControllerSetAutoLockTimeAction = {
  type: 'AUTO_LOCK_CONTROLLER_SET_AUTO_LOCK_TIME'
  params: AUTO_LOCK_TIMES
}

type InviteControllerVerifyAction = {
  type: 'INVITE_CONTROLLER_VERIFY'
  params: { code: string }
}
type InviteControllerBecomeOGAction = { type: 'INVITE_CONTROLLER_BECOME_OG' }
type InviteControllerRevokeOGAction = { type: 'INVITE_CONTROLLER_REVOKE_OG' }

type ImportSmartAccountJson = {
  type: 'IMPORT_SMART_ACCOUNT_JSON'
  params: { readyToAddAccount: Account; keys: ReadyToAddKeys['internal'] }
}

type PhishingControllerGetIsBlacklistedAndSendToUiAction = {
  type: 'PHISHING_CONTROLLER_GET_IS_BLACKLISTED_AND_SEND_TO_UI'
  params: { url: string }
}

type ExtensionUpdateControllerApplyUpdate = {
  type: 'EXTENSION_UPDATE_CONTROLLER_APPLY_UPDATE'
}

type OpenExtensionPopupAction = {
  type: 'OPEN_EXTENSION_POPUP'
}

type SetThemeTypeAction = {
  type: 'SET_THEME_TYPE'
  params: { themeType: THEME_TYPES }
}
type SetLogLevelTypeAction = {
  type: 'SET_LOG_LEVEL'
  params: { logLevel: LOG_LEVELS }
}
type SetCrashAnalyticsAction = {
  type: 'SET_CRASH_ANALYTICS'
  params: { enabled: boolean }
}

type DismissBanner = {
  type: 'DISMISS_BANNER'
  params: {
    bannerId: Banner['id']
  }
}

type PrivacyControllerInitializeSdkAction = {
  type: 'PRIVACY_POOLS_CONTROLLER_SDK_LOADED'
}

type PrivacyControllerUpdateFormAction = {
  type: 'PRIVACY_POOLS_CONTROLLER_UPDATE_FORM'
  params: {
    depositAmount?: string
    withdrawalAmount?: string
    seedPhrase?: string
    targetAddress?: string
    importedSecretNote?: string
  }
}

type PrivacyControllerUnloadScreenAction = {
  type: 'PRIVACY_POOLS_CONTROLLER_UNLOAD_SCREEN'
}

type PrivacyControllerSignAccountOpUpdateAction = {
  type: 'PRIVACY_POOLS_CONTROLLER_SIGN_ACCOUNT_OP_UPDATE'
  params: {
    status: SigningStatus
  }
}

type PrivacyControllerHasUserProceededAction = {
  type: 'PRIVACY_POOLS_CONTROLLER_HAS_USER_PROCEEDED'
  params: {
    proceeded: boolean
  }
}

type PrivacyControllerDestroySignAccountOpAction = {
  type: 'PRIVACY_POOLS_CONTROLLER_DESTROY_SIGN_ACCOUNT_OP'
}

type PrivacyControllerDestroyLatestBroadcastedAccountOpAction = {
  type: 'PRIVACY_POOLS_CONTROLLER_DESTROY_LATEST_BROADCASTED_ACCOUNT_OP'
}

type PrivacyControllerSyncSignAccountOpAction = {
  type: 'PRIVACY_POOLS_CONTROLLER_SYNC_SIGN_ACCOUNT_OP'
  params: {
    calls: Call[]
  }
}

type PrivacyControllerGeneratePPv1KeysAction = {
  type: 'PRIVACY_POOLS_CONTROLLER_GENERATE_PPV1_KEYS'
}

type PrivacyControllerGenerateSecretAction = {
  type: 'PRIVACY_POOLS_CONTROLLER_GENERATE_SECRET'
  params: {
    appInfo: string
  }
}

type PrivacyControllerResetFormAction = {
  type: 'PRIVACY_POOLS_CONTROLLER_RESET_FORM'
}
type PrivacyControllerResetSecretAction = {
  type: 'PRIVACY_POOLS_CONTROLLER_RESET_SECRET'
}

type PrivacyControllerDirectBroadcastWithdrawalAction = {
  type: 'PRIVACY_POOLS_CONTROLLER_DIRECT_BROADCAST_WITHDRAWAL'
  params: {
    chainId: number
    poolAddress: string
    withdrawal: {
      processooor: string
      data: string
    }
    proofs: {
      publicSignals: bigint[]
      proof: {
        pi_a: [bigint, bigint]
        pi_b: [readonly [bigint, bigint], readonly [bigint, bigint]]
        pi_c: [bigint, bigint]
      }
    }[]
  }
}

type PrivacyControllerAddImportedAccountToActivityControllerAction = {
  type: 'PRIVACY_POOLS_CONTROLLER_ADD_IMPORTED_ACCOUNT_TO_ACTIVITY_CONTROLLER'
  params: {
    accountName: string
  }
}

export type Action =
  | UpdateNavigationUrl
  | InitControllerStateAction
  | MainControllerAccountPickerInitLatticeAction
  | MainControllerAccountPickerInitTrezorAction
  | MainControllerAccountPickerInitLedgerAction
  | MainControllerAccountPickerInitPrivateKeyOrSeedPhraseAction
  | MainControllerAccountPickerInitFromSavedSeedPhraseAction
  | MainControllerSelectAccountAction
  | MainControllerAccountPickerSelectAccountAction
  | MainControllerAccountPickerDeselectAccountAction
  | MainControllerAccountPickerResetAction
  | MainControllerAccountPickerInitAction
  | ResetAccountAddingOnPageErrorAction
  | MainControllerAccountPickerResetAccountsSelectionAction
  | AccountsControllerReorderAccountsAction
  | AccountsControllerUpdateAccountPreferences
  | AccountsControllerUpdateAccountState
  | AccountsControllerResetAccountsNewlyAddedStateAction
  | SettingsControllerSetNetworkToAddOrUpdate
  | SettingsControllerResetNetworkToAddOrUpdate
  | MainControllerAddNetwork
  | KeystoreControllerUpdateKeyPreferencesAction
  | MainControllerUpdateNetworkAction
  | MainControllerUpdateNetworksAction
  | MainControllerAccountPickerSetPageAction
  | MainControllerAccountPickerSetHdPathTemplateAction
  | MainControllerAccountPickerAddAccounts
  | MainControllerAddAccounts
  | MainControllerRemoveAccount
  | RequestsControllerAddUserRequestAction
  | MainControllerLockAction
  | MainControllerOnPopupOpenAction
  | RequestsControllerBuildRequestAction
  | RequestsControllerRemoveUserRequestAction
  | RequestsControllerResolveUserRequestAction
  | RequestsControllerRejectUserRequestAction
  | MainControllerRejectSignAccountOpCall
  | MainControllerRejectAccountOpAction
  | MainControllerSignMessageInitAction
  | MainControllerSignMessageResetAction
  | MainControllerHandleSignMessage
  | MainControllerActivitySetAccOpsFiltersAction
  | MainControllerActivitySetSignedMessagesFiltersAction
  | MainControllerActivityResetAccOpsAction
  | MainControllerActivityResetSignedMessagesAction
  | MainControllerSignAccountOpInitAction
  | MainControllerSignAccountOpDestroyAction
  | MainControllerSignAccountOpUpdateMainDepsAction
  | MainControllerHandleSignAndBroadcastAccountOp
  | MainControllerSignAccountOpUpdateAction
  | MainControllerSignAccountOpUpdateStatus
  | MainControllerReloadSelectedAccount
  | MainControllerUpdateSelectedAccountPortfolio
  | DefiControllerAddSessionAction
  | DefiControllerRemoveSessionAction
  | SelectedAccountSetDashboardNetworkFilter
  | SelectedAccountDismissDefiPositionsBannerAction
  | PortfolioControllerAddCustomToken
  | PortfolioControllerGetTemporaryToken
  | PortfolioControllerToggleHideToken
  | PortfolioControllerRemoveCustomToken
  | PortfolioControllerCheckToken
  | PortfolioControllerUpdateConfettiToShown
  | KeystoreControllerAddSecretAction
  | KeystoreControllerAddTempSeedAction
  | KeystoreControllerUpdateSeedAction
  | KeystoreControllerUnlockWithSecretAction
  | KeystoreControllerResetErrorStateAction
  | KeystoreControllerChangePasswordAction
  | KeystoreControllerChangePasswordFromRecoveryAction
  | KeystoreControllerSendPrivateKeyToUiAction
  | EmailVaultControllerGetInfoAction
  | EmailVaultControllerUploadKeystoreSecretAction
  | EmailVaultControllerCancelConfirmationAction
  | EmailVaultControllerHandleMagicLinkKeyAction
  | EmailVaultControllerRecoverKeystoreAction
  | EmailVaultControllerCleanMagicAndSessionKeysAction
  | EmailVaultControllerRequestKeysSyncAction
  | EmailVaultControllerDismissBannerAction
  | DomainsControllerReverseLookupAction
  | DomainsControllerSaveResolvedReverseLookupAction
  | DappsControllerRemoveConnectedSiteAction
  | DappsControllerUpdateDappAction
  | DappsControllerRemoveDappAction
  | SwapAndBridgeControllerInitAction
  | SwapAndBridgeControllerUnloadScreenAction
  | SwapAndBridgeControllerUpdateFormAction
  | SwapAndBridgeControllerAddToTokenByAddress
  | SwapAndBridgeControllerSearchToToken
  | SwapAndBridgeControllerSwitchFromAndToTokensAction
  | SwapAndBridgeControllerSelectRouteAction
  | SwapAndBridgeControllerResetForm
  | RequestsControllerSwapAndBridgeActiveRouteBuildNextUserRequestAction
  | SwapAndBridgeControllerUpdateQuoteAction
  | SwapAndBridgeControllerRemoveActiveRouteAction
  | ActionsControllerRemoveFromActionsQueue
  | ActionsControllerFocusActionWindow
  | ActionsControllerMakeAllActionsActive
  | ActionsControllerSetCurrentActionById
  | ActionsControllerSetCurrentActionByIndex
  | ActionsControllerSetWindowLoaded
  | AddressBookControllerAddContact
  | AddressBookControllerRenameContact
  | AddressBookControllerRemoveContact
  | ChangeCurrentDappNetworkAction
  | SetIsPinnedAction
  | SetIsSetupCompleteAction
  | AutoLockControllerSetLastActiveTimeAction
  | AutoLockControllerSetAutoLockTimeAction
  | InviteControllerVerifyAction
  | InviteControllerBecomeOGAction
  | InviteControllerRevokeOGAction
  | ImportSmartAccountJson
  | KeystoreControllerSendSeedToUiAction
  | KeystoreControllerSendTempSeedToUiAction
  | MainControllerActivityHideBanner
  | KeystoreControllerDeleteSeedAction
  | PhishingControllerGetIsBlacklistedAndSendToUiAction
  | ExtensionUpdateControllerApplyUpdate
  | OpenExtensionPopupAction
  | SignAccountOpUpdateAction
  | SwapAndBridgeControllerMarkSelectedRouteAsFailed
  | SwapAndBridgeControllerDestroySignAccountOp
  | SwapAndBridgeControllerOpenSigningActionWindow
  | SwapAndBridgeControllerUserProceededAction
  | SwapAndBridgeControllerIsAutoSelectRouteDisabled
  | OpenSigningActionWindow
  | CloseSigningActionWindow
  | TransferControllerUpdateForm
  | TransferControllerResetForm
  | TransferControllerDestroyLatestBroadcastedAccountOp
  | TransferControllerUnloadScreen
  | TransferControllerUserProceededAction
  | TransferControllerShouldSkipTransactionQueuedModal
  | SetThemeTypeAction
  | SetLogLevelTypeAction
  | SetCrashAnalyticsAction
  | DismissBanner
  | PrivacyControllerInitializeSdkAction
  | PrivacyControllerUpdateFormAction
  | PrivacyControllerUnloadScreenAction
  | PrivacyControllerSignAccountOpUpdateAction
  | PrivacyControllerHasUserProceededAction
  | PrivacyControllerDestroySignAccountOpAction
  | PrivacyControllerDestroyLatestBroadcastedAccountOpAction
  | PrivacyControllerSyncSignAccountOpAction
  | PrivacyControllerGenerateSecretAction
  | PrivacyControllerResetFormAction
  | PrivacyControllerDirectBroadcastWithdrawalAction
  | PrivacyControllerResetSecretAction
  | PrivacyControllerGeneratePPv1KeysAction
  | PrivacyControllerAddImportedAccountToActivityControllerAction
