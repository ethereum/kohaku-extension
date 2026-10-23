/**
 * @jest-environment jsdom
 *
 * The account step on both routes: the field, the lookup of the account's
 * setup, the confirmation, the recovery entry it writes and the reads that
 * decide whether the recovery can go on.
 */
import type { Mounted } from '@web/modules/social-recovery/recovery/entry/__tests__/harness'
import {
  BASIC,
  CHAIN_ID,
  chip,
  confirmLost,
  dispatch,
  failedClient,
  forwardedCall,
  historyEntry,
  offchainFault,
  readyClient,
  reloadAccountStep,
  kit,
  DEPLOYMENT,
  gatheringFor,
  LOST,
  LOST_KEY,
  MODULE,
  lookUp,
  mountAccountStep,
  navigate,
  navigationsAway,
  NETWORK,
  outside,
  records,
  refusedClient,
  resetEdges,
  REVERTS,
  revertedCall,
  resolveName,
  searchOf,
  setClient,
  setupStateOf,
  SMART,
  SMART_KEY,
  storage,
  storedEntry,
  storeEndedRecovery,
  storeLiveRecovery,
  t,
  timedOut,
  valueLabel,
  VIEW_ONLY
} from '@web/modules/social-recovery/recovery/entry/__tests__/harness'
import { deferred } from '@web/modules/social-recovery/shared/chrome/__fixtures__/deferred'

// A manager this build no longer reads.
const RETIRED_MANAGER = '0x00000000000000000000000000000000000Dead1' as const
const LOGGED_IN = searchOf('logged-in', BASIC)
const FRESH_INSTALL = searchOf('fresh-install', SMART)
const NO_SETUP_SENTENCE = t('socialRecovery.entry.noSetup.title', { network: NETWORK })
const CANNOT_RECOVER = t('socialRecovery.review.blocked.cannotRecover.title')

let screen: Mounted | null = null
const open = async (search: string, state?: unknown) => {
  screen = await (state === undefined ? mountAccountStep(search) : mountAccountStep(search, state))
  return screen
}

beforeEach(resetEdges)
afterEach(() => {
  screen?.unmount()
  screen = null
})

/** Nothing on the page offers a retry. */
const expectNoRetry = () => {
  expect(document.querySelector('[data-testid$="-retry"]')).toBeNull()
}

/** Nothing on the page says that the account has no setup. */
const expectNoNoSetup = (page: Mounted) => {
  expect(page.has('entry-no-setup')).toBe(false)
  expect(page.text()).not.toContain(NO_SETUP_SENTENCE)
}

/** Nothing on the page lets the holder go on to the readout. */
const expectNoContinue = (page: Mounted) => {
  expect(page.has('entry-continue')).toBe(false)
}

describe('the account step chrome', () => {
  it('shows the second of five stages in the settings chrome on the logged-in route', async () => {
    const page = await open(LOGGED_IN)
    expect(page.textOf('recovery-stage')).toBe(
      t('socialRecovery.entry.stageCounter', { step: 2, total: 5 })
    )
    expect(page.text()).toContain(t('socialRecovery.chrome.breadcrumb'))
    expect(page.has('entry-account-field')).toBe(true)
  })

  it('shows the plain header with the stage counter on the fresh-install route', async () => {
    const page = await open(FRESH_INSTALL)
    expect(page.textOf('recovery-stage')).toBe(
      t('socialRecovery.entry.stageCounter', { step: 2, total: 5 })
    )
    expect(page.text()).not.toContain(t('socialRecovery.chrome.breadcrumb'))
    expect(page.text()).toContain(t('socialRecovery.routes.recover'))
    expect(page.has('entry-account-field')).toBe(true)
  })

  const unusable: [string, string, string][] = [
    ['no search', '', '/social-recovery/recovery'],
    ['no receiving account', '?route=logged-in', '/social-recovery/recovery'],
    ['a malformed receiving account', '?route=fresh-install&to=0x1234', '/social-recovery/recover'],
    ['an unknown route', `?route=elsewhere&to=${BASIC}`, '/social-recovery/recovery'],
    [
      'an account whose key the wallet does not hold',
      searchOf('logged-in', VIEW_ONLY),
      '/social-recovery/recovery'
    ]
  ]
  unusable.forEach(([name, search, entry]) => {
    it(`sends the holder to the route's entry for ${name}`, async () => {
      const page = await open(search)
      expect(navigate).toHaveBeenCalledWith(entry)
      expect(page.has('entry-account-field')).toBe(false)
    })
  })
})

