import type { ReactNode } from 'react'

import type {
  Address,
  ApproverRequest,
  Credential,
  Hex
} from '@web/modules/social-recovery/sdk-interfaces'
import type {
  CeremonyOutcome,
  CeremonyReport,
  EnrollValue,
  Platform,
  ReportStore,
  ReportSubscribe
} from '@web/modules/social-recovery/shared/ceremony'
import type {
  AddressBook,
  KeyHandle,
  RecoveryKitClient,
  SignOptions,
  TypedDataToSign
} from '@web/modules/social-recovery/shared/client'
import type { MethodChip } from '@web/modules/social-recovery/shared/display'
import type {
  ChainId,
  Enrollment,
  EnrollmentFacts,
  EnrollmentLastTest,
  EnrollmentTestVerdict,
  SetupRecords,
  SlotKind,
  WalletRecords
} from '@web/modules/social-recovery/shared/records'

import type { KEY_TEST_TYPES } from './testRequest'

/** Where the enrollment lands: a clause of the path and a member of that clause. */
export interface SlotPosition {
  clause: number
  member: number
}

/** The screen's search once read: the slot it fills, and the ceremony whose report is due. */
export interface EnrollSearch {
  kind: SlotKind
  at: SlotPosition
  ceremony?: string
}

/** The chip each stored test verdict reads as. */
export type TestChips = { readonly [V in EnrollmentTestVerdict]: MethodChip }

/**
 * What the named slot holds: empty and waiting for the kind, the credential
 * this screen placed there with its enrollment, or anything else.
 */
export type SlotState =
  | { status: 'empty' }
  | { status: 'enrolled'; enrollment: Enrollment }
  | { status: 'nothing' }

/** The view's read of the slot: loading, failed, or what the slot holds. */
export type LoadState = { status: 'loading' } | { status: 'failed' } | SlotState

/** The outcome of placing an enrollment in the slot. */
export type PlaceResult =
  | { status: 'placed'; enrollment: Enrollment }
  | { status: 'duplicate' }
  | { status: 'slot-taken' }

/** What a passed test adds to its enrollment: its challenge's salt and time, and the facts read again. */
export interface PassedTest {
  lastTest: EnrollmentLastTest
  facts?: EnrollmentFacts
}

/** What the test request is built from. */
export interface TestRequestInput {
  descriptor: Pick<RecoveryKitClient['descriptor'], 'manager' | 'action' | 'digestVersion'>
  chainId: ChainId
  account: Address
  method: Address
  config: Hex
  /** Milliseconds since epoch. */
  now: number
  randomBytes: (length: number) => Uint8Array
}

/** What a guardian key's test challenge is built from. */
export interface KeyTestInput {
  chainId: ChainId
  account: Address
  /** The address under test. */
  key: Address
  /** Milliseconds since epoch. */
  now: number
  randomBytes: (length: number) => Uint8Array
}

/** The key test's domain: a name, a version and the chain, and no verifying contract. */
export interface KeyTestDomain {
  name: string
  version: string
  chainId: bigint
}

export type KeyTestMessage = {
  account: Address
  key: Address
  salt: Hex
  validUntil: bigint
}

/** A guardian key's test challenge as EIP-712 typed data. */
export interface KeyTestTypedData {
  domain: KeyTestDomain
  types: typeof KEY_TEST_TYPES
  primaryType: 'KeyTest'
  message: KeyTestMessage
}

/** A value typed into the guardian field: empty, an address, or anything else read as a name. */
export type GuardianTarget =
  | { kind: 'empty' }
  | { kind: 'address'; address: Address; checksum: 'ok' | 'failed' }
  | { kind: 'name'; name: string }

/** The name check: resolving, resolved to an address, or not resolved. */
export type NameCheck =
  | { status: 'resolving' }
  | { status: 'resolved'; name: string; address: Address }
  | { status: 'unresolved' }

/** Every advisory check the guardian row shows; a check that has not run is absent. */
export interface GuardianChecks {
  checksum?: 'ok' | 'failed'
  name?: NameCheck
  code?: 'none' | 'contract'
  seed?: 'same' | 'not'
}

/** One line of the checks block: its key and its values. */
export interface CheckLine {
  key: string
  values?: Record<string, string>
}

/** A key the keystore holds, as the checks and the test read it. */
export interface HeldKey extends KeyHandle {
  /** The seed the key was derived from, where the wallet derived it from one. */
  fromSeedId?: string
}

/** The provider members the guardian's chain reads use. */
export interface GuardianProvider {
  send(method: 'eth_getCode', params: [Address, 'latest']): Promise<unknown>
  call(transaction: { to: Address; data: Hex }): Promise<string>
}

