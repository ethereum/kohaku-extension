/**
 * The behaviour the passport row and the Aadhaar row share: the ceremony tab
 * runs the document's own flow and the access test, and returns here with its
 * report, which fills the slot and records the verdict. Each kind's suite runs
 * these checks with its own slug, test ids and strings.
 */
import type { Clause, Credential, Hex, Params } from '@kohaku-eth/social-recovery'
import type { CeremonyCall, CeremonyOutcome } from '@web/modules/social-recovery/shared/ceremony'
import type {
  CeremonyRequestRecord,
  Enrollment,
  WalletRecords
} from '@web/modules/social-recovery/shared/records'
import type { MethodChip } from '@web/modules/social-recovery/shared/display'

import type { EnrollClient, EnrollSearch } from '@web/modules/social-recovery/setup/enroll/types'
import type {
  FakeDeps,
  Mounted,
  StorageFaults
} from '@web/modules/social-recovery/setup/enroll/__tests__/harness'
import {
  ACCOUNT,
  BOOK,
  CHAIN_ID,
  DESCRIPTOR,
  depsOf,
  draftOf,
  each,
  emptySlot,
  holdReportReads,
  mountView,
  NOW,
  outside,
  pathWith,
  readyClient,
  recordsWith,
  settle,
  storedClauses,
  storedEnrollments,
  t
} from '@web/modules/social-recovery/setup/enroll/__tests__/harness'
import type { IdentityRowCase } from '@web/modules/social-recovery/setup/enroll/__fixtures__/types'

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const {
  WEB_ROUTES
}: typeof import('@common/modules/router/constants/common') = require('@common/modules/router/constants/common')
const {
  dismissed,
  failed,
  isInternalPath,
  notSupported,
  parseCeremonySearch,
  passed,
  unavailable
}: typeof import('@web/modules/social-recovery/shared/ceremony') = require('@web/modules/social-recovery/shared/ceremony')
const {
  renderChip
}: typeof import('@web/modules/social-recovery/shared/display') = require('@web/modules/social-recovery/shared/display')
const {
  parseEnrollSearch
}: typeof import('@web/modules/social-recovery/setup/enroll/search') = require('@web/modules/social-recovery/setup/enroll/search')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const CEREMONY = 'socialRecovery.ceremony'
const CONFIG: Hex = '0xc0ffee'
const OTHER_CONFIG: Hex = '0xbeef'

const chip = (name: MethodChip) => renderChip('method', name, t)

/** Params the client gives, distinct per method and call, with a bigint as the Aadhaar seed is. */
const paramsOf = (slug: string, call: CeremonyCall): Params => ({ slug, call, seed: 7n })

