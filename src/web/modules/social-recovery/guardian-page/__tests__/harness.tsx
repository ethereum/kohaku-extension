/**
 * @jest-environment jsdom
 *
 * Mounts the approval page with the app's own components and the real
 * en.json. The edges are fakes: the router's search, the window's hash, the
 * wallet's networks, keystore, accounts, selected account, dispatch and
 * navigation, the request queue's signer facade, the clipboard, the file save, the QR code, and the recovery
 * client the page builds for the request's account, whose description, chain
 * reads and approving side each test scripts. The approving side's default
 * script is the wallet method's: it hands over the request's typed data,
 * packages a signature as the reply's proof and judges it as the deployed
 * method does: satisfied for a signature by the named key, not judged for
 * any other well-formed signature, rejected for bytes that are none. The guardian's key is a throwaway key that signs in the test.
 * The chain's own verdict over a reply recovers the signer and then asks the
 * named address's EIP-1271 check, which the node answers for a smart account
 * the wallet lists: it accepts its envelope around a signature by one of its
 * associated keys. A test may swap the facade for the real one over a
 * scripted request queue, whose sign window is the same scripted signer.
 * The logo is a stub. jsdom has no `TextEncoder`, which viem reads when it
 * loads, so the harness sets Node's before it loads the modules.
 */
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { TextDecoder, TextEncoder } from 'util'

import type { NavigateOptions } from 'react-router-dom'

import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import type { ThemeProps } from '@common/styles/themeConfig'
import type {
  Address,
  ApproverRequest,
  Attempt,
  Hex,
  RecoveryState,
  Reply,
  ReplyFailure,
  RequestDescription,
  Verdict
} from '@kohaku-eth/social-recovery'
import type {
  KeyHandle,
  ListedAccount,
  RecoveryAttemptState,
  RemovedKeyReading,
  SignerFacadeOptions,
  SignFlowFailureReason,
  SignOptions,
  SignRequestAction,
  SignRequestPort,
  SignRequestUpdate,
  TypedDataToSign
} from '@web/modules/social-recovery/shared/client'
import type { RecoveryClientState } from '@web/modules/social-recovery/shared/client/useRecoveryClient'

Object.assign(globalThis, { TextEncoder, TextDecoder })
// React only runs effects and state updates inside act() when this flag is set.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// ---------------------------------------------------------------------------
// Test-only types
// ---------------------------------------------------------------------------

/** The client state the page's hook hands back, with its retry. */
export type ClientState = RecoveryClientState & { retry: () => void }

/** The request account's scripted client: its description, its two chain reads and its approving side. */
export interface KitScript {
  describeRequest: jest.Mock<RequestDescription, [ApproverRequest]>
  attemptState: jest.Mock<Promise<RecoveryAttemptState>, []>
  /** The full recovery state and the removed key: reads the page never makes. */
  recoveryState: jest.Mock<Promise<RecoveryState>, []>
  removedKey: jest.Mock<Promise<RemovedKeyReading>, []>
  isAuthorized: jest.Mock<Promise<boolean>, []>
  signingInput: jest.Mock<unknown, [ApproverRequest]>
  replyFrom: jest.Mock<Promise<Reply | ReplyFailure>, [ApproverRequest, unknown, unknown]>
  verify: jest.Mock<Promise<Verdict>, [ApproverRequest, number, Hex]>
  /** The chain's own verdict over a reply, the method module's answer. */
  verifyReply: jest.Mock<Promise<Verdict>, [ApproverRequest, Reply]>
}

/** The keystore as the page reads it. */
export interface KeystoreScript {
  keys: { addr: string; type: 'internal' }[]
  isUnlocked: boolean
  hasPasswordSecret: boolean
}

/** A file the page saved. */
export interface SavedFile {
  name: string
  text: string
  type: string
}

/** An account the wallet lists, as the page reads it. */
export interface ListedAccountScript {
  addr: string
  associatedKeys: string[]
  /** Null for a basic account; a smart account's creation otherwise. */
  creation: null | { factoryAddr: string; bytecode: string; salt: string }
}

/** A network the wallet holds, as the page reads it. */
export interface NetworkScript {
  chainId: bigint
  name: string
}

/** A static call the page sends the node. */
export interface CallScript {
  to: string
  data: Hex
}

/** The wallet's edges the signing half reads. */
export interface WalletScript {
  keystore: KeystoreScript
  accounts: ListedAccountScript[]
  networks: NetworkScript[]
  /**
   * Whether the page's signer facade is the real one over the scripted
   * request queue, whose sign window is `signTypedData`; otherwise the
   * facade is `signTypedData` itself.
   */
  realFacade: boolean
  /** The node's answer to a static call over the page's provider. */
  nodeCall: jest.Mock<Promise<string>, [CallScript]>
  /** The address the wallet's selected-account state reports. */
  selected: string | undefined
  selectedListeners: Set<() => void>
  dispatch: jest.Mock<void, [{ type: string; params?: unknown }]>
  navigate: jest.Mock<void, [string, NavigateOptions?]>
  signTypedData: jest.Mock<Promise<Hex>, [KeyHandle, TypedDataToSign, SignOptions?]>
  copied: jest.Mock<Promise<boolean>, [string]>
  saved: jest.Mock<void, [SavedFile]>
  qr: string[]
}

