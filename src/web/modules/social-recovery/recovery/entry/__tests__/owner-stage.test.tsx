/**
 * @jest-environment jsdom
 *
 * The logged-in entry: the condensed warning, then which of the wallet's
 * accounts receives control.
 */
import {
  ACKNOWLEDGED,
  BASIC,
  basicAccount,
  DAILY,
  keyOf,
  mountEntry,
  navigate,
  resetEdges,
  setWallet,
  SMART,
  SMART_KEY,
  t,
  valueLabel,
  VAULT,
  VIEW_ONLY,
  WATCHED
} from '@web/modules/social-recovery/recovery/entry/__tests__/harness'

const ACK = 'recovery-warning-acknowledge'
const CONTINUE = 'entry-owner-continue'
const CANCEL = 'entry-owner-cancel'
const choice = (address: string) => `entry-owner-choice-${address.toLowerCase()}`

beforeEach(resetEdges)

describe('the condensed warning on the logged-in entry', () => {
  it('renders the condensed warning on the first stage of five, in the settings chrome', async () => {
    const screen = await mountEntry()
    expect(screen.has('recovery-warning')).toBe(true)
    expect(screen.textOf('recovery-stage')).toBe(
      t('socialRecovery.entry.stageCounter', { step: 1, total: 5 })
    )
    expect(screen.text()).toContain(t('socialRecovery.chrome.breadcrumb'))
    screen.unmount()
  })

  it('keeps every choice and continue disabled until the acknowledgment, and again once it is unticked', async () => {
    const screen = await mountEntry()
    expect(screen.isDisabled(choice(BASIC))).toBe(true)
    expect(screen.isDisabled(choice(SMART))).toBe(true)
    expect(screen.isDisabled(CONTINUE)).toBe(true)

    // A press on a choice before the acknowledgment picks nothing.
    await screen.press(choice(BASIC))
    expect(screen.isChecked(choice(BASIC))).toBe(false)

    await screen.press(ACK)
    expect(screen.isDisabled(choice(BASIC))).toBe(false)
    expect(screen.isDisabled(choice(SMART))).toBe(false)
    await screen.press(choice(BASIC))
    expect(screen.isDisabled(CONTINUE)).toBe(false)

    await screen.press(ACK)
    expect(screen.isDisabled(choice(BASIC))).toBe(true)
    expect(screen.isDisabled(CONTINUE)).toBe(true)
    await screen.press(CONTINUE)
    expect(navigate).not.toHaveBeenCalled()
    screen.unmount()
  })

  it('takes a new acknowledgment when the entry mounts again', async () => {
    const first = await mountEntry()
    await first.press(ACK)
    await first.press(choice(BASIC))
    expect(first.isDisabled(CONTINUE)).toBe(false)
    first.unmount()

    const second = await mountEntry()
    expect(second.isDisabled(choice(BASIC))).toBe(true)
    await second.press(choice(BASIC))
    expect(second.isDisabled(CONTINUE)).toBe(true)
    await second.press(CONTINUE)
    expect(navigate).not.toHaveBeenCalled()
    second.unmount()
  })
})

