/**
 * @jest-environment jsdom
 *
 * The rows once the rule is satisfied and while it is not: every row outside
 * the set the submission carries reads not needed, whether or not it holds a
 * reply, as the client's own builder picks that set; and a path that is not
 * satisfied names why from its own rows: a required method that did not
 * answer this time, with retry and no abandon; a group whose open rows
 * cannot reach its threshold, with abandon; a guardian row still open.
 */
import type { Configuration, Gathering } from '@web/modules/social-recovery/sdk-interfaces'

import type {
  FakeDeps,
  FakeKit,
  Mounted,
  TestRecords
} from '@web/modules/social-recovery/recovery/checklist/__tests__/harness'
import {
  ACCOUNT,
  CHAIN_ID,
  configurationOf,
  depsOf,
  fakeKit,
  gatheringOf,
  GUARDIANS,
  guardianCredential,
  MIXED_PATH,
  mountChecklist,
  NOW,
  NOW_SECONDS,
  passkeyCredential,
  seedCache,
  seedEntry,
  seedSession,
  t,
  testRecords,
  withReplies
} from '@web/modules/social-recovery/recovery/checklist/__tests__/harness'

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const {
  failed,
  unavailable
}: typeof import('@web/modules/social-recovery/shared/ceremony') = require('@web/modules/social-recovery/shared/ceremony')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const UNSATISFIED = 'socialRecovery.checklist.unsatisfied'
const chip = (name: string) => t(`socialRecovery.status.collection.${name}`)

const PASSKEY_AND_GUARDIAN: Configuration = configurationOf([
  { threshold: 1, credentials: [passkeyCredential('Laptop passkey')] },
  { threshold: 1, credentials: [guardianCredential(GUARDIANS[0], 'Alice')] }
])

/** The submission the client builds over a gathering, carrying the places given. */
const submissionOver = (gathering: Gathering, places: number[]) => ({
  account: gathering.request.account,
  action: gathering.request.action,
  attemptId: BigInt(gathering.request.attemptId),
  setupNonce: BigInt(gathering.request.setupNonce),
  setupBody: gathering.request.setupBody,
  payload: '0x',
  order: { token: GUARDIANS[0], amount: BigInt(0), payee: GUARDIANS[0] },
  validUntil: Number(gathering.request.validUntil),
  proofs: places.map((place) => {
    const at = gathering.places[place]
    return {
      place: BigInt(place),
      method: at.method,
      config: at.config,
      salt: at.salt,
      proof: '0x01'
    }
  })
})

