/**
 * @jest-environment jsdom
 *
 * The done screen over a client built on a fake node, as on a chain with no
 * deployment: the consume block's time is the node's block's, read through
 * the provider the client reads, and the extension's own provider is never
 * read.
 */
import {
  mockWallet,
  mountDone,
  NEW_KEY,
  openWorld,
  REMOVED_KEY,
  t,
  useDoneClock
} from '@web/modules/social-recovery/recovery/done/__tests__/harness'
import { dateOf } from '@web/modules/social-recovery/recovery/checklist'
import {
  addressBookOf,
  buildRecoveryClient,
  descriptorOf
} from '@web/modules/social-recovery/shared/client'
import { sdkStandIn } from '@web/modules/social-recovery/shared/client/stand-in'

jest.mock('@web/modules/social-recovery/shared/client/deployment-env', () => ({
  ...jest.requireActual('@web/modules/social-recovery/shared/client/deployment-env'),
  sepoliaDeploymentVariable: () => undefined
}))

useDoneClock()

const lead = (seconds: number) =>
  t('socialRecovery.done.lead', {
    date: dateOf(seconds * 1000, Intl.DateTimeFormat().resolvedOptions().timeZone)
  })

describe('the done screen on a fake node', () => {
  it('dates the recovery by the node block of the consume, with no read of the extension provider', async () => {
    const world = await openWorld({ route: 'logged-in', countdown: false, listed: true })
    sdkStandIn.reset()
    const addressBook = addressBookOf('sepolia')
    const descriptor = descriptorOf('sepolia', addressBook)
    const node = sdkStandIn.nodeFor(descriptor, world.account, { authorities: [REMOVED_KEY] })
    node.setAuthorized(true)
    await node.commitSetup(world.configuration, { backup: 'clear', publicMetadata: '0x' })
    node.openAttempt({
      handover: { newAuthority: NEW_KEY, removedAuthority: REMOVED_KEY },
      usedPlaces: [0n],
      usedMethods: [descriptor.methodEcdsa]
    })
    node.consume()
    const consumed = node.head
    node.mine()
    const client = await buildRecoveryClient({
      chain: 'sepolia',
      account: world.account,
      addressBook,
      provider: sdkStandIn.providerFor(node)
    })
    mockWallet.clients.set(world.account.toLowerCase(), { status: 'ready', client })

    const screen = await mountDone(world.account)

    expect(screen.has('done')).toBe(true)
    expect(screen.textOf('done-lead')).toBe(lead(consumed.timestamp))
    expect(mockWallet.extensionBlockReads).toEqual([])
    screen.unmount()
  })
})