/** What the guardian row reads from the chain: the code at an address and one EIP-1271 read. */
export interface GuardianChain {
  readCode(address: Address): Promise<Hex>
  isValidSignature(address: Address, digest: Hex, signature: Hex): Promise<boolean>
}

/** The guardian test's answer, as a test outcome of the ceremony vocabulary. */
export type GuardianTestOutcome = CeremonyOutcome<{ signature: Hex }>

/** One file the offline block hands the holder. */
export interface ChallengeFile {
  name: string
  text: string
  type: string
}

/** The page's own helpers the view uses; a test passes fakes. */
export interface EnrollDeps {
  /** Whether this page serves passkeys. */
  passkeysServed: boolean
  platform: Platform
  reportStore: ReportStore
  reportSubscribe: ReportSubscribe
  newRequestId: () => string
  now: () => number
  randomBytes: (length: number) => Uint8Array
  /** Resolves a name to an address, the empty string where nothing resolves. */
  resolveName: (name: string) => Promise<string>
  /** The chain reads, null while the extension holds no provider for the recovery chain. */
  chain: GuardianChain | null
  keys: readonly HeldKey[]
  /** Signs typed data through the request queue with a key the wallet holds. */
  signTypedData: (key: KeyHandle, typedData: TypedDataToSign, options?: SignOptions) => Promise<Hex>
  /** Reads the clipboard, null where the page has no clipboard. */
  readClipboard: (() => Promise<string>) | null
  saveFile: (file: ChallengeFile) => void
}

/** The client as this screen reads it. */
export type EnrollClient =
  | { status: 'loading' }
  | { status: 'ready'; client: Pick<RecoveryKitClient, 'approving' | 'methodFor' | 'descriptor'> }
  | { status: 'update-the-wallet'; retry: () => void }
  | { status: 'failed'; retry: () => void }

export type Navigate = (to: string, options?: { replace?: boolean }) => void

export interface EnrollViewProps {
  records: WalletRecords
  chainId: ChainId
  account: Address
  navigate: Navigate
  /** The parsed search, null where it names no slot. */
  search: EnrollSearch | null
  client: EnrollClient
  deps: EnrollDeps
}

/** What both rows share: the slot's records, the address book and the screen's inputs. */
export interface RowProps {
  records: WalletRecords
  setup: SetupRecords
  chainId: ChainId
  account: Address
  navigate: Navigate
  search: EnrollSearch
  book: AddressBook
  client: EnrollClient
  deps: EnrollDeps
  /** The enrollment in the slot, or null while the slot is empty. */
  enrollment: Enrollment | null
  onEnrollment: (enrollment: Enrollment) => void
}

/**
 * What a returned passkey ceremony's request carried, read back when its
 * report arrives: the name and the route of a creation, and for a test the
 * request and the route, which the row forgets when it leaves the page for
 * the ceremony tab.
 */
export type PasskeyCeremonyRequest =
  | { call: 'enroll'; userName?: string; handOff?: boolean }
  | { call: 'testAccess'; request: ApproverRequest; handOff?: boolean }

/** The account, chain and passkey method a row's own ceremony requests name. */
export interface RowTarget {
  account: Address
  chainId: ChainId
  methodAddress: Address
}

/** What the passkey row keeps that the enrollment record does not. */
export interface PasskeyMemory {
  /** Whether the holder chose the phone hand-off to create the passkey. */
  handOff?: boolean
}

/** A passed creation whose enrollment the records have not stored yet. */
export interface PendingPlacement {
  value: EnrollValue
  userName: string
  handOff: boolean
  /** The credential the slot held when the ceremony started, which the placement replaces. */
  replaced?: Credential
}

/** The offline block's challenge: the key test's typed data. */
export interface GuardianChallenge {
  keyTest: KeyTestTypedData
}

export interface OfflineBlockProps {
  challenge: GuardianChallenge
  busy: boolean
  onCheck: (signature: Hex) => void
  saveFile: (file: ChallengeFile) => void
}

export interface ClientStateProps {
  client: EnrollClient
}

/** Which row a shared block renders in, the prefix of its test ids. */
export type RowSlug = 'passkey' | 'guardian'

export interface TestResultLinesProps {
  row: RowSlug
  /** The stored verdict's lasting line, null where it reads none. */
  lineKey: string | null
  /** The test outcome that just arrived, null where none did. */
  outcome: CeremonyOutcome<unknown> | null
  /** What renders between the lasting line and the outcome's notes. */
  children?: ReactNode
}

/** What the passkey row's report hook reads and calls. */
export interface PasskeyReportInput
  extends Pick<
    RowProps,
    'records' | 'navigate' | 'search' | 'account' | 'chainId' | 'book' | 'deps'
  > {
  /** Takes the stored request of a returned ceremony before its report is read. */
  onAsked: (asked: PasskeyCeremonyRequest) => void
  onReport: (report: CeremonyReport, asked: PasskeyCeremonyRequest) => void
}

