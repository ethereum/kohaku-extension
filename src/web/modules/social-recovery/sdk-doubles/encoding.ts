/**
 * The doubles' byte arithmetic. The setup body, the commitment, the backup and
 * the public note are the doubles' own bytes, not the SDK's: the real formats
 * ABI-encode the setup body and seal the backup under a real cipher. The doubles
 * only need values that are deterministic, distinct and round-trip, so they hash
 * canonical JSON with keccak256. A screen never reads these bytes as anything
 * but opaque `Hex`.
 *
 * Two encodings are the real ones: a place's EIP-712 digest (`typedDataOf`,
 * `digestOf`) and the handover payload (the action codec double),
 * `abi.encode(address newAuthority, address removedAuthority)`.
 */
import {
  concat,
  hashTypedData,
  hexToString,
  keccak256,
  pad,
  size,
  stringToHex,
  zeroAddress
} from 'viem'

import type {
  Address,
  ApproverRequest,
  AttemptRequest,
  CancelRequest,
  Configuration,
  GatheringPurpose,
  Hex,
  PaymentOrder,
  PrivacyLevel,
  SerializedPaymentOrder
} from '@web/modules/social-recovery/sdk-interfaces'

import type {
  BackupReading,
  DigestMembers,
  DoubleSetupBody,
  PlacedCredential,
  PlaceTypedData,
  PublicNoteReading,
  PublicShape,
  SubmissionDomain
} from './types'

/** JSON with bigints written as `{"$bigint":"..."}` so they come back as bigints. */
export const toJson = (value: unknown): string =>
  JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? { $bigint: v.toString() } : v))

export const fromJson = <T>(text: string): T =>
  JSON.parse(text, (_key, v) =>
    v && typeof v === 'object' && typeof v.$bigint === 'string' && Object.keys(v).length === 1
      ? BigInt(v.$bigint)
      : v
  ) as T

export const jsonHex = (value: unknown): Hex => stringToHex(toJson(value))

export const hexJson = <T>(hex: Hex): T => fromJson<T>(hexToString(hex))

/** A deterministic 32-byte value for anything JSON can carry. */
export const hashOf = (value: unknown): Hex => keccak256(jsonHex(value))

/** A deterministic address for a label, for the doubles' default fixtures. */
export const addressOf = (label: string): Address =>
  `0x${keccak256(stringToHex(`address:${label}`)).slice(26)}` as Address

export const blockHashOf = (blockNumber: number): Hex => hashOf({ block: blockNumber })

/** An address as a 32-byte topic. */
export const topicOf = (address: Address): Hex => pad(address.toLowerCase() as Hex, { size: 32 })

export const sameAddress = (a: string | undefined, b: string | undefined): boolean =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase()

/** The list without repeats, compared case-insensitively, each kept where it first appears. */
export const distinctAddresses = (list: readonly Address[]): Address[] =>
  list.filter((a, i) => list.findIndex((b) => sameAddress(a, b)) === i)

/** The default salt, keccak256(account, place), in the doubles' hashing. */
export const defaultSalt = (account: Address, place: number): Hex =>
  hashOf({ salt: account.toLowerCase(), place })

export const credentialHash = (method: Address, config: Hex, salt: Hex): Hex =>
  hashOf({ credential: [method.toLowerCase(), config, salt] })

/** The flat place numbering: body order across every clause. */
export const placesOf = (account: Address, configuration: Configuration): PlacedCredential[] => {
  const placed: PlacedCredential[] = []
  configuration.clauses.forEach((clause, clauseIndex) => {
    clause.credentials.forEach((credential) => {
      const place = placed.length
      placed.push({
        place,
        clause: clauseIndex,
        credential,
        salt: credential.salt ?? defaultSalt(account, place)
      })
    })
  })
  return placed
}

export const setupBodyOf = (account: Address, configuration: Configuration): Hex => {
  const placed = placesOf(account, configuration)
  const body: DoubleSetupBody = {
    wait: configuration.wait,
    ignoresPause: configuration.ignoresPause,
    clauses: configuration.clauses.map((clause, index) => ({
      threshold: clause.threshold,
      credentials: placed
        .filter((p) => p.clause === index)
        .map((p) => credentialHash(p.credential.method, p.credential.config, p.salt))
    }))
  }
  return jsonHex(body)
}

