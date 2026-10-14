/**
 * @jest-environment jsdom
 *
 * What the done screen says once the consume is read: the lines under the
 * keys by route, what the recovery published and the methods it used (from
 * the opening event's places, else the attempt record's methods against the
 * path, two used members of one group as two members of the path), the
 * discoverability and unlinkability lines, and one cleanup block for each
 * passkey of the path: the synced repair for every passkey, with its exit by
 * the path's shape, on a device with or without the countdown.
 */
import {
  ADD_ACTION,
  addedAccountOf,
  attemptConsumed,
  attemptStarted,
  BOOK,
  CHAIN_ID,
  configurationOf,
  consumedAttempt,
  dispatchedOf,
  GUARDIANS,
  guardianName,
  guardianCredential,
  MIXED_PATH,
  mountDone,
  openWorld,
  aadhaarCredential,
  passkeyCredential,
  passportCredential,
  PASSWORD,
  t,
  useDoneClock,
  usedLine,
  walletAddsIt
} from '@web/modules/social-recovery/recovery/done/__tests__/harness'
import type { Mounted } from '@web/modules/social-recovery/recovery/done/__tests__/harness'
import type { Configuration, Credential } from '@web/modules/social-recovery/sdk-interfaces'
import { renderChip, renderFullAddress } from '@web/modules/social-recovery/shared/display'
import { kindNameOf } from '@web/modules/social-recovery/setup/review'
import { setRecoveryPassword } from '@web/modules/social-recovery/shared/records'

useDoneClock()

const DONE = 'socialRecovery.done'

const LAPTOP = passkeyCredential('Laptop passkey')

const PHONE = passkeyCredential('Phone passkey')

/** The cleanup blocks the screen renders, one card each. */
const blocksOf = (screen: Mounted) => screen.allByTestIdPrefix('done-cleanup-synced-')

/** The text of the element `id` inside one cleanup block, empty where it holds none. */
const inBlock = (block: HTMLElement, id: string) =>
  block.querySelector(`[data-testid="${id}"]`)?.textContent ?? ''

const DEVICE_BOUND_KEYS = ['dead', 'twoRequired', 'groupOfTwo']

/** Every block is the synced repair in its order, and no device-bound line renders. */
const expectSyncedRepairOnly = (screen: Mounted) => {
  blocksOf(screen).forEach((block) => {
    expect(inBlock(block, 'done-synced-title')).toBe(t(`${DONE}.synced.title`))
    expect(inBlock(block, 'done-synced-follows')).toBe(t(`${DONE}.synced.follows`))
    expect(inBlock(block, 'done-synced-order')).toBe(t(`${DONE}.synced.order`))
    expect(inBlock(block, 'done-cannot-reach')).toContain(t(`${DONE}.synced.cannotReachTitle`))
    expect(inBlock(block, 'done-remove-in-editor')).toBe(t(`${DONE}.synced.removeInEditor`))
  })
  DEVICE_BOUND_KEYS.forEach((key) => {
    expect(screen.text()).not.toContain(t(`${DONE}.deviceBound.${key}`))
  })
}

/** Opens a logged-in recovery over `configuration` whose opening used `places`, and mounts it. */
const mountUsing = async (configuration: Configuration, places: number[]) => {
  const world = await openWorld({ route: 'logged-in', configuration, walletAdds: true })
  world.kit.chain.accountEvents = [
    attemptStarted(world.account, places),
    attemptConsumed(world.account)
  ]
  return mountDone(world.account)
}

/** Opens a logged-in recovery over `configuration` and mounts it. */
const mountOver = async (
  configuration: Configuration,
  options: Parameters<typeof openWorld>[0] = {}
): Promise<{ screen: Mounted; world: Awaited<ReturnType<typeof openWorld>> }> => {
  const world = await openWorld({ route: 'logged-in', configuration, walletAdds: true, ...options })
  return { world, screen: await mountDone(world.account) }
}

