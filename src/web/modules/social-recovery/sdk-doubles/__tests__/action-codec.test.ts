import type { Handover } from '@web/modules/social-recovery/sdk-interfaces'

import { createWorld, isHex } from './harness'

describe('action codec double', () => {
  it('serves the descriptor’s action', () => {
    const world = createWorld()
    expect(world.codec.actions.map((a) => a.toLowerCase())).toContain(
      world.descriptor.action.toLowerCase()
    )
  })

  it('round-trips a handover', () => {
    const world = createWorld()
    const handover: Handover = { newAuthority: world.keys.fresh, removedAuthority: world.keys.held }
    const payload = world.codec.encode(handover)
    expect(isHex(payload)).toBe(true)
    const decoded = world.codec.decode(payload) as Handover
    expect(decoded.newAuthority.toLowerCase()).toBe(handover.newAuthority.toLowerCase())
    expect(decoded.removedAuthority.toLowerCase()).toBe(handover.removedAuthority.toLowerCase())
  })

  it('refuses bytes its encoder would not reproduce', () => {
    const world = createWorld()
    const payload = world.codec.encode({
      newAuthority: world.keys.fresh,
      removedAuthority: world.keys.held
    })
    expect(() => world.codec.decode('0x1234')).toThrow()
    expect(() => world.codec.decode(`${payload}00` as const)).toThrow()
  })
})
