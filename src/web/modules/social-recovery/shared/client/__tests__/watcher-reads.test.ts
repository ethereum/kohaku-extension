/**
 * The watcher's reads over a provider scripted by hand: each read pinned to
 * the block it is given, and the logs of one attempt scanned backwards until
 * its opening.
 */
import {
  ERRORS_MANAGER_ABI,
  MANAGER_EVENTS_ABI,
  RECOVERY_ACTION_VIEWS_ABI
} from '@kohaku-eth/social-recovery'
import type { BlockRange, FilterSpec, RawLog } from '@kohaku-eth/social-recovery'
import {
  encodeAbiParameters,
  encodeErrorResult,
  encodeEventTopics,
  encodeFunctionResult,
  type Hex,
  pad,
  toFunctionSelector,
  zeroAddress
} from 'viem'

import { createWatcherReads } from '@web/modules/social-recovery/shared/client'
import {
  ACCOUNT,
  ACCOUNT_CODE,
  ACTION,
  attemptConsumedLog,
  attemptStartedLog,
  CONTRACT_CODE,
  DEPLOYED_AT,
  DESCRIPTOR,
  HEAD,
  MANAGER,
  OTHER_ACTION,
  reverting,
  scriptedProvider,
  scriptState,
  stateOfCall,
  thrownBy
} from '@web/modules/social-recovery/shared/client/__fixtures__/scripted-provider'
import {
  handoverTo,
  NEW_KEY
} from '@web/modules/social-recovery/shared/client/wallet-reads/__fixtures__/world'

const [, , , ATTEMPT_CANCELLED] = MANAGER_EVENTS_ABI

const cancelledLog = (attemptId: bigint, blockNumber: number): RawLog => ({
  address: MANAGER,
  topics: encodeEventTopics({
    abi: MANAGER_EVENTS_ABI,
    eventName: 'AttemptCancelled',
    args: { account: ACCOUNT, action: ACTION }
  }) as Hex[],
  data: encodeAbiParameters(
    ATTEMPT_CANCELLED.inputs.filter((input) => !input.indexed),
    [attemptId, ACCOUNT, zeroAddress, 1n, []]
  ),
  blockNumber,
  blockHash: pad(`0x${blockNumber.toString(16)}`),
  logIndex: 0,
  transactionHash: pad(`0x${(blockNumber + 7).toString(16)}`),
  removed: false
})

const CHUNK = 100

const worldWith = (logs: RawLog[]) => {
  const node = scriptedProvider()
  node.setCode(ACCOUNT, ACCOUNT_CODE, DEPLOYED_AT + 10)
  node.setCode(MANAGER, CONTRACT_CODE)
  node.setCode(ACTION, CONTRACT_CODE)
  logs.forEach((log) => node.addLog(log))
  const reads = createWatcherReads({
    provider: node.provider,
    descriptor: DESCRIPTOR,
    chunkWidth: CHUNK
  })
  const scanned = () =>
    (node.provider.logs.mock.calls as [FilterSpec, BlockRange][]).map(([, range]) => range)
  return { node, reads, scanned }
}

