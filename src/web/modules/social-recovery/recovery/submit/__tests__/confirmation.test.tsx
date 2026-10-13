/**
 * @jest-environment jsdom
 *
 * The confirmation as the recoverer reads it before anything is sent: the
 * three values of the lead in full, verify the details, the verify again of
 * every approval the submission carries, and Start recovery locked until all
 * of them rendered.
 */
import type { Key } from '@ambire-common/interfaces/keystore'
import type { Mounted, World } from '@web/modules/social-recovery/recovery/submit/__tests__/harness'
import {
  configurationOf,
  factsOf,
  GUARDIANS,
  guardianCredential,
  MIXED_PATH,
  mountSubmit,
  mockWallet,
  notServed,
  openWorld,
  passkeyCredential,
  passportCredential,
  readyFacts,
  REMOVED,
  settle,
  t
} from '@web/modules/social-recovery/recovery/submit/__tests__/harness'
import { deferred } from '@web/modules/social-recovery/shared/chrome/__fixtures__/deferred'

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const { getAddress }: typeof import('viem') = require('viem')
const {
  renderWait
}: typeof import('@web/modules/social-recovery/setup/review') = require('@web/modules/social-recovery/setup/review')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const SUBMIT = 'socialRecovery.submit'

describe('the submission confirmation', () => {
  let view: Mounted | undefined

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  const open = async (world: World) => {
    view = await mountSubmit(world.account)
    return view
  }

  const openDetails = async (mounted: Mounted) => {
    await mounted.press('submit-verify-details')
  }

  describe('the lead', () => {
    it('shows the account, the new key and the key being removed, each in full', async () => {
      const world = await openWorld()
      const mounted = await open(world)
      expect(mounted.textOf('submit-account-address')).toBe(getAddress(world.account))
      expect(mounted.textOf('submit-new-key')).toBe(getAddress(world.newKey))
      expect(mounted.textOf('submit-removed-key')).toBe(getAddress(REMOVED))
      expect(mounted.textOf('submit-removed-key-line')).toBe(
        t('socialRecovery.display.asThisWalletRead')
      )
    })

    it('puts the name caveat beside a name the public name service resolves', async () => {
      const world = await openWorld()
      mockWallet.ens = 'alice.eth'
      const mounted = await open(world)
      expect(mounted.textOf('submit-account-name')).toBe(
        t(`${SUBMIT}.keepsAddressNamed`, { name: 'alice.eth' })
      )
      expect(mounted.textOf('submit-account-caveat')).toBe(t('socialRecovery.display.nameCaveat'))
    })

    it('says only that the account keeps its address where no name resolves', async () => {
      const world = await openWorld()
      const mounted = await open(world)
      expect(mounted.textOf('submit-account-name')).toBe(t(`${SUBMIT}.keepsAddress`))
      expect(mounted.byTestId('submit-account-caveat')).toBeNull()
    })

    it('names the new key as the receiving account’s key on the logged-in route', async () => {
      const world = await openWorld({ route: 'logged-in' })
      const mounted = await open(world)
      expect(mounted.textOf('submit-new-key-line')).toBe(
        t(`${SUBMIT}.newKeyLoggedIn`, { account: 'Travel wallet' })
      )
    })

    it('names the new key as the key this wallet created on the fresh install', async () => {
      const world = await openWorld({ route: 'fresh-install' })
      const mounted = await open(world)
      expect(mounted.textOf('submit-new-key-line')).toBe(t(`${SUBMIT}.newKeyFastTrack`))
    })

    it('counts the fifth of five stages on the logged-in route, under the settings chrome', async () => {
      const world = await openWorld({ route: 'logged-in' })
      const mounted = await open(world)
      expect(mounted.byTestId('setup-chrome')).not.toBeNull()
      expect(mounted.textOf('submit-stage')).toBe(
        t('socialRecovery.entry.stageCounter', { step: 5, total: 5 })
      )
    })

    it('counts no stage on the fresh install, under the plain header', async () => {
      const world = await openWorld({ route: 'fresh-install' })
      const mounted = await open(world)
      expect(mounted.byTestId('plain-chrome')).not.toBeNull()
      expect(mounted.byTestId('submit-stage')).toBeNull()
    })
  })

  describe('verify the details', () => {
    it('stays closed until the recoverer opens it', async () => {
      const world = await openWorld()
      const mounted = await open(world)
      expect(mounted.byTestId('submit-payment')).toBeNull()
      await openDetails(mounted)
      expect(mounted.byTestId('submit-payment')).not.toBeNull()
    })

    it('says the recovery names no payment and that the recoverer’s own key pays', async () => {
      const world = await openWorld()
      const mounted = await open(world)
      await openDetails(mounted)
      expect(mounted.textOf('submit-no-payment')).toBe(t(`${SUBMIT}.noPayment`))
      expect(mounted.textOf('submit-own-key-pays')).toBe(t(`${SUBMIT}.ownKeyPays`))
    })

    it('gives the waiting period as a duration and never as an end date', async () => {
      const world = await openWorld()
      const mounted = await open(world)
      await openDetails(mounted)
      expect(mounted.textOf('submit-waiting-period')).toBe(
        t(`${SUBMIT}.waitingPeriod`, { duration: renderWait(MIXED_PATH.wait, t) })
      )
      const details = mounted.textOf('submit-details')
      expect(details).not.toMatch(/20[0-9]{2}/)
      expect(details).not.toMatch(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/)
    })

    it('says the account’s own key can cancel during the wait', async () => {
      const world = await openWorld()
      const mounted = await open(world)
      await openDetails(mounted)
      expect(mounted.textOf('submit-owner-can-cancel')).toBe(t(`${SUBMIT}.ownerCanCancel`))
    })

    const pathLines = (mounted: Mounted) =>
      mounted.allByTestId('submit-path-line').map((node) => node.textContent)

    it('reads one required method answered for a path of one method', async () => {
      const configuration = configurationOf([
        { threshold: 1, credentials: [passkeyCredential('Laptop passkey')] }
      ])
      const world = await openWorld({ configuration, replied: [0], chosen: [0] })
      const mounted = await open(world)
      await openDetails(mounted)
      expect(pathLines(mounted)).toEqual([t(`${SUBMIT}.path.oneRequired`)])
    })

    it('reads every required method answered for a path of several required methods', async () => {
      const configuration = configurationOf([
        { threshold: 1, credentials: [passkeyCredential('Laptop passkey')] },
        { threshold: 1, credentials: [guardianCredential(GUARDIANS[0])] }
      ])
      const world = await openWorld({ configuration, replied: [0, 1], chosen: [0, 1] })
      const mounted = await open(world)
      await openDetails(mounted)
      expect(pathLines(mounted)).toEqual([t(`${SUBMIT}.path.allRequired`)])
    })

    it('counts a group’s members the set carries, in the plural, and the rows not needed', async () => {
      const world = await openWorld({ replied: [0, 1, 2, 3, 4], chosen: [0, 1, 2, 3] })
      const mounted = await open(world)
      await openDetails(mounted)
      const group = t(`${SUBMIT}.path.groupAnswered`, { answered: 2, count: 3 })
      expect(group).toBe('2 of these 3 members answered.')
      expect(pathLines(mounted)).toEqual([
        t(`${SUBMIT}.path.allRequired`),
        group,
        t(`${SUBMIT}.path.othersNotNeeded`)
      ])
    })

    it('marks every row outside the set not needed and every row in it complete', async () => {
      const world = await openWorld({ replied: [0, 1, 2, 3, 4], chosen: [0, 1, 2, 3] })
      const mounted = await open(world)
      await openDetails(mounted)
      const path = mounted.textOf('submit-path')
      const notNeeded = t('socialRecovery.status.collection.notNeeded')
      expect(path.split(notNeeded)).toHaveLength(2)
      expect(path.split(t('socialRecovery.status.collection.complete'))).toHaveLength(5)
    })

    const publication = (mounted: Mounted) =>
      mounted.allByTestId('submit-publication-line').map((node) => node.textContent)

    it('names what the set’s methods publish, and the guardian outside the set', async () => {
      const world = await openWorld({ replied: [0, 1, 2, 3, 4], chosen: [0, 1, 2, 3] })
      const mounted = await open(world)
      await openDetails(mounted)
      const items = t('socialRecovery.disclosures.items.pair', {
        first: t(`${SUBMIT}.publication.items.passkey`),
        second: t(`${SUBMIT}.publication.items.guardianAddresses`)
      })
      expect(publication(mounted)).toEqual([
        t(`${SUBMIT}.publication.whole`),
        t(`${SUBMIT}.publication.used`, { items, count: 2 }),
        t(`${SUBMIT}.publication.unusedGuardians`),
        t(`${SUBMIT}.publication.shared`)
      ])
    })

    it('names a lone passkey in the singular and no unused guardian where none was left out', async () => {
      const configuration = configurationOf([
        { threshold: 1, credentials: [passkeyCredential('Laptop passkey')] }
      ])
      const world = await openWorld({ configuration, replied: [0], chosen: [0] })
      const mounted = await open(world)
      await openDetails(mounted)
      expect(publication(mounted)).toEqual([
        t(`${SUBMIT}.publication.whole`),
        t(`${SUBMIT}.publication.used`, {
          items: t(`${SUBMIT}.publication.items.passkey`),
          count: 1
        }),
        t(`${SUBMIT}.publication.shared`)
      ])
    })

    it('names the passport’s identifier where the set uses a passport', async () => {
      const configuration = configurationOf([{ threshold: 1, credentials: [passportCredential()] }])
      const world = await openWorld({ configuration, replied: [0], chosen: [0] })
      const mounted = await open(world)
      await openDetails(mounted)
      expect(publication(mounted)[1]).toBe(
        t(`${SUBMIT}.publication.used`, {
          items: t(`${SUBMIT}.publication.items.passport`),
          count: 1
        })
      )
    })

    it('says the new key then controls two accounts on the logged-in route', async () => {
      const world = await openWorld({ route: 'logged-in' })
      const mounted = await open(world)
      await openDetails(mounted)
      expect(mounted.textOf('submit-two-accounts')).toBe(
        t('socialRecovery.entry.owner.twoAccounts')
      )
    })

    it('says nothing of two accounts on the fresh install', async () => {
      const world = await openWorld({ route: 'fresh-install' })
      const mounted = await open(world)
      await openDetails(mounted)
      expect(mounted.byTestId('submit-two-accounts')).toBeNull()
      expect(mounted.text()).not.toContain(t('socialRecovery.entry.owner.twoAccounts'))
    })
  })

  describe('Start recovery', () => {
    it('unlocks once the values rendered and every approval of the set verified', async () => {
      const world = await openWorld()
      const mounted = await open(world)
      await openDetails(mounted)
      expect(mounted.textOf('submit-check-line')).toBe(t(`${SUBMIT}.checkLine`))
      expect(mounted.isDisabled('submit-action')).toBe(false)
      expect(mounted.byTestId('submit-unlock-reason')).toBeNull()
    })

    it('stays locked with its reason until verify the details opened once, though every approval verified', async () => {
      const world = await openWorld()
      const mounted = await open(world)
      expect(mounted.textOf('submit-check-line')).toBe(t(`${SUBMIT}.checkLine`))
      expect(mounted.isDisabled('submit-action')).toBe(true)
      expect(mounted.textOf('submit-unlock-reason')).toBe(t(`${SUBMIT}.unlockReason`))
      await openDetails(mounted)
      expect(mounted.isDisabled('submit-action')).toBe(false)
      await openDetails(mounted)
      expect(mounted.byTestId('submit-payment')).toBeNull()
      expect(mounted.isDisabled('submit-action')).toBe(false)
    })

    it('verifies the replies of the set the submission carries, each against its own request', async () => {
      const world = await openWorld({ replied: [0, 1, 2, 3, 4], chosen: [0, 1, 2, 3] })
      await open(world)
      const verified = world.kit.verifyReply.mock.calls.map(([request, reply]) => [
        request.place,
        reply.place
      ])
      expect(verified).toEqual([
        [0, 0],
        [1, 1],
        [2, 2],
        [3, 3]
      ])
    })

    it('stays locked with its reason while the verify runs', async () => {
      const world = await openWorld()
      const verdicts = deferred<'satisfied'>()
      world.kit.verifyReply.mockImplementation(() => verdicts.promise)
      const mounted = await open(world)
      await openDetails(mounted)
      expect(mounted.textOf('submit-checking')).toBe(t(`${SUBMIT}.checking`))
      expect(mounted.isDisabled('submit-action')).toBe(true)
      expect(mounted.textOf('submit-unlock-reason')).toBe(t(`${SUBMIT}.unlockReason`))
      verdicts.resolve('satisfied')
      await settle()
      expect(mounted.isDisabled('submit-action')).toBe(false)
    })

    it('stays locked while the key being removed is not read yet', async () => {
      const world = await openWorld()
      const removed = deferred<{ kind: 'named'; key: string }>()
      world.kit.removedKey.mockImplementation(() => removed.promise)
      const mounted = await open(world)
      await openDetails(mounted)
      expect(mounted.byTestId('submit-removed-key-loading')).not.toBeNull()
      expect(mounted.isDisabled('submit-action')).toBe(true)
      removed.resolve({ kind: 'named', key: REMOVED })
      await settle()
      expect(mounted.isDisabled('submit-action')).toBe(false)
    })

    it('stays locked where the key being removed could not be read, with a retry', async () => {
      const world = await openWorld()
      world.kit.removedKey.mockRejectedValueOnce(new Error('node down'))
      const mounted = await open(world)
      await openDetails(mounted)
      expect(mounted.byTestId('submit-removed-key-failed')).not.toBeNull()
      expect(mounted.isDisabled('submit-action')).toBe(true)
      await mounted.press('submit-removed-key-retry')
      expect(mounted.textOf('submit-removed-key')).toBe(getAddress(REMOVED))
      expect(mounted.isDisabled('submit-action')).toBe(false)
    })

    it('stays locked for a request that names a payment', async () => {
      const world = await openWorld({ order: { amount: '5' } })
      const mounted = await open(world)
      await openDetails(mounted)
      expect(mounted.byTestId('submit-check-line')).not.toBeNull()
      expect(mounted.isDisabled('submit-action')).toBe(true)
    })

    it('names the row whose approval did not verify and stays locked', async () => {
      const world = await openWorld()
      world.kit.verifyReply.mockImplementation(async (request: { place: number }) =>
        request.place === 0 ? 'rejected' : 'satisfied'
      )
      const mounted = await open(world)
      await openDetails(mounted)
      expect(mounted.textOf('submit-not-verified')).toContain(
        t(`${SUBMIT}.approvalNotVerified`, { row: 'Laptop passkey' })
      )
      expect(mounted.isDisabled('submit-action')).toBe(true)
      expect(mounted.byTestId('submit-check-line')).toBeNull()
    })

    it('reads check failed with a retry where a verify throws, and unlocks once the retry verifies', async () => {
      const world = await openWorld()
      world.kit.verifyReply.mockRejectedValueOnce(new Error('node down'))
      const mounted = await open(world)
      await openDetails(mounted)
      expect(mounted.textOf('submit-check-failed')).toContain(t(`${SUBMIT}.checkFailed`))
      expect(mounted.isDisabled('submit-action')).toBe(true)
      await mounted.press('submit-check-retry')
      expect(mounted.byTestId('submit-check-failed')).toBeNull()
      expect(mounted.isDisabled('submit-action')).toBe(false)
    })

    it('reads check failed and stays locked where the client refuses the verify', async () => {
      const world = await openWorld()
      world.kit.verifyReply.mockRejectedValue(notServed('walletReads.verifyReply'))
      const mounted = await open(world)
      await openDetails(mounted)
      expect(mounted.textOf('submit-check-failed')).toContain(t(`${SUBMIT}.checkFailed`))
      expect(mounted.isDisabled('submit-action')).toBe(true)
      expect(mounted.byTestId('submit-check-line')).toBeNull()
    })
  })

  describe('the sending key', () => {
    it('reads the wallet unreachable with a retry where the receiving account’s facts could not be read', async () => {
      const world = await openWorld()
      const retry = jest.fn()
      mockWallet.facts = { status: 'unavailable', cause: 'state-unread', retry }
      const mounted = await open(world)
      await openDetails(mounted)
      expect(mounted.textOf('submit-sending-failed')).toContain(
        t('socialRecovery.client.unavailableTitle')
      )
      expect(mounted.textOf('submit-sending-failed')).toContain(
        t('socialRecovery.client.unavailableBody')
      )
      expect(mounted.text()).not.toContain(t(`${SUBMIT}.noSendingKey`))
      expect(mounted.isDisabled('submit-action')).toBe(true)
      await mounted.press('submit-sending-retry')
      expect(retry).toHaveBeenCalledTimes(1)
      expect(world.port.sendAccountBatch).not.toHaveBeenCalled()
    })

    it('says no key can send where the wallet does not list the receiving account, with no retry', async () => {
      const world = await openWorld()
      mockWallet.facts = { status: 'unavailable', cause: 'not-listed', retry: jest.fn() }
      const mounted = await open(world)
      await openDetails(mounted)
      expect(mounted.textOf('submit-sending-unavailable')).toBe(t(`${SUBMIT}.noSendingKey`))
      expect(mounted.byTestId('submit-sending-failed')).toBeNull()
      expect(mounted.byTestId('submit-sending-retry')).toBeNull()
      expect(mounted.isDisabled('submit-action')).toBe(true)
    })

    it('says no key can send where the wallet holds no key of the receiving account, with no retry', async () => {
      const world = await openWorld()
      mockWallet.facts = readyFacts(factsOf(world.receiving))
      const mounted = await open(world)
      await openDetails(mounted)
      expect(mounted.textOf('submit-sending-unavailable')).toBe(t(`${SUBMIT}.noSendingKey`))
      expect(mounted.byTestId('submit-sending-failed')).toBeNull()
      expect(mounted.byTestId('submit-sending-retry')).toBeNull()
      expect(mounted.isDisabled('submit-action')).toBe(true)
      await mounted.press('submit-action')
      expect(world.port.sendAccountBatch).not.toHaveBeenCalled()
      expect(world.port.send).not.toHaveBeenCalled()
    })

    it('reads the receiving basic account’s own key ready on the fresh install and unlocks', async () => {
      const world = await openWorld({ route: 'fresh-install' })
      const mounted = await open(world)
      await openDetails(mounted)
      expect(mounted.byTestId('submit-sending-unavailable')).toBeNull()
      expect(mounted.byTestId('submit-sending-failed')).toBeNull()
      expect(mounted.isDisabled('submit-action')).toBe(false)
    })

    const unheldCases = [
      { name: 'holds no key of it', keys: (): Key[] => [] },
      {
        name: 'holds its key only for one smart account',
        keys: (world: World) =>
          [
            {
              addr: world.receiving.addr,
              type: 'internal',
              dedicatedToOneSA: true,
              meta: { fromSeedId: 'seed-1' }
            }
          ] as unknown as Key[]
      },
      {
        name: 'holds its key from no recovery phrase',
        keys: (world: World) =>
          [
            { addr: world.receiving.addr, type: 'internal', dedicatedToOneSA: false, meta: {} }
          ] as unknown as Key[]
      }
    ]
    unheldCases.forEach((unheld) => {
      it(`says no key can send on the fresh install where the wallet lists the receiving account but ${unheld.name}`, async () => {
        const world = await openWorld({ route: 'fresh-install' })
        mockWallet.keys = unheld.keys(world)
        const mounted = await open(world)
        await openDetails(mounted)
        expect(mounted.textOf('submit-sending-unavailable')).toBe(t(`${SUBMIT}.noSendingKey`))
        expect(mounted.byTestId('submit-sending-retry')).toBeNull()
        expect(mounted.isDisabled('submit-action')).toBe(true)
        await mounted.press('submit-action')
        expect(world.port.send).not.toHaveBeenCalled()
        expect(world.port.sendAccountBatch).not.toHaveBeenCalled()
      })
    })

    it('says no key can send on the fresh install where the wallet does not list the receiving account', async () => {
      const world = await openWorld({ route: 'fresh-install' })
      mockWallet.accounts = []
      const mounted = await open(world)
      await openDetails(mounted)
      expect(mounted.textOf('submit-sending-unavailable')).toBe(t(`${SUBMIT}.noSendingKey`))
      expect(mounted.isDisabled('submit-action')).toBe(true)
    })
  })
})
