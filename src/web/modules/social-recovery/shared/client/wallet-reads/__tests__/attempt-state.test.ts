/**
 * The manager's attempt state of a deployed account, read over a fake node at
 * one pinned block: the state's fields and the block, a refused read
 * rethrown, and no code read and no log read made.
 */
import { ERRORS_MANAGER_ABI } from '@kohaku-eth/social-recovery'
import { encodeErrorResult, getAddress, zeroAddress, zeroHash } from 'viem'

import {
  ACCOUNT_CODE,
  CONTRACT_CODE,
  HEAD,
  MANAGER,
  reverting,
  scriptState,
  stateOfCall,
  thrownBy
} from '@web/modules/social-recovery/shared/client/__fixtures__/scripted-provider'
import { worldOf } from '@web/modules/social-recovery/shared/client/wallet-reads/__fixtures__/world'

const COMMITMENT = `0x${'5a'.repeat(32)}` as const

const deployedWorld = (options: Parameters<typeof worldOf>[0] = {}) => {
  const world = worldOf({ code: ACCOUNT_CODE, ...options })
  world.node.setCode(MANAGER, CONTRACT_CODE)
  scriptState(world.node, {
    setupCommitment: COMMITMENT,
    setupNonce: 4n,
    setupCommittedAtBlock: 12,
    nextAttemptId: 8n,
    attemptState: 1,
    attemptId: 7n,
    consumableAfter: 1_900_000_000
  })
  return world
}

describe("the manager's attempt state", () => {
  it('carries the attempt, the attempt counter, the setup and the pinned block', async () => {
    const { node, reads } = deployedWorld()
    const state = await reads.attemptState()
    expect(state).toEqual({
      attempt: {
        state: 'Waiting',
        attemptId: 7n,
        setupNonce: 4n,
        consumableAfter: 1_900_000_000,
        payloadHash: zeroHash,
        order: {
          token: zeroAddress,
          amount: 0n,
          payee: zeroAddress
        },
        usedMethods: [],
        ignoresPause: false
      },
      nextAttemptId: 8n,
      setupCommitment: COMMITMENT,
      setupNonce: 4n,
      block: node.head
    })
    expect(state).not.toHaveProperty('removedKey')
  })

  it('reads the state once, at the pinned block, and makes no code read and no log read', async () => {
    const { node, reads } = deployedWorld()
    await reads.attemptState()
    expect(node.calls).toEqual([{ to: getAddress(MANAGER), data: stateOfCall(), block: HEAD }])
    expect(node.provider.code).not.toHaveBeenCalled()
    expect(node.provider.logs).not.toHaveBeenCalled()
    expect(node.provider.transaction).not.toHaveBeenCalled()
  })

  it('pins the block at the configured read tag', async () => {
    const { node, reads } = deployedWorld({ blockTags: { read: 'finalized', watch: 'latest' } })
    await reads.attemptState()
    expect(node.provider.block.mock.calls).toEqual([['finalized']])
  })

  it('rethrows a refused read as the node refused it', async () => {
    const { node, reads } = deployedWorld()
    const refusal = new Error('too many requests')
    node.answer(MANAGER, stateOfCall(), refusal)
    expect(await thrownBy(reads.attemptState())).toBe(refusal)
  })

  it("rethrows a revert of the manager's view as the kit's named error", async () => {
    const { node, reads } = deployedWorld()
    node.answer(
      MANAGER,
      stateOfCall(),
      reverting(
        encodeErrorResult({
          abi: ERRORS_MANAGER_ABI,
          errorName: 'PolicyManager_WrongSetupNonce',
          args: [2n, 3n]
        })
      )
    )
    expect(await thrownBy(reads.attemptState())).toMatchObject({
      name: 'LandingRevert',
      code: 'PolicyManager_WrongSetupNonce'
    })
  })

  it('fails where the pinned block cannot be read, with no state read', async () => {
    const { node, reads } = deployedWorld()
    const refusal = new Error('node down')
    node.provider.block.mockRejectedValueOnce(refusal)
    expect(await thrownBy(reads.attemptState())).toBe(refusal)
    expect(node.calls).toEqual([])
  })
})
