/**
 * @jest-environment jsdom
 *
 * The done screen once the manager holds a later attempt than the one this
 * device landed. The landed attempt's consume is still ours where every
 * opening under its id before the consume is the landed one and at least one
 * exists: the screen renders done with that consume's keys and the methods
 * that opening names, adds the account once and runs the last act, whatever
 * the later attempt reads. Without our consume, without an opening under our
 * id, or with a manager's attempt under our id that is not ours, it goes back
 * to the wait and changes nothing.
 */
import {
  ADD_ACTION,
  addedAccountOf,
  attemptConsumed,
  attemptStarted,
  BOOK,
  CHAIN_ID,
  CONSUME_BLOCK,
  consumedAttempt,
  dispatchedOf,
  GRANT_PRIV,
  guardianName,
  mockWallet,
  mountDone,
  NEW_KEY,
  openWorld,
  ORIGINAL_PRIV,
  OTHER_TX,
  PASSWORD,
  privilegeChanged,
  recoveryPrivileges,
  REMOVED_KEY,
  t,
  tick,
  useDoneClock,
  usedLine
} from '@web/modules/social-recovery/recovery/done/__tests__/harness'
import type {
  FakeChain,
  Mounted,
  World
} from '@web/modules/social-recovery/recovery/done/__tests__/harness'
import { ADD_LIMIT_MS } from '@web/modules/social-recovery/recovery/done'
import { POLL_LIMIT_MS } from '@web/modules/social-recovery/recovery/checklist/constants'
import { waitPathOf } from '@web/modules/social-recovery/recovery/checklist'
import type { Address, Attempt, Hex } from '@web/modules/social-recovery/sdk-interfaces'
import { renderFullAddress } from '@web/modules/social-recovery/shared/display'
import { kindNameOf } from '@web/modules/social-recovery/setup/review'
import {
  readRecoveryPassword,
  setRecoveryPassword
} from '@web/modules/social-recovery/shared/records'
import { keccak256, zeroHash } from 'viem'

useDoneClock()

const DONE = 'socialRecovery.done'
const RIVAL_PAYLOAD: Hex = '0xbad0'
/** The key a rival's consume of the later attempt grants. */
const RIVAL_KEY: Address = '0x00000000000000000000000000000000000bad01'
const RIVAL_OPEN_BLOCK = CONSUME_BLOCK + 1
const RIVAL_CONSUME_BLOCK = CONSUME_BLOCK + 2

/** The attempt after ours, in `state`, opened with a rival's payload and naming `usedMethods`. */
const laterAttempt = (state: Attempt['state'], usedMethods: Address[] = []): Attempt => ({
  ...consumedAttempt(usedMethods),
  state,
  attemptId: 2n,
  payloadHash: keccak256(RIVAL_PAYLOAD)
})

/** Our opening of attempt 1, naming the guardian method only, at places 0, 1 and 3. */
const ourOpening = (account: Address) =>
  attemptStarted(account, [0, 1, 3], 1n, undefined, { usedMethods: [BOOK.methods.ecdsa] })

/** A rival's opening of attempt 2 after our consume, at other places and naming the passkey method. */
const rivalOpening = (account: Address) =>
  attemptStarted(account, [2, 3, 4], 2n, RIVAL_OPEN_BLOCK, {
    payload: RIVAL_PAYLOAD,
    usedMethods: [BOOK.methods.passkey]
  })

const rivalConsume = (account: Address) =>
  attemptConsumed(account, 2n, RIVAL_CONSUME_BLOCK, OTHER_TX)

/** Our recovery's privilege events, then the rival's consume handing the account from our key to its own. */
const privilegesWithRival = (account: Address) => [
  ...recoveryPrivileges(account),
  privilegeChanged(account, RIVAL_KEY, GRANT_PRIV, RIVAL_CONSUME_BLOCK, OTHER_TX, 1),
  privilegeChanged(account, NEW_KEY, zeroHash, RIVAL_CONSUME_BLOCK, OTHER_TX, 2)
]

