/**
 * The client layer: the one place the extension reaches the SDK, today its
 * doubles. Screens import this module and never `sdk-doubles/`, so the swap to
 * the real SDK touches this folder alone.
 *
 * The React hook lives in its own file, `useRecoveryClient`, imported by path,
 * so this module loads in a Node test without the UI's contexts.
 */
export { RECOVERY_CHAINS, CHAIN_IDS, WALLET_RECOVERY_CHAIN, recoveryChainOf } from './chains'
export { PLACEHOLDER_ADDRESSES, addressBookOf, sameAddress } from './addresses'
export {
  PUBLISHERS,
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
export { REMOVED_KEY_UNAVAILABLE_CAUSES } from './wallet-reads'
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
  sendRefusal
} from './sender'
export { sendRequestPort } from './sender-port'
export { UNKNOWN_TRANSACTION_MS, createReceiptWait } from './receipts'
export { SPONSOR_RAIL, RECOVERY_CALLS, sendingKeyOf } from './sending'
export { shapeNoteOf, privacyLevelOf } from './setup-notes'
export type {
  RecoveryChain,
  AddressBook,
  Publisher,
  PublisherKey,
  AuditedAction,
  UnknownAction,
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
  KeyHandle,
  TypedDataToSign,
  SignerFacade,
  SignerMember,
  SignerFacadeOptions,
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
  SendQueueState,
  SubmittedOperation,
  ActivityState,
  MainStatusState,
  SendRequestUpdate,
  SendRequestPort,
  SendPort,
  SendPortOptions,
  SendRefusal,
  SendRefusalReason,
  RecoveryCall,
  SendingKeys
} from './types'
// `sdkStandIn` stays out of this module: tests and development code import
// `shared/client/stand-in` by path, so no screen reaches the scripted chain.