describe('the account field', () => {
  const malformed: [string, string][] = [
    ['a short hex value', '0x1234'],
    ['an address with one character too many', `${LOST.toLowerCase()}0`],
    [
      'an address whose mixed case fails its checksum',
      '0xdeaD000000000000000000000000000000000006'
    ],
    ['a word with no dot', 'alice']
  ]
  malformed.forEach(([name, value]) => {
    it(`refuses ${name} before any read`, async () => {
      const page = await open(LOGGED_IN)
      await lookUp(page, value)
      expect(page.has('entry-account-malformed')).toBe(true)
      expect(page.text()).toContain(t('socialRecovery.entry.account.errors.malformedTitle'))
      expect(resolveName).not.toHaveBeenCalled()
      expect(kit.setupState).not.toHaveBeenCalled()
      expectNoNoSetup(page)
    })
  })

  it('names the one network with no switch', async () => {
    const page = await open(LOGGED_IN)
    expect(page.textOf('entry-network')).toBe(
      t('socialRecovery.entry.account.networkFixed', { network: NETWORK })
    )
  })

  it('renders the name error with a retry for a name that does not resolve, never the no-setup sentence', async () => {
    const page = await open(LOGGED_IN)
    await lookUp(page, 'lost.eth')
    expect(resolveName).toHaveBeenCalledWith('lost.eth')
    expect(page.has('entry-account-name-error')).toBe(true)
    expect(page.text()).toContain(t('socialRecovery.entry.account.errors.nameTitle'))
    expect(kit.setupState).not.toHaveBeenCalled()
    expectNoNoSetup(page)

    resolveName.mockImplementation(async () => LOST)
    await page.press('entry-account-name-error-retry')
    expect(page.has('entry-confirm')).toBe(true)
    expect(page.textOf('entry-confirm-address')).toBe(LOST)
  })

  it('says it looks the name up beside the held lookup while the name has not resolved', async () => {
    const held = deferred<string>()
    resolveName.mockImplementationOnce(() => held.promise)
    const page = await open(LOGGED_IN)
    await lookUp(page, 'lost.eth')
    expect(page.textOf('entry-account-resolving')).toBe(
      t('socialRecovery.entry.account.lookingUp', { network: NETWORK })
    )
    expect(
      page.byTestId('entry-account-resolving')?.querySelector('[data-testid="loading-row"]')
    ).not.toBeNull()
    expect(page.isDisabled('entry-account-look-up')).toBe(true)
    expect(kit.setupState).not.toHaveBeenCalled()

    await outside(() => held.resolve(LOST))
    expect(page.has('entry-account-resolving')).toBe(false)
    expect(page.has('entry-confirm')).toBe(true)
  })

  it('renders a failed read for a resolver that throws, never the no-setup sentence', async () => {
    resolveName.mockImplementation(async () => {
      throw new Error('rpc down')
    })
    const page = await open(LOGGED_IN)
    await lookUp(page, 'lost.eth')
    expect(page.has('entry-account-name-read-failed')).toBe(true)
    expect(page.has('entry-account-name-error')).toBe(false)
    expect(kit.setupState).not.toHaveBeenCalled()
    expectNoNoSetup(page)
  })

  const absentNames: [string, () => Error][] = [
    ['a name with no resolver', () => revertedCall(REVERTS.resolverNotFound)],
    [
      'a name with no resolver, read through the page provider',
      () => forwardedCall(revertedCall(REVERTS.resolverNotFound).message)
    ],
    ['a name whose resolver is no contract', () => revertedCall(REVERTS.resolverNotContract)],
    [
      'a name whose resolver is no contract, read through the page provider',
      () => forwardedCall(revertedCall(REVERTS.resolverNotContract).message)
    ],
    ['a name whose resolver reverted', () => revertedCall(REVERTS.resolverError)],
    ['a name with no address record', () => revertedCall(REVERTS.unsupportedProfile)],
    [
      'a name whose off-chain gateway holds no record',
      () => offchainFault('response not found during CCIP fetch', '404_MISSING_RESOURCE')
    ]
  ]
  absentNames.forEach(([name, failure]) => {
    it(`renders the name error with a retry, not a failed read, for ${name}`, async () => {
      resolveName.mockImplementationOnce(async () => {
        throw failure()
      })
      const page = await open(LOGGED_IN)
      await lookUp(page, 'lost.eth')
      expect(page.has('entry-account-name-error')).toBe(true)
      expect(page.text()).toContain(t('socialRecovery.entry.account.errors.nameTitle'))
      expect(page.has('entry-account-name-read-failed')).toBe(false)
      expect(page.text()).not.toContain(
        t('socialRecovery.entry.account.errors.readFailedTitle', { network: NETWORK })
      )
      expect(kit.setupState).not.toHaveBeenCalled()
      expect(kit.fitCheck).not.toHaveBeenCalled()
      expectNoNoSetup(page)

      resolveName.mockImplementation(async () => LOST)
      await page.press('entry-account-name-error-retry')
      expect(page.textOf('entry-confirm-address')).toBe(LOST)
    })
  })

  const failedReads: [string, () => Error][] = [
    [
      'a resolver call the page provider could not send',
      () => forwardedCall('Provider not found for chainId 11155111')
    ],
    [
      'a resolver call that timed out behind the page provider',
      () => forwardedCall('request timeout (code=TIMEOUT, version=6.17.0)')
    ],
    ['a resolver call that reverted for another reason', () => revertedCall(REVERTS.httpError)],
    [
      'a resolver call that reverted for another reason, read through the page provider',
      () => forwardedCall(revertedCall(REVERTS.httpError).message)
    ],
    ['a resolver call with no revert data', () => revertedCall('0x')],
    ['a request that timed out', timedOut],
    [
      'an off-chain lookup whose gateways answered with a server error',
      () => offchainFault('error encountered during CCIP fetch', '500_SERVER_ERROR')
    ],
    [
      'an off-chain lookup that fetched no data',
      () => offchainFault('CCIP Read failed to fetch data', 'FETCH_FAILED')
    ]
  ]
  failedReads.forEach(([name, failure]) => {
    it(`renders the failed read with a retry, not the name error, for ${name}`, async () => {
      resolveName.mockImplementationOnce(async () => {
        throw failure()
      })
      const page = await open(LOGGED_IN)
      await lookUp(page, 'lost.eth')
      expect(page.has('entry-account-name-read-failed')).toBe(true)
      expect(page.text()).toContain(
        t('socialRecovery.entry.account.errors.readFailedTitle', { network: NETWORK })
      )
      expect(page.has('entry-account-name-error')).toBe(false)
      expect(kit.setupState).not.toHaveBeenCalled()
      expectNoNoSetup(page)

      resolveName.mockImplementation(async () => LOST)
      await page.press('entry-account-name-read-failed-retry')
      expect(resolveName).toHaveBeenCalledTimes(2)
      expect(page.textOf('entry-confirm-address')).toBe(LOST)
    })
  })

  it('goes back to the choice of the receiving account on the logged-in route', async () => {
    const page = await open(LOGGED_IN)
    expect(page.textOf('entry-account-back')).toBe(t('socialRecovery.actions.back'))
    await page.press('entry-account-back')
    expect(navigationsAway()).toEqual([['/social-recovery/recovery']])
    expect(storage.set).not.toHaveBeenCalled()
  })

  it('cancels to the recovery settings on the logged-in route, and reads and writes nothing', async () => {
    const page = await open(LOGGED_IN)
    expect(page.textOf('entry-account-cancel')).toBe(t('socialRecovery.actions.cancel'))
    await page.press('entry-account-cancel')
    expect(navigationsAway()).toEqual([['social-recovery/setup']])
    expect(storage.set).not.toHaveBeenCalled()
    expect(kit.setupState).not.toHaveBeenCalled()
  })

  it('offers only cancel on the fresh-install route, which has no step to go back to', async () => {
    const page = await open(FRESH_INSTALL)
    expect(page.has('entry-account-back')).toBe(false)
    await page.press('entry-account-cancel')
    expect(navigationsAway()).toEqual([['social-recovery/setup']])
    expect(storage.set).not.toHaveBeenCalled()
  })
})

