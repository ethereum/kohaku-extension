/**
 * The factories: `IProvider`, the deployment descriptor, the client
 * configuration and the shape of `RecoveryKitBuilder`. Imported from no SDK
 * package; types only.
 */
import type { Address, BlockHeader, BlockTag, Hex } from './common'
import type { BlockRange, FilterSpec, IEventManager, RawLog } from './events'
import type { IActionCodec } from './formats'
import type {
  IMethodModuleReads,
  IPolicyManagerInteractor,
  IRecoveryActionArming,
  IRecoveryActionInteractor,
  IRecoveryClient,
  ISetupClient
} from './interactor'
import type { IMethodsOrchestrator, IRecoveryMethod } from './methods'

/**
 * The integrator's four-member chain access, the only object the SDK reaches a
 * chain through. It cannot send a transaction, holds no subscription and makes
 * no code read. `call` rejects a reverted call with the raw revert data; a read
 * it could not make reaches the SDK as a failure and never as an empty answer.
 */
export interface IProvider {
  chainId(): Promise<number>
  call(to: Address, data: Hex, from: Address | undefined, block: BlockTag): Promise<Hex>
  logs(filterSpec: FilterSpec, range: BlockRange): Promise<RawLog[]>
  block(tag: BlockTag): Promise<BlockHeader>
}

/**
 * The record of one deployment. Every field is required, so a partial
 * descriptor is a type error rather than a silent default.
 */
export interface DeploymentDescriptor {
  chainId: number
  manager: Address
  methodEcdsa: Address
  methodPasskey: Address
  methodAadhaar: Address
  methodZkpassport: Address
  action: Address
  servedImplementation: Address
  deployedAt: number
  digestVersion: string
  managerVersion: string
  shippedMethods: Address[]
  auditedActions: Address[]
}

/**
 * The account's creation triple and its creation block, where the integrator
 * has them.
 */
export interface CreationRecord {
  factory: Address
  bytecode: Hex
  salt: Hex
  block: number
}

/**
 * What a client accepts. `tokens`, `candidateKeys`, `creation` and `blockTags`
 * follow the SDK's examples; the other names are the extension's, over the
 * values the SDK lists. No method list travels here: the builder's registry is
 * the one list.
 */
export interface ClientConfiguration {
  /** The token allowlist the unknown-token warning reads. */
  tokens: Address[]
  /** The addresses the integrator asks `isAuthority` about; never the account's signer set. */
  candidateKeys: Address[]
  creation?: CreationRecord
  /** The account implementation the integrator is about to deploy, read by the fit check alone. */
  accountImplementation?: Address
  /** One tag for reading and one for watching; they default to `latest` and `finalized`. */
  blockTags?: { read: BlockTag; watch: BlockTag }
  /** The block width `fetch` chunks its reads into, the integrator's node's own ceiling. */
  logChunkWidth?: number
  /** Whether a prepare simulates when its own options say nothing. */
  simulate?: boolean
  /** The six timing and cost numbers, each an exported default the integrator may override (seconds, gas). */
  defaultWait?: number
  shortWaitBelow?: number
  maximumWait?: number
  requestWindow?: { default: number; floor: number; ceiling: number }
  cancelWindow?: number
  ruleCostBound?: bigint
}

/**
 * The shape of the one class that constructs a class. Setters return the
 * builder and refuse after the first build; `recoveryAction()` and
 * `methodModuleReads()` count as builds and hand out the narrow seams alone.
 *
 * Outside the twelve interfaces: the SDK ships `RecoveryKitBuilder` as a class,
 * so this is its shape, not an interface the SDK exports.
 */
export interface RecoveryKitBuilder {
  provider(p: IProvider): RecoveryKitBuilder
  descriptor(d: DeploymentDescriptor): RecoveryKitBuilder
  account(address: Address): RecoveryKitBuilder
  action(
    address: Address,
    implementation: IRecoveryActionInteractor & IRecoveryActionArming
  ): RecoveryKitBuilder
  config(c: ClientConfiguration): RecoveryKitBuilder
  policyManager(pm: IPolicyManagerInteractor & IMethodModuleReads): RecoveryKitBuilder
  eventManager(em: IEventManager): RecoveryKitBuilder
  method(m: IRecoveryMethod): RecoveryKitBuilder
  codec(c: IActionCodec<unknown>): RecoveryKitBuilder
  buildSetupClient(): Promise<ISetupClient>
  buildRecoveryClient(): Promise<IRecoveryClient>
  buildMethodsOrchestrator(): IMethodsOrchestrator
  recoveryAction(): Promise<IRecoveryActionInteractor>
  methodModuleReads(): Promise<IMethodModuleReads>
}
