import { addressOf, EventManagerDouble } from '@web/modules/social-recovery/sdk-doubles'
import { NOTIFICATION_KINDS, type Hex } from '@web/modules/social-recovery/sdk-interfaces'

import { createWorld, expectThrown, isAddress, isHex, upperCased, World } from './harness'

const everything = async (world: World, filter = world.events.accountFilter()) => {
  const at = await world.provider.block('latest')
  return world.events.fetch(filter, { from: world.descriptor.deployedAt, to: at.number })
}

const lower = (xs: string[]) => xs.map((x) => x.toLowerCase())

describe('event manager double', () => {
  it('returns the three filters as addresses and topics, no block range', () => {
    const world = createWorld()
    const { accountFilter, methodFilter, privilegeFilter } = {
      accountFilter: world.events.accountFilter(),
      methodFilter: world.events.methodFilter(),
      privilegeFilter: world.events.privilegeFilter()
    }
    ;[accountFilter, methodFilter, privilegeFilter].forEach((f) => {
      expect(Object.keys(f).sort()).toEqual(['addresses', 'topics'])
      f.addresses.forEach((a) => expect(isAddress(a)).toBe(true))
      expect(Array.isArray(f.topics)).toBe(true)
    })
    expect(lower(accountFilter.addresses)).toEqual([world.descriptor.manager.toLowerCase()])
    expect(lower(privilegeFilter.addresses)).toEqual([world.account.toLowerCase()])
    expect(lower(methodFilter.addresses)).toEqual(
      expect.arrayContaining(
        lower([
          world.descriptor.methodEcdsa,
          world.descriptor.methodPasskey,
          world.descriptor.methodAadhaar,
          world.descriptor.methodZkpassport
        ])
      )
    )
    const wide = world.events.accountFilter({ anyAction: true })
    // The one option leaves the action topic open.
    expect(wide.topics).toContain(null)
    expect(accountFilter.topics).not.toContain(null)
    expect(wide.topics.length).toBe(accountFilter.topics.length)
  })

  it('names each method module once in the method filter, under the spelling first given', () => {
    const world = createWorld()
    const d = world.descriptor
    const extra = addressOf('third-party-method')
    const events = new EventManagerDouble(world.chain, world.provider, [
      upperCased(d.methodPasskey),
      extra,
      upperCased(extra)
    ])
    expect(events.methodFilter().addresses).toEqual([
      d.methodEcdsa,
      d.methodPasskey,
      d.methodAadhaar,
      d.methodZkpassport,
      extra
    ])
  })

  it('fetches a module’s logs where it was registered in another letter case than its logs carry', async () => {
    const world = createWorld()
    const module = addressOf('third-party-method')
    const keys: Hex[] = [`0x${'22'.repeat(32)}`]
    world.script.keysUpdated(module, keys)
    const events = new EventManagerDouble(world.chain, world.provider, [upperCased(module)])
    const at = await world.provider.block('latest')
    const notes = await events.fetch(events.methodFilter(), {
      from: world.descriptor.deployedAt,
      to: at.number
    })
    const updated = notes.filter((n) => n.kind === 'method-keys-updated')
    expect(updated).toHaveLength(1)
    expect(updated[0]).toMatchObject({ method: module, current: keys })
  })

  it('serves SetupCommitted for a committed setup, in log order with a position', async () => {
    const world = createWorld()
    world.script.setupCommitted('private')
    const notes = await everything(world)
    notes.forEach((n) => {
      expect(NOTIFICATION_KINDS).toContain(n.kind)
      expect(typeof n.at.blockNumber).toBe('number')
      expect(typeof n.at.logIndex).toBe('number')
      expect(isHex(n.at.blockHash)).toBe(true)
    })
    const order = notes.map((n) => [n.at.blockNumber, n.at.logIndex] as const)
    order.forEach(
      ([b, i], k) =>
        k > 0 &&
        expect(b > order[k - 1]![0] || (b === order[k - 1]![0] && i > order[k - 1]![1])).toBe(true)
    )
    expect(notes.some((n) => n.kind === 'setup-committed')).toBe(true)
  })

  it('serves AttemptStarted for a pending attempt', async () => {
    const world = createWorld()
    world.script.setupCommitted('private')
    world.script.attempt('pending')
    const state = await world.manager.stateOf()
    const started = (await everything(world)).filter((n) => n.kind === 'attempt-started')
    expect(started).toHaveLength(1)
    const [note] = started
    if (note?.kind !== 'attempt-started') throw new Error('no opening notification')
    expect(note.attemptId).toBe(state.attempt.attemptId)
    expect(note.consumableAfter).toBe(state.attempt.consumableAfter)
    expect(isHex(note.payload)).toBe(true)
  })

  it('serves AttemptCancelled for a cancelled attempt', async () => {
    const world = createWorld()
    world.script.setupCommitted('private')
    world.script.attempt('cancelled', 'account')
    const cancelled = (await everything(world)).filter((n) => n.kind === 'attempt-cancelled')
    expect(cancelled).toHaveLength(1)
  })

  it('serves AttemptConsumed for an executed attempt', async () => {
    const world = createWorld()
    world.script.setupCommitted('private')
    world.script.attempt('executed')
    const kinds = (await everything(world)).map((n) => n.kind)
    expect(kinds).toContain('attempt-started')
    expect(kinds).toContain('attempt-consumed')
  })

  it('serves TrustedKeysUpdated through the method filter', async () => {
    const world = createWorld()
    const keys: Hex[] = [`0x${'11'.repeat(32)}`]
    world.script.keysUpdated(world.descriptor.methodZkpassport, keys)
    const notes = await everything(world, world.events.methodFilter())
    const updated = notes.find((n) => n.kind === 'method-keys-updated')
    if (updated?.kind !== 'method-keys-updated') throw new Error('no key update')
    expect(updated.method.toLowerCase()).toBe(world.descriptor.methodZkpassport.toLowerCase())
    expect(updated.current).toEqual(keys)
  })

  it('decodes a raw log it owns and returns undefined for one it does not', async () => {
    const world = createWorld()
    world.script.setupCommitted('private')
    const at = await world.provider.block('latest')
    const logs = await world.provider.logs(world.events.accountFilter(), {
      from: world.descriptor.deployedAt,
      to: at.number
    })
    expect(logs.length).toBeGreaterThan(0)
    expect(world.events.decodeLog(logs[0]!)?.kind).toBe('setup-committed')
    expect(
      world.events.decodeLog({ ...logs[0]!, address: '0x000000000000000000000000000000000000dEaD' })
    ).toBeUndefined()
  })

  it('throws a failed read rather than answering an empty stream', async () => {
    const world = createWorld()
    world.script.setupNone()
    expect(await everything(world)).toEqual([])
    world.script.failRead('events.fetch')
    await expectThrown(() => everything(world))
  })
})