describe('the lookup', () => {
  it('shows the lookup running while the setup read has not returned, and nothing else', async () => {
    const held = deferred<ReturnType<typeof setupStateOf>>()
    kit.setupState.mockReturnValueOnce(held.promise)
    const page = await open(LOGGED_IN)
    await lookUp(page, LOST.toLowerCase())
    expect(page.has('entry-lookup-loading')).toBe(true)
    expect(
      page.byTestId('entry-lookup-loading')?.querySelector('[data-testid="loading-block"]')
    ).not.toBeNull()
    expect(page.text()).toContain(t('socialRecovery.entry.account.lookingUp', { network: NETWORK }))
    expectNoNoSetup(page)
    expect(page.has('entry-confirm')).toBe(false)

    await outside(() => held.resolve(setupStateOf()))
    expect(page.has('entry-confirm')).toBe(true)
  })

  it('renders a failed setup read with a retry and never the no-setup sentence; the retry that answers goes on', async () => {
    kit.setupState.mockRejectedValueOnce(new Error('rpc down'))
    const page = await open(LOGGED_IN)
    await lookUp(page, LOST.toLowerCase())
    expect(page.has('entry-lookup-read-failed')).toBe(true)
    expect(page.text()).toContain(
      t('socialRecovery.entry.account.errors.readFailedTitle', { network: NETWORK })
    )
    expectNoNoSetup(page)
    expect(page.has('entry-confirm')).toBe(false)

    await page.press('entry-lookup-read-failed-retry')
    expect(kit.setupState).toHaveBeenCalledTimes(2)
    expect(page.has('entry-lookup-read-failed')).toBe(false)
    expect(page.has('entry-confirm')).toBe(true)
  })

  it('renders a client that failed as a failed read with a retry, never the no-setup sentence', async () => {
    setClient(LOST, failedClient(LOST))
    const page = await open(LOGGED_IN)
    await lookUp(page, LOST.toLowerCase())
    expect(page.has('entry-lookup-read-failed')).toBe(true)
    expectNoNoSetup(page)
    expect(kit.setupState).not.toHaveBeenCalled()

    await page.press('entry-lookup-read-failed-retry')
    expect(kit.setupState).toHaveBeenCalledTimes(1)
    expect(page.has('entry-confirm')).toBe(true)
  })

  it('renders update the wallet for a client the digest version refused, never the no-setup sentence', async () => {
    setClient(LOST, refusedClient())
    const page = await open(LOGGED_IN)
    await lookUp(page, LOST.toLowerCase())
    expect(page.has('entry-lookup-update-the-wallet')).toBe(true)
    expect(page.text()).toContain(t('socialRecovery.client.updateTheWalletTitle'))
    expectNoNoSetup(page)
    expect(page.has('entry-confirm')).toBe(false)
  })

  it('tells how to update the wallet as a plain line, with no action, and says nothing about a setup', async () => {
    setClient(LOST, refusedClient())
    const page = await open(LOGGED_IN)
    await lookUp(page, LOST.toLowerCase())
    const state = page.byTestId('entry-lookup-update-the-wallet')
    expect(state?.textContent).not.toContain(t('socialRecovery.client.updateTheWalletBody'))
    expect(state?.textContent).not.toContain(t('socialRecovery.writes.tryAgain'))
    expect(state?.textContent).not.toContain(t('socialRecovery.entry.noSetup.tryAnother'))
    expect(page.textOf('entry-lookup-update-how')).toBe(
      t('socialRecovery.client.updateTheWalletHow')
    )
    expect(state?.textContent).not.toContain(t('socialRecovery.client.updateTheWalletAction'))
    expect(state?.querySelector('[role="button"], button')).toBeNull()
    expect(page.has('entry-lookup-refused-retry')).toBe(false)
    expect(page.has('entry-lookup-another')).toBe(false)
    expect(page.has('entry-lookup-update')).toBe(false)
    await page.press('entry-lookup-update-how')
    expect(dispatch).not.toHaveBeenCalled()
    expect(kit.setupState).not.toHaveBeenCalled()
  })

  it('renders the no-setup sentence with the network and the module only where the account carries no setup', async () => {
    kit.setupState.mockResolvedValueOnce(setupStateOf({ hasSetup: false }))
    const page = await open(LOGGED_IN)
    await lookUp(page, LOST.toLowerCase())
    expect(page.textOf('entry-no-setup-title')).toBe(NO_SETUP_SENTENCE)
    expect(page.textOf('entry-no-setup-address')).toBe(LOST)
    expect(page.textOf('entry-no-setup-network')).toBe(NETWORK)
    expect(page.textOf('entry-no-setup-account')).toContain(
      t('socialRecovery.entry.labels.accountLookedUp')
    )
    expect(page.textOf('entry-no-setup-module')).toBe(
      t('socialRecovery.entry.noSetup.module', { module: MODULE })
    )
    expect(page.textOf('entry-no-setup-other-wallet')).toBe(
      t('socialRecovery.entry.noSetup.otherWallet')
    )
    expect(page.has('entry-confirm')).toBe(false)

    // The title, the account looked up and the retry stay in the main column;
    // the card note and the module line sit beside them, and "no setup" is said once.
    const main = page.byTestId('entry-lookup-columns-main')
    const aside = page.byTestId('entry-lookup-columns-aside')
    ;['entry-no-setup-title', 'entry-no-setup-account', 'entry-lookup-another'].forEach((id) =>
      expect(main?.contains(page.byTestId(id))).toBe(true)
    )
    ;['entry-no-setup-card', 'entry-no-setup-other-wallet', 'entry-no-setup-module'].forEach((id) =>
      expect(aside?.contains(page.byTestId(id))).toBe(true)
    )
    expect(page.textOf('entry-no-setup-card')).toContain(
      t('socialRecovery.entry.noSetup.cardTitle')
    )
    expect(page.textOf('entry-no-setup-elsewhere')).toContain(
      t('socialRecovery.entry.noSetup.otherWalletTitle')
    )
    expect(page.text()).not.toContain('carries no recovery setup')

    await page.press('entry-lookup-another')
    expect(page.has('entry-account-field')).toBe(true)
  })
})

