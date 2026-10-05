/**
 * The save on arrival and the pure readings the view lays out: which arrival
 * lets the save start, the block each of the review's reads raises, the
 * account's facts, the screen each run state shows, the cost line, the save's
 * own words over the shared write states, and where the saved screen leads.
 */
import type { Account } from '@ambire-common/interfaces/account'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import { accountBatchRefusal } from '@web/modules/social-recovery/shared/client'
import { defaultSetupDraft } from '@web/modules/social-recovery/shared/records'
import { initialWriteState, writeReducer } from '@web/modules/social-recovery/shared/writes'
import type { WriteEvent, WriteState } from '@web/modules/social-recovery/shared/writes'
import { levelFromSearch } from '@web/modules/social-recovery/setup/card'
import { saveGateOf } from '@web/modules/social-recovery/setup/review'

import {
  armReducer,
  armScreenOf,
  arrivalOf,
  cardPathOf,
  costLineKeyOf,
  disagreedLineKeyOf,
  explorerTransactionUrlOf,
  initialArmState,
  saveWriteKeysOf
} from '@web/modules/social-recovery/setup/arm'
import type { ArmEvent, ArmState, ArrivalInput } from '@web/modules/social-recovery/setup/arm'

import {
  arrivalFor,
  CLIENT_CASES,
  COMMIT,
  crossProduct,
  draftOf,
  factsReadingFor,
  FACTS_CASES,
  GATE_CASES,
  gateFor,
  IN_FLIGHT_CASES,
  loadedOf,
  REMOVED_KEY,
  setupStateOf,
  smartAccount,
  TX_HASH
} from '@web/modules/social-recovery/setup/arm/__tests__/harness'
import type { ArrivalCase } from '@web/modules/social-recovery/setup/arm/__tests__/harness'

const ALREADY_SET_UP = { kind: 'blocked', block: { kind: 'already-set-up' } }

let account: Account

beforeAll(async () => {
  account = await smartAccount()
})

const READY: ArrivalCase = { gate: 'passes', facts: 'ready', client: 'ready', passwordHeld: true }

