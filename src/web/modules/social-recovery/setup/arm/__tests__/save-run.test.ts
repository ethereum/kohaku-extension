/**
 * One save at a time, over its real steps and a store, as the screen runs it:
 * what the prepare is given, what the gas check estimates, what is sent and
 * with which mark, each way the send and the receipt end, and what the check
 * after a landed receipt decides, down to the wipe of the six setup records on
 * the extension's records over an in-memory storage.
 */
import type { Account } from '@ambire-common/interfaces/account'
import type { SetupDraft } from '@web/modules/social-recovery/sdk-interfaces'
import {
  accountBatchRefusal,
  accountBatchTransactionOf,
  privacyLevelOf,
  recoveryKitMarkOf,
  sameAddress,
  shapeNoteOf
} from '@web/modules/social-recovery/shared/client'
import {
  createWalletRecords,
  readRecoveryPassword,
  setRecoveryPassword,
  SETUP_RECORD_NAMES
} from '@web/modules/social-recovery/shared/records'
import { canRetry, mayStillLand } from '@web/modules/social-recovery/shared/writes'

import {
  armScreenOf,
  callsOf,
  checkReceiptAgain,
  checkSetupAgain,
  committedDraftOf,
  CONFIRM_REREAD_BLOCKS,
  createArmStore,
  endWhereSetUp,
  isLive,
  isSaved,
  outlivesScreen,
  RECEIPT_WAIT_MS,
  recheckGas,
  rereadConfirmation,
  saveWriteKeysOf,
  startSave
} from '@web/modules/social-recovery/setup/arm'
import type { ArmStore } from '@web/modules/social-recovery/setup/arm'

import {
  advanceTimers,
  armingCallOf,
  CHAIN_ID,
  COMMIT,
  confirmation,
  DESCRIPTOR,
  draftOf,
  feeReading,
  HAPPY,
  KEY,
  landedReceipt,
  memoryStorage,
  minedAndReverted,
  nodeError,
  PASSWORD,
  replacedTransaction,
  runSave,
  setupStateOf,
  SHORT_TIMEOUT_MS,
  smartAccount,
  START_BLOCK,
  TX_HASH,
  wireSave
} from '@web/modules/social-recovery/setup/arm/__tests__/harness'
import type { SaveScript } from '@web/modules/social-recovery/setup/arm/__tests__/harness'

let account: Account

beforeAll(async () => {
  account = await smartAccount()
})

const script = (overrides: Partial<SaveScript> = {}): SaveScript => ({
  ...HAPPY,
  authorized: false,
  deployed: true,
  ...overrides
})

describe('the batch the save sends', () => {
  const CASES: [string, boolean, boolean][] = [
    ['not yet authorized, with code', false, true],
    ['not yet authorized, with no code', false, false],
    ['already authorized, with code', true, true],
    ['already authorized, with no code', true, false]
  ]

  CASES.forEach(([title, authorized, deployed]) =>
    it(`sends exactly the prepared calls in order, as one request, for an account ${title}`, async () => {
      const wired = wireSave(account, script({ authorized, deployed }))
      await runSave(wired.steps)

      expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
      const [sentFor, calls] = wired.port.sendAccountBatch.mock.calls[0]
      expect(sentFor).toBe(wired.account)
      expect(calls).toEqual(authorized ? [COMMIT] : [armingCallOf(wired.account), COMMIT])
      // No call the wallet composed: nothing to the factory, nothing beyond what the client prepared.
      expect(
        calls.filter((call: { target: string }) =>
          sameAddress(call.target, account.creation!.factoryAddr)
        )
      ).toEqual([])
      expect(wired.port.send).not.toHaveBeenCalled()
    })
  )

  it("sends the batch with the recovery kit's mark from the client's descriptor", async () => {
    const wired = wireSave(account, script())
    await runSave(wired.steps)

    const mark = wired.port.sendAccountBatch.mock.calls[0][3]
    expect(mark).toEqual(recoveryKitMarkOf(DESCRIPTOR))
    expect(mark.manager).toBe(DESCRIPTOR.manager)
    expect(mark.auditedActions).toEqual([...DESCRIPTOR.auditedActions])
  })
})

describe('the gas check before the send', () => {
  ;[true, false].forEach((deployed) =>
    it(`estimates the account library's transaction of the batch from the controlling key (code: ${deployed})`, async () => {
      const wired = wireSave(account, script({ deployed }))
      await runSave(wired.steps)

      const expected = accountBatchTransactionOf(wired.facts, KEY, callsOf(wired.prepared))
      expect(expected.to.toLowerCase()).toBe(
        (deployed ? account.addr : account.creation!.factoryAddr).toLowerCase()
      )
      expect(wired.reads.estimateGas).toHaveBeenCalledWith(
        expect.objectContaining({ to: expected.to, data: expected.data })
      )
      expect(wired.reads.nativeBalance).toHaveBeenCalledWith(KEY.addr)
      expect(wired.reads.nativeBalance.mock.invocationCallOrder[0]).toBeLessThan(
        wired.port.sendAccountBatch.mock.invocationCallOrder[0]
      )
    })
  )

  it("sends nothing on a key short of gas, and shows the deposit step naming the key's address and the shortfall", async () => {
    const wired = wireSave(account, script({ gas: 'deposit' }))
    const store = await runSave(wired.steps)
    const { write } = store.state()

    expect(write.status).toBe('needsDeposit')
    if (write.status !== 'needsDeposit') {
      return
    }
    expect(write.step.key.toLowerCase()).toBe(KEY.addr.toLowerCase())
    expect(write.step.payer).toBe('accountKey')
    expect(write.step.shortfall).toBeGreaterThan(0n)
    expect(write.step.routes.map(({ kind }) => kind)).toEqual(expect.arrayContaining(['outside']))
    expect(write.step.routes.every(({ kind }) => kind === 'transfer' || kind === 'outside')).toBe(
      true
    )
    expect(wired.port.sendAccountBatch).not.toHaveBeenCalled()
    expect(wired.saveSetup).not.toHaveBeenCalled()
  })

  it('checks the gas again from the deposit step on the same prepared save, and sends once the key holds enough', async () => {
    const wired = wireSave(account, script({ gas: 'deposit' }))
    const store = await runSave(wired.steps)
    wired.reads.nativeBalance.mockResolvedValue(10n ** 18n)

    await recheckGas(store, wired.steps, { timeoutMs: SHORT_TIMEOUT_MS })

    expect(wired.prepareCommitSetup).toHaveBeenCalledTimes(1)
    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(isSaved(store.state())).toBe(true)
  })

  it('reads a gas check that could not read as its own state, with nothing sent', async () => {
    const wired = wireSave(account, script({ gas: 'read-fails' }))
    const store = await runSave(wired.steps)

    expect(store.state().write.status).toBe('gasReadError')
    expect(wired.port.sendAccountBatch).not.toHaveBeenCalled()
  })
})

