/**
 * @jest-environment jsdom
 *
 * The Aadhaar row's claim: where the client serves Anon Aadhaar the row is
 * asked, counts toward its group, and launches the ceremony tab with the
 * client's params for a claim, where the holder uploads the QR and the proof
 * runs; a passed report becomes a reply the client adds; a claim that did not
 * pass reads its note, its cause and a retry; a holder who dismissed it leaves
 * the row as it was. The row asks for a fresh QR of the same identity.
 */
import type { Configuration, Params } from '@kohaku-eth/social-recovery'
import type { CeremonyOutcome } from '@web/modules/social-recovery/shared/ceremony'

import type { ChecklistSearch } from '@web/modules/social-recovery/recovery/checklist/types'

import type {
  FakeDeps,
  FakeKit,
  Mounted,
  ServedMethods,
  TestRecords
} from '@web/modules/social-recovery/recovery/checklist/__tests__/harness'
import {
  ACCOUNT,
  CHAIN_ID,
  configurationOf,
  depsOf,
  each,
  fakeKit,
  gatheringOf,
  GUARDIANS,
  guardianCredential,
  mountChecklist,
  outside,
  aadhaarCredential,
  replyOf,
  requestOf,
  seedCache,
  seedEntry,
  seedSession,
  storedSession,
  t,
  testRecords
} from '@web/modules/social-recovery/recovery/checklist/__tests__/harness'

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const {
  ceremonyPath,
  dismissed,
  failed,
  notSupported,
  passed,
  unavailable
}: typeof import('@web/modules/social-recovery/shared/ceremony') = require('@web/modules/social-recovery/shared/ceremony')
const {
  checklistPathOf
}: typeof import('@web/modules/social-recovery/recovery/checklist') = require('@web/modules/social-recovery/recovery/checklist')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const CEREMONY = 'socialRecovery.ceremony'
const AADHAAR = 'socialRecovery.checklist.aadhaar'
const COLLECTION = 'socialRecovery.status.collection'
const SLUG = 'aadhaar'

/** The params the client names for an Aadhaar claim: a seed past the safe integers, and the issuer. */
const CLAIM_PARAMS: Params = {
  nullifierSeed: BigInt('123456789012345678901234567890'),
  issuerCertificate: '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----'
}
const SERVED: ServedMethods = { aadhaar: { createClaim: CLAIM_PARAMS } }

/** An Aadhaar identity required, then a guardian required: the identity sits at place 0. */
const PATH: Configuration = configurationOf([
  { threshold: 1, credentials: [aadhaarCredential()] },
  { threshold: 1, credentials: [guardianCredential(GUARDIANS[0])] }
])