describe('the lines under the keys by route', () => {
  it('on the fast track: one fresh key on this device, the account now in this wallet, and the one limit', async () => {
    const world = await openWorld({ route: 'fresh-install' })
    const screen = await mountDone(world.account)
    await walletAddsIt()
    expect(screen.has('plain-chrome')).toBe(true)
    expect(screen.has('setup-chrome')).toBe(false)
    expect(screen.textOf('done-controlled-by-line-0')).toBe(t(`${DONE}.freshKey`))
    expect(screen.textOf('done-controlled-by-line-1')).toBe(t(`${DONE}.keyLimit`))
    expect(screen.textOf('done-now-in-wallet')).toBe(t(`${DONE}.nowInWallet`))
    expect(screen.text()).not.toContain(t(`${DONE}.sharedKey`, { account: 'Account 1' }))
    expect(screen.textOf('done-removed-line-0')).toBe(t(`${DONE}.removedLine`))
    screen.unmount()
  })

  it('on the logged-in route: the receiving account key now shared by two accounts, and the one limit', async () => {
    const { screen } = await mountOver(MIXED_PATH)
    expect(screen.has('setup-chrome')).toBe(true)
    expect(screen.has('plain-chrome')).toBe(false)
    expect(screen.textOf('done-controlled-by-line-0')).toBe(
      t(`${DONE}.sharedKey`, { account: 'Daily account' })
    )
    expect(screen.textOf('done-controlled-by-line-1')).toBe(t(`${DONE}.keyLimit`))
    expect(screen.text()).not.toContain(t(`${DONE}.freshKey`))
    expect(screen.has('done-now-in-wallet')).toBe(false)
    screen.unmount()
  })

  it('shows the account with the name the wallet gives it, with the set-up chip', async () => {
    const added = await mountOver(MIXED_PATH)
    expect(added.screen.textOf('done-account')).toBe(
      t('socialRecovery.display.nameWithAccount', {
        account: renderFullAddress(added.world.account),
        name: addedAccountOf().preferences.label
      })
    )
    expect(added.screen.textOf('done-chip')).toBe(renderChip('recovery', 'setUp', t))
    added.screen.unmount()

    const listed = await mountOver(MIXED_PATH, { listed: true })
    expect(listed.screen.textOf('done-account')).toBe(
      t('socialRecovery.display.nameWithAccount', {
        account: renderFullAddress(listed.world.account),
        name: 'Recovered account'
      })
    )
    listed.screen.unmount()
  })
})

