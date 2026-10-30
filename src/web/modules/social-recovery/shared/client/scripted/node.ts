/**
 * The fake node: the SDK's `IProvider` over an in-memory world of one
 * deployment and one account, for the build with no deployment and for the
 * unit tests. The real SDK reads it as it reads a chain.
 *
 * The world is seeded through typed members and never through raw bytes:
 * each member encodes what the contracts would hold with the SDK's own
 * formats (the setup body, the commitment, the sealed or clear backup, the
 * handover payload) and appends the log the contract would emit, built with
 * the SDK's event ABI, in a freshly mined block. `land` applies a prepared
 * call or batch the way the contracts would.
 *
 * `call` decodes the calldata with the SDK's ABIs and answers the manager's
 * views, the action's views and immutables, each method module's views and
 * the account's `privileges`; a write answers empty, so a simulation passes,
 * and a start, an owner's clear or an owner's cancel the manager would refuse
 * reverts as it would.
 * A read `failRead` names fails as a transport failure or reverts with the
 * bytes given, until `restoreRead`. The latest block follows the node's
 * clock, so a window measured from it stays current. A deployment that
 * disagrees with the build is seeded the same way: the chain id, the
 * manager's domain and the action's immutables answer what `setChainId`,
 * `setDomain` and `setConstants` name, and `setContractCode` removes a
 * contract.
 */
import {
  ACCOUNT_EVENTS_ABI,
  AmbireActionCodec,
  approvalDigest,
  ATTEMPT_STATES,
  BACKUP_PADDING_SIZE,
  BACKUP_PAYLOAD_VERSION,
  BUILDER_DOMAIN_FIELDS,
  cancellationDigest,
  configurationBody,
  decodeSetupBody,
  encodeSetupBody,
  ERRORS_MANAGER_ABI,
  FORMATS_CANCEL_BY_PROOFS_ABI,
  FORMATS_CREATION_RUNTIME_HEAD,
  FORMATS_CREATION_RUNTIME_TAIL,
  FORMATS_DIGEST_DOMAIN_NAME,
  FORMATS_START_ATTEMPT_ABI,
  kitBinding,
  kitSlot,
  MANAGER_EVENTS_ABI,
  METHOD_AADHAAR_DISCLOSURE_INPUTS,
  METHOD_AADHAAR_MIN_FRESHNESS_WINDOW,
  METHOD_AADHAAR_PUBLIC_INPUTS,
  METHOD_AADHAAR_SIGNAL_HASH_SHIFT,
  METHOD_ECDSA_CONFIG_ABI,
  METHOD_ZKPASSPORT_NON_SALTED_NULLIFIER,
  METHOD_ZKPASSPORT_NULLIFIER_TYPE_FROM_END,
  METHOD_ZKPASSPORT_SCOPED_NULLIFIER_FROM_END,
  passkeyMethod,
  POLICY_ACTION_INTERFACE_ID,
  POLICY_MANAGER_EIP712_DOMAIN_ABI,
  POLICY_MANAGER_HASH_APPROVAL_ABI,
  POLICY_MANAGER_HASH_CANCEL_ABI,
  POLICY_MANAGER_NAME_ABI,
  POLICY_MANAGER_PAUSED_ABI,
  POLICY_MANAGER_STATE_OF_ABI,
  POLICY_MANAGER_SUPPORTS_INTERFACE_ABI,
  POLICY_MANAGER_TRUSTED_PARTIES_ABI,
  POLICY_MANAGER_VERSION_ABI,
  POLICY_MANAGER_WRITES_ABI,
  POLICY_METHOD_INTERFACE_ID,
  POLICY_METHOD_VERIFY_ABI,
  RECOVERY_ACTION_SET_ADDR_PRIVILEGE_ABI,
  RECOVERY_ACTION_VIEWS_ABI,
  RECOVERY_CLIENT_CONSUME_ABI,
  RECOVERY_CLIENT_EXECUTE_HANDOVER_ABI,
  sealBackup,
  serializeConfiguration,
  setupCommitment,
  VERDICT_MAGIC_VALUE
} from '@kohaku-eth/social-recovery'
import type {
  Address,
  BlockHeader,
  BlockRange,
  BlockTag,
  Configuration,
  DeploymentDescriptor,
  DraftPrivacy,
  FilterSpec,
  FilterTopic,
  Hex,
  IProvider,
  PreparedBatch,
  PreparedCall,
  RawLog,
  RawTransaction,
  Verdict
} from '@kohaku-eth/social-recovery'
import { anonAadhaarMethod, zkPassportMethod } from '@kohaku-eth/social-recovery/recovery-methods'
import {
  bytesToHex,
  concat,
  decodeAbiParameters,
  decodeFunctionData,
  encodeAbiParameters,
  encodeErrorResult,
  encodeEventTopics,
  encodeFunctionResult,
  isAddressEqual,
  keccak256,
  numberToHex,
  pad,
  recoverAddress,
  zeroAddress,
  zeroHash
} from 'viem'

import { ACCOUNT_PRIVILEGES_ABI, ACTION_IMMUTABLES_ABI } from '../abi'
import { providerReadFailure, revertedCall } from '../provider-adapter'
import { createScriptedAadhaarStack } from './aadhaar-stack'
import type {
  ScriptedAttemptOptions,
  ScriptedBlock,
  ScriptedConstants,
  ScriptedDomain,
  ScriptedFailure,
  ScriptedManagerState,
  ScriptedMethod,
  ScriptedNodeSeed,
  ScriptedOpening,
  ScriptedVerdict
} from './types'
import { createScriptedZkPassportStack } from './zkpassport-stack'

const BLOCK_TIME = 12
const DAY = 24 * 3600