/** The records the last act clears, as they stand. */
const recordsOf = async ({ records, account }: World) => ({
  countdown: (await records.countdown(CHAIN_ID, account).read()).status,
  entry: (await records.recoveryEntry(CHAIN_ID, account).read()).status,
  cache: (await records.decryptedSetupCache(CHAIN_ID, account).read()).status,
  password: readRecoveryPassword(CHAIN_ID, account)
})

/** A fast-track recovery that landed attempt 1, with the recovery password held. */
const openLanded = async (options: Parameters<typeof openWorld>[0] = {}) => {
  const world = await openWorld({ route: 'fresh-install', walletAdds: true, ...options })
  setRecoveryPassword(CHAIN_ID, world.account, PASSWORD)
  return world
}

/** Done renders with our consume's keys and stays: no navigation while the reads' limits pass. */
const expectOurDone = async (screen: Mounted) => {
  expect(screen.has('done')).toBe(true)
  expect(screen.textOf('done-controlled-by')).toBe(renderFullAddress(NEW_KEY))
  expect(screen.textOf('done-removed')).toBe(renderFullAddress(REMOVED_KEY))
  expect(screen.text()).not.toContain(renderFullAddress(RIVAL_KEY))
  await tick(POLL_LIMIT_MS + ADD_LIMIT_MS + 1)
  expect(screen.has('done')).toBe(true)
  expect(screen.paths()).toEqual([])
}

/** Back to the wait with replace, nothing of done, nothing dispatched past the add limit. */
const expectBackToWait = async (screen: Mounted, { account }: World) => {
  expect(screen.paths()).toEqual([waitPathOf(account)])
  expect(mockWallet.navigate.mock.calls[0][1]).toEqual({ replace: true })
  expect(screen.has('done')).toBe(false)
  expect(screen.has('done-adding')).toBe(false)
  expect(screen.text()).not.toContain(t(`${DONE}.title`))
  expect(screen.text()).not.toContain(renderFullAddress(NEW_KEY))
  expect(screen.text()).not.toContain(renderFullAddress(RIVAL_KEY))
  await tick(ADD_LIMIT_MS + 1)
  expect(mockWallet.dispatch).not.toHaveBeenCalled()
}

describe('our landed attempt consumed while the manager holds a later attempt', () => {
  const states = ['Waiting', 'Cancelled'] as const
  states.forEach((state) => {
    it(`renders done with one add and runs the last act where the later attempt reads ${state}`, async () => {
      const world = await openLanded()
      const { account, kit } = world
      kit.chain.attempt = laterAttempt(state)
      kit.chain.accountEvents = [
        ourOpening(account),
        attemptConsumed(account),
        rivalOpening(account)
      ]
      const screen = await mountDone(account)
      await expectOurDone(screen)
      expect(dispatchedOf(ADD_ACTION)).toHaveLength(1)
      expect(addedAccountOf().associatedKeys).toEqual([NEW_KEY])
      expect(screen.has('done-now-in-wallet')).toBe(true)

      await screen.press('done-close')
      expect(screen.paths()).toEqual(['/dashboard'])
      expect(await recordsOf(world)).toEqual({
        countdown: 'absent',
        entry: 'absent',
        cache: 'present',
        password: undefined
      })
      expect(dispatchedOf(ADD_ACTION)).toHaveLength(1)
      screen.unmount()
    })
  })

  it('renders our keys and the places of our opening where a rival consumed the later attempt', async () => {
    const world = await openLanded()
    const { account, kit } = world
    kit.chain.attempt = laterAttempt('Consumed', [BOOK.methods.passkey])
    kit.chain.accountEvents = [
      ourOpening(account),
      attemptConsumed(account),
      rivalOpening(account),
      rivalConsume(account)
    ]
    kit.chain.privilegeEvents = privilegesWithRival(account)
    const screen = await mountDone(account)
    await expectOurDone(screen)
    expect(screen.textOf('done-used')).toBe(
      usedLine(['Laptop passkey', guardianName(0), guardianName(2)])
    )
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(1)
    const added = addedAccountOf()
    expect(added.associatedKeys).toEqual([NEW_KEY])
    expect(added.initialPrivileges).toEqual([[REMOVED_KEY, ORIGINAL_PRIV]])
    screen.unmount()
  })

  it('names the methods of our opening, never the later attempt, where this device holds no path', async () => {
    const world = await openWorld({ route: 'logged-in', cache: false, walletAdds: true })
    const { account, kit } = world
    kit.chain.attempt = laterAttempt('Consumed', [BOOK.methods.passkey])
    kit.chain.accountEvents = [
      ourOpening(account),
      attemptConsumed(account),
      rivalOpening(account),
      rivalConsume(account)
    ]
    kit.chain.privilegeEvents = privilegesWithRival(account)
    const screen = await mountDone(account)
    expect(kit.getSetup).not.toHaveBeenCalled()
    await expectOurDone(screen)
    expect(screen.textOf('done-used')).toBe(usedLine([kindNameOf('ecdsa', t)]))
    expect(screen.text()).not.toContain(kindNameOf('passkey', t))
    expect(screen.allByTestIdPrefix('done-cleanup-synced-')).toHaveLength(0)
    screen.unmount()
  })

  it('renders done from our opening where the manager attempt reads none', async () => {
    const world = await openWorld({ route: 'logged-in', cache: false, walletAdds: true })
    const { account, kit } = world
    kit.chain.attempt = { ...consumedAttempt([BOOK.methods.passkey]), state: 'None' }
    kit.chain.accountEvents = [ourOpening(account), attemptConsumed(account)]
    const screen = await mountDone(account)
    await expectOurDone(screen)
    expect(screen.textOf('done-used')).toBe(usedLine([kindNameOf('ecdsa', t)]))
    screen.unmount()
  })
})

