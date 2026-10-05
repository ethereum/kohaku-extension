/**
 * The client layer: the one place the extension reaches the SDK, today its
 * doubles. Screens import this module and never `sdk-doubles/`, so the swap to
 * the real SDK touches this folder alone.
 *
 * The React hooks live in their own files, `useRecoveryClient` and
 * `useAccountFacts`, imported by path, so this module loads in a Node test
 * without the UI's contexts.
 */
export { RECOVERY_CHAINS, CHAIN_IDS, WALLET_RECOVERY_CHAIN, recoveryChainOf } from './chains'
export { PUBLISHERS, DEPLOYMENTS, deploymentOf, deploymentFactsFrom } from './deployments'
export {
  PLACEHOLDER_ADDRESSES,
  addressBookOf,
  deploymentAddressesOf,
  sameAddress
} from './addresses'
export {
  AUDITED_ACTIONS,
  UNKNOWN_ACTION,
  auditedActionsOn,
  auditedActionOf,
  isAuditedAction,
  publisherKeyOf
} from './audited-actions'
export { DEPLOYMENT_FACTS, deploymentDescriptor, descriptorOf } from './descriptors'
export { REQUEST_WINDOW_SECONDS, clientConfigurationOf } from './configuration'
export {
  PROVIDER_READS,
  createProviderAdapter,
  revertedCall,
  providerReadFailure,
  isRevertedCall,
  isProviderReadFailure,
  revertDataOf
} from './provider-adapter'
export { createChainReads, gasCallOf } from './chain-reads'
export { networkOf, extensionProviderFor } from './extension-provider'
export {
  MANAGER_DOMAIN_NAME,
  buildRecoveryClient,
  checkDigestVersion,
  carriedDomainVersion,
  digestVersionRefusal,
  isDigestVersionRefusal
} from './build-client'
export { REMOVED_KEY_UNAVAILABLE_CAUSES, createPrivilegeReads } from './wallet-reads'
export { createCeremonyResolver, extensionClientFor } from './ceremony-resolver'
export {
  SIGNER_MEMBERS,
  MISSING_BACKGROUND_ACTION,
  SIGN_FLOW_FAILURE_REASONS,
  DEFAULT_SIGN_TIMEOUT_MS,
  ABSENCE_GRACE_MS,
  createSignerFacade,
  signRequestOf,
  typedMessageOf,
  listedBasicAccountOf,
  isListedBasicAccountKey,
  recoveredSignerOf,
  signerNotWired,
  isSignerNotWired,
  signFlowFailure,
  isSignFlowFailure
} from './signer'
export { accountFor } from './signer-account'
export { signRequestPort } from './signer-port'
export {
  MISSING_SEND_ACTION,
  SEND_REFUSAL_REASONS,
  DEFAULT_SEND_TIMEOUT_MS,
  SEND_SETTLE_MS,
  createSendPort,
  REQUEST_STATE_READ_MS,
  newSendRequestId,
  sendRequestStateOf,
  sendRefusal,
  accountBatchRefusal,
  isSendRefusal
} from './sender'
export { sendRequestPort } from './sender-port'
export { UNKNOWN_TRANSACTION_MS, createReceiptWait } from './receipts'
export { SPONSOR_RAIL, RECOVERY_CALLS, sendingKeyOf } from './sending'
export { shapeNoteOf, privacyLevelOf } from './setup-notes'
export { recoveryKitMarkOf, accountBatchTransactionOf } from './account-batch'
export {
  CREATION_BLOCK_STAND_IN,
  creationRecordOf,
  clientFactsOf,
  accountFactsOf,
  stateRefreshOf,
  sameFactsReading
} from './account-facts'
export type {
  RecoveryChain,
  AddressBook,
  Publisher,
  PublisherKey,
  AuditedAction,
  UnknownAction,
  DeployedAuditedAction,
  DeploymentFacts,
  DeploymentAddresses,
  Deployment,
  AccountFacts,
  RecoveryClientConfiguration,
  AdapterProvider,
  ProviderRead,
  RevertedCall,
  ProviderReadFailure,
  ChainReads,
  ChainReadsProvider,
  GasEstimateCall,
  ExtensionProvider,
  RecoveryKitClient,
  ApprovingClient,
  CeremonyClientFor,
  CeremonyResolverOptions,
  DomainVersion,
  DigestVersionRefusal,
  WalletReads,
  FitCheckReading,
  RemovedKeyReading,
  RemovedKeyUnavailableCause,
  PrivilegeAccount,
  PrivilegeReadsProvider,
  PrivilegeHoldersReading,
  PrivilegeReads,
  KeyHandle,
  TypedDataToSign,
  SignerFacade,
  SignerMember,
  SignerFacadeOptions,
  SignOptions,
  SignRequestAction,
  SignRequestPort,
  SignRequestUpdate,
  SignMessageState,
  RequestsState,
  ListedAccount,
  SignerNotWired,
  SignFlowFailure,
  SignFlowFailureReason,
  ReceiptProvider,
  ProviderTransaction,
  ProviderTransactionReceipt,
  ReceiptWait,
  SendRequestAction,
  ActionWindowState,
  QueuedRequest,
  SendQueueState,
  HeldRequestQueue,
  SendRequestState,
  SubmittedOperation,
  ActivityState,
  MainStatusState,
  SignAccountOpState,
  SendRequestUpdate,
  SendRequestPort,
  SendPort,
  FeeOption,
  FeeReading,
  EstimationListener,
  SendPortOptions,
  SendRefusal,
  SendRefusalReason,
  RecoveryCall,
  SendingKeys,
  AccountFactsSources,
  ListedAccountFacts,
  AccountFactsUnavailableCause,
  AccountFactsReading,
  AccountFactsResult,
  AccountStateRefresh,
  StateRefreshProgress,
  AccountBatchSource,
  RecoveryKitMark
} from './types'
// `sdkStandIn` stays out of this module: tests and development code import
// `shared/client/stand-in` by path, so no screen reaches the scripted chain.