const KEY_VALUE: Hex = pad('0x01', { size: 32 })
const MANAGER_INTERFACE_ID: Hex = '0x675e6a4a'
const PROVIDER_READ_NAMES = ['chainId', 'call', 'logs', 'block', 'code', 'transaction'] as const
// Any non-empty code: the node answers the views itself.
const CONTRACT_CODE: Hex = '0x6080604052'

/** Where the Aadhaar proof's nullifier, timestamp, disclosures, seed and signal hash sit among its public inputs. */
const AADHAAR_NULLIFIER_INPUT = METHOD_AADHAAR_PUBLIC_INPUTS.indexOf('nullifier')
const AADHAAR_TIMESTAMP_INPUT = METHOD_AADHAAR_PUBLIC_INPUTS.indexOf('timestamp')
const AADHAAR_DISCLOSURE_INPUTS = METHOD_AADHAAR_DISCLOSURE_INPUTS.map((name) =>
  METHOD_AADHAAR_PUBLIC_INPUTS.indexOf(name)
)
const AADHAAR_SEED_INPUT = METHOD_AADHAAR_PUBLIC_INPUTS.indexOf('nullifierSeed')
const AADHAAR_SIGNAL_HASH_INPUT = METHOD_AADHAAR_PUBLIC_INPUTS.indexOf('signalHash')

const isFieldRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** A list's word `fromEnd` places from its end as a number, or undefined. */
const wordFromEnd = (list: readonly unknown[], fromEnd: number): bigint | undefined => {
  const value = list[list.length - fromEnd]
  return typeof value === 'string' || typeof value === 'bigint' ? BigInt(value) : undefined
}

const NO_ATTEMPT = {
  attemptId: 0n,
  setupNonce: 0n,
  consumableAfter: 0,
  state: 'None',
  payloadHash: zeroHash,
  order: { token: zeroAddress, amount: 0n, payee: zeroAddress },
  usedMethods: [],
  ignoresPause: false
} as const

const VIEWS_ABI = [
  ...POLICY_MANAGER_STATE_OF_ABI,
  ...POLICY_MANAGER_HASH_APPROVAL_ABI,
  ...POLICY_MANAGER_HASH_CANCEL_ABI,
  ...POLICY_MANAGER_EIP712_DOMAIN_ABI,
  ...POLICY_MANAGER_NAME_ABI,
  ...POLICY_MANAGER_VERSION_ABI,
  ...POLICY_MANAGER_SUPPORTS_INTERFACE_ABI,
  ...POLICY_MANAGER_TRUSTED_PARTIES_ABI,
  ...POLICY_MANAGER_PAUSED_ABI,
  ...POLICY_METHOD_VERIFY_ABI,
  ...RECOVERY_ACTION_VIEWS_ABI.filter(
    (item) => !['name', 'version', 'supportsInterface'].includes(item.name)
  ),
  ...ACTION_IMMUTABLES_ABI,
  ...ACCOUNT_PRIVILEGES_ABI
] as const

const WRITES_ABI = [
  ...POLICY_MANAGER_WRITES_ABI,
  ...FORMATS_START_ATTEMPT_ABI,
  ...FORMATS_CANCEL_BY_PROOFS_ABI,
  ...RECOVERY_CLIENT_CONSUME_ABI,
  ...RECOVERY_CLIENT_EXECUTE_HANDOVER_ABI,
  ...RECOVERY_ACTION_SET_ADDR_PRIVILEGE_ABI
] as const

const lower = (address: Address): string => address.toLowerCase()

const topicMatches = (wanted: FilterTopic, actual: Hex | undefined): boolean => {
  if (wanted === null) {
    return true
  }
  if (actual === undefined) {
    return false
  }
  const options = typeof wanted === 'string' ? [wanted] : wanted
  return options.some((option) => option.toLowerCase() === actual.toLowerCase())
}

/** The fake node of one deployment and one account. */
export class ScriptedNode implements IProvider {
  readonly descriptor: DeploymentDescriptor

  readonly account: Address

  readonly manager: ScriptedManagerState = {
    setupCommitment: zeroHash,
    setupNonce: 0n,
    nextAttemptId: 1n,
    setupCommittedAtBlock: 0,
    attempt: NO_ATTEMPT,
    setupBody: '0x'
  }

  /** The account's privilege table, by lowercase address. */
  readonly privileges = new Map<string, Hex>()

  /** The method modules' declarations, by lowercase address. */
  readonly methods = new Map<string, ScriptedMethod>()

  supportsAccount: boolean

  private readonly clock: () => number

  private readonly blocks: ScriptedBlock[] = []

  private readonly logList: RawLog[] = []

  private readonly transactions = new Map<string, RawTransaction>()

  private readonly codes = new Map<string, Hex>()

  private readonly failures = new Map<string, ScriptedFailure>()

  private readonly verdicts = new Map<string, ScriptedVerdict>()

  private domain: Partial<ScriptedDomain> = {}

  private constants: Partial<ScriptedConstants> = {}

  private chainIdAnswer: number | undefined

  /** The descriptor's contracts seeded as absent, by lowercase address. */
  private readonly absent = new Set<string>()

  private readonly passkeyCodec = passkeyMethod().codec

  private readonly zkPassportCodec = zkPassportMethod({ stack: createScriptedZkPassportStack() })
    .codec

  private readonly aadhaarCodec = anonAadhaarMethod({ stack: createScriptedAadhaarStack() }).codec

  private readonly codec: AmbireActionCodec