describe('the lookup field', () => {
  it('keeps the field in the main column and the two notes on the lookup beside it, each once', async () => {
    const page = await open(LOGGED_IN)
    const aside = page.byTestId('entry-account-field-columns-aside')
    expect(aside?.textContent).toContain(t('socialRecovery.entry.account.whereTitle'))
    expect(aside?.textContent).toContain(t('socialRecovery.entry.account.startsNothingTitle'))
    expect(page.textOf('entry-account-field')).toContain(t('socialRecovery.entry.account.lead'))
    expect(page.textOf('entry-account-field')).not.toContain('starts no recovery')
    expect(page.textOf('entry-account-field')).not.toContain(
      t('socialRecovery.entry.account.startsNothingTitle')
    )
  })

  it('holds the hint to the card alone, the aside saying where else the address is found', async () => {
    const page = await open(LOGGED_IN)
    expect(page.textOf('entry-account-hint')).toBe(t('socialRecovery.entry.account.hint'))
    expect(page.textOf('entry-account-field')).not.toContain('ENS name also resolves')
    expect(page.textOf('entry-account-where')).toContain(
      t('socialRecovery.entry.account.whereBody')
    )
  })

  it('opens the main column with the stage counter, so the aside starts level with it', async () => {
    const page = await open(LOGGED_IN)
    const main = page.byTestId('entry-account-field-columns-main')
    expect(main?.querySelector('[data-testid]')?.getAttribute('data-testid')).toBe(
      'entry-account-field'
    )
    expect(page.byTestId('entry-account-field')?.firstElementChild).toBe(
      page.byTestId('recovery-stage')
    )
  })
})

