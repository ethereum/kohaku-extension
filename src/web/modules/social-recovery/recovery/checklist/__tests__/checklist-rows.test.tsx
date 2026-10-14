/**
 * @jest-environment jsdom
 *
 * The rows: one row per required method, each group under its header with
 * its count against its threshold and every member shown, the headline that
 * counts a group as one unit, continue unlocked by a satisfied assessment
 * alone, and the rows outside the smallest set reading not needed.
 */
import type { Configuration, Gathering } from '@web/modules/social-recovery/sdk-interfaces'

import type {
  Mounted,
  TestRecords
} from '@web/modules/social-recovery/recovery/checklist/__tests__/harness'
import {
  ACCOUNT,
  configurationOf,
  depsOf,
  each,
  fakeKit,
  gatheringOf,
  GUARDIANS,
  guardianCredential,
  MIXED_PATH,
  mountChecklist,
  passkeyCredential,
  passportCredential,
  seedCache,
  seedEntry,
  seedSession,
  t,
  testRecords,
  withReplies
} from '@web/modules/social-recovery/recovery/checklist/__tests__/harness'

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const {
  WEB_ROUTES
}: typeof import('@common/modules/router/constants/common') = require('@common/modules/router/constants/common')
const {
  renderShortAddress
}: typeof import('@web/modules/social-recovery/shared/display') = require('@web/modules/social-recovery/shared/display')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const CHECKLIST = 'socialRecovery.checklist'
const chip = (name: string) => t(`socialRecovery.status.collection.${name}`)