export interface Mounted {
  unmount: () => void
  has: (id: string) => boolean
  /** Whether the element under a test id holds one under another. */
  hasWithin: (id: string, inner: string) => boolean
  textOf: (id: string) => string
  text: () => string
  press: (id: string) => Promise<void>
  isDisabled: (id: string) => boolean
  /** Types text into the input under a test id. */
  type: (id: string, text: string) => Promise<void>
}

// ---------------------------------------------------------------------------
// The edges
// ---------------------------------------------------------------------------

const mockLocation: {
  current: { pathname: string; search: string; hash: string }
  listeners: Set<() => void>
} = {
  current: { pathname: '/social-recovery/approve', search: '', hash: '' },
  listeners: new Set()
}
const mockClient: {
  state: ClientState | null
  accounts: (string | undefined)[]
  listeners: Set<() => void>
} = { state: null, accounts: [], listeners: new Set() }
const mockLoading: ClientState = { status: 'loading', retry: () => {} }
const mockQueue: { listeners: Set<(update: SignRequestUpdate) => void> } = {
  listeners: new Set()
}
const mockWallet: WalletScript = {
  keystore: { keys: [], isUnlocked: true, hasPasswordSecret: true },
  accounts: [],
  networks: [],
  realFacade: false,
  nodeCall: jest.fn(),
  selected: undefined,
  selectedListeners: new Set(),
  dispatch: jest.fn(),
  navigate: jest.fn(),
  signTypedData: jest.fn(),
  copied: jest.fn(),
  saved: jest.fn(),
  qr: []
}

// The spinner's animation needs a native module jsdom lacks; a plain view stands in.
jest.mock('@common/components/Spinner', () => {
  /* eslint-disable @typescript-eslint/no-var-requires, global-require */
  const mockReact: typeof import('react') = require('react')
  const { View: MockView }: typeof import('react-native') = require('react-native')
  /* eslint-enable @typescript-eslint/no-var-requires, global-require */
  return {
    __esModule: true,
    default: () => mockReact.createElement(MockView, { testID: 'spinner' })
  }
})
jest.mock('@web/modules/social-recovery/shared/client/useRecoveryClient', () => ({
  useRecoveryClient: (account: string | undefined) => {
    mockClient.accounts.push(account)
    // eslint-disable-next-line global-require
    return require('react').useSyncExternalStore(
      (listener: () => void) => {
        mockClient.listeners.add(listener)
        return () => mockClient.listeners.delete(listener)
      },
      () => (account ? mockClient.state ?? mockLoading : mockLoading)
    )
  }
}))
jest.mock('@web/hooks/useNetworksControllerState', () => ({
  __esModule: true,
  default: () => ({ networks: mockWallet.networks })
}))
jest.mock('@web/hooks/useKeystoreControllerState', () => ({
  __esModule: true,
  default: () => mockWallet.keystore
}))
jest.mock('@web/hooks/useAccountsControllerState', () => ({
  __esModule: true,
  default: () => ({ accounts: mockWallet.accounts })
}))
jest.mock('@web/hooks/useSelectedAccountControllerState', () => ({
  __esModule: true,
  default: () => {
    // eslint-disable-next-line global-require
    const addr: string | undefined = require('react').useSyncExternalStore(
      (listener: () => void) => {
        mockWallet.selectedListeners.add(listener)
        return () => mockWallet.selectedListeners.delete(listener)
      },
      () => mockWallet.selected
    )
    return { account: addr ? { addr } : null }
  }
}))
jest.mock('@web/hooks/useBackgroundService', () => {
  const dispatch = (action: { type: string; params?: unknown }) => mockWallet.dispatch(action)
  return { __esModule: true, default: () => ({ dispatch, windowId: undefined }) }
})
jest.mock('@common/hooks/useNavigation', () => {
  const navigate = (...args: [string, NavigateOptions?]) => mockWallet.navigate(...args)
  return { __esModule: true, default: () => ({ navigate }) }
})
jest.mock('@web/modules/social-recovery/shared/client', () => {
  const actual: typeof import('@web/modules/social-recovery/shared/client') = jest.requireActual(
    '@web/modules/social-recovery/shared/client'
  )
  return {
    ...actual,
    // The request queue's pushes come from the scripted background below.
    signRequestPort: (
      dispatch: SignRequestPort['dispatch'],
      accounts: () => readonly ListedAccount[] | undefined,
      windowId?: number
    ): SignRequestPort => ({
      dispatch,
      subscribe(listener) {
        mockQueue.listeners.add(listener)
        return () => mockQueue.listeners.delete(listener)
      },
      accounts: () => accounts() ?? [],
      windowId: () => windowId
    }),
    createSignerFacade: (port: SignRequestPort, options: SignerFacadeOptions) =>
      mockWallet.realFacade
        ? actual.createSignerFacade(port, options)
        : {
            signTypedData: (
              key: KeyHandle,
              typedData: TypedDataToSign,
              signOptions?: SignOptions
            ) => mockWallet.signTypedData(key, typedData, signOptions),
            signBytes: () => Promise.reject(new Error('no bytes are signed here'))
          },
    extensionProviderFor: () => ({
      call: (transaction: CallScript) => mockWallet.nodeCall(transaction),
      destroy: () => {}
    })
  }
})
jest.mock('@common/utils/clipboard', () => ({
  setStringAsync: (text: string) => mockWallet.copied(text)
}))
jest.mock('@web/modules/social-recovery/setup/enroll/carriers', () => ({
  saveChallengeFile: (file: SavedFile) => mockWallet.saved(file)
}))
// The QR library ships untranspiled modules.
jest.mock('react-native-qrcode-svg', () => ({
  __esModule: true,
  default: ({ value }: { value: string }) => {
    mockWallet.qr.push(value)
    return null
  }
}))
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  // The router renders the same page again when the link in the tab changes.
  useLocation: () =>
    // eslint-disable-next-line global-require
    require('react').useSyncExternalStore(
      (listener: () => void) => {
        mockLocation.listeners.add(listener)
        return () => mockLocation.listeners.delete(listener)
      },
      () => mockLocation.current
    )
}))
jest.mock('@common/components/AmbireLogoHorizontal', () => ({
  __esModule: true,
  default: () => null
}))
// The page's deployment is the build's own; no deployment variable from a
// developer's environment changes it.
jest.mock('@web/modules/social-recovery/shared/client/deployment-env', () => ({
  SEPOLIA_DEPLOYMENT_VARIABLE: 'SOCIAL_RECOVERY_SEPOLIA_DEPLOYMENT',
  sepoliaDeploymentVariable: () => undefined
}))

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const {
  decodeAbiParameters,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionData,
  encodeFunctionResult,
  getAddress,
  hashTypedData,
  isAddressEqual,
  keccak256,
  parseAbi,
  recoverAddress,
  recoverTypedDataAddress,
  size,
  slice,
  zeroAddress
}: typeof import('viem') = require('viem')
const {
  approvalDigest,
  approvalTypedData,
  cancellationDigest,
  cancellationTypedData
}: typeof import('@kohaku-eth/social-recovery') = require('@kohaku-eth/social-recovery')
const {
  generatePrivateKey,
  privateKeyToAccount
}: typeof import('viem/accounts') = require('viem/accounts')
const {
  ThemeContext
}: typeof import('@common/contexts/themeContext') = require('@common/contexts/themeContext')
const themeConfig: typeof import('@common/styles/themeConfig') = require('@common/styles/themeConfig')
const i18n: typeof import('@common/config/localization').default =
  require('@common/config/localization').default