  constructor(seed: ScriptedNodeSeed) {
    this.descriptor = seed.descriptor
    this.account = seed.account
    this.clock = seed.clock ?? (() => Math.floor(Date.now() / 1000))
    this.supportsAccount = seed.supportsAccount ?? true
    this.codec = new AmbireActionCodec([seed.descriptor.action])
    this.mineAt(seed.firstBlock ?? 1000, this.clock())
    const d = seed.descriptor
    // A method the descriptor omits is the zero address, where no contract lives.
    const deployed = (address: Address) => !isAddressEqual(address, zeroAddress)
    ;[d.manager, d.action, d.methodEcdsa, d.methodPasskey, d.methodAadhaar, d.methodZkpassport]
      .filter(deployed)
      .forEach((address) => this.codes.set(lower(address), CONTRACT_CODE))
    this.setHasCode(seed.hasCode ?? true)
    ;(seed.authorities ?? []).forEach((key) => this.privileges.set(lower(key), KEY_VALUE))
    const parties = {
      admin: zeroAddress,
      pendingAdmin: zeroAddress,
      trustedKeys: [],
      pauseHolder: zeroAddress,
      pendingPauseHolder: zeroAddress
    }
    ;(
      [
        [d.methodEcdsa, 'method-ecdsa'],
        [d.methodPasskey, 'method-passkey'],
        [d.methodAadhaar, 'method-aadhaar'],
        [d.methodZkpassport, 'method-zkpassport']
      ] as const
    )
      .filter(([address]) => deployed(address))
      .forEach(([address, name]) =>
        this.methods.set(lower(address), { name, version: '1', paused: false, parties })
      )
  }

  // -------------------------------------------------------------------------
  // Blocks
  // -------------------------------------------------------------------------

  /** The latest block mined. */
  get head(): BlockHeader {
    return this.blocks[this.blocks.length - 1].header
  }

  private mineAt(number: number, timestamp: number): ScriptedBlock {
    const block = {
      header: { number, timestamp, hash: keccak256(numberToHex(number, { size: 32 })) },
      transactions: []
    }
    this.blocks.push(block)
    return block
  }

  /** Mines one block `seconds` after the latest and returns it. */
  mine(seconds = BLOCK_TIME): BlockHeader {
    return this.mineAt(this.head.number + 1, this.head.timestamp + Math.max(0, seconds)).header
  }

  /** The block a tag names; a named tag is the latest block, mined up to the clock first. */
  blockAt(tag: BlockTag): BlockHeader {
    if (typeof tag !== 'number') {
      const now = this.clock()
      if (now > this.head.timestamp) {
        this.mineAt(this.head.number + 1, now)
      }
      return this.head
    }
    const found = this.blocks.find((block) => block.header.number === tag)
    if (found) {
      return found.header
    }
    if (tag > this.head.number) {
      throw providerReadFailure('block', new Error(`the node has no block at ${tag}`))
    }
    // A block before the first one the node mined: the first one's time.
    const [first] = this.blocks
    return {
      number: tag,
      timestamp: first.header.timestamp,
      hash: keccak256(numberToHex(tag, { size: 32 }))
    }
  }

  // -------------------------------------------------------------------------
  // The world
  // -------------------------------------------------------------------------

  /** Whether the account holds the proxy over the served implementation. */
  setHasCode(hasCode: boolean): void {
    if (hasCode) {
      this.codes.set(
        lower(this.account),
        concat([
          FORMATS_CREATION_RUNTIME_HEAD,
          '0x73',
          this.descriptor.servedImplementation,
          FORMATS_CREATION_RUNTIME_TAIL
        ])
      )
    } else {
      this.codes.delete(lower(this.account))
    }
  }

  /** Grants or revokes the action's kit slot on the account, with no log. */
  setAuthorized(authorized: boolean): void {
    const slot = lower(kitSlot(this.descriptor.action))
    if (authorized) {
      this.privileges.set(slot, kitBinding(this.descriptor.action))
    } else {
      this.privileges.delete(slot)
    }
  }

  get authorized(): boolean {
    return (
      this.privileges.get(lower(kitSlot(this.descriptor.action)))?.toLowerCase() ===
      kitBinding(this.descriptor.action).toLowerCase()
    )
  }

  /** Makes the keys hold the key privilege on the account, with no log. */
  setAuthorities(keys: readonly Address[]): void {
    keys.forEach((key) => this.privileges.set(lower(key), KEY_VALUE))
  }

  /**
   * Writes one privilege on the account as the account's own transaction
   * would, the key privilege by default, in one mined block with its
   * `LogPrivilegeChanged`; a zero value revokes it.
   */
  setPrivilege(key: Address, value: Hex = KEY_VALUE): void {
    const block = this.mine()
    const hash = this.recordTransaction(block, this.account, '0x')
    this.writePrivilege(key, value, block, hash)
  }

  /**
   * Commits a setup as a holder's commit would: the body and the commitment
   * at the next nonce, the backup the privacy's choice names (sealed under the
   * password, the configuration's serialization, or none) and the public
   * metadata as given, in one mined block with its `SetupCommitted`.
   */
  async commitSetup(
    configuration: Configuration,
    privacy: DraftPrivacy,
    password?: string
  ): Promise<{ nonce: bigint; setupCommitment: Hex }> {
    const nonce = this.manager.setupNonce + 1n
    const body = encodeSetupBody(configurationBody(configuration, this.account))
    const commitment = setupCommitment(this.account, this.descriptor.action, nonce, body)
    const privateMetadata = await this.backupOf(configuration, privacy, password, commitment, nonce)
    this.applyCommit(nonce, commitment, body, privacy.publicMetadata, privateMetadata, this.account)
    return { nonce, setupCommitment: commitment }
  }

  /** Clears the standing setup, in one mined block with its `SetupCleared`. */
  clearSetup(): void {
    this.applyClear(this.account)
  }