describe('the prepare', () => {
  it('reads a refusal of the prepare as never sent, with no gas check and nothing sent, and a retry prepares again', async () => {
    const wired = wireSave(account, script({ prepare: 'refuses' }))
    const store = await runSave(wired.steps)

    expect(store.state().write.status).toBe('failedNotSent')
    expect(canRetry(store.state().write)).toBe(true)
    expect(wired.reads.estimateGas).not.toHaveBeenCalled()
    expect(wired.port.sendAccountBatch).not.toHaveBeenCalled()

    wired.prepareCommitSetup.mockResolvedValue(wired.prepared)
    await startSave(store, wired.steps, { timeoutMs: SHORT_TIMEOUT_MS })
    expect(wired.prepareCommitSetup).toHaveBeenCalledTimes(2)
    expect(isSaved(store.state())).toBe(true)
  })

  it('gives the prepare the recovery password at an encrypted backup, and none at a clear one', async () => {
    const encrypted = wireSave(account, script({ backup: 'encrypted' }))
    await runSave(encrypted.steps)
    expect(encrypted.prepareCommitSetup).toHaveBeenCalledWith(encrypted.draft, PASSWORD)

    const clear = wireSave(account, script({ backup: 'clear' }))
    await runSave(clear.steps)
    expect(clear.prepareCommitSetup).toHaveBeenCalledWith(clear.draft, undefined)
  })

  it('rebuilds a stale shape note from the final path, writes the draft back, and prepares that draft', async () => {
    const stale = shapeNoteOf({ clauses: [], wait: 1n, ignoresPause: true })
    const wired = wireSave(account, script({ publicMetadata: stale }))
    expect(privacyLevelOf(wired.draft.privacy)).toBe('shape-visible')
    await runSave(wired.steps)

    const fresh = shapeNoteOf({
      clauses: wired.draft.clauses,
      wait: wired.draft.wait,
      ignoresPause: wired.draft.ignoresPause
    })
    expect(fresh).not.toBe(stale)
    const rebuilt: SetupDraft = {
      ...wired.draft,
      privacy: { ...wired.draft.privacy, publicMetadata: fresh }
    }
    expect(wired.writeDraftAndPath).toHaveBeenCalledWith(rebuilt)
    expect(wired.prepareCommitSetup).toHaveBeenCalledWith(rebuilt, PASSWORD)
    expect(wired.writeDraftAndPath.mock.invocationCallOrder[0]).toBeLessThan(
      wired.prepareCommitSetup.mock.invocationCallOrder[0]
    )
    expect(wired.confirmSetup).toHaveBeenCalledWith(rebuilt, wired.prepared)
  })

  it('commits a draft whose note is current, or that shows no shape, as it stands, writing nothing back', async () => {
    const current = draftOf('encrypted')
    const note = shapeNoteOf({
      clauses: current.clauses,
      wait: current.wait,
      ignoresPause: current.ignoresPause
    })
    expect(committedDraftOf(draftOf('encrypted', note))).toEqual(draftOf('encrypted', note))
    expect(committedDraftOf(draftOf('encrypted', '0x'))).toEqual(draftOf('encrypted', '0x'))

    const wired = wireSave(account, script({ publicMetadata: note }))
    await runSave(wired.steps)
    expect(wired.writeDraftAndPath).not.toHaveBeenCalled()
  })

  it('refuses a prepared write the account does not send, and sends nothing', async () => {
    const wired = wireSave(account, script())
    wired.prepareCommitSetup.mockResolvedValue({ ...COMMIT, sender: 'anyone' })
    const store = await runSave(wired.steps)

    expect(store.state().write.status).toBe('failedNotSent')
    expect(wired.port.sendAccountBatch).not.toHaveBeenCalled()
  })
})

describe('the send and the receipt', () => {
  const REASONS = [
    'not-wired',
    'not-listed',
    'not-smart-account',
    'refused',
    'window-closed',
    'not-broadcast',
    'not-a-transaction',
    'timeout'
  ] as const

  REASONS.filter((send) => send !== 'not-a-transaction').forEach((send) =>
    it(`reads a refusal of the port (${send}) as never sent, with the retry, and wipes nothing`, async () => {
      const wired = wireSave(account, script({ send }))
      const store = await runSave(wired.steps)
      const { write } = store.state()

      expect(write.status).toBe('failedNotSent')
      expect(write.status === 'failedNotSent' && write.replaced).toBeFalsy()
      expect(canRetry(write)).toBe(true)
      expect(mayStillLand(write)).toBe(false)
      // One sentence: the save's own, in place of the shared line.
      expect(saveWriteKeysOf(write)).toEqual({
        title: 'socialRecovery.review.after.failedTitle',
        body: 'socialRecovery.review.after.notSent'
      })
      expect(wired.confirmSetup).not.toHaveBeenCalled()
      expect(wired.saveSetup).not.toHaveBeenCalled()
      expect(armScreenOf(store.state())).toBe('run')
    })
  )

  it('offers no retry after the port answered that the operation was not a transaction: a start then prepares and sends nothing', async () => {
    const wired = wireSave(account, script({ send: 'not-a-transaction' }))
    const store = await runSave(wired.steps)
    const refused = store.state()
    expect(refused.write.status).toBe('failedNotSent')
    expect(mayStillLand(refused.write)).toBe(true)
    // No failure title and no word that nothing was sent: the operation may still land.
    expect(saveWriteKeysOf(refused.write)).toEqual({ body: 'socialRecovery.arm.mayStillLand' })
    // The run read the setup before it prepared, and once more after its claim.
    expect(wired.setupState).toHaveBeenCalledTimes(2)
    wired.port.sendAccountBatch.mockResolvedValue(TX_HASH)

    await startSave(store, wired.steps, { timeoutMs: SHORT_TIMEOUT_MS })

    expect(store.state()).toBe(refused)
    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(wired.prepareCommitSetup).toHaveBeenCalledTimes(1)
    expect(wired.setupState).toHaveBeenCalledTimes(2)
    expect(wired.saveSetup).not.toHaveBeenCalled()
  })

  it("reads a thrown value that names the same reason but is not the port's refusal as never sent, with the retry", async () => {
    const wired = wireSave(account, script())
    wired.port.sendAccountBatch.mockRejectedValue(
      Object.assign(new Error('not-a-transaction'), { reason: 'not-a-transaction' })
    )
    const store = await runSave(wired.steps)

    expect(store.state().write.status).toBe('failedNotSent')
    expect(mayStillLand(store.state().write)).toBe(false)
  })

  it('reads a reverted receipt as reverted, with the cause it carries and the gas gone, and wipes nothing', async () => {
    const wired = wireSave(account, script({ receipt: 'reverted' }))
    const store = await runSave(wired.steps)
    const { write } = store.state()

    expect(write.status).toBe('failedReverted')
    if (write.status !== 'failedReverted') {
      return
    }
    expect(write.transactionHash).toBe(TX_HASH)
    // The drive decodes no kit error for the receipt, so the cause is the one the wallet cannot name.
    expect(write.cause).toEqual({ kind: 'unnamed' })
    expect(wired.confirmSetup).not.toHaveBeenCalled()
    expect(wired.saveSetup).not.toHaveBeenCalled()
  })

  it('reads a transaction another one replaced as not run, and wipes nothing', async () => {
    const wired = wireSave(account, script({ receipt: 'replaced' }))
    const store = await runSave(wired.steps)
    const { write } = store.state()

    expect(write.status).toBe('failedNotSent')
    expect(write.status === 'failedNotSent' && write.replaced).toBe('replaced')
    expect(wired.confirmSetup).not.toHaveBeenCalled()
    expect(wired.saveSetup).not.toHaveBeenCalled()
  })
})