describe('the smallest set and the unsatisfied states', () => {
  let view: Mounted | undefined
  let world: TestRecords
  let kit: FakeKit
  let deps: FakeDeps

  const open = async (configuration: Configuration, gathering: Gathering) => {
    await seedCache(world.records, configuration)
    await seedSession(world.records, gathering)
    kit = fakeKit(configuration)
    deps = depsOf({ now: () => Date.now() })
    view = await mountChecklist({ records: world.records, client: kit.state, deps })
    return view
  }

  const chipOf = (place: number) => view?.byTestId(`checklist-row-${place}-chip`)?.textContent

  beforeEach(async () => {
    jest.useFakeTimers()
    jest.setSystemTime(NOW)
    world = testRecords()
    await seedEntry(world.records)
  })

  afterEach(() => {
    view?.unmount()
    view = undefined
    jest.useRealTimers()
  })

  describe('once the rule is satisfied', () => {
    it('reads every row outside the set the client picks as not needed, a row that replied included', async () => {
      // Every place replied; the group needs two of its three, and the client picks places 2 and 3.
      const gathering = withReplies(gatheringOf(MIXED_PATH), [0, 1, 2, 3, 4])
      await seedCache(world.records, MIXED_PATH)
      await seedSession(world.records, gathering)
      kit = fakeKit(MIXED_PATH)
      kit.complete.mockImplementation((held: Gathering) => submissionOver(held, [0, 1, 2, 3]))
      view = await mountChecklist({
        records: world.records,
        client: kit.state,
        deps: depsOf({ now: () => Date.now() })
      })

      expect(kit.complete).toHaveBeenCalledWith(gathering, undefined, NOW_SECONDS)
      expect(view.byTestId('checklist-satisfied')).not.toBeNull()
      expect([0, 1, 2, 3].map(chipOf)).toEqual(Array(4).fill(chip('complete')))
      expect(chipOf(4)).toBe(chip('notNeeded'))
    })

    it('reads a row with no reply outside the set as not needed', async () => {
      await open(MIXED_PATH, withReplies(gatheringOf(MIXED_PATH), [0, 1, 2, 3]))

      expect(view?.byTestId('checklist-satisfied')).not.toBeNull()
      expect(chipOf(3)).toBe(chip('complete'))
      expect(chipOf(4)).toBe(chip('notNeeded'))
    })

    it('reads a group member with no reply as not needed once its group is complete, before the rule is', async () => {
      await open(MIXED_PATH, withReplies(gatheringOf(MIXED_PATH), [2, 3]))

      expect(view?.byTestId('checklist-satisfied')).toBeNull()
      expect(chipOf(4)).toBe(chip('notNeeded'))
      expect(chipOf(1)).not.toBe(chip('notNeeded'))
    })
  })

  describe('while the rule is not satisfied', () => {
    const PASSKEY_ONLY: Configuration = configurationOf([
      { threshold: 1, credentials: [passkeyCredential('Laptop passkey')] },
      {
        threshold: 1,
        credentials: [
          passkeyCredential('Phone passkey', undefined, 5),
          passkeyCredential('Key', undefined, 7)
        ]
      }
    ])

    const returnFrom = async (
      id: string,
      outcome: Parameters<FakeDeps['channel']['report']>[2]
    ) => {
      await deps.channel.report(id, 'createClaim', outcome)
      view?.unmount()
      view = await mountChecklist({
        records: world.records,
        client: kit.state,
        deps,
        search: { account: ACCOUNT, ceremony: id }
      })
      return view
    }

    const cases = [
      ['could not be reached', unavailable('unreachable')],
      ['failed', failed('browser-error', 'NotAllowedError')]
    ] as const
    cases.forEach(([name, outcome]) => {
      it(`names a required method that ${name} this time, with retry on its row and no abandon`, async () => {
        await open(PASSKEY_AND_GUARDIAN, gatheringOf(PASSKEY_AND_GUARDIAN))
        expect(view?.byTestId('checklist-cannot-complete')).not.toBeNull()
        await view?.press('checklist-row-0-phone')
        const [id] = deps.requestIds

        const back = await returnFrom(id, outcome)

        expect(chipOf(0)).toBe(chip('didNotAnswer'))
        expect(back.byTestId('checklist-row-0-retry')).not.toBeNull()
        const reading = back.byTestId('checklist-unsatisfied-didNotAnswer')?.textContent ?? ''
        expect(reading).toContain(t(`${UNSATISFIED}.didNotAnswerTitle`))
        expect(reading).toContain(t(`${UNSATISFIED}.didNotAnswer`))
        expect(reading).toContain(t(`${UNSATISFIED}.approvalsKept`))
        expect(back.byTestId('checklist-cannot-complete')).toBeNull()
        expect(back.byTestId('checklist-abandon-action')).toBeNull()
      })
    })

    it('names a group whose open rows cannot reach its threshold, with abandon', async () => {
      const gathering = gatheringOf(MIXED_PATH)
      await seedCache(world.records, MIXED_PATH)
      const seeded = await seedSession(world.records, gathering)
      const noted = await world.records
        .recoverySession(CHAIN_ID, ACCOUNT)
        .setNote(2, 'declined', seeded.revision)
      await world.records
        .recoverySession(CHAIN_ID, ACCOUNT)
        .setNote(3, 'unanswered', noted.revision)
      kit = fakeKit(MIXED_PATH)
      view = await mountChecklist({
        records: world.records,
        client: kit.state,
        deps: depsOf({ now: () => Date.now() })
      })

      expect(view.byTestId('checklist-unsatisfied-groupCannotReach')?.textContent).toBe(
        t(`${UNSATISFIED}.groupCannotReach`)
      )
      expect(view.byTestId('checklist-cannot-complete')).not.toBeNull()
    })

    it('names no group short while its open rows can still reach its threshold', async () => {
      const gathering = gatheringOf(MIXED_PATH)
      await seedCache(world.records, MIXED_PATH)
      const seeded = await seedSession(world.records, gathering)
      await world.records.recoverySession(CHAIN_ID, ACCOUNT).setNote(2, 'declined', seeded.revision)
      kit = fakeKit(MIXED_PATH)
      view = await mountChecklist({
        records: world.records,
        client: kit.state,
        deps: depsOf({ now: () => Date.now() })
      })

      expect(view.byTestId('checklist-unsatisfied-groupCannotReach')).toBeNull()
      expect(view.byTestId('checklist-unsatisfied-guardianOpen')).not.toBeNull()
    })

    it('names an open guardian row', async () => {
      await open(PASSKEY_AND_GUARDIAN, withReplies(gatheringOf(PASSKEY_AND_GUARDIAN), [0]))

      expect(view?.byTestId('checklist-unsatisfied-guardianOpen')?.textContent).toBe(
        t(`${UNSATISFIED}.guardianOpen`)
      )
    })

    it('names no guardian on a path that has no guardian row', async () => {
      await open(PASSKEY_ONLY, gatheringOf(PASSKEY_ONLY))

      expect(view?.byTestId('checklist-unsatisfied-guardianOpen')).toBeNull()
      expect(view?.byTestId('checklist-unsatisfied-needsMore')?.textContent).toContain(
        t(`${UNSATISFIED}.needsMoreTitle`)
      )
    })

    it('names nothing once the rule is satisfied', async () => {
      await open(PASSKEY_AND_GUARDIAN, withReplies(gatheringOf(PASSKEY_AND_GUARDIAN), [0, 1]))
      ;['didNotAnswer', 'groupCannotReach', 'guardianOpen', 'needsMore'].forEach((kind) =>
        expect(view?.byTestId(`checklist-unsatisfied-${kind}`)).toBeNull()
      )
    })
  })
})