  /** Opens an attempt over the standing setup, in one mined block with its `AttemptStarted`. */
  openAttempt(options: ScriptedAttemptOptions = {}): void {
    const handover = options.handover ?? {
      newAuthority: '0x00000000000000000000000000000000000000a1',
      removedAuthority: '0x00000000000000000000000000000000000000a2'
    }
    const block = this.mine()
    this.applyStart(
      {
        attemptId: this.manager.nextAttemptId,
        setupNonce: this.manager.setupNonce,
        setupBody: this.manager.setupBody,
        payload: this.codec.encode(handover),
        order: options.order ?? { token: zeroAddress, amount: 0n, payee: zeroAddress }
      },
      {
        consumableAfter: block.timestamp + (options.wait ?? DAY),
        ignoresPause: options.ignoresPause ?? false,
        usedMethods: options.usedMethods ?? [],
        usedPlaces: options.usedPlaces ?? []
      },
      block,
      zeroAddress
    )
  }

  /** Cancels the waiting attempt as the canceller would, in one mined block with its `AttemptCancelled`. */
  cancelAttempt(canceller: Address = this.account): void {
    this.applyCancel(canceller, zeroAddress, this.mine(), canceller)
  }

  /** Consumes the waiting attempt and hands the account over, in one mined block. */
  consume(): void {
    const block = this.mine()
    this.applyConsume(block, zeroAddress)
  }

  /**
   * Applies a prepared call or batch the way the contracts would, all in one
   * mined block; a refused call throws the revert and nothing lands. Every
   * call of a batch is checked against the state before the batch.
   */
  land(prepared: PreparedCall | PreparedBatch): Hex {
    const calls = prepared.kind === 'call' ? [prepared] : prepared.calls
    calls.forEach((call) => {
      const refusal = this.refusalOf(call.data)
      if (refusal) {
        throw refusal
      }
    })
    const block = this.mine()
    const from =
      prepared.kind === 'call' && prepared.sender === 'anyone' ? zeroAddress : this.account
    const hash = this.recordTransaction(block, from, calls[0]?.data ?? '0x')
    calls.forEach((call) => this.applyCall(call, block, from, hash))
    return hash
  }

  /** Makes the manager's `eip712Domain` answer these members over the descriptor's. */
  setDomain(domain: Partial<ScriptedDomain>): void {
    this.domain = { ...this.domain, ...domain }
  }

  /** Makes the action's immutables answer these values over the descriptor's and this build's derivations. */
  setConstants(constants: Partial<ScriptedConstants>): void {
    this.constants = { ...this.constants, ...constants }
  }

  /** Makes the provider answer this chain id over the descriptor's. */
  setChainId(chainId: number): void {
    this.chainIdAnswer = chainId
  }

  /**
   * Deploys or removes one of the descriptor's contracts: an absent one holds
   * no code and answers every call with no bytes, as a node answers a call to
   * an address with no contract.
   */
  setContractCode(address: Address, hasCode: boolean): void {
    if (hasCode) {
      this.absent.delete(lower(address))
      this.codes.set(lower(address), CONTRACT_CODE)
    } else {
      this.absent.add(lower(address))
      this.codes.delete(lower(address))
    }
  }

  /**
   * Seeds the verdict of the passkey or an identity module over every proof for
   * one credential's config.
   */
  setVerdict(config: Hex, verdict: ScriptedVerdict): void {
    this.verdicts.set(config.toLowerCase(), verdict)
  }

  /** Makes a read fail until `restoreRead`: one of the six provider reads, or one view by its function name. */
  failRead(read: string, failure: ScriptedFailure = { kind: 'unavailable' }): this {
    this.failures.set(read, failure)
    return this
  }

  /** Lets a failed read answer again, or every read where none is named. */
  restoreRead(read?: string): this {
    if (read === undefined) {
      this.failures.clear()
    } else {
      this.failures.delete(read)
    }
    return this
  }

  /** Every log the node holds, in log order. */
  get emitted(): readonly RawLog[] {
    return this.logList
  }

  // -------------------------------------------------------------------------
  // IProvider
  // -------------------------------------------------------------------------

  async chainId(): Promise<number> {
    this.guard('chainId')
    return this.chainIdAnswer ?? this.descriptor.chainId
  }

  async call(to: Address, data: Hex, _from: Address, block: BlockTag): Promise<Hex> {
    this.guard('call')
    this.blockAt(block)
    if (this.absent.has(lower(to))) {
      return '0x'
    }
    const write = this.decodeWrite(data)
    if (write) {
      const refusal = this.refusalOf(data)
      if (refusal) {
        throw refusal
      }
      return '0x'
    }
    const decoded = this.decodeView(data)
    if (!decoded) {
      throw revertedCall('call', '0x')
    }
    this.guard(decoded.functionName)
    if (decoded.functionName === 'verify') {
      const [config, digest, proof] = decoded.args
      return (await this.verdictOf(to, config, digest, proof)) === 'satisfied'
        ? VERDICT_MAGIC_VALUE
        : zeroHash
    }
    return this.answer(to, decoded)
  }

  async logs(filterSpec: FilterSpec, range: BlockRange): Promise<readonly RawLog[]> {
    this.guard('logs')
    return this.logList.filter(
      (log) =>
        log.blockNumber >= range.from &&
        log.blockNumber <= range.to &&
        filterSpec.address.some((address) => isAddressEqual(address, log.address)) &&
        filterSpec.topics.every((topic, index) => topicMatches(topic, log.topics[index]))
    )
  }

  async block(tag: BlockTag): Promise<BlockHeader> {
    this.guard('block')
    return this.blockAt(tag)
  }

  async code(address: Address, block: BlockTag): Promise<Hex> {
    this.guard('code')
    this.blockAt(block)
    return this.codes.get(lower(address)) ?? '0x'
  }

  async transaction(hash: Hex): Promise<RawTransaction | undefined> {
    this.guard('transaction')
    return this.transactions.get(hash.toLowerCase())
  }

  // -------------------------------------------------------------------------
  // Inside
  // -------------------------------------------------------------------------