describe('the arrival', () => {
  it('lets the save start only where the gate passes, the facts are ready with a key, the client is ready and the password is held', () => {
    const ready = crossProduct({
      gate: GATE_CASES,
      facts: FACTS_CASES,
      client: CLIENT_CASES,
      passwordHeld: [true, false]
    }).filter((input) => arrivalFor(input, account).kind === 'ready')
    expect(ready).toEqual([READY])
  })
  ;(
    [
      ['unavailable', { kind: 'unavailable' }],
      ['removed-key-unreadable', { kind: 'removed-key-unreadable' }],
      ['does-not-fit', { kind: 'cannot-recover', reason: 'not-supported' }],
      ['key-count', { kind: 'cannot-recover', reason: 'key-count', count: 2 }],
      ['several-keys', { kind: 'cannot-recover', reason: 'key-count' }],
      ['already-set-up', { kind: 'already-set-up' }],
      ['empty-slot', { kind: 'empty-slot' }],
      ['password-not-set', { kind: 'password-missing' }]
    ] as const
  ).forEach(([gate, block]) =>
    it(`blocks with the review gate block raised by ${gate}`, () => {
      expect(arrivalFor({ ...READY, gate }, account)).toEqual({ kind: 'blocked', block })
    })
  )

  it('sends an encrypted save whose recovery password is no longer in memory back to the privacy step', () => {
    expect(arrivalFor({ ...READY, passwordHeld: false }, account)).toEqual({
      kind: 'blocked',
      block: { kind: 'password-missing' }
    })
  })
  ;(['clear', 'empty'] as const).forEach((backup) =>
    it(`needs no recovery password in memory at a ${backup} backup`, () => {
      expect(
        arrivalOf({
          facts: factsReadingFor('ready', account),
          client: 'ready',
          load: loadedOf(draftOf(backup)),
          gate: gateFor('passes'),
          setupState: { status: 'pending' },
          passwordHeld: false,
          inFlight: 'none'
        })
      ).toEqual({ kind: 'ready' })
    })
  )
  ;(
    [
      ['loading', { kind: 'loading' }],
      ['not-listed', { kind: 'unavailable', retry: null, cause: 'not-listed' }],
      ['no-network', { kind: 'unavailable', retry: null, cause: 'not-listed' }],
      ['state-unread', { kind: 'unavailable', retry: 'facts' }],
      ['view-only', { kind: 'unavailable', retry: null, cause: 'view-only' }]
    ] as const
  ).forEach(([facts, arrival]) =>
    it(`reads the account facts ${facts} as not ready`, () => {
      expect(arrivalFor({ ...READY, facts }, account)).toEqual(arrival)
    })
  )

  it('reads a facts reading before the gate, so a view-only account never shows the gate block', () => {
    expect(arrivalFor({ ...READY, facts: 'view-only', gate: 'already-set-up' }, account)).toEqual({
      kind: 'unavailable',
      retry: null,
      cause: 'view-only'
    })
  })
  ;(
    [
      ['loading', { kind: 'loading' }],
      ['update-the-wallet', { kind: 'update-the-wallet' }],
      ['failed', { kind: 'unavailable', retry: 'client' }]
    ] as const
  ).forEach(([client, arrival]) =>
    it(`reads a client ${client} as not ready`, () => {
      expect(arrivalFor({ ...READY, client }, account)).toEqual(arrival)
    })
  )

  it('reads records that could not load as their own failure, and records still loading as loading', () => {
    const base = {
      facts: factsReadingFor('ready', account),
      client: 'ready' as const,
      gate: gateFor('passes'),
      setupState: { status: 'pending' } as const,
      passwordHeld: true,
      inFlight: 'none' as const
    }
    expect(arrivalOf({ ...base, load: { status: 'failed' } })).toEqual({ kind: 'load-failed' })
    expect(arrivalOf({ ...base, load: { status: 'loading' } })).toEqual({ kind: 'loading' })
  })

  describe('a setup the account already holds', () => {
    const withSetup = (input: Partial<ArrivalInput> = {}) =>
      arrivalOf({
        facts: factsReadingFor('ready', account),
        client: 'ready',
        load: loadedOf(draftOf('encrypted')),
        gate: gateFor('passes'),
        setupState: { status: 'answered', value: setupStateOf(true) },
        passwordHeld: true,
        inFlight: 'none',
        ...input
      })

    GATE_CASES.forEach((gate) =>
      it(`blocks as already set up before the gate's own reading (${gate})`, () => {
        expect(withSetup({ gate: gateFor(gate) })).toEqual(ALREADY_SET_UP)
      })
    )

    it('blocks as already set up before the missing recovery password', () => {
      expect(withSetup({ passwordHeld: false })).toEqual(ALREADY_SET_UP)
    })

    it('blocks as already set up after a saved run, whose wiped records read as the default draft with no password set', () => {
      const wiped = defaultSetupDraft()
      expect(
        withSetup({
          load: { status: 'loaded', draft: wiped, enrollments: [], passwordSet: false },
          gate: saveGateOf({
            recordsLoaded: true,
            clientReady: true,
            trustRows: [],
            untested: false,
            clauses: wiped.clauses,
            backup: wiped.privacy.backup,
            passwordSet: false,
            removedKey: { status: 'answered', value: { kind: 'named', key: REMOVED_KEY } },
            fitCheck: { status: 'answered', value: { basis: 'deployed-code', fits: true } },
            setupState: { status: 'answered', value: setupStateOf(true) },
            description: { status: 'pending' }
          }),
          passwordHeld: false
        })
      ).toEqual(ALREADY_SET_UP)
    })

    it('still reads the account facts, the client and the records first', () => {
      expect(withSetup({ facts: factsReadingFor('view-only', account) })).toEqual({
        kind: 'unavailable',
        retry: null,
        cause: 'view-only'
      })
      expect(withSetup({ facts: factsReadingFor('loading', account) })).toEqual({ kind: 'loading' })
      expect(withSetup({ client: 'failed' })).toEqual({ kind: 'unavailable', retry: 'client' })
      expect(withSetup({ client: 'update-the-wallet' })).toEqual({ kind: 'update-the-wallet' })
      expect(withSetup({ client: 'loading' })).toEqual({ kind: 'loading' })
      expect(withSetup({ load: { status: 'failed' } })).toEqual({ kind: 'load-failed' })
      expect(withSetup({ load: { status: 'loading' } })).toEqual({ kind: 'loading' })
    })

    it('does not block where the setup read has not answered or answered none', () => {
      expect(withSetup({ setupState: { status: 'pending' } })).toEqual({ kind: 'ready' })
      expect(withSetup({ setupState: { status: 'answered', value: setupStateOf(false) } })).toEqual(
        { kind: 'ready' }
      )
    })
  })

  describe('a save in flight stored on this device', () => {
    const EVERY_ARRIVAL = crossProduct({
      gate: GATE_CASES,
      facts: FACTS_CASES,
      client: CLIENT_CASES,
      passwordHeld: [true, false]
    })
    /** The readings that come before the stored save: the account, the client and the records. */
    const BEFORE_THE_RECORD = ['loading', 'unavailable', 'update-the-wallet', 'load-failed']

    it('offers the save only once the read of a stored save answered none', () => {
      const ready = crossProduct({ arrival: EVERY_ARRIVAL, inFlight: IN_FLIGHT_CASES }).filter(
        ({ arrival, inFlight }) => arrivalFor(arrival, account, { inFlight }).kind === 'ready'
      )
      expect(ready).toEqual([{ arrival: READY, inFlight: 'none' }])
    })

    it('reads loading until the read answers, and its failure as the records that could not load', () => {
      expect(arrivalFor(READY, account, { inFlight: undefined })).toEqual({ kind: 'loading' })
      expect(arrivalFor(READY, account, { inFlight: 'reading' })).toEqual({ kind: 'loading' })
      expect(arrivalFor(READY, account, { inFlight: 'failed' })).toEqual({ kind: 'load-failed' })
    })

    it('ranks below the account facts, the client and the records, and above a setup on the account, every gate block and the missing password', () => {
      const outranked: string[] = []
      const wrong: string[] = []
      EVERY_ARRIVAL.forEach((input) => {
        const without = arrivalFor(input, account, { inFlight: 'none' })
        ;(['reading', 'failed'] as const).forEach((inFlight) => {
          const withRecord = arrivalFor(input, account, { inFlight })
          const expected = BEFORE_THE_RECORD.includes(without.kind)
            ? without
            : inFlight === 'failed'
            ? { kind: 'load-failed' }
            : { kind: 'loading' }
          if (JSON.stringify(withRecord) !== JSON.stringify(expected)) {
            wrong.push(
              `${JSON.stringify({ ...input, inFlight })} read ${JSON.stringify(withRecord)}`
            )
          }
          if (without.kind === 'blocked' && inFlight === 'reading') {
            outranked.push(without.block.kind)
          }
        })
      })
      expect(wrong).toEqual([])
      // Every block the record outranks is met: a setup, each gate block and the missing password.
      expect(new Set(outranked)).toEqual(
        new Set([
          'already-set-up',
          'unavailable',
          'removed-key-unreadable',
          'cannot-recover',
          'empty-slot',
          'password-missing'
        ])
      )
    })
  })

  it('waits while a read of the gate has not come back, with no block shown', () => {
    expect(
      arrivalOf({
        facts: factsReadingFor('ready', account),
        client: 'ready',
        load: loadedOf(draftOf()),
        gate: { canSave: false, blocked: null, notTested: false },
        setupState: { status: 'pending' },
        passwordHeld: true,
        inFlight: 'none'
      })
    ).toEqual({ kind: 'loading' })
  })
})