export const readSetupBody = (body: Hex): DoubleSetupBody => hexJson<DoubleSetupBody>(body)

export const setupCommitmentOf = (
  account: Address,
  action: Address,
  nonce: bigint,
  body: Hex
): Hex => hashOf({ commitment: [account.toLowerCase(), action.toLowerCase(), nonce, body] })

/** A configuration without its labels, which the commitment and the backup never carry. */
export const withoutLabels = (configuration: Configuration): Configuration => ({
  wait: configuration.wait,
  ignoresPause: configuration.ignoresPause,
  clauses: configuration.clauses.map((clause) => ({
    threshold: clause.threshold,
    credentials: clause.credentials.map(({ method, config, salt }) =>
      salt ? { method, config, salt } : { method, config }
    )
  }))
})

// ---------------------------------------------------------------------------
// The backup payload and the public note, in the doubles' bytes.
// ---------------------------------------------------------------------------

const SEALED_MARK = 'kohaku-double:sealed:'
const CLEAR_MARK = 'kohaku-double:clear:'
const SHAPE_MARK = 'kohaku-double:shape:'

const passwordTag = (password: string): string => hashOf({ password }).slice(2, 18)

const xorWithPassword = (text: string, password: string): string => {
  const key = hashOf({ key: password }).slice(2)
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const k = parseInt(key.slice((i * 2) % key.length, ((i * 2) % key.length) + 2), 16)
    // A keyed XOR is the doubles' stand-in cipher; it keeps the values unreadable, nothing more.
    // eslint-disable-next-line no-bitwise
    out += (text.charCodeAt(i) ^ k).toString(16).padStart(4, '0')
  }
  return out
}

const unxorWithPassword = (hexText: string, password: string): string => {
  const key = hashOf({ key: password }).slice(2)
  let out = ''
  for (let i = 0; i * 4 < hexText.length; i++) {
    const k = parseInt(key.slice((i * 2) % key.length, ((i * 2) % key.length) + 2), 16)
    // eslint-disable-next-line no-bitwise
    out += String.fromCharCode(parseInt(hexText.slice(i * 4, i * 4 + 4), 16) ^ k)
  }
  return out
}

/** The encrypted backup: unreadable without the password, and it says which password. */
export const sealBackup = (configuration: Configuration, password: string): Hex =>
  stringToHex(
    `${SEALED_MARK}${passwordTag(password)}:${xorWithPassword(
      toJson(withoutLabels(configuration)),
      password
    )}`
  )

/** The clear backup: the configuration in the clear, the public level's private field. */
export const clearBackup = (configuration: Configuration): Hex =>
  stringToHex(`${CLEAR_MARK}${toJson(withoutLabels(configuration))}`)

/** The public note of the shape-visible level: thresholds and methods, no config values. */
export const shapeNote = (configuration: Configuration): Hex =>
  stringToHex(
    `${SHAPE_MARK}${toJson({
      wait: configuration.wait,
      ignoresPause: configuration.ignoresPause,
      clauses: configuration.clauses.map((c) => ({
        threshold: c.threshold,
        methods: c.credentials.map((cr) => cr.method)
      }))
    })}`
  )

/** The public note of the public level: everything in the clear. */
export const clearNote = (configuration: Configuration): Hex =>
  stringToHex(`${CLEAR_MARK}${toJson(withoutLabels(configuration))}`)

const safeText = (hex: Hex): string | undefined => {
  try {
    return hexToString(hex)
  } catch {
    return undefined
  }
}

/** Reads a private field: empty, clear, or encrypted (opened with the password when it fits). */
export const readBackup = (privateMetadata: Hex, password?: string): BackupReading => {
  if (!privateMetadata || privateMetadata === '0x') {
    return { form: 'empty' }
  }
  const text = safeText(privateMetadata)
  if (text === undefined) {
    return { form: 'unreadable' }
  }
  if (text.startsWith(CLEAR_MARK)) {
    return { form: 'clear', configuration: fromJson<Configuration>(text.slice(CLEAR_MARK.length)) }
  }
  if (text.startsWith(SEALED_MARK)) {
    const rest = text.slice(SEALED_MARK.length)
    const tag = rest.slice(0, 16)
    if (password === undefined || tag !== passwordTag(password)) {
      return { form: 'encrypted', opened: false }
    }
    try {
      const configuration = fromJson<Configuration>(unxorWithPassword(rest.slice(17), password))
      return { form: 'encrypted', opened: true, configuration }
    } catch {
      return { form: 'encrypted', opened: false }
    }
  }
  return { form: 'unreadable' }
}