  private guard(read: string): void {
    const failure = this.failures.get(read)
    if (!failure) {
      return
    }
    if (failure.kind === 'revert') {
      throw revertedCall('call', failure.data)
    }
    // A view named by its function fails as the call it is made through.
    const providerRead = PROVIDER_READ_NAMES.find((name) => name === read) ?? 'call'
    throw providerReadFailure(providerRead, new Error(`the node does not answer ${read}`))
  }

  /**
   * A method module's verdict over one proof: the ECDSA module's is the signer
   * the digest and the 65-byte proof recover against the config's address. The
   * passkey and the identity modules answer the verdict `setVerdict` seeded for
   * the config where one was; otherwise a passkey proof the passkey codec
   * decodes satisfies, since the node runs no WebAuthn; a zkPassport proof
   * satisfies where it decodes, its nullifier type is the non-salted one and
   * its scoped nullifier is the config's identifier; an Aadhaar proof
   * satisfies where it decodes, the config's window is at least an hour, the
   * proof carries the config's nullifier and seed, discloses nothing, carries
   * the digest's signal hash and was signed within the window of the latest
   * block's time. The node checks no proof's cryptography. Any other module,
   * and the zero address a deployment gives a method it omits, rejects.
   */
  private async verdictOf(module: Address, config: Hex, digest: Hex, proof: Hex): Promise<Verdict> {
    const d = this.descriptor
    if (isAddressEqual(module, d.methodEcdsa)) {
      try {
        const [signer] = decodeAbiParameters(METHOD_ECDSA_CONFIG_ABI, config)
        const recovered = await recoverAddress({ hash: digest, signature: proof })
        return isAddressEqual(recovered, signer) ? 'satisfied' : 'rejected'
      } catch {
        return 'rejected'
      }
    }
    const judged = [d.methodPasskey, d.methodZkpassport, d.methodAadhaar].some(
      (address) => !isAddressEqual(address, zeroAddress) && isAddressEqual(module, address)
    )
    if (!judged) {
      return 'rejected'
    }
    const seeded = this.verdicts.get(config.toLowerCase())
    if (seeded) {
      return seeded
    }
    try {
      if (isAddressEqual(module, d.methodPasskey)) {
        this.passkeyCodec.decodeProof(proof)
        return 'satisfied'
      }
      if (isAddressEqual(module, d.methodZkpassport)) {
        return this.zkPassportVerdict(config, proof)
      }
      return this.aadhaarVerdict(config, digest, proof)
    } catch {
      return 'rejected'
    }
  }

  private zkPassportVerdict(config: Hex, proof: Hex): Verdict {
    const { uniqueIdentifier } = this.zkPassportCodec.decodeConfig(config)
    const { proofVerificationData } = this.zkPassportCodec.decodeProof(proof)
    const inputs = isFieldRecord(proofVerificationData)
      ? proofVerificationData.publicInputs
      : undefined
    if (typeof uniqueIdentifier !== 'string' || !Array.isArray(inputs)) {
      return 'rejected'
    }
    const identifier = BigInt(uniqueIdentifier)
    return identifier !== 0n &&
      wordFromEnd(inputs, METHOD_ZKPASSPORT_NULLIFIER_TYPE_FROM_END) ===
        METHOD_ZKPASSPORT_NON_SALTED_NULLIFIER &&
      wordFromEnd(inputs, METHOD_ZKPASSPORT_SCOPED_NULLIFIER_FROM_END) === identifier
      ? 'satisfied'
      : 'rejected'
  }

  private aadhaarVerdict(config: Hex, digest: Hex, proof: Hex): Verdict {
    const { nullifier, nullifierSeed, freshnessWindow } = this.aadhaarCodec.decodeConfig(config)
    const { inputs } = this.aadhaarCodec.decodeProof(proof)
    if (!Array.isArray(inputs) || typeof freshnessWindow !== 'bigint') {
      return 'rejected'
    }
    const signedAt = inputs[AADHAAR_TIMESTAMP_INPUT]
    const now = BigInt(this.head.timestamp)
    const fresh =
      typeof signedAt === 'bigint' && !(signedAt < now && now - signedAt > freshnessWindow)
    // eslint-disable-next-line no-bitwise
    const signalHash = BigInt(keccak256(digest)) >> METHOD_AADHAAR_SIGNAL_HASH_SHIFT
    return freshnessWindow >= METHOD_AADHAAR_MIN_FRESHNESS_WINDOW &&
      inputs[AADHAAR_NULLIFIER_INPUT] === nullifier &&
      inputs[AADHAAR_SEED_INPUT] === nullifierSeed &&
      AADHAAR_DISCLOSURE_INPUTS.every((index) => inputs[index] === 0n) &&
      inputs[AADHAAR_SIGNAL_HASH_INPUT] === signalHash &&
      fresh
      ? 'satisfied'
      : 'rejected'
  }

