/**
 * An account the wallet does not list carries no creation record. Where it
 * holds code, the doubles read its key from the deployed privilege table, as
 * the SDK reads the chain; only an account with neither a creation record nor
 * code leaves the key unnamed for that reason. The same inference names the
 * removed key of a gathering and of the recovery state record.
 */
import { isAddressEqual } from 'viem'

import type {
  Address,
  Finding,
  ValidationRefusal
} from '@web/modules/social-recovery/sdk-interfaces'

import {
  createWorld,
  expectThrown,
  NO_PAYMENT,
  WINDOW,
  World
} from '@web/modules/social-recovery/sdk-doubles/__tests__/harness'

const SECOND_KEY: Address = '0x00000000000000000000000000000000000000c2'

const openWithNoRemovedKey = async (world: World) => {
  world.script.setupCommitted('private')
  world.script.authorized(true)
  const recovery = await world.recoveryClient()
  const gathering = await recovery.initRecoveryGathering(
    world.configuration,
    { newAuthority: world.keys.fresh },
    NO_PAYMENT,
    { window: WINDOW }
  )
  return { recovery, gathering }
}

const removedUnknownOf = async (world: World): Promise<Finding | undefined> => {
  const refusal = (await expectThrown(() => openWithNoRemovedKey(world))) as ValidationRefusal
  return refusal.findings.errors.find((f) => f.code === 'handover.removed-unknown')
}

describe('the wallet reads of a deployed account with no creation record', () => {
  it('name its one authority as the removed key and judge it recoverable', async () => {
    const world = createWorld()
    const reads = world.walletReads()
    await expect(reads.removedKey()).resolves.toEqual({ kind: 'named', key: world.keys.held })
    await expect(reads.fitCheck()).resolves.toEqual({ basis: 'deployed-code', fits: true })
  })

  it('refuse to name a key where two authorities hold a key value', async () => {
    const world = createWorld()
    world.chain.setAuthorities([world.keys.held, SECOND_KEY])
    await expect(world.walletReads().removedKey()).resolves.toEqual({
      kind: 'unavailable',
      cause: 'several-key-entries'
    })
  })

  it('name no key where no authority is left', async () => {
    const world = createWorld()
    world.chain.setAuthorities([])
    await expect(world.walletReads().removedKey()).resolves.toEqual({
      kind: 'unavailable',
      cause: 'no-key-entry'
    })
  })

  it('judge a deployed account the action does not support as not recoverable', async () => {
    const world = createWorld({ supportsAccount: false })
    await expect(world.walletReads().fitCheck()).resolves.toEqual({
      basis: 'deployed-code',
      fits: false
    })
  })
})

describe('the wallet reads of an account with no creation record and no code', () => {
  it('name no key for want of a creation record, and find no code to judge', async () => {
    const world = createWorld({ hasCode: false })
    const reads = world.walletReads()
    await expect(reads.removedKey()).resolves.toEqual({
      kind: 'unavailable',
      cause: 'no-creation-record'
    })
    await expect(reads.fitCheck()).resolves.toEqual({ basis: 'no-code', fits: false })
  })
})

describe('a failed wallet read of an account with no creation record', () => {
  const members = ['removedKey', 'fitCheck'] as const
  members.forEach((member) =>
    it(`throws for ${member}, never answering a refusal`, async () => {
      const world = createWorld()
      world.script.failRead(`walletReads.${member}`)
      const reads = world.walletReads()
      await expectThrown(() => (member === 'removedKey' ? reads.removedKey() : reads.fitCheck()))
    })
  )
})

describe('the gathering and the state record of an account with no creation record', () => {
  it("take the deployed account's one authority as the removed key", async () => {
    const world = createWorld()
    const { recovery, gathering } = await openWithNoRemovedKey(world)
    const { newAuthority, removedAuthority } = world.codec.decode(gathering.request.payload!)
    expect(isAddressEqual(newAuthority, world.keys.fresh)).toBe(true)
    expect(isAddressEqual(removedAuthority, world.keys.held)).toBe(true)
    expect((await recovery.recoveryState()).removedKey).toBe(world.keys.held)
  })

  it('refuse the gathering and name no state key where two authorities hold a key value', async () => {
    const world = createWorld()
    world.chain.setAuthorities([world.keys.held, SECOND_KEY])
    expect((await removedUnknownOf(world))?.values).toMatchObject({
      creationTriple: false,
      cause: 'several-key-entries'
    })
    expect((await (await world.recoveryClient()).recoveryState()).removedKey).toBe(
      'no-creation-triple'
    )
  })

  it('refuse the gathering for want of a creation record where the account has no code', async () => {
    const world = createWorld({ hasCode: false })
    expect((await removedUnknownOf(world))?.values).toMatchObject({
      creationTriple: false,
      cause: 'no-creation-record'
    })
  })
})