/**
 * Which privacy level two metadata fields encode. One rule serves the draft and
 * the chain, so a draft reads as the level the chain reads after it lands: a
 * clear backup is the public level, a non-empty public note beside a sealed or
 * empty backup is shape-visible, and nothing public is private (the default).
 */
export const levelOfFields = (publicMetadata: Hex, backupIsClear: boolean): PrivacyLevel => {
  if (backupIsClear) {
    return 'public'
  }
  if (publicMetadata && publicMetadata !== '0x') {
    return 'shape-visible'
  }
  return 'private'
}

/** The level the chain's two metadata fields encode (see `levelOfFields`). */
export const levelOfMetadata = (publicMetadata: Hex, privateMetadata: Hex): PrivacyLevel =>
  levelOfFields(publicMetadata, readBackup(privateMetadata).form === 'clear')

/**
 * Reads a setup event's public note in the doubles' bytes: nothing public
 * (private), the shape alone (shape-visible), the whole configuration (public),
 * or bytes another writer put there. With `readBackup` it gives the client layer
 * what it needs to tell the four setup readings apart: none, sealed, shape
 * readable, fully readable.
 */
export const readPublicNote = (publicMetadata: Hex): PublicNoteReading => {
  if (!publicMetadata || publicMetadata === '0x') {
    return { kind: 'none' }
  }
  const text = safeText(publicMetadata)
  try {
    if (text?.startsWith(SHAPE_MARK)) {
      return { kind: 'shape', shape: fromJson<PublicShape>(text.slice(SHAPE_MARK.length)) }
    }
    if (text?.startsWith(CLEAR_MARK)) {
      return {
        kind: 'clear',
        configuration: fromJson<Configuration>(text.slice(CLEAR_MARK.length))
      }
    }
  } catch {
    return { kind: 'opaque', bytes: publicMetadata }
  }
  return { kind: 'opaque', bytes: publicMetadata }
}

/**
 * The backup's one padding size: 16 credentials times the widest shipped config
 * (the passkey's three words) plus a supplied salt and the method address, in
 * bytes.
 */
export const BACKUP_PADDING_SIZE = 16 * (96 + 32 + 20)

/**
 * The backup plaintext's size as the real serialization would count it: the wait
 * (6 bytes), the pause choice (1), a threshold byte per clause, and per
 * credential the method address, the config and any supplied salt.
 */
export const backupPlaintextSize = (configuration: Configuration): number =>
  6 +
  1 +
  configuration.clauses.reduce(
    (sum, clause) =>
      sum +
      1 +
      clause.credentials.reduce(
        (inner, c) => inner + 20 + size(c.config) + (c.salt ? size(c.salt) : 0),
        0
      ),
    0
  )

// ---------------------------------------------------------------------------
// Digests and proofs.
// ---------------------------------------------------------------------------

export const serializeOrder = (order: PaymentOrder): SerializedPaymentOrder => ({
  token: order.token,
  amount: order.amount.toString(),
  payee: order.payee
})

export const deserializeOrder = (order: SerializedPaymentOrder): PaymentOrder => ({
  token: order.token,
  amount: BigInt(order.amount),
  payee: order.payee
})

const lower = (address: Address): Address => address.toLowerCase() as Address

/**
 * The EIP-5267 `fields` bitmap of the manager's domain: name, version, chain id
 * and verifying contract, the four members the digests derive under.
 */
export const MANAGER_DOMAIN_FIELDS: Hex = '0x0f'

/** The EIP-712 types: two message types over one nested `PaymentOrder`. */
export const APPROVAL_TYPES = {
  Approval: [
    { name: 'account', type: 'address' },
    { name: 'action', type: 'address' },
    { name: 'attemptId', type: 'uint64' },
    { name: 'setupNonce', type: 'uint64' },
    { name: 'setupBodyHash', type: 'bytes32' },
    { name: 'payload', type: 'bytes' },
    { name: 'order', type: 'PaymentOrder' },
    { name: 'validUntil', type: 'uint48' },
    { name: 'place', type: 'uint256' }
  ],
  PaymentOrder: [
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'payee', type: 'address' }
  ]
} as const

