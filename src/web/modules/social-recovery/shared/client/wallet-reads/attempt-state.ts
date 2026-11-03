/**
 * The manager's state for an account and an action at one pinned block, the
 * recovery state without its removed key: no code read and no log scan. A
 * contract revert met by the read is rethrown as the kit's named error.
 */
import { pinBlockHeader } from '@kohaku-eth/social-recovery'

import { withNamedRevert } from '../reverts'
import type { RecoveryAttemptState } from '../types'
import type { AttemptStateReadInput } from './types'

export const readAttemptState = ({
  provider,
  blockTags,
  policyManager
}: AttemptStateReadInput): Promise<RecoveryAttemptState> =>
  withNamedRevert(async () => {
    const { header, block } = await pinBlockHeader(provider, blockTags.read)
    const state = await policyManager.stateOf(block)
    return {
      attempt: state.attempt,
      nextAttemptId: state.nextAttemptId,
      setupCommitment: state.setupCommitment,
      setupNonce: state.setupNonce,
      block: header
    }
  })