const {
  WEB_ROUTES
}: typeof import('@common/modules/router/constants/common') = require('@common/modules/router/constants/common')
const {
  ACCOUNT_CHECK_LIMIT_MS: accountCheckLimitMs,
  addressBookOf,
  descriptorOf,
  signFlowFailure,
  signerNotWired,
  WALLET_RECOVERY_CHAIN
}: typeof import('@web/modules/social-recovery/shared/client') = require('@web/modules/social-recovery/shared/client')
const {
  approvalLinkOf,
  replyOfLine
}: typeof import('@web/modules/social-recovery/recovery/checklist') = require('@web/modules/social-recovery/recovery/checklist')
const ApproveScreen: typeof import('@web/modules/social-recovery/guardian-page/ApproveScreen').default =
  require('@web/modules/social-recovery/guardian-page/ApproveScreen').default
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

export const t = (key: string, values?: Record<string, unknown>): string => i18n.t(key, values)

export const DESCRIPTOR = descriptorOf(WALLET_RECOVERY_CHAIN, addressBookOf(WALLET_RECOVERY_CHAIN))
/** The manager the build reads, checksummed as the page draws it. */
export const MANAGER: Address = getAddress(DESCRIPTOR.manager)

/** The account being recovered. */
export const ACCOUNT: Address = getAddress('0x2b0f5e98ee98adc9865745e98802f333f72f6ef5')
/** The key the recovery installs. */
export const NEW_KEY: Address = getAddress('0x7a19c3f0b41d8e5a90cc77b2e4f8135aa62cc204')
/** The key the recovery removes. */
export const REMOVED_KEY: Address = getAddress('0x3fb2c4e8a19d07f6e5c3d1b8a24f9e7c60d1a2a2')
/** A payee the payment order names. */
export const PAYEE: Address = getAddress('0x9a4d000000000000000000000000000000000011')

/** The guardian's throwaway key, the one the request names. */
export const GUARDIAN_ACCOUNT = privateKeyToAccount(generatePrivateKey())
export const GUARDIAN: Address = GUARDIAN_ACCOUNT.address
/** Another throwaway key, one the request does not name. */
export const STRANGER_ACCOUNT = privateKeyToAccount(generatePrivateKey())
/** The throwaway key that controls the guardian's smart account. */
export const CONTROLLER_ACCOUNT = privateKeyToAccount(generatePrivateKey())
export const CONTROLLER: Address = CONTROLLER_ACCOUNT.address
/** The guardian's smart account, which the wallet lists beside its controlling key. */
export const SMART_ACCOUNT: Address = getAddress('0x5a17000000000000000000000000000000000c0d')
/** How long the signer facade waits for a smart account's check of a signature. */
export const ACCOUNT_CHECK_LIMIT_MS = accountCheckLimitMs
/** The extension's network for the recovery chain. */
export const RECOVERY_NETWORK: NetworkScript = { chainId: 11155111n, name: 'Sepolia' }

/** A credential config naming an address, as the wallet method encodes it. */
export const configOf = (address: Address): Hex =>
  encodeAbiParameters([{ type: 'address' }], [address])

/** The request's moment of creation and its deadline, 24 hours later, in seconds. */
export const CREATED_AT = 1_800_000_000
export const VALID_UNTIL = CREATED_AT + 86_400

