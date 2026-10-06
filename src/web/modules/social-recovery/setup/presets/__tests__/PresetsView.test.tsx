/**
 * @jest-environment jsdom
 *
 * The presets view mounted with the app's own components, the real en.json
 * and real records on an in-memory double of the extension's storage helper.
 * Nothing is mocked. jsdom has no `TextEncoder`, which viem reads when it
 * loads, so the test sets Node's before it loads the modules.
 */
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { TextDecoder, TextEncoder } from 'util'

import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import type { ThemeProps } from '@common/styles/themeConfig'
import type { Address, Clause, SetupDraft } from '@web/modules/social-recovery/sdk-interfaces'
import type { PresetChoice, PresetId } from '@web/modules/social-recovery/setup/presets'
import type {
  Enrollment,
  RecordStorage,
  WalletRecords
} from '@web/modules/social-recovery/shared/records'

Object.assign(globalThis, { TextEncoder, TextDecoder })
// React only runs effects and state updates inside act() when this flag is set.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const { encodeAbiParameters }: typeof import('viem') = require('viem')
const React: typeof import('react') = require('react')
const {
  parse,
  stringify
}: typeof import('@ambire-common/libs/richJson/richJson') = require('@ambire-common/libs/richJson/richJson')
const en: typeof import('@common/config/localization/translations/en.json') = require('@common/config/localization/translations/en.json')
const { t }: typeof import('@common/config/localization').default =
  require('@common/config/localization').default
const {
  ThemeContext
}: typeof import('@common/contexts/themeContext') = require('@common/contexts/themeContext')
const themeConfig: typeof import('@common/styles/themeConfig') = require('@common/styles/themeConfig')
const {
  addressBookOf,
  WALLET_RECOVERY_CHAIN
}: typeof import('@web/modules/social-recovery/shared/client') = require('@web/modules/social-recovery/shared/client')
const {
  createWalletRecords,
  SETUP_RECORD_NAMES
}: typeof import('@web/modules/social-recovery/shared/records') = require('@web/modules/social-recovery/shared/records')
const {
  clausesOfShape
}: typeof import('@web/modules/social-recovery/setup/presets') = require('@web/modules/social-recovery/setup/presets')
const {
  DEADLINE_LOCALE,
  renderShortAddress
}: typeof import('@web/modules/social-recovery/shared/display') = require('@web/modules/social-recovery/shared/display')
const PresetsView: typeof import('../PresetsView').default = require('../PresetsView').default
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const CHAIN_ID = 11155111
const ACCOUNT: Address = '0x1111111111111111111111111111111111111111'
const OTHER_ACCOUNT: Address = '0x2222222222222222222222222222222222222222'
const BOOK = addressBookOf(WALLET_RECOVERY_CHAIN)
const S = en.socialRecovery

const THEME = Object.fromEntries(
  Object.entries(themeConfig.default).map(([name, byType]) => [
    name,
    byType[themeConfig.THEME_TYPES.LIGHT]
  ])
) as ThemeProps

const THEME_CONTEXT: ThemeContextReturnType = {
  theme: THEME,
  themeType: themeConfig.THEME_TYPES.LIGHT,
  selectedThemeType: themeConfig.THEME_TYPES.LIGHT,
  setThemeType: () => {}
}

// Switches a test flips to make the storage refuse: `get` and `remove` while
// on, `set` for the next number of writes.
const makeStorage = (
  faults: { get?: boolean; remove?: boolean; set?: number } = {}
): RecordStorage => {
  const raw = new Map<string, string>()
  return {
    get: async (key, defaultValue) => {
      if (faults.get) {
        throw new Error('storage unavailable')
      }
      const stored = key && raw.get(key)
      return stored ? parse(stored) : defaultValue
    },
    getAll: async () =>
      Object.fromEntries([...raw.entries()].map(([key, stored]) => [key, parse(stored)])),
    set: async (key, value) => {
      if (faults.set) {
        // eslint-disable-next-line no-param-reassign
        faults.set -= 1
        throw new Error('storage full')
      }
      raw.set(key, typeof value === 'string' ? value : stringify(value))
      return null
    },
    remove: async (key) => {
      if (faults.remove) {
        throw new Error('storage unavailable')
      }
      raw.delete(key)
      return null
    },
    setEntries: async (entries) => {
      if (faults.set) {
        // eslint-disable-next-line no-param-reassign
        faults.set -= 1
        throw new Error('storage full')
      }
      Object.entries(entries).forEach(([key, value]) =>
        raw.set(key, typeof value === 'string' ? value : stringify(value))
      )
    },
    removeKeys: async (keys) => {
      if (faults.remove) {
        throw new Error('storage unavailable')
      }
      keys.forEach((key) => raw.delete(key))
    }
  }
}

// Holds every read of one account's records while `held` is on, until the
// test releases them.
const holdReads = (storage: RecordStorage, account: Address) => {
  const waiting: (() => void)[] = []
  const hold = {
    held: false,
    release: () => waiting.splice(0).forEach((resume) => resume()),
    storage: {
      ...storage,
      get: async (key, defaultValue) => {
        if (hold.held && key?.includes(account.toLowerCase())) {
          await new Promise<void>((resume) => {
            waiting.push(resume)
          })
        }
        return storage.get(key, defaultValue)
      }
    } as RecordStorage
  }
  return hold
}