describe('the checklist rows', () => {
  let view: Mounted | undefined
  let world: TestRecords

  const open = async (configuration: Configuration, gathering: Gathering) => {
    await seedCache(world.records, configuration)
    await seedSession(world.records, gathering)
    const kit = fakeKit(configuration)
    view = await mountChecklist({ records: world.records, client: kit.state, deps: depsOf() })
    return { view, kit }
  }

  beforeEach(async () => {
    world = testRecords()
    await seedEntry(world.records)
  })

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  it('draws one row per required method and every member of a group under its header', async () => {
    const { view: mounted } = await open(MIXED_PATH, gatheringOf(MIXED_PATH))

    const rows = mounted.byTestId('checklist-rows')
    const required = Array.from(rows?.children ?? []).filter((node) =>
      /^checklist-row-\d+$/.test(node.getAttribute('data-testid') ?? '')
    )
    expect(required.map((node) => node.getAttribute('data-testid'))).toEqual([
      'checklist-row-0',
      'checklist-row-1'
    ])
    const group = mounted.byTestId('checklist-group-2')
    expect(group).not.toBeNull()
    expect(
      [2, 3, 4].map((place) => !!group?.querySelector(`[data-testid="checklist-row-${place}"]`))
    ).toEqual([true, true, true])
    expect(mounted.byTestId('checklist-group-2-progress')?.textContent).toBe(
      t(`${CHECKLIST}.groupProgress`, { done: 0, count: 2 })
    )
    expect(mounted.byTestId('checklist-row-0-kind')?.textContent).toBe(
      t('socialRecovery.methodNames.passkey')
    )
    expect(mounted.byTestId('checklist-row-0-label')?.textContent).toBe('Laptop passkey')
    expect(mounted.byTestId('checklist-row-1-kind')?.textContent).toBe(
      t('socialRecovery.display.nouns.guardian')
    )
    ;[0, 1, 2, 3, 4].forEach((place) =>
      expect(mounted.byTestId(`checklist-row-${place}-chip`)?.textContent).toBe(chip('notAsked'))
    )
  })

  it('heads a group with its number and its shape, the threshold of its member count', async () => {
    const { view: mounted } = await open(MIXED_PATH, gatheringOf(MIXED_PATH))

    expect(mounted.byTestId('checklist-group-2-shape')?.textContent).toBe(
      `${t('socialRecovery.shape.group', { n: 1 })}${t('socialRecovery.shape.require')}2${t(
        'socialRecovery.shape.of'
      )}3`
    )
  })

  it('shows the deadline line from the request', async () => {
    const { view: mounted } = await open(MIXED_PATH, gatheringOf(MIXED_PATH))

    const line = mounted.byTestId('checklist-deadline')?.textContent ?? ''
    expect(line).toContain('Request valid until')
    expect(line).toContain('left')
  })

  it('counts a group as one unit in the headline', async () => {
    const { view: mounted } = await open(MIXED_PATH, withReplies(gatheringOf(MIXED_PATH), [2, 3]))

    expect(mounted.byTestId('checklist-progress')?.textContent).toBe(
      t(`${CHECKLIST}.progress`, { done: 1, total: 3 })
    )
    expect(mounted.byTestId('checklist-group-2-progress')?.textContent).toBe(
      t(`${CHECKLIST}.groupProgress`, { done: 2, count: 2 })
    )
  })

  it('counts the open group member not needed once the group is complete, with the rule still open', async () => {
    const { view: mounted } = await open(MIXED_PATH, withReplies(gatheringOf(MIXED_PATH), [2, 3]))

    expect(mounted.byTestId('checklist-row-2-chip')?.textContent).toBe(chip('complete'))
    expect(mounted.byTestId('checklist-row-4-chip')?.textContent).toBe(chip('notNeeded'))
    expect(mounted.byTestId('checklist-row-0-chip')?.textContent).toBe(chip('notAsked'))
    expect(mounted.isDisabled('checklist-continue')).toBe(true)
  })

  it('unlocks continue on a satisfied assessment and marks the rows outside the smallest set not needed', async () => {
    const { view: mounted } = await open(
      MIXED_PATH,
      withReplies(gatheringOf(MIXED_PATH), [0, 1, 2, 3])
    )

    expect(mounted.byTestId('checklist-progress')?.textContent).toBe(
      t(`${CHECKLIST}.progress`, { done: 3, total: 3 })
    )
    expect(mounted.byTestId('checklist-satisfied')?.textContent).toBe(t(`${CHECKLIST}.satisfied`))
    expect(mounted.byTestId('checklist-row-4-chip')?.textContent).toBe(chip('notNeeded'))
    expect(mounted.byTestId('checklist-row-4-mark-declined')).toBeNull()
    expect(mounted.text()).not.toContain(t(`${CHECKLIST}.continueUnlock`))
    expect(mounted.isDisabled('checklist-continue')).toBe(false)

    await mounted.press('checklist-continue')
    expect(mounted.lastPath()).toBe(
      `/${WEB_ROUTES.socialRecoveryRecoverySubmit}?account=${ACCOUNT}`
    )
  })

  each([
    ['required rows and groups', MIXED_PATH, `${CHECKLIST}.continueUnlock`],
    [
      'required rows only',
      configurationOf([
        { threshold: 1, credentials: [passkeyCredential('Laptop passkey')] },
        { threshold: 1, credentials: [guardianCredential(GUARDIANS[0])] }
      ]),
      `${CHECKLIST}.continueUnlockRequiredOnly`
    ],
    [
      'groups only',
      configurationOf([
        {
          threshold: 1,
          credentials: [guardianCredential(GUARDIANS[0]), guardianCredential(GUARDIANS[1])]
        }
      ]),
      `${CHECKLIST}.continueUnlockGroupsOnly`
    ]
  ] as const)(
    'keeps continue locked with the unlock line of a path of %s',
    async ([, configuration, key]) => {
      const { view: mounted } = await open(configuration, gatheringOf(configuration))

      expect(mounted.isDisabled('checklist-continue')).toBe(true)
      expect(mounted.text()).toContain(t(key))
      expect(mounted.byTestId('checklist-satisfied')).toBeNull()
      await mounted.press('checklist-continue')
      expect(mounted.navigate).not.toHaveBeenCalled()
    }
  )

  it('renders an identity row with its kind name, the not asked chip and no action', async () => {
    const configuration = configurationOf([
      { threshold: 1, credentials: [passportCredential()] },
      { threshold: 1, credentials: [guardianCredential(GUARDIANS[0])] }
    ])
    const { view: mounted } = await open(configuration, gatheringOf(configuration))

    expect(mounted.byTestId('checklist-row-0-kind')?.textContent).toBe(
      t('socialRecovery.methodNames.passport')
    )
    expect(mounted.byTestId('checklist-row-0-chip')?.textContent).toBe(chip('notAsked'))
    expect(mounted.byTestId('checklist-row-0')?.querySelector('[tabindex="0"]')).toBeNull()
  })

  it('labels a guardian row with its short address alone, and shows the verified line once it replied', async () => {
    const { view: mounted } = await open(MIXED_PATH, withReplies(gatheringOf(MIXED_PATH), [1]))

    expect(mounted.byTestId('checklist-row-1-label')?.textContent).toBe(
      renderShortAddress(GUARDIANS[0])
    )
    expect(mounted.byTestId('checklist-row-1')?.textContent).not.toContain('Alice')
    expect(mounted.byTestId('checklist-row-1-verified')?.textContent).toBe(
      t(`${CHECKLIST}.guardian.verified`)
    )
    expect(mounted.byTestId('checklist-row-2-label')?.textContent).toBe(
      renderShortAddress(GUARDIANS[1])
    )
    expect(mounted.byTestId('checklist-row-2-verified')).toBeNull()
  })
})