export const PAYLOAD: Hex = '0xabcdef'
export const ATTEMPT_ID = '3'
export const SETUP_NONCE = '2'

/** The approval branch of a request, the one a link to the page carries. */
export type ApprovalRequest = Extract<ApproverRequest, { purpose: 'approval' }>

/** The approval request one place's link carries. */
export const requestOf = (overrides: Partial<ApprovalRequest> = {}): ApprovalRequest => ({
  kind: 'recovery-proof-request',
  version: 1,
  purpose: 'approval',
  chainId: String(DESCRIPTOR.chainId),
  manager: DESCRIPTOR.manager,
  digestVersion: DESCRIPTOR.digestVersion,
  account: ACCOUNT,
  action: DESCRIPTOR.action,
  attemptId: ATTEMPT_ID,
  setupNonce: SETUP_NONCE,
  setupBodyHash: `0x${'5e'.repeat(32)}`,
  payload: PAYLOAD,
  order: { token: zeroAddress, amount: '0', payee: zeroAddress },
  validUntil: String(VALID_UNTIL),
  place: 1,
  method: DESCRIPTOR.methodEcdsa,
  config: configOf(GUARDIAN),
  salt: '0x02',
  credentialHoldsCode: false,
  ...overrides
})

/** The extension's full-tab page a link opens. */
export const TAB_URL = 'chrome-extension://kohaku/tab.html'

/** The link to the approval page for a request. */
export const linkOf = (request: ApproverRequest) => approvalLinkOf(request, TAB_URL)

/** The search string the router hands the page for a link. */
export const searchOf = (link: string) => link.slice(link.indexOf('?'))

/** What the orchestrator describes of a request: its values, with the handover decoded. */
export const descriptionOf = (
  request: ApproverRequest,
  overrides: Partial<RequestDescription> = {}
): RequestDescription => ({
  account: request.account,
  chainId: Number(request.chainId),
  manager: request.manager,
  action: request.action,
  attemptId: BigInt(request.attemptId),
  setupNonce: BigInt(request.setupNonce),
  purpose: 'approval',
  handover: { decoded: true, newAuthority: NEW_KEY, removedAuthority: REMOVED_KEY },
  validUntil: Number(request.validUntil),
  place: request.place,
  identityPublic: { method: request.method, config: request.config, saltPublished: true },
  device: 'no-implementation',
  ...overrides
})

/** The manager's empty attempt slot. */
export const NO_ATTEMPT: Attempt = {
  state: 'None',
  attemptId: 0n,
  setupNonce: 0n,
  consumableAfter: 0,
  payloadHash: `0x${'00'.repeat(32)}`,
  order: { token: zeroAddress, amount: 0n, payee: zeroAddress },
  usedMethods: [],
  ignoresPause: false
}

/** The end of the submitted attempt's waiting period, in seconds. */
export const WAIT_ENDS_AT = CREATED_AT + 3 * 86_400

/** The recoverer's submission of the request, waiting out its period. */
export const SUBMITTED: Attempt = {
  ...NO_ATTEMPT,
  state: 'Waiting',
  attemptId: BigInt(ATTEMPT_ID),
  setupNonce: BigInt(SETUP_NONCE),
  consumableAfter: WAIT_ENDS_AT,
  payloadHash: keccak256(PAYLOAD)
}

/** The manager's attempt state while the request is live. */
export const attemptStateOf = (
  overrides: Partial<RecoveryAttemptState> = {}
): RecoveryAttemptState => ({
  attempt: NO_ATTEMPT,
  nextAttemptId: BigInt(ATTEMPT_ID),
  setupCommitment: `0x${'ab'.repeat(32)}`,
  setupNonce: BigInt(SETUP_NONCE),
  block: { number: 200, timestamp: CREATED_AT, hash: `0x${'cd'.repeat(32)}` },
  ...overrides
})

/** The members a request's digest closes over, its decimal strings read back as numbers. */
const membersOf = (request: ApproverRequest) => ({
  chainId: Number(request.chainId),
  manager: request.manager,
  account: request.account,
  action: request.action,
  attemptId: BigInt(request.attemptId),
  setupNonce: BigInt(request.setupNonce),
  setupBodyHash: request.setupBodyHash,
  validUntil: Number(request.validUntil),
  digestVersion: request.digestVersion
})

/** The approval members of an approval request: its payload and its order beside the common ones. */
const approvalMembersOf = (request: Extract<ApproverRequest, { purpose: 'approval' }>) => ({
  ...membersOf(request),
  payload: request.payload,
  order: { ...request.order, amount: BigInt(request.order.amount) }
})

/** The typed data the wallet method hands over for a request. */
export const typedDataFor = (request: ApproverRequest): TypedDataToSign =>
  (request.purpose === 'approval'
    ? approvalTypedData(approvalMembersOf(request), request.place)
    : cancellationTypedData(membersOf(request), request.place)) as unknown as TypedDataToSign

/** The digest a request's typed data hashes to. */
const digestFor = (request: ApproverRequest): Hex =>
  request.purpose === 'approval'
    ? approvalDigest(approvalMembersOf(request), request.place)
    : cancellationDigest(membersOf(request), request.place)

type SigningAccount = typeof GUARDIAN_ACCOUNT

