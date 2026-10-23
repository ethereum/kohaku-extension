/**
 * @jest-environment jsdom
 *
 * The fast track's gas step mounted whole, over the real records on the
 * storage double: the entry read, the sending key found among the wallet's
 * keys and accounts, the gas check on its balance, and where the step goes.
 */
import { act } from 'react-dom/test-utils'

import {
  basicAccount,
  byTestId,
  dispatched,
  flush,
  internalKey,
  isDisabled,
  keystoreSends,
  LOST_ACCOUNT,
  mockChain,
  mockStorage,
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
  SMART_ACCOUNT,
  smartAccount,
  text,
  unmount,
  walletListsSlot,
  where,
  writeEntry
} from '@web/modules/social-recovery/onboarding/fast-track/__fixtures__/harness'
import { BALANCE_READ_LIMIT_MS } from '@web/modules/social-recovery/onboarding/fast-track'
import { renderFullAddress, renderShortAddress } from '@web/modules/social-recovery/shared/display'

const GAS_STEP = `/social-recovery/fast-track/gas?account=${LOST_ACCOUNT}`
const CHECKLIST = `/social-recovery/recovery/checklist?account=${LOST_ACCOUNT}`
const READOUT = `/social-recovery/recovery/readout?account=${LOST_ACCOUNT}`
const ACCOUNT_STEP = `/social-recovery/recovery/account?route=fresh-install&to=${ORDINARY_KEY}`
const POLL_MS = 5_000
const ONE_ETHER = 1_000_000_000_000_000_000n
// The chain reads the harness answers for the client, as the step loads them.
const client: typeof import('@web/modules/social-recovery/shared/client') = jest.requireMock(
  '@web/modules/social-recovery/shared/client'
)
const DEPOSIT_LINE = 'Send at most 0.00096 ETH to this key for the submission.'
const READING_BALANCE = 'Reading the balance and the fee…'

// While `hold` is set, each balance read waits until the test answers it.
const held = {
  hold: false,
  answers: [] as ((balance: bigint) => void)[]
}

const answerHeld = async (balance: bigint) => {
  await act(async () => {
    held.answers.splice(0).forEach((answer) => answer(balance))
  })
  await flush()
}

const passes = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms)
  })
  await flush()
}

