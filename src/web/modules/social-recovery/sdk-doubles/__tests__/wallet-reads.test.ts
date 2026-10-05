/**
 * The three wallet reads the extension owns beside the SDK: the verify of a
 * pasted reply, the key a recovery would remove, and the fit check against the
 * code the account will carry.
 */
import type {
  Address,
  ApproverReply,
  CreationRecord,
  Verdict
} from '@web/modules/social-recovery/sdk-interfaces'

import { createWorld, eachIt, expectThrown, fillAll, openRecovery } from './harness'

const CREATION: CreationRecord = {
  factory: '0x00000000000000000000000000000000000000fa',
  bytecode: '0x60',
  salt: `0x${'00'.repeat(32)}`,
  block: 950
}

describe('wallet reads double', () => {
  describe('verifyReply', () => {
    it('satisfies a pasted reply that proves the request and rejects one that does not', async () => {
      const opened = await openRecovery()
      const filled = await fillAll(opened)
      const request = opened.requests[0]!
      const reply = filled.replies.find((r) => r.place === request.place)!
      const reads = opened.world.walletReads()
      const good: Verdict = await reads.verifyReply(request, reply)
      expect(good).toBe('satisfied')
      const forged = { ...reply, proof: `0x${'ab'.repeat(65)}` as const }
      expect(await reads.verifyReply(request, forged)).toBe('rejected')
    })
  })

  describe('verifyReply on malformed input', () => {
    eachIt([
      ['an empty object', {}],
      ['null', null],
      ['a reply with no proof', { kind: 'recovery-proof-reply', version: 1, place: 0 }]
    ] as const)('answers %s as rejected, without throwing', async (sample) => {
      const opened = await openRecovery()
      const request = opened.requests[0]!
      const pasted = sample[1] as unknown as ApproverReply
      let answer: unknown
      await expect(
        (async () => {
          answer = await opened.world.walletReads().verifyReply(request, pasted)
        })()
      ).resolves.toBeUndefined()
      // A verdict is an answer, never a refusal: malformed input is rejected.
      expect(answer).toBe('rejected')
    })
  })

  describe('removedKey', () => {
    it('names the one key where the configuration carries a creation record', async () => {
      const world = createWorld()
      expect(await world.walletReads({ creation: CREATION }).removedKey()).toEqual({
        kind: 'named',
        key: world.keys.held
      })
    })

    it('says why it names none without a creation record', async () => {
      expect(await createWorld().walletReads().removedKey()).toEqual({
        kind: 'unavailable',
        cause: 'no-creation-record'
      })
    })

    it('says why it names none where several keys hold a key value', async () => {
      const world = createWorld()
      world.chain.setAuthorities([world.keys.held, world.keys.fresh])
      expect(await world.walletReads({ creation: CREATION }).removedKey()).toEqual({
        kind: 'unavailable',
        cause: 'several-key-entries'
      })
    })
  })

  describe('fitCheck', () => {
    it('judges deployed code by supportsAccount', async () => {
      const world = createWorld()
      world.script.code(true)
      expect(await world.walletReads().fitCheck()).toEqual({ basis: 'deployed-code', fits: true })
    })

    it('judges an account with no code by the implementation it will carry', async () => {
      const world = createWorld()
      world.script.code(false)
      const served = world.descriptor.servedImplementation
      const other: Address = '0x00000000000000000000000000000000000000bb'
      const reads = world.walletReads()
      expect(await reads.fitCheck(served)).toEqual({
        basis: 'code-to-be',
        implementation: served,
        fits: true
      })
      expect(await reads.fitCheck(other)).toEqual({
        basis: 'code-to-be',
        implementation: other,
        fits: false
      })
      expect(await reads.fitCheck()).toEqual({ basis: 'no-code', fits: false })
    })
  })

  eachIt(['verifyReply', 'removedKey', 'fitCheck'] as const)(
    'throws a scripted %s read failure',
    async (member) => {
      const opened = await openRecovery()
      const request = opened.requests[0]!
      const filled = await fillAll(opened)
      const reply = filled.replies.find((r) => r.place === request.place)!
      opened.world.script.failRead(`walletReads.${member}`)
      const reads = opened.world.walletReads({ creation: CREATION })
      const run = {
        verifyReply: () => reads.verifyReply(request, reply),
        removedKey: () => reads.removedKey(),
        fitCheck: () => reads.fitCheck()
      }
      await expectThrown(run[member])
    }
  )
})