describe('the confirmation', () => {
  it('shows the account address in full with the network, and no name caveat for an address', async () => {
    const page = await open(LOGGED_IN)
    await lookUp(page, LOST.toLowerCase())
    expect(page.textOf('entry-confirm-address')).toBe(LOST)
    expect(page.textOf('entry-confirm-network')).toBe(NETWORK)
    expect(page.has('entry-confirm-name')).toBe(false)
    expect(page.has('entry-confirm-name-caveat')).toBe(false)
  })

  it('says once, beside the confirmation, that confirming starts nothing', async () => {
    const page = await open(LOGGED_IN)
    await lookUp(page, LOST.toLowerCase())
    const aside = page.byTestId('entry-confirm-columns-aside')
    expect(aside?.textContent).toContain(t('socialRecovery.entry.confirm.wrongAccountTitle'))
    expect(aside?.textContent).toContain(t('socialRecovery.entry.confirm.startsNothingBody'))
    expect(page.has('entry-confirm-reads-only')).toBe(false)
    expect(page.textOf('entry-confirm')).not.toContain('reads the chain')
  })

  it('labels the account as the account being recovered', async () => {
    const page = await open(LOGGED_IN)
    await lookUp(page, LOST.toLowerCase())
    const confirm = page.textOf('entry-confirm')
    expect(confirm).toContain(valueLabel('accountBeingRecovered', t))
    expect(confirm).not.toContain(t('socialRecovery.entry.labels.accountLookedUp'))
  })

  it("stores the wallet's own form of the receiving account, not the casing the URL carried", async () => {
    const shouted = `0x${BASIC.slice(2).toUpperCase()}`
    expect(shouted).not.toBe(BASIC)
    const page = await open(searchOf('logged-in', shouted))
    await confirmLost(page)
    expect((await storedEntry(LOST))?.receivingAccount).toBe(BASIC)
  })

  it('resumes a recovery whose entry has a live session at the checklist, and writes nothing', async () => {
    await storeLiveRecovery(LOST, { route: 'fresh-install', receivingAccount: SMART })
    storage.set.mockClear()
    const page = await open(LOGGED_IN)
    await confirmLost(page)
    expect(navigate).toHaveBeenCalledWith(`/social-recovery/recovery/checklist?account=${LOST}`)
    expect(storage.set).not.toHaveBeenCalled()
    expect(await storedEntry(LOST)).toEqual({
      account: LOST,
      route: 'fresh-install',
      receivingAccount: SMART,
      deployment: DEPLOYMENT
    })
    expect(kit.isAuthorized).not.toHaveBeenCalled()
  })

  it('resumes no recovery whose entry and live session run on a retired manager, and writes its own entry', async () => {
    const retired = { ...DEPLOYMENT, manager: RETIRED_MANAGER }
    const held = records()
    await held.recoveryEntry(CHAIN_ID, LOST).write({
      account: LOST,
      route: 'fresh-install',
      receivingAccount: SMART,
      deployment: retired
    })
    const old = gatheringFor(LOST)
    await held
      .recoverySession(CHAIN_ID, LOST)
      .write({ ...old, request: { ...old.request, manager: RETIRED_MANAGER } } as typeof old, null)
    const page = await open(LOGGED_IN)
    await confirmLost(page)
    expect(navigationsAway()).toEqual([])
    expect(await storedEntry(LOST)).toEqual({
      account: LOST,
      route: 'logged-in',
      receivingAccount: BASIC,
      deployment: DEPLOYMENT
    })
    expect(page.has('entry-continue')).toBe(true)
  })

  it('resumes no recovery whose entry an earlier build wrote with no deployment', async () => {
    await storeLiveRecovery(LOST, { route: 'fresh-install', receivingAccount: SMART })
    await records()
      .recoveryEntry(CHAIN_ID, LOST)
      .write({ account: LOST, route: 'fresh-install', receivingAccount: SMART })
    const page = await open(LOGGED_IN)
    await confirmLost(page)
    expect(navigationsAway()).toEqual([])
    expect((await storedEntry(LOST))?.deployment).toEqual(DEPLOYMENT)
  })

  it('overwrites an entry whose session is no longer live, and reads on', async () => {
    await storeEndedRecovery(LOST, { route: 'fresh-install', receivingAccount: SMART })
    const page = await open(LOGGED_IN)
    await confirmLost(page)
    expect(navigationsAway()).toEqual([])
    expect(await storedEntry(LOST)).toEqual({
      account: LOST,
      route: 'logged-in',
      receivingAccount: BASIC,
      deployment: DEPLOYMENT
    })
    expect(kit.isAuthorized).toHaveBeenCalledTimes(1)
    expect(page.has('entry-continue')).toBe(true)
  })

  it('shows the name it resolved from with the caveat beside the full address', async () => {
    resolveName.mockImplementation(async () => LOST)
    const page = await open(LOGGED_IN)
    await lookUp(page, 'lost.eth')
    expect(page.textOf('entry-confirm-name')).toContain('lost.eth')
    expect(page.textOf('entry-confirm-name-caveat')).toBe(t('socialRecovery.display.nameCaveat'))
    expect(page.textOf('entry-confirm-address')).toBe(LOST)
  })

  it('goes back to the field with nothing written and nothing read when the account is not mine', async () => {
    const page = await open(LOGGED_IN)
    await lookUp(page, LOST.toLowerCase())
    await page.press('entry-confirm-not-mine')
    expect(page.has('entry-account-field')).toBe(true)
    expect(storage.set).not.toHaveBeenCalled()
    expect((await records().recoveryEntry(CHAIN_ID, LOST).read()).status).toBe('absent')
    expect(kit.isAuthorized).not.toHaveBeenCalled()
  })

  it('writes the recovery entry with the route and the receiving account before any read runs', async () => {
    storage.hold = deferred<void>()
    const page = await open(LOGGED_IN)
    await lookUp(page, LOST.toLowerCase())
    await page.press('entry-confirm-mine')
    expect(storage.set).toHaveBeenCalledTimes(1)
    expect(kit.isAuthorized).not.toHaveBeenCalled()
    expect(kit.supportsAccount).not.toHaveBeenCalled()
    expect(page.textOf('entry-confirm-writing')).toBe(t('socialRecovery.loading.session'))
    expect(
      page.byTestId('entry-confirm-writing')?.querySelector('[data-testid="loading-row"]')
    ).not.toBeNull()
    expect(page.isDisabled('entry-confirm-mine')).toBe(true)
    expect(page.isDisabled('entry-confirm-not-mine')).toBe(true)

    // A second press while the write runs writes nothing more.
    await page.press('entry-confirm-mine')
    expect(storage.set).toHaveBeenCalledTimes(1)

    await outside(() => storage.hold?.resolve())
    expect(page.has('entry-confirm-writing')).toBe(false)
    const entry = await records().recoveryEntry(CHAIN_ID, LOST).read()
    expect(entry.status === 'present' && entry.value).toEqual({
      account: LOST,
      route: 'logged-in',
      receivingAccount: BASIC,
      deployment: DEPLOYMENT
    })
    expect(kit.isAuthorized).toHaveBeenCalledTimes(1)
    expect(page.has('entry-continue')).toBe(true)
  })

  it('writes the fresh-install route and its receiving account on that route', async () => {
    const page = await open(FRESH_INSTALL)
    await confirmLost(page)
    const entry = await records().recoveryEntry(CHAIN_ID, LOST).read()
    expect(entry.status === 'present' && entry.value).toEqual({
      account: LOST,
      route: 'fresh-install',
      receivingAccount: SMART,
      deployment: DEPLOYMENT
    })
  })

  it('shows the write failure and writes nothing when the stored entry cannot be read', async () => {
    const page = await open(LOGGED_IN)
    await lookUp(page, LOST.toLowerCase())
    storage.refuseGet = true
    await page.press('entry-confirm-mine')
    expect(page.has('entry-confirm-write-failed')).toBe(true)
    expect(storage.set).not.toHaveBeenCalled()
    expect(kit.isAuthorized).not.toHaveBeenCalled()
    expect(navigationsAway()).toEqual([])
    expectNoContinue(page)
  })

  it('starts no read when the entry write fails', async () => {
    storage.refuse = true
    const page = await open(LOGGED_IN)
    await confirmLost(page)
    expect(page.has('entry-confirm-write-failed')).toBe(true)
    expect(kit.isAuthorized).not.toHaveBeenCalled()
    expectNoContinue(page)
  })
})

