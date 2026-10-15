/**
 * The manager's state for an account and an action at one pinned block, the
 * recovery state without its removed key: no code read and no log scan. A
 * contract revert met by the read is rethrown as the kit's named error.
 */
import type { RecoveryAttemptState } from '../../types'
import { pinnedBlockOf, withNamedRevert } from '../setup-client'
import type { AttemptStateReadInput } from './types'

export const readAttemptState = ({
  provider,
  blockTags,
  manager,
  account,
  action
}: AttemptStateReadInput): Promise<RecoveryAttemptState> =>
  withNamedRevert(async () => {
    const block = await pinnedBlockOf(provider, { blockTags })
    const state = await manager.stateOf(account, action, block.number)
    return {
      attempt: state.attempt,
      nextAttemptId: state.nextAttemptId,
      setupCommitment: state.setupCommitment,
      setupNonce: state.setupNonce,
      block
    }
  })
