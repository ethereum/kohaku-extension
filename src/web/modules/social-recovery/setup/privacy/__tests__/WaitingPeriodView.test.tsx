/**
 * @jest-environment jsdom
 */
import type { StepViewProps } from '@web/modules/social-recovery/setup/privacy'

import type { Harness, StorageFaults } from './harness'
import { ACCOUNT, CHAIN_ID, draftOf, harnessOf, holdReads, recordsOn } from './harness'

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const en: typeof import('@common/config/localization/translations/en.json') = require('@common/config/localization/translations/en.json')
const {
  WEB_ROUTES
}: typeof import('@common/modules/router/constants/common') = require('@common/modules/router/constants/common')
const WaitingPeriodView: typeof import('../WaitingPeriodView').default =
  require('../WaitingPeriodView').default
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const W = en.socialRecovery.privacy.waitingPeriod
const S = en.socialRecovery

// Any line that puts the floor on the contract or the chain.
const CHAIN_FLOOR = /(contract|chain)[^.]*(reject|refuse|enforce|require|minimum|shorter)/i

describe('the waiting period step', () => {
  let h: Harness

  beforeEach(() => {
    h = harnessOf(WaitingPeriodView)
  })

  afterEach(() => {
    h.unmount()
  })

  const storedRecord = async (records: ReturnType<typeof recordsOn>) => {
    const read = await records.setup(CHAIN_ID, ACCOUNT).waitingPeriod.read()
    return read.status === 'present' ? read.value : undefined
  }

  const storedDraftWait = async (records: ReturnType<typeof recordsOn>) => {
    const read = await records.setup(CHAIN_ID, ACCOUNT).setupDraft.read()
    return read.status === 'present' ? read.value.wait : undefined
  }

  const CHIP_IDS = ['hours24', 'hours48', 'hours72', 'days7', 'custom']

  const checkedChipIds = () =>
    CHIP_IDS.filter((id) => h.byTestId(`wait-chip-${id}`)?.getAttribute('aria-checked') === 'true')

  const disabledChipIds = () => CHIP_IDS.filter((id) => h.isDisabled(`wait-chip-${id}`))

  const mountWithCeiling = async (ceilingHours: number, records: ReturnType<typeof recordsOn>) => {
    h.unmount()
    h = harnessOf((props: StepViewProps) =>
      React.createElement(WaitingPeriodView, { ...props, ceilingHours })
    )
    await h.mount(records)
  }

  describe('the picker', () => {
    it('offers the four chips and the custom entry in their words and order', async () => {
      await h.mount(recordsOn())
      expect(
        ['hours24', 'hours48', 'hours72', 'days7', 'custom'].map(
          (id) => h.byTestId(`wait-chip-${id}`)?.textContent
        )
      ).toEqual([W.chips.hours24, W.chips.hours48, W.chips.hours72, W.chips.days7, W.custom])
    })

    const LENGTHS: [string, bigint][] = [
      ['hours24', 86400n],
      ['hours48', 172800n],
      ['hours72', 259200n],
      ['days7', 604800n]
    ]

    LENGTHS.forEach(([id, seconds]) =>
      it(`stores the ${id} chip as ${seconds} seconds`, async () => {
        const records = recordsOn()
        await h.mount(records)
        await h.press(`wait-chip-${id}`)
        await h.press('continue')
        expect(await storedRecord(records)).toBe(seconds)
      })
    )

    const checkedChips = () =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-testid="waiting-period-screen"] [role="radio"]'
        )
      ).map((chip) => [chip.getAttribute('data-testid'), chip.getAttribute('aria-checked')])

    it('marks the preselected 48-hour chip alone as checked', async () => {
      await h.mount(recordsOn())
      expect(checkedChips()).toEqual([
        ['wait-chip-hours24', 'false'],
        ['wait-chip-hours48', 'true'],
        ['wait-chip-hours72', 'false'],
        ['wait-chip-days7', 'false'],
        ['wait-chip-custom', 'false']
      ])
    })

    it('a press on custom moves the checked mark to the custom chip alone', async () => {
      await h.mount(recordsOn())
      await h.press('wait-chip-custom')
      expect(checkedChips()).toEqual([
        ['wait-chip-hours24', 'false'],
        ['wait-chip-hours48', 'false'],
        ['wait-chip-hours72', 'false'],
        ['wait-chip-days7', 'false'],
        ['wait-chip-custom', 'true']
      ])
    })

    it('shows no field for the custom entry until custom is picked', async () => {
      await h.mount(recordsOn())
      expect(h.inputOf('wait-custom-hours')).toBeNull()
      await h.press('wait-chip-custom')
      expect(h.inputOf('wait-custom-hours')).not.toBeNull()
    })

    it('accepts a custom entry of 24 hours and stores it in seconds', async () => {
      const records = recordsOn()
      await h.mount(records)
      await h.press('wait-chip-custom')
      await h.type('wait-custom-hours', '24')
      expect(h.byTestId('wait-refusal')).toBeNull()
      expect(h.isDisabled('continue')).toBe(false)
      await h.press('continue')
      expect(await storedRecord(records)).toBe(86400n)
    })

    it('refuses 23 hours with the wallet floor and stores nothing', async () => {
      const records = recordsOn()
      await h.mount(records)
      await h.press('wait-chip-custom')
      await h.type('wait-custom-hours', '23')
      expect(h.byTestId('wait-refusal')?.textContent).toBe('This wallet needs 24 hours or more.')
      expect(h.isDisabled('continue')).toBe(true)
      await h.press('continue')
      expect(await storedRecord(records)).toBeUndefined()
      expect(h.navigate).not.toHaveBeenCalled()
    })

    it('accepts the ceiling of 720 hours', async () => {
      const records = recordsOn()
      await h.mount(records)
      await h.press('wait-chip-custom')
      await h.type('wait-custom-hours', '720')
      expect(h.byTestId('wait-refusal')).toBeNull()
      await h.press('continue')
      expect(await storedRecord(records)).toBe(720n * 3600n)
    })

    it('refuses 721 hours with the ceiling line that names 720, and stores nothing', async () => {
      const records = recordsOn()
      await h.mount(records)
      await h.press('wait-chip-custom')
      await h.type('wait-custom-hours', '721')
      expect(h.byTestId('wait-refusal')?.textContent).toBe(
        'This wallet cannot save a waiting period this long. The longest it accepts is 720 hours.'
      )
      expect(h.isDisabled('continue')).toBe(true)
      await h.press('continue')
      expect(await storedRecord(records)).toBeUndefined()
    })

    it('refuses a length past any field width at the ceiling, before it reaches storage', async () => {
      const records = recordsOn()
      await h.mount(records)
      await h.press('wait-chip-custom')
      await h.type('wait-custom-hours', '9'.repeat(80))
      expect(h.byTestId('wait-refusal')?.textContent).toContain('720 hours')
      await h.press('continue')
      expect(await storedRecord(records)).toBeUndefined()
      expect(h.navigate).not.toHaveBeenCalled()
    })

    it('refuses past a ceiling the screen hands it, naming that ceiling', async () => {
      h.unmount()
      h = harnessOf((props: StepViewProps) =>
        React.createElement(WaitingPeriodView, { ...props, ceilingHours: 100 })
      )
      const records = recordsOn()
      await h.mount(records)
      await h.press('wait-chip-custom')
      await h.type('wait-custom-hours', '101')
      expect(h.byTestId('wait-refusal')?.textContent).toBe(
        'This wallet cannot save a waiting period this long. The longest it accepts is 100 hours.'
      )
      expect(h.isDisabled('continue')).toBe(true)
      await h.type('wait-custom-hours', '100')
      expect(h.byTestId('wait-refusal')).toBeNull()
      await h.press('continue')
      expect(await storedRecord(records)).toBe(100n * 3600n)
    })

    it('disables the 7-day chip past a ceiling of 100 hours and keeps the shorter chips', async () => {
      const records = recordsOn()
      await mountWithCeiling(100, records)
      expect(disabledChipIds()).toEqual(['days7'])
      await h.press('wait-chip-days7')
      expect(checkedChipIds()).toEqual(['hours48'])
      expect(h.byTestId('wait-refusal')).toBeNull()
      await h.press('continue')
      expect(await storedRecord(records)).toBe(172800n)
    })

    it('a stored 7-day choice past a ceiling of 100 hours shows the refusal, holds continue and stores nothing', async () => {
      const records = recordsOn()
      await records.setup(CHAIN_ID, ACCOUNT).setupDraft.write(draftOf({ wait: 604800n }))
      await mountWithCeiling(100, records)
      expect(checkedChipIds()).toEqual(['days7'])
      expect(h.byTestId('wait-refusal')?.textContent).toBe(
        'This wallet cannot save a waiting period this long. The longest it accepts is 100 hours.'
      )
      expect(h.isDisabled('continue')).toBe(true)
      await h.press('continue')
      expect(h.navigate).not.toHaveBeenCalled()
      expect(await storedDraftWait(records)).toBe(604800n)
      expect(await storedRecord(records)).toBeUndefined()
      await h.press('wait-chip-hours72')
      expect(h.byTestId('wait-refusal')).toBeNull()
      await h.press('continue')
      expect(await storedDraftWait(records)).toBe(259200n)
    })

    it('keeps an entry typed with a unit as typed and refuses it as not whole hours', async () => {
      await h.mount(recordsOn())
      await h.press('wait-chip-custom')
      await h.type('wait-custom-hours', '48h')
      expect(h.inputOf('wait-custom-hours')?.value).toBe('48h')
      expect(h.byTestId('wait-refusal')?.textContent).toBe(W.wholeHours)
      expect(h.isDisabled('continue')).toBe(true)
    })

    it('refuses 48.5 as not whole hours, keeps it as typed and stores nothing until it is whole hours', async () => {
      const records = recordsOn()
      await h.mount(records)
      await h.press('wait-chip-custom')
      await h.type('wait-custom-hours', '48.5')
      expect(h.inputOf('wait-custom-hours')?.value).toBe('48.5')
      expect(h.byTestId('wait-refusal')?.textContent).toBe(W.wholeHours)
      expect(h.isDisabled('continue')).toBe(true)
      await h.press('continue')
      expect(await storedRecord(records)).toBeUndefined()
      await h.type('wait-custom-hours', '48')
      expect(h.byTestId('wait-refusal')).toBeNull()
      await h.press('continue')
      expect(await storedRecord(records)).toBe(172800n)
    })

    it('holds continue while the custom entry is empty', async () => {
      await h.mount(recordsOn())
      await h.press('wait-chip-custom')
      expect(h.byTestId('wait-refusal')).toBeNull()
      expect(h.isDisabled('continue')).toBe(true)
    })

    it('never says the contract or the chain rejects a shorter wait', async () => {
      await h.mount(recordsOn())
      expect(h.text()).not.toMatch(CHAIN_FLOOR)
      await h.press('wait-chip-custom')
      await h.type('wait-custom-hours', '6')
      expect(h.byTestId('wait-refusal')).not.toBeNull()
      expect(h.text()).not.toMatch(CHAIN_FLOOR)
      await h.type('wait-custom-hours', '5000')
      expect(h.byTestId('wait-refusal')).not.toBeNull()
      expect(h.text()).not.toMatch(CHAIN_FLOOR)
    })
  })

  describe('the default and a stored length', () => {
    it("with a draft and no record pre-selects the draft's wait and stores it in both", async () => {
      const records = recordsOn()
      await records.setup(CHAIN_ID, ACCOUNT).setupDraft.write(draftOf({ wait: 86400n }))
      await h.mount(records)
      await h.press('continue')
      expect(await storedRecord(records)).toBe(86400n)
      expect(await storedDraftWait(records)).toBe(86400n)
    })

    it("pre-selects the draft's wait over a record that disagrees", async () => {
      const records = recordsOn()
      const setup = records.setup(CHAIN_ID, ACCOUNT)
      await setup.waitingPeriod.write(604800n)
      await setup.setupDraft.write(draftOf({ wait: 259200n }))
      await h.mount(records)
      await h.press('continue')
      expect(await storedRecord(records)).toBe(259200n)
      expect(await storedDraftWait(records)).toBe(259200n)
    })

    it('keeps the rest of the draft as it was', async () => {
      const records = recordsOn()
      const draft = draftOf({
        wait: 86400n,
        ignoresPause: false,
        privacy: { backup: 'clear', publicMetadata: '0xabcd' }
      })
      await records.setup(CHAIN_ID, ACCOUNT).setupDraft.write(draft)
      await h.mount(records)
      await h.press('wait-chip-hours72')
      await h.press('continue')
      const read = await records.setup(CHAIN_ID, ACCOUNT).setupDraft.read()
      expect(read.status === 'present' && read.value).toEqual({ ...draft, wait: 259200n })
    })

    it('with no draft stores the record alone', async () => {
      const records = recordsOn()
      await h.mount(records)
      await h.press('continue')
      expect(await storedRecord(records)).toBe(172800n)
      expect(await storedDraftWait(records)).toBeUndefined()
    })

    it('pre-selects the chip of a stored record', async () => {
      const records = recordsOn()
      await records.setup(CHAIN_ID, ACCOUNT).waitingPeriod.write(604800n)
      await h.mount(records)
      expect(h.inputOf('wait-custom-hours')).toBeNull()
      await h.press('continue')
      expect(await storedRecord(records)).toBe(604800n)
    })

    it('pre-fills the custom entry with a stored length no chip holds', async () => {
      const records = recordsOn()
      await records.setup(CHAIN_ID, ACCOUNT).waitingPeriod.write(30n * 3600n)
      await h.mount(records)
      expect(h.inputOf('wait-custom-hours')?.value).toBe('30')
      await h.press('continue')
      expect(await storedRecord(records)).toBe(30n * 3600n)
    })

    const REFUSED_STORED: [string, bigint, string, string][] = [
      ['under the floor', 3600n, '1', W.belowMinimum],
      [
        'past the ceiling',
        721n * 3600n,
        '721',
        'This wallet cannot save a waiting period this long. The longest it accepts is 720 hours.'
      ],
      ['not a whole number of hours', 48n * 3600n + 1800n, '48.5', W.wholeHours]
    ]

    REFUSED_STORED.forEach(([name, seconds, text, refusal]) =>
      it(`puts a stored length ${name} into the custom entry with its refusal and holds continue`, async () => {
        const records = recordsOn()
        await records.setup(CHAIN_ID, ACCOUNT).setupDraft.write(draftOf({ wait: seconds }))
        await h.mount(records)
        expect(h.inputOf('wait-custom-hours')?.value).toBe(text)
        expect(h.byTestId('wait-refusal')?.textContent).toBe(refusal)
        expect(h.isDisabled('continue')).toBe(true)
        await h.press('continue')
        expect(await storedDraftWait(records)).toBe(seconds)
        expect(await storedRecord(records)).toBeUndefined()
      })
    )

    it('puts a refused stored record into the custom entry when no draft exists', async () => {
      const records = recordsOn()
      await records.setup(CHAIN_ID, ACCOUNT).waitingPeriod.write(3600n)
      await h.mount(records)
      expect(h.inputOf('wait-custom-hours')?.value).toBe('1')
      expect(h.isDisabled('continue')).toBe(true)
    })
  })

  describe('a stored wait still loading', () => {
    // Mounts the step on a draft holding the given wait whose reads wait until
    // the returned function lets them through.
    const mountHeld = async (wait: bigint) => {
      const faults: StorageFaults = {}
      const records = recordsOn(faults)
      await records.setup(CHAIN_ID, ACCOUNT).setupDraft.write(draftOf({ wait }))
      const release = holdReads(faults)
      await h.mount(records)
      return { records, release }
    }

    it('holds every chip and continue until the stored wait is read', async () => {
      const { release } = await mountHeld(259200n)
      expect(disabledChipIds()).toEqual(CHIP_IDS)
      expect(h.isDisabled('continue')).toBe(true)
      await release()
      expect(disabledChipIds()).toEqual([])
      expect(h.isDisabled('continue')).toBe(false)
    })

    it('keeps a stored 72 hours over presses made while it loads and never writes the 48-hour default', async () => {
      const { records, release } = await mountHeld(259200n)
      await h.press('wait-chip-hours24')
      await h.press('continue')
      await release()
      expect(checkedChipIds()).toEqual(['hours72'])
      expect(h.navigate).not.toHaveBeenCalled()
      expect(await storedDraftWait(records)).toBe(259200n)
      expect(await storedRecord(records)).toBeUndefined()
      await h.press('continue')
      expect(await storedDraftWait(records)).toBe(259200n)
      expect(await storedRecord(records)).toBe(259200n)
    })

    it('a chip picked after the stored wait is read stays and is what continue stores', async () => {
      const { records, release } = await mountHeld(259200n)
      await release()
      await h.press('wait-chip-hours24')
      expect(checkedChipIds()).toEqual(['hours24'])
      await h.press('continue')
      expect(await storedDraftWait(records)).toBe(86400n)
    })

    it('opens no custom entry while a stored custom wait loads, and shows its hours once read', async () => {
      const { release } = await mountHeld(100n * 3600n)
      expect(h.isDisabled('wait-chip-custom')).toBe(true)
      await h.press('wait-chip-custom')
      expect(h.inputOf('wait-custom-hours')).toBeNull()
      await release()
      expect(h.inputOf('wait-custom-hours')?.readOnly).toBe(false)
      expect(h.inputOf('wait-custom-hours')?.value).toBe('100')
    })
  })

  describe('what the wait is for', () => {
    it('states the notice window, that nothing else watches and what the cancel costs', async () => {
      await h.mount(recordsOn())
      expect(h.byTestId('notice-window')?.textContent).toBe(
        'The waiting period is your whole notice window. Open the wallet during the wait to see the banner for a recovery you did not start.'
      )
      expect(h.text()).toContain(
        'Until you install Kohaku on another device, nothing else watches this account.'
      )
      expect(h.byTestId('cancel-cost')?.textContent).toBe(
        "Cancelling a recovery is one transaction your account's key sends and pays for. That key needs gas it holds outside the account."
      )
    })

    it('states the floor and the default as the wallet rule', async () => {
      await h.mount(recordsOn())
      expect(h.text()).toContain(W.minimumDefault)
    })
  })

  describe('navigation', () => {
    it('back returns to the editor and stores nothing', async () => {
      const records = recordsOn()
      await h.mount(records)
      await h.press('back')
      expect(h.navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetupEditor)
      expect(await storedRecord(records)).toBeUndefined()
    })

    it('continue opens the privacy step once the length is stored', async () => {
      await h.mount(recordsOn())
      await h.press('continue')
      expect(h.navigate).toHaveBeenCalledTimes(1)
      expect(h.navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetupPrivacy)
    })
  })

  describe('a storage failure', () => {
    it('a refused write shows its line, stays on the step and leaves continue usable', async () => {
      const records = recordsOn({ set: 1 })
      await h.mount(records)
      await h.press('continue')
      expect(h.byTestId('write-failed')?.textContent).toBe(S.records.writeFailed)
      expect(h.navigate).not.toHaveBeenCalled()
      expect(h.isDisabled('continue')).toBe(false)
      expect(await storedRecord(records)).toBeUndefined()
    })

    it('the next continue that stores clears the line and moves on', async () => {
      const records = recordsOn({ set: 1 })
      await h.mount(records)
      await h.press('continue')
      await h.press('continue')
      expect(h.byTestId('write-failed')).toBeNull()
      expect(await storedRecord(records)).toBe(172800n)
      expect(h.navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetupPrivacy)
    })

    const withDraftAndRecord = async (faults: StorageFaults) => {
      const records = recordsOn(faults)
      const setup = records.setup(CHAIN_ID, ACCOUNT)
      await setup.setupDraft.write(draftOf({ wait: 259200n }))
      await setup.waitingPeriod.write(259200n)
      return records
    }

    it('a refused record after the draft took the new wait puts the earlier wait back in the draft', async () => {
      const faults: StorageFaults = {}
      const records = await withDraftAndRecord(faults)
      await h.mount(records)
      await h.press('wait-chip-hours24')
      faults.records = ['waitingPeriod']
      await h.press('continue')
      expect(h.byTestId('write-failed')?.textContent).toBe(S.records.writeFailed)
      expect(h.navigate).not.toHaveBeenCalled()
      expect(await storedDraftWait(records)).toBe(259200n)
      expect(await storedRecord(records)).toBe(259200n)
    })

    it('a refused draft leaves the record at the earlier wait', async () => {
      const faults: StorageFaults = {}
      const records = await withDraftAndRecord(faults)
      await h.mount(records)
      await h.press('wait-chip-hours24')
      faults.records = ['setupDraft']
      await h.press('continue')
      expect(h.byTestId('write-failed')?.textContent).toBe(S.records.writeFailed)
      expect(h.navigate).not.toHaveBeenCalled()
      expect(await storedDraftWait(records)).toBe(259200n)
      expect(await storedRecord(records)).toBe(259200n)
    })

    it('a failed read shows its line, holds continue and stores nothing once storage is back', async () => {
      const faults: StorageFaults = { get: true }
      const records = recordsOn(faults)
      await h.mount(records)
      expect(h.byTestId('load-failed')?.textContent).toBe(S.records.loadFailed)
      expect(h.isDisabled('continue')).toBe(true)
      faults.get = false
      await h.press('continue')
      expect(h.navigate).not.toHaveBeenCalled()
      expect(await storedRecord(records)).toBeUndefined()
      expect(await storedDraftWait(records)).toBeUndefined()
    })
  })
})
