/**
 * @jest-environment jsdom
 *
 * The passkey row: the ceremony tab creates the credential and returns to this
 * screen with its report, which fills the slot and records the enrollment with
 * the backup kind the ceremony read. The access test runs through the same tab
 * and never holds the save.
 */
import type { Address, Clause, Credential, Hex } from '@web/modules/social-recovery/sdk-interfaces'
import type { CeremonyOutcome, PasskeyFacts } from '@web/modules/social-recovery/shared/ceremony'
import type {
  CeremonyRequestRecord,
  Enrollment,
  WalletRecords
} from '@web/modules/social-recovery/shared/records'

import type { MethodChip } from '@web/modules/social-recovery/shared/display'

import type { EnrollSearch } from '@web/modules/social-recovery/setup/enroll/types'
import type {
  FakeDeps,
  Mounted,
  StorageFaults,
  TestRecord
} from '@web/modules/social-recovery/setup/enroll/__tests__/harness'
import {
  ACCOUNT,
  BOOK,
  BOUND_TO_THIS_MAC,
  CHAIN_ID,
  DESCRIPTOR,
  depsOf,
  draftOf,
  each,
  emptySlot,
  mountView,
  NOW,
  outside,
  pathWith,
  recordsWith,
  settle,
  storedClauses,
  storedEnrollments,
  SYNCED_ON_GOOGLE,
  t
} from '@web/modules/social-recovery/setup/enroll/__tests__/harness'

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const {
  WEB_ROUTES
}: typeof import('@common/modules/router/constants/common') = require('@common/modules/router/constants/common')
const { zeroHash }: typeof import('viem') = require('viem')
const {
  dismissed,
  failed,
  isInternalPath,
  notSupported,
  parseCeremonySearch,
  passed,
  passkeyFactsOf,
  unavailable
}: typeof import('@web/modules/social-recovery/shared/ceremony') = require('@web/modules/social-recovery/shared/ceremony')
const {
  REQUEST_WINDOW_SECONDS
}: typeof import('@web/modules/social-recovery/shared/client') = require('@web/modules/social-recovery/shared/client')
const {
  renderChip,
  renderHash
}: typeof import('@web/modules/social-recovery/shared/display') = require('@web/modules/social-recovery/shared/display')
const {
  parseEnrollSearch
}: typeof import('@web/modules/social-recovery/setup/enroll/search') = require('@web/modules/social-recovery/setup/enroll/search')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const CEREMONY = 'socialRecovery.ceremony'
const PASSKEY = 'socialRecovery.enroll.passkey'
const DEFAULT_NAME = t(`${PASSKEY}.defaultName`, { device: t(`${CEREMONY}.devices.thisMac`) })

/** Two empty passkey slots; the screen fills the second. */
const TWO_SLOTS: Clause[] = pathWith(emptySlot('passkey'), emptySlot('passkey'))
const SEARCH: EnrollSearch = { kind: 'passkey', at: { clause: 0, member: 1 } }

const CONFIG: Hex = '0xc0ffee'
const createdWith = (facts: PasskeyFacts, config: Hex = CONFIG, credentialId = 'credential-a') =>
  passed({ config, facts, credentialId })

const chip = (name: MethodChip) => renderChip('method', name, t)

/**
 * The facts a test reads from an assertion: its authenticator data carries the
 * flags but no attested credential data, so no AAGUID, and the browser reports
 * no transports for it.
 */
const assertedOn = (attachment: 'platform' | 'cross-platform', synced: boolean): PasskeyFacts => {
  const authenticatorData = new Uint8Array(37)
  // User present and verified, plus backup eligible and backed up for a synced passkey.
  authenticatorData[32] = synced ? 0x1d : 0x05
  return passkeyFactsOf({ authenticatorData, authenticatorAttachment: attachment })
}