describe('after the batch landed', () => {
  it('runs the check once after the receipt, with the committed draft and the prepared write', async () => {
    const wired = wireSave(account, script())
    await runSave(wired.steps)

    expect(wired.confirmSetup).toHaveBeenCalledTimes(1)
    expect(wired.confirmSetup).toHaveBeenCalledWith(wired.draft, wired.prepared)
    expect(wired.confirmSetup.mock.invocationCallOrder[0]).toBeGreaterThan(
      wired.receipts.wait.mock.invocationCallOrder[0]
    )
  })

  it('wipes the six setup records and the stored save in flight once the check agrees, keeps the recovery password, and reads saved', async () => {
    const storage = memoryStorage()
    const wired = wireSave(account, script(), { storage })
    const records = createWalletRecords({ storage })
    const setup = records.setup(CHAIN_ID, wired.account)
    await setup.setupDraft.write(wired.draft)
    await setup.enrollments.write([])
    await setup.passwordSet.write('password-set')
    await setup.waitingPeriod.write(wired.draft.wait)
    expect(storage.raw.size).toBe(4)
    setRecoveryPassword(CHAIN_ID, wired.account, PASSWORD)
    let answer: (value: ReturnType<typeof confirmation>) => void = () => {}
    wired.confirmSetup.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve
        })
    )
    const store = createArmStore()
    const running = startSave(store, wired.steps, { timeoutMs: 10_000 })
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
    // While the check runs, the save in flight is stored beside the four records, under its hash.
    expect(storage.raw.size).toBe(5)
    const held = await wired.inFlight.read()
    expect(held.status === 'present' && held.value.transactionHash).toBe(TX_HASH)
    answer(confirmation(true, true))
    await running

    expect(isSaved(store.state())).toBe(true)
    expect(armScreenOf(store.state())).toBe('saved')
    expect(wired.saveSetup).toHaveBeenCalledTimes(1)
    expect(wired.saveSetup).toHaveBeenCalledWith(CHAIN_ID, wired.account)
    expect(storage.raw.size).toBe(0)
    const reads = await Promise.all(SETUP_RECORD_NAMES.map((name) => setup[name].read()))
    expect(reads.map(({ status }) => status)).toEqual(SETUP_RECORD_NAMES.map(() => 'absent'))
    expect(readRecoveryPassword(CHAIN_ID, wired.account)).toBe(PASSWORD)
  })

  it('does not read saved while the check runs, nor before the wipe ends', async () => {
    const wired = wireSave(account, script())
    let answer: (value: ReturnType<typeof confirmation>) => void = () => {}
    wired.confirmSetup.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve
        })
    )
    let wiped: () => void = () => {}
    wired.saveSetup.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          wiped = resolve
        })
    )
    const store = createArmStore()
    const run = startSave(store, wired.steps, { timeoutMs: 10_000 })
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
    expect(store.state().write.status).toBe('landed')
    expect(armScreenOf(store.state())).toBe('confirming')
    expect(wired.saveSetup).not.toHaveBeenCalled()

    answer(confirmation(true, true))
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
    expect(wired.saveSetup).toHaveBeenCalledTimes(1)
    expect(isSaved(store.state())).toBe(false)
    expect(armScreenOf(store.state())).toBe('confirming')

    wiped()
    await run
    expect(isSaved(store.state())).toBe(true)
  })

  const DISAGREED: [string, SaveScript['confirm'], 'mismatch' | 'authorization', number][] = [
    ['an authorization the module does not recognize', 'unauthorized', 'authorization', 1],
    ["the commitment's coded mismatch", 'mismatch', 'mismatch', 1],
    [
      'a setup the check found on no read, the first or any further one',
      'never-landed',
      'mismatch',
      1 + CONFIRM_REREAD_BLOCKS
    ]
  ]

  DISAGREED.forEach(([named, confirm, check, reads]) =>
    it(`reads ${named} as disagreed, never saved, and wipes nothing`, async () => {
      const wired = wireSave(account, script({ confirm }))
      const store = await runSave(wired.steps)

      expect(store.state().after).toEqual({ stage: 'disagreed', check })
      expect(armScreenOf(store.state())).toBe('disagreed')
      expect(isSaved(store.state())).toBe(false)
      expect(wired.confirmSetup).toHaveBeenCalledTimes(reads)
      expect(wired.saveSetup).not.toHaveBeenCalled()

      // Nothing the screen offers after a disagreement reads the check again or wipes.
      await rereadConfirmation(store, wired.steps)
      await recheckGas(store, wired.steps)
      expect(wired.confirmSetup).toHaveBeenCalledTimes(reads)
      expect(wired.saveSetup).not.toHaveBeenCalled()
    })
  )

  it('reads saved where the check found the setup only on its second read', async () => {
    const wired = wireSave(account, script({ confirm: 'not-landed-then-agreed' }))
    const store = await runSave(wired.steps)

    expect(wired.confirmSetup).toHaveBeenCalledTimes(2)
    expect(isSaved(store.state())).toBe(true)
    expect(wired.saveSetup).toHaveBeenCalledTimes(1)
  })

  it('reads saved where only the last further read found the setup, and wipes once after it', async () => {
    const wired = wireSave(account, script({ confirm: 'agreed-on-last-read' }))
    const store = await runSave(wired.steps)

    expect(wired.confirmSetup).toHaveBeenCalledTimes(1 + CONFIRM_REREAD_BLOCKS)
    expect(isSaved(store.state())).toBe(true)
    expect(wired.saveSetup).toHaveBeenCalledTimes(1)
    expect(wired.saveSetup.mock.invocationCallOrder[0]).toBeGreaterThan(
      Math.max(...wired.confirmSetup.mock.invocationCallOrder)
    )
  })
  ;(
    [
      ['throws', 'throws'],
      ['never answers', 'no-answer']
    ] as const
  ).forEach(([named, confirm]) =>
    it(`reads a check that ${named} as unanswered, wipes nothing, and reads it again on the retry`, async () => {
      const wired = wireSave(account, script({ confirm }))
      const store = await runSave(wired.steps)

      expect(store.state().after).toEqual({ stage: 'unread' })
      expect(armScreenOf(store.state())).toBe('unread')
      expect(wired.saveSetup).not.toHaveBeenCalled()
      expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)

      wired.confirmSetup.mockResolvedValue(confirmation(true, true))
      await rereadConfirmation(store, wired.steps, { timeoutMs: SHORT_TIMEOUT_MS })

      expect(wired.confirmSetup).toHaveBeenCalledTimes(2)
      expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
      expect(wired.prepareCommitSetup).toHaveBeenCalledTimes(1)
      expect(isSaved(store.state())).toBe(true)
      expect(wired.saveSetup).toHaveBeenCalledTimes(1)
    })
  )

  it('reads a retried check that now disagrees as disagreed, with nothing wiped', async () => {
    const wired = wireSave(account, script({ confirm: 'throws' }))
    const store = await runSave(wired.steps)
    wired.confirmSetup.mockResolvedValue(confirmation(true, false))

    await rereadConfirmation(store, wired.steps)

    expect(store.state().after).toEqual({ stage: 'disagreed', check: 'authorization' })
    expect(wired.saveSetup).not.toHaveBeenCalled()
  })

  it('still reads saved where the wipe of the records failed, since the setup is live on chain', async () => {
    const wired = wireSave(account, script())
    wired.saveSetup.mockRejectedValue(new Error('storage unavailable'))
    const store = await runSave(wired.steps)

    expect(wired.saveSetup).toHaveBeenCalledTimes(1)
    expect(isSaved(store.state())).toBe(true)
  })

  it('offers no new save once saved: a start does nothing', async () => {
    const wired = wireSave(account, script())
    const store = await runSave(wired.steps)
    const saved = store.state()

    await startSave(store, wired.steps)

    expect(store.state()).toBe(saved)
    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
  })
})

const restart = (store: ArmStore, wired: ReturnType<typeof wireSave>) =>
  startSave(store, wired.steps, { timeoutMs: SHORT_TIMEOUT_MS })