  /**
   * The revert the manager answers a write with, if any, and nothing of the
   * call lands. A start whose setup body does not recompute to the stored
   * commitment, or does not decode, is refused. The owner's clear names the
   * standing setup's nonce and is refused where no setup stands or the nonce
   * is another; the owner's cancel names the waiting attempt's id and is
   * refused where no attempt waits or the id is another.
   */
  private refusalOf(data: Hex) {
    const write = this.decodeWrite(data)
    switch (write?.functionName) {
      case 'startAttempt': {
        const [{ account, action, setupNonce, setupBody }] = write.args
        const recomputed = setupCommitment(account, action, setupNonce, setupBody)
        const committed = this.manager.setupCommitment
        if (recomputed.toLowerCase() !== committed.toLowerCase()) {
          return revertedCall(
            'call',
            encodeErrorResult({
              abi: ERRORS_MANAGER_ABI,
              errorName: 'PolicyManager_SetupCommitmentMismatch',
              args: [recomputed, committed]
            })
          )
        }
        try {
          decodeSetupBody(setupBody)
        } catch {
          return revertedCall('call', '0x')
        }
        return undefined
      }
      case 'clearSetup': {
        const [, nonce] = write.args
        const expected = this.manager.setupNonce
        if (this.manager.setupCommitment === zeroHash) {
          return revertedCall(
            'call',
            encodeErrorResult({
              abi: ERRORS_MANAGER_ABI,
              errorName: 'PolicyManager_NoSetup',
              args: [this.account, this.descriptor.action]
            })
          )
        }
        if (nonce !== expected) {
          return revertedCall(
            'call',
            encodeErrorResult({
              abi: ERRORS_MANAGER_ABI,
              errorName: 'PolicyManager_WrongSetupNonce',
              args: [nonce, expected]
            })
          )
        }
        return undefined
      }
      case 'cancelByOwner': {
        const [, attemptId] = write.args
        const { attempt } = this.manager
        if (attempt.state !== 'Waiting') {
          return revertedCall(
            'call',
            encodeErrorResult({
              abi: ERRORS_MANAGER_ABI,
              errorName: 'PolicyManager_NoActiveAttempt',
              args: [this.account, this.descriptor.action]
            })
          )
        }
        if (attemptId !== attempt.attemptId) {
          return revertedCall(
            'call',
            encodeErrorResult({
              abi: ERRORS_MANAGER_ABI,
              errorName: 'PolicyManager_WrongAttemptId',
              args: [attemptId, attempt.attemptId]
            })
          )
        }
        return undefined
      }
      default:
        return undefined
    }
  }

  private decodeWrite(data: Hex) {
    try {
      return decodeFunctionData({ abi: WRITES_ABI, data })
    } catch {
      return undefined
    }
  }

  private decodeView(data: Hex) {
    try {
      return decodeFunctionData({ abi: VIEWS_ABI, data })
    } catch {
      return undefined
    }
  }

  private methodAt(address: Address): ScriptedMethod | undefined {
    return this.methods.get(lower(address))
  }

  private answer(to: Address, decoded: NonNullable<ReturnType<ScriptedNode['decodeView']>>): Hex {
    const d = this.descriptor
    const isManager = isAddressEqual(to, d.manager)
    const isAction = isAddressEqual(to, d.action)
    const method = this.methodAt(to)
    switch (decoded.functionName) {
      case 'stateOf': {
        const state = this.manager
        return encodeFunctionResult({
          abi: POLICY_MANAGER_STATE_OF_ABI,
          functionName: 'stateOf',
          result: {
            setupCommitment: state.setupCommitment,
            setupNonce: state.setupNonce,
            nextAttemptId: state.nextAttemptId,
            setupCommittedAtBlock: state.setupCommittedAtBlock,
            attempt: {
              ...state.attempt,
              state: ATTEMPT_STATES.indexOf(state.attempt.state),
              usedMethods: [...state.attempt.usedMethods]
            }
          }
        })
      }
      case 'eip712Domain':
        return encodeFunctionResult({
          abi: POLICY_MANAGER_EIP712_DOMAIN_ABI,
          functionName: 'eip712Domain',
          result: [
            this.domain.fields ?? BUILDER_DOMAIN_FIELDS,
            this.domain.name ?? FORMATS_DIGEST_DOMAIN_NAME,
            this.domain.version ?? d.digestVersion,
            this.domain.chainId ?? BigInt(d.chainId),
            this.domain.verifyingContract ?? d.manager,
            zeroHash,
            []
          ]
        })
      case 'hashApproval': {
        const [request, place] = decoded.args
        return encodeFunctionResult({
          abi: POLICY_MANAGER_HASH_APPROVAL_ABI,
          functionName: 'hashApproval',
          result: approvalDigest(
            { ...this.membersOf(request), payload: request.payload, order: request.order },
            Number(place)
          )
        })
      }
      case 'hashCancel': {
        const [request, place] = decoded.args
        return encodeFunctionResult({
          abi: POLICY_MANAGER_HASH_CANCEL_ABI,
          functionName: 'hashCancel',
          result: cancellationDigest(this.membersOf(request), Number(place))
        })
      }
      case 'name':
        return encodeFunctionResult({
          abi: POLICY_MANAGER_NAME_ABI,
          functionName: 'name',
          result: isManager
            ? 'PolicyManager'
            : isAction
            ? 'AmbireRecoveryAction'
            : method?.name ?? ''
        })
      case 'version':
        return encodeFunctionResult({
          abi: POLICY_MANAGER_VERSION_ABI,
          functionName: 'version',
          result: isManager ? d.managerVersion : method?.version ?? '1'
        })
      case 'supportsInterface': {
        const [interfaceId] = decoded.args
        const expected = isManager
          ? MANAGER_INTERFACE_ID
          : isAction
          ? POLICY_ACTION_INTERFACE_ID
          : POLICY_METHOD_INTERFACE_ID
        return encodeFunctionResult({
          abi: POLICY_MANAGER_SUPPORTS_INTERFACE_ABI,
          functionName: 'supportsInterface',
          result: interfaceId.toLowerCase() === expected.toLowerCase()
        })
      }
      case 'trustedParties': {
        if (!method) {
          throw revertedCall('call', '0x')
        }
        const p = method.parties
        return encodeFunctionResult({
          abi: POLICY_MANAGER_TRUSTED_PARTIES_ABI,
          functionName: 'trustedParties',
          result: [p.admin, p.pendingAdmin, [...p.trustedKeys], p.pauseHolder, p.pendingPauseHolder]
        })
      }
      case 'paused':
        return encodeFunctionResult({
          abi: POLICY_MANAGER_PAUSED_ABI,
          functionName: 'paused',
          result: method?.paused ?? false
        })
      case 'supportsAccount': {
        const [account] = decoded.args
        return this.boolean(
          'supportsAccount',
          isAddressEqual(account, this.account) && this.hasCode() && this.supportsAccount
        )
      }
      case 'isAuthorized':
        return this.boolean('isAuthorized', this.hasCode() && this.authorized)
      case 'isAuthority': {
        const [, authority] = decoded.args
        return this.boolean('isAuthority', this.holdsKey(authority))
      }
      case 'holdsAnyPrivilege': {
        const [, candidate] = decoded.args
        const value = this.privileges.get(lower(candidate))
        return this.boolean('holdsAnyPrivilege', value !== undefined && value !== zeroHash)
      }
      case 'MANAGER':
        return encodeAbiParameters([{ type: 'address' }], [this.constants.manager ?? d.manager])
      case 'AMBIRE_IMPLEMENTATION':
        return encodeAbiParameters(
          [{ type: 'address' }],
          [this.constants.ambireImplementation ?? d.servedImplementation]
        )
      case 'KIT_SLOT':
        return encodeAbiParameters(
          [{ type: 'address' }],
          [this.constants.kitSlot ?? kitSlot(d.action)]
        )
      case 'BINDING':
        return this.constants.binding ?? kitBinding(d.action)
      case 'KEY_VALUE':
        return KEY_VALUE
      case 'privileges': {
        const [key] = decoded.args
        return this.privileges.get(lower(key)) ?? zeroHash
      }
      default:
        throw revertedCall('call', '0x')
    }
  }