export const describeIdentityRow = (kind: IdentityRowCase) => {
  const { slug, row } = kind
  const id = (suffix: string) => `${row}-${suffix}`
  // A refusal reads the kind's own note; every other note is the shared one.
  const noteOf = (noteKey: string) =>
    noteKey === 'refusedNote' ? kind.refusedNote : `${CEREMONY}.${noteKey}`

  /** Two empty slots of the kind; the screen fills the second. */
  const TWO_SLOTS: Clause[] = pathWith(emptySlot(slug), emptySlot(slug))
  const SEARCH: EnrollSearch = { kind: slug, at: { clause: 0, member: 1 } }
  const credentialOf = (config: Hex): Credential => ({
    method: BOOK.methods[slug],
    config,
    label: ''
  })

  describe(`the ${row} row`, () => {
    let view: Mounted | undefined
    let records: WalletRecords
    let faults: StorageFaults
    let deps: FakeDeps
    let client: EnrollClient

    const open = async (search: EnrollSearch = SEARCH) => {
      view?.unmount()
      view = await mountView({ records, search, client, deps })
      await settle()
      return view
    }

    beforeEach(async () => {
      ;({ records, faults } = await recordsWith(TWO_SLOTS))
      deps = depsOf()
      client = readyClient({ methodParamsFor: paramsOf }).state
    })

    afterEach(() => {
      view?.unmount()
      view = undefined
    })

    const lastNavigation = (): string => {
      const calls = view?.navigate.mock.calls ?? []
      return calls[calls.length - 1]?.[0]
    }

    const lastRequestId = () => deps.requestIds[deps.requestIds.length - 1]

    const storedRequest = async (request: string): Promise<CeremonyRequestRecord | undefined> => {
      const read = await records.ceremonyRequest(request).read()
      return read.status === 'present' ? read.value : undefined
    }

    /** The tab writes its report under the kind's slug and returns to the path the row gave it. */
    const returnFrom = async (
      request: string,
      call: 'enroll' | 'testAccess',
      outcome: CeremonyOutcome<unknown>,
      method: string = slug
    ) => {
      await deps.channel.report(request, call, outcome, method)
      await open({ ...SEARCH, ceremony: request })
    }

    const createAndReturn = async (outcome: CeremonyOutcome<unknown>) => {
      await open()
      await view!.press(id('start'))
      const request = lastRequestId()
      await returnFrom(request, 'enroll', outcome)
      return request
    }

    const testAndReturn = async (outcome: CeremonyOutcome<unknown>) => {
      await createAndReturn(passed({ config: CONFIG }))
      await view!.press(id('run-test'))
      const request = lastRequestId()
      const asked = await storedRequest(request)
      await returnFrom(request, 'testAccess', outcome)
      return asked
    }

    /** The ceremony the last navigation opened, parsed as the tab reads it. */
    const openedCeremony = () => {
      const target = lastNavigation()
      expect(target.startsWith(`/${WEB_ROUTES.socialRecoveryCeremony}?`)).toBe(true)
      const parsed = parseCeremonySearch(target.slice(target.indexOf('?')))
      if (!parsed.ok) {
        throw new Error('the row opened no ceremony')
      }
      return parsed.params
    }

    describe('before creation', () => {
      it('renders the row for an empty slot of the kind, with its disclosures and no test', async () => {
        await open()
        expect(view!.byTestId(`enroll-${row}`)).not.toBeNull()
        expect(view!.text()).toContain(t(kind.title))
        expect(view!.byTestId(id('lead'))?.textContent).toBe(t(kind.lead))
        expect(view!.byTestId(id('device-line'))?.textContent).toBe(t(kind.deviceLine))
        expect(view!.byTestId(id('none-yet'))?.textContent).toBe(t(kind.noneYet))
        expect(view!.text()).toContain(t(kind.actionLine))
        expect(view!.byTestId(id('start'))?.textContent).toBe(t(kind.action))
        expect(view!.allText(id('disclosure'))).toEqual(kind.disclosures.map((key) => t(key)))
        expect(view!.byTestId(id('test'))).toBeNull()
        expect(view!.byTestId(id('enrolled'))).toBeNull()
        expect(view!.isDisabled('enroll-save')).toBe(true)
      })

      it('stores the creation request with the params the client gives and opens the tab under the slug', async () => {
        await open()
        await view!.press(id('start'))

        const [request] = deps.requestIds
        expect(await storedRequest(request)).toEqual({
          call: 'enroll',
          method: slug,
          account: ACCOUNT,
          chainId: CHAIN_ID,
          methodAddress: BOOK.methods[slug],
          params: paramsOf(slug, 'enroll'),
          replaces: null
        })

        const params = openedCeremony()
        expect(params).toMatchObject({ call: 'enroll', method: slug, id: request })
        expect(params.handOff).toBeFalsy()
        const returnTo = params.returnTo ?? ''
        expect(isInternalPath(returnTo)).toBe(true)
        expect(parseEnrollSearch(returnTo.slice(returnTo.indexOf('?')))).toEqual({
          ...SEARCH,
          ceremony: request
        })
      })

      it('renders the write failure and opens no tab where the request cannot be stored', async () => {
        faults.refuse = [':ceremonyRequest:']
        await open()
        await view!.press(id('start'))
        expect(view!.byTestId('enroll-write-failed')?.textContent).toBe(
          t('socialRecovery.records.writeFailed')
        )
        expect(view!.navigate).not.toHaveBeenCalled()
      })

      it('reads that the network cannot run the method, with no action, where the client gives no params', async () => {
        client = readyClient({ methodParamsFor: () => undefined }).state
        await open()
        expect(view!.byTestId(id('not-on-network'))?.textContent).toBe(
          t(`${CEREMONY}.notOnThisNetworkLine`)
        )
        expect(view!.byTestId(id('start'))).toBeNull()
        expect(view!.byTestId(id('try-again'))).toBeNull()
        expect(view!.byTestId(id('none-yet'))?.textContent).toBe(t(kind.noneYet))
        expect(view!.allText(id('disclosure'))).toEqual(kind.disclosures.map((key) => t(key)))
        expect(view!.isDisabled('enroll-save')).toBe(true)
        expect(deps.requestIds).toEqual([])
        expect(view!.navigate).not.toHaveBeenCalled()
      })

      it('reads that the network cannot run the method, with no action, where the deployment omits it', async () => {
        const shipped = readyClient().state
        if (shipped.status !== 'ready') {
          throw new Error('the client is not ready')
        }
        client = readyClient({
          methodFor: (served) => (served === slug ? undefined : shipped.client.methodFor(served))
        }).state
        await open()
        expect(view!.byTestId(id('not-on-network'))?.textContent).toBe(
          t(`${CEREMONY}.notOnThisNetworkLine`)
        )
        expect(view!.byTestId(id('start'))).toBeNull()
        expect(deps.requestIds).toEqual([])
        expect(view!.navigate).not.toHaveBeenCalled()
      })
    })

    describe('a passed creation', () => {
      it('fills the slot with the config, not tested, and renders the enrolled summary', async () => {
        const request = await createAndReturn(passed({ config: CONFIG }))

        expect(await storedClauses(records)).toEqual(
          pathWith(emptySlot(slug), credentialOf(CONFIG))
        )
        expect(await storedEnrollments(records)).toEqual([
          { credential: credentialOf(CONFIG), test: 'not-tested' }
        ])
        expect(view!.byTestId(id('enrolled-line'))?.textContent).toBe(t(kind.enrolledLine))
        expect(view!.byTestId(id('chip'))?.textContent).toBe(chip('notTested'))
        expect(view!.allText(id('disclosure'))).toEqual(kind.disclosures.map((key) => t(key)))
        expect(view!.byTestId(id('none-yet'))).toBeNull()
        expect(view!.isDisabled('enroll-save')).toBe(false)
        expect(view!.byTestId('enroll-save-without-test')?.textContent).toBe(
          t('socialRecovery.enroll.saveWithoutTest')
        )

        expect(await storedRequest(request)).toBeUndefined()
        expect(deps.channel.has(request)).toBe(false)
        expect(view!.navigate).toHaveBeenCalledWith(
          `/${WEB_ROUTES.socialRecoverySetupEnroll}?kind=${slug}&clause=0&member=1`,
          { replace: true }
        )
      })

      it('applies a report that lands after the return', async () => {
        await open()
        await view!.press(id('start'))
        const [request] = deps.requestIds
        await open({ ...SEARCH, ceremony: request })
        expect(view!.byTestId(id('undelivered'))?.textContent).toBe(
          t(`${CEREMONY}.undeliveredNote`)
        )

        await outside(() =>
          deps.channel.report(request, 'enroll', passed({ config: CONFIG }), slug)
        )
        await settle()
        expect(view!.byTestId(id('undelivered'))).toBeNull()
        expect(view!.byTestId(id('chip'))?.textContent).toBe(chip('notTested'))
        expect(await storedEnrollments(records)).toHaveLength(1)
      })

      it('takes no report written under another method', async () => {
        await open()
        await view!.press(id('start'))
        const [request] = deps.requestIds
        await returnFrom(request, 'enroll', passed({ config: CONFIG }), 'passkey')
        expect(view!.byTestId(id('undelivered'))?.textContent).toBe(
          t(`${CEREMONY}.undeliveredNote`)
        )
        expect(await storedClauses(records)).toEqual(TWO_SLOTS)
      })

      it('places nothing for a passed report that names no config', async () => {
        await createAndReturn(passed({ config: '0x' }))
        expect(view!.byTestId(id('enroll-note'))?.textContent).toBe(t(`${CEREMONY}.failedNote`))
        expect(view!.byTestId(id('try-again'))).not.toBeNull()
        expect(await storedClauses(records)).toEqual(TWO_SLOTS)
        expect(await storedEnrollments(records)).toEqual([])
      })

      it('refuses a document the path already holds, and leaves the slot empty', async () => {
        const held = credentialOf(CONFIG)
        const path = pathWith(held, emptySlot(slug))
        ;({ records, faults } = await recordsWith(path, [{ credential: held, test: 'passed' }]))
        await createAndReturn(passed({ config: CONFIG }))
        expect(view!.byTestId(id('duplicate'))?.textContent).toBe(
          t('socialRecovery.editor.duplicate')
        )
        expect(await storedClauses(records)).toEqual(path)
        expect(await storedEnrollments(records)).toEqual([{ credential: held, test: 'passed' }])
        expect(view!.isDisabled('enroll-save')).toBe(true)
      })

      it('keeps the read document after a failed write and stores it on a retry without a second ceremony', async () => {
        faults.refuse = [':enrollments:']
        await createAndReturn(passed({ config: CONFIG }))
        expect(view!.byTestId('enroll-write-failed')?.textContent).toBe(
          t('socialRecovery.records.writeFailed')
        )
        expect(view!.byTestId(id('none-yet'))).not.toBeNull()
        expect(await storedClauses(records)).toEqual(TWO_SLOTS)

        faults.refuse = []
        await view!.press(id('place-retry'))
        expect(deps.requestIds).toHaveLength(1)
        expect(view!.byTestId('enroll-write-failed')).toBeNull()
        expect(await storedClauses(records)).toEqual(
          pathWith(emptySlot(slug), credentialOf(CONFIG))
        )
        expect(view!.byTestId(id('enrolled-line'))).not.toBeNull()
      })

      it('refuses an earlier creation that returns after a later one filled the slot', async () => {
        await open()
        await view!.press(id('start'))
        const earlier = lastRequestId()
        await open()
        await view!.press(id('start'))
        const later = lastRequestId()

        await returnFrom(later, 'enroll', passed({ config: OTHER_CONFIG }))
        await returnFrom(earlier, 'enroll', passed({ config: CONFIG }))

        expect(await storedClauses(records)).toEqual(
          pathWith(emptySlot(slug), credentialOf(OTHER_CONFIG))
        )
        expect(await storedEnrollments(records)).toEqual([
          { credential: credentialOf(OTHER_CONFIG), test: 'not-tested' }
        ])
        expect(view!.byTestId('enroll-write-failed')?.textContent).toBe(
          t('socialRecovery.records.writeFailed')
        )
        expect(view!.byTestId(id('enrolled-line'))).not.toBeNull()
      })

      it('acts on no report it reads after the row left the page', async () => {
        await open()
        await view!.press(id('start'))
        const request = lastRequestId()
        await deps.channel.report(request, 'enroll', passed({ config: CONFIG }), slug)
        const release = holdReportReads(deps)
        const left = await open({ ...SEARCH, ceremony: request })
        left.unmount()
        view = undefined

        await outside(async () => release())
        await settle()

        expect(left.navigate).not.toHaveBeenCalled()
        expect(await storedClauses(records)).toEqual(TWO_SLOTS)
        expect(await storedEnrollments(records)).toEqual([])
        expect(await storedRequest(request)).toBeDefined()
      })

      it('keeps a report read after the row left the page, and the next mount applies it once', async () => {
        await open()
        await view!.press(id('start'))
        const request = lastRequestId()
        await deps.channel.report(request, 'enroll', passed({ config: CONFIG }), slug)
        const release = holdReportReads(deps)
        const left = await open({ ...SEARCH, ceremony: request })
        left.unmount()
        view = undefined
        await outside(async () => release())
        await settle()
        expect(deps.channel.has(request)).toBe(true)

        await open({ ...SEARCH, ceremony: request })
        expect(await storedEnrollments(records)).toHaveLength(1)
        expect(view!.byTestId(id('undelivered'))).toBeNull()
        expect(await storedRequest(request)).toBeUndefined()
        expect(deps.channel.has(request)).toBe(false)
        expect(deps.channel.takes).toHaveBeenCalledTimes(1)

        await open({ ...SEARCH, ceremony: request })
        expect(await storedEnrollments(records)).toHaveLength(1)
        expect(view!.byTestId(id('undelivered'))).toBeNull()
      })

      it('leaves the slot empty where the draft cannot be stored', async () => {
        faults.refuse = [':setupDraft:']
        await createAndReturn(passed({ config: CONFIG }))
        expect(view!.byTestId('enroll-write-failed')).not.toBeNull()
        expect(view!.isDisabled('enroll-save')).toBe(true)
        expect(await storedClauses(records)).toEqual(TWO_SLOTS)
      })
    })

    describe('a creation that did not pass', () => {
      each([
        ['a stopped ceremony', dismissed('cancelled'), 'stoppedNote'],
        ['a refused ceremony', dismissed('refused'), 'refusedNote'],
        ['a failure', failed('thrown'), 'failedNote'],
        ['a service that did not answer', unavailable('service-unanswered'), 'unavailableNote'],
        ['a phone that never connected', unavailable('unreachable'), 'unreachableNote'],
        ['a phone that stopped answering', unavailable('phone-unanswered'), 'phoneUnansweredNote']
      ] as const)('offers to try again after %s, with its note', async ([, outcome, noteKey]) => {
        const request = await createAndReturn(outcome)
        expect(view!.byTestId(id('enroll-note'))?.textContent).toBe(t(noteOf(noteKey)))
        expect(view!.byTestId(id('start'))).toBeNull()
        expect(view!.byTestId(id('try-again'))?.textContent).toBe(t(`${CEREMONY}.tryAgainAction`))
        expect(view!.byTestId(id('enrolled'))).toBeNull()
        expect(view!.isDisabled('enroll-save')).toBe(true)
        expect(await storedClauses(records)).toEqual(TWO_SLOTS)
        expect(await storedRequest(request)).toBeUndefined()

        await view!.press(id('try-again'))
        expect(deps.requestIds).toHaveLength(2)
        expect(await storedRequest(lastRequestId())).toMatchObject({
          call: 'enroll',
          method: slug,
          params: paramsOf(slug, 'enroll')
        })
        expect(openedCeremony()).toMatchObject({ call: 'enroll', method: slug })
      })

      it('offers no retry for a document the method cannot serve', async () => {
        await createAndReturn(notSupported('no-implementation'))
        expect(view!.byTestId(id('enroll-note'))?.textContent).toBe(
          t(`${CEREMONY}.notSupportedNote`)
        )
        expect(view!.byTestId(id('try-again'))).toBeNull()
        expect(view!.byTestId(id('start'))).toBeNull()
        expect(await storedClauses(records)).toEqual(TWO_SLOTS)
      })
    })

    describe('the access test', () => {
      it('offers the test and the skip once the document is enrolled', async () => {
        await createAndReturn(passed({ config: CONFIG }))
        expect(view!.text()).toContain(t(kind.testLead))
        expect(view!.byTestId(id('run-test'))?.textContent).toBe(
          t('socialRecovery.actions.runTheTest')
        )
        expect(view!.byTestId(id('skip-test'))?.textContent).toBe(
          t('socialRecovery.actions.skipTheTest')
        )
        expect(view!.byTestId(id('test-line'))).toBeNull()
      })

      it('stores a test request for the enrolled config with the params the client gives', async () => {
        await createAndReturn(passed({ config: CONFIG }))
        await view!.press(id('run-test'))
        const request = lastRequestId()
        const asked = await storedRequest(request)
        if (asked?.call !== 'testAccess' || !('request' in asked)) {
          throw new Error('no test request stored')
        }
        expect(asked).toMatchObject({
          method: slug,
          account: ACCOUNT,
          chainId: CHAIN_ID,
          params: paramsOf(slug, 'testAccess')
        })
        expect(asked.request).toMatchObject({
          purpose: 'approval',
          chainId: String(CHAIN_ID),
          manager: DESCRIPTOR.manager,
          account: ACCOUNT,
          method: BOOK.methods[slug],
          config: CONFIG
        })
        expect(Number(asked.request.validUntil)).toBeGreaterThan(NOW / 1000)
        expect(openedCeremony()).toMatchObject({ call: 'testAccess', method: slug, id: request })
      })

      it('reads tested after a passed test and stores the salt it was asked under', async () => {
        const asked = await testAndReturn(passed({}))
        if (asked?.call !== 'testAccess' || !('request' in asked)) {
          throw new Error('no test request stored')
        }
        expect(view!.byTestId(id('chip'))?.textContent).toBe(chip('tested'))
        expect(view!.byTestId(id('test-line'))?.textContent).toBe(t(kind.testPassed))
        expect(view!.byTestId(id('run-test-again'))?.textContent).toBe(
          t('socialRecovery.actions.runTheTestAgain')
        )
        expect(view!.isDisabled('enroll-save')).toBe(false)
        expect(await storedEnrollments(records)).toEqual([
          {
            credential: credentialOf(CONFIG),
            test: 'passed',
            lastTest: { salt: asked.request.salt, at: NOW }
          }
        ])
      })

      each([
        [
          'a document that did not match',
          failed('check-rejected'),
          'testFailed',
          'testFailedNoMatch',
          'failed',
          'check-rejected'
        ],
        [
          'a check that failed',
          failed('thrown', 'boom'),
          'testFailed',
          'testFailedLine',
          'failed',
          'thrown: boom'
        ],
        [
          'a check that could not run',
          unavailable('service-unanswered'),
          'testUnavailable',
          'testUnavailableLine',
          'unavailable',
          'service-unanswered'
        ]
      ] as const)(
        'reads %s with its line and a run again, and keeps Save',
        async ([, outcome, chipName, lineKey, verdict, cause]) => {
          await testAndReturn(outcome)
          expect(view!.byTestId(id('chip'))?.textContent).toBe(chip(chipName))
          expect(view!.byTestId(id('test-line'))?.textContent).toBe(t(`${CEREMONY}.${lineKey}`))
          expect(view!.byTestId(id('run-test-again'))).not.toBeNull()
          expect(view!.isDisabled('enroll-save')).toBe(false)
          expect(view!.byTestId('enroll-save')?.textContent).toBe(
            t(
              verdict === 'failed'
                ? 'socialRecovery.actions.saveAnyway'
                : 'socialRecovery.actions.saveAndContinue'
            )
          )
          expect(await storedEnrollments(records)).toEqual([
            { credential: credentialOf(CONFIG), test: verdict, cause }
          ])

          await view!.press(id('run-test-again'))
          expect(await storedRequest(lastRequestId())).toMatchObject({
            call: 'testAccess',
            method: slug
          })
        }
      )

      it('names a result the method refused under the failed line, with a run again', async () => {
        await testAndReturn(failed('material-rejected', 'another identifier'))
        expect(view!.byTestId(id('chip'))?.textContent).toBe(chip('testFailed'))
        expect(view!.byTestId(id('test-line'))?.textContent).toBe(t(`${CEREMONY}.testFailedLine`))
        expect(view!.byTestId(id('test-cause'))?.textContent).toBe(t(`${CEREMONY}.rejectedCause`))
        expect(view!.byTestId(id('run-test-again'))?.textContent).toBe(
          t('socialRecovery.actions.runTheTestAgain')
        )
        expect(await storedEnrollments(records)).toEqual([
          {
            credential: credentialOf(CONFIG),
            test: 'failed',
            cause: 'material-rejected: another identifier'
          }
        ])

        // The cause line comes from the stored verdict, so a reopen keeps it.
        await open()
        expect(view!.byTestId(id('test-cause'))?.textContent).toBe(t(`${CEREMONY}.rejectedCause`))
      })

      each([
        ['a mismatch on chain', failed('check-rejected'), 'testFailedNoMatch'],
        ['a check the chain refused to judge', failed('check-reverted'), 'testFailedReverted'],
        ['any other failure', failed('thrown'), 'testFailedLine']
      ] as const)('reads %s with its line and no cause line', async ([, outcome, lineKey]) => {
        await testAndReturn(outcome)
        expect(view!.byTestId(id('test-line'))?.textContent).toBe(t(`${CEREMONY}.${lineKey}`))
        expect(view!.byTestId(id('test-cause'))).toBeNull()
      })

      it('reads the refused note of the kind at the creation and at the test', async () => {
        await createAndReturn(dismissed('refused'))
        expect(view!.byTestId(id('enroll-note'))?.textContent).toBe(t(kind.refusedNote))
        await view!.press(id('try-again'))
        await returnFrom(lastRequestId(), 'enroll', passed({ config: CONFIG }))
        await view!.press(id('run-test'))
        await returnFrom(lastRequestId(), 'testAccess', dismissed('refused'))
        expect(view!.allText(id('test-note'))).toEqual([t(kind.refusedNote)])
      })

      it('reads not supported with its line and offers no retry', async () => {
        await testAndReturn(notSupported('no-implementation'))
        expect(view!.byTestId(id('chip'))?.textContent).toBe(chip('notSupported'))
        expect(view!.byTestId(id('test-line'))?.textContent).toBe(t(`${CEREMONY}.notSupportedLine`))
        expect(view!.byTestId(id('run-test-again'))).toBeNull()
        expect(view!.byTestId(id('run-test'))).toBeNull()
        expect(view!.isDisabled('enroll-save')).toBe(false)
        expect(await storedEnrollments(records)).toEqual([
          { credential: credentialOf(CONFIG), test: 'not-supported', cause: 'no-implementation' }
        ])
      })

      each([
        ['a stopped test', dismissed('cancelled'), 'stoppedNote'],
        ['a refused test', dismissed('refused'), 'refusedNote']
      ] as const)(
        'leaves the verdict not tested after %s, with its note',
        async ([, outcome, noteKey]) => {
          await testAndReturn(outcome)
          expect(view!.byTestId(id('chip'))?.textContent).toBe(chip('notTested'))
          expect(view!.allText(id('test-note'))).toEqual([t(noteOf(noteKey))])
          expect(view!.byTestId(id('run-test'))).not.toBeNull()
          const [enrollment] = await storedEnrollments(records)
          expect(enrollment.test).toBe('not-tested')
        }
      )

      it('reads not tested after a skip, keeps the save enabled and still offers the test', async () => {
        await createAndReturn(passed({ config: CONFIG }))
        await view!.press(id('skip-test'))
        expect(view!.byTestId(id('chip'))?.textContent).toBe(chip('notTested'))
        expect(view!.byTestId(id('test-line'))?.textContent).toBe(t(`${CEREMONY}.notTestedLine`))
        expect(view!.byTestId(id('skip-test'))).toBeNull()
        expect(view!.byTestId(id('run-test'))).not.toBeNull()
        expect(view!.isDisabled('enroll-save')).toBe(false)
        await view!.press('enroll-save')
        expect(lastNavigation()).toBe(WEB_ROUTES.socialRecoverySetupEditor)
        const [enrollment] = await storedEnrollments(records)
        expect(enrollment.test).toBe('not-tested')
      })

      it('renders the write failure where the verdict cannot be stored, and keeps the document', async () => {
        await createAndReturn(passed({ config: CONFIG }))
        await view!.press(id('run-test'))
        const request = lastRequestId()
        faults.refuse = [':enrollments:']
        await returnFrom(request, 'testAccess', passed({}))
        expect(view!.byTestId('enroll-write-failed')?.textContent).toBe(
          t('socialRecovery.records.writeFailed')
        )
        const [enrollment] = await storedEnrollments(records)
        expect(enrollment.test).toBe('not-tested')
        expect(view!.isDisabled('enroll-save')).toBe(false)
      })

      it('ignores a test of a document the slot no longer holds', async () => {
        await createAndReturn(passed({ config: CONFIG }))
        await view!.press(id('run-test'))
        const testRequest = lastRequestId()
        // A new document replaced the tested one before the test's report came back.
        const replacement = credentialOf(OTHER_CONFIG)
        const replaced: Enrollment = { credential: replacement, test: 'not-tested' }
        await records.setup(CHAIN_ID, ACCOUNT).enrollments.write([replaced])
        await records
          .setup(CHAIN_ID, ACCOUNT)
          .writeDraftAndPath(draftOf(pathWith(emptySlot(slug), replacement)))
        await returnFrom(testRequest, 'testAccess', failed('check-rejected'))
        expect(view!.byTestId(id('chip'))?.textContent).toBe(chip('notTested'))
        expect(await storedEnrollments(records)).toEqual([replaced])
      })

      it('reads that the network cannot run the method and offers no test where the client gives no params', async () => {
        const held = credentialOf(CONFIG)
        ;({ records, faults } = await recordsWith(pathWith(emptySlot(slug), held), [
          { credential: held, test: 'not-tested' }
        ]))
        client = readyClient({ methodParamsFor: () => undefined }).state
        await open()
        expect(view!.byTestId(id('enrolled-line'))?.textContent).toBe(t(kind.enrolledLine))
        expect(view!.byTestId(id('test-line'))?.textContent).toBe(
          t(`${CEREMONY}.notOnThisNetworkLine`)
        )
        expect(view!.byTestId(id('run-test'))).toBeNull()
        expect(view!.byTestId(id('skip-test'))).toBeNull()
        expect(view!.byTestId(id('run-test-again'))).toBeNull()
        expect(view!.isDisabled('enroll-save')).toBe(false)
      })
    })
  })
}