describe('the setup read at the start of every run', () => {
  it('reads the setup first on the first start, before the prepare, the gas check and the send, and once more after the claim and before the send', async () => {
    const wired = wireSave(account, script())
    const writes = jest.spyOn(wired.storage, 'set')
    await runSave(wired.steps)

    expect(wired.setupState).toHaveBeenCalledTimes(2)
    const [first, second] = wired.setupState.mock.invocationCallOrder
    expect(first).toBeLessThan(wired.prepareCommitSetup.mock.invocationCallOrder[0])
    const claimedAt = writes.mock.invocationCallOrder[0]
    expect(Math.max(...wired.reads.nativeBalance.mock.invocationCallOrder)).toBeLessThan(claimedAt)
    expect(second).toBeGreaterThan(claimedAt)
    expect(second).toBeLessThan(wired.port.sendAccountBatch.mock.invocationCallOrder[0])
    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
  })

  it('ends the first start as already set up where the account holds a setup, with nothing prepared, estimated, sent or wiped', async () => {
    const wired = wireSave(account, script({ setup: 'set-up' }))
    const store = await runSave(wired.steps)

    expect(store.state().stop).toBe('already-set-up')
    expect(armScreenOf(store.state())).toBe('already-set-up')
    expect(isLive(store.state())).toBe(false)
    expect(wired.prepareCommitSetup).not.toHaveBeenCalled()
    expect(wired.reads.estimateGas).not.toHaveBeenCalled()
    expect(wired.reads.nativeBalance).not.toHaveBeenCalled()
    expect(wired.port.sendAccountBatch).not.toHaveBeenCalled()
    expect(wired.saveSetup).not.toHaveBeenCalled()
  })

  it('reads a setup read that throws as never sent, with the retry, and sends nothing', async () => {
    const wired = wireSave(account, script({ setup: 'throws' }))
    const store = await runSave(wired.steps)

    expect(store.state().write.status).toBe('failedNotSent')
    expect(canRetry(store.state().write)).toBe(true)
    expect(mayStillLand(store.state().write)).toBe(false)
    expect(store.state().stop).toBeUndefined()
    expect(wired.prepareCommitSetup).not.toHaveBeenCalled()
    expect(wired.port.sendAccountBatch).not.toHaveBeenCalled()
  })

  /** Each way a run fails with the retry offered, and how the edge that failed answers on the retry. */
  const FAILURES: [string, Partial<SaveScript>, (wired: ReturnType<typeof wireSave>) => void][] = [
    [
      'a setup read that threw',
      { setup: 'throws' },
      (wired) => wired.setupState.mockResolvedValue(setupStateOf(false))
    ],
    [
      'a refusal of the prepare',
      { prepare: 'refuses' },
      (wired) => wired.prepareCommitSetup.mockResolvedValue(wired.prepared)
    ],
    [
      'a gas check that could not read',
      { gas: 'read-fails' },
      (wired) => wired.reads.nativeBalance.mockResolvedValue(10n ** 18n)
    ],
    [
      'a refusal of the port',
      { send: 'window-closed' },
      (wired) => wired.port.sendAccountBatch.mockResolvedValue(TX_HASH)
    ],
    [
      'a reverted receipt',
      { receipt: 'reverted' },
      (wired) => wired.receipts.wait.mockImplementation(async (hash) => landedReceipt(hash))
    ],
    [
      'a replaced transaction',
      { receipt: 'replaced' },
      (wired) => wired.receipts.wait.mockImplementation(async (hash) => landedReceipt(hash))
    ]
  ]

  FAILURES.forEach(([named, overrides, heal]) => {
    it(`after ${named}, a retry reads the setup again and, where the account now holds one, ends as already set up with nothing more sent`, async () => {
      const wired = wireSave(account, script(overrides))
      const store = await runSave(wired.steps)
      expect(canRetry(store.state().write)).toBe(true)
      const prepares = wired.prepareCommitSetup.mock.calls.length
      const sends = wired.port.sendAccountBatch.mock.calls.length
      const estimates = wired.reads.estimateGas.mock.calls.length
      const setupReads = wired.setupState.mock.calls.length
      heal(wired)
      wired.setupState.mockResolvedValue(setupStateOf(true))

      await restart(store, wired)

      expect(wired.setupState).toHaveBeenCalledTimes(setupReads + 1)
      expect(store.state().stop).toBe('already-set-up')
      expect(armScreenOf(store.state())).toBe('already-set-up')
      expect(wired.prepareCommitSetup).toHaveBeenCalledTimes(prepares)
      expect(wired.reads.estimateGas).toHaveBeenCalledTimes(estimates)
      expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(sends)
      expect(wired.confirmSetup).not.toHaveBeenCalled()
      expect(wired.saveSetup).not.toHaveBeenCalled()
    })

    it(`after ${named}, a retry reads the setup again before it prepares and, where none is there, sends once and saves`, async () => {
      const wired = wireSave(account, script(overrides))
      const store = await runSave(wired.steps)
      const sends = wired.port.sendAccountBatch.mock.calls.length
      const setupReads = wired.setupState.mock.calls.length
      heal(wired)

      await restart(store, wired)

      // The retry reads once before it prepares, and once after its claim and before its send.
      expect(wired.setupState).toHaveBeenCalledTimes(setupReads + 2)
      const order = wired.setupState.mock.invocationCallOrder
      const lastPrepare = Math.max(...wired.prepareCommitSetup.mock.invocationCallOrder)
      const lastSend = Math.max(...wired.port.sendAccountBatch.mock.invocationCallOrder)
      expect(order[setupReads]).toBeLessThan(lastPrepare)
      expect(order[setupReads + 1]).toBeGreaterThan(lastPrepare)
      expect(order[setupReads + 1]).toBeLessThan(lastSend)
      expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(sends + 1)
      expect(isSaved(store.state())).toBe(true)
      expect(wired.saveSetup).toHaveBeenCalledTimes(1)
    })
  })

  it("in two tabs, ends the second tab's retry as already set up once the first tab saved, sending nothing more", async () => {
    let onChain = false
    const first = wireSave(account, script())
    const second = wireSave(account, script({ send: 'window-closed' }))
    ;[first, second].forEach((tab) =>
      tab.setupState.mockImplementation(async () => setupStateOf(onChain))
    )
    first.receipts.wait.mockImplementation(async (hash) => {
      onChain = true
      return landedReceipt(hash)
    })

    const secondStore = await runSave(second.steps)
    expect(secondStore.state().write.status).toBe('failedNotSent')
    const firstStore = await runSave(first.steps)
    expect(isSaved(firstStore.state())).toBe(true)
    second.port.sendAccountBatch.mockResolvedValue(TX_HASH)

    await restart(secondStore, second)

    expect(secondStore.state().stop).toBe('already-set-up')
    expect(second.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(second.prepareCommitSetup).toHaveBeenCalledTimes(1)
    expect(first.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(second.saveSetup).not.toHaveBeenCalled()
  })

  it('after a refusal whose operation landed after all, the next arrival ends as already set up and sends nothing', async () => {
    const wired = wireSave(account, script({ send: 'not-a-transaction' }))
    const store = await runSave(wired.steps)
    // Nothing is in flight for the screen to keep, so the next arrival starts a new run.
    expect(isLive(store.state())).toBe(false)
    wired.setupState.mockResolvedValue(setupStateOf(true))
    wired.port.sendAccountBatch.mockResolvedValue(TX_HASH)

    const next = await runSave(wired.steps)

    expect(next.state().stop).toBe('already-set-up')
    expect(wired.prepareCommitSetup).toHaveBeenCalledTimes(1)
    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(wired.saveSetup).not.toHaveBeenCalled()
  })

  it('moves nothing once a run ended as already set up: no start, recheck, check again or reread', async () => {
    const wired = wireSave(account, script({ setup: 'set-up' }))
    const store = await runSave(wired.steps)
    const stopped = store.state()
    wired.setupState.mockResolvedValue(setupStateOf(false))

    await restart(store, wired)
    await recheckGas(store, wired.steps)
    await checkReceiptAgain(store, wired.steps)
    await rereadConfirmation(store, wired.steps)

    expect(store.state()).toBe(stopped)
    expect(wired.setupState).toHaveBeenCalledTimes(1)
    expect(wired.prepareCommitSetup).not.toHaveBeenCalled()
    expect(wired.port.sendAccountBatch).not.toHaveBeenCalled()
  })
})

describe('a refusal whose operation may still land, read again', () => {
  const refusedRun = async () => {
    const wired = wireSave(account, script({ send: 'not-a-transaction' }))
    const store = await runSave(wired.steps)
    expect(mayStillLand(store.state().write)).toBe(true)
    wired.port.sendAccountBatch.mockResolvedValue(TX_HASH)
    return { wired, store }
  }

  it('runs the check with the run save where check again finds the setup, and reads saved with one wipe, nothing prepared or sent again', async () => {
    const { wired, store } = await refusedRun()
    expect((await wired.inFlight.read()).status).toBe('present')
    const setupReads = wired.setupState.mock.calls.length
    wired.setupState.mockResolvedValue(setupStateOf(true))

    await checkSetupAgain(store, wired.steps, { timeoutMs: SHORT_TIMEOUT_MS })

    expect(wired.setupState).toHaveBeenCalledTimes(setupReads + 1)
    expect(wired.confirmSetup).toHaveBeenCalledTimes(1)
    expect(wired.confirmSetup).toHaveBeenCalledWith(wired.draft, wired.prepared)
    expect(isSaved(store.state())).toBe(true)
    expect(armScreenOf(store.state())).toBe('saved')
    expect(store.state().stop).toBeUndefined()
    expect(outlivesScreen(store.state())).toBe(false)
    expect(wired.saveSetup).toHaveBeenCalledTimes(1)
    expect((await wired.inFlight.read()).status).toBe('absent')
    expect(wired.prepareCommitSetup).toHaveBeenCalledTimes(1)
    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
  })

  it('reads disagreed where check again finds a setup the check does not agree with, wipes nothing and releases the stored save', async () => {
    const { wired, store } = await refusedRun()
    wired.setupState.mockResolvedValue(setupStateOf(true))
    wired.confirmSetup.mockResolvedValue(confirmation(true, false))

    await checkSetupAgain(store, wired.steps, { timeoutMs: SHORT_TIMEOUT_MS })

    expect(store.state().after).toEqual({ stage: 'disagreed', check: 'authorization' })
    expect(armScreenOf(store.state())).toBe('disagreed')
    expect(wired.saveSetup).not.toHaveBeenCalled()
    expect((await wired.inFlight.read()).status).toBe('absent')
    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
  })

  it('stays as it was where check again finds no setup, or its read throws, and a later check again still reads', async () => {
    const { wired, store } = await refusedRun()
    const refused = store.state()
    const setupReads = wired.setupState.mock.calls.length

    await checkSetupAgain(store, wired.steps)
    expect(store.state()).toBe(refused)

    wired.setupState.mockRejectedValueOnce(new Error('the node did not answer'))
    await checkSetupAgain(store, wired.steps)
    expect(store.state()).toBe(refused)
    expect(outlivesScreen(store.state())).toBe(true)
    expect(wired.confirmSetup).not.toHaveBeenCalled()
    expect((await wired.inFlight.read()).status).toBe('present')

    wired.setupState.mockResolvedValue(setupStateOf(true))
    await checkSetupAgain(store, wired.steps, { timeoutMs: SHORT_TIMEOUT_MS })
    expect(wired.setupState).toHaveBeenCalledTimes(setupReads + 3)
    expect(isSaved(store.state())).toBe(true)
    expect(wired.confirmSetup).toHaveBeenCalledTimes(1)
    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
  })

  it("runs the check on the arrival's read of a setup, and stays on a read of none", async () => {
    const { store, wired } = await refusedRun()
    const refused = store.state()

    await endWhereSetUp(store, wired.steps, false)
    expect(store.state()).toBe(refused)
    expect(wired.confirmSetup).not.toHaveBeenCalled()

    await endWhereSetUp(store, wired.steps, true, { timeoutMs: SHORT_TIMEOUT_MS })
    expect(isSaved(store.state())).toBe(true)
    expect(wired.confirmSetup).toHaveBeenCalledTimes(1)
    expect(wired.saveSetup).toHaveBeenCalledTimes(1)

    // A second read of the setup moves nothing more.
    await endWhereSetUp(store, wired.steps, true)
    expect(wired.confirmSetup).toHaveBeenCalledTimes(1)
  })

  it('moves no other ended run on a setup read, nor reads the setup for one', async () => {
    const wired = wireSave(account, script({ send: 'window-closed' }))
    const store = await runSave(wired.steps)
    const refused = store.state()
    const setupReads = wired.setupState.mock.calls.length

    await endWhereSetUp(store, wired.steps, true)
    await checkSetupAgain(store, wired.steps)

    expect(store.state()).toBe(refused)
    expect(wired.setupState).toHaveBeenCalledTimes(setupReads)
  })
})

describe("the deposit step's Continue", () => {
  it('reads the setup first and, where another tab saved meanwhile, ends as already set up with no gas check and nothing sent', async () => {
    const wired = wireSave(account, script({ gas: 'deposit' }))
    const store = await runSave(wired.steps)
    expect(store.state().write.status).toBe('needsDeposit')
    const balances = wired.reads.nativeBalance.mock.calls.length
    const estimates = wired.reads.estimateGas.mock.calls.length
    wired.reads.nativeBalance.mockResolvedValue(10n ** 18n)
    wired.setupState.mockResolvedValue(setupStateOf(true))

    await recheckGas(store, wired.steps, { timeoutMs: SHORT_TIMEOUT_MS })

    expect(wired.setupState).toHaveBeenCalledTimes(2)
    expect(store.state().stop).toBe('already-set-up')
    expect(store.state().prepared).toBeUndefined()
    expect(wired.reads.nativeBalance).toHaveBeenCalledTimes(balances)
    expect(wired.reads.estimateGas).toHaveBeenCalledTimes(estimates)
    expect(wired.port.sendAccountBatch).not.toHaveBeenCalled()
    expect(wired.saveSetup).not.toHaveBeenCalled()
  })

  it('reads the setup before the gas check and, where none is there, checks and sends as before', async () => {
    const wired = wireSave(account, script({ gas: 'deposit' }))
    const store = await runSave(wired.steps)
    const balances = wired.reads.nativeBalance.mock.calls.length
    const setupReads = wired.setupState.mock.calls.length
    wired.reads.nativeBalance.mockResolvedValue(10n ** 18n)

    await recheckGas(store, wired.steps, { timeoutMs: SHORT_TIMEOUT_MS })

    // Continue reads once before its gas check, and once after its claim and before its send.
    expect(wired.setupState).toHaveBeenCalledTimes(setupReads + 2)
    const order = wired.setupState.mock.invocationCallOrder
    expect(order[setupReads]).toBeLessThan(
      wired.reads.nativeBalance.mock.invocationCallOrder[balances]
    )
    expect(order[setupReads + 1]).toBeGreaterThan(
      Math.max(...wired.reads.nativeBalance.mock.invocationCallOrder)
    )
    expect(order[setupReads + 1]).toBeLessThan(
      wired.port.sendAccountBatch.mock.invocationCallOrder[0]
    )
    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(isSaved(store.state())).toBe(true)
  })
})

describe('a receipt wait that failed after the batch was sent', () => {
  it('waits once more for the same hash, from the block read before the send, and goes on to the check when the receipt arrives', async () => {
    const wired = wireSave(account, script())
    wired.receipts.wait.mockRejectedValueOnce(nodeError())
    const store = await runSave(wired.steps)

    expect(wired.receipts.wait).toHaveBeenCalledTimes(2)
    expect(wired.receipts.wait.mock.calls[1]).toEqual([TX_HASH, START_BLOCK])
    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(wired.confirmSetup).toHaveBeenCalledTimes(1)
    expect(wired.confirmSetup.mock.invocationCallOrder[0]).toBeGreaterThan(
      wired.receipts.wait.mock.invocationCallOrder[1]
    )
    expect(isSaved(store.state())).toBe(true)
    expect(store.state().stalled).toBeFalsy()
  })

  it('waits once more where the receipt came back with no status', async () => {
    const wired = wireSave(account, script())
    wired.receipts.wait.mockResolvedValueOnce({ hash: TX_HASH, status: null } as never)
    const store = await runSave(wired.steps)

    expect(wired.receipts.wait).toHaveBeenCalledTimes(2)
    expect(isSaved(store.state())).toBe(true)
  })

  it('reads stalled under its hash where the second wait fails too, sends and wipes nothing, and keeps the run live', async () => {
    const wired = wireSave(account, script())
    wired.receipts.wait.mockRejectedValueOnce(nodeError()).mockRejectedValueOnce(nodeError())
    const store = await runSave(wired.steps)
    const { write } = store.state()

    expect(wired.receipts.wait).toHaveBeenCalledTimes(2)
    expect(write.status).toBe('submitting')
    expect(write.status === 'submitting' && write.transactionHash).toBe(TX_HASH)
    expect(store.state().stalled).toBe(true)
    expect(isLive(store.state())).toBe(true)
    expect(armScreenOf(store.state())).toBe('run')
    expect(wired.confirmSetup).not.toHaveBeenCalled()
    expect(wired.saveSetup).not.toHaveBeenCalled()

    // A stalled save offers no new start and no gas check: its batch may still land.
    const stalled = store.state()
    await restart(store, wired)
    await recheckGas(store, wired.steps)
    expect(store.state()).toBe(stalled)
    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
  })

  it('waits again on check again, and goes through the check to saved once the receipt lands', async () => {
    const wired = wireSave(account, script())
    wired.receipts.wait.mockRejectedValueOnce(nodeError()).mockRejectedValueOnce(nodeError())
    const store = await runSave(wired.steps)

    await checkReceiptAgain(store, wired.steps, { timeoutMs: SHORT_TIMEOUT_MS })

    expect(wired.receipts.wait).toHaveBeenCalledTimes(3)
    expect(wired.receipts.wait.mock.calls[2]).toEqual([TX_HASH, START_BLOCK])
    expect(wired.confirmSetup).toHaveBeenCalledTimes(1)
    expect(isSaved(store.state())).toBe(true)
    expect(wired.saveSetup).toHaveBeenCalledTimes(1)
    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(wired.prepareCommitSetup).toHaveBeenCalledTimes(1)
  })

  it('reads stalled again where check again fails, and waits again on the next press', async () => {
    const wired = wireSave(account, script())
    wired.receipts.wait
      .mockRejectedValueOnce(nodeError())
      .mockRejectedValueOnce(nodeError())
      .mockRejectedValueOnce(nodeError())
    const store = await runSave(wired.steps)

    await checkReceiptAgain(store, wired.steps, { timeoutMs: SHORT_TIMEOUT_MS })
    expect(wired.receipts.wait).toHaveBeenCalledTimes(3)
    expect(store.state().stalled).toBe(true)
    expect(wired.confirmSetup).not.toHaveBeenCalled()

    await checkReceiptAgain(store, wired.steps, { timeoutMs: SHORT_TIMEOUT_MS })
    expect(wired.receipts.wait).toHaveBeenCalledTimes(4)
    expect(isSaved(store.state())).toBe(true)
  })

  it('does not read saved where the receipt of check again lands and the check disagrees', async () => {
    const wired = wireSave(account, script({ confirm: 'unauthorized' }))
    wired.receipts.wait.mockRejectedValueOnce(nodeError()).mockRejectedValueOnce(nodeError())
    const store = await runSave(wired.steps)

    await checkReceiptAgain(store, wired.steps, { timeoutMs: SHORT_TIMEOUT_MS })

    expect(store.state().after).toEqual({ stage: 'disagreed', check: 'authorization' })
    expect(isSaved(store.state())).toBe(false)
    expect(wired.saveSetup).not.toHaveBeenCalled()
  })

  const SETTLED: [string, () => Error, 'failedReverted' | 'failedNotSent'][] = [
    ['reverted', () => minedAndReverted(), 'failedReverted'],
    ['replaced', () => replacedTransaction(), 'failedNotSent']
  ]

  SETTLED.forEach(([named, thrown, status]) => {
    it(`reads a ${named} receipt on the second wait as ${named}, with no check and nothing wiped`, async () => {
      const wired = wireSave(account, script())
      wired.receipts.wait.mockRejectedValueOnce(nodeError()).mockRejectedValueOnce(thrown())
      const store = await runSave(wired.steps)

      expect(store.state().write.status).toBe(status)
      expect(store.state().stalled).toBeFalsy()
      expect(wired.confirmSetup).not.toHaveBeenCalled()
      expect(wired.saveSetup).not.toHaveBeenCalled()
    })

    it(`reads a ${named} receipt on check again as ${named}, with no check and nothing wiped`, async () => {
      const wired = wireSave(account, script())
      wired.receipts.wait
        .mockRejectedValueOnce(nodeError())
        .mockRejectedValueOnce(nodeError())
        .mockRejectedValueOnce(thrown())
      const store = await runSave(wired.steps)

      await checkReceiptAgain(store, wired.steps, { timeoutMs: SHORT_TIMEOUT_MS })

      expect(store.state().write.status).toBe(status)
      expect(wired.confirmSetup).not.toHaveBeenCalled()
      expect(wired.saveSetup).not.toHaveBeenCalled()
    })
  })

  it('does nothing on check again where no wait failed', async () => {
    const wired = wireSave(account, script())
    const store = await runSave(wired.steps)
    const saved = store.state()

    await checkReceiptAgain(store, wired.steps)

    expect(store.state()).toBe(saved)
    expect(wired.receipts.wait).toHaveBeenCalledTimes(1)
  })
})

describe('the time limit of one more receipt wait', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  /** A receipt wait the test answers by hand, after its first wait failed. */
  const waitHeldAfterAFailure = (wired: ReturnType<typeof wireSave>) => {
    let answer: (hash: typeof TX_HASH) => void = () => {}
    const promise = new Promise<ReturnType<typeof landedReceipt>>((resolve) => {
      answer = (hash) => resolve(landedReceipt(hash))
    })
    wired.receipts.wait.mockRejectedValueOnce(nodeError()).mockImplementationOnce(() => promise)
    return { land: () => answer(TX_HASH) }
  }

  /** A second wait the test answers by hand, for check again. */
  const nextWaitHeld = (wired: ReturnType<typeof wireSave>) => {
    let answer: () => void = () => {}
    const promise = new Promise<ReturnType<typeof landedReceipt>>((resolve) => {
      answer = () => resolve(landedReceipt(TX_HASH))
    })
    wired.receipts.wait.mockImplementationOnce(() => promise)
    return { land: () => answer() }
  }

  const startStalled = async (wired: ReturnType<typeof wireSave>) => {
    const store = createArmStore()
    const running = startSave(store, wired.steps, { timeoutMs: SHORT_TIMEOUT_MS })
    await advanceTimers(RECEIPT_WAIT_MS - 1)
    expect(store.state().stalled).toBeFalsy()
    expect(store.state().write.status).toBe('submitting')
    await advanceTimers(1)
    await running
    return store
  }

  it('reads stalled under its hash once one more wait runs past its limit, with nothing checked or wiped', async () => {
    const wired = wireSave(account, script())
    waitHeldAfterAFailure(wired)
    const store = await startStalled(wired)
    const { write } = store.state()

    expect(write.status === 'submitting' && write.transactionHash).toBe(TX_HASH)
    expect(store.state().stalled).toBe(true)
    expect(isLive(store.state())).toBe(true)
    expect(armScreenOf(store.state())).toBe('run')
    expect(wired.confirmSetup).not.toHaveBeenCalled()
    expect(wired.saveSetup).not.toHaveBeenCalled()
  })

  it('takes a receipt that arrives after the limit once, and goes through the check to saved', async () => {
    const wired = wireSave(account, script())
    const late = waitHeldAfterAFailure(wired)
    const store = await startStalled(wired)

    late.land()
    await advanceTimers(SHORT_TIMEOUT_MS)

    expect(isSaved(store.state())).toBe(true)
    expect(store.state().stalled).toBe(false)
    expect(wired.confirmSetup).toHaveBeenCalledTimes(1)
    expect(wired.saveSetup).toHaveBeenCalledTimes(1)
    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
  })

  it('takes up the wait still open on the hash on check again, opens no other, and reads stalled again past its limit', async () => {
    const wired = wireSave(account, script())
    waitHeldAfterAFailure(wired)
    const store = await startStalled(wired)
    nextWaitHeld(wired)

    const checking = checkReceiptAgain(store, wired.steps, { timeoutMs: SHORT_TIMEOUT_MS })
    expect(store.state().stalled).toBe(false)
    await advanceTimers(RECEIPT_WAIT_MS - 1)
    expect(store.state().stalled).toBe(false)
    await advanceTimers(1)
    await checking

    expect(wired.receipts.wait).toHaveBeenCalledTimes(2)
    expect(store.state().stalled).toBe(true)
    expect(wired.confirmSetup).not.toHaveBeenCalled()
  })

  it('opens one wait for two presses of check again, and checks and wipes once when it lands', async () => {
    const wired = wireSave(account, script())
    const late = waitHeldAfterAFailure(wired)
    const store = await startStalled(wired)

    const first = checkReceiptAgain(store, wired.steps, { timeoutMs: SHORT_TIMEOUT_MS })
    await advanceTimers(RECEIPT_WAIT_MS)
    await first
    expect(store.state().stalled).toBe(true)
    const second = checkReceiptAgain(store, wired.steps, { timeoutMs: SHORT_TIMEOUT_MS })
    late.land()
    await advanceTimers(SHORT_TIMEOUT_MS)
    await second

    expect(wired.receipts.wait).toHaveBeenCalledTimes(2)
    expect(isSaved(store.state())).toBe(true)
    expect(wired.confirmSetup).toHaveBeenCalledTimes(1)
    expect(wired.saveSetup).toHaveBeenCalledTimes(1)
  })

  it('checks and wipes once where the late receipt and the receipt of check again arrive together', async () => {
    const wired = wireSave(account, script())
    const late = waitHeldAfterAFailure(wired)
    const store = await startStalled(wired)
    const again = nextWaitHeld(wired)

    const checking = checkReceiptAgain(store, wired.steps, { timeoutMs: SHORT_TIMEOUT_MS })
    late.land()
    again.land()
    await advanceTimers(SHORT_TIMEOUT_MS)
    await checking

    expect(isSaved(store.state())).toBe(true)
    expect(wired.confirmSetup).toHaveBeenCalledTimes(1)
    expect(wired.saveSetup).toHaveBeenCalledTimes(1)
    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
  })
})

describe('the time limit of the first receipt wait', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  /** A promise's settlement as a flag the test reads between steps of the clock. */
  const track = (promise: Promise<unknown>) => {
    const seen = { settled: false }
    promise.then(
      () => {
        seen.settled = true
      },
      () => {
        seen.settled = true
      }
    )
    return seen
  }

  /** A receipt wait the test lands or fails by hand. */
  const waitHeld = (wired: ReturnType<typeof wireSave>) => {
    let land: () => void = () => {}
    let fail: () => void = () => {}
    const promise = new Promise<ReturnType<typeof landedReceipt>>((resolve, reject) => {
      land = () => resolve(landedReceipt(TX_HASH))
      fail = () => reject(nodeError())
    })
    wired.receipts.wait.mockImplementationOnce(() => promise)
    return { land, fail }
  }

  /** Starts the save with a first receipt wait that does not settle, and runs the clock to the hash. */
  const startWaiting = async (wired: ReturnType<typeof wireSave>) => {
    const first = waitHeld(wired)
    const store = createArmStore()
    const running = track(startSave(store, wired.steps, { timeoutMs: SHORT_TIMEOUT_MS }))
    await advanceTimers(0)
    const { write } = store.state()
    expect(write.status === 'submitting' && write.transactionHash).toBe(TX_HASH)
    return { store, first, running }
  }

  it('reads stalled under its hash once the first wait runs its limit past the hash, with nothing checked, wiped or sent again', async () => {
    const wired = wireSave(account, script())
    const { store, running } = await startWaiting(wired)

    await advanceTimers(RECEIPT_WAIT_MS - 1)
    expect(store.state().stalled).toBeFalsy()
    await advanceTimers(1)

    const { write } = store.state()
    expect(write.status === 'submitting' && write.transactionHash).toBe(TX_HASH)
    expect(store.state().stalled).toBe(true)
    expect(isLive(store.state())).toBe(true)
    expect(armScreenOf(store.state())).toBe('run')
    expect(running.settled).toBe(false)
    expect(wired.receipts.wait).toHaveBeenCalledTimes(1)
    expect(wired.confirmSetup).not.toHaveBeenCalled()
    expect(wired.saveSetup).not.toHaveBeenCalled()
    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
  })

  it('counts the limit from the hash, so a sign window open longer than the limit stalls nothing', async () => {
    const wired = wireSave(account, script())
    waitHeld(wired)
    let sign: (hash: typeof TX_HASH) => void = () => {}
    wired.port.sendAccountBatch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          sign = resolve
        })
    )
    const store = createArmStore()
    const running = track(startSave(store, wired.steps, { timeoutMs: SHORT_TIMEOUT_MS }))

    await advanceTimers(2 * RECEIPT_WAIT_MS)
    expect(running.settled).toBe(false)
    expect(store.state().write.status).toBe('submitting')
    expect(store.state().stalled).toBeFalsy()

    sign(TX_HASH)
    await advanceTimers(RECEIPT_WAIT_MS - 1)
    expect(store.state().stalled).toBeFalsy()
    await advanceTimers(1)
    expect(store.state().stalled).toBe(true)
  })

  it('takes a receipt the first wait brings after its limit once, and goes through the check to saved', async () => {
    const wired = wireSave(account, script())
    const { store, first, running } = await startWaiting(wired)
    await advanceTimers(RECEIPT_WAIT_MS)
    expect(store.state().stalled).toBe(true)

    first.land()
    await advanceTimers(SHORT_TIMEOUT_MS)

    expect(running.settled).toBe(true)
    expect(isSaved(store.state())).toBe(true)
    expect(store.state().stalled).toBe(false)
    expect(wired.receipts.wait).toHaveBeenCalledTimes(1)
    expect(wired.confirmSetup).toHaveBeenCalledTimes(1)
    expect(wired.saveSetup).toHaveBeenCalledTimes(1)
    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
  })

  it('starts no wait by itself where the first wait fails after its limit, and check again is the next wait', async () => {
    const wired = wireSave(account, script())
    const { store, first, running } = await startWaiting(wired)
    await advanceTimers(RECEIPT_WAIT_MS)

    first.fail()
    await advanceTimers(2 * RECEIPT_WAIT_MS)

    expect(running.settled).toBe(true)
    expect(wired.receipts.wait).toHaveBeenCalledTimes(1)
    expect(store.state().stalled).toBe(true)
    expect(store.state().write.status).toBe('submitting')
    expect(wired.confirmSetup).not.toHaveBeenCalled()

    const checking = checkReceiptAgain(store, wired.steps, { timeoutMs: SHORT_TIMEOUT_MS })
    await advanceTimers(SHORT_TIMEOUT_MS)
    await checking

    expect(wired.receipts.wait).toHaveBeenCalledTimes(2)
    expect(wired.receipts.wait.mock.calls[1]).toEqual([TX_HASH, START_BLOCK])
    expect(isSaved(store.state())).toBe(true)
    expect(wired.saveSetup).toHaveBeenCalledTimes(1)
    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
  })

  it('ends the first limit with the first wait, so the one more wait after a failure in time gets its own full limit', async () => {
    const wired = wireSave(account, script())
    const { store, first } = await startWaiting(wired)
    waitHeld(wired)
    const half = RECEIPT_WAIT_MS / 2

    await advanceTimers(half)
    first.fail()
    await advanceTimers(half)
    expect(wired.receipts.wait).toHaveBeenCalledTimes(2)
    expect(store.state().stalled).toBeFalsy()

    await advanceTimers(half - 1)
    expect(store.state().stalled).toBeFalsy()
    await advanceTimers(1)
    expect(store.state().stalled).toBe(true)
    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
  })

  it('takes up the first wait on check again while it still runs, and checks and wipes once when it brings the receipt', async () => {
    const wired = wireSave(account, script())
    const { store, first, running } = await startWaiting(wired)
    await advanceTimers(RECEIPT_WAIT_MS)

    const checking = checkReceiptAgain(store, wired.steps, { timeoutMs: SHORT_TIMEOUT_MS })
    expect(store.state().stalled).toBe(false)
    await advanceTimers(0)
    expect(wired.receipts.wait).toHaveBeenCalledTimes(1)
    first.land()
    await advanceTimers(SHORT_TIMEOUT_MS)
    await checking

    expect(running.settled).toBe(true)
    expect(isSaved(store.state())).toBe(true)
    expect(wired.receipts.wait).toHaveBeenCalledTimes(1)
    expect(wired.confirmSetup).toHaveBeenCalledTimes(1)
    expect(wired.saveSetup).toHaveBeenCalledTimes(1)
    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
  })
})