describe('what this recovery did', () => {
  it('names the methods used from the places the opening event published', async () => {
    const { screen } = await mountOver(MIXED_PATH)
    expect(screen.textOf('done-published')).toBe(t(`${DONE}.published`))
    expect(screen.textOf('done-used')).toBe(
      usedLine(['Laptop passkey', guardianName(0), guardianName(2)])
    )
    expect(screen.textOf('done-used-published')).toBe(t(`${DONE}.usedPublished`))
    expect(screen.textOf('done-unlinkable')).toBe(t(`${DONE}.unlinkable`))
    expect(screen.textOf('done-later-release')).toBe(t(`${DONE}.laterRelease`))
    screen.unmount()
  })

  it('takes the used methods from the attempt record against the path where the events no longer name the opening', async () => {
    const world = await openWorld({ route: 'logged-in', walletAdds: true })
    world.kit.chain.accountEvents = [attemptConsumed(world.account)]
    world.kit.chain.attempt = consumedAttempt([BOOK.methods.passkey])
    const screen = await mountDone(world.account)
    expect(screen.textOf('done-used')).toBe(usedLine(['Laptop passkey']))
    screen.unmount()
  })

  it('ignores an opening of another attempt', async () => {
    const world = await openWorld({ route: 'logged-in', walletAdds: true })
    world.kit.chain.accountEvents = [
      attemptStarted(world.account, [2, 3, 4], 7n),
      attemptConsumed(world.account)
    ]
    world.kit.chain.attempt = consumedAttempt([BOOK.methods.passkey])
    const screen = await mountDone(world.account)
    expect(screen.textOf('done-used')).toBe(usedLine(['Laptop passkey']))
    screen.unmount()
  })

  it('opens the path with the recovery password held in memory where this device holds no cache', async () => {
    const world = await openWorld({ route: 'logged-in', cache: false, walletAdds: true })
    setRecoveryPassword(CHAIN_ID, world.account, PASSWORD)
    const screen = await mountDone(world.account)
    expect(world.kit.getSetup).toHaveBeenCalledWith({ password: PASSWORD })
    expect(screen.textOf('done-used')).toBe(
      usedLine(['Laptop passkey', guardianName(0), guardianName(2)])
    )
    screen.unmount()
  })

  it('names only the used kinds where this device holds no path', async () => {
    const world = await openWorld({ route: 'logged-in', cache: false, walletAdds: true })
    world.kit.chain.attempt = consumedAttempt([BOOK.methods.passkey, BOOK.methods.ecdsa])
    const screen = await mountDone(world.account)
    expect(world.kit.getSetup).not.toHaveBeenCalled()
    expect(screen.textOf('done-used')).toBe(
      usedLine([kindNameOf('passkey', t), kindNameOf('ecdsa', t)])
    )
    expect(screen.has('done-discoverable')).toBe(true)
    const blocks = blocksOf(screen)
    expect(blocks).toHaveLength(1)
    expect(screen.has('done-synced-title')).toBe(true)
    expect(screen.has('done-cleanup-row')).toBe(false)
    expect(screen.has('done-synced-add-first')).toBe(false)
    expect(screen.has('done-synced-whole-rule')).toBe(false)
    screen.unmount()
  })

  it('says every guardian is discoverable where the path holds an address row, approved or not, and not otherwise', async () => {
    const withGuardian = await mountOver(MIXED_PATH)
    expect(withGuardian.screen.textOf('done-discoverable')).toBe(t(`${DONE}.discoverable`))
    withGuardian.screen.unmount()

    const world = await openWorld({ route: 'logged-in', walletAdds: true })
    world.kit.chain.accountEvents = [
      attemptStarted(world.account, [0]),
      attemptConsumed(world.account)
    ]
    const passkeyOnly = await mountDone(world.account)
    expect(passkeyOnly.textOf('done-used')).toBe(usedLine(['Laptop passkey']))
    expect(passkeyOnly.textOf('done-discoverable')).toBe(t(`${DONE}.discoverable`))
    passkeyOnly.unmount()

    const noGuardian = configurationOf([
      { threshold: 1, credentials: [LAPTOP] },
      { threshold: 1, credentials: [passportCredential()] }
    ])
    const without = await mountOver(noGuardian)
    expect(without.screen.has('done-discoverable')).toBe(false)
    without.screen.unmount()
  })

  it('says an unused passkey stays unguessable only where the recovery did not use it', async () => {
    const used = await mountOver(MIXED_PATH)
    expect(used.screen.has('done-unused-stays')).toBe(false)
    used.screen.unmount()

    const world = await openWorld({ route: 'logged-in', walletAdds: true })
    world.kit.chain.accountEvents = [
      attemptStarted(world.account, [1, 2]),
      attemptConsumed(world.account)
    ]
    const screen = await mountDone(world.account)
    expect(screen.textOf('done-used')).toBe(usedLine([guardianName(0), guardianName(1)]))
    expect(screen.textOf('done-unused-stays')).toBe(t(`${DONE}.unusedStays`))
    screen.unmount()
  })

  it('names exactly two used members of one group as two members of the path, at the place of the first', async () => {
    const cases: { configuration: Configuration; places: number[]; names: string[] }[] = [
      {
        configuration: MIXED_PATH,
        places: [0, 2, 3],
        names: ['Laptop passkey', t(`${DONE}.twoMembers`)]
      },
      {
        configuration: MIXED_PATH,
        places: [1, 2, 4],
        names: [guardianName(0), t(`${DONE}.twoMembers`)]
      },
      {
        configuration: configurationOf([
          { threshold: 1, credentials: [LAPTOP] },
          {
            threshold: 2,
            credentials: [guardianCredential(GUARDIANS[0]), guardianCredential(GUARDIANS[1])]
          }
        ]),
        places: [1, 2],
        names: [t(`${DONE}.twoMembers`)]
      }
    ]
    // eslint-disable-next-line no-restricted-syntax
    for (const { configuration, places, names } of cases) {
      // eslint-disable-next-line no-await-in-loop
      const screen = await mountUsing(configuration, places)
      expect(screen.textOf('done-used')).toBe(usedLine(names))
      screen.unmount()
    }
  })

  it('names a guardian row whose address does not decode as a guardian, with no address words', async () => {
    const unreadable: Credential = { method: BOOK.methods.ecdsa, config: '0x01' }
    const screen = await mountUsing(
      configurationOf([
        { threshold: 1, credentials: [LAPTOP] },
        { threshold: 1, credentials: [unreadable] }
      ]),
      [0, 1]
    )
    expect(screen.textOf('done-used')).toBe(
      usedLine(['Laptop passkey', t('socialRecovery.display.nouns.guardian')])
    )
    expect(screen.text()).not.toContain(t(`${DONE}.guardianAddress`))
    screen.unmount()
  })

  it('names each used row where a group gives other than two of them, or the rows are single-member clauses', async () => {
    const cases: { configuration: Configuration; places: number[]; names: string[] }[] = [
      {
        configuration: MIXED_PATH,
        places: [2, 3, 4],
        names: [guardianName(1), guardianName(2), guardianName(3)]
      },
      {
        configuration: MIXED_PATH,
        places: [0, 1, 4],
        names: ['Laptop passkey', guardianName(0), guardianName(3)]
      },
      {
        configuration: configurationOf([
          { threshold: 1, credentials: [guardianCredential(GUARDIANS[0])] },
          { threshold: 1, credentials: [guardianCredential(GUARDIANS[1])] }
        ]),
        places: [0, 1],
        names: [guardianName(0), guardianName(1)]
      }
    ]
    // eslint-disable-next-line no-restricted-syntax
    for (const { configuration, places, names } of cases) {
      // eslint-disable-next-line no-await-in-loop
      const screen = await mountUsing(configuration, places)
      expect(screen.textOf('done-used')).toBe(usedLine(names))
      expect(screen.text()).not.toContain(t(`${DONE}.twoMembers`))
      screen.unmount()
    }
  })

  it('says the later release never unlinks a passport only where the path holds an identity method', async () => {
    const plain = await mountOver(MIXED_PATH)
    expect(plain.screen.has('done-passport-never')).toBe(false)
    plain.screen.unmount()

    const withIdentity = async (identity: Credential) => {
      const path = configurationOf([
        { threshold: 1, credentials: [guardianCredential(GUARDIANS[0])] },
        { threshold: 1, credentials: [identity] }
      ])
      const { screen } = await mountOver(path)
      expect(screen.textOf('done-passport-never')).toBe(t(`${DONE}.passportNever`))
      screen.unmount()
    }
    await withIdentity(passportCredential())
    await withIdentity(aadhaarCredential())
  })
})