// The words any line about a guided setup would use.
const GUIDE_ME = /guide|guided|wizard/i

describe('the presets view', () => {
  let container: HTMLDivElement
  let root: Root
  let records: WalletRecords
  let onOpenEditor: jest.Mock
  let onRecover: jest.Mock

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    records = createWalletRecords({ storage: makeStorage() })
    onOpenEditor = jest.fn()
    onRecover = jest.fn()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const setup = () => records.setup(CHAIN_ID, ACCOUNT)

  const mount = async (account: Address = ACCOUNT) => {
    await act(async () => {
      root.render(
        <ThemeContext.Provider value={THEME_CONTEXT}>
          <PresetsView
            records={records}
            chainId={CHAIN_ID}
            account={account}
            onOpenEditor={onOpenEditor}
            onRecover={onRecover}
          />
        </ThemeContext.Provider>
      )
    })
  }

  const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)
  const allByTestId = (id: string) =>
    Array.from(
      container.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`),
      (node) => node.textContent
    )
  const text = () => container.textContent ?? ''

  const press = async (id: string) => {
    const node = byTestId(id)
    if (!node) {
      throw new Error(`nothing to press: ${id}`)
    }
    await act(async () => {
      node.click()
    })
  }

  const storedDraft = async (): Promise<SetupDraft> => {
    const read = await setup().setupDraft.read()
    if (read.status !== 'present') {
      throw new Error('no draft stored')
    }
    return read.value
  }

  const storedStatuses = async () =>
    (await Promise.all(SETUP_RECORD_NAMES.map((name) => setup()[name].read()))).map(
      ({ status }) => status
    )

  describe('before any enrollment', () => {
    it('states the three costs in their exact words', async () => {
      await mount()
      expect(
        Array.from(byTestId('cost-lines')?.children ?? [], (line) => line.textContent)
      ).toEqual([S.costLines.save, S.costLines.recovery, S.costLines.cancel])
    })

    it('carries the honesty note in its exact words', async () => {
      await mount()
      expect(byTestId('honesty-note')?.textContent).toBe(
        'Recovery helps if you lose your key. It cannot stop someone who already has it.'
      )
    })

    it('tells a holder with one device that start from scratch builds a single-method path', async () => {
      await mount()
      expect(byTestId('preset-fromScratch')?.textContent).toContain(
        'With one device, start from scratch builds a single-method path.'
      )
    })

    it('offers customize alone, with no guided setup and no line that names it', async () => {
      await mount()
      expect(byTestId('customize')?.textContent).toBe(S.presets.customize)
      expect(text()).not.toMatch(GUIDE_ME)
    })

    it('shows the four presets and start from scratch, and the account as not set up', async () => {
      await mount()
      expect(
        ['deviceAndGuardians', 'deviceAndId', 'eitherOne', 'guardiansOnly', 'fromScratch'].map(
          (id) =>
            byTestId(`preset-${id}`)?.textContent?.startsWith(
              S.presets.cards[id as PresetChoice].name
            )
        )
      ).toEqual([true, true, true, true, true])
      expect(byTestId('recovery-status')?.textContent).toBe(S.status.recovery.notSetUp)
    })

    it('shows on each card the rule line of its shape, word for word', async () => {
      await mount()
      const lines: Record<PresetId, string> = {
        deviceAndGuardians:
          'Together with your required methods, any 2 of these 3 recover this account. Losing more than 1 locks you out.',
        deviceAndId: 'Both must answer. Losing either locks you out.',
        eitherOne: 'Either one alone can recover this account. Either one alone can also take it.',
        guardiansOnly: 'Any 2 of these 3 recover this account. Losing more than 1 locks you out.'
      }
      ;(Object.keys(lines) as PresetId[]).forEach((id) => {
        expect(allByTestId(`rule-line-${id}`)).toEqual([lines[id]])
      })
    })

    it('stores nothing and opens nothing while the holder only reads', async () => {
      await mount()
      expect(await storedStatuses()).toEqual(SETUP_RECORD_NAMES.map(() => 'absent'))
      expect(onOpenEditor).not.toHaveBeenCalled()
    })

    it('opens the recovery of another account from its own action', async () => {
      await mount()
      await press('recover')
      expect(onRecover).toHaveBeenCalledTimes(1)
      expect(onOpenEditor).not.toHaveBeenCalled()
    })
  })

  describe('a pick', () => {
    it('customize stores an empty draft and path, then opens the editor', async () => {
      await mount()
      await press('customize')
      expect((await storedDraft()).clauses).toEqual([])
      const path = await setup().path.read()
      expect(path.status === 'present' && path.value).toEqual([])
      expect(onOpenEditor).toHaveBeenCalledTimes(1)
    })

    it('start from scratch and continue store an empty draft, then open the editor', async () => {
      await mount()
      await press('preset-fromScratch')
      expect(onOpenEditor).not.toHaveBeenCalled()
      await press('continue')
      expect((await storedDraft()).clauses).toEqual([])
      expect(onOpenEditor).toHaveBeenCalledTimes(1)
    })

    it('continue does nothing until a card is picked', async () => {
      await mount()
      expect(text()).toContain(S.presets.continueUnlock)
      await press('continue')
      expect(onOpenEditor).not.toHaveBeenCalled()
      expect((await setup().setupDraft.read()).status).toBe('absent')
    })

    const SHAPES: [PresetId, number[], string[]][] = [
      ['deviceAndGuardians', [1, 2], ['passkey', 'ecdsa', 'ecdsa', 'ecdsa']],
      ['deviceAndId', [1, 1], ['passkey', 'zkpassport']],
      ['eitherOne', [1], ['passkey', 'zkpassport']],
      ['guardiansOnly', [2], ['ecdsa', 'ecdsa', 'ecdsa']]
    ]

    SHAPES.forEach(([id, thresholds, kinds]) =>
      it(`${id} and continue store its empty shape, then open the editor`, async () => {
        await mount()
        await press(`preset-${id}`)
        await press('continue')
        const draft = await storedDraft()
        expect(draft.clauses.map(({ threshold }) => threshold)).toEqual(thresholds)
        const slots = draft.clauses.flatMap(({ credentials }) => credentials)
        expect(slots.map(({ label }) => label)).toEqual(kinds)
        expect(
          slots.every(({ method, config }) => /^0x0{40}$/.test(method) && config === '0x')
        ).toBe(true)
        const path = await setup().path.read()
        expect(path.status === 'present' && path.value).toEqual(draft.clauses)
        expect(onOpenEditor).toHaveBeenCalledTimes(1)
      })
    )

    it('the last card picked is the one continue stores', async () => {
      await mount()
      await press('preset-guardiansOnly')
      await press('preset-eitherOne')
      await press('continue')
      expect((await storedDraft()).clauses.map(({ threshold }) => threshold)).toEqual([1])
    })
  })

  describe('with an unfinished draft', () => {
    const SAVED_AT = new Date(2026, 7, 12, 12, 0).getTime()

    const storeDraft = async (enrollments: Enrollment[]) => {
      records = createWalletRecords({ storage: makeStorage(), now: () => SAVED_AT })
      await setup().setupDraft.write({
        wait: 172800n,
        clauses: [],
        ignoresPause: true,
        privacy: { backup: 'encrypted', publicMetadata: '0x' }
      })
      await setup().enrollments.write(enrollments)
      await setup().waitingPeriod.write(86400n)
    }

    const ENROLLMENTS: Enrollment[] = [
      {
        credential: { method: BOOK.methods.passkey, config: '0x01' },
        test: 'passed',
        backup: 'device-bound'
      },
      { credential: { method: BOOK.methods.ecdsa, config: '0x0a' }, test: 'not-tested' },
      { credential: { method: BOOK.methods.ecdsa, config: '0x0b' }, test: 'not-tested' }
    ]

    it('shows the draft age and resume in place of the cards', async () => {
      await storeDraft(ENROLLMENTS)
      await mount()
      expect(byTestId('draft-age')?.textContent).toMatch(
        /^Your setup is unfinished\. Draft from 12 Aug.*Nothing is saved on chain until you confirm\.$/
      )
      expect(byTestId('presets-grid')).toBeNull()
      expect(byTestId('resume')?.textContent).toBe(S.presets.resume.action)
      expect(text()).toContain(S.records.startOverNote)
    })

    it('shows each enrolled row with its chip, each guardian on its own row, and the count once', async () => {
      await storeDraft(ENROLLMENTS)
      await mount()
      expect(allByTestId('resume-row')).toEqual([
        'Passkey on this deviceTested',
        'GuardianNot tested',
        'GuardianNot tested'
      ])
      expect(allByTestId('not-yet-active')).toEqual([
        '2 added, not saved on chain yetNot yet active'
      ])
    })

    it('reads a synced passkey as "Passkey" with its failed test and the line that it may never work', async () => {
      await storeDraft([
        {
          credential: { method: BOOK.methods.passkey, config: '0x01' },
          test: 'failed',
          backup: 'synced'
        }
      ])
      await mount()
      expect(allByTestId('resume-row')).toEqual([
        `${S.methodNames.passkey}${S.ceremony.testFailedLine}${S.status.method.testFailed}`
      ])
    })

    it('resume opens the editor and keeps the draft', async () => {
      await storeDraft(ENROLLMENTS)
      await mount()
      await press('resume')
      expect(onOpenEditor).toHaveBeenCalledTimes(1)
      expect((await setup().enrollments.read()).status).toBe('present')
    })

    it('start over wipes the six records and returns to the cards', async () => {
      await storeDraft(ENROLLMENTS)
      await setup().inventory.write(['passport'])
      await setup().path.write([])
      await setup().passwordSet.write('password-set')
      expect(await storedStatuses()).toEqual(SETUP_RECORD_NAMES.map(() => 'present'))
      await mount()
      await press('start-over')
      expect(await storedStatuses()).toEqual(SETUP_RECORD_NAMES.map(() => 'absent'))
      expect(byTestId('presets-resume')).toBeNull()
      expect(byTestId('presets-grid')).not.toBeNull()
      expect(onOpenEditor).not.toHaveBeenCalled()
    })
  })

  const isDisabled = (id: string) => byTestId(id)?.getAttribute('aria-disabled') === 'true'

  // Noon of the reader's own day, so the day and month are the same in every zone.
  const DRAFTED_AT = new Date(2026, 7, 12, 12, 0).getTime()

  const storeOn = async (
    faults: { get?: boolean; remove?: boolean; set?: number },
    clauses: Clause[],
    enrollments: Enrollment[]
  ) => {
    records = createWalletRecords({ storage: makeStorage(faults), now: () => DRAFTED_AT })
    await setup().setupDraft.write({
      wait: 172800n,
      clauses,
      ignoresPause: true,
      privacy: { backup: 'encrypted', publicMetadata: '0x' }
    })
    await setup().enrollments.write(enrollments)
  }

  const DEVICE_PASSKEY: Enrollment = {
    credential: { method: BOOK.methods.passkey, config: '0x01' },
    test: 'passed',
    backup: 'device-bound'
  }

  describe('a failed read', () => {
    it('shows the failed read with a retry, and neither the cards nor the resume block', async () => {
      records = createWalletRecords({ storage: makeStorage({ get: true }) })
      await mount()
      expect(byTestId('presets-load-failed')?.textContent).toContain(S.records.loadFailed)
      expect(byTestId('load-retry')?.textContent).toBe(S.writes.tryAgain)
      expect(byTestId('presets-grid')).toBeNull()
      expect(byTestId('presets-resume')).toBeNull()
      expect(container.querySelector('[data-testid^="preset-"]')).toBeNull()
      expect(byTestId('customize')).toBeNull()
    })

    it('retry reads again and shows the cards once the storage answers', async () => {
      const faults = { get: true }
      records = createWalletRecords({ storage: makeStorage(faults) })
      await mount()
      await press('load-retry')
      expect(byTestId('presets-load-failed')).not.toBeNull()
      faults.get = false
      await press('load-retry')
      expect(byTestId('presets-load-failed')).toBeNull()
      expect(byTestId('presets-grid')).not.toBeNull()
    })

    it('retry brings back the resume block of a stored draft', async () => {
      const faults = { get: false }
      await storeOn(faults, [], [DEVICE_PASSKEY])
      faults.get = true
      await mount()
      expect(byTestId('presets-load-failed')).not.toBeNull()
      faults.get = false
      await press('load-retry')
      expect(byTestId('presets-load-failed')).toBeNull()
      expect(byTestId('presets-grid')).toBeNull()
      expect(allByTestId('resume-row')).toEqual(['Passkey on this deviceTested'])
    })

    it('fails the read of a stored enrollment with no credential', async () => {
      await storeOn({}, [], [{ test: 'passed' } as unknown as Enrollment])
      await mount()
      expect(byTestId('presets-load-failed')?.textContent).toContain(S.records.loadFailed)
      expect(byTestId('presets-resume')).toBeNull()
      expect(byTestId('presets-grid')).toBeNull()
    })

    it('start over from a record that cannot be read wipes the six records and shows the cards', async () => {
      await storeOn({}, [], [{ test: 'passed' } as unknown as Enrollment])
      await setup().inventory.write(['passport'])
      await setup().path.write([])
      await setup().waitingPeriod.write(86400n)
      await setup().passwordSet.write('password-set')
      await mount()
      expect(byTestId('presets-load-failed')?.textContent).toContain(S.records.startOverNote)
      await press('start-over')
      expect(await storedStatuses()).toEqual(SETUP_RECORD_NAMES.map(() => 'absent'))
      expect(byTestId('presets-load-failed')).toBeNull()
      expect(byTestId('presets-grid')).not.toBeNull()
      expect(onOpenEditor).not.toHaveBeenCalled()
    })

    it('names a stored method that is not an address by the method noun, and reads on', async () => {
      await storeOn(
        {},
        [],
        [
          {
            credential: { method: 'passkey', config: '0x01' },
            test: 'passed'
          } as unknown as Enrollment
        ]
      )
      await mount()
      expect(byTestId('presets-load-failed')).toBeNull()
      expect(allByTestId('resume-row')).toEqual([`${S.display.nouns.method}Tested`])
    })
  })

  describe('a refused write', () => {
    it('a refused pick shows the line, re-enables the buttons and stores nothing', async () => {
      records = createWalletRecords({ storage: makeStorage({ set: 1 }) })
      await mount()
      expect(isDisabled('continue')).toBe(true)
      await press('preset-deviceAndId')
      await press('continue')
      expect(byTestId('write-failed')?.textContent).toBe(S.records.writeFailed)
      expect(isDisabled('continue')).toBe(false)
      expect(isDisabled('customize')).toBe(false)
      expect(await storedStatuses()).toEqual(SETUP_RECORD_NAMES.map(() => 'absent'))
      expect(onOpenEditor).not.toHaveBeenCalled()
      expect(byTestId('presets-grid')).not.toBeNull()
    })

    it('the next pick that stores clears the line and opens the editor', async () => {
      records = createWalletRecords({ storage: makeStorage({ set: 1 }) })
      await mount()
      await press('preset-deviceAndId')
      await press('continue')
      await press('continue')
      expect(byTestId('write-failed')).toBeNull()
      expect((await storedDraft()).clauses.map(({ threshold }) => threshold)).toEqual([1, 1])
      expect(onOpenEditor).toHaveBeenCalledTimes(1)
    })

    it('a pick writes its draft and path in one storage call, so a refused call stores neither', async () => {
      const storage = makeStorage()
      let calls = 0
      records = createWalletRecords({
        storage: {
          ...storage,
          set: async () => {
            throw new Error('a single write is not expected')
          },
          setEntries: async () => {
            calls += 1
            throw new Error('storage full')
          }
        }
      })
      await mount()
      await press('preset-deviceAndId')
      await press('continue')
      expect(calls).toBe(1)
      expect(byTestId('write-failed')?.textContent).toBe(S.records.writeFailed)
      expect((await setup().setupDraft.read()).status).toBe('absent')
      expect((await setup().path.read()).status).toBe('absent')
      expect(byTestId('presets-grid')).not.toBeNull()
      expect(byTestId('presets-resume')).toBeNull()
      expect(onOpenEditor).not.toHaveBeenCalled()
    })

    it('a refused customize shows the line, and customize again stores the empty draft', async () => {
      records = createWalletRecords({ storage: makeStorage({ set: 1 }) })
      await mount()
      await press('customize')
      expect(byTestId('write-failed')?.textContent).toBe(S.records.writeFailed)
      expect((await setup().setupDraft.read()).status).toBe('absent')
      expect(onOpenEditor).not.toHaveBeenCalled()
      await press('customize')
      expect(byTestId('write-failed')).toBeNull()
      expect((await storedDraft()).clauses).toEqual([])
      expect(onOpenEditor).toHaveBeenCalledTimes(1)
    })

    it('a refused start over shows the line, keeps the draft and its actions', async () => {
      const faults = { remove: false }
      await storeOn(faults, [], [DEVICE_PASSKEY])
      faults.remove = true
      await mount()
      await press('start-over')
      expect(byTestId('write-failed')?.textContent).toBe(S.records.writeFailed)
      expect((await setup().setupDraft.read()).status).toBe('present')
      expect((await setup().enrollments.read()).status).toBe('present')
      expect(byTestId('presets-resume')).not.toBeNull()
      expect(byTestId('presets-grid')).toBeNull()
      expect(isDisabled('start-over')).toBe(false)
      expect(isDisabled('resume')).toBe(false)
      expect(onOpenEditor).not.toHaveBeenCalled()
    })

    it('a start over that lands after a refusal clears the line and returns to the cards', async () => {
      const faults = { remove: false }
      await storeOn(faults, [], [DEVICE_PASSKEY])
      faults.remove = true
      await mount()
      await press('start-over')
      faults.remove = false
      await press('start-over')
      expect(byTestId('write-failed')).toBeNull()
      expect(await storedStatuses()).toEqual(SETUP_RECORD_NAMES.map(() => 'absent'))
      expect(byTestId('presets-resume')).toBeNull()
      expect(byTestId('presets-grid')).not.toBeNull()
    })
  })

  describe('the resume block', () => {
    it('lists the unfilled kinds after the enrolled rows, one row each, not started', async () => {
      await storeOn(
        {},
        clausesOfShape([
          { threshold: 1, slots: ['passkey'] },
          { threshold: 2, slots: ['ecdsa', 'ecdsa', 'ecdsa'] },
          { threshold: 1, slots: ['zkpassport', 'aadhaar'] }
        ]),
        [DEVICE_PASSKEY]
      )
      await mount()
      expect(allByTestId('resume-row')).toEqual([
        'Passkey on this deviceTested',
        'GuardiansNot started',
        'PassportNot started',
        'Aadhaar identityNot started'
      ])
    })

    it('names an unfilled passkey slot "Passkey", its backup not yet known', async () => {
      await storeOn({}, clausesOfShape([{ threshold: 1, slots: ['passkey', 'zkpassport'] }]), [])
      await mount()
      expect(allByTestId('resume-row')).toEqual(['PasskeyNot started', 'PassportNot started'])
    })

    it('gives no not-started row to a kind with an enrolled credential', async () => {
      await storeOn(
        {},
        clausesOfShape([
          { threshold: 1, slots: ['passkey'] },
          { threshold: 2, slots: ['ecdsa', 'ecdsa', 'ecdsa'] }
        ]),
        [
          DEVICE_PASSKEY,
          { credential: { method: BOOK.methods.ecdsa, config: '0x0a' }, test: 'not-tested' }
        ]
      )
      await mount()
      const rows = allByTestId('resume-row')
      expect(rows).toEqual(['Passkey on this deviceTested', 'GuardianNot tested'])
      expect(allByTestId('resume-chip')).not.toContain(S.status.method.notStarted)
    })

    it('names an enrolled Aadhaar identity "Aadhaar identity"', async () => {
      await storeOn(
        {},
        [],
        [{ credential: { method: BOOK.methods.aadhaar, config: '0x03' }, test: 'passed' }]
      )
      await mount()
      expect(allByTestId('resume-row')).toEqual(['Aadhaar identityTested'])
    })

    it('dates the draft exactly by its day and month, with no time and no zone', async () => {
      await storeOn({}, [], [])
      await mount()
      const dayAndMonth = new Intl.DateTimeFormat(DEADLINE_LOCALE, {
        day: 'numeric',
        month: 'short',
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }).format(new Date(DRAFTED_AT))
      expect(dayAndMonth).toBe('12 Aug')
      const line = byTestId('draft-age')?.textContent ?? ''
      expect(line).toBe(
        `Your setup is unfinished. Draft from ${dayAndMonth}. Nothing is saved on chain until you confirm.`
      )
      expect(line).not.toMatch(/[0-9]{1,2}:[0-9]{2}|\b(AM|PM|UTC|GMT)\b|2026/)
    })

    const failedPasskey = (cause?: string): Enrollment => ({
      credential: { method: BOOK.methods.passkey, config: '0x01' },
      test: 'failed',
      backup: 'synced',
      cause
    })

    const NO_MATCH_CAUSES = ['check-rejected', 'check-rejected: signer 0x0a']
    NO_MATCH_CAUSES.forEach((cause) => {
      it(`shows beside a failed passkey test with the cause "${cause}" the no-match line alone`, async () => {
        await storeOn({}, [], [failedPasskey(cause)])
        await mount()
        expect(allByTestId('resume-note')).toEqual([S.ceremony.testFailedNoMatch])
        expect(allByTestId('resume-row')).toEqual([
          `${S.methodNames.passkey}${S.ceremony.testFailedNoMatch}${S.status.method.testFailed}`
        ])
      })
    })

    const MAY_NEVER_WORK_CAUSES = [
      'browser-error: NotAllowedError',
      'relying-party-mismatch: SecurityError',
      'an-unknown-slug',
      undefined
    ]
    MAY_NEVER_WORK_CAUSES.forEach((cause) => {
      it(`shows beside a failed passkey test with ${
        cause === undefined ? 'no cause' : `the cause "${cause}"`
      } the may-never-work line alone`, async () => {
        await storeOn({}, [], [failedPasskey(cause)])
        await mount()
        expect(allByTestId('resume-note')).toEqual([S.ceremony.testFailedLine])
        expect(allByTestId('resume-row')).toEqual([
          `${S.methodNames.passkey}${S.ceremony.testFailedLine}${S.status.method.testFailed}`
        ])
      })
    })

    it('shows no failed line beside a passed or a not-tested passkey', async () => {
      await storeOn(
        {},
        [],
        [
          { ...failedPasskey('check-rejected'), test: 'passed' },
          { ...failedPasskey('check-rejected'), test: 'not-tested' }
        ]
      )
      await mount()
      expect(allByTestId('resume-note')).toEqual([])
      expect(allByTestId('resume-row')).toEqual([
        `${S.methodNames.passkey}${S.status.method.tested}`,
        `${S.methodNames.passkey}${S.status.method.notTested}`
      ])
    })

    const GUARDIANS: Address[] = [
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      '0xcccccccccccccccccccccccccccccccccccccccc'
    ]
    const guardianAt = (index: number, test: Enrollment['test'], cause?: string): Enrollment => ({
      credential: {
        method: BOOK.methods.ecdsa,
        config: encodeAbiParameters([{ type: 'address' }], [GUARDIANS[index]])
      },
      test,
      cause
    })

    it('shows three guardians on three rows with their own outcomes, and the not-yet-active note once', async () => {
      await storeOn(
        {},
        [],
        [
          guardianAt(0, 'passed'),
          guardianAt(1, 'not-tested'),
          guardianAt(2, 'failed', 'check-rejected')
        ]
      )
      await mount()
      const guardian = S.display.nouns.guardian
      expect(allByTestId('resume-row')).toEqual([
        `${guardian}${renderShortAddress(GUARDIANS[0])}${S.status.method.tested}`,
        `${guardian}${renderShortAddress(GUARDIANS[1])}${S.status.method.notTested}`,
        `${guardian}${renderShortAddress(GUARDIANS[2])}${S.ceremony.testFailedNoMatch}${
          S.status.method.testFailed
        }`
      ])
      expect(allByTestId('not-yet-active')).toEqual([
        `${S.presets.resume.addedNotSaved.replace('{{count}}', '3')}${S.status.method.notYetActive}`
      ])
    })

    it('shows no not-yet-active note without a guardian', async () => {
      await storeOn({}, [], [DEVICE_PASSKEY])
      await mount()
      expect(byTestId('not-yet-active')).toBeNull()
    })
  })

  describe('the cards as radios', () => {
    const CHOICES: PresetChoice[] = [
      'deviceAndGuardians',
      'deviceAndId',
      'eitherOne',
      'guardiansOnly',
      'fromScratch'
    ]
    const checked = () =>
      CHOICES.map((choice) => byTestId(`preset-${choice}`)?.getAttribute('aria-checked'))

    it('marks no card checked before a pick', async () => {
      await mount()
      expect(checked()).toEqual(CHOICES.map(() => 'false'))
    })

    it('marks the picked card checked and every other card not checked', async () => {
      await mount()
      await press('preset-eitherOne')
      expect(checked()).toEqual(['false', 'false', 'true', 'false', 'false'])
      await press('preset-fromScratch')
      expect(checked()).toEqual(['false', 'false', 'false', 'false', 'true'])
    })
  })

  describe('another account', () => {
    const other = () => records.setup(CHAIN_ID, OTHER_ACCOUNT)

    const draftFor = async (setupRecords: ReturnType<typeof setup>, passkey: Enrollment) => {
      await setupRecords.setupDraft.write({
        wait: 172800n,
        clauses: [],
        ignoresPause: true,
        privacy: { backup: 'encrypted', publicMetadata: '0x' }
      })
      await setupRecords.enrollments.write([passkey])
    }

    it("a read of the first account that ends after the switch does not replace the other's draft", async () => {
      const held = holdReads(makeStorage(), ACCOUNT)
      records = createWalletRecords({ storage: held.storage, now: () => DRAFTED_AT })
      await draftFor(other(), DEVICE_PASSKEY)
      held.held = true
      await mount(ACCOUNT)
      await mount(OTHER_ACCOUNT)
      expect(allByTestId('resume-row')).toEqual([
        `${S.methodNames.passkeyOnThisDevice}${S.status.method.tested}`
      ])
      await act(async () => {
        held.release()
      })
      expect(byTestId('presets-grid')).toBeNull()
      expect(byTestId('customize')).toBeNull()
      expect(allByTestId('resume-row')).toEqual([
        `${S.methodNames.passkeyOnThisDevice}${S.status.method.tested}`
      ])
      const enrollments = await other().enrollments.read()
      expect(enrollments.status === 'present' && enrollments.value).toEqual([DEVICE_PASSKEY])
    })

    it("a read of the first account's draft that ends after the switch does not show it for the other", async () => {
      const held = holdReads(makeStorage(), ACCOUNT)
      records = createWalletRecords({ storage: held.storage, now: () => DRAFTED_AT })
      await draftFor(setup(), DEVICE_PASSKEY)
      held.held = true
      await mount(ACCOUNT)
      await mount(OTHER_ACCOUNT)
      expect(byTestId('presets-grid')).not.toBeNull()
      await act(async () => {
        held.release()
      })
      expect(byTestId('presets-resume')).toBeNull()
      expect(byTestId('presets-grid')).not.toBeNull()
      expect(byTestId('resume-row')).toBeNull()
    })
  })

  describe('start over while a save is on its way', () => {
    const WHILE_SAVING = t('socialRecovery.records.startOverWhileSaving')
    const WRITE_FAILED = t('socialRecovery.records.writeFailed')
    const REQUEST_ID = 'social-recovery-sender:pending'

    const claimSave = async (account: Address = ACCOUNT) => {
      const draft = await storedDraft()
      const { claimed } = await records.saveInFlight(CHAIN_ID, account).claim({
        draft,
        prepared: {
          kind: 'call',
          target: account,
          value: 0n,
          data: '0xabcdef',
          sender: 'account',
          block: { number: 7_000_000, hash: `0x${'ab'.repeat(32)}` }
        },
        requestId: REQUEST_ID,
        claimedAt: DRAFTED_AT
      })
      expect(claimed).toBe(true)
    }

    const storedRecords = () => Promise.all(SETUP_RECORD_NAMES.map((name) => setup()[name].read()))

    const storeFullDraft = async (faults: { get?: boolean; remove?: boolean; set?: number }) => {
      await storeOn(
        faults,
        clausesOfShape([
          { threshold: 1, slots: ['passkey'] },
          { threshold: 2, slots: ['ecdsa', 'ecdsa', 'ecdsa'] }
        ]),
        [DEVICE_PASSKEY]
      )
      await setup().inventory.write(['passport'])
      await setup().path.write([])
      await setup().waitingPeriod.write(86400n)
      await setup().passwordSet.write('password-set')
    }

    it('the two lines read differently, and the key resolves to its text', () => {
      expect(WHILE_SAVING).toBe(S.records.startOverWhileSaving)
      expect(WHILE_SAVING).not.toBe('socialRecovery.records.startOverWhileSaving')
      expect(WHILE_SAVING).not.toBe(WRITE_FAILED)
    })

    it('from the resume block, shows the line, removes nothing and keeps the block as it was', async () => {
      await storeFullDraft({})
      await claimSave()
      const before = await storedRecords()
      expect(before.every(({ status }) => status === 'present')).toBe(true)
      await mount()
      const rowsBefore = allByTestId('resume-row')
      const ageBefore = byTestId('draft-age')?.textContent
      await press('start-over')
      expect(byTestId('start-over-while-saving')?.textContent).toBe(WHILE_SAVING)
      expect(byTestId('write-failed')).toBeNull()
      expect(await storedRecords()).toEqual(before)
      expect((await records.saveInFlight(CHAIN_ID, ACCOUNT).read()).status).toBe('present')
      expect(byTestId('presets-resume')).not.toBeNull()
      expect(byTestId('presets-grid')).toBeNull()
      expect(allByTestId('resume-row')).toEqual(rowsBefore)
      expect(byTestId('draft-age')?.textContent).toBe(ageBefore)
      expect(byTestId('start-over')?.textContent).toBe(S.presets.resume.startOver)
      expect(isDisabled('start-over')).toBe(false)
      expect(isDisabled('resume')).toBe(false)
      expect(onOpenEditor).not.toHaveBeenCalled()
    })

    it('with no save on its way, removes the records and shows neither line', async () => {
      await storeFullDraft({})
      await mount()
      await press('start-over')
      expect(await storedStatuses()).toEqual(SETUP_RECORD_NAMES.map(() => 'absent'))
      expect(byTestId('start-over-while-saving')).toBeNull()
      expect(byTestId('write-failed')).toBeNull()
      expect(byTestId('presets-grid')).not.toBeNull()
    })

    it('once the save is released, the next start over removes the records and clears the line', async () => {
      await storeFullDraft({})
      await claimSave()
      await mount()
      await press('start-over')
      expect(byTestId('start-over-while-saving')?.textContent).toBe(WHILE_SAVING)
      expect(await records.saveInFlight(CHAIN_ID, ACCOUNT).release(REQUEST_ID)).toBe(true)
      await press('start-over')
      expect(await storedStatuses()).toEqual(SETUP_RECORD_NAMES.map(() => 'absent'))
      expect(byTestId('start-over-while-saving')).toBeNull()
      expect(byTestId('write-failed')).toBeNull()
      expect(byTestId('presets-resume')).toBeNull()
      expect(byTestId('presets-grid')).not.toBeNull()
    })

    it('a storage that refuses the removal shows the write-failed line and not the new one', async () => {
      const faults = { remove: false }
      await storeFullDraft(faults)
      faults.remove = true
      await mount()
      await press('start-over')
      expect(byTestId('write-failed')?.textContent).toBe(WRITE_FAILED)
      expect(byTestId('start-over-while-saving')).toBeNull()
      expect(await storedStatuses()).toEqual(SETUP_RECORD_NAMES.map(() => 'present'))
    })

    it('the two lines never show together: each press replaces the line of the last', async () => {
      const faults = { remove: false }
      await storeFullDraft(faults)
      faults.remove = true
      await mount()
      await press('start-over')
      expect(byTestId('write-failed')).not.toBeNull()
      faults.remove = false
      await claimSave()
      await press('start-over')
      expect(byTestId('start-over-while-saving')?.textContent).toBe(WHILE_SAVING)
      expect(byTestId('write-failed')).toBeNull()
      await records.saveInFlight(CHAIN_ID, ACCOUNT).release(REQUEST_ID)
      faults.remove = true
      await press('start-over')
      expect(byTestId('write-failed')?.textContent).toBe(WRITE_FAILED)
      expect(byTestId('start-over-while-saving')).toBeNull()
    })

    it('from the failed read, shows the line, removes nothing and keeps the failed read', async () => {
      await storeOn({}, [], [{ test: 'passed' } as unknown as Enrollment])
      await setup().inventory.write(['passport'])
      await claimSave()
      const before = await storedRecords()
      await mount()
      expect(byTestId('presets-load-failed')).not.toBeNull()
      await press('start-over')
      expect(byTestId('start-over-while-saving')?.textContent).toBe(WHILE_SAVING)
      expect(byTestId('write-failed')).toBeNull()
      expect(await storedRecords()).toEqual(before)
      expect(byTestId('presets-load-failed')).not.toBeNull()
      expect(byTestId('presets-grid')).toBeNull()
      expect(isDisabled('start-over')).toBe(false)
      expect(isDisabled('load-retry')).toBe(false)
    })

    it('from the failed read, a start over after the release removes the records and clears the line', async () => {
      await storeOn({}, [], [{ test: 'passed' } as unknown as Enrollment])
      await claimSave()
      await mount()
      await press('start-over')
      expect(byTestId('start-over-while-saving')).not.toBeNull()
      await records.saveInFlight(CHAIN_ID, ACCOUNT).release(REQUEST_ID)
      await press('start-over')
      expect(await storedStatuses()).toEqual(SETUP_RECORD_NAMES.map(() => 'absent'))
      expect(byTestId('start-over-while-saving')).toBeNull()
      expect(byTestId('presets-load-failed')).toBeNull()
      expect(byTestId('presets-grid')).not.toBeNull()
    })

    it("a save on its way for another account does not refuse this account's start over", async () => {
      await storeFullDraft({})
      await claimSave(OTHER_ACCOUNT)
      await mount()
      await press('start-over')
      expect(await storedStatuses()).toEqual(SETUP_RECORD_NAMES.map(() => 'absent'))
      expect(byTestId('start-over-while-saving')).toBeNull()
      expect(byTestId('write-failed')).toBeNull()
      expect(byTestId('presets-grid')).not.toBeNull()
      expect((await records.saveInFlight(CHAIN_ID, OTHER_ACCOUNT).read()).status).toBe('present')
    })
  })
})