describe('the gas step', () => {
  beforeEach(async () => {
    resetEdge()
    await walletListsSlot()
    await writeEntry()
  })

  afterEach(() => {
    unmount()
    jest.useRealTimers()
  })

  it('skips itself where the sending key already holds enough', async () => {
    mockChain.balance = ONE_ETHER

    await mount(GAS_STEP)

    expect(mockChain.balanceReads).toEqual([ORDINARY_KEY])
    expect(movesAway()).toMatchObject([{ to: CHECKLIST.slice(1), replace: true }])
    expect(where()).toBe(CHECKLIST)
  })

  it('asks to fund the basic account of the slot, never the key the recovery installs', async () => {
    await mount(GAS_STEP)

    expect(byTestId('fast-track-gas')).not.toBeNull()
    expect(mockChain.balanceReads).toEqual([ORDINARY_KEY])
    expect(text()).toContain('Fund the key that sends the recovery')
    expect(text()).toContain(ORDINARY_KEY)
    expect(text()).toContain('Send at most 0.00096 ETH to this key for the submission.')
    expect(text()).not.toContain(OFFSET_KEY)
    expect(movesAway()).toEqual([])
  })

  it("asks the receiving account's own key to pay, never the account being recovered, and offers no transfer from it", async () => {
    await mount(GAS_STEP)

    expect(mockChain.balanceReads).toEqual([ORDINARY_KEY])
    expect(text()).toContain(ORDINARY_KEY)
    expect(text()).not.toContain(LOST_ACCOUNT)
    expect(text()).not.toMatch(/Transfer/)
    expect(text()).toContain('The account cannot pay for itself until it is recovered.')
  })

  it('shows the stage counter at 3 of 5 and no breadcrumb, and keeps continue disabled', async () => {
    await mount(GAS_STEP)

    expect(byTestId('recovery-stage')?.textContent).toBe('Recovery · Step 3 of 5')
    expect(text()).not.toContain('Settings ›')
    expect(isDisabled('fast-track-gas-continue')).toBe(true)
  })

  it('names the account on one line in its short form, with the network', async () => {
    await mount(GAS_STEP)

    expect(byTestId('fast-track-gas-account')?.textContent).toBe(
      `Account ${renderShortAddress(LOST_ACCOUNT)} · Sepolia`
    )
    expect(text()).not.toContain(renderFullAddress(LOST_ACCOUNT))
  })

  it('keeps one line on continuing by itself, and puts the second funding beside the step', async () => {
    await mount(GAS_STEP)

    const main = byTestId('fast-track-gas-columns-main')?.textContent ?? ''
    expect(main).toContain('This screen continues on its own once the funds arrive.')
    expect(main).toContain('Send on Sepolia, the network of the account you are recovering.')
    expect(main).not.toContain('Already funded?')
    expect(main).not.toContain('Continue unlocks')
    expect(main).not.toContain('Executing after the waiting period')
    expect(byTestId('fast-track-gas-second-funding')?.textContent).toContain(
      'Executing after the waiting period is a second transaction.'
    )
    expect(
      byTestId('fast-track-gas-columns-aside')?.querySelector(
        '[data-testid="fast-track-gas-second-funding"]'
      )
    ).not.toBeNull()
  })

  it('continues on its own once the funds arrive', async () => {
    jest.useFakeTimers()
    await mount(GAS_STEP)

    expect(byTestId('fast-track-gas')).not.toBeNull()

    mockChain.balance = ONE_ETHER
    await act(async () => {
      jest.advanceTimersByTime(POLL_MS)
    })
    await flush()

    expect(mockChain.balanceReads).toEqual([ORDINARY_KEY, ORDINARY_KEY])
    expect(where()).toBe(CHECKLIST)
  })

  it('goes back to the readout', async () => {
    await mount(GAS_STEP)

    expect(byTestId('fast-track-gas-back')?.textContent).toBe('Back')
    await press('fast-track-gas-back')

    expect(movesAway()).toMatchObject([{ to: READOUT.slice(1), replace: false }])
    expect(where()).toBe(READOUT)
  })

  it('shows a failed chain read with retry, never the last deposit step', async () => {
    jest.useFakeTimers()
    await mount(GAS_STEP)

    mockChain.fail = true
    await act(async () => {
      jest.advanceTimersByTime(POLL_MS)
    })
    await flush()

    expect(byTestId('fast-track-gas')).toBeNull()
    expect(byTestId('fast-track-gas-failed')).not.toBeNull()

    mockChain.fail = false
    mockChain.balance = ONE_ETHER
    await press('fast-track-gas-retry')
    await flush()

    expect(where()).toBe(CHECKLIST)
  })

  it('shows a failed entry read with retry', async () => {
    mockStorage.failReads = true

    await mount(GAS_STEP)

    expect(byTestId('fast-track-gas-failed')).not.toBeNull()
    expect(mockChain.balanceReads).toEqual([])

    mockStorage.failReads = false
    await press('fast-track-gas-retry')
    await flush()

    expect(byTestId('fast-track-gas')).not.toBeNull()
  })

  it('offers only Back to the account step where no key of this wallet can send the recovery', async () => {
    await setController('keystore', { keys: [] })

    await mount(GAS_STEP)

    expect(byTestId('fast-track-gas-no-key')).not.toBeNull()
    expect(byTestId('fast-track-gas-retry')).toBeNull()
    expect(mockChain.balanceReads).toEqual([])

    await press('fast-track-gas-back')

    expect(movesAway()).toMatchObject([
      { to: ACCOUNT_STEP.slice(1), replace: true, state: { acknowledged: true } }
    ])
    expect(where()).toBe(ACCOUNT_STEP)
  })

  it('sends a holder with no entry for the account back to the account step', async () => {
    mockStorage.entries.clear()

    await mount(GAS_STEP)

    expect(where()).toBe(ACCOUNT_STEP)
    expect(mockChain.balanceReads).toEqual([])
  })

  it('goes straight on to the checklist on the logged-in route', async () => {
    mockStorage.entries.clear()
    await writeEntry('logged-in')

    await mount(GAS_STEP)

    expect(where()).toBe(CHECKLIST)
    expect(mockChain.balanceReads).toEqual([])
  })

  it('finds no sending key where the receiving account is a smart account, even with its dedicated key held', async () => {
    mockStorage.entries.clear()
    await writeEntry('fresh-install', SMART_ACCOUNT)
    await setController('keystore', { keys: [slotKey, offsetKey] })
    await setController('accounts', { accounts: [basicAccount, smartAccount] })

    await mount(GAS_STEP)

    expect(byTestId('fast-track-gas-no-key')).not.toBeNull()
    expect(mockChain.balanceReads).toEqual([])
    expect(text()).not.toContain(OFFSET_KEY)
  })

  const notOrdinary: { name: string; keys: ReturnType<typeof internalKey>[] }[] = [
    { name: 'as a dedicated key', keys: [internalKey(ORDINARY_KEY, true)] },
    { name: 'with no recovery phrase behind it', keys: [seedlessKey] }
  ]
  notOrdinary.forEach(({ name, keys }) => {
    it(`finds no sending key where the keystore holds the receiving account's key ${name}`, async () => {
      await setController('keystore', { keys })

      await mount(GAS_STEP)

      expect(byTestId('fast-track-gas-no-key')).not.toBeNull()
      expect(mockChain.balanceReads).toEqual([])
    })
  })

  it('finds no sending key where the wallet does not list the receiving account', async () => {
    await setController('accounts', { accounts: [] })

    await mount(GAS_STEP)

    expect(byTestId('fast-track-gas-no-key')).not.toBeNull()
    expect(mockChain.balanceReads).toEqual([])
  })

  it('never calls anything a seed', async () => {
    await mount(GAS_STEP)

    expect(text()).not.toMatch(/seed/i)
  })

  describe('a balance read that does not answer', () => {
    let reads: jest.SpyInstance

    beforeEach(() => {
      held.hold = false
      held.answers = []
      const answered = client.createChainReads
      reads = jest.spyOn(client, 'createChainReads').mockImplementation((provider) => {
        const chain = answered(provider)
        return {
          ...chain,
          nativeBalance: (address) => {
            if (!held.hold) {
              return chain.nativeBalance(address)
            }
            mockChain.balanceReads.push(address)
            return new Promise<bigint>((resolve) => {
              held.answers.push(resolve)
            })
          }
        }
      })
    })

    afterEach(() => {
      reads.mockRestore()
    })

    it('keeps the deposit step on screen while the next read runs, with no spinner', async () => {
      jest.useFakeTimers()
      await mount(GAS_STEP)
      held.hold = true

      await passes(POLL_MS)

      expect(mockChain.balanceReads).toHaveLength(2)
      expect(byTestId('fast-track-gas')).not.toBeNull()
      expect(byTestId('fast-track-gas-waiting')).toBeNull()
      expect(text()).toContain(DEPOSIT_LINE)
    })

    it('keeps the deposit step across answered reads for longer than the limit', async () => {
      jest.useFakeTimers()
      await mount(GAS_STEP)

      for (let i = 0; i < 6; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await passes(POLL_MS)
      }

      expect(mockChain.balanceReads).toHaveLength(7)
      expect(byTestId('fast-track-gas-failed')).toBeNull()
      expect(text()).toContain(DEPOSIT_LINE)
    })

    it('shows the failed state with retry once a read runs past the limit, never the last deposit step', async () => {
      jest.useFakeTimers()
      await mount(GAS_STEP)
      held.hold = true
      await passes(POLL_MS)

      await passes(BALANCE_READ_LIMIT_MS - 1)
      expect(byTestId('fast-track-gas')).not.toBeNull()

      await passes(1)

      expect(byTestId('fast-track-gas')).toBeNull()
      expect(byTestId('fast-track-gas-failed')?.textContent).toContain(
        'Could not finish the checks before sending. The node did not answer. Nothing was sent.'
      )
      expect(byTestId('fast-track-gas-retry')).not.toBeNull()
      expect(text()).not.toContain(DEPOSIT_LINE)
      expect(text()).not.toContain(ORDINARY_KEY)
    })

    it('fails a first read that never answers, rather than waiting on the spinner', async () => {
      jest.useFakeTimers()
      held.hold = true
      await mount(GAS_STEP)

      expect(byTestId('fast-track-gas-waiting')?.textContent).toBe(READING_BALANCE)
      expect(
        byTestId('fast-track-gas-waiting')?.querySelector('[data-testid="loading-screen"]')
      ).not.toBeNull()
      expect(byTestId('fast-track-gas-columns')).toBeNull()

      await passes(BALANCE_READ_LIMIT_MS)

      expect(byTestId('fast-track-gas-waiting')).toBeNull()
      expect(byTestId('fast-track-gas-failed')).not.toBeNull()
    })

    it('ignores the answer that lands after the limit and reads nothing more on its own', async () => {
      jest.useFakeTimers()
      await mount(GAS_STEP)
      held.hold = true
      await passes(POLL_MS)
      await passes(BALANCE_READ_LIMIT_MS)

      await answerHeld(ONE_ETHER)
      await passes(POLL_MS * 4)

      expect(byTestId('fast-track-gas-failed')).not.toBeNull()
      expect(where()).toBe(GAS_STEP)
      expect(movesAway()).toEqual([])
      expect(mockChain.balanceReads).toHaveLength(2)
    })

    it('reads again on retry and renders the new answer', async () => {
      jest.useFakeTimers()
      await mount(GAS_STEP)
      held.hold = true
      await passes(POLL_MS)
      await passes(BALANCE_READ_LIMIT_MS)

      held.hold = false
      mockChain.balance = ONE_ETHER
      await press('fast-track-gas-retry')
      await flush()

      expect(mockChain.balanceReads).toEqual([ORDINARY_KEY, ORDINARY_KEY, ORDINARY_KEY])
      expect(where()).toBe(CHECKLIST)
    })

    it('renders the deposit step again where the retried read still finds too little', async () => {
      jest.useFakeTimers()
      await mount(GAS_STEP)
      held.hold = true
      await passes(POLL_MS)
      await passes(BALANCE_READ_LIMIT_MS)

      held.hold = false
      await press('fast-track-gas-retry')
      await flush()

      expect(byTestId('fast-track-gas-failed')).toBeNull()
      expect(text()).toContain(DEPOSIT_LINE)
      expect(mockChain.balanceReads).toHaveLength(3)
    })
  })

  describe('after the key step', () => {
    it('asks the key the key step showed to pay, the key of the account it handed on', async () => {
      mockStorage.entries.clear()
      resetEdge()
      await setController('keystore', { hasPasswordSecret: true, isUnlocked: true })
      await mount('/social-recovery/fast-track/key', { acknowledged: true })
      await keystoreSends(PHRASE)
      const shown = byTestId('fast-track-key-address')?.textContent
      await press('fast-track-key-acknowledge')
      await press('fast-track-key-continue')
      await setController('picker', { addAccountsStatus: 'LOADING' })
      await setController('picker', { addAccountsStatus: 'SUCCESS' })
      await walletListsSlot()
      const handedOn = new URLSearchParams(where().split('?')[1]).get('to')

      expect(dispatched('MAIN_CONTROLLER_ACCOUNT_PICKER_RESET')).toHaveLength(1)
      expect(shown).toBe(ORDINARY_KEY)
      expect(handedOn).toBe(shown)

      await writeEntry('fresh-install', handedOn as typeof ORDINARY_KEY)
      await mount(GAS_STEP)

      expect(mockChain.balanceReads).toEqual([shown])
      expect(byTestId('fast-track-gas')?.textContent).toContain(shown)
    })
  })
})