describe('the cleanup block by the path passkeys', () => {
  it('renders the synced repair in its one order, then the cannot-reach exit, in a path of many rows', async () => {
    const { screen } = await mountOver(MIXED_PATH)
    expect(blocksOf(screen)).toHaveLength(1)
    expect(screen.has('done-cleanup-synced-0')).toBe(true)
    expect(screen.textOf('done-synced-title')).toBe(t(`${DONE}.synced.title`))
    expect(screen.textOf('done-cleanup-row')).toBe('Laptop passkey')
    expect(screen.textOf('done-synced-follows')).toBe(t(`${DONE}.synced.follows`))
    expect(screen.textOf('done-synced-order')).toBe(t(`${DONE}.synced.order`))
    expect(screen.textOf('done-cannot-reach')).toContain(t(`${DONE}.synced.cannotReachTitle`))
    expect(screen.textOf('done-cannot-reach-body')).toBe(t(`${DONE}.synced.cannotReachBody`))
    expect(screen.textOf('done-remove-in-editor')).toBe(t(`${DONE}.synced.removeInEditor`))
    expect(screen.textOf('done-editor-shows')).toBe(t(`${DONE}.synced.editorShows`))
    expect(screen.before('done-synced-follows', 'done-synced-order')).toBe(true)
    expect(screen.before('done-synced-order', 'done-cannot-reach')).toBe(true)
    expect(screen.has('done-synced-add-first')).toBe(false)
    expect(screen.has('done-synced-whole-rule')).toBe(false)
    expectSyncedRepairOnly(screen)
    screen.unmount()
  })

  it('asks for a method first where removing the synced passkey would leave none', async () => {
    const { screen } = await mountOver(configurationOf([{ threshold: 1, credentials: [LAPTOP] }]))
    expect(screen.textOf('done-synced-add-first')).toBe(t(`${DONE}.synced.addFirst`))
    expect(screen.has('done-synced-whole-rule')).toBe(false)
    screen.unmount()
  })

  it('names the method that would remain as the whole rule where one row would', async () => {
    const path = configurationOf([
      { threshold: 1, credentials: [LAPTOP] },
      { threshold: 1, credentials: [guardianCredential(GUARDIANS[0])] }
    ])
    const { screen } = await mountOver(path)
    expect(screen.textOf('done-synced-whole-rule')).toBe(
      t(`${DONE}.synced.leavesWholeRule`, { method: guardianName(0) })
    )
    expect(screen.textOf('done-synced-single-method')).toBe(
      t('socialRecovery.ruleLines.singleMethod')
    )
    expect(screen.has('done-synced-add-first')).toBe(false)
    screen.unmount()
  })

  it('renders one block for each passkey, each naming its own row', async () => {
    const path = configurationOf([
      { threshold: 1, credentials: [LAPTOP] },
      { threshold: 1, credentials: [guardianCredential(GUARDIANS[0])] },
      { threshold: 1, credentials: [PHONE] }
    ])
    const { screen } = await mountOver(path)
    const blocks = blocksOf(screen)
    expect(blocks).toHaveLength(2)
    expect(screen.has('done-cleanup-synced-0')).toBe(true)
    expect(screen.has('done-cleanup-synced-2')).toBe(true)
    expect(blocks.map((block) => inBlock(block, 'done-cleanup-row'))).toEqual([
      'Laptop passkey',
      'Phone passkey'
    ])
    expectSyncedRepairOnly(screen)
    blocks.forEach((block) => {
      expect(inBlock(block, 'done-synced-add-first')).toBe('')
      expect(inBlock(block, 'done-synced-whole-rule')).toBe('')
    })
    screen.unmount()
  })

  it('names the other passkey as the whole rule in each block where the path is two passkeys', async () => {
    const { screen } = await mountOver(
      configurationOf([
        { threshold: 1, credentials: [LAPTOP] },
        { threshold: 1, credentials: [PHONE] }
      ])
    )
    const blocks = blocksOf(screen)
    expect(blocks.map((block) => inBlock(block, 'done-synced-whole-rule'))).toEqual([
      t(`${DONE}.synced.leavesWholeRule`, { method: 'Phone passkey' }),
      t(`${DONE}.synced.leavesWholeRule`, { method: 'Laptop passkey' })
    ])
    screen.unmount()
  })

  it('renders no cleanup block for a path with no passkey', async () => {
    const path = configurationOf([
      {
        threshold: 1,
        credentials: [guardianCredential(GUARDIANS[0]), guardianCredential(GUARDIANS[1])]
      }
    ])
    const { screen } = await mountOver(path)
    expect(blocksOf(screen)).toHaveLength(0)
    expect(screen.has('done-synced-title')).toBe(false)
    screen.unmount()
  })
})