/** A signature by a throwaway key over typed data. */
export const signatureBy = (account: SigningAccount, typedData: TypedDataToSign): Promise<Hex> =>
  account.signTypedData(typedData as unknown as Parameters<SigningAccount['signTypedData']>[0])

/** The reply the wallet method packages from a signature: the signature is the proof. */
export const replyOf = (request: ApproverRequest, proof: Hex): Reply => ({
  kind: 'recovery-proof-reply',
  version: 1,
  chainId: request.chainId,
  manager: request.manager,
  account: request.account,
  action: request.action,
  attemptId: request.attemptId,
  purpose: request.purpose,
  place: request.place,
  method: request.method,
  config: request.config,
  salt: request.salt,
  digest: digestFor(request),
  proof
})

/**
 * The line the guardian sends back for a reply, written out here: the reply's
 * record as plain JSON on one line, its keys in the record's order.
 */
export const lineOf = (reply: Reply): string =>
  JSON.stringify({
    kind: reply.kind,
    version: reply.version,
    chainId: reply.chainId,
    manager: reply.manager,
    account: reply.account,
    action: reply.action,
    attemptId: reply.attemptId,
    purpose: reply.purpose,
    place: reply.place,
    method: reply.method,
    config: reply.config,
    salt: reply.salt,
    digest: reply.digest,
    proof: reply.proof
  })

/** The approval the recoverer's paste reads from a line. */
export const pastedReplyOf = (line: string): Reply | null => replyOfLine(line)

/** The EIP-712 digest of typed data. */
export const hashOf = (typedData: TypedDataToSign): Hex =>
  hashTypedData(typedData as unknown as Parameters<typeof hashTypedData>[0])

/** An approval as the signed page shows it: its first twelve and last eight digits. */
export const approvalOf = (proof: Hex): string => `${proof.slice(0, 14)}…${proof.slice(-8)}`

/** The signer facade's refusal for a reason. */
export const signRefusal = (reason: SignFlowFailureReason) =>
  signFlowFailure('signTypedData', reason)

/** The signer facade's refusal of a key the wallet does not list as a basic account. */
export const notListedRefusal = (key: KeyHandle) => signerNotWired('signTypedData', key)

/** Where the page sends a locked wallet. */
export const UNLOCK_ROUTE = WEB_ROUTES.keyStoreUnlock

/** A signature that has the shape of hex bytes. */
const hexBytes = (value: unknown): value is Hex =>
  typeof value === 'string' && /^0x([0-9a-fA-F]{2})+$/.test(value)

const SIGNATURE_BYTES = 65

/** Bytes that are 65 long but no signature: a recovery byte of neither parity. */
export const malformedSignature = (signature: Hex): Hex => `${signature.slice(0, -2)}05` as Hex

/**
 * The wallet method's verdict: satisfied where a 65-byte signature recovers to
 * the address the config names, not judged for any other well-formed bytes,
 * since the address may hold code, and rejected for bytes that are no
 * signature.
 */
const walletVerdict = async (request: ApproverRequest, proof: Hex): Promise<Verdict> => {
  if (!hexBytes(proof)) {
    return 'rejected'
  }
  if (size(proof) !== SIGNATURE_BYTES) {
    return 'not-judged'
  }
  try {
    const [named] = decodeAbiParameters([{ type: 'address' }], request.config)
    const signer = await recoverTypedDataAddress({
      ...(typedDataFor(request) as unknown as Parameters<typeof recoverTypedDataAddress>[0]),
      signature: proof
    })
    return isAddressEqual(signer, named) ? 'satisfied' : 'not-judged'
  } catch {
    return 'rejected'
  }
}

/** The controlling key's signature in the smart account's own envelope: one more byte. */
export const wrappedBy = async (
  account: SigningAccount,
  typedData: TypedDataToSign
): Promise<Hex> => `${await signatureBy(account, typedData)}01` as Hex

const EIP1271_ABI = parseAbi([
  'function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)'
])
export const EIP1271_MAGIC: Hex = '0x1626ba7e'

/**
 * The smart account's own check, as the deployed account answers it: a
 * signature in its envelope whose first 65 bytes one of its associated keys
 * made over the digest. Only a smart account the wallet lists holds code.
 */
const accountAccepts = async (account: string, digest: Hex, signature: Hex): Promise<boolean> => {
  const smart = mockWallet.accounts.find(
    (listed) => !!listed.creation && isAddressEqual(listed.addr as Address, account as Address)
  )
  if (!smart || size(signature) !== SIGNATURE_BYTES + 1) {
    return false
  }
  try {
    const signer = await recoverAddress({
      hash: digest,
      signature: slice(signature, 0, SIGNATURE_BYTES)
    })
    return smart.associatedKeys.some((key) => isAddressEqual(key as Address, signer))
  } catch {
    return false
  }
}

/** The node's answer to the account's `isValidSignature`; an address with no code answers empty. */
const nodeAnswer = async ({ to, data }: CallScript): Promise<string> => {
  const { args } = decodeFunctionData({ abi: EIP1271_ABI, data })
  const [digest, signature] = args
  const holdsCode = mockWallet.accounts.some(
    (listed) => !!listed.creation && isAddressEqual(listed.addr as Address, to as Address)
  )
  if (!holdsCode) {
    return '0x'
  }
  return encodeFunctionResult({
    abi: EIP1271_ABI,
    functionName: 'isValidSignature',
    result: (await accountAccepts(to, digest, signature)) ? EIP1271_MAGIC : '0xffffffff'
  })
}