describe('the Aadhaar row', () => {
  let view: Mounted | undefined
  let world: TestRecords
  let kit: FakeKit
  let deps: FakeDeps
  const gathering = gatheringOf(PATH, 1)

  const open = async (search: ChecklistSearch = { account: ACCOUNT }) => {
    view?.unmount()
    view = await mountChecklist({ records: world.records, client: kit.state, deps, search })
    return view
  }

  /** The tab writes the Aadhaar report and returns to the path the row gave it. */
  const returnFrom = async (id: string, outcome: CeremonyOutcome<unknown>, method = SLUG) => {
    await deps.channel.report(id, 'createClaim', outcome, undefined, method)
    return open({ account: ACCOUNT, ceremony: id })
  }

  const launchAndReturn = async (outcome: CeremonyOutcome<unknown>) => {
    const mounted = await open()
    await mounted.press('checklist-row-0-upload')
    const [id] = deps.requestIds
    return returnFrom(id, outcome)
  }

  const repliesOf = async () => {
    const stored = await storedSession(world.records)
    return stored?.value.state === 'live' ? stored.value.gathering.replies : null
  }

  const chipOf = (shown: Mounted) => shown.byTestId('checklist-row-0-chip')?.textContent

  beforeEach(async () => {
    world = testRecords()
    await seedEntry(world.records)
    await seedCache(world.records, PATH)
    await seedSession(world.records, gathering)
    kit = fakeKit(PATH, SERVED)
    deps = depsOf()
  })

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  it('offers the upload with the lead and the line that asks for a fresh QR of the same identity', async () => {
    const mounted = await open()

    expect(mounted.byTestId('checklist-row-0-kind')?.textContent).toBe(
      t('socialRecovery.methodNames.aadhaar')
    )
    expect(mounted.byTestId('checklist-row-0-lead')?.textContent).toBe(t(`${AADHAAR}.lead`))
    expect(mounted.byTestId('checklist-row-0-upload')?.textContent).toBe(
      t(`${AADHAAR}.uploadAction`)
    )
    expect(mounted.byTestId('checklist-row-0-same-qr')?.textContent).toBe(t(`${AADHAAR}.sameQr`))
    expect(mounted.byTestId('checklist-row-0-phone-reads')).toBeNull()
    expect(mounted.byTestId('checklist-row-0-scan')).toBeNull()
    expect(mounted.byTestId('checklist-row-0-note')).toBeNull()
    expect(chipOf(mounted)).toBe(t(`${COLLECTION}.notAsked`))
  })

  it('stores the claim request with the client params, its seed whole, and opens the tab on the Aadhaar slug', async () => {
    const mounted = await open()

    await mounted.press('checklist-row-0-upload')

    const [id] = deps.requestIds
    expect(kit.methodParamsFor).toHaveBeenCalledWith(SLUG, 'createClaim')
    const stored = await world.records.ceremonyRequest(id).read()
    expect(stored.status === 'present' && stored.value).toEqual({
      call: 'createClaim',
      method: SLUG,
      account: ACCOUNT,
      chainId: CHAIN_ID,
      request: requestOf(gathering, 0),
      params: CLAIM_PARAMS
    })
    expect(mounted.lastPath()).toBe(
      ceremonyPath({
        call: 'createClaim',
        method: SLUG,
        id,
        handOff: false,
        returnTo: checklistPathOf(ACCOUNT, id)
      })
    )
    expect(chipOf(mounted)).toBe(t(`${COLLECTION}.waiting`))
  })

  it('adds a passed claim through the client and reads the row collected', async () => {
    const before = await storedSession(world.records)
    const reply = replyOf(gathering, 0)

    const back = await launchAndReturn(passed({ reply }))

    expect(kit.addApproverReply).toHaveBeenCalledWith(gathering, reply)
    const after = await storedSession(world.records)
    expect(after?.revision).not.toBe(before?.revision)
    expect(await repliesOf()).toEqual([reply])
    expect(chipOf(back)).toBe(t(`${COLLECTION}.complete`))
    expect(back.byTestId('checklist-row-0-upload')).toBeNull()
    expect(back.byTestId('checklist-row-0-lead')).toBeNull()
    expect((await world.records.ceremonyRequest(deps.requestIds[0]).read()).status).toBe('absent')
  })

  it('adds a passed claim that lands after the return through the listener', async () => {
    const mounted = await open()
    await mounted.press('checklist-row-0-upload')
    const [id] = deps.requestIds
    const back = await open({ account: ACCOUNT, ceremony: id })
    expect(back.byTestId('checklist-undelivered')).not.toBeNull()

    const reply = replyOf(gathering, 0)
    await outside(() => deps.channel.report(id, 'createClaim', passed({ reply }), undefined, SLUG))
    await outside(async () => undefined)

    expect(kit.addApproverReply).toHaveBeenCalledWith(gathering, reply)
    expect(await repliesOf()).toEqual([reply])
    expect(back.byTestId('checklist-undelivered')).toBeNull()
  })

  it('takes no report another method wrote under the Aadhaar claim id', async () => {
    const mounted = await open()
    await mounted.press('checklist-row-0-upload')
    const [id] = deps.requestIds

    const back = await returnFrom(id, passed({ reply: replyOf(gathering, 0) }), 'passkey')

    expect(kit.addApproverReply).not.toHaveBeenCalled()
    expect(back.byTestId('checklist-undelivered')).not.toBeNull()
    expect(await repliesOf()).toEqual([])
  })

  it('reads a reply of another attempt as failed with the check cause and a retry, adding nothing', async () => {
    const stale = { ...replyOf(gathering, 0), attemptId: '99' }

    const back = await launchAndReturn(passed({ reply: stale }))

    expect(kit.addApproverReply).not.toHaveBeenCalled()
    expect(await repliesOf()).toEqual([])
    expect(back.byTestId('checklist-row-0-note')?.textContent).toBe(t(`${CEREMONY}.failedNote`))
    expect(back.byTestId('checklist-row-0-cause')?.textContent).toBe(t(`${CEREMONY}.rejectedCause`))
    expect(back.byTestId('checklist-row-0-retry')).not.toBeNull()
    expect(chipOf(back)).toBe(t(`${COLLECTION}.notAsked`))
  })

  each([
    [
      'material-rejected',
      failed('material-rejected'),
      `${CEREMONY}.failedNote`,
      `${CEREMONY}.rejectedCause`,
      'notAsked'
    ],
    [
      'check-rejected',
      failed('check-rejected'),
      `${CEREMONY}.failedNote`,
      `${CEREMONY}.rejectedCause`,
      'notAsked'
    ],
    ['thrown', failed('thrown'), `${CEREMONY}.failedNote`, null, 'didNotAnswer'],
    [
      'service-unanswered',
      failed('service-unanswered'),
      `${CEREMONY}.failedNote`,
      null,
      'didNotAnswer'
    ],
    ['device-refused', failed('device-refused'), `${CEREMONY}.failedNote`, null, 'didNotAnswer'],
    [
      'device-unavailable',
      unavailable('device-unavailable'),
      `${CEREMONY}.unavailableNote`,
      null,
      'didNotAnswer'
    ]
  ] as const)(
    'renders a %s claim with its note, its cause line and a retry that launches again',
    async ([, outcome, noteKey, causeKey, chip]) => {
      const back = await launchAndReturn(outcome)

      expect(kit.addApproverReply).not.toHaveBeenCalled()
      expect(back.byTestId('checklist-row-0-note')?.textContent).toBe(t(noteKey))
      expect(back.byTestId('checklist-row-0-cause')?.textContent).toBe(
        causeKey ? t(causeKey) : undefined
      )
      expect(chipOf(back)).toBe(t(`${COLLECTION}.${chip}`))
      expect(back.byTestId('checklist-row-0-upload')).toBeNull()
      expect(back.byTestId('checklist-row-0-retry')?.textContent).toBe(
        t(`${CEREMONY}.tryAgainAction`)
      )

      await back.press('checklist-row-0-retry')
      const retried = deps.requestIds[1]
      const stored = await world.records.ceremonyRequest(retried).read()
      expect(stored.status === 'present' && stored.value).toMatchObject({
        call: 'createClaim',
        method: SLUG,
        params: CLAIM_PARAMS
      })
      expect(back.lastPath()).toContain(SLUG)
    }
  )

  it('reads a document the method cannot check as not supported, with no retry', async () => {
    const back = await launchAndReturn(notSupported('method-unsupported'))

    expect(back.byTestId('checklist-row-0-note')?.textContent).toBe(
      t(`${CEREMONY}.notSupportedNote`)
    )
    expect(back.byTestId('checklist-row-0-cause')).toBeNull()
    expect(back.byTestId('checklist-row-0-retry')).toBeNull()
  })

  each([
    ['cancelled', dismissed('cancelled'), `${CEREMONY}.stoppedNote`],
    ['refused', dismissed('refused'), `${CEREMONY}.refusedNote`]
  ] as const)(
    'renders a %s ceremony as its note with the row unchanged and a retry',
    async ([, outcome, noteKey]) => {
      const back = await launchAndReturn(outcome)

      expect(kit.addApproverReply).not.toHaveBeenCalled()
      expect(await repliesOf()).toEqual([])
      expect(back.byTestId('checklist-row-0-note')?.textContent).toBe(t(noteKey))
      expect(back.byTestId('checklist-row-0-cause')).toBeNull()
      expect(chipOf(back)).toBe(t(`${COLLECTION}.notAsked`))
      expect(back.byTestId('checklist-unsatisfied-didNotAnswer')).toBeNull()
      expect(back.byTestId('checklist-row-0-retry')).not.toBeNull()
    }
  )

  it('names a required Aadhaar identity that did not answer in the unsatisfied block', async () => {
    const back = await launchAndReturn(unavailable('device-unavailable'))

    expect(back.byTestId('checklist-unsatisfied-didNotAnswer')).not.toBeNull()
  })

  it('keeps a proof that did not match out of the did-not-answer block', async () => {
    const back = await launchAndReturn(failed('material-rejected'))

    expect(back.byTestId('checklist-unsatisfied-didNotAnswer')).toBeNull()
  })

  each([
    ['no registry entry', {}],
    ['no params for a claim', { aadhaar: { enroll: CLAIM_PARAMS } }]
  ] as const)(
    'asks nothing of an Aadhaar identity the client cannot serve (%s)',
    async ([, served]) => {
      kit = fakeKit(PATH, served)
      const mounted = await open()

      expect(mounted.byTestId('checklist-row-0-kind')?.textContent).toBe(
        t('socialRecovery.methodNames.aadhaar')
      )
      expect(mounted.byTestId('checklist-row-0-upload')).toBeNull()
      expect(mounted.byTestId('checklist-row-0-lead')).toBeNull()
      expect(mounted.byTestId('checklist-row-0-same-qr')).toBeNull()
      expect(chipOf(mounted)).toBe(t(`${COLLECTION}.notAsked`))
    }
  )
})

describe('an Aadhaar identity in a group', () => {
  /** A group of an Aadhaar identity and a guardian, both needed. */
  const GROUP: Configuration = configurationOf([
    { threshold: 2, credentials: [aadhaarCredential(), guardianCredential(GUARDIANS[0])] }
  ])
  let view: Mounted | undefined

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  each([
    [
      'served',
      SERVED,
      'checklist-unsatisfied-guardianOpen',
      'checklist-unsatisfied-groupCannotReach'
    ],
    [
      'not served',
      {},
      'checklist-unsatisfied-groupCannotReach',
      'checklist-unsatisfied-guardianOpen'
    ]
  ] as const)(
    'counts the Aadhaar identity toward the group only where the client serves it (%s)',
    async ([, served, shown, hidden]) => {
      const world = testRecords()
      await seedEntry(world.records)
      await seedCache(world.records, GROUP)
      await seedSession(world.records, gatheringOf(GROUP, 1))
      const kit = fakeKit(GROUP, served)

      view = await mountChecklist({ records: world.records, client: kit.state, deps: depsOf() })

      expect(view.byTestId(shown)).not.toBeNull()
      expect(view.byTestId(hidden)).toBeNull()
    }
  )
})
