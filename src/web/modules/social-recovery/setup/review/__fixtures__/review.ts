import { encodeAbiParameters, getAddress, zeroAddress, zeroHash } from 'viem'

import type { Root } from 'react-dom/client'

import type {
  Address,
  Clause,
  Credential,
  Hex,
  ModuleInfo,
  ReadResult,
  SetupDescription,
  SetupDraft,
  SetupState,
  TrustedParties
} from '@web/modules/social-recovery/sdk-interfaces'
import { addressBookOf, deploymentDescriptor } from '@web/modules/social-recovery/shared/client'
import type {
  FitCheckReading,
  PrivilegeHoldersReading,
  RemovedKeyReading
} from '@web/modules/social-recovery/shared/client'
import type { Enrollment } from '@web/modules/social-recovery/shared/records'

import type {
  MethodReads,
  ProviderKind,
  TrustReads
} from '@web/modules/social-recovery/setup/review/types'

export const BOOK = addressBookOf('sepolia')
export const SHIPPED = deploymentDescriptor('sepolia').shippedMethods

export const CHAIN_ID = 11155111
export const ACCOUNT: Address = getAddress('0x2b0f5e98ee98adc9865745e98802f333f72f6ef5')

export const ADMIN: Address = getAddress('0xc5b1470ad32e96f8b7d04a19ce826f35d7a0b94e')
export const PENDING_ADMIN: Address = getAddress('0x3fb2c4e8a19d07f6e5c3d1b8a24f9e7c60d1a2a2')
export const PAUSE_HOLDER: Address = getAddress('0x9d3e5b7a1c2f4e6d8b0a9c7e5f3d1b2a4c6e8f0a')
export const PENDING_PAUSE_HOLDER: Address = getAddress(
  '0x4a6c8e0f2b4d6f8a0c2e4a6c8e0f2b4d6f8a0c2e'
)
export const REMOVED_KEY: Address = getAddress('0x5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e')
export const OTHER_KEY: Address = getAddress('0x6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f')
export const THIRD_KEY: Address = getAddress('0x7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a')
export const THIRD_PARTY_MODULE: Address = '0x7777777777777777777777777777777777777777'

/** A guardian's address, the one its config holds ABI-encoded in one word. */
export const guardianAddress = (byte: string): Address => `0x${byte.repeat(20)}`

const guardianConfig = (byte: string): Hex =>
  encodeAbiParameters([{ type: 'address' }], [guardianAddress(byte)])

const guardian = (byte: string, label: string): Credential => ({
  method: BOOK.methods.ecdsa,
  config: guardianConfig(byte),
  label
})

export const ALICE = guardian('a1', 'Alice')
export const BOB = guardian('b2', 'Bob')
export const CAROL = guardian('c3', 'Carol')
export const DAVE = guardian('d4', 'Dave')
export const PASSKEY: Credential = {
  method: BOOK.methods.passkey,
  config: '0x0102030405060708',
  label: 'MacBook passkey'
}
export const PHONE_PASSKEY: Credential = {
  method: BOOK.methods.passkey,
  config: '0x0807060504030201',
  label: 'Phone passkey'
}
export const PASSPORT: Credential = { method: BOOK.methods.zkpassport, config: '0xfeedface' }
export const SECOND_PASSPORT: Credential = { method: BOOK.methods.zkpassport, config: '0xfacefeed' }
export const AADHAAR: Credential = { method: BOOK.methods.aadhaar, config: '0xabcdef01' }
export const THIRD_PARTY: Credential = { method: THIRD_PARTY_MODULE, config: '0x0badc0de' }

export const required = (credential: Credential): Clause => ({
  threshold: 1,
  credentials: [credential]
})

export const group = (threshold: number, ...credentials: Credential[]): Clause => ({
  threshold,
  credentials
})

export const enrolled = (
  credential: Credential,
  test: Enrollment['test'] = 'passed',
  extra: Omit<Enrollment, 'credential' | 'test'> = {}
): Enrollment => ({ credential, test, ...extra })