/** The returned ceremony's report as the passkey row waits for it. */
export interface PasskeyReport {
  undelivered: boolean
  /** The request whose report never came back, null where none is waiting. */
  stale: PasskeyCeremonyRequest | null
  /** Drops the stale request, then runs the same ceremony again. */
  retryWith: (rerun: (stale: PasskeyCeremonyRequest) => Promise<void>) => Promise<void>
}

/** What the passkey row's ceremony launches read and set. */
export interface PasskeyLaunchInput
  extends Pick<
    RowProps,
    | 'records'
    | 'navigate'
    | 'search'
    | 'account'
    | 'chainId'
    | 'book'
    | 'client'
    | 'deps'
    | 'enrollment'
  > {
  /** The name field as the holder left it. */
  name: string
  defaultName: string
  /** Whether the holder chose the phone hand-off to create the passkey. */
  createdOnPhone: boolean
  setBusy: (busy: boolean) => void
  setWriteFailed: (failed: boolean) => void
}

/** The two ceremonies the passkey row opens in the ceremony tab. */
export interface PasskeyLaunch {
  create: (handOff: boolean, asName?: string) => Promise<void>
  runTest: () => Promise<void>
}

/** The passkey row's state and actions. */
export interface PasskeyRowState extends PasskeyLaunch {
  name: string
  setName: (name: string) => void
  explainer: boolean
  toggleExplainer: () => void
  enrollOutcome: CeremonyOutcome<unknown> | null
  testOutcome: CeremonyOutcome<unknown> | null
  signedSalt: Hex | null
  skipped: boolean
  skip: () => void
  undelivered: boolean
  stale: PasskeyCeremonyRequest | null
  pending: PendingPlacement | null
  writeFailed: boolean
  duplicate: boolean
  busy: boolean
  /** Whether the passkey is, or was meant to be, created on a phone. */
  phone: boolean
  canTest: boolean
  canRetryUndelivered: boolean
  place: (placing: PendingPlacement) => Promise<void>
  retryUndelivered: () => Promise<void>
}

export type PasskeyCreateBlockProps = Pick<
  PasskeyRowState,
  'name' | 'setName' | 'enrollOutcome' | 'busy' | 'phone' | 'create'
> & {
  served: boolean
}

export interface PasskeyEnrolledSummaryProps {
  enrollment: Enrollment
  platform: Platform
}

export type PasskeyTestBlockProps = Pick<
  PasskeyRowState,
  'testOutcome' | 'signedSalt' | 'skipped' | 'skip' | 'canTest' | 'busy' | 'runTest' | 'create'
> & {
  enrollment: Enrollment
  served: boolean
}

export type PasskeyRowNotesProps = Pick<
  PasskeyRowState,
  | 'undelivered'
  | 'stale'
  | 'canRetryUndelivered'
  | 'retryUndelivered'
  | 'duplicate'
  | 'writeFailed'
  | 'pending'
  | 'busy'
  | 'place'
>

/** What the guardian's advisory checks read. */
export interface GuardianChecksInput {
  /** The field's text. */
  value: string
  enrollment: Enrollment | null
  deps: EnrollDeps
}

/** The guardian's address as the field or the enrollment gives it, and its checks. */
export interface GuardianCheckState {
  nameCheck: NameCheck | undefined
  address: Address | undefined
  checkLines: CheckLine[]
}

/** The guardian row's state and actions. */
export interface GuardianRowState extends GuardianCheckState {
  value: string
  setValue: (value: string) => void
  resolvedName: string | undefined
  addOutcome: CeremonyOutcome<unknown> | null
  testOutcome: CeremonyOutcome<unknown> | null
  challenge: GuardianChallenge | null
  offline: boolean
  busy: boolean
  waiting: boolean
  writeFailed: boolean
  duplicate: boolean
  /** The key the wallet holds for the guardian's address, where it holds one. */
  heldKey: HeldKey | undefined
  add: () => Promise<void>
  check: (signed: GuardianChallenge, signature: Hex) => Promise<void>
  runTest: (offlineOnly: boolean) => Promise<void>
  withdraw: () => void
  paste: () => void
}

export type GuardianAddressFieldProps = Pick<
  GuardianRowState,
  'value' | 'setValue' | 'paste' | 'nameCheck' | 'address'
> & {
  canPaste: boolean
}

export interface GuardianEnrolledSummaryProps {
  enrollment: Enrollment
  address: Address
  resolvedName: string | undefined
}

export interface GuardianChecksBlockProps {
  lines: CheckLine[]
}

export type GuardianTestBlockProps = Pick<
  GuardianRowState,
  'testOutcome' | 'busy' | 'waiting' | 'runTest' | 'withdraw'
> & {
  enrollment: Enrollment
  canTestOffline: boolean
}