/**
 * The chain's verdict over a reply, as the method module gives it: ecrecover
 * to the address the config names, then that address's own EIP-1271 check.
 */
const chainVerdict = async (request: ApproverRequest, reply: Reply): Promise<Verdict> => {
  const [named] = decodeAbiParameters([{ type: 'address' }], request.config)
  if (size(reply.proof) === SIGNATURE_BYTES) {
    try {
      const signer = await recoverAddress({ hash: reply.digest, signature: reply.proof })
      if (isAddressEqual(signer, named)) {
        return 'satisfied'
      }
    } catch {
      return 'rejected'
    }
  }
  return (await accountAccepts(named, reply.digest, reply.proof)) ? 'satisfied' : 'rejected'
}

/**
 * The background behind the real facade: the request the facade adds is
 * queued, and the sign window, `signTypedData`, answers it under the
 * request's account; a refusal takes the request out of the queue.
 */
const backgroundOf = (dispatched: { type: string; params?: unknown }) => {
  const action = dispatched as SignRequestAction
  if (!mockWallet.realFacade || action.type !== 'REQUESTS_CONTROLLER_ADD_USER_REQUEST') {
    return
  }
  const { userRequest } = action.params
  const push = (update: SignRequestUpdate) =>
    [...mockQueue.listeners].forEach((listener) => listener(update))
  const queueOf = (ids: string[]): SignRequestUpdate => ({
    controller: 'requests',
    state: {
      userRequests: ids.map((id) => ({ id })),
      userRequestsWaitingAccountSwitch: []
    }
  })
  push(queueOf([String(userRequest.id)]))
  const { domain, types, primaryType, message } = userRequest.action as unknown as TypedDataToSign
  mockWallet
    .signTypedData({ addr: userRequest.meta.accountAddr as Address, type: 'internal' }, {
      domain,
      types,
      primaryType,
      message
    } as TypedDataToSign)
    .then(
      (signature) =>
        push({
          controller: 'signMessage',
          state: { signedMessage: { fromActionId: userRequest.id, signature } as never }
        }),
      () => push(queueOf([]))
    )
}

/** The requests the real facade added to the queue, in order. */
export const queuedRequests = () =>
  mockWallet.dispatch.mock.calls
    .map(([action]) => action as SignRequestAction)
    .flatMap((action) =>
      action.type === 'REQUESTS_CONTROLLER_ADD_USER_REQUEST' ? [action.params.userRequest] : []
    )

/**
 * The wallet of a guardian whose smart account the request names: it holds
 * the controlling key, lists that key and the smart account, has the smart
 * account selected and signs for it in the account's envelope, over the real
 * facade and the network of the recovery chain.
 */
export const holdSmartAccount = () => {
  mockWallet.keystore.keys = [{ addr: CONTROLLER, type: 'internal' }]
  mockWallet.accounts = [
    { addr: CONTROLLER, associatedKeys: [CONTROLLER], creation: null },
    {
      addr: SMART_ACCOUNT,
      associatedKeys: [CONTROLLER],
      creation: {
        factoryAddr: getAddress('0xfac7000000000000000000000000000000000001'),
        bytecode: '0x00',
        salt: `0x${'00'.repeat(32)}`
      }
    }
  ]
  mockWallet.selected = SMART_ACCOUNT
  mockWallet.networks = [RECOVERY_NETWORK]
  mockWallet.realFacade = true
  mockWallet.signTypedData.mockImplementation((_key, typedData) =>
    wrappedBy(CONTROLLER_ACCOUNT, typedData)
  )
}

/** The approval request a guardian's smart account answers. */
export const smartRequestOf = (overrides: Partial<ApprovalRequest> = {}): ApprovalRequest =>
  requestOf({ config: configOf(SMART_ACCOUNT), credentialHoldsCode: true, ...overrides })

/**
 * The wallet method the client's registry hands out under its slug, decoding
 * a config with the SDK's own wallet codec. The SDK builds a TextEncoder when
 * it loads, so it loads at the first decode, after the globals are installed.
 */
const walletMethod = {
  modules: () => [DESCRIPTOR.methodEcdsa],
  codec: {
    decodeConfig: (config: Hex) =>
      // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
      (require('@kohaku-eth/social-recovery') as typeof import('@kohaku-eth/social-recovery'))
        .walletMethod()
        .codec.decodeConfig(config)
  }
}

export const kit: KitScript = {
  describeRequest: jest.fn(),
  attemptState: jest.fn(),
  recoveryState: jest.fn(),
  removedKey: jest.fn(),
  isAuthorized: jest.fn(),
  signingInput: jest.fn(),
  replyFrom: jest.fn(),
  verify: jest.fn(),
  verifyReply: jest.fn()
}

/** The wallet's edges each test scripts. */
export const wallet = mockWallet

