import type {
  Address,
  ClientConfiguration,
  Hex,
  RawLog
} from '@web/modules/social-recovery/sdk-interfaces'

/** A deployed account with no creation record, scripted on the fake node. */
export interface UnlistedWorldOptions {
  /** The account's code; deployed code by default. */
  code?: Hex
  /** The first block at which the account has code; the manager's deployment block by default. */
  createdAt?: number
  /** The block the manager was deployed at; the harness's by default. */
  deployedAt?: number
  logs?: RawLog[]
  /** The sender each transaction hash names, or the error its read rejects with. */
  senders?: [Hex, Address | Error][]
  /** The keys the account's `privileges` view answers a value for. */
  holders?: Address[]
  /** The keys the action's `isAuthority` answers true for. */
  authorities?: Address[]
  associatedKeys?: string[]
  knownKeys?: Address[]
  blockTags?: ClientConfiguration['blockTags']
}
