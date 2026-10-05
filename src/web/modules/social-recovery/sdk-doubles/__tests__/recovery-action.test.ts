import type { ValidationRefusal } from '@web/modules/social-recovery/sdk-interfaces'

import { createWorld, eachIt, expectThrown, isHex } from './harness'

describe('recovery action double', () => {
  it('answers supportsAccount from whether the account holds code', async () => {
    const world = createWorld()
    world.script.code(true)
    expect(await world.actionPart.supportsAccount()).toBe(true)
    world.script.code(false)
    expect(await world.actionPart.supportsAccount()).toBe(false)
  })

  it('answers isAuthorized from the scripted authorization', async () => {
    const world = createWorld()
    world.script.authorized(true)
    expect(await world.actionPart.isAuthorized()).toBe(true)
    world.script.authorized(false)
    expect(await world.actionPart.isAuthorized()).toBe(false)
  })

  it('answers isAuthority and holdsAnyPrivilege for a held key and a fresh address', async () => {
    const world = createWorld()
    expect(await world.actionPart.isAuthority(world.keys.held)).toBe(true)
    expect(await world.actionPart.isAuthority(world.keys.fresh)).toBe(false)
    expect(await world.actionPart.holdsAnyPrivilege(world.keys.held)).toBe(true)
    expect(await world.actionPart.holdsAnyPrivilege(world.keys.fresh)).toBe(false)
  })

  it('answers actionInfo with the scripted name, version and interface answer', async () => {
    const world = createWorld()
    expect(await world.actionPart.actionInfo()).toEqual(world.chain.actionInfo)
    world.chain.actionInfo = { name: 'OtherAction', version: '7', supportsInterface: false }
    const scripted = { name: 'OtherAction', version: '7', supportsInterface: false }
    expect(await world.actionPart.actionInfo()).toEqual(scripted)
    expect(await (await world.builder().recoveryAction()).actionInfo()).toEqual(scripted)
  })

  it('prepares the arming and the disarming write on the account, sent by the account', async () => {
    const world = createWorld()
    const arming = await world.actionPart.armingCall()
    const disarming = await world.actionPart.disarmingCall()
    ;[arming, disarming].forEach((call) => {
      expect(call.kind).toBe('call')
      expect(call.sender).toBe('account')
      expect(call.target.toLowerCase()).toBe(world.account.toLowerCase())
      expect(isHex(call.data)).toBe(true)
    })
    expect(arming.data).not.toBe(disarming.data)
  })

  eachIt(['supportsAccount', 'isAuthorized', 'actionInfo'] as const)(
    'throws a scripted %s read failure',
    async (member) => {
      const world = createWorld()
      world.script.failRead(`action.${member}`)
      await expectThrown(() => world.actionPart[member]())
    }
  )

  eachIt(['isAuthority', 'holdsAnyPrivilege'] as const)(
    'throws a scripted %s read failure',
    async (member) => {
      const world = createWorld()
      world.script.failRead(`action.${member}`)
      await expectThrown(() => world.actionPart[member](world.keys.held))
    }
  )

  eachIt(['armingCall', 'disarmingCall'] as const)(
    'throws %s with the scripted code',
    async (member) => {
      const world = createWorld()
      world.script.refuse(`action.${member}`, 'action.unsupported')
      const error = (await expectThrown(() => world.actionPart[member]())) as ValidationRefusal
      expect(error.findings.errors.map((f) => f.code)).toContain('action.unsupported')
    }
  )
})
