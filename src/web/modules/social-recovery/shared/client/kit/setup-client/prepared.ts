/**
 * The prepared records the deployed kit's setup client returns: a call the
 * account sends, and an atomic batch of such calls, each pinned at the block
 * its reads were made at. No simulation runs, so neither carries one.
 */
import type {
  Address,
  BlockHeader,
  ClientConfiguration,
  Hex,
  IProvider,
  PreparedBatch,
  PreparedCall
} from '@web/modules/social-recovery/sdk-interfaces'

/** The block a client's reads pin at: the configuration's read tag, or `latest`. */
export const pinnedBlockOf = (
  provider: IProvider,
  config: Pick<ClientConfiguration, 'blockTags'>
): Promise<BlockHeader> => provider.block(config.blockTags?.read ?? 'latest')

/** One call the account sends to `target`, carrying no value. */
export const accountCallOf = (target: Address, data: Hex, block: BlockHeader): PreparedCall => ({
  kind: 'call',
  target,
  value: 0n,
  data,
  sender: 'account',
  block: { number: block.number, hash: block.hash }
})

/** Calls the account runs as one transaction, in order. */
export const accountBatchOf = (calls: PreparedCall[], block: BlockHeader): PreparedBatch => ({
  kind: 'batch',
  calls,
  atomic: true,
  block: { number: block.number, hash: block.hash }
})
