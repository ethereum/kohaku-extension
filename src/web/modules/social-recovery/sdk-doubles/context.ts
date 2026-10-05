/**
 * What the two client doubles are built over: the scripted chain, the shared
 * parts (one instance each, the same for both clients), the client configuration
 * and the codec registry. The builder double assembles it; a test may assemble
 * it too. Also the configuration restore, which both clients run.
 */
import type {
  Address,
  BlockHeader,
  ClientConfiguration,
  Configuration,
  ConfigurationSource,
  IActionCodec
} from '@web/modules/social-recovery/sdk-interfaces'
import { zeroHash } from 'viem'

import { readBackup, sameAddress, setupBodyOf, setupCommitmentOf } from './encoding'
import { DEFAULT_LOG_CHUNK_WIDTH } from './event-manager'
import { restoreRefusal } from './scripts'
import type { ClientContext } from './types'

/**
 * The block tags a client defaults to when its configuration names none:
 * `latest` for reading and `finalized` for watching.
 */
export const DEFAULT_BLOCK_TAGS: NonNullable<ClientConfiguration['blockTags']> = {
  read: 'latest',
  watch: 'finalized'
}

/** Whether a prepare simulates when neither its options nor the configuration say. */
export const DEFAULT_SIMULATE = true

/** The SDK's shipped timing and cost numbers (seconds, gas), for a configuration that names none. */
export const DEFAULT_WAIT = 48 * 3600
export const DEFAULT_SHORT_WAIT_BELOW = 48 * 3600
export const DEFAULT_MAXIMUM_WAIT = 30 * 24 * 3600
export const DEFAULT_REQUEST_WINDOW: NonNullable<ClientConfiguration['requestWindow']> = {
  default: 24 * 3600,
  floor: 3600,
  ceiling: 72 * 3600
}
export const DEFAULT_CANCEL_WINDOW = 12 * 3600
export const DEFAULT_RULE_COST_BOUND = 10_000_000n

/** The client configuration the doubles default to, with the SDK's shipped default numbers. */
export const defaultClientConfiguration = (
  overrides: Partial<ClientConfiguration> = {}
): ClientConfiguration => ({
  tokens: [],
  candidateKeys: [],
  blockTags: { ...DEFAULT_BLOCK_TAGS },
  logChunkWidth: DEFAULT_LOG_CHUNK_WIDTH,
  simulate: DEFAULT_SIMULATE,
  defaultWait: DEFAULT_WAIT,
  shortWaitBelow: DEFAULT_SHORT_WAIT_BELOW,
  maximumWait: DEFAULT_MAXIMUM_WAIT,
  requestWindow: { ...DEFAULT_REQUEST_WINDOW },
  cancelWindow: DEFAULT_CANCEL_WINDOW,
  ruleCostBound: DEFAULT_RULE_COST_BOUND,
  ...overrides
})

export const codecFor = (ctx: ClientContext, action: Address): IActionCodec<unknown> | undefined =>
  ctx.codecs.find((c) => c.actions.some((a) => sameAddress(a, action)))

/** The block a read pins at: the configuration's read tag, or `latest` by default. */
export const pinBlock = (ctx: ClientContext): Promise<BlockHeader> =>
  ctx.provider.block((ctx.config.blockTags ?? DEFAULT_BLOCK_TAGS).read)

/**
 * The configuration restore: pin a block, read `stateOf`, open the latest
 * `SetupCommitted`'s backup with the password (or take the configuration
 * given), then check the commitment. Throws a `RestoreRefusal` naming the step
 * that refused.
 */
export const restoreConfiguration = async (
  ctx: ClientContext,
  source: ConfigurationSource,
  pinned?: BlockHeader
): Promise<Configuration> => {
  const block = pinned ?? (await pinBlock(ctx))
  const state = await ctx.manager.stateOf()
  if (state.setupCommitment === zeroHash) {
    throw restoreRefusal('restore.no-backup', { setup: 'none' })
  }
  let configuration: Configuration
  if ('password' in source) {
    const notifications = await ctx.events.fetch(ctx.events.accountFilter(), {
      from: state.setupCommittedAtBlock,
      to: block.number
    })
    const latest = notifications
      .filter((n) => n.kind === 'setup-committed')
      .reverse()
      .find((n) => n.kind === 'setup-committed' && n.nonce === state.setupNonce)
    if (!latest || latest.kind !== 'setup-committed') {
      throw restoreRefusal('restore.no-backup', { setup: 'standing', backup: 'none' })
    }
    const reading = readBackup(latest.privateMetadata, source.password)
    if (reading.form === 'empty') {
      throw restoreRefusal('restore.no-backup', { setup: 'standing', backup: 'none' })
    }
    // The clear backup has no reader here: its holder passes the configuration itself.
    if (reading.form !== 'encrypted' || !reading.opened) {
      throw restoreRefusal('restore.backup-unopened')
    }
    configuration = reading.configuration
  } else {
    configuration = source
  }
  const recomputed = setupCommitmentOf(
    ctx.chain.account,
    ctx.actionAddress,
    state.setupNonce,
    setupBodyOf(ctx.chain.account, configuration)
  )
  if (recomputed !== state.setupCommitment) {
    throw restoreRefusal('restore.commitment-mismatch', {
      committed: state.setupCommitment,
      recomputed
    })
  }
  return configuration
}
