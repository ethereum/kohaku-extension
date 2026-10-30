/**
 * @jest-environment jsdom
 *
 * Step 3 of 3 mounted whole: the new phrase handed to the keystore, its words,
 * the key that will control the account, the add through the wallet's picker,
 * and the hand-over to the account step.
 */
import { act } from 'react-dom/test-utils'

import i18n from '@common/config/localization'
import {
  basicAccount,
  byTestId,
  dispatched,
  flush,
  hardwareKey,
  internalKey,
  isDisabled,
  keystoreSends,
  mockEdge,
  mount,
  movesAway,
  OFFSET_KEY,
  offsetKey,
  ORDINARY_KEY,
  PHRASE,
  press,
  resetEdge,
  seedlessKey,
  setController,
  slotKey,
  smartAccount,
  text,
  unmount,
  visits,
  walletListsSlot,
  where
} from '@web/modules/social-recovery/onboarding/fast-track/__fixtures__/harness'
import type {
  FailureCase,
  KeysCase
} from '@web/modules/social-recovery/onboarding/fast-track/__fixtures__/types'

const KEY_STEP = '/social-recovery/fast-track/key'
const ACKNOWLEDGED = { acknowledged: true }
const ACCOUNT_STEP = `/social-recovery/recovery/account?route=fresh-install&to=${ORDINARY_KEY}`
const PICKER_OPEN = 'MAIN_CONTROLLER_ACCOUNT_PICKER_INIT_PRIVATE_KEY_OR_SEED_PHRASE'
const PICKER_INIT = 'MAIN_CONTROLLER_ACCOUNT_PICKER_INIT'
const ADD_TEMP_SEED = 'KEYSTORE_CONTROLLER_ADD_TEMP_SEED'
const SEND_TEMP_SEED = 'KEYSTORE_CONTROLLER_SEND_TEMP_SEED_TO_UI'
const OTHER_PHRASE = 'legal winner thank year wave sausage worth useful legal winner thank yellow'
const LIMIT_MS = 60_000
const CREATING = i18n.t('socialRecovery.fastTrack.key.creating')
const ADD_PENDING = i18n.t('socialRecovery.fastTrack.key.addPending')
const ADDING = i18n.t('socialRecovery.loading.addingAccount')

const types = () => dispatched().map(({ type }) => type)
const LOGGED_IN_ENTRY = '/social-recovery/recovery'

const visibility = { current: 'visible' as DocumentVisibilityState }
Object.defineProperty(document, 'visibilityState', {
  configurable: true,
  get: () => visibility.current
})