  private boolean(
    functionName: 'supportsAccount' | 'isAuthorized' | 'isAuthority' | 'holdsAnyPrivilege',
    value: boolean
  ): Hex {
    return encodeFunctionResult({ abi: RECOVERY_ACTION_VIEWS_ABI, functionName, result: value })
  }

  private hasCode(): boolean {
    return this.codes.has(lower(this.account))
  }

  private holdsKey(key: Address): boolean {
    return this.privileges.get(lower(key))?.toLowerCase() === KEY_VALUE
  }

  private membersOf(request: {
    account: Address
    action: Address
    attemptId: bigint
    setupNonce: bigint
    setupBody: Hex
    validUntil: number
  }) {
    return {
      chainId: this.descriptor.chainId,
      manager: this.descriptor.manager,
      account: request.account,
      action: request.action,
      attemptId: request.attemptId,
      setupNonce: request.setupNonce,
      setupBodyHash: keccak256(request.setupBody),
      validUntil: request.validUntil,
      digestVersion: this.descriptor.digestVersion
    }
  }

  private async backupOf(
    configuration: Configuration,
    privacy: DraftPrivacy,
    password: string | undefined,
    commitment: Hex,
    nonce: bigint
  ): Promise<Hex> {
    if (privacy.backup === 'empty') {
      return '0x'
    }
    if (privacy.backup === 'clear') {
      return serializeConfiguration(configuration)
    }
    return sealBackup(
      configuration,
      password ?? '',
      bytesToHex(crypto.getRandomValues(new Uint8Array(12))),
      BACKUP_PADDING_SIZE,
      {
        account: this.account,
        action: this.descriptor.action,
        setupCommitment: commitment,
        nonce,
        payloadVersion: BACKUP_PAYLOAD_VERSION
      }
    )
  }

  private recordTransaction(block: BlockHeader, from: Address, input: Hex): Hex {
    const scripted = this.blocks.find((entry) => entry.header.number === block.number)
    const hash = keccak256(concat([block.hash, numberToHex(scripted?.transactions.length ?? 0)]))
    scripted?.transactions.push(hash)
    this.transactions.set(hash, {
      hash,
      from,
      to: this.descriptor.manager,
      input,
      blockNumber: block.number,
      blockHash: block.hash
    })
    return hash
  }

  private emit(
    emitter: Address,
    topics: readonly Hex[],
    data: Hex,
    block: BlockHeader,
    transactionHash: Hex
  ): void {
    this.logList.push({
      address: emitter,
      topics,
      data,
      blockNumber: block.number,
      blockHash: block.hash,
      logIndex: this.logList.filter((log) => log.blockNumber === block.number).length,
      transactionHash
    })
  }

  private managerTopics(
    eventName:
      | 'SetupCommitted'
      | 'SetupCleared'
      | 'AttemptStarted'
      | 'AttemptCancelled'
      | 'AttemptConsumed'
  ): Hex[] {
    return encodeEventTopics({
      abi: MANAGER_EVENTS_ABI,
      eventName,
      args: { account: this.account, action: this.descriptor.action }
    }) as Hex[]
  }

  private applyCommit(
    nonce: bigint,
    commitment: Hex,
    body: Hex,
    publicMetadata: Hex,
    privateMetadata: Hex,
    from: Address,
    at?: { block: BlockHeader; hash: Hex }
  ): void {
    const block = at?.block ?? this.mine()
    const hash = at?.hash ?? this.recordTransaction(block, from, '0x')
    Object.assign(this.manager, {
      setupCommitment: commitment,
      setupNonce: nonce,
      setupCommittedAtBlock: block.number,
      setupBody: body
    })
    this.emit(
      this.descriptor.manager,
      this.managerTopics('SetupCommitted'),
      encodeAbiParameters(
        [{ type: 'uint64' }, { type: 'bytes32' }, { type: 'bytes' }, { type: 'bytes' }],
        [nonce, commitment, publicMetadata, privateMetadata]
      ),
      block,
      hash
    )
  }

  private applyClear(from: Address, at?: { block: BlockHeader; hash: Hex }): void {
    const block = at?.block ?? this.mine()
    const hash = at?.hash ?? this.recordTransaction(block, from, '0x')
    const nonce = this.manager.setupNonce + 1n
    Object.assign(this.manager, {
      setupCommitment: zeroHash,
      setupNonce: nonce,
      setupCommittedAtBlock: block.number,
      setupBody: '0x'
    })
    this.emit(
      this.descriptor.manager,
      this.managerTopics('SetupCleared'),
      encodeAbiParameters([{ type: 'uint64' }], [nonce]),
      block,
      hash
    )
  }