describe('the passkey row', () => {
  let view: Mounted | undefined
  let records: WalletRecords
  let faults: StorageFaults
  let deps: FakeDeps

  const open = async (search: EnrollSearch = SEARCH) => {
    view?.unmount()
    view = await mountView({ records, search, deps })
    await settle()
    return view
  }

  beforeEach(async () => {
    ;({ records, faults } = await recordsWith(TWO_SLOTS))
    deps = depsOf()
  })

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  const lastNavigation = (): string => {
    const calls = view?.navigate.mock.calls ?? []
    return calls[calls.length - 1]?.[0]
  }

  const storedRequest = async (id: string): Promise<CeremonyRequestRecord | undefined> => {
    const read = await records.ceremonyRequest(id).read()
    return read.status === 'present' ? read.value : undefined
  }

  /** The tab writes its report and returns to the path the row gave it. */
  const returnFrom = async (
    id: string,
    call: 'enroll' | 'testAccess',
    outcome: CeremonyOutcome<unknown>
  ) => {
    await deps.channel.report(id, call, outcome)
    await open({ ...SEARCH, ceremony: id })
  }

  const createAndReturn = async (outcome: CeremonyOutcome<unknown>) => {
    await open()
    await view!.press('passkey-create-here')
    const id = deps.requestIds[deps.requestIds.length - 1]
    await returnFrom(id, 'enroll', outcome)
    return id
  }

  /** An enrollment created in this mount, then the test run and its report brought back. */
  const testAndReturn = async (outcome: CeremonyOutcome<unknown>) => {
    await createAndReturn(createdWith(SYNCED_ON_GOOGLE))
    await view!.press('passkey-run-test')
    const id = deps.requestIds[deps.requestIds.length - 1]
    const asked = await storedRequest(id)
    await returnFrom(id, 'testAccess', outcome)
    return asked
  }

  describe('before creation', () => {
    it('reads Chrome only and offers no create action where passkeys are not served', async () => {
      deps = depsOf({ passkeysServed: false })
      await open()
      expect(view!.byTestId('passkey-chrome-only')?.textContent).toBe(t(`${CEREMONY}.chromeOnly`))
      expect(view!.byTestId('passkey-create-here')).toBeNull()
      expect(view!.byTestId('passkey-create-on-phone')).toBeNull()
    })

    it('offers the kind, the authenticators, the name, both routes and the test to come', async () => {
      await open()
      expect(view!.byTestId('passkey-chrome-only')).toBeNull()
      expect(view!.byTestId('passkey-kind-name')?.textContent).toBe(
        t('socialRecovery.methodNames.passkeyOnThisDevice')
      )
      const text = view!.text()
      expect(text).toContain(t(`${PASSKEY}.authenticators`))
      expect(text).toContain(t(`${PASSKEY}.noneYet`))
      expect(text).toContain(t(`${PASSKEY}.createLine`))
      expect(text).toContain(t(`${PASSKEY}.testOffered`))
      expect(view!.byTestId('passkey-create-here')?.textContent).toBe(t(`${PASSKEY}.create`))
      expect(view!.byTestId('passkey-create-on-phone')?.textContent).toBe(
        t(`${PASSKEY}.createOnPhoneInstead`)
      )
      expect(view!.inputOf('passkey-name')?.value).toBe(DEFAULT_NAME)
    })

    it('opens and closes the explainer under Learn more', async () => {
      await open()
      expect(view!.byTestId('passkey-explainer')).toBeNull()
      await view!.press('passkey-learn-more')
      expect(view!.byTestId('passkey-explainer')?.textContent).toBe(t(`${PASSKEY}.explainer`))
      await view!.press('passkey-learn-more')
      expect(view!.byTestId('passkey-explainer')).toBeNull()
    })

    it('holds Save and continue beside the create-first line', async () => {
      await open()
      expect(view!.isDisabled('enroll-save')).toBe(true)
      expect(view!.byTestId('enroll-create-first')?.textContent).toBe(t(`${PASSKEY}.createFirst`))
    })
  })

  describe('create', () => {
    each([
      ['this device', 'passkey-create-here', false],
      ['the phone', 'passkey-create-on-phone', true]
    ] as const)(
      'stores the ceremony request and opens the tab for %s',
      async ([, button, handOff]) => {
        await open()
        await view!.type('passkey-name', 'Work laptop')
        await view!.press(button)

        const [id] = deps.requestIds
        expect(await storedRequest(id)).toEqual({
          call: 'enroll',
          method: 'passkey',
          account: ACCOUNT,
          chainId: CHAIN_ID,
          methodAddress: BOOK.methods.passkey,
          params: { userName: 'Work laptop', handOff }
        })

        const target = lastNavigation()
        expect(target.startsWith(`/${WEB_ROUTES.socialRecoveryCeremony}?`)).toBe(true)
        const parsed = parseCeremonySearch(target.slice(target.indexOf('?')))
        if (!parsed.ok) {
          throw new Error('the row opened no ceremony')
        }
        expect(parsed.params).toMatchObject({ call: 'enroll', method: 'passkey', id, handOff })
        const returnTo = parsed.params.returnTo ?? ''
        expect(isInternalPath(returnTo)).toBe(true)
        expect(returnTo.startsWith(`/${WEB_ROUTES.socialRecoverySetupEnroll}?`)).toBe(true)
        expect(parseEnrollSearch(returnTo.slice(returnTo.indexOf('?')))).toEqual({
          ...SEARCH,
          ceremony: id
        })
      }
    )

    it('uses the default name where the field is left blank', async () => {
      await open()
      await view!.type('passkey-name', '   ')
      await view!.press('passkey-create-here')
      const asked = await storedRequest(deps.requestIds[0])
      expect(asked?.call === 'enroll' && asked.params).toEqual({
        userName: DEFAULT_NAME,
        handOff: false
      })
    })

    it('renders the write failure and opens no tab where the request cannot be stored', async () => {
      faults.refuse = [':ceremonyRequest:']
      await open()
      await view!.press('passkey-create-here')
      expect(view!.byTestId('enroll-write-failed')?.textContent).toBe(
        t('socialRecovery.records.writeFailed')
      )
      expect(view!.navigate).not.toHaveBeenCalled()
    })
  })

  describe('a passed creation', () => {
    each([
      ['a synced passkey', SYNCED_ON_GOOGLE, 'synced', 'syncedLoss'],
      ['a device-bound passkey', BOUND_TO_THIS_MAC, 'device-bound', 'deviceBoundLoss']
    ] as const)('fills the named slot with %s', async ([, facts, backup, lossKey]) => {
      await open()
      await view!.type('passkey-name', 'Work laptop')
      await view!.press('passkey-create-here')
      const [id] = deps.requestIds
      await returnFrom(id, 'enroll', createdWith(facts))

      const credential = { method: BOOK.methods.passkey, config: CONFIG, label: 'Work laptop' }
      expect(await storedClauses(records)).toEqual(pathWith(emptySlot('passkey'), credential))
      expect(await storedEnrollments(records)).toEqual([
        { credential, test: 'not-tested', backup, facts, credentialId: 'credential-a' }
      ])

      const kindLine =
        facts.kind === 'synced'
          ? t(`${CEREMONY}.syncedKind`, { provider: t(`${CEREMONY}.providers.google`) })
          : t(`${CEREMONY}.deviceBoundKind`, { device: t(`${CEREMONY}.devices.thisMac`) })
      expect(view!.byTestId('passkey-label')?.textContent).toBe('Work laptop')
      expect(view!.byTestId('passkey-chip')?.textContent).toBe(chip('notTested'))
      expect(view!.byTestId('passkey-kind-line')?.textContent).toBe(kindLine)
      expect(view!.byTestId('passkey-loss-line')?.textContent).toBe(t(`${CEREMONY}.${lossKey}`))
      expect(view!.byTestId('passkey-origin')?.textContent).toBe(t(`${CEREMONY}.passkeyOrigin`))
      expect(view!.byTestId('passkey-none-yet')).toBeNull()
    })

    it('names a passkey the phone created as one on your phone', async () => {
      await createAndReturn(createdWith({ ...SYNCED_ON_GOOGLE, place: 'phone' }))
      expect(view!.byTestId('passkey-kind-name')?.textContent).toBe(
        t('socialRecovery.methodNames.passkeyOnYourPhone')
      )
    })

    it('wipes the request, takes the report once and drops the id from the search', async () => {
      const id = await createAndReturn(createdWith(SYNCED_ON_GOOGLE))
      expect(await storedRequest(id)).toBeUndefined()
      expect(deps.channel.has(id)).toBe(false)
      expect(deps.channel.takes).toHaveBeenCalledTimes(1)
      expect(view!.navigate).toHaveBeenCalledWith(
        `/${WEB_ROUTES.socialRecoverySetupEnroll}?kind=passkey&clause=0&member=1`,
        { replace: true }
      )

      // A reload that still carries the id finds nothing more to apply.
      await open({ ...SEARCH, ceremony: id })
      expect(await storedEnrollments(records)).toHaveLength(1)
      expect(view!.byTestId('passkey-undelivered')).toBeNull()
    })

    it('applies a report that lands after the return', async () => {
      await open()
      await view!.press('passkey-create-here')
      const [id] = deps.requestIds
      await open({ ...SEARCH, ceremony: id })
      expect(view!.byTestId('passkey-undelivered')?.textContent).toBe(
        t(`${CEREMONY}.undeliveredNote`)
      )
      expect(deps.channel.listeners()).toBe(1)

      await outside(() => deps.channel.report(id, 'enroll', createdWith(SYNCED_ON_GOOGLE)))
      await settle()
      expect(view!.byTestId('passkey-undelivered')).toBeNull()
      expect(view!.byTestId('passkey-chip')?.textContent).toBe(chip('notTested'))
      expect(await storedEnrollments(records)).toHaveLength(1)
    })

    it('leaves the row unchanged with the undelivered note where no report came back', async () => {
      await open()
      await view!.press('passkey-create-here')
      await open({ ...SEARCH, ceremony: deps.requestIds[0] })
      expect(view!.byTestId('passkey-undelivered')?.textContent).toBe(
        t(`${CEREMONY}.undeliveredNote`)
      )
      expect(view!.byTestId('passkey-none-yet')).not.toBeNull()
      expect(await storedClauses(records)).toEqual(TWO_SLOTS)
      view!.unmount()
      view = undefined
      expect(deps.channel.listeners()).toBe(0)
    })

    it('enables Save and continue, which returns to the editor', async () => {
      await createAndReturn(createdWith(SYNCED_ON_GOOGLE))
      expect(view!.isDisabled('enroll-save')).toBe(false)
      expect(view!.byTestId('enroll-save')?.textContent).toBe(
        t('socialRecovery.actions.saveAndContinue')
      )
      expect(view!.byTestId('enroll-create-first')).toBeNull()
      await view!.press('enroll-save')
      expect(lastNavigation()).toBe(WEB_ROUTES.socialRecoverySetupEditor)
    })
  })

  describe('a creation that did not pass', () => {
    each([
      ['a cancelled prompt', dismissed('cancelled', 'NotAllowedError'), 'cancelledNote'],
      ['a refused prompt', dismissed('refused', 'InvalidStateError'), 'refusedNote'],
      ['a failure', failed('thrown'), 'failedNote'],
      ['a service that did not answer', unavailable('service-unanswered'), 'unavailableNote'],
      ['a phone that never connected', unavailable('unreachable'), 'unreachableNote'],
      ['a method this build cannot serve', notSupported('no-implementation'), 'notSupportedNote'],
      ['a provider that refused Kohaku', failed('relying-party-mismatch'), 'providerRefused']
    ] as const)(
      'leaves the row unchanged after %s, with its note',
      async ([, outcome, noteKey]) => {
        const id = await createAndReturn(outcome)
        expect(view!.byTestId('passkey-enroll-note')?.textContent).toBe(t(`${CEREMONY}.${noteKey}`))
        expect(view!.byTestId('passkey-none-yet')).not.toBeNull()
        expect(view!.byTestId('passkey-enrolled')).toBeNull()
        expect(view!.isDisabled('enroll-save')).toBe(true)
        expect(await storedClauses(records)).toEqual(TWO_SLOTS)
        expect(await storedEnrollments(records)).toEqual([])
        expect(await storedRequest(id)).toBeUndefined()
      }
    )

    it('tries again with the same name', async () => {
      await open()
      await view!.type('passkey-name', 'Work laptop')
      await view!.press('passkey-create-here')
      await returnFrom(deps.requestIds[0], 'enroll', dismissed('cancelled'))
      expect(view!.inputOf('passkey-name')?.value).toBe('Work laptop')

      await view!.press('passkey-try-again')
      const retried = await storedRequest(deps.requestIds[1])
      expect(retried?.call === 'enroll' && retried.params).toEqual({
        userName: 'Work laptop',
        handOff: false
      })
    })

    it('tries a phone that never connected again over the phone', async () => {
      await open()
      await view!.press('passkey-create-on-phone')
      await returnFrom(deps.requestIds[0], 'enroll', unavailable('unreachable'))
      expect(view!.byTestId('passkey-kind-name')?.textContent).toBe(
        t('socialRecovery.methodNames.passkeyOnYourPhone')
      )
      await view!.press('passkey-try-again')
      const parsed = parseCeremonySearch(lastNavigation().slice(lastNavigation().indexOf('?')))
      expect(parsed.ok && parsed.params.handOff).toBe(true)
    })

    it('renders the write failure and leaves the slot empty where the enrollment cannot be stored', async () => {
      faults.refuse = [':enrollments:']
      await createAndReturn(createdWith(SYNCED_ON_GOOGLE))
      expect(view!.byTestId('enroll-write-failed')?.textContent).toBe(
        t('socialRecovery.records.writeFailed')
      )
      expect(view!.byTestId('passkey-none-yet')).not.toBeNull()
      expect(view!.isDisabled('enroll-save')).toBe(true)
      expect(await storedClauses(records)).toEqual(TWO_SLOTS)
    })

    it('renders the write failure and leaves the slot empty where the draft cannot be stored', async () => {
      faults.refuse = [':setupDraft:']
      await createAndReturn(createdWith(SYNCED_ON_GOOGLE))
      expect(view!.byTestId('enroll-write-failed')?.textContent).toBe(
        t('socialRecovery.records.writeFailed')
      )
      expect(view!.isDisabled('enroll-save')).toBe(true)
      expect(await storedClauses(records)).toEqual(TWO_SLOTS)
    })
  })

  describe('the access test', () => {
    it('offers the test, recommended, without enforcing it', async () => {
      await createAndReturn(createdWith(SYNCED_ON_GOOGLE))
      const block = view!.byTestId('passkey-test')?.textContent ?? ''
      expect(block).toContain(t('socialRecovery.enroll.accessTest'))
      expect(block).toContain(t('socialRecovery.enroll.recommended'))
      expect(block).toContain(t(`${PASSKEY}.testLead`))
      expect(view!.byTestId('passkey-run-test')?.textContent).toBe(
        t('socialRecovery.actions.runTheTest')
      )
      expect(view!.byTestId('passkey-skip-test')?.textContent).toBe(
        t('socialRecovery.actions.skipTheTest')
      )
      expect(view!.isDisabled('enroll-save')).toBe(false)
    })

    it('opens the tab with a test request for the credential it created', async () => {
      await createAndReturn(createdWith(SYNCED_ON_GOOGLE))
      await view!.press('passkey-run-test')
      const id = deps.requestIds[deps.requestIds.length - 1]
      const asked = await storedRequest(id)
      if (asked?.call !== 'testAccess') {
        throw new Error('no test request stored')
      }

      expect(asked).toMatchObject({
        method: 'passkey',
        account: ACCOUNT,
        chainId: CHAIN_ID,
        params: { credentialId: 'credential-a' }
      })
      expect(asked.request).toMatchObject({
        kind: 'recovery-proof-request',
        purpose: 'approval',
        chainId: String(CHAIN_ID),
        manager: DESCRIPTOR.manager,
        action: DESCRIPTOR.action,
        digestVersion: DESCRIPTOR.digestVersion,
        account: ACCOUNT,
        attemptId: '0',
        setupNonce: '0',
        setupBodyHash: zeroHash,
        place: 0,
        method: BOOK.methods.passkey,
        config: CONFIG,
        validUntil: String(NOW / 1000 + REQUEST_WINDOW_SECONDS)
      })
      expect(asked.request.salt).toMatch(/^0x[0-9a-f]{64}$/)

      const target = lastNavigation()
      const parsed = parseCeremonySearch(target.slice(target.indexOf('?')))
      if (!parsed.ok) {
        throw new Error('the row opened no ceremony')
      }
      expect(parsed.params).toMatchObject({ call: 'testAccess', method: 'passkey', id })
      const returnTo = parsed.params.returnTo ?? ''
      expect(parseEnrollSearch(returnTo.slice(returnTo.indexOf('?')))?.ceremony).toBe(id)
    })

    it('reads tested after a passed test, with the salt of the challenge it signed', async () => {
      const asked = await testAndReturn(passed({ proof: '0x0102' }))
      if (asked?.call !== 'testAccess') {
        throw new Error('no test request stored')
      }

      expect(view!.byTestId('passkey-chip')?.textContent).toBe(chip('tested'))
      expect(view!.byTestId('passkey-test-line')?.textContent).toBe(t(`${PASSKEY}.testPassed`))
      expect(view!.byTestId('passkey-signed-note')?.textContent).toBe(
        t(`${PASSKEY}.signedNote`, { hash: renderHash(asked.request.salt as Hex) })
      )
      expect(view!.byTestId('passkey-run-test-again')?.textContent).toBe(
        t('socialRecovery.actions.runTheTestAgain')
      )
      const [enrollment] = await storedEnrollments(records)
      expect(enrollment).toMatchObject({ test: 'passed', backup: 'synced' })
      expect(enrollment.cause).toBeUndefined()
      expect(view!.isDisabled('enroll-save')).toBe(false)
    })

    it('reads test failed with the cause, a retry, a new passkey and Save anyway', async () => {
      await testAndReturn(failed('browser-error', 'NotAllowedError'))
      expect(view!.byTestId('passkey-chip')?.textContent).toBe(chip('testFailed'))
      expect(view!.byTestId('passkey-test-line')?.textContent).toBe(t(`${CEREMONY}.testFailedLine`))
      expect(view!.byTestId('passkey-test-error')?.textContent).toBe('NotAllowedError')
      expect(view!.byTestId('passkey-test-retry')?.textContent).toBe(
        t('socialRecovery.writes.tryAgain')
      )
      expect(view!.byTestId('passkey-create-new')?.textContent).toBe(t(`${PASSKEY}.createNew`))
      expect(view!.byTestId('enroll-save')?.textContent).toBe(
        t('socialRecovery.actions.saveAnyway')
      )
      expect(view!.isDisabled('enroll-save')).toBe(false)
      const [enrollment] = await storedEnrollments(records)
      expect(enrollment).toMatchObject({ test: 'failed', cause: 'browser-error: NotAllowedError' })
    })

    it('reads test unavailable with its line once and a retry', async () => {
      await testAndReturn(unavailable('service-unanswered'))
      expect(view!.byTestId('passkey-chip')?.textContent).toBe(chip('testUnavailable'))
      expect(view!.text().split(t(`${CEREMONY}.testUnavailableLine`))).toHaveLength(2)
      expect(view!.byTestId('passkey-test-retry')).not.toBeNull()
      expect(view!.byTestId('passkey-create-new')).toBeNull()
      expect(view!.isDisabled('enroll-save')).toBe(false)
      const [enrollment] = await storedEnrollments(records)
      expect(enrollment).toMatchObject({ test: 'unavailable', cause: 'service-unanswered' })
    })

    it('reads not supported with its line and no retry', async () => {
      await testAndReturn(notSupported('no-implementation'))
      expect(view!.byTestId('passkey-chip')?.textContent).toBe(chip('notSupported'))
      expect(view!.byTestId('passkey-test-line')?.textContent).toBe(
        t(`${CEREMONY}.notSupportedLine`)
      )
      expect(view!.byTestId('passkey-test-retry')).toBeNull()
      expect(view!.byTestId('passkey-run-test')).toBeNull()
      expect(view!.isDisabled('enroll-save')).toBe(false)
      const [enrollment] = await storedEnrollments(records)
      expect(enrollment).toMatchObject({ test: 'not-supported', cause: 'no-implementation' })
    })

    it('keeps not tested with its line after a skip, and still offers the test', async () => {
      await createAndReturn(createdWith(SYNCED_ON_GOOGLE))
      await view!.press('passkey-skip-test')
      expect(view!.byTestId('passkey-chip')?.textContent).toBe(chip('notTested'))
      expect(view!.byTestId('passkey-test-line')?.textContent).toBe(t(`${CEREMONY}.notTestedLine`))
      expect(view!.byTestId('passkey-skip-test')).toBeNull()
      expect(view!.byTestId('passkey-run-test')).not.toBeNull()
      expect(view!.isDisabled('enroll-save')).toBe(false)
      const [enrollment] = await storedEnrollments(records)
      expect(enrollment.test).toBe('not-tested')
    })

    it('leaves the verdict as it was after a dismissed test, with its note', async () => {
      await testAndReturn(dismissed('cancelled'))
      expect(view!.byTestId('passkey-chip')?.textContent).toBe(chip('notTested'))
      expect(view!.allText('passkey-test-note')).toEqual([t(`${CEREMONY}.cancelledNote`)])
      const [enrollment] = await storedEnrollments(records)
      expect(enrollment.test).toBe('not-tested')
    })

    it('draws a fresh salt for every test', async () => {
      const first = await testAndReturn(dismissed('cancelled'))
      await view!.press('passkey-run-test')
      const second = await storedRequest(deps.requestIds[deps.requestIds.length - 1])
      if (first?.call !== 'testAccess' || second?.call !== 'testAccess') {
        throw new Error('no test requests stored')
      }
      expect(first.request.salt).not.toBe(second.request.salt)
    })

    it('replaces the credential and its enrollment when a new passkey is created', async () => {
      await testAndReturn(failed('browser-error', 'NotAllowedError'))
      await view!.press('passkey-create-new')
      const id = deps.requestIds[deps.requestIds.length - 1]
      expect((await storedRequest(id))?.call).toBe('enroll')
      await returnFrom(id, 'enroll', createdWith(BOUND_TO_THIS_MAC, '0xbeef', 'credential-b'))

      const replaced: Credential = {
        method: BOOK.methods.passkey,
        config: '0xbeef',
        label: DEFAULT_NAME
      }
      expect(await storedClauses(records)).toEqual(pathWith(emptySlot('passkey'), replaced))
      expect(await storedEnrollments(records)).toEqual([
        {
          credential: replaced,
          test: 'not-tested',
          backup: 'device-bound',
          facts: BOUND_TO_THIS_MAC,
          credentialId: 'credential-b'
        }
      ])
      expect(view!.byTestId('passkey-chip')?.textContent).toBe(chip('notTested'))
    })

    it('renders the write failure where the verdict cannot be stored, and keeps the credential', async () => {
      await createAndReturn(createdWith(SYNCED_ON_GOOGLE))
      await view!.press('passkey-run-test')
      const id = deps.requestIds[deps.requestIds.length - 1]
      faults.refuse = [':enrollments:']
      await returnFrom(id, 'testAccess', passed({ proof: '0x01' }))
      expect(view!.byTestId('enroll-write-failed')?.textContent).toBe(
        t('socialRecovery.records.writeFailed')
      )
      const [enrollment] = await storedEnrollments(records)
      expect(enrollment.test).toBe('not-tested')
      expect(view!.isDisabled('enroll-save')).toBe(false)
    })
  })

  describe('across the trips to the ceremony tab', () => {
    const PHONE_BOUND: PasskeyFacts = {
      kind: 'device-bound',
      backedUp: false,
      place: 'phone',
      attachment: 'cross-platform',
      transports: ['hybrid']
    }
    const PHONE_KIND_LINE = t(`${CEREMONY}.deviceBoundKind`, {
      device: t(`${CEREMONY}.devices.thisPhone`)
    })

    each([
      ['a failed test', failed('browser-error', 'NotAllowedError')],
      ['an unavailable test', unavailable('service-unanswered')],
      ['a dismissed test', dismissed('cancelled')]
    ] as const)('keeps the kind line and the phone kind name after %s', async ([, outcome]) => {
      await open()
      await view!.press('passkey-create-on-phone')
      await returnFrom(deps.requestIds[0], 'enroll', createdWith(PHONE_BOUND))
      expect(view!.byTestId('passkey-kind-line')?.textContent).toBe(PHONE_KIND_LINE)

      await view!.press('passkey-run-test')
      await returnFrom(deps.requestIds[1], 'testAccess', outcome)
      expect(view!.byTestId('passkey-kind-line')?.textContent).toBe(PHONE_KIND_LINE)
      expect(view!.byTestId('passkey-kind-name')?.textContent).toBe(
        t('socialRecovery.methodNames.passkeyOnYourPhone')
      )
      expect(view!.byTestId('passkey-loss-line')?.textContent).toBe(
        t(`${CEREMONY}.deviceBoundLoss`)
      )
    })

    each([
      ['a cancelled', dismissed('cancelled', 'NotAllowedError')],
      ['a refused', dismissed('refused', 'InvalidStateError')]
    ] as const)('tries %s phone route again over the phone', async ([, outcome]) => {
      await open()
      await view!.type('passkey-name', 'Work laptop')
      await view!.press('passkey-create-on-phone')
      await returnFrom(deps.requestIds[0], 'enroll', outcome)
      expect(view!.byTestId('passkey-kind-name')?.textContent).toBe(
        t('socialRecovery.methodNames.passkeyOnYourPhone')
      )

      await view!.press('passkey-try-again')
      const retried = await storedRequest(deps.requestIds[1])
      expect(retried?.call === 'enroll' && retried.params).toEqual({
        userName: 'Work laptop',
        handOff: true
      })
      const parsed = parseCeremonySearch(lastNavigation().slice(lastNavigation().indexOf('?')))
      expect(parsed.ok && parsed.params).toMatchObject({
        call: 'enroll',
        id: deps.requestIds[1],
        handOff: true
      })
    })

    it('keeps the kind name, Learn more and the explainer after creation', async () => {
      await createAndReturn(createdWith(SYNCED_ON_GOOGLE))
      expect(view!.byTestId('passkey-enrolled')).not.toBeNull()
      expect(view!.byTestId('passkey-kind-name')?.textContent).toBe(
        t('socialRecovery.methodNames.passkeyOnThisDevice')
      )
      expect(view!.byTestId('passkey-learn-more')?.textContent).toBe(
        t('socialRecovery.actions.learnMore')
      )
      await view!.press('passkey-learn-more')
      expect(view!.byTestId('passkey-explainer')?.textContent).toBe(t(`${PASSKEY}.explainer`))
    })
  })

  describe('a write that fails after a passed creation', () => {
    it('keeps the created passkey and stores it on a retry without a second ceremony', async () => {
      faults.refuse = [':enrollments:']
      const id = await createAndReturn(createdWith(SYNCED_ON_GOOGLE))
      expect(view!.byTestId('enroll-write-failed')?.textContent).toBe(
        t('socialRecovery.records.writeFailed')
      )
      expect(view!.byTestId('passkey-place-retry')?.textContent).toBe(
        t('socialRecovery.writes.tryAgain')
      )
      const navigations = view!.navigate.mock.calls.length

      faults.refuse = []
      await view!.press('passkey-place-retry')
      const credential = { method: BOOK.methods.passkey, config: CONFIG, label: DEFAULT_NAME }
      expect(await storedClauses(records)).toEqual(pathWith(emptySlot('passkey'), credential))
      expect(await storedEnrollments(records)).toEqual([
        {
          credential,
          test: 'not-tested',
          backup: 'synced',
          facts: SYNCED_ON_GOOGLE,
          credentialId: 'credential-a'
        }
      ])
      expect(deps.requestIds).toEqual([id])
      expect(view!.navigate.mock.calls).toHaveLength(navigations)
      expect(view!.byTestId('enroll-write-failed')).toBeNull()
      expect(view!.byTestId('passkey-place-retry')).toBeNull()
      expect(view!.byTestId('passkey-chip')?.textContent).toBe(chip('notTested'))
      expect(view!.isDisabled('enroll-save')).toBe(false)
    })

    it('leaves the enrollments list as it was where the draft cannot be stored', async () => {
      const earlier: Credential = { method: BOOK.methods.passkey, config: '0xaa', label: 'Old' }
      const earlierList = [
        { credential: earlier, test: 'passed' as const, backup: 'synced' as const }
      ]
      ;({ records, faults } = await recordsWith(
        pathWith(earlier, emptySlot('passkey')),
        earlierList
      ))
      faults.refuse = [':setupDraft:']
      await createAndReturn(createdWith(SYNCED_ON_GOOGLE))
      expect(view!.byTestId('enroll-write-failed')).not.toBeNull()
      expect(await storedEnrollments(records)).toEqual(earlierList)
      expect(await storedClauses(records)).toEqual(pathWith(earlier, emptySlot('passkey')))

      faults.refuse = []
      await view!.press('passkey-place-retry')
      const credential = { method: BOOK.methods.passkey, config: CONFIG, label: DEFAULT_NAME }
      expect(await storedEnrollments(records)).toEqual([
        ...earlierList,
        {
          credential,
          test: 'not-tested',
          backup: 'synced',
          facts: SYNCED_ON_GOOGLE,
          credentialId: 'credential-a'
        }
      ])
    })
  })

  describe('a report that never came back', () => {
    it('offers to try again beside the undelivered note, and runs the creation again', async () => {
      await open()
      await view!.type('passkey-name', 'Work laptop')
      await view!.press('passkey-create-on-phone')
      const [stale] = deps.requestIds
      await open({ ...SEARCH, ceremony: stale })
      expect(view!.byTestId('passkey-undelivered')?.textContent).toBe(
        t(`${CEREMONY}.undeliveredNote`)
      )
      expect(view!.byTestId('passkey-undelivered-retry')?.textContent).toBe(
        t(`${CEREMONY}.tryAgainAction`)
      )

      await view!.press('passkey-undelivered-retry')
      expect(await storedRequest(stale)).toBeUndefined()
      expect(deps.channel.listeners()).toBe(0)
      expect(view!.navigate).toHaveBeenCalledWith(
        `/${WEB_ROUTES.socialRecoverySetupEnroll}?kind=passkey&clause=0&member=1`,
        { replace: true }
      )
      const fresh = deps.requestIds[1]
      expect(fresh).toBeDefined()
      const retried = await storedRequest(fresh)
      expect(retried?.call === 'enroll' && retried.params).toEqual({
        userName: 'Work laptop',
        handOff: true
      })
      const parsed = parseCeremonySearch(lastNavigation().slice(lastNavigation().indexOf('?')))
      expect(parsed.ok && parsed.params).toMatchObject({ call: 'enroll', id: fresh, handOff: true })

      // A reload that still carries the old id waits for nothing.
      await open({ ...SEARCH, ceremony: stale })
      expect(view!.byTestId('passkey-undelivered')).toBeNull()
    })

    it('runs the test again by the stored request', async () => {
      await createAndReturn(createdWith(SYNCED_ON_GOOGLE))
      await view!.press('passkey-run-test')
      const stale = deps.requestIds[deps.requestIds.length - 1]
      const asked = await storedRequest(stale)
      await open({ ...SEARCH, ceremony: stale })
      expect(view!.byTestId('passkey-undelivered')).not.toBeNull()

      await view!.press('passkey-undelivered-retry')
      expect(await storedRequest(stale)).toBeUndefined()
      const fresh = deps.requestIds[deps.requestIds.length - 1]
      expect(fresh).not.toBe(stale)
      const retried = await storedRequest(fresh)
      if (retried?.call !== 'testAccess' || asked?.call !== 'testAccess') {
        throw new Error('no test request stored')
      }
      expect(retried.params).toMatchObject({ credentialId: 'credential-a' })
      expect(retried.request.config).toBe(CONFIG)
      expect(retried.request.salt).not.toBe(asked.request.salt)
      const parsed = parseCeremonySearch(lastNavigation().slice(lastNavigation().indexOf('?')))
      expect(parsed.ok && parsed.params).toMatchObject({ call: 'testAccess', id: fresh })
    })
  })

  describe('the facts kept in the record', () => {
    const CREDENTIAL: Credential = {
      method: BOOK.methods.passkey,
      config: CONFIG,
      label: 'Work laptop'
    }
    const SALT: Hex = `0x${'ab'.repeat(32)}`
    const SYNCED_KIND_LINE = t(`${CEREMONY}.syncedKind`, {
      provider: t(`${CEREMONY}.providers.google`)
    })

    const reopenWith = async (enrollment: Enrollment) => {
      ;({ records, faults } = await recordsWith(pathWith(emptySlot('passkey'), CREDENTIAL), [
        enrollment
      ]))
      await open()
    }

    it('stores the salt the test drew and the time it passed', async () => {
      const asked = await testAndReturn(passed({ proof: '0x0102' }))
      if (asked?.call !== 'testAccess') {
        throw new Error('no test request stored')
      }
      const [enrollment] = await storedEnrollments(records)
      expect(asked.request.salt).toBe(deps.salts[deps.salts.length - 1])
      expect(enrollment).toMatchObject({
        test: 'passed',
        facts: SYNCED_ON_GOOGLE,
        credentialId: 'credential-a',
        lastTest: { salt: asked.request.salt, at: NOW }
      })
    })

    it('takes the backup kind from the facts a passed test read again', async () => {
      await createAndReturn(createdWith(BOUND_TO_THIS_MAC))
      await view!.press('passkey-run-test')
      await returnFrom(
        deps.requestIds[deps.requestIds.length - 1],
        'testAccess',
        passed({ proof: '0x0102', facts: assertedOn('platform', true) })
      )

      const [enrollment] = await storedEnrollments(records)
      expect(enrollment).toMatchObject({
        test: 'passed',
        backup: 'synced',
        facts: { ...BOUND_TO_THIS_MAC, kind: 'synced', backedUp: true }
      })
      await open()
      expect(view!.byTestId('passkey-loss-line')?.textContent).toBe(t(`${CEREMONY}.syncedLoss`))
    })

    it('renders the kind line and the loss line from the record alone, with no signed note', async () => {
      await reopenWith({
        credential: CREDENTIAL,
        test: 'passed',
        backup: 'synced',
        facts: SYNCED_ON_GOOGLE,
        credentialId: 'credential-a',
        lastTest: { salt: SALT, at: NOW }
      })
      expect(view!.byTestId('passkey-chip')?.textContent).toBe(chip('tested'))
      expect(view!.byTestId('passkey-kind-line')?.textContent).toBe(SYNCED_KIND_LINE)
      expect(view!.byTestId('passkey-loss-line')?.textContent).toBe(t(`${CEREMONY}.syncedLoss`))
      expect(view!.byTestId('passkey-signed-note')).toBeNull()
      expect(deps.requestIds).toEqual([])
      expect(view!.navigate).not.toHaveBeenCalled()
    })

    it('names a phone passkey from the record alone', async () => {
      await reopenWith({
        credential: CREDENTIAL,
        test: 'not-tested',
        backup: 'device-bound',
        facts: { ...BOUND_TO_THIS_MAC, place: 'phone', attachment: 'cross-platform' },
        credentialId: 'credential-a'
      })
      expect(view!.byTestId('passkey-kind-name')?.textContent).toBe(
        t('socialRecovery.methodNames.passkeyOnYourPhone')
      )
      expect(view!.byTestId('passkey-loss-line')?.textContent).toBe(
        t(`${CEREMONY}.deviceBoundLoss`)
      )
      expect(view!.byTestId('passkey-signed-note')).toBeNull()
    })

    it('renders a record with no facts, credential id or last test as before', async () => {
      await reopenWith({ credential: CREDENTIAL, test: 'passed', backup: 'synced' })
      expect(view!.byTestId('passkey-chip')?.textContent).toBe(chip('tested'))
      expect(view!.byTestId('passkey-kind-name')?.textContent).toBe(
        t('socialRecovery.methodNames.passkeyOnThisDevice')
      )
      expect(view!.byTestId('passkey-kind-line')).toBeNull()
      expect(view!.byTestId('passkey-loss-line')?.textContent).toBe(t(`${CEREMONY}.syncedLoss`))
      expect(view!.byTestId('passkey-signed-note')).toBeNull()
      expect(view!.byTestId('passkey-test-line')?.textContent).toBe(t(`${PASSKEY}.testPassed`))
    })

    it('runs the test for the credential id the record holds', async () => {
      await reopenWith({
        credential: CREDENTIAL,
        test: 'not-tested',
        backup: 'synced',
        facts: SYNCED_ON_GOOGLE,
        credentialId: 'credential-a'
      })
      await view!.press('passkey-run-test')
      const asked = await storedRequest(deps.requestIds[deps.requestIds.length - 1])
      expect(asked).toMatchObject({
        call: 'testAccess',
        params: { credentialId: 'credential-a' }
      })
    })

    each([
      ['a failed test', failed('browser-error', 'NotAllowedError'), 'failed'],
      ['an unavailable test', unavailable('service-unanswered'), 'unavailable']
    ] as const)(
      'keeps the facts, the credential id and the last passed test after %s',
      async ([, outcome, verdict]) => {
        const first = await testAndReturn(passed({ proof: '0x0102' }))
        if (first?.call !== 'testAccess') {
          throw new Error('no test request stored')
        }
        await view!.press('passkey-run-test-again')
        await returnFrom(deps.requestIds[deps.requestIds.length - 1], 'testAccess', outcome)

        const [enrollment] = await storedEnrollments(records)
        expect(enrollment).toMatchObject({
          test: verdict,
          facts: SYNCED_ON_GOOGLE,
          credentialId: 'credential-a',
          lastTest: { salt: first.request.salt, at: NOW }
        })
        expect(view!.byTestId('passkey-kind-line')?.textContent).toBe(SYNCED_KIND_LINE)
        expect(view!.byTestId('passkey-signed-note')).toBeNull()
      }
    )
  })

  describe('a passed test, which reads the backup flags only', () => {
    const ON_PHONE_WITH_GOOGLE: PasskeyFacts = {
      ...SYNCED_ON_GOOGLE,
      place: 'phone',
      attachment: 'cross-platform',
      transports: ['hybrid']
    }
    const IN_ICLOUD_ON_THIS_MAC: PasskeyFacts = {
      ...SYNCED_ON_GOOGLE,
      aaguid: 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd'
    }
    const synced = (provider: string) =>
      t(`${CEREMONY}.syncedKind`, { provider: t(`${CEREMONY}.providers.${provider}`) })

    each([
      [
        'a phone passkey synced by Google',
        ON_PHONE_WITH_GOOGLE,
        assertedOn('cross-platform', true),
        'passkeyOnYourPhone',
        synced('google')
      ],
      [
        'an iCloud passkey on this Mac',
        IN_ICLOUD_ON_THIS_MAC,
        assertedOn('platform', true),
        'passkeyOnThisDevice',
        synced('apple')
      ]
    ] as const)(
      'keeps the kind name and the kind line of %s',
      async ([, created, asserted, nameKey, kindLine]) => {
        await createAndReturn(createdWith(created))
        expect(view!.byTestId('passkey-kind-name')?.textContent).toBe(
          t(`socialRecovery.methodNames.${nameKey}`)
        )
        expect(view!.byTestId('passkey-kind-line')?.textContent).toBe(kindLine)

        await view!.press('passkey-run-test')
        await returnFrom(
          deps.requestIds[deps.requestIds.length - 1],
          'testAccess',
          passed({ proof: '0x0102', facts: asserted })
        )
        expect(view!.byTestId('passkey-chip')?.textContent).toBe(chip('tested'))
        expect(view!.byTestId('passkey-kind-name')?.textContent).toBe(
          t(`socialRecovery.methodNames.${nameKey}`)
        )
        expect(view!.byTestId('passkey-kind-line')?.textContent).toBe(kindLine)

        const [enrollment] = await storedEnrollments(records)
        expect(enrollment).toMatchObject({ test: 'passed', backup: 'synced', facts: created })

        await open()
        expect(view!.byTestId('passkey-kind-name')?.textContent).toBe(
          t(`socialRecovery.methodNames.${nameKey}`)
        )
        expect(view!.byTestId('passkey-kind-line')?.textContent).toBe(kindLine)
      }
    )

    it('keeps the device a device-bound phone passkey lives on', async () => {
      const onPhone: PasskeyFacts = {
        ...BOUND_TO_THIS_MAC,
        place: 'phone',
        attachment: 'cross-platform',
        transports: ['hybrid']
      }
      await createAndReturn(createdWith(onPhone))
      await view!.press('passkey-run-test')
      await returnFrom(
        deps.requestIds[deps.requestIds.length - 1],
        'testAccess',
        passed({ proof: '0x0102', facts: assertedOn('cross-platform', false) })
      )

      expect(view!.byTestId('passkey-kind-line')?.textContent).toBe(
        t(`${CEREMONY}.deviceBoundKind`, { device: t(`${CEREMONY}.devices.thisPhone`) })
      )
      const [enrollment] = await storedEnrollments(records)
      expect(enrollment).toMatchObject({ backup: 'device-bound', facts: onPhone })
    })

    it('shows the signed note in the mount that applied the test, and not after a reopen', async () => {
      const asked = await testAndReturn(
        passed({ proof: '0x0102', facts: assertedOn('platform', true) })
      )
      if (asked?.call !== 'testAccess') {
        throw new Error('no test request stored')
      }
      expect(view!.byTestId('passkey-signed-note')?.textContent).toBe(
        t(`${PASSKEY}.signedNote`, { hash: renderHash(asked.request.salt as Hex) })
      )

      await open()
      expect(view!.byTestId('passkey-chip')?.textContent).toBe(chip('tested'))
      expect(view!.byTestId('passkey-test-line')?.textContent).toBe(t(`${PASSKEY}.testPassed`))
      expect(view!.byTestId('passkey-signed-note')).toBeNull()
      const [enrollment] = await storedEnrollments(records)
      expect(enrollment.lastTest).toEqual({ salt: asked.request.salt, at: NOW })
    })

    it('shows no signed note for a test stored a day before the row opens', async () => {
      ;({ records, faults } = await recordsWith(
        pathWith(emptySlot('passkey'), {
          method: BOOK.methods.passkey,
          config: CONFIG,
          label: 'Work laptop'
        }),
        [
          {
            credential: { method: BOOK.methods.passkey, config: CONFIG, label: 'Work laptop' },
            test: 'passed',
            backup: 'synced',
            facts: SYNCED_ON_GOOGLE,
            credentialId: 'credential-a',
            lastTest: { salt: `0x${'12'.repeat(32)}`, at: NOW }
          }
        ]
      ))
      deps = depsOf({ now: () => NOW + 86_400_000 })
      await open()

      expect(view!.byTestId('passkey-chip')?.textContent).toBe(chip('tested'))
      expect(view!.byTestId('passkey-test-line')?.textContent).toBe(t(`${PASSKEY}.testPassed`))
      expect(view!.byTestId('passkey-signed-note')).toBeNull()
    })

    it('shows no signed note for a passed test whose record write fails', async () => {
      const storedSalt: Hex = `0x${'12'.repeat(32)}`
      ;({ records, faults } = await recordsWith(
        pathWith(emptySlot('passkey'), {
          method: BOOK.methods.passkey,
          config: CONFIG,
          label: 'Work laptop'
        }),
        [
          {
            credential: { method: BOOK.methods.passkey, config: CONFIG, label: 'Work laptop' },
            test: 'passed',
            backup: 'synced',
            facts: SYNCED_ON_GOOGLE,
            credentialId: 'credential-a',
            lastTest: { salt: storedSalt, at: NOW }
          }
        ]
      ))
      await open()

      await view!.press('passkey-run-test-again')
      faults.refuse = [':enrollments:']
      await returnFrom(
        deps.requestIds[deps.requestIds.length - 1],
        'testAccess',
        passed({ proof: '0x0102', facts: assertedOn('platform', true) })
      )

      expect(view!.byTestId('enroll-write-failed')?.textContent).toBe(
        t('socialRecovery.records.writeFailed')
      )
      expect(view!.byTestId('passkey-signed-note')).toBeNull()
      const [enrollment] = await storedEnrollments(records)
      expect(enrollment.lastTest).toEqual({ salt: storedSalt, at: NOW })
    })
  })

  describe('a report that is not for the slot as it stands', () => {
    const OTHER: Address = '0x3333333333333333333333333333333333333333'
    const FOREIGN_ID = 'request-foreign'
    const PLAIN_PATH = `/${WEB_ROUTES.socialRecoverySetupEnroll}?kind=passkey&clause=0&member=1`

    it('leaves a passkey that replaced the tested one not tested', async () => {
      await createAndReturn(createdWith(SYNCED_ON_GOOGLE))
      await view!.press('passkey-run-test')
      const id = deps.requestIds[deps.requestIds.length - 1]

      // Another tab places a new passkey in the slot while the test runs.
      const replacing: Credential = {
        method: BOOK.methods.passkey,
        config: '0xbeef',
        label: 'Other laptop'
      }
      const theirs: Enrollment = { credential: replacing, test: 'not-tested', backup: 'synced' }
      const setup = records.setup(CHAIN_ID, ACCOUNT)
      await setup.writeDraftAndPath(draftOf(pathWith(emptySlot('passkey'), replacing)))
      await setup.enrollments.write([theirs])

      await returnFrom(id, 'testAccess', passed({ proof: '0x0102', facts: BOUND_TO_THIS_MAC }))
      expect(await storedEnrollments(records)).toEqual([theirs])
      expect(view!.byTestId('passkey-label')?.textContent).toBe('Other laptop')
      expect(view!.byTestId('passkey-chip')?.textContent).toBe(chip('notTested'))
      expect(view!.byTestId('passkey-signed-note')).toBeNull()
      expect(view!.byTestId('enroll-write-failed')).toBeNull()
    })

    each([
      ['another account', { account: OTHER }],
      ['another chain', { chainId: 1 }],
      ['another passkey method', { methodAddress: OTHER }]
    ] as const)(
      'leaves a creation stored for %s where it is and the slot empty',
      async ([, foreign]) => {
        const theirs: CeremonyRequestRecord = {
          call: 'enroll',
          method: 'passkey',
          account: ACCOUNT,
          chainId: CHAIN_ID,
          methodAddress: BOOK.methods.passkey,
          params: { userName: 'Their laptop', handOff: false },
          ...foreign
        }
        await records.ceremonyRequest(FOREIGN_ID).write(theirs)
        await returnFrom(FOREIGN_ID, 'enroll', createdWith(SYNCED_ON_GOOGLE))

        expect(await storedClauses(records)).toEqual(TWO_SLOTS)
        expect(await storedEnrollments(records)).toEqual([])
        expect(await storedRequest(FOREIGN_ID)).toEqual(theirs)
        expect(deps.channel.has(FOREIGN_ID)).toBe(true)
        expect(deps.channel.takes).not.toHaveBeenCalled()
        expect(view!.byTestId('passkey-none-yet')).not.toBeNull()
        expect(view!.byTestId('passkey-undelivered')).toBeNull()
        expect(view!.inputOf('passkey-name')?.value).toBe(DEFAULT_NAME)
        expect(view!.navigate).toHaveBeenCalledWith(PLAIN_PATH, { replace: true })
      }
    )

    each([
      ['another account', (asked: TestRecord): TestRecord => ({ ...asked, account: OTHER })],
      [
        'another passkey method',
        (asked: TestRecord): TestRecord => ({
          ...asked,
          request: { ...asked.request, method: OTHER }
        })
      ]
    ] as const)(
      'leaves a test stored for %s where it is and the verdict as it was',
      async ([, foreignOf]) => {
        await createAndReturn(createdWith(SYNCED_ON_GOOGLE))
        await view!.press('passkey-run-test')
        const id = deps.requestIds[deps.requestIds.length - 1]
        const asked = await storedRequest(id)
        if (asked?.call !== 'testAccess') {
          throw new Error('no test request stored')
        }
        const theirs = foreignOf(asked)
        await records.ceremonyRequest(id).write(theirs)

        await returnFrom(id, 'testAccess', passed({ proof: '0x0102' }))
        const [enrollment] = await storedEnrollments(records)
        expect(enrollment.test).toBe('not-tested')
        expect(enrollment.lastTest).toBeUndefined()
        expect(view!.byTestId('passkey-chip')?.textContent).toBe(chip('notTested'))
        expect(await storedRequest(id)).toEqual(theirs)
        expect(deps.channel.has(id)).toBe(true)
      }
    )
  })

  describe('Save and continue', () => {
    it('reads that saving works without the test, under Save, once the passkey exists', async () => {
      await open()
      expect(view!.byTestId('enroll-save-without-test')).toBeNull()
      await view!.press('passkey-create-here')
      await returnFrom(deps.requestIds[0], 'enroll', createdWith(SYNCED_ON_GOOGLE))
      const note = view!.byTestId('enroll-save-without-test')
      const save = view!.byTestId('enroll-save')
      expect(note?.textContent).toBe(t('socialRecovery.enroll.saveWithoutTest'))
      if (!note || !save) {
        throw new Error('no save line drawn')
      }
      // eslint-disable-next-line no-bitwise
      expect(save.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING
      )
    })
  })
})