describe('the authorization read', () => {
  it('renders the dormant state with no continue, and reads nothing after it', async () => {
    kit.isAuthorized.mockResolvedValueOnce(false)
    const page = await open(LOGGED_IN)
    await confirmLost(page)
    expect(page.textOf('entry-dormant-title')).toBe(t('socialRecovery.entry.dormant.title'))
    expect(page.textOf('entry-dormant-chip')).toBe(chip('notActive'))
    expect(page.has('entry-dormant-running')).toBe(false)
    expectNoContinue(page)
    expect(kit.supportsAccount).not.toHaveBeenCalled()
    expect(kit.holdsAnyPrivilege).not.toHaveBeenCalled()
  })

  it('renders the dormant state over a running attempt, with the line that the attempt cannot execute', async () => {
    kit.setupState.mockResolvedValueOnce(setupStateOf({ attemptActive: true }))
    kit.isAuthorized.mockResolvedValueOnce(false)
    const page = await open(LOGGED_IN)
    await confirmLost(page)
    expect(page.has('entry-dormant')).toBe(true)
    expect(page.textOf('entry-dormant-running')).toBe(
      t('socialRecovery.entry.dormant.runningCannotExecute')
    )
    expectNoContinue(page)
  })

  it('renders a failed authorization read with a retry, never the dormant state; the retry that answers goes on', async () => {
    kit.isAuthorized.mockRejectedValueOnce(new Error('rpc down'))
    const page = await open(LOGGED_IN)
    await confirmLost(page)
    expect(page.has('entry-reads-authorization-failed')).toBe(true)
    expect(page.has('entry-dormant')).toBe(false)
    expectNoContinue(page)
    expect(kit.supportsAccount).not.toHaveBeenCalled()

    await page.press('entry-reads-authorization-failed-retry')
    expect(kit.isAuthorized).toHaveBeenCalledTimes(2)
    expect(page.has('entry-continue')).toBe(true)
  })

  it('shows the authorization read running, named for its stage, until it returns', async () => {
    const held = deferred<boolean>()
    kit.isAuthorized.mockReturnValueOnce(held.promise)
    const page = await open(LOGGED_IN)
    await confirmLost(page)
    expect(page.has('entry-reads-authorization-loading')).toBe(true)
    expect(page.textOf('entry-reads-authorization-loading')).toBe(
      t('socialRecovery.entry.confirm.readingAuthorization')
    )
    expect(
      page
        .byTestId('entry-reads-authorization-loading')
        ?.querySelector('[data-testid="loading-block"]')
    ).not.toBeNull()
    expectNoContinue(page)
    await outside(() => held.resolve(true))
    expect(page.has('entry-continue')).toBe(true)
  })
})

describe('the fit reads', () => {
  const refusals: [string, () => void, string][] = [
    [
      'the action that does not support the account',
      () => kit.supportsAccount.mockResolvedValueOnce(false),
      t('socialRecovery.review.blocked.cannotRecover.reasonNotSupported')
    ],
    [
      'the fit check that fails',
      () => kit.fitCheck.mockResolvedValueOnce({ basis: 'deployed-code', fits: false }),
      t('socialRecovery.review.blocked.cannotRecover.reasonNotSupported')
    ],
    [
      'an account with several key entries',
      () =>
        kit.removedKey.mockResolvedValueOnce({ kind: 'unavailable', cause: 'several-key-entries' }),
      t('socialRecovery.review.blocked.cannotRecover.reasonSeveralKeys')
    ],
    [
      'a removed key the wallet cannot name',
      () => kit.removedKey.mockResolvedValueOnce({ kind: 'unavailable', cause: 'not-a-key' }),
      t('socialRecovery.entry.refusal.removedUnknown')
    ],
    [
      'a removed key that holds no control',
      () => kit.isAuthority.mockImplementation(async () => false),
      t('socialRecovery.entry.refusal.removedNotAuthority')
    ]
  ]
  refusals.forEach(([name, script, reason]) => {
    it(`renders cannot recover yet with its reason, and no continue, for ${name}`, async () => {
      script()
      const page = await open(LOGGED_IN)
      await confirmLost(page)
      expect(page.textOf('entry-cannot-recover-title')).toBe(CANNOT_RECOVER)
      expect(page.textOf('entry-cannot-recover-reason')).toBe(reason)
      expectNoContinue(page)
      expect(kit.holdsAnyPrivilege).not.toHaveBeenCalled()
    })
  })

  it('renders a removed key with no creation record as the refusal, with no retry', async () => {
    kit.removedKey.mockResolvedValueOnce({ kind: 'unavailable', cause: 'no-source' })
    const page = await open(LOGGED_IN)
    await confirmLost(page)
    expect(page.textOf('entry-cannot-recover-title')).toBe(CANNOT_RECOVER)
    expect(page.textOf('entry-cannot-recover-reason')).toBe(
      t('socialRecovery.entry.refusal.removedUnknown')
    )
    expect(page.has('entry-reads-fit-failed')).toBe(false)
    expectNoRetry()
    expectNoContinue(page)
  })

  it('refuses an account with no code and no creation record under its full address, with no retry', async () => {
    kit.fitCheck.mockResolvedValueOnce({ basis: 'no-code', fits: false })
    kit.removedKey.mockResolvedValueOnce({ kind: 'unavailable', cause: 'no-source' })
    const page = await open(LOGGED_IN)
    await confirmLost(page)
    expect(page.textOf('entry-confirmed-address')).toBe(LOST)
    expect(page.textOf('entry-cannot-recover-title')).toBe(CANNOT_RECOVER)
    expect(page.textOf('entry-cannot-recover-reason')).toBe(
      t('socialRecovery.review.blocked.cannotRecover.reasonNotSupported')
    )
    expect(page.has('entry-reads-fit-failed')).toBe(false)
    expectNoRetry()
    expectNoContinue(page)
    expect(page.has('entry-cannot-recover-back')).toBe(true)
    expect(kit.fitCheck).toHaveBeenCalledTimes(1)
    expect(kit.removedKey).toHaveBeenCalledTimes(1)
    expect(kit.holdsAnyPrivilege).not.toHaveBeenCalled()
  })

  it('renders a failed fit read as its own failed state, not a refusal; the retry that answers goes on', async () => {
    kit.fitCheck.mockRejectedValueOnce(new Error('rpc down'))
    const page = await open(LOGGED_IN)
    await confirmLost(page)
    expect(page.has('entry-reads-fit-failed')).toBe(true)
    expect(page.text()).toContain(t('socialRecovery.entry.confirm.fitReadFailedTitle'))
    expect(page.has('entry-cannot-recover')).toBe(false)
    expect(page.text()).not.toContain(CANNOT_RECOVER)
    expectNoContinue(page)

    await page.press('entry-reads-fit-failed-retry')
    // The answered authorization read is kept; the fit reads run again.
    expect(kit.isAuthorized).toHaveBeenCalledTimes(1)
    expect(kit.fitCheck).toHaveBeenCalledTimes(2)
    expect(page.has('entry-continue')).toBe(true)
  })
})