describe('the screen a save shows', () => {
  const apply = (events: ArmEvent[], from: ArmState = initialArmState()) =>
    events.reduce(armReducer, from)
  const write = (event: WriteEvent): ArmEvent => ({ type: 'write', event })
  const ENOUGH = {
    kind: 'enough' as const,
    write: 'save' as const,
    key: COMMIT.target,
    estimate: { gas: 1n, gasPrice: 1n, cost: 1n, required: 1n },
    balance: 1n
  }
  const landed = apply([
    write({ type: 'start' }),
    write({ type: 'gasChecked', run: 1, check: ENOUGH }),
    write({ type: 'sent', run: 1, transactionHash: TX_HASH }),
    write({ type: 'receipt', run: 1, receipt: { transactionHash: TX_HASH, status: 1 } })
  ])

  it('shows the arrival before any run, and the run once it started, whatever it reads', () => {
    expect(armScreenOf(initialArmState())).toBe('arrival')
    expect(armScreenOf(apply([write({ type: 'start' })]))).toBe('run')
    expect(armScreenOf(landed)).toBe('run')
  })

  it('shows already set up once a run found a setup, and never the arrival again', () => {
    const stopped = apply([write({ type: 'start' }), { type: 'alreadySetUp', run: 1 }])
    expect(stopped.write.status).toBe('idle')
    expect(armScreenOf(stopped)).toBe('already-set-up')
    expect(armScreenOf(apply([write({ type: 'start' })], stopped))).toBe('already-set-up')
  })

  it('shows the check running, then saved only after the wipe, or the disagreement, or the unanswered check', () => {
    const confirming = apply([{ type: 'confirming', run: 1 }], landed)
    expect(armScreenOf(confirming)).toBe('confirming')
    const saving = apply([{ type: 'confirmed', run: 1, outcome: { kind: 'agreed' } }], confirming)
    expect(armScreenOf(saving)).toBe('confirming')
    expect(armScreenOf(apply([{ type: 'wiped', run: 1 }], saving))).toBe('saved')
    expect(
      armScreenOf(
        apply(
          [{ type: 'confirmed', run: 1, outcome: { kind: 'disagreed', check: 'mismatch' } }],
          confirming
        )
      )
    ).toBe('disagreed')
    expect(
      armScreenOf(apply([{ type: 'confirmed', run: 1, outcome: { kind: 'unread' } }], confirming))
    ).toBe('unread')
  })
})