describe('which ended runs the screen keeps for the next arrival', () => {
  const ENDINGS: [string, Partial<SaveScript>, boolean][] = [
    ['a refusal whose operation may still land', { send: 'not-a-transaction' }, true],
    ['a landed save whose check did not answer', { confirm: 'throws' }, true],
    ['saved', {}, false],
    ['already set up', { setup: 'set-up' }, false],
    ['disagreed', { confirm: 'unauthorized' }, false],
    ['the deposit step', { gas: 'deposit' }, false],
    ['never sent', { send: 'window-closed' }, false]
  ]

  ENDINGS.forEach(([named, overrides, kept]) =>
    it(`${kept ? 'keeps' : 'drops'} a run that ended ${named}`, async () => {
      const wired = wireSave(account, script(overrides))
      const store = await runSave(wired.steps)

      expect(isLive(store.state())).toBe(false)
      expect(outlivesScreen(store.state())).toBe(kept)
    })
  )
})

describe("the sign screen's estimation before a save never sent", () => {
  const SHORT_READINGS: [string, ReturnType<typeof feeReading>][] = [
    ['an error', feeReading({ error: true })],
    ['no available option', feeReading({ available: false })]
  ]

  SHORT_READINGS.forEach(([named, estimation]) => {
    it(`runs the gas check again after a reading with ${named}, and shows the deposit step in a new run that read the setup`, async () => {
      const wired = wireSave(account, script({ send: 'refused', estimation }))
      wired.reads.nativeBalance.mockResolvedValueOnce(10n ** 18n).mockResolvedValueOnce(0n)
      const store = await runSave(wired.steps)
      const { write } = store.state()

      expect(write.status).toBe('needsDeposit')
      expect(write.run).toBe(2)
      if (write.status !== 'needsDeposit') {
        return
      }
      expect(write.step.key.toLowerCase()).toBe(KEY.addr.toLowerCase())
      expect(wired.reads.nativeBalance).toHaveBeenCalledTimes(2)
      // The first run's read before its prepare and after its claim, then the new run's own.
      expect(wired.setupState).toHaveBeenCalledTimes(3)
      expect(wired.setupState.mock.invocationCallOrder[2]).toBeGreaterThan(
        wired.port.sendAccountBatch.mock.invocationCallOrder[0]
      )
      expect(wired.prepareCommitSetup).toHaveBeenCalledTimes(1)
      expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)

      // Continue sends once the key holds enough.
      wired.port.sendAccountBatch.mockResolvedValue(TX_HASH)
      await recheckGas(store, wired.steps, { timeoutMs: SHORT_TIMEOUT_MS })
      expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(2)
      expect(isSaved(store.state())).toBe(true)
    })
  })

  it('keeps the not-sent state with the retry, and sends nothing by itself, where the gas check again reads enough', async () => {
    const wired = wireSave(
      account,
      script({ send: 'refused', estimation: feeReading({ error: true }) })
    )
    const store = await runSave(wired.steps)
    const { write } = store.state()

    expect(write.status).toBe('failedNotSent')
    expect(write.run).toBe(1)
    expect(canRetry(write)).toBe(true)
    expect(wired.reads.nativeBalance).toHaveBeenCalledTimes(2)
    // No new run started: only the reads before the prepare and after the claim.
    expect(wired.setupState).toHaveBeenCalledTimes(2)
    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
  })

  it('keeps the not-sent state where the gas check again throws', async () => {
    const wired = wireSave(
      account,
      script({ send: 'refused', estimation: feeReading({ error: true }) })
    )
    wired.reads.nativeBalance
      .mockResolvedValueOnce(10n ** 18n)
      .mockRejectedValueOnce(new Error('node down'))
    const store = await runSave(wired.steps)

    expect(store.state().write.status).toBe('failedNotSent')
    expect(store.state().write.run).toBe(1)
    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
  })

  it('ends as already set up, with no deposit step, where the gas check again is short and the account now holds a setup', async () => {
    const wired = wireSave(
      account,
      script({ send: 'refused', estimation: feeReading({ error: true }) })
    )
    wired.reads.nativeBalance.mockResolvedValueOnce(10n ** 18n).mockResolvedValueOnce(0n)
    // No setup before the prepare nor after the claim; the new run's read finds one.
    wired.setupState
      .mockResolvedValueOnce(setupStateOf(false))
      .mockResolvedValueOnce(setupStateOf(false))
      .mockResolvedValueOnce(setupStateOf(true))
    const store = await runSave(wired.steps)

    expect(store.state().stop).toBe('already-set-up')
    expect(store.state().write.status).not.toBe('needsDeposit')
    expect(wired.setupState).toHaveBeenCalledTimes(3)
    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
  })

  it('runs no gas check again after a reading that was fine', async () => {
    const wired = wireSave(account, script({ send: 'refused', estimation: feeReading() }))
    const store = await runSave(wired.steps)

    expect(store.state().write.status).toBe('failedNotSent')
    expect(canRetry(store.state().write)).toBe(true)
    expect(wired.reads.nativeBalance).toHaveBeenCalledTimes(1)
  })

  it('runs no gas check again after a short reading where the operation may still land', async () => {
    const wired = wireSave(
      account,
      script({ send: 'not-a-transaction', estimation: feeReading({ error: true }) })
    )
    const store = await runSave(wired.steps)

    expect(mayStillLand(store.state().write)).toBe(true)
    expect(wired.reads.nativeBalance).toHaveBeenCalledTimes(1)
  })

  it('runs no gas check again after a short reading where the sent transaction was replaced', async () => {
    const wired = wireSave(
      account,
      script({ receipt: 'replaced', estimation: feeReading({ error: true }) })
    )
    const store = await runSave(wired.steps)
    const { write } = store.state()

    expect(write.status === 'failedNotSent' && write.replaced).toBe('replaced')
    expect(wired.reads.nativeBalance).toHaveBeenCalledTimes(1)
  })

  it("does not carry a run's short reading into the next run", async () => {
    const wired = wireSave(
      account,
      script({ send: 'refused', estimation: feeReading({ error: true }) })
    )
    const store = await runSave(wired.steps)
    expect(wired.reads.nativeBalance).toHaveBeenCalledTimes(2)
    wired.port.sendAccountBatch.mockRejectedValue(accountBatchRefusal('refused', wired.account))

    await restart(store, wired)

    expect(store.state().write.status).toBe('failedNotSent')
    expect(store.state().write.run).toBe(2)
    expect(wired.reads.nativeBalance).toHaveBeenCalledTimes(3)
  })
})