export const declaration = (
  admin: Address = zeroAddress,
  pendingAdmin: Address = zeroAddress
): ReadResult<TrustedParties> => ({
  answered: true,
  value: {
    admin,
    pendingAdmin,
    trustedKeys: [],
    pauseHolder: zeroAddress,
    pendingPauseHolder: zeroAddress
  }
})

/** A declaration that also names the party that can stop the method and the one one acceptance away from that role. */
export const stopDeclaration = ({
  admin = zeroAddress,
  pauseHolder = zeroAddress,
  pendingPauseHolder = zeroAddress
}: {
  admin?: Address
  pauseHolder?: Address
  pendingPauseHolder?: Address
}): ReadResult<TrustedParties> => ({
  answered: true,
  value: { admin, pendingAdmin: zeroAddress, trustedKeys: [], pauseHolder, pendingPauseHolder }
})

export const info = (supportsInterface = true): ReadResult<ModuleInfo> => ({
  answered: true,
  value: { name: 'method', version: '1.0.0', supportsInterface }
})

export const UNANSWERED = { answered: false } as const

export const NOT_PAUSED: ReadResult<boolean> = { answered: true, value: false }
export const PAUSED: ReadResult<boolean> = { answered: true, value: true }

/** Every read of a method answered: the declaration given, a module that answers to the method interface, and not stopped. */
export const answered = (
  trustedParties: ReadResult<TrustedParties> = declaration(),
  moduleInfo: ReadResult<ModuleInfo> = info(),
  paused: ReadResult<boolean> = NOT_PAUSED
): MethodReads => ({ trustedParties, moduleInfo, paused })

/** The setup read of the account, with or without a setup already committed. */
export const setupStateOf = (hasSetup = false): SetupState => ({
  isAuthorized: hasSetup,
  hasSetup,
  setupCommitment: zeroHash,
  setupNonce: 0n,
  setupCommittedAtBlock: 0,
  attemptActive: false,
  block: { number: 1, timestamp: 1, hash: zeroHash }
})

/** A setup description naming the candidate keys and the key a recovery removes. */
export const descriptionOf = (
  candidateKeys: SetupDescription['candidateKeys'] = [{ address: REMOVED_KEY, isAuthority: true }],
  removedKey: SetupDescription['removedKey'] = REMOVED_KEY
): SetupDescription => ({
  rule: null,
  wait: { seconds: 172800n, defaultSeconds: 172800n },
  failureDomains: null,
  parties: null,
  methodStanding: null,
  passkeyDomains: null,
  candidateKeys,
  removedKey,
  privacy: null,
  backup: null,
  reveals: null,
  cancel: null,
  upgrade: null,
  pause: null
})

/** The reads keyed as the trust list holds them, by the method's lowercased address. */
export const readsOf = (entries: [Address, MethodReads][]): TrustReads =>
  Object.fromEntries(entries.map(([method, reads]) => [method.toLowerCase(), reads]))

export type { Root }

/** One module read answered per module. */
export type Answer<T> = (module: Address) => Promise<ReadResult<T>>

/** What the review is mounted over: the stored setup and how the client and its reads answer. */
export interface MountOptions {
  clauses?: Clause[]
  enrollments?: Enrollment[]
  wait?: bigint
  backup?: SetupDraft['privacy']['backup']
  publicMetadata?: SetupDraft['privacy']['publicMetadata']
  passwordSet?: boolean
  client?: 'loading' | 'failed' | 'update-the-wallet'
  trustedParties?: Answer<TrustedParties>
  moduleInfo?: Answer<ModuleInfo>
  paused?: Answer<boolean>
  removedKey?: () => Promise<RemovedKeyReading>
  fitCheck?: () => Promise<FitCheckReading>
  setupState?: () => Promise<SetupState>
  describeSetup?: () => Promise<SetupDescription>
  privilegeHolders?: () => Promise<PrivilegeHoldersReading>
  providerKind?: ProviderKind
  accountLabel?: string
  storageRefuses?: boolean
}