describe('the owner stage', () => {
  it('lists the accounts the wallet holds a key for, each with the key it installs', async () => {
    const screen = await mountEntry()
    expect(screen.textOf(`${choice(BASIC)}-name`)).toBe('Daily')
    expect(screen.textOf(`${choice(BASIC)}-address`)).toBe(BASIC)
    expect(screen.textOf(`${choice(BASIC)}-key`)).toBe(BASIC)
    expect(screen.textOf(`${choice(SMART)}-name`)).toBe('Vault')
    expect(screen.textOf(`${choice(SMART)}-address`)).toBe(SMART)
    expect(screen.textOf(`${choice(SMART)}-key`)).toBe(SMART_KEY)
    expect(screen.text()).toContain(t('socialRecovery.entry.owner.keyFor'))
    // The keystore holds none of the watched account's keys.
    expect(screen.has(choice(VIEW_ONLY))).toBe(false)
    screen.unmount()
  })

  it('names the installed key for the chosen account and carries the two-accounts sentences', async () => {
    const screen = await mountEntry()
    await screen.press(ACK)
    expect(screen.has('entry-owner-installs')).toBe(false)
    await screen.press(choice(SMART))
    expect(screen.isChecked(choice(SMART))).toBe(true)
    expect(screen.textOf('entry-owner-installs')).toBe(
      t('socialRecovery.entry.owner.installs', { account: 'Vault' })
    )
    expect(screen.textOf('entry-owner-two-accounts')).toBe(
      t('socialRecovery.entry.owner.twoAccounts')
    )
    expect(screen.textOf('entry-owner-nothing-merges')).toBe(
      t('socialRecovery.entry.owner.nothingMerges')
    )
    expect(screen.textOf('entry-owner-keeps-address')).toBe(
      t('socialRecovery.entry.owner.keepsAddress')
    )
    screen.unmount()
  })

  it('shows the key the chosen account installs as its own value, above the installs sentence', async () => {
    const screen = await mountEntry()
    await screen.press(ACK)
    expect(screen.has('entry-owner-new-key')).toBe(false)
    await screen.press(choice(SMART))
    expect(screen.textOf('entry-owner-new-key')).toBe(SMART_KEY)
    const sentences = screen.textOf('entry-owner-sentences')
    expect(sentences).toContain(valueLabel('newKey', t))
    expect(sentences.indexOf(SMART_KEY)).toBeLessThan(
      sentences.indexOf(t('socialRecovery.entry.owner.installs', { account: 'Vault' }))
    )
    await screen.press(choice(BASIC))
    expect(screen.textOf('entry-owner-new-key')).toBe(BASIC)
    screen.unmount()
  })

  it('shows the one account a wallet holds as chosen, with the same sentences', async () => {
    setWallet({ accounts: [DAILY, WATCHED], keys: [keyOf(BASIC)] })
    const screen = await mountEntry()
    expect(screen.isChecked(choice(BASIC))).toBe(true)
    expect(screen.textOf('entry-owner-installs')).toBe(
      t('socialRecovery.entry.owner.installs', { account: 'Daily' })
    )
    expect(screen.has('entry-owner-two-accounts')).toBe(true)
    await screen.press(ACK)
    await screen.press(CONTINUE)
    expect(navigate).toHaveBeenCalledWith(
      `/social-recovery/recovery/account?route=logged-in&to=${BASIC}`,
      { state: ACKNOWLEDGED }
    )
    screen.unmount()
  })

  it('refuses with no continue where no account can receive control', async () => {
    setWallet({ accounts: [WATCHED, basicAccount(SMART, 'Other')], keys: [] })
    const screen = await mountEntry()
    expect(screen.textOf('entry-owner-none')).toBe(
      t('socialRecovery.entry.owner.noEligibleAccount')
    )
    expect(screen.has(CONTINUE)).toBe(false)
    expect(screen.has('entry-owner-choices')).toBe(false)
    await screen.press(ACK)
    expect(screen.has(CONTINUE)).toBe(false)
    screen.unmount()
  })

  it('leaves for the recovery settings where no account can receive control, with cancel as the one action', async () => {
    setWallet({ accounts: [WATCHED], keys: [] })
    const screen = await mountEntry()
    expect(screen.textOf(CANCEL)).toBe(t('socialRecovery.actions.cancel'))
    expect(screen.has(CONTINUE)).toBe(false)
    await screen.press(CANCEL)
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith('social-recovery/setup')
    screen.unmount()
  })

  it('cancels to the recovery settings beside continue, before or after the acknowledgment', async () => {
    const screen = await mountEntry()
    expect(screen.textOf(CANCEL)).toBe(t('socialRecovery.actions.cancel'))
    await screen.press(CANCEL)
    expect(navigate).toHaveBeenLastCalledWith('social-recovery/setup')
    await screen.press(ACK)
    await screen.press(choice(SMART))
    await screen.press(CANCEL)
    expect(navigate).toHaveBeenCalledTimes(2)
    expect(navigate).toHaveBeenLastCalledWith('social-recovery/setup')
    expect(navigate).not.toHaveBeenCalledWith(
      expect.stringContaining('/recovery/account'),
      expect.anything()
    )
    screen.unmount()
  })

  it('continues to the account step with the route and the chosen account', async () => {
    const screen = await mountEntry()
    await screen.press(ACK)
    expect(screen.isDisabled(CONTINUE)).toBe(true)
    await screen.press(choice(SMART))
    await screen.press(CONTINUE)
    expect(navigate).toHaveBeenCalledTimes(1)
    // The account step learns the warning was acknowledged here.
    expect(navigate).toHaveBeenCalledWith(
      `/social-recovery/recovery/account?route=logged-in&to=${VAULT.addr}`,
      { state: ACKNOWLEDGED }
    )
    screen.unmount()
  })
})