describe('the destination key', () => {
  it('reads the basic account itself as the key a logged-in recovery installs', async () => {
    const page = await open(LOGGED_IN)
    await confirmLost(page)
    expect(kit.holdsAnyPrivilege).toHaveBeenCalledWith(BASIC)
    expect(kit.isAuthority).toHaveBeenCalledWith(BASIC)
    expect(page.has('entry-continue')).toBe(true)
  })

  it("reads a smart account's controlling key as the key a recovery installs", async () => {
    const page = await open(searchOf('logged-in', SMART))
    await confirmLost(page)
    expect(kit.holdsAnyPrivilege).toHaveBeenCalledWith(SMART_KEY)
    expect(kit.holdsAnyPrivilege).not.toHaveBeenCalledWith(SMART)
  })

  it('refuses a key that is already one of the account keys, with the way back to choose another account', async () => {
    kit.isAuthority.mockImplementation(async (address) => address === LOST_KEY || address === BASIC)
    const page = await open(LOGGED_IN)
    await confirmLost(page)
    expect(page.textOf('entry-destination-refusal')).toBe(
      t('socialRecovery.entry.destination.alreadyAKey')
    )
    expectNoContinue(page)
    await page.press('entry-destination-choose-another')
    expect(navigate).toHaveBeenLastCalledWith('/social-recovery/recovery')
  })

  it('refuses a key that already holds a privilege, with the way back to choose another account', async () => {
    kit.holdsAnyPrivilege.mockResolvedValueOnce(true)
    const page = await open(LOGGED_IN)
    await confirmLost(page)
    expect(page.textOf('entry-destination-refusal')).toBe(
      t('socialRecovery.entry.destination.holdsPrivilege')
    )
    expect(page.has('entry-destination-choose-another')).toBe(true)
    expectNoContinue(page)
  })

  it('gives the fresh-install route the refusal sentence without the way to another account', async () => {
    kit.holdsAnyPrivilege.mockResolvedValueOnce(true)
    const page = await open(FRESH_INSTALL)
    await confirmLost(page)
    expect(kit.holdsAnyPrivilege).toHaveBeenCalledWith(SMART_KEY)
    expect(page.textOf('entry-destination-refusal')).toBe(
      t('socialRecovery.entry.destination.holdsPrivilege')
    )
    expect(page.has('entry-destination-choose-another')).toBe(false)
    expect(page.has('entry-destination-back')).toBe(true)
    expectNoContinue(page)
  })

  it('renders a failed destination read with a retry, not a refusal; the retry that answers goes on', async () => {
    kit.holdsAnyPrivilege.mockRejectedValueOnce(new Error('rpc down'))
    const page = await open(LOGGED_IN)
    await confirmLost(page)
    expect(page.has('entry-reads-destination-failed')).toBe(true)
    expect(page.has('entry-destination-refusal')).toBe(false)
    expectNoContinue(page)

    await page.press('entry-reads-destination-failed-retry')
    expect(kit.supportsAccount).toHaveBeenCalledTimes(1)
    expect(page.has('entry-continue')).toBe(true)
  })

  it('shows the destination read running, named for its stage, until it returns', async () => {
    const held = deferred<boolean>()
    kit.holdsAnyPrivilege.mockReturnValueOnce(held.promise)
    const page = await open(LOGGED_IN)
    await confirmLost(page)
    expect(page.textOf('entry-reads-destination-loading')).toBe(
      t('socialRecovery.entry.confirm.readingDestination')
    )
    expect(
      page
        .byTestId('entry-reads-destination-loading')
        ?.querySelector('[data-testid="loading-block"]')
    ).not.toBeNull()
    expect(page.has('entry-destination-refusal')).toBe(false)
    expectNoContinue(page)
    await outside(() => held.resolve(false))
    expect(page.has('entry-continue')).toBe(true)
  })
})

describe('the way on', () => {
  it('continues to the readout with the account once every read answered and nothing refused', async () => {
    const page = await open(LOGGED_IN)
    await confirmLost(page)
    await page.press('entry-continue')
    expect(navigate).toHaveBeenLastCalledWith(`/social-recovery/recovery/readout?account=${LOST}`)
  })
})