describe('no consume of ours while the manager holds a later attempt', () => {
  const cases: { name: string; change: (account: Address) => Partial<FakeChain> }[] = [
    {
      name: 'our attempt is not consumed and a later attempt waits',
      change: (account) => ({
        attempt: laterAttempt('Waiting'),
        accountEvents: [ourOpening(account), rivalOpening(account)]
      })
    },
    {
      name: 'our attempt is not consumed and a rival consumed the later attempt',
      change: (account) => ({
        attempt: laterAttempt('Consumed', [BOOK.methods.passkey]),
        accountEvents: [ourOpening(account), rivalOpening(account), rivalConsume(account)],
        privilegeEvents: [
          privilegeChanged(account, RIVAL_KEY, GRANT_PRIV, RIVAL_CONSUME_BLOCK, OTHER_TX, 1),
          privilegeChanged(account, REMOVED_KEY, zeroHash, RIVAL_CONSUME_BLOCK, OTHER_TX, 2)
        ]
      })
    },
    {
      name: 'our consume has no opening under our id and a later attempt waits',
      change: (account) => ({
        attempt: laterAttempt('Waiting'),
        accountEvents: [attemptConsumed(account), rivalOpening(account)]
      })
    },
    {
      name: 'a rival opening under our id comes before our consume and a later attempt waits',
      change: (account) => ({
        attempt: laterAttempt('Waiting'),
        accountEvents: [
          attemptStarted(account, [0], 1n, CONSUME_BLOCK - 200, { payload: RIVAL_PAYLOAD }),
          ourOpening(account),
          attemptConsumed(account),
          rivalOpening(account)
        ]
      })
    }
  ]
  const underOurId = ['Waiting', 'Cancelled'] as const
  underOurId.forEach((state) => {
    cases.push({
      name: `the manager attempt under our id reads ${state} with another payload hash, though our consume exists`,
      change: (account) => ({
        attempt: { ...laterAttempt(state), attemptId: 1n },
        accountEvents: [ourOpening(account), attemptConsumed(account)]
      })
    })
  })

  cases.forEach(({ name, change }) => {
    it(`goes back to the wait and changes nothing where ${name}`, async () => {
      const world = await openLanded()
      Object.assign(world.kit.chain, change(world.account))
      const before = await recordsOf(world)
      const screen = await mountDone(world.account)
      await expectBackToWait(screen, world)
      expect(await recordsOf(world)).toEqual(before)
      expect(before).toEqual({
        countdown: 'present',
        entry: 'present',
        cache: 'present',
        password: PASSWORD
      })
      screen.unmount()
    })
  })
})