  private applyStart(
    request: ScriptedOpening,
    facts: {
      consumableAfter: number
      ignoresPause: boolean
      usedMethods: readonly Address[]
      usedPlaces: readonly bigint[]
    },
    block: BlockHeader,
    from: Address,
    transactionHash?: Hex
  ): void {
    const hash = transactionHash ?? this.recordTransaction(block, from, '0x')
    this.manager.attempt = {
      attemptId: request.attemptId,
      setupNonce: request.setupNonce,
      consumableAfter: facts.consumableAfter,
      state: 'Waiting',
      payloadHash: keccak256(request.payload),
      order: request.order,
      usedMethods: facts.usedMethods,
      ignoresPause: facts.ignoresPause
    }
    this.manager.nextAttemptId = request.attemptId + 1n
    this.emit(
      this.descriptor.manager,
      this.managerTopics('AttemptStarted'),
      encodeAbiParameters(
        MANAGER_EVENTS_ABI[2].inputs.filter((input) => !input.indexed),
        [
          request.attemptId,
          request.setupNonce,
          request.setupBody,
          [...facts.usedPlaces],
          [...facts.usedMethods],
          request.payload,
          request.order,
          facts.consumableAfter
        ]
      ),
      block,
      hash
    )
  }

  private applyCancel(
    canceller: Address,
    vetoingMethod: Address,
    block: BlockHeader,
    from: Address,
    transactionHash?: Hex
  ): void {
    const hash = transactionHash ?? this.recordTransaction(block, from, '0x')
    const { attempt } = this.manager
    this.manager.attempt = { ...attempt, state: 'Cancelled' }
    this.emit(
      this.descriptor.manager,
      this.managerTopics('AttemptCancelled'),
      encodeAbiParameters(
        MANAGER_EVENTS_ABI[3].inputs.filter((input) => !input.indexed),
        [attempt.attemptId, canceller, vetoingMethod, attempt.setupNonce, []]
      ),
      block,
      hash
    )
  }

  private applyConsume(block: BlockHeader, from: Address, transactionHash?: Hex): void {
    const hash = transactionHash ?? this.recordTransaction(block, from, '0x')
    const { attempt } = this.manager
    this.manager.attempt = { ...attempt, state: 'Consumed' }
    this.emit(
      this.descriptor.manager,
      this.managerTopics('AttemptConsumed'),
      encodeAbiParameters([{ type: 'uint64' }], [attempt.attemptId]),
      block,
      hash
    )
    const started = [...this.logList]
      .reverse()
      .find((log) => log.topics[0] === this.managerTopics('AttemptStarted')[0])
    if (!started) {
      return
    }
    const payload = this.payloadOf(started)
    if (payload === undefined) {
      return
    }
    const handover = this.codec.decode(payload)
    this.writePrivilege(handover.newAuthority, KEY_VALUE, block, hash)
    if (handover.removedAuthority) {
      this.writePrivilege(handover.removedAuthority, zeroHash, block, hash)
    }
  }

  private payloadOf(log: RawLog): Hex | undefined {
    const attemptStarted = MANAGER_EVENTS_ABI[2]
    try {
      const values = decodeAbiParameters(
        attemptStarted.inputs.filter((input) => !input.indexed),
        log.data
      )
      return values[5] as Hex
    } catch {
      return undefined
    }
  }

  private writePrivilege(
    addr: Address,
    value: Hex,
    block: BlockHeader,
    transactionHash: Hex
  ): void {
    if (value === zeroHash) {
      this.privileges.delete(lower(addr))
    } else {
      this.privileges.set(lower(addr), value)
    }
    this.emit(
      this.account,
      encodeEventTopics({
        abi: ACCOUNT_EVENTS_ABI,
        eventName: 'LogPrivilegeChanged',
        args: { addr }
      }) as Hex[],
      encodeAbiParameters([{ type: 'bytes32' }], [value]),
      block,
      transactionHash
    )
  }

  private applyCall(call: PreparedCall, block: BlockHeader, from: Address, hash: Hex): void {
    const write = this.decodeWrite(call.data)
    if (!write) {
      return
    }
    const at = { block, hash }
    switch (write.functionName) {
      case 'commitSetup': {
        const [, commitment, nonce, publicMetadata, privateMetadata] = write.args
        this.applyCommit(nonce, commitment, '0x', publicMetadata, privateMetadata, from, at)
        return
      }
      case 'clearSetup':
        this.applyClear(from, at)
        return
      case 'cancelByOwner':
        this.applyCancel(this.account, zeroAddress, block, from, hash)
        return
      case 'cancelByVeto': {
        const [, , , method] = write.args
        this.applyCancel(zeroAddress, method, block, from, hash)
        return
      }
      case 'cancelByProofs':
        this.applyCancel(from, zeroAddress, block, from, hash)
        return
      case 'startAttempt': {
        const [request] = write.args
        this.applyStart(
          request,
          {
            consumableAfter: block.timestamp + decodeSetupBody(request.setupBody).wait,
            ignoresPause: false,
            usedMethods: request.proofs.map((proof) => proof.method),
            usedPlaces: request.proofs.map((proof) => proof.place)
          },
          block,
          from,
          hash
        )
        return
      }
      case 'executeHandover':
      case 'consume':
        this.applyConsume(block, from, hash)
        return
      case 'setAddrPrivilege': {
        const [addr, value] = write.args
        this.writePrivilege(addr, value, block, hash)
        break
      }
      default:
        break
    }
  }
}
