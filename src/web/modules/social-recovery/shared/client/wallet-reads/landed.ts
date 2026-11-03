/**
 * The landed rule the save keeps: the SDK's confirmation finds the commit's
 * event, and the manager must also hold that commit's nonce and commitment at
 * the block read after it. A commit cleared or replaced since reads as not
 * landed, with another commitment standing, and carries no event position.
 */
import type { ActionState, SetupConfirmation } from '@kohaku-eth/social-recovery'

export const confirmationAgainstState = (
  confirmation: SetupConfirmation,
  state: Pick<ActionState, 'setupNonce' | 'setupCommitment'>
): SetupConfirmation => {
  const stands =
    state.setupNonce === confirmation.nonce &&
    state.setupCommitment.toLowerCase() === confirmation.setupCommitment.toLowerCase()
  if (!confirmation.landed || stands) {
    return confirmation
  }
  return {
    landed: false,
    cause: 'other-commitment',
    nonce: confirmation.nonce,
    setupCommitment: confirmation.setupCommitment,
    isAuthorized: confirmation.isAuthorized
  }
}