describe('the watcher reads', () => {
  it('scans an attempt backwards from the pinned block and stops at the chunk of its opening', async () => {
    const payload = handoverTo(NEW_KEY)
    const { reads, scanned } = worldWith([
      attemptStartedLog(3n, payload, HEAD - 250),
      attemptConsumedLog(3n, HEAD - 20)
    ])

    const found = await reads.attemptEventsOf(ACCOUNT, 3n, { from: DEPLOYED_AT, to: HEAD })

    expect(found.started?.payload).toBe(payload)
    expect(found.consumed?.at.blockNumber).toBe(HEAD - 20)
    expect(found.cancelled).toBeUndefined()
    expect(scanned()).toEqual([
      { from: HEAD - 99, to: HEAD },
      { from: HEAD - 199, to: HEAD - 100 },
      { from: HEAD - 299, to: HEAD - 200 }
    ])
  })

  it('stops at the chunk of the ending where the scan asks for the ending alone', async () => {
    const { reads, scanned } = worldWith([
      attemptStartedLog(3n, handoverTo(NEW_KEY), HEAD - 250),
      attemptConsumedLog(3n, HEAD - 120)
    ])

    const found = await reads.attemptEventsOf(ACCOUNT, 3n, {
      from: DEPLOYED_AT,
      to: HEAD,
      until: 'ending'
    })

    expect(found.consumed?.at.blockNumber).toBe(HEAD - 120)
    expect(found.started).toBeUndefined()
    expect(scanned()).toEqual([
      { from: HEAD - 99, to: HEAD },
      { from: HEAD - 199, to: HEAD - 100 }
    ])
  })

  it("keeps only the asked attempt's logs at the deployment's action", async () => {
    const { reads } = worldWith([
      attemptStartedLog(2n, handoverTo(NEW_KEY), HEAD - 300),
      cancelledLog(2n, HEAD - 290),
      attemptStartedLog(3n, handoverTo(NEW_KEY), HEAD - 150, OTHER_ACTION),
      attemptStartedLog(3n, '0x', HEAD - 100),
      cancelledLog(3n, HEAD - 50)
    ])

    const found = await reads.attemptEventsOf(ACCOUNT, 3n, { from: DEPLOYED_AT, to: HEAD })

    expect(found.started?.payload).toBe('0x')
    expect(found.cancelled).toMatchObject({ attemptId: 3n, cancelledBy: 'cancelByOwner' })
  })

  it('tells each chunk it read and stops before the next chunk once asked', async () => {
    const { reads, scanned } = worldWith([attemptStartedLog(3n, handoverTo(NEW_KEY), HEAD - 250)])
    const chunks: number[] = []

    const found = await reads.attemptEventsOf(ACCOUNT, 3n, {
      from: DEPLOYED_AT,
      to: HEAD,
      stop: () => chunks.length === 2,
      onChunk: (from) => chunks.push(from)
    })

    expect(found).toEqual({})
    expect(chunks).toEqual([HEAD - 99, HEAD - 199])
    expect(scanned()).toEqual([
      { from: HEAD - 99, to: HEAD },
      { from: HEAD - 199, to: HEAD - 100 }
    ])
  })

  it('never tells the chunk that holds the opening, nor any chunk after it', async () => {
    const { reads } = worldWith([attemptStartedLog(3n, handoverTo(NEW_KEY), HEAD - 150)])
    const chunks: number[] = []

    const found = await reads.attemptEventsOf(ACCOUNT, 3n, {
      from: DEPLOYED_AT,
      to: HEAD,
      onChunk: (from) => chunks.push(from)
    })

    expect(found.started?.at.blockNumber).toBe(HEAD - 150)
    expect(chunks).toEqual([HEAD - 99])
  })

  it("rejects a revert of the manager's state read as the kit's named error", async () => {
    const { node, reads } = worldWith([])
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

    const thrown = await thrownBy(reads.stateOf(ACCOUNT, HEAD))
    expect(thrown).toMatchObject({ name: 'LandingRevert', code: 'PolicyManager_WrongSetupNonce' })
    expect((thrown as Error).message).toContain('WrongSetupNonce')
  })

  it("never scans before the manager's deployment block", async () => {
    const { reads, scanned } = worldWith([])

    expect(await reads.attemptEventsOf(ACCOUNT, 3n, { from: 0, to: DEPLOYED_AT + 150 })).toEqual({})
    expect(scanned()).toEqual([
      { from: DEPLOYED_AT + 51, to: DEPLOYED_AT + 150 },
      { from: DEPLOYED_AT, to: DEPLOYED_AT + 50 }
    ])
  })

  it('reads the manager record, the authorization and the code at the pinned block', async () => {
    const { node, reads } = worldWith([])
    scriptState(node, {
      setupCommitment: `0x${'5a'.repeat(32)}`,
      setupNonce: 1n,
      setupCommittedAtBlock: DEPLOYED_AT + 20,
      attemptState: 1,
      attemptId: 3n,
      consumableAfter: 1_900_000_000
    })
    node.answerWith(ACTION, toFunctionSelector('isAuthorized(address)'), () =>
      encodeFunctionResult({
        abi: RECOVERY_ACTION_VIEWS_ABI,
        functionName: 'isAuthorized',
        result: true
      })
    )

    const state = await reads.stateOf(ACCOUNT, HEAD - 5)
    expect(state.attempt).toMatchObject({ state: 'Waiting', attemptId: 3n })
    expect(await reads.isAuthorized(ACCOUNT, HEAD - 5)).toBe(true)
    expect(node.calls.map(({ block }) => block)).toEqual([HEAD - 5, HEAD - 5])
    expect(await reads.hasCode(ACCOUNT, DEPLOYED_AT)).toBe(false)
    expect(await reads.hasCode(ACCOUNT, HEAD)).toBe(true)
  })

  it('reads a block time and decodes a payload in the action layout', async () => {
    const { node, reads } = worldWith([])
    node.provider.block.mockResolvedValueOnce({ number: 42, timestamp: 1_700_000_000, hash: '0x' })

    expect(await reads.blockTime(42)).toBe(1_700_000_000)
    expect(node.provider.block).toHaveBeenCalledWith(42)
    expect(reads.handoverOf(handoverTo(NEW_KEY))?.newAuthority.toLowerCase()).toBe(
      NEW_KEY.toLowerCase()
    )
    expect(reads.handoverOf('0x12')).toBeUndefined()
  })
})