describe('the lines the view reads', () => {
  it('names the deployment in the cost line only for an account with no code', () => {
    expect(costLineKeyOf(true)).toBe('socialRecovery.costLines.save')
    expect(costLineKeyOf(false)).toBe('socialRecovery.costLines.saveDeploys')
  })

  it("sets the save's own title and sentence over the shared write states", () => {
    const refusedFor = (reason: 'not-a-transaction' | 'other-request-pending') =>
      writeReducer(writeReducer(initialWriteState('save'), { type: 'start' }), {
        type: 'error',
        run: 1,
        error: accountBatchRefusal(reason, REMOVED_KEY)
      })
    const states: WriteState[] = [
      { status: 'submitting', write: 'save' },
      { status: 'failedNotSent', write: 'save', error: new Error('refused') },
      {
        status: 'failedNotSent',
        write: 'save',
        error: new Error('replaced'),
        replaced: 'replaced'
      },
      {
        status: 'failedReverted',
        write: 'save',
        transactionHash: TX_HASH,
        receipt: { transactionHash: TX_HASH, status: 0 },
        cause: { kind: 'unnamed' }
      },
      writeReducer(initialWriteState('save'), { type: 'start' }),
      refusedFor('not-a-transaction'),
      refusedFor('other-request-pending')
    ]
    expect(states.map((state) => saveWriteKeysOf(state))).toEqual([
      { note: 'socialRecovery.review.after.submitting' },
      // A save never sent reads one sentence: the save's own, in place of the shared line.
      {
        title: 'socialRecovery.review.after.failedTitle',
        body: 'socialRecovery.review.after.notSent'
      },
      { title: 'socialRecovery.review.after.failedTitle' },
      { title: 'socialRecovery.review.after.failedTitle' },
      {},
      // A save that may still land carries no failure title.
      { body: 'socialRecovery.arm.mayStillLand' },
      // Another waiting request keeps the shared line, which names it.
      { title: 'socialRecovery.review.after.failedTitle' }
    ])
  })

  it("sets the save's own sentence over a followed request: unread or gone with no hash, and the submitting note otherwise", () => {
    const noHash: WriteState = { status: 'submitting', write: 'save' }
    const withHash: WriteState = { status: 'submitting', write: 'save', transactionHash: TX_HASH }
    const refused: WriteState = { status: 'failedNotSent', write: 'save', error: new Error('x') }
    const rows = (['queued', 'unread', 'gone', undefined] as const).flatMap((follow) =>
      [noHash, withHash, refused].map((state) => ({
        status: state.status,
        keys: saveWriteKeysOf(state, follow)
      }))
    )
    const notes = rows.filter(({ status }) => status === 'submitting').map(({ keys }) => keys.note)
    expect(notes).toEqual([
      'socialRecovery.review.after.submitting',
      'socialRecovery.review.after.submitting',
      'socialRecovery.arm.unread',
      'socialRecovery.review.after.submitting',
      'socialRecovery.arm.lookingForSave',
      'socialRecovery.review.after.submitting',
      'socialRecovery.review.after.submitting',
      'socialRecovery.review.after.submitting'
    ])
    // A reading of the follow never changes the keys of a state that is not submitting.
    rows
      .filter(({ status }) => status !== 'submitting')
      .forEach(({ keys }) => expect(keys).toEqual(saveWriteKeysOf(refused)))
  })

  it('names the check that disagreed', () => {
    expect(disagreedLineKeyOf('mismatch')).toBe('socialRecovery.arm.disagreed.mismatch')
    expect(disagreedLineKeyOf('authorization')).toBe(
      'socialRecovery.arm.disagreed.authorizationUnrecognized'
    )
  })

  it('leads Continue to the card with the level it shows, which the card reads back', () => {
    const hidden = cardPathOf('hidden')
    const shown = cardPathOf('public')
    expect(hidden.startsWith(`/${WEB_ROUTES.socialRecoverySetupCard}?`)).toBe(true)
    expect(levelFromSearch(hidden.slice(hidden.indexOf('?')))).toBe('hidden')
    expect(levelFromSearch(shown.slice(shown.indexOf('?')))).toBe('public')
  })

  it("opens the transaction on the recovery chain's explorer", () => {
    expect(explorerTransactionUrlOf('sepolia', TX_HASH)).toBe(
      `https://sepolia.etherscan.io/tx/${TX_HASH}`
    )
    expect(explorerTransactionUrlOf('mainnet', TX_HASH)).toBe(`https://etherscan.io/tx/${TX_HASH}`)
  })
})