describe('what comes next', () => {
  it('says other doors may exist, the setup survived, the password change, and offers edit and close', async () => {
    const { screen } = await mountOver(MIXED_PATH)
    expect(screen.textOf('done-other-doors')).toBe(t(`${DONE}.otherDoors`))
    expect(screen.textOf('done-survived')).toBe(t(`${DONE}.survived`))
    expect(screen.textOf('done-password-change')).toBe(t(`${DONE}.passwordChange`))
    expect(screen.textOf('done-edit')).toBe(t(`${DONE}.editOrReplace`))
    expect(screen.textOf('done-close')).toBe(t(`${DONE}.close`))
    screen.unmount()
  })
})

describe('a device that holds the entry record but no countdown', () => {
  const shapes: {
    name: string
    configuration: Configuration
    exits: ('add-first' | 'whole-rule' | 'none')[]
  }[] = [
    {
      name: 'the only row',
      configuration: configurationOf([{ threshold: 1, credentials: [LAPTOP] }]),
      exits: ['add-first']
    },
    {
      name: 'one of two required rows',
      configuration: configurationOf([
        { threshold: 1, credentials: [LAPTOP] },
        { threshold: 1, credentials: [guardianCredential(GUARDIANS[0])] }
      ]),
      exits: ['whole-rule']
    },
    {
      name: 'a member of a group of two',
      configuration: configurationOf([
        { threshold: 2, credentials: [LAPTOP, guardianCredential(GUARDIANS[0])] }
      ]),
      exits: ['whole-rule']
    },
    {
      name: 'a member of a group of two beside another row',
      configuration: configurationOf([
        { threshold: 1, credentials: [guardianCredential(GUARDIANS[0])] },
        { threshold: 2, credentials: [LAPTOP, guardianCredential(GUARDIANS[1])] }
      ]),
      exits: ['none']
    },
    { name: 'one row of a larger path', configuration: MIXED_PATH, exits: ['none'] },
    {
      name: 'two passkeys',
      configuration: configurationOf([
        { threshold: 1, credentials: [LAPTOP] },
        { threshold: 1, credentials: [PHONE] }
      ]),
      exits: ['whole-rule', 'whole-rule']
    }
  ]

  shapes.forEach(({ name, configuration, exits }) => {
    it(`renders the synced repair for a passkey that is ${name}, and adds nothing`, async () => {
      const { screen } = await mountOver(configuration, { countdown: false, listed: true })
      expect(screen.has('done')).toBe(true)
      const blocks = blocksOf(screen)
      expect(blocks).toHaveLength(exits.length)
      expectSyncedRepairOnly(screen)
      blocks.forEach((block, index) => {
        expect(!!inBlock(block, 'done-synced-add-first')).toBe(exits[index] === 'add-first')
        expect(!!inBlock(block, 'done-synced-whole-rule')).toBe(exits[index] === 'whole-rule')
      })
      expect(dispatchedOf(ADD_ACTION)).toHaveLength(0)
      expect(screen.paths()).toEqual([])
      screen.unmount()
    })
  })

  it('renders the synced repair for a used passkey where this device holds no path', async () => {
    const world = await openWorld({
      route: 'logged-in',
      cache: false,
      countdown: false,
      listed: true
    })
    world.kit.chain.attempt = consumedAttempt([BOOK.methods.passkey])
    const screen = await mountDone(world.account)
    expect(world.kit.getSetup).not.toHaveBeenCalled()
    expect(blocksOf(screen)).toHaveLength(1)
    expectSyncedRepairOnly(screen)
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(0)
    screen.unmount()
  })
})