/** The ready state of the page's hook over the scripted client. */
export const readyClient = (descriptor = DESCRIPTOR): ClientState =>
  ({
    status: 'ready',
    client: {
      descriptor,
      approving: {
        describeRequest: (request: ApproverRequest) => kit.describeRequest(request),
        signingInput: (request: ApproverRequest) => kit.signingInput(request),
        replyFrom: (request: ApproverRequest, input: unknown, material: unknown) =>
          kit.replyFrom(request, input, material),
        verify: (request: ApproverRequest, place: number, proof: Hex) =>
          kit.verify(request, place, proof)
      },
      methodFor: (slug: string) => (slug === 'ecdsa' ? walletMethod : undefined),
      recovery: { recoveryState: () => kit.recoveryState() },
      walletReads: {
        attemptState: () => kit.attemptState(),
        removedKey: () => kit.removedKey(),
        verifyReply: (request: ApproverRequest, reply: Reply) => kit.verifyReply(request, reply)
      },
      action: { isAuthorized: () => kit.isAuthorized() }
    },
    reads: {},
    receipts: {},
    retry: () => {}
  } as unknown as ClientState)

/** Sets the client state the page gets, and renders it. */
export const setClient = (state: ClientState | null) => {
  act(() => {
    mockClient.state = state
    mockClient.listeners.forEach((listener) => listener())
  })
}

/** The accounts the page asked a client for, in order, undefined where it asked for none. */
export const clientAccounts = () => mockClient.accounts

/** The wallet's selected-account state reports another address, and the page renders it. */
export const selectAccount = (addr: string | undefined) => {
  act(() => {
    mockWallet.selected = addr
    mockWallet.selectedListeners.forEach((listener) => listener())
  })
}

/** The account selections the page asked the wallet for, in order. */
export const selections = () =>
  mockWallet.dispatch.mock.calls
    .map(([action]) => action)
    .filter((action) => action.type === 'MAIN_CONTROLLER_SELECT_ACCOUNT')

/** The search string the router hands the page. */
export const setSearch = (search: string) => {
  mockLocation.current = { ...mockLocation.current, search }
  mockLocation.listeners.forEach((listener) => listener())
}

/**
 * Puts every edge back: the page's clock at the request's creation, a live
 * request on chain, the wallet method's approving side, and an unlocked
 * wallet that holds the guardian's key, lists it as a basic account and has
 * it selected.
 */
export const resetEdges = () => {
  jest.useFakeTimers('modern')
  jest.setSystemTime(CREATED_AT * 1000)
  window.location.hash = ''
  mockLocation.current = { ...mockLocation.current, search: '' }
  mockClient.accounts = []
  mockClient.state = readyClient()
  kit.describeRequest.mockReset()
  kit.describeRequest.mockImplementation((request) => descriptionOf(request))
  kit.attemptState.mockReset()
  kit.attemptState.mockImplementation(async () => attemptStateOf())
  kit.recoveryState.mockReset()
  kit.recoveryState.mockRejectedValue(new Error('the recovery state is not read'))
  kit.removedKey.mockReset()
  kit.removedKey.mockRejectedValue(new Error('the removed key is not read'))
  kit.isAuthorized.mockReset()
  kit.isAuthorized.mockImplementation(async () => true)
  kit.signingInput.mockReset()
  kit.signingInput.mockImplementation((request) => typedDataFor(request))
  kit.replyFrom.mockReset()
  kit.replyFrom.mockImplementation(async (request, _input, material) => {
    const signature = (material as { signature?: unknown } | undefined)?.signature
    return hexBytes(signature)
      ? replyOf(request, signature)
      : { kind: 'reply-failure', cause: 'material-rejected' }
  })
  kit.verify.mockReset()
  kit.verify.mockImplementation((request, _place, proof) => walletVerdict(request, proof))
  kit.verifyReply.mockReset()
  kit.verifyReply.mockImplementation(chainVerdict)
  mockWallet.networks = []
  mockWallet.realFacade = false
  mockWallet.nodeCall.mockReset()
  mockWallet.nodeCall.mockImplementation(nodeAnswer)
  mockQueue.listeners.clear()
  mockWallet.keystore = {
    keys: [{ addr: GUARDIAN, type: 'internal' }],
    isUnlocked: true,
    hasPasswordSecret: true
  }
  mockWallet.accounts = [{ addr: GUARDIAN, associatedKeys: [GUARDIAN], creation: null }]
  mockWallet.selected = GUARDIAN
  mockWallet.dispatch.mockReset()
  mockWallet.dispatch.mockImplementation(backgroundOf)
  mockWallet.navigate.mockReset()
  mockWallet.signTypedData.mockReset()
  mockWallet.signTypedData.mockImplementation((_key, typedData) =>
    signatureBy(GUARDIAN_ACCOUNT, typedData)
  )
  mockWallet.copied.mockReset()
  mockWallet.copied.mockImplementation(async () => true)
  mockWallet.saved.mockReset()
  mockWallet.qr = []
}

// ---------------------------------------------------------------------------
// The mount
// ---------------------------------------------------------------------------

const THEME = Object.fromEntries(
  Object.entries(themeConfig.default).map(([name, byType]) => [
    name,
    byType[themeConfig.THEME_TYPES.LIGHT]
  ])
) as ThemeProps

const THEME_CONTEXT: ThemeContextReturnType = {
  theme: THEME,
  themeType: themeConfig.THEME_TYPES.LIGHT,
  selectedThemeType: themeConfig.THEME_TYPES.LIGHT,
  setThemeType: () => {}
}

/** Lets the pending reads settle, then renders what they changed. The fakes answer in microtasks. */
export const settle = () =>
  act(async () => {
    for (let round = 0; round < 10; round += 1) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve()
    }
  })

/** Moves the page's clock and its timers forward, then lets the reads settle. */
export const advance = async (ms: number) => {
  act(() => {
    jest.advanceTimersByTime(ms)
  })
  await settle()
}