const tabShows = async (state: DocumentVisibilityState) => {
  visibility.current = state
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

const atWords = async () => {
  await mount(KEY_STEP, ACKNOWLEDGED)
  await keystoreSends(PHRASE)
}

const continueAfterAcknowledging = async () => {
  await press('fast-track-key-acknowledge')
  await press('fast-track-key-continue')
}

const addFails = async () => {
  await setController('picker', { addAccountsStatus: 'LOADING' })
  await setController('picker', { addAccountsStatus: 'INITIAL' })
}

describe('the key step', () => {
  beforeEach(async () => {
    resetEdge()
    visibility.current = 'visible'
    await setController('keystore', { hasPasswordSecret: true, isUnlocked: true })
  })

  afterEach(() => {
    unmount()
    jest.useRealTimers()
  })

  describe('the warning on a direct open', () => {
    it('meets a direct open with the warning and makes no phrase', async () => {
      await mount(KEY_STEP)

      expect(byTestId('recovery-warning')).not.toBeNull()
      expect(byTestId('fast-track-key')).toBeNull()
      expect(mockEdge.made).toBe(0)
      expect(dispatched()).toEqual([])
    })

    it('drops the acknowledgment from the history entry, so a reload meets the warning', async () => {
      await mount(KEY_STEP, ACKNOWLEDGED)

      expect(byTestId('fast-track-key')).not.toBeNull()
      const reloaded = visits[visits.length - 1].state

      await mount(KEY_STEP, reloaded)

      expect(byTestId('recovery-warning')).not.toBeNull()
      expect(byTestId('fast-track-key')).toBeNull()
    })
  })

  describe('the new phrase', () => {
    it('hands a phrase made here to the keystore and asks for it back', async () => {
      await mount(KEY_STEP, ACKNOWLEDGED)

      expect(dispatched()).toEqual([
        {
          kind: 'dispatch',
          type: ADD_TEMP_SEED,
          params: { seed: PHRASE, hdPathTemplate: "m/44'/60'/0'/0/<account>" }
        },
        { kind: 'dispatch', type: SEND_TEMP_SEED, params: undefined }
      ])
      expect(byTestId('fast-track-key-waiting')).not.toBeNull()
    })

    it('says the key is being created under the spinner until the words show', async () => {
      await mount(KEY_STEP, ACKNOWLEDGED)

      expect(byTestId('fast-track-key-creating')?.textContent).toBe(CREATING)
      expect(
        byTestId('fast-track-key-creating')?.querySelector('[data-testid="loading-block"]')
      ).not.toBeNull()
      expect(byTestId('fast-track-key-pending')).toBeNull()

      await keystoreSends(PHRASE)

      expect(byTestId('fast-track-key-creating')).toBeNull()
      expect(text()).not.toContain(CREATING)
    })

    it("shows the words in order, the counter at 3 of 3 and the basic account's key derived from that phrase", async () => {
      await atWords()

      const words = PHRASE.split(' ').map(
        (_, index) => byTestId(`fast-track-key-word-${index}`)?.textContent
      )
      expect(words).toEqual(PHRASE.split(' '))
      expect(byTestId('fast-track-key-step')?.textContent).toBe(
        i18n.t('socialRecovery.fastTrack.stepCounter', { step: 3, total: 3 })
      )
      expect(mockEdge.derived).toEqual([PHRASE])
      expect(byTestId('fast-track-key-address')?.textContent).toBe(ORDINARY_KEY)
      expect(text()).not.toContain(OFFSET_KEY)
    })

    it('keeps the key, the words and the backup warning in the main column, the notes beside them', async () => {
      await atWords()

      const main = byTestId('fast-track-key-columns-main')
      const aside = byTestId('fast-track-key-columns-aside')
      const order = Array.from(main?.querySelectorAll('[data-testid]') ?? []).map((node) =>
        node.getAttribute('data-testid')
      )
      const at = (id: string) => order.indexOf(id)
      expect(at('fast-track-key-title')).toBeGreaterThan(-1)
      expect(at('fast-track-key-controlling')).toBeGreaterThan(at('fast-track-key-title'))
      expect(at('fast-track-key-words')).toBeGreaterThan(at('fast-track-key-controlling'))
      expect(at('fast-track-key-only-backup')).toBeGreaterThan(at('fast-track-key-words'))
      expect(at('fast-track-key-acknowledge')).toBeGreaterThan(at('fast-track-key-only-backup'))
      expect(aside?.querySelector('[data-testid="fast-track-key-created"]')).not.toBeNull()
      expect(aside?.querySelector('[data-testid="fast-track-key-paper"]')?.textContent).toContain(
        i18n.t('socialRecovery.fastTrack.key.paper')
      )
      expect(aside?.querySelector('[data-testid="fast-track-key-paper"]')?.textContent).toContain(
        i18n.t('socialRecovery.fastTrack.key.whereToKeep')
      )
    })

    it('ignores a phrase the keystore holds that this step did not make', async () => {
      await mount(KEY_STEP, ACKNOWLEDGED)
      await keystoreSends(OTHER_PHRASE)

      expect(byTestId('fast-track-key-words')).toBeNull()
      expect(mockEdge.derived).toEqual([])
    })

    it('takes no pasted address: the step has no text field', async () => {
      await atWords()

      expect(document.querySelectorAll('input:not([type="checkbox"]), textarea')).toHaveLength(0)
    })

    it('calls the phrase a recovery phrase and never a seed', async () => {
      await atWords()

      expect(text()).toContain(i18n.t('socialRecovery.fastTrack.key.title'))
      expect(text()).not.toMatch(/seed/i)
    })

    it('hands the same phrase over again when the tab shows while it waits', async () => {
      await mount(KEY_STEP, ACKNOWLEDGED)
      await tabShows('hidden')
      await tabShows('visible')

      expect(types()).toEqual([ADD_TEMP_SEED, SEND_TEMP_SEED, ADD_TEMP_SEED, SEND_TEMP_SEED])
      expect(dispatched(ADD_TEMP_SEED).map(({ params }) => params?.seed)).toEqual([PHRASE, PHRASE])
      expect(mockEdge.made).toBe(1)

      await keystoreSends(PHRASE)
      await tabShows('hidden')
      await tabShows('visible')

      expect(types()).toHaveLength(4)
    })

    it('fails with retry when the keystore never confirms, and retry makes a new phrase', async () => {
      jest.useFakeTimers()
      mockEdge.phrases = [PHRASE, OTHER_PHRASE]
      await mount(KEY_STEP, ACKNOWLEDGED)

      await act(async () => {
        jest.advanceTimersByTime(LIMIT_MS)
      })

      expect(byTestId('fast-track-key-create-failed')?.textContent).toContain(
        i18n.t('socialRecovery.fastTrack.key.createFailed')
      )

      await press('fast-track-key-retry')
      await keystoreSends(OTHER_PHRASE)

      expect(dispatched(ADD_TEMP_SEED).map(({ params }) => params?.seed)).toEqual([
        PHRASE,
        OTHER_PHRASE
      ])
      expect(byTestId('fast-track-key-word-0')?.textContent).toBe('legal')
    })
  })

  describe('the add', () => {
    it('refuses continue until the holder confirms the words are written down', async () => {
      await atWords()

      expect(isDisabled('fast-track-key-continue')).toBe(true)
      await press('fast-track-key-continue')

      expect(types()).toEqual([ADD_TEMP_SEED, SEND_TEMP_SEED])
    })

    it("opens the picker on the phrase with no smart account selected and lets the picker's init add", async () => {
      await atWords()
      await continueAfterAcknowledging()

      expect(dispatched(PICKER_OPEN).map(({ params }) => params)).toEqual([
        {
          privKeyOrSeed: PHRASE,
          seedPassphrase: null,
          hdPathTemplate: "m/44'/60'/0'/0/<account>"
        }
      ])
      expect(types().slice(2)).toEqual([PICKER_OPEN, PICKER_INIT])
      expect(isDisabled('fast-track-key-continue')).toBe(true)
      expect(isDisabled('fast-track-key-back')).toBe(true)
    })

    it('closes the picker session and the newly-added marks, then replaces itself with the account step', async () => {
      await atWords()
      await continueAfterAcknowledging()
      await setController('picker', { addAccountsStatus: 'LOADING' })
      await setController('picker', { addAccountsStatus: 'SUCCESS' })
      await walletListsSlot()

      expect(mockEdge.events.slice(-3)).toEqual([
        { kind: 'dispatch', type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_RESET', params: undefined },
        {
          kind: 'dispatch',
          type: 'ACCOUNTS_CONTROLLER_RESET_ACCOUNTS_NEWLY_ADDED_STATE',
          params: undefined
        },
        { kind: 'navigate', to: ACCOUNT_STEP.slice(1), replace: true, state: ACKNOWLEDGED }
      ])
      expect(where()).toBe(ACCOUNT_STEP)
      expect(dispatched('MAIN_CONTROLLER_ACCOUNT_PICKER_RESET')).toHaveLength(1)
    })

    it('does not go on where the wallet lists a smart account with a dedicated key, only once it lists the basic account', async () => {
      await atWords()
      await continueAfterAcknowledging()
      await setController('picker', { addAccountsStatus: 'LOADING' })
      await setController('picker', { addAccountsStatus: 'SUCCESS' })
      await setController('keystore', { keys: [offsetKey] })
      await setController('accounts', { accounts: [smartAccount] })
      await setController('selected', { account: smartAccount })
      await setController('auth', { authStatus: 'authenticated' })

      expect(movesAway()).toEqual([])
      expect(dispatched('MAIN_CONTROLLER_ACCOUNT_PICKER_RESET')).toEqual([])
      expect(byTestId('fast-track-key-address')?.textContent).toBe(ORDINARY_KEY)

      await setController('keystore', { keys: [offsetKey, slotKey] })
      await setController('accounts', { accounts: [smartAccount, basicAccount] })

      expect(where()).toBe(ACCOUNT_STEP)
      expect(dispatched(PICKER_OPEN)).toHaveLength(1)
    })

    const notOrdinary: KeysCase[] = [
      { name: 'no key at all', keys: [] },
      { name: 'the key as a dedicated key', keys: [internalKey(ORDINARY_KEY, true)] },
      {
        name: 'the key with no recovery phrase behind it',
        keys: [seedlessKey]
      },
      { name: 'a key of another kind at that address', keys: [hardwareKey] }
    ]
    notOrdinary.forEach(({ name, keys }) => {
      it(`does not go on where the basic account is listed but the keystore holds ${name}`, async () => {
        await atWords()
        await continueAfterAcknowledging()
        await setController('keystore', { keys })
        await setController('accounts', { accounts: [basicAccount] })
        await setController('selected', { account: basicAccount })
        await setController('auth', { authStatus: 'authenticated' })

        expect(movesAway()).toEqual([])

        await setController('keystore', { keys: [slotKey] })

        expect(where()).toBe(ACCOUNT_STEP)
      })
    })

    it('waits for the wallet to be signed in before it leaves', async () => {
      await atWords()
      await continueAfterAcknowledging()
      await setController('keystore', { keys: [slotKey] })
      await setController('accounts', { accounts: [basicAccount] })

      expect(movesAway()).toEqual([])

      await setController('auth', { authStatus: 'authenticated' })

      expect(where()).toBe(ACCOUNT_STEP)
    })

    it('shows a failed add with retry, and retry opens the picker again on the same phrase', async () => {
      await atWords()
      await continueAfterAcknowledging()
      await addFails()

      expect(byTestId('fast-track-key-add-failed')).not.toBeNull()

      await press('fast-track-key-retry')

      expect(dispatched(PICKER_OPEN).map(({ params }) => params?.privKeyOrSeed)).toEqual([
        PHRASE,
        PHRASE
      ])
      expect(dispatched(ADD_TEMP_SEED)).toHaveLength(1)
      expect(byTestId('fast-track-key-add-failed')).toBeNull()
    })

    it('sends no second add while the picker still runs one', async () => {
      await atWords()
      await continueAfterAcknowledging()
      await addFails()
      await setController('picker', { addAccountsStatus: 'LOADING' })

      await press('fast-track-key-retry')

      expect(dispatched(PICKER_OPEN)).toHaveLength(1)
      expect(byTestId('fast-track-key-add-failed')).toBeNull()
    })

    it('sends no second add where the wallet already lists the slot', async () => {
      await atWords()
      await continueAfterAcknowledging()
      await addFails()
      await setController('keystore', { keys: [slotKey] })
      await setController('accounts', { accounts: [basicAccount] })

      await press('fast-track-key-retry')

      expect(dispatched(PICKER_OPEN)).toHaveLength(1)

      await setController('auth', { authStatus: 'authenticated' })

      expect(where()).toBe(ACCOUNT_STEP)
    })

    it('reads a success that lands after the failure as listed, with no retry', async () => {
      await atWords()
      await continueAfterAcknowledging()
      await addFails()
      await walletListsSlot()

      expect(dispatched(PICKER_OPEN)).toHaveLength(1)
      expect(types().slice(-2)).toEqual([
        'MAIN_CONTROLLER_ACCOUNT_PICKER_RESET',
        'ACCOUNTS_CONTROLLER_RESET_ACCOUNTS_NEWLY_ADDED_STATE'
      ])
      expect(where()).toBe(ACCOUNT_STEP)
    })

    it('frees Back at the limit while the picker still runs the add, and sends nothing again', async () => {
      jest.useFakeTimers()
      await atWords()
      await continueAfterAcknowledging()
      await setController('picker', { addAccountsStatus: 'LOADING' })
      const sent = mockEdge.events.length

      expect(isDisabled('fast-track-key-back')).toBe(true)
      await act(async () => {
        jest.advanceTimersByTime(LIMIT_MS + 1)
      })

      expect(byTestId('fast-track-key-add-failed')).toBeNull()
      expect(isDisabled('fast-track-key-continue')).toBe(true)
      expect(isDisabled('fast-track-key-back')).toBe(false)
      expect(mockEdge.events.length).toBe(sent)
    })

    it('says the wallet is still adding once the limit passes, and not before', async () => {
      jest.useFakeTimers()
      await atWords()
      await continueAfterAcknowledging()
      await setController('picker', { addAccountsStatus: 'LOADING' })

      await act(async () => {
        jest.advanceTimersByTime(LIMIT_MS - 1)
      })
      expect(byTestId('fast-track-key-pending')).toBeNull()
      expect(byTestId('fast-track-key-adding-line')?.textContent).toBe(ADDING)
      expect(
        byTestId('fast-track-key-adding-line')?.querySelector('[data-testid="loading-row"]')
      ).not.toBeNull()
      expect(isDisabled('fast-track-key-continue')).toBe(true)

      await act(async () => {
        jest.advanceTimersByTime(1)
      })

      expect(byTestId('fast-track-key-pending')?.textContent).toBe(ADD_PENDING)
      expect(byTestId('fast-track-key-add-failed')).toBeNull()
      expect(byTestId('fast-track-key-creating')).toBeNull()
      expect(text()).not.toContain(i18n.t('socialRecovery.writes.tryAgain'))
    })

    it('drops the still-adding line once the slot is listed', async () => {
      jest.useFakeTimers()
      await atWords()
      await continueAfterAcknowledging()
      await setController('picker', { addAccountsStatus: 'LOADING' })
      await act(async () => {
        jest.advanceTimersByTime(LIMIT_MS)
      })
      expect(byTestId('fast-track-key-pending')).not.toBeNull()

      await setController('picker', { addAccountsStatus: 'SUCCESS' })
      await walletListsSlot()

      expect(where()).toBe(ACCOUNT_STEP)
      expect(byTestId('fast-track-key-pending')).toBeNull()
    })

    it('leaves for the warning on Back while its own add is pending, and sends nothing', async () => {
      jest.useFakeTimers()
      await atWords()
      await continueAfterAcknowledging()
      await setController('picker', { addAccountsStatus: 'LOADING' })
      await act(async () => {
        jest.advanceTimersByTime(LIMIT_MS)
      })
      const sent = dispatched().length

      await press('fast-track-key-back')
      await flush()

      expect(movesAway()).toMatchObject([{ to: 'social-recovery/recover', replace: false }])
      expect(byTestId('recovery-warning')).not.toBeNull()
      expect(dispatched()).toHaveLength(sent)
      expect(dispatched(PICKER_OPEN)).toHaveLength(1)
      expect(dispatched('MAIN_CONTROLLER_ACCOUNT_PICKER_RESET')).toEqual([])
    })

    it('frees Back at the limit after a success with the slot not listed yet, and sends nothing again', async () => {
      jest.useFakeTimers()
      await atWords()
      await continueAfterAcknowledging()
      await setController('picker', { addAccountsStatus: 'LOADING' })
      await setController('picker', { addAccountsStatus: 'SUCCESS' })
      const sent = mockEdge.events.length

      expect(isDisabled('fast-track-key-back')).toBe(true)
      await act(async () => {
        jest.advanceTimersByTime(LIMIT_MS + 1)
      })

      expect(byTestId('fast-track-key-add-failed')).toBeNull()
      expect(isDisabled('fast-track-key-back')).toBe(false)
      expect(mockEdge.events.length).toBe(sent)
    })

    it('fails at the limit where the idle picker never started', async () => {
      jest.useFakeTimers()
      await atWords()
      await continueAfterAcknowledging()

      await act(async () => {
        jest.advanceTimersByTime(LIMIT_MS - 1)
      })
      expect(byTestId('fast-track-key-add-failed')).toBeNull()

      await act(async () => {
        jest.advanceTimersByTime(1)
      })
      expect(byTestId('fast-track-key-add-failed')).not.toBeNull()
    })
  })

  describe('a return to the step', () => {
    it('makes no phrase where the fast track already added the slot, and goes on to the account step with that basic account', async () => {
      await walletListsSlot()

      await mount(KEY_STEP, ACKNOWLEDGED)

      expect(mockEdge.made).toBe(0)
      expect(dispatched()).toEqual([])
      expect(movesAway()).toEqual([
        { kind: 'navigate', to: ACCOUNT_STEP.slice(1), replace: true, state: ACKNOWLEDGED }
      ])
      expect(where()).toBe(ACCOUNT_STEP)
    })

    it('takes the fast track back from the door to the account step with the slot, never to the logged-in entry', async () => {
      await walletListsSlot()
      await mount('/social-recovery/recover')

      await press('recovery-warning-acknowledge')
      await press('recovery-warning-continue')
      await flush()
      await flush()

      expect(mockEdge.made).toBe(0)
      expect(where()).toBe(ACCOUNT_STEP)
      expect(visits.some(({ path }) => path === LOGGED_IN_ENTRY)).toBe(false)
    })

    it('makes no phrase where onboarding is complete with a basic account selected, and replaces itself with the logged-in entry', async () => {
      await walletListsSlot()
      await setController('wallet', { isSetupComplete: true })

      await mount(KEY_STEP, ACKNOWLEDGED)

      expect(mockEdge.made).toBe(0)
      expect(dispatched()).toEqual([])
      expect(movesAway()).toEqual([
        { kind: 'navigate', to: LOGGED_IN_ENTRY.slice(1), replace: true, state: ACKNOWLEDGED },
        // The entry keeps the acknowledgment and drops it from its history entry.
        { kind: 'navigate', to: LOGGED_IN_ENTRY, replace: true, state: undefined }
      ])
      expect(where()).toBe(LOGGED_IN_ENTRY)
    })

    it('sends a wallet whose selected account is a smart account to the logged-in entry', async () => {
      await setController('keystore', { keys: [slotKey, offsetKey] })
      await setController('accounts', { accounts: [basicAccount, smartAccount] })
      await setController('selected', { account: smartAccount })
      await setController('auth', { authStatus: 'authenticated' })

      await mount(KEY_STEP, ACKNOWLEDGED)

      expect(mockEdge.made).toBe(0)
      expect(where()).toBe(LOGGED_IN_ENTRY)
    })

    it('takes a wallet with a smart account selected from the door to the logged-in entry, with no way back to the door', async () => {
      await setController('keystore', { keys: [slotKey, offsetKey] })
      await setController('accounts', { accounts: [basicAccount, smartAccount] })
      await setController('selected', { account: smartAccount })
      await setController('auth', { authStatus: 'authenticated' })
      await mount('/social-recovery/recover')

      await press('recovery-warning-acknowledge')
      await press('recovery-warning-continue')
      await flush()
      await flush()

      expect(mockEdge.made).toBe(0)
      expect(where()).toBe(LOGGED_IN_ENTRY)
      expect(byTestId('recovery-entry')).not.toBeNull()
      expect(byTestId('entry-owner')).not.toBeNull()
      expect(byTestId('recover')).toBeNull()
      expect(visits.some(({ path }) => path.startsWith('/social-recovery/recovery/account'))).toBe(
        false
      )
      expect(visits.filter(({ path }) => path === '/social-recovery/recover')).toHaveLength(1)

      // The entry takes the door's acknowledgment: its warning shows ticked and
      // continue opens once an account is chosen, with no second tick.
      expect(byTestId('recovery-warning-acknowledge')?.querySelector('svg')).not.toBeNull()
      const basicChoice = `entry-owner-choice-${basicAccount.addr.toLowerCase()}`
      expect(isDisabled(basicChoice)).toBe(false)
      await press(basicChoice)
      expect(isDisabled('entry-owner-continue')).toBe(false)
      await press('entry-owner-continue')
      expect(where()).toBe(
        `/social-recovery/recovery/account?route=logged-in&to=${basicAccount.addr}`
      )
    })

    it('meets a direct open with accounts listed with the warning, and sends nothing', async () => {
      await walletListsSlot()

      await mount(KEY_STEP)

      expect(byTestId('recovery-warning')).not.toBeNull()
      expect(mockEdge.made).toBe(0)
      expect(dispatched()).toEqual([])
      expect(movesAway()).toEqual([])
    })

    it('goes on to the logged-in entry once the holder acknowledges that warning, where onboarding is complete', async () => {
      await walletListsSlot()
      await setController('wallet', { isSetupComplete: true })
      await mount(KEY_STEP)

      await press('recovery-warning-acknowledge')
      await press('recovery-warning-continue')
      await flush()

      expect(mockEdge.made).toBe(0)
      expect(dispatched()).toEqual([])
      expect(where()).toBe(LOGGED_IN_ENTRY)
    })
  })

  describe('a step that opens while an earlier add still runs', () => {
    const atEarlierAdd = async () => {
      await setController('picker', { addAccountsStatus: 'LOADING' })
      await mount(KEY_STEP, ACKNOWLEDGED)
    }

    it('makes no phrase, sends nothing and shows no words while it waits', async () => {
      await atEarlierAdd()

      expect(mockEdge.made).toBe(0)
      expect(dispatched()).toEqual([])
      expect(byTestId('fast-track-key-words')).toBeNull()
      expect(text()).not.toContain('junk')
      expect(byTestId('fast-track-key-waiting')).not.toBeNull()
      expect(isDisabled('fast-track-key-back')).toBe(true)
    })

    it('says the wallet adds the account, with no line saying a key is being created', async () => {
      await atEarlierAdd()

      expect(byTestId('fast-track-key-adding')?.textContent).toBe(ADDING)
      expect(
        byTestId('fast-track-key-adding')?.querySelector('[data-testid="loading-block"]')
      ).not.toBeNull()
      expect(byTestId('fast-track-key-creating')).toBeNull()
      expect(text()).not.toContain(CREATING)
      expect(byTestId('fast-track-key-pending')).toBeNull()
    })

    it('says the wallet is still adding once the limit passes while that add runs', async () => {
      jest.useFakeTimers()
      await atEarlierAdd()

      await act(async () => {
        jest.advanceTimersByTime(LIMIT_MS)
      })

      expect(byTestId('fast-track-key-pending')?.textContent).toBe(ADD_PENDING)
      expect(byTestId('fast-track-key-creating')).toBeNull()
      expect(byTestId('fast-track-key-waiting')).not.toBeNull()
      expect(dispatched()).toEqual([])
    })

    it('still goes on to the account step where that add lists the slot after it read as failed', async () => {
      await atEarlierAdd()
      await setController('picker', { addAccountsStatus: 'INITIAL' })

      expect(byTestId('fast-track-key-add-failed')).not.toBeNull()

      await walletListsSlot()

      expect(mockEdge.made).toBe(0)
      expect(types()).toEqual([
        'MAIN_CONTROLLER_ACCOUNT_PICKER_RESET',
        'ACCOUNTS_CONTROLLER_RESET_ACCOUNTS_NEWLY_ADDED_STATE'
      ])
      expect(where()).toBe(ACCOUNT_STEP)
    })

    it('goes on to the account step once that add lists the slot, closing the picker session', async () => {
      await atEarlierAdd()
      await setController('picker', { addAccountsStatus: 'SUCCESS' })

      expect(movesAway()).toEqual([])

      await walletListsSlot()
      await setController('picker', { addAccountsStatus: 'INITIAL' })

      expect(mockEdge.made).toBe(0)
      expect(dispatched()).toEqual([
        { kind: 'dispatch', type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_RESET', params: undefined },
        {
          kind: 'dispatch',
          type: 'ACCOUNTS_CONTROLLER_RESET_ACCOUNTS_NEWLY_ADDED_STATE',
          params: undefined
        }
      ])
      expect(movesAway()).toEqual([
        { kind: 'navigate', to: ACCOUNT_STEP.slice(1), replace: true, state: ACKNOWLEDGED }
      ])
      expect(where()).toBe(ACCOUNT_STEP)
    })

    it('keeps waiting while that add still runs with the slot listed, and moves on once it ends', async () => {
      await atEarlierAdd()
      await walletListsSlot()

      expect(dispatched()).toEqual([])
      expect(movesAway()).toEqual([])
      expect(byTestId('fast-track-key-waiting')).not.toBeNull()

      await setController('picker', { addAccountsStatus: 'SUCCESS' })

      expect(mockEdge.made).toBe(0)
      expect(dispatched()).toEqual([
        { kind: 'dispatch', type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_RESET', params: undefined },
        {
          kind: 'dispatch',
          type: 'ACCOUNTS_CONTROLLER_RESET_ACCOUNTS_NEWLY_ADDED_STATE',
          params: undefined
        }
      ])
      expect(movesAway()).toEqual([
        { kind: 'navigate', to: ACCOUNT_STEP.slice(1), replace: true, state: ACKNOWLEDGED }
      ])
      expect(where()).toBe(ACCOUNT_STEP)
    })

    const failures: FailureCase[] = [
      { name: 'goes idle with no success', ends: { addAccountsStatus: 'INITIAL' } },
      {
        name: 'ends in a page error',
        ends: { addAccountsStatus: 'INITIAL', pageError: 'The page could not be derived' }
      }
    ]
    failures.forEach(({ name, ends }) => {
      it(`fails with retry where that add ${name}, and retry makes one new phrase`, async () => {
        await atEarlierAdd()
        await setController('picker', ends)

        expect(byTestId('fast-track-key-add-failed')?.textContent).toContain(
          i18n.t('socialRecovery.fastTrack.key.createFailed')
        )
        expect(mockEdge.made).toBe(0)
        expect(dispatched()).toEqual([])

        await press('fast-track-key-retry')
        await keystoreSends(PHRASE)

        expect(mockEdge.made).toBe(1)
        expect(types()).toEqual([ADD_TEMP_SEED, SEND_TEMP_SEED])
        expect(byTestId('fast-track-key-add-failed')).toBeNull()
        expect(byTestId('fast-track-key-word-11')?.textContent).toBe('junk')
      })
    })

    it('frees Back at the limit while that add still runs, and sends nothing', async () => {
      jest.useFakeTimers()
      await atEarlierAdd()

      await act(async () => {
        jest.advanceTimersByTime(LIMIT_MS - 1)
      })
      expect(isDisabled('fast-track-key-back')).toBe(true)

      await act(async () => {
        jest.advanceTimersByTime(1)
      })

      expect(isDisabled('fast-track-key-back')).toBe(false)
      expect(byTestId('fast-track-key-add-failed')).toBeNull()
      expect(mockEdge.made).toBe(0)
      expect(dispatched()).toEqual([])
    })

    it('leaves for the warning on Back at the limit, with nothing sent', async () => {
      jest.useFakeTimers()
      await atEarlierAdd()
      await act(async () => {
        jest.advanceTimersByTime(LIMIT_MS)
      })

      await press('fast-track-key-back')
      await flush()

      expect(movesAway()).toMatchObject([{ to: 'social-recovery/recover', replace: false }])
      expect(byTestId('recovery-warning')).not.toBeNull()
      expect(mockEdge.made).toBe(0)
      expect(dispatched()).toEqual([])
    })

    const settled = ['INITIAL', 'SUCCESS']
    settled.forEach((status) => {
      it(`makes one phrase at mount where the picker reads ${status}`, async () => {
        await setController('picker', { addAccountsStatus: status })

        await mount(KEY_STEP, ACKNOWLEDGED)

        expect(mockEdge.made).toBe(1)
        expect(types()).toEqual([ADD_TEMP_SEED, SEND_TEMP_SEED])
      })
    })
  })

  describe('a step that opens while the picker still selects the accounts of an earlier visit', () => {
    const atEarlierSelection = async () => {
      await setController('picker', { selectNextAccountStatus: 'LOADING' })
      await mount(KEY_STEP, ACKNOWLEDGED)
    }

    it('makes no phrase and sends nothing while the selection runs', async () => {
      await atEarlierSelection()

      expect(mockEdge.made).toBe(0)
      expect(dispatched()).toEqual([])
      expect(byTestId('fast-track-key-words')).toBeNull()
      expect(byTestId('fast-track-key-creating')).toBeNull()
      expect(byTestId('fast-track-key-waiting')).not.toBeNull()
      expect(isDisabled('fast-track-key-back')).toBe(true)
    })

    it('waits through the add that follows and goes on once the slot is listed', async () => {
      await atEarlierSelection()
      await setController('picker', {
        selectNextAccountStatus: 'SUCCESS',
        addAccountsStatus: 'LOADING'
      })

      expect(mockEdge.made).toBe(0)
      expect(dispatched()).toEqual([])
      expect(byTestId('fast-track-key-add-failed')).toBeNull()

      await walletListsSlot()

      expect(movesAway()).toEqual([])

      await setController('picker', { addAccountsStatus: 'SUCCESS' })

      expect(mockEdge.made).toBe(0)
      expect(types()).toEqual([
        'MAIN_CONTROLLER_ACCOUNT_PICKER_RESET',
        'ACCOUNTS_CONTROLLER_RESET_ACCOUNTS_NEWLY_ADDED_STATE'
      ])
      expect(where()).toBe(ACCOUNT_STEP)
    })

    it('reads no failure where the selection ends before its add starts', async () => {
      await atEarlierSelection()
      await setController('picker', { selectNextAccountStatus: 'SUCCESS' })

      expect(byTestId('fast-track-key-add-failed')).toBeNull()
      expect(byTestId('fast-track-key-waiting')).not.toBeNull()

      await setController('picker', { addAccountsStatus: 'LOADING' })
      await walletListsSlot()
      await setController('picker', { addAccountsStatus: 'SUCCESS' })

      expect(mockEdge.made).toBe(0)
      expect(where()).toBe(ACCOUNT_STEP)
    })

    it('does not move on while the selection still runs with accounts listed', async () => {
      await atEarlierSelection()
      await walletListsSlot()

      expect(dispatched()).toEqual([])
      expect(movesAway()).toEqual([])

      await setController('picker', { selectNextAccountStatus: 'SUCCESS' })

      expect(where()).toBe(ACCOUNT_STEP)
    })

    it('fails with retry where the selection ends in a page error, and retry makes one new phrase', async () => {
      await atEarlierSelection()
      await setController('picker', { pageError: 'The page could not be derived' })

      expect(byTestId('fast-track-key-add-failed')).not.toBeNull()
      expect(dispatched()).toEqual([])

      await press('fast-track-key-retry')
      await keystoreSends(PHRASE)

      expect(mockEdge.made).toBe(1)
      expect(types()).toEqual([ADD_TEMP_SEED, SEND_TEMP_SEED])
      expect(byTestId('fast-track-key-word-0')).not.toBeNull()
    })

    it('makes one phrase at mount where a selection still marked loading stands beside a page error', async () => {
      await setController('picker', {
        selectNextAccountStatus: 'LOADING',
        pageError: 'The page could not be derived'
      })

      await mount(KEY_STEP, ACKNOWLEDGED)

      expect(mockEdge.made).toBe(1)
      expect(types()).toEqual([ADD_TEMP_SEED, SEND_TEMP_SEED])
    })
  })

  describe('the guards and Back', () => {
    it('sends a holder with no extension password back to step 2, still acknowledged', async () => {
      await setController('keystore', { hasPasswordSecret: false, isUnlocked: false })

      await mount(KEY_STEP, ACKNOWLEDGED)

      expect(mockEdge.made).toBe(0)
      expect(movesAway()[0]).toMatchObject({
        to: 'social-recovery/fast-track',
        replace: true,
        state: ACKNOWLEDGED
      })
      expect(byTestId('fast-track-password')).not.toBeNull()
    })

    it('sends a holder with a locked keystore to the unlock', async () => {
      await setController('keystore', { hasPasswordSecret: true, isUnlocked: false })

      await mount(KEY_STEP, ACKNOWLEDGED)

      expect(mockEdge.made).toBe(0)
      expect(movesAway()).toMatchObject([{ to: 'keystore-unlock', replace: true }])
    })

    it('goes back to the warning, while the phrase is made and from the words', async () => {
      await mount(KEY_STEP, ACKNOWLEDGED)

      expect(byTestId('fast-track-key-back')?.textContent).toBe('Back')
      expect(isDisabled('fast-track-key-back')).toBe(false)

      await keystoreSends(PHRASE)
      await press('fast-track-key-back')
      await flush()

      expect(movesAway()).toMatchObject([{ to: 'social-recovery/recover', replace: false }])
      expect(byTestId('recovery-warning')).not.toBeNull()
    })
  })
})