export const CANCELLATION_TYPES = {
  Cancellation: [
    { name: 'account', type: 'address' },
    { name: 'action', type: 'address' },
    { name: 'attemptId', type: 'uint64' },
    { name: 'setupNonce', type: 'uint64' },
    { name: 'setupBodyHash', type: 'bytes32' },
    { name: 'validUntil', type: 'uint48' },
    { name: 'place', type: 'uint256' }
  ]
} as const

/**
 * The `Approval` or `Cancellation` typed data over one place's members. Its
 * message carries `bigint` values, which `JSON.stringify` refuses, so a JSON
 * export of it needs a serializer that writes each one as a decimal string, as
 * `eth_signTypedData_v4` accepts.
 */
export const typedDataOf = (m: DigestMembers): PlaceTypedData => {
  const domain = {
    name: 'PolicyManager' as const,
    version: m.digestVersion,
    chainId: Number(m.chainId),
    verifyingContract: lower(m.manager)
  }
  const common = {
    account: lower(m.account),
    action: lower(m.action),
    attemptId: BigInt(m.attemptId),
    setupNonce: BigInt(m.setupNonce),
    setupBodyHash: m.setupBodyHash
  }
  if (m.purpose === 'cancellation') {
    return {
      domain,
      types: CANCELLATION_TYPES,
      primaryType: 'Cancellation',
      message: { ...common, validUntil: BigInt(m.validUntil), place: BigInt(m.place) }
    }
  }
  const order = m.order ?? { token: zeroAddress, amount: '0', payee: zeroAddress }
  return {
    domain,
    types: APPROVAL_TYPES,
    primaryType: 'Approval',
    message: {
      ...common,
      payload: m.payload ?? '0x',
      order: { token: lower(order.token), amount: BigInt(order.amount), payee: lower(order.payee) },
      validUntil: BigInt(m.validUntil),
      place: BigInt(m.place)
    }
  }
}

/** The EIP-712 digest of one place, over the typed data above. */
export const digestOf = (m: DigestMembers): Hex =>
  hashTypedData(typedDataOf(m) as unknown as Parameters<typeof hashTypedData>[0])

/** The members one approver's request carries for its place. */
export const membersOfRequest = (request: ApproverRequest): DigestMembers => ({
  chainId: request.chainId,
  manager: request.manager,
  digestVersion: request.digestVersion,
  purpose: request.purpose,
  account: request.account,
  action: request.action,
  attemptId: request.attemptId,
  setupNonce: request.setupNonce,
  setupBodyHash: request.setupBodyHash,
  payload: request.payload,
  order: request.order,
  validUntil: request.validUntil,
  place: request.place
})

/** The digest one approver's request names for its place. */
export const digestOfRequest = (request: ApproverRequest): Hex =>
  digestOf(membersOfRequest(request))

/**
 * The digest of a submitted request at one place, what the manager's
 * `hashApproval` and `hashCancel` answer: it needs no proof at that place. The
 * caller names the purpose, since a cancel request value may carry extra
 * fields, a payload among them.
 */
export const digestOfSubmission = (
  request: AttemptRequest | CancelRequest,
  purpose: GatheringPurpose,
  domain: SubmissionDomain,
  place: bigint | number
): Hex => {
  const isApproval = purpose === 'approval'
  return digestOf({
    chainId: domain.chainId.toString(),
    manager: domain.manager,
    digestVersion: domain.digestVersion,
    purpose,
    account: request.account,
    action: request.action,
    attemptId: request.attemptId.toString(),
    setupNonce: request.setupNonce.toString(),
    setupBodyHash: keccak256(request.setupBody),
    payload: isApproval ? (request as AttemptRequest).payload : undefined,
    order: isApproval ? serializeOrder((request as AttemptRequest).order) : undefined,
    validUntil: request.validUntil.toString(),
    place: Number(place)
  })
}

/**
 * The proof a double method accepts for one credential over one digest. It
 * stands in for a signature, an assertion or a zero-knowledge proof: a test or a
 * ceremony host that wants a satisfying proof computes it here, and anything else
 * is a proof the credential's module would reject.
 */
export const doubleProof = (config: Hex, digest: Hex): Hex => keccak256(concat([config, digest]))

export { keccak256 }