describe('a direct open', () => {
  const GATE_CONTINUE = 'entry-gate-continue'

  it('shows the condensed warning before the field, with its own continue that waits for the acknowledgment', async () => {
    const page = await open(LOGGED_IN, null)
    expect(page.has('entry-gate')).toBe(true)
    expect(page.has('recovery-warning')).toBe(true)
    expect(page.has('entry-account-field')).toBe(false)
    expect(page.isDisabled(GATE_CONTINUE)).toBe(true)
    await page.press(GATE_CONTINUE)
    expect(page.has('entry-account-field')).toBe(false)

    await page.press('recovery-warning-acknowledge')
    expect(page.isDisabled(GATE_CONTINUE)).toBe(false)
    await page.press(GATE_CONTINUE)
    expect(page.has('entry-gate')).toBe(false)
    expect(page.has('entry-account-field')).toBe(true)
    expect(page.textOf('recovery-stage')).toBe(
      t('socialRecovery.entry.stageCounter', { step: 2, total: 5 })
    )
  })

  it('shows the condensed warning on the fresh-install route too', async () => {
    const page = await open(FRESH_INSTALL, null)
    expect(page.has('entry-gate')).toBe(true)
    expect(page.has('entry-account-field')).toBe(false)
  })

  it('shows no condensed warning on the fresh-install route where the key step passed the acknowledgment', async () => {
    const page = await open(FRESH_INSTALL)
    expect(page.has('entry-gate')).toBe(false)
    expect(page.has('recovery-warning')).toBe(false)
    expect(page.has('entry-account-field')).toBe(true)
  })

  it('shows the warning for a navigation state that does not say acknowledged', async () => {
    const page = await open(LOGGED_IN, { acknowledged: 'true' })
    expect(page.has('entry-gate')).toBe(true)
    expect(page.has('entry-account-field')).toBe(false)
  })

  it('shows no warning where the screen before passed the acknowledgment', async () => {
    const page = await open(LOGGED_IN)
    expect(page.has('entry-gate')).toBe(false)
    expect(page.has('entry-account-field')).toBe(true)
  })

  it('keeps the acknowledgment it arrived with in this mount, and drops it from the history entry', async () => {
    const page = await open(LOGGED_IN)
    expect(page.has('entry-account-field')).toBe(true)
    expect(historyEntry()).toEqual({
      pathname: '/social-recovery/recovery/account',
      search: LOGGED_IN,
      hash: '',
      state: { prevRoute: expect.objectContaining({ state: { acknowledged: true } }) }
    })
    expect(page.has('entry-gate')).toBe(false)

    // The step goes on in this mount after the history entry lost the flag.
    await confirmLost(page)
    expect(page.has('entry-continue')).toBe(true)
  })

  it('shows the condensed warning again on a reload of an entry the holder arrived on acknowledged', async () => {
    const first = await open(LOGGED_IN)
    expect(first.has('entry-account-field')).toBe(true)
    first.unmount()

    screen = await reloadAccountStep()
    expect(screen.has('entry-gate')).toBe(true)
    expect(screen.has('recovery-warning')).toBe(true)
    expect(screen.has('entry-account-field')).toBe(false)
    expect(screen.isDisabled(GATE_CONTINUE)).toBe(true)
  })

  it('leaves a history entry that carries no acknowledgment as it is', async () => {
    await open(LOGGED_IN, null)
    expect(navigate).not.toHaveBeenCalled()
    expect(historyEntry().state).toBeNull()
  })

  it('takes a new acknowledgment when the step mounts again', async () => {
    const first = await open(LOGGED_IN, null)
    await first.press('recovery-warning-acknowledge')
    expect(first.isDisabled(GATE_CONTINUE)).toBe(false)
    first.unmount()
    screen = null

    const second = await open(LOGGED_IN, null)
    expect(second.isDisabled(GATE_CONTINUE)).toBe(true)
    await second.press(GATE_CONTINUE)
    expect(second.has('entry-account-field')).toBe(false)
  })
})

describe('leaving a blocked state', () => {
  const blockedBy: [string, () => void, string][] = [
    [
      'the dormant state',
      () => kit.isAuthorized.mockResolvedValueOnce(false),
      'entry-dormant-back'
    ],
    [
      'cannot recover yet',
      () => kit.supportsAccount.mockResolvedValueOnce(false),
      'entry-cannot-recover-back'
    ]
  ]
  blockedBy.forEach(([name, script, back]) => {
    it(`goes back to the field from ${name} and clears the entry`, async () => {
      script()
      const page = await open(LOGGED_IN)
      await confirmLost(page)
      expect(await storedEntry(LOST)).not.toBeNull()
      expect(page.textOf(back)).toBe(t('socialRecovery.ceremony.backAction'))
      expectNoContinue(page)
      await page.press(back)
      expect(page.has('entry-account-field')).toBe(true)
      expect(await storedEntry(LOST)).toBeNull()
      expect(navigationsAway()).toEqual([])
    })

    it(`still goes back to the field from ${name} when the clear fails`, async () => {
      script()
      const page = await open(LOGGED_IN)
      await confirmLost(page)
      storage.refuseRemove = true
      await page.press(back)
      expect(page.has('entry-account-field')).toBe(true)
    })
  })

  it('goes back to the choice of another account from a destination refusal on the logged-in route, and clears the entry', async () => {
    kit.holdsAnyPrivilege.mockResolvedValueOnce(true)
    const page = await open(LOGGED_IN)
    await confirmLost(page)
    expect(page.has('entry-destination-back')).toBe(false)
    await page.press('entry-destination-choose-another')
    expect(navigate).toHaveBeenCalledWith('/social-recovery/recovery')
    expect(await storedEntry(LOST)).toBeNull()
  })

  it('still leaves for another account when the clear fails', async () => {
    kit.holdsAnyPrivilege.mockResolvedValueOnce(true)
    const page = await open(LOGGED_IN)
    await confirmLost(page)
    storage.refuseRemove = true
    await page.press('entry-destination-choose-another')
    expect(navigate).toHaveBeenCalledWith('/social-recovery/recovery')
  })

  it('goes back to the field from a destination refusal on the fresh-install route, and clears the entry', async () => {
    kit.holdsAnyPrivilege.mockResolvedValueOnce(true)
    const page = await open(FRESH_INSTALL)
    await confirmLost(page)
    expect(page.textOf('entry-destination-back')).toBe(t('socialRecovery.ceremony.backAction'))
    await page.press('entry-destination-back')
    expect(page.has('entry-account-field')).toBe(true)
    expect(await storedEntry(LOST)).toBeNull()
    expect(navigationsAway()).toEqual([])
  })
})

describe('the no-setup dead end after a confirmation', () => {
  /** Confirms the lost account, then has the rebuilt client read that it carries no setup. */
  const setupGoneAfterConfirm = async (page: Mounted) => {
    await confirmLost(page)
    expect(await storedEntry(LOST)).not.toBeNull()
    kit.setupState.mockResolvedValueOnce(setupStateOf({ hasSetup: false }))
    setClient(LOST, readyClient())
    await outside(() => undefined)
    expect(page.has('entry-no-setup')).toBe(true)
  }

  it('clears the entry when the holder tries another address', async () => {
    const page = await open(LOGGED_IN)
    await setupGoneAfterConfirm(page)
    await page.press('entry-lookup-another')
    expect(page.has('entry-account-field')).toBe(true)
    expect(await storedEntry(LOST)).toBeNull()
  })

  it('clears the entry when the holder closes', async () => {
    const page = await open(LOGGED_IN)
    await setupGoneAfterConfirm(page)
    await page.press('entry-no-setup-close')
    expect(navigate).toHaveBeenCalledWith('social-recovery/setup')
    expect(await storedEntry(LOST)).toBeNull()
  })
})