/** Opens another link in the same tab: the router hands the mounted page the new search. */
export const navigate = async (search: string) => {
  act(() => setSearch(search))
  await settle()
}

// The pages still mounted, so a test that fails before its own unmount
// leaves no timer running into the next test.
const mountedPages = new Set<() => void>()

/** Unmounts every page a test left mounted. */
export const unmountPages = () => {
  mountedPages.forEach((unmount) => unmount())
}

/** Mounts the approval page on the search string the router hands it. */
export const mountPage = async (search: string): Promise<Mounted> => {
  setSearch(search)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)

  await act(async () => {
    root.render(
      <ThemeContext.Provider value={THEME_CONTEXT}>
        <ApproveScreen />
      </ThemeContext.Provider>
    )
  })
  await settle()

  const unmount = () => {
    if (!mountedPages.delete(unmount)) {
      return
    }
    act(() => root.unmount())
    container.remove()
  }
  mountedPages.add(unmount)

  return {
    unmount,
    has: (id) => byTestId(id) !== null,
    hasWithin: (id, inner) => !!byTestId(id)?.querySelector(`[data-testid="${inner}"]`),
    textOf: (id) => byTestId(id)?.textContent ?? '',
    text: () => container.textContent ?? '',
    press: async (id) => {
      const node = byTestId(id)
      if (!node) {
        throw new Error(`nothing to press: ${id}`)
      }
      act(() => node.click())
      await settle()
    },
    isDisabled: (id) => byTestId(id)?.getAttribute('aria-disabled') === 'true',
    type: async (id, text) => {
      const node = byTestId(id)
      const input =
        node instanceof HTMLInputElement ? node : node?.querySelector<HTMLInputElement>('input')
      if (!input) {
        throw new Error(`nothing to type into: ${id}`)
      }
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      act(() => {
        setValue?.call(input, text)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      await settle()
    }
  }
}

/** Mounts the page on the search string of a request's link. */
export const mountLive = (request: ApproverRequest = requestOf()) =>
  mountPage(searchOf(linkOf(request)))

// Registered only when Jest runs this file itself: a suite that imports the
// harness does not run its checks again.
const runningHarnessItself = expect.getState().testPath === __filename

const describeHarness = runningHarnessItself ? describe : () => undefined

describeHarness('the approval page harness', () => {
  beforeEach(resetEdges)
  afterEach(() => {
    unmountPages()
    jest.useRealTimers()
  })

  it('hands the page the scripted client for the request account and reads through it', async () => {
    const page = await mountLive()
    expect(clientAccounts()).toContain(ACCOUNT)
    expect(kit.describeRequest).toHaveBeenCalled()
    expect(kit.attemptState).toHaveBeenCalledTimes(1)
    expect(kit.isAuthorized).toHaveBeenCalledTimes(1)
    page.unmount()
  })

  it('judges the guardian key satisfied, another key or length not judged, and no signature rejected', async () => {
    const request = requestOf()
    const typedData = typedDataFor(request)
    const own = await signatureBy(GUARDIAN_ACCOUNT, typedData)
    const other = await signatureBy(STRANGER_ACCOUNT, typedData)
    await expect(kit.verify(request, request.place, own)).resolves.toBe('satisfied')
    await expect(kit.verify(request, request.place, other)).resolves.toBe('not-judged')
    await expect(kit.verify(request, request.place, `${own}00`)).resolves.toBe('not-judged')
    await expect(kit.verify(request, request.place, malformedSignature(own))).resolves.toBe(
      'rejected'
    )
    await expect(kit.verify(request, request.place, '0xabc')).resolves.toBe('rejected')
  })

  it("answers the smart account's check for its controlling key's envelope only, and the chain's verdict with it", async () => {
    holdSmartAccount()
    const request = smartRequestOf()
    const typedData = typedDataFor(request)
    const digest = hashOf(typedData)
    const own = await wrappedBy(CONTROLLER_ACCOUNT, typedData)
    const other = await wrappedBy(STRANGER_ACCOUNT, typedData)
    const magicOf = (to: string, signature: Hex) =>
      mockWallet.nodeCall({
        to,
        data: encodeFunctionData({
          abi: EIP1271_ABI,
          functionName: 'isValidSignature',
          args: [digest, signature]
        })
      })
    expect((await magicOf(SMART_ACCOUNT, own)).slice(0, 10)).toBe(EIP1271_MAGIC)
    expect((await magicOf(SMART_ACCOUNT, other)).slice(0, 10)).not.toBe(EIP1271_MAGIC)
    expect(await magicOf(GUARDIAN, own)).toBe('0x')
    await expect(kit.verifyReply(request, replyOf(request, own))).resolves.toBe('satisfied')
    await expect(kit.verifyReply(request, replyOf(request, other))).resolves.toBe('rejected')
    const guardianRequest = requestOf()
    const guardianSignature = await signatureBy(GUARDIAN_ACCOUNT, typedDataFor(guardianRequest))
    await expect(
      kit.verifyReply(guardianRequest, replyOf(guardianRequest, guardianSignature))
    ).resolves.toBe('satisfied')
  })
})

/** A guardian request that asks for an approval. */
export type ApproverApproval = Extract<ApproverRequest, { purpose: 'approval' }>

/** One field of a typed-data type: its name and its type. */
export type TypedField = { name: string; type: string }
