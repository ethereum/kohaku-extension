import { createWorld, eachIt, expectThrown, isHex, membersOf, PASSWORD } from './harness'

describe('provider double', () => {
  it('sends nothing: it holds the four reads alone, and a prepared write passed to call lands nothing', async () => {
    const world = createWorld()
    const { provider } = world
    const callable = membersOf(provider).filter(
      (m) => typeof (provider as unknown as Record<string, unknown>)[m] === 'function'
    )
    expect(callable.sort()).toEqual(['block', 'call', 'chainId', 'logs'])

    const setup = await world.setupClient()
    const prepared = await setup.prepareCommitSetup(world.draft('private'), PASSWORD)
    const before = await provider.block('latest')
    const calls = prepared.kind === 'batch' ? prepared.calls : [prepared]
    await Promise.all(calls.map((c) => provider.call(c.target, c.data, world.account, 'latest')))
    expect(await provider.block('latest')).toEqual(before)
    const state = await setup.setupState()
    expect(state.hasSetup).toBe(false)
    expect(state.isAuthorized).toBe(false)
  })

  it('answers the descriptor’s chain and a block header', async () => {
    const world = createWorld()
    expect(await world.provider.chainId()).toBe(world.descriptor.chainId)
    const latest = await world.provider.block('latest')
    expect(typeof latest.number).toBe('number')
    expect(typeof latest.timestamp).toBe('number')
    expect(isHex(latest.hash)).toBe(true)
    expect(latest.number).toBeGreaterThanOrEqual(world.descriptor.deployedAt)
  })

  eachIt(['chainId', 'block', 'logs', 'call'] as const)(
    'throws a scripted %s failure',
    async (member) => {
      const world = createWorld()
      world.script.failRead(`provider.${member}`)
      const run = {
        chainId: () => world.provider.chainId(),
        block: () => world.provider.block('latest'),
        logs: () => world.provider.logs(world.events.accountFilter(), { from: 0, to: 1 }),
        call: () => world.provider.call(world.descriptor.manager, '0x', undefined, 'latest')
      }
      await expectThrown(run[member])
    }
  )
})
