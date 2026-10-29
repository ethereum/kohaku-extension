/**
 * @jest-environment jsdom
 *
 * A live gathering read by a page whose fake node starts afresh: the node
 * answers setup nonce zero, below the one the request was built under. The
 * poll reads that answer as a failed read with its retry, and the gathering,
 * its replies and its pending submission stay as stored.
 */
import type {
  ClaimCase,
  Mounted
} from '@web/modules/social-recovery/recovery/checklist/__tests__/harness'
import {
  ACCOUNT,
  CHAIN_ID,
  depsOf,
  fakeKit,
  gatheringOf,
  MIXED_PATH,
  mountChecklist,
  seedCache,
  seedEntry,
  seedSession,
  settle,
  storedSession,
  testRecords,
  withReplies
} from '@web/modules/social-recovery/recovery/checklist/__tests__/harness'
import { createWorld } from '@web/modules/social-recovery/shared/client/__tests__/harness'

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const {
  buildRecoveryClient
}: typeof import('@web/modules/social-recovery/shared/client') = require('@web/modules/social-recovery/shared/client')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

describe('a live gathering over a fake node that starts afresh', () => {
  let view: Mounted | undefined

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  const cases: ClaimCase[] = [
    { name: 'with no submission pending', claimed: false },
    { name: 'with a submission pending', claimed: true }
  ]
  cases.forEach(({ name, claimed }) => {
    it(`keeps the gathering and reads the poll as failed, ${name}`, async () => {
      const world = testRecords()
      await seedEntry(world.records)
      await seedCache(world.records, MIXED_PATH)
      await seedSession(world.records, withReplies(gatheringOf(MIXED_PATH), [0, 1, 2, 3]))
      if (claimed) {
        const session = world.records.recoverySession(CHAIN_ID, ACCOUNT)
        const read = await session.read()
        if (read.status !== 'present') {
          throw new Error('no session seeded')
        }
        await session.claimSubmission(
          { requestId: 'submit-request', startBlock: 1000, claimedAt: Date.now() },
          read.revision
        )
      }
      const before = await storedSession(world.records)
      const client = await buildRecoveryClient(
        createWorld({ account: ACCOUNT, chain: 'sepolia' }).config
      )
      // The rows are assessed as the harness's gatherings are; every chain read is the node's.
      jest.spyOn(client.recovery, 'assess').mockImplementation(fakeKit(MIXED_PATH).assess)

      view = await mountChecklist({
        records: world.records,
        client: { status: 'ready', client },
        deps: depsOf()
      })
      await settle(500)

      const after = await storedSession(world.records)
      expect(after?.value.state).toBe('live')
      expect(after).toEqual(before)
      expect(view.byTestId('checklist-poll-failed')).not.toBeNull()
      expect(view.byTestId('checklist-wiped-title')).toBeNull()
    })
  })
})
