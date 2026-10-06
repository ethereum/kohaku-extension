/**
 * The send drive feeds the write machine the answers of the client's send
 * port and receipt wait: it reads the chain's block before the send, then the
 * hash as `sent` with that block, the receipt as `receipt`, and a refusal or a
 * wait error as `error`, as it was thrown. The machine and the classification
 * decide every reading, so each test runs the real machine from the
 * submitting state and reads the state it ends in.
 *
 * The account batch drive takes the same path over the port's batch send, so
 * the sequence of events is read for both drives.
 *
 * The port and the wait are the fakes of harness.ts. The refusals are the
 * client's own, and the wait errors are ethers' shapes the harness builds.
 */
import type { Hex } from '@web/modules/social-recovery/sdk-interfaces'
import {
  accountBatchRefusal,
  SEND_REFUSAL_REASONS,
  sendRefusal,
  UNKNOWN_TRANSACTION_MS,
  type ProviderTransactionReceipt
} from '@web/modules/social-recovery/shared/client'

import {
  ACCOUNT,
  advanceTimersAsync,
  BLOCK_EVERY_MS,
  deferred,
  driveAccountBatch,
  driveSend,
  drivenMachine,
  enoughCheck,
  FakeReceiptWait,
  fakeReceiptWait,
  fakeSendPort,
  GWEI,
  ACTION,
  KEY,
  MANAGER,
  minedAndReverted,
  ownerTransaction,
  providerReceipt,
  readingOf,
  receiptWaitNeverKnowing,
  REPLACEMENT_HASH,
  replacedBy,
  SAVE,
  START_BLOCK,
  submittingFor,
  TX_HASH,
  userRejected,
  waitTimedOut,
  WriteKind,
  writeReducer
} from '@web/modules/social-recovery/shared/writes/__tests__/harness'

const OTHER_HASH: Hex = `0x${'d'.repeat(64)}`
const REQUEST_ID = 'social-recovery-sender:from-the-caller'

/** The error an event or a failed state carries, to compare by identity. */
const errorOf = (value: object): unknown => (value as { error?: unknown }).error

/** Drives one send of `write` from its submitting state, with the port and the receipt wait given. */
const drive = async (
  write: WriteKind,
  port: ReturnType<typeof fakeSendPort>,
  receipts: FakeReceiptWait
) => {
  const machine = drivenMachine(submittingFor(write))
  const run = machine.state().run
  const transaction = ownerTransaction(write)
  await driveSend({ dispatch: machine.dispatch, run, port, receipts, key: KEY, transaction })
  return { machine, run, transaction }
}

/** Hears the sign screen's estimation for the account's batch. */
const LISTENER = () => undefined

/**
 * Each drive over the one sequence of events: a key's own transaction, and
 * the batch an account runs on itself. Each names what it asks the port for
 * and the refusal the port gives it.
 */
const DRIVES = [
  {
    title: "a key's own transaction",
    run: (base: Omit<Parameters<typeof driveSend>[0], 'key' | 'transaction'>) =>
      driveSend({ ...base, key: KEY, transaction: ownerTransaction('save') }),
    expectAsked: (port: ReturnType<typeof fakeSendPort>) => {
      expect(port.send).toHaveBeenCalledTimes(1)
      expect(port.send).toHaveBeenCalledWith(KEY, ownerTransaction('save'))
      expect(port.sendAccountBatch).not.toHaveBeenCalled()
    },
    refusal: () => sendRefusal('refused', KEY)
  },
  {
    title: "an account's batch",
    run: (base: Omit<Parameters<typeof driveSend>[0], 'key' | 'transaction'>) =>
      driveAccountBatch({
        ...base,
        account: ACCOUNT,
        calls: SAVE.calls,
        onEstimation: LISTENER,
        requestId: REQUEST_ID
      }),
    expectAsked: (port: ReturnType<typeof fakeSendPort>) => {
      expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)
      expect(port.sendAccountBatch).toHaveBeenCalledWith(
        ACCOUNT,
        SAVE.calls,
        LISTENER,
        undefined,
        REQUEST_ID
      )
      expect(port.send).not.toHaveBeenCalled()
    },
    refusal: () => accountBatchRefusal('refused', ACCOUNT)
  }
]

DRIVES.forEach(({ title, run: driveOnce, expectAsked, refusal }) =>
  describe(`the drive of ${title}`, () => {
    /** Drives it once from the submitting state of a save. */
    const driven = async (port: ReturnType<typeof fakeSendPort>, receipts: FakeReceiptWait) => {
      const machine = drivenMachine(submittingFor('save'))
      const { run } = machine.state()
      await driveOnce({ dispatch: machine.dispatch, run, port, receipts })
      return { machine, run }
    }

    it('reads the block, asks the port once, announces the hash with that block, then lands on its receipt', async () => {
      const order: string[] = []
      const port = fakeSendPort({ value: TX_HASH })
      const answer = async () => {
        order.push('send')
        return TX_HASH
      }
      port.send.mockImplementation(answer)
      port.sendAccountBatch.mockImplementation(answer)
      const receipts = fakeReceiptWait({ value: providerReceipt(TX_HASH, 1) })
      receipts.blockNumber.mockImplementation(async () => {
        order.push('blockNumber')
        return START_BLOCK
      })
      const { machine, run } = await driven(port, receipts)
      expectAsked(port)
      expect(order).toEqual(['blockNumber', 'send'])
      expect(receipts.wait).toHaveBeenCalledWith(TX_HASH, START_BLOCK)
      expect(machine.events.map((event) => event.type)).toEqual(['sent', 'receipt'])
      expect(machine.events[0]).toEqual({
        type: 'sent',
        run,
        transactionHash: TX_HASH,
        startBlock: START_BLOCK
      })
      expect(machine.state()).toMatchObject({ status: 'landed', transactionHash: TX_HASH, run })
    })

    it('reads a block read that failed as not sent, and asks the port for nothing', async () => {
      const failure = new Error('The node is not reachable.')
      const port = fakeSendPort({ value: TX_HASH })
      const receipts = fakeReceiptWait({ value: providerReceipt(TX_HASH, 1) }, { error: failure })
      const { machine, run } = await driven(port, receipts)
      expect(port.send).not.toHaveBeenCalled()
      expect(port.sendAccountBatch).not.toHaveBeenCalled()
      expect(machine.events).toEqual([{ type: 'error', run, error: failure }])
      expect(readingOf(machine.state())).toBe('notSent')
    })

    it("reads the port's refusal before any hash as not sent, with the refusal as its error", async () => {
      const refused = refusal()
      const receipts = fakeReceiptWait({ value: providerReceipt(TX_HASH, 1) })
      const { machine, run } = await driven(fakeSendPort({ error: refused }), receipts)
      expect(receipts.wait).not.toHaveBeenCalled()
      expect(machine.events).toEqual([{ type: 'error', run, error: refused }])
      expect(errorOf(machine.events[0])).toBe(refused)
      expect(machine.state()).toMatchObject({ status: 'failedNotSent', run })
    })

    it('hands a wait error after the hash on with the hash', async () => {
      const reverted = minedAndReverted(TX_HASH)
      const { machine, run } = await driven(
        fakeSendPort({ value: TX_HASH }),
        fakeReceiptWait({ error: reverted })
      )
      expect(machine.events).toEqual([
        { type: 'sent', run, transactionHash: TX_HASH, startBlock: START_BLOCK },
        { type: 'error', run, error: reverted, transactionHash: TX_HASH }
      ])
      expect(errorOf(machine.events[1])).toBe(reverted)
      expect(machine.state()).toMatchObject({ status: 'failedReverted', transactionHash: TX_HASH })
    })
  })
)

describe("the recovery kit's mark on an account's batch", () => {
  const MARK = { manager: MANAGER, auditedActions: [ACTION] }

  it("hands the mark and the caller's request id to the port with the batch, and lands as an unmarked batch does", async () => {
    const port = fakeSendPort({ value: TX_HASH })
    const machine = drivenMachine(submittingFor('save'))
    const { run } = machine.state()
    await driveAccountBatch({
      dispatch: machine.dispatch,
      run,
      port,
      receipts: fakeReceiptWait({ value: providerReceipt(TX_HASH, 1) }),
      account: ACCOUNT,
      calls: SAVE.calls,
      onEstimation: LISTENER,
      recoveryKit: MARK,
      requestId: REQUEST_ID
    })
    expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(port.sendAccountBatch).toHaveBeenCalledWith(
      ACCOUNT,
      SAVE.calls,
      LISTENER,
      MARK,
      REQUEST_ID
    )
    expect(port.send).not.toHaveBeenCalled()
    expect(machine.state()).toMatchObject({ status: 'landed', transactionHash: TX_HASH, run })
  })

  it('hands the mark with no listener and no request id, leaving the port to make the id', async () => {
    const port = fakeSendPort({ value: TX_HASH })
    const machine = drivenMachine(submittingFor('save'))
    await driveAccountBatch({
      dispatch: machine.dispatch,
      run: machine.state().run,
      port,
      receipts: fakeReceiptWait({ value: providerReceipt(TX_HASH, 1) }),
      account: ACCOUNT,
      calls: SAVE.calls,
      recoveryKit: MARK
    })
    expect(port.sendAccountBatch).toHaveBeenCalledWith(
      ACCOUNT,
      SAVE.calls,
      undefined,
      MARK,
      undefined
    )
  })
})

describe('a send the wallet broadcast', () => {
  it('sends the transaction from the key given, announces its hash, then lands on its receipt', async () => {
    const port = fakeSendPort({ value: TX_HASH })
    const receipt = providerReceipt(TX_HASH, 1, { gasUsed: 51_234n, gasPrice: 2n * GWEI })
    const receipts = fakeReceiptWait({ value: receipt })
    const { machine, run, transaction } = await drive('save', port, receipts)

    expect(port.send).toHaveBeenCalledTimes(1)
    expect(port.send).toHaveBeenCalledWith(KEY, transaction)
    expect(receipts.wait).toHaveBeenCalledTimes(1)
    expect(receipts.wait).toHaveBeenCalledWith(TX_HASH, START_BLOCK)
    expect(machine.events).toEqual([
      { type: 'sent', run, transactionHash: TX_HASH, startBlock: START_BLOCK },
      {
        type: 'receipt',
        run,
        receipt: {
          transactionHash: TX_HASH,
          status: 1,
          blockNumber: 7_000_001,
          gasUsed: 51_234n,
          effectiveGasPrice: 2n * GWEI
        }
      }
    ])
    expect(machine.state()).toMatchObject({ status: 'landed', transactionHash: TX_HASH, run })
  })

  it('waits in submitting under the hash and its start block until the receipt comes', async () => {
    const receiptLater = deferred<ProviderTransactionReceipt>()
    const machine = drivenMachine(submittingFor('cancel'))
    const { run } = machine.state()
    const driving = driveSend({
      dispatch: machine.dispatch,
      run,
      port: fakeSendPort({ value: TX_HASH }),
      receipts: fakeReceiptWait({ pending: receiptLater.promise }),
      key: KEY,
      transaction: ownerTransaction('cancel')
    })
    await new Promise<void>((settle) => {
      setImmediate(settle)
    })
    expect(machine.state()).toEqual({
      status: 'submitting',
      write: 'cancel',
      transactionHash: TX_HASH,
      sentHashes: [TX_HASH],
      startBlock: START_BLOCK,
      run
    })

    receiptLater.resolve(providerReceipt(TX_HASH, 1))
    await driving
    expect(readingOf(machine.state())).toBe('landed')
  })

  it('reads a receipt with status zero as reverted, under the hash', async () => {
    const { machine } = await drive(
      'edit',
      fakeSendPort({ value: TX_HASH }),
      fakeReceiptWait({ value: providerReceipt(TX_HASH, 0, { gasUsed: 10n, gasPrice: GWEI }) })
    )
    expect(machine.state()).toMatchObject({
      status: 'failedReverted',
      transactionHash: TX_HASH,
      gasSpent: 10n * GWEI
    })
  })
})

describe('the block the receipt wait scans from', () => {
  it("reads the chain's block before it asks the port to send, and waits for the receipt from that block", async () => {
    const order: string[] = []
    const port = fakeSendPort({ value: TX_HASH })
    port.send.mockImplementation(async () => {
      order.push('send')
      return TX_HASH
    })
    const receipts = fakeReceiptWait({ value: providerReceipt(TX_HASH, 1) }, { value: 6_999_990 })
    receipts.blockNumber.mockImplementation(async () => {
      order.push('blockNumber')
      return 6_999_990
    })
    const { machine, run } = await drive('save', port, receipts)
    expect(order).toEqual(['blockNumber', 'send'])
    expect(receipts.wait).toHaveBeenCalledWith(TX_HASH, 6_999_990)
    expect(machine.events[0]).toEqual({
      type: 'sent',
      run,
      transactionHash: TX_HASH,
      startBlock: 6_999_990
    })
  })

  it('reads a block read that failed as failed, not sent, and asks the port for nothing', async () => {
    const failure = new Error('The node is not reachable.')
    const port = fakeSendPort({ value: TX_HASH })
    const receipts = fakeReceiptWait({ value: providerReceipt(TX_HASH, 1) }, { error: failure })
    const { machine, run } = await drive('save', port, receipts)
    expect(port.send).not.toHaveBeenCalled()
    expect(receipts.wait).not.toHaveBeenCalled()
    expect(machine.events).toEqual([{ type: 'error', run, error: failure }])
    expect(readingOf(machine.state())).toBe('notSent')
  })

  it("keeps the run's first start block when the same call goes out again under a new hash", async () => {
    const machine = drivenMachine(submittingFor('save'))
    const { run } = machine.state()
    const send = (hash: Hex, block: number) =>
      driveSend({
        dispatch: machine.dispatch,
        run,
        port: fakeSendPort({ value: hash }),
        receipts: fakeReceiptWait(
          { pending: deferred<ProviderTransactionReceipt>().promise },
          { value: block }
        ),
        key: KEY,
        transaction: ownerTransaction('save')
      })
    send(TX_HASH, 6_999_990).catch(() => undefined)
    await new Promise<void>((settle) => {
      setImmediate(settle)
    })
    send(REPLACEMENT_HASH, 7_000_020).catch(() => undefined)
    await new Promise<void>((settle) => {
      setImmediate(settle)
    })
    expect(machine.state()).toMatchObject({
      status: 'submitting',
      transactionHash: REPLACEMENT_HASH,
      sentHashes: [TX_HASH, REPLACEMENT_HASH],
      startBlock: 6_999_990
    })
  })

  it('keeps the start block through a wait error that names a new hash', async () => {
    const { machine } = await drive(
      'save',
      fakeSendPort({ value: TX_HASH }),
      fakeReceiptWait({ error: waitTimedOut(OTHER_HASH) })
    )
    expect(machine.state()).toMatchObject({
      status: 'submitting',
      transactionHash: OTHER_HASH,
      startBlock: START_BLOCK
    })
  })
})

describe('a send the wallet refused', () => {
  SEND_REFUSAL_REASONS.forEach((reason) =>
    it(`reads the port's ${reason} refusal as failed, not sent, with the refusal as its error, and waits for no receipt`, async () => {
      const refusal = sendRefusal(reason, KEY)
      const receipts = fakeReceiptWait({ value: providerReceipt(TX_HASH, 1) })
      const { machine, run } = await drive('save', fakeSendPort({ error: refusal }), receipts)

      expect(receipts.wait).not.toHaveBeenCalled()
      expect(machine.events).toEqual([{ type: 'error', run, error: refusal }])
      expect(errorOf(machine.events[0])).toBe(refusal)
      expect(readingOf(machine.state())).toBe('notSent')
      expect(machine.state()).toMatchObject({ status: 'failedNotSent', run })
      expect(machine.state()).not.toHaveProperty('transactionHash')
      expect(errorOf(machine.state())).toBe(refusal)
    })
  )

  it('reads a rejection the wallet threw before any hash as failed, not sent', async () => {
    const rejection = userRejected()
    const { machine } = await drive(
      'cancel',
      fakeSendPort({ error: rejection }),
      fakeReceiptWait({ value: providerReceipt(TX_HASH, 1) })
    )
    expect(readingOf(machine.state())).toBe('notSent')
    expect(errorOf(machine.state())).toBe(rejection)
  })

  it('settles its own promise either way, so a consumer that does not await it sees no rejection', async () => {
    const machine = drivenMachine(submittingFor('save'))
    await expect(
      driveSend({
        dispatch: machine.dispatch,
        run: machine.state().run,
        port: fakeSendPort({ error: sendRefusal('refused', KEY) }),
        receipts: fakeReceiptWait({ value: providerReceipt(TX_HASH, 1) }),
        key: KEY,
        transaction: ownerTransaction('save')
      })
    ).resolves.toBeUndefined()
    await expect(
      driveSend({
        dispatch: machine.dispatch,
        run: machine.state().run,
        port: fakeSendPort({ value: TX_HASH }),
        receipts: fakeReceiptWait({ error: minedAndReverted(TX_HASH) }),
        key: KEY,
        transaction: ownerTransaction('save')
      })
    ).resolves.toBeUndefined()
  })
})

describe('an error of the receipt wait', () => {
  it("reads ethers' CALL_EXCEPTION as reverted under the hash, and hands the error on as ethers threw it", async () => {
    const reverted = minedAndReverted(TX_HASH)
    const { machine, run } = await drive(
      'save',
      fakeSendPort({ value: TX_HASH }),
      fakeReceiptWait({ error: reverted })
    )
    expect(machine.events).toEqual([
      { type: 'sent', run, transactionHash: TX_HASH, startBlock: START_BLOCK },
      { type: 'error', run, error: reverted, transactionHash: TX_HASH }
    ])
    expect(errorOf(machine.events[1])).toBe(reverted)
    expect(readingOf(machine.state())).toBe('reverted')
    expect(machine.state()).toMatchObject({ status: 'failedReverted', transactionHash: TX_HASH })
  })

  const REPLACED: ('cancelled' | 'replaced')[] = ['cancelled', 'replaced']
  REPLACED.forEach((reason) =>
    it(`reads ethers' TRANSACTION_REPLACED, ${reason}, as the replaced reading: failed, not sent, with its reason`, async () => {
      const replaced = replacedBy(reason)
      const { machine } = await drive(
        'cancel',
        fakeSendPort({ value: TX_HASH }),
        fakeReceiptWait({ error: replaced })
      )
      expect(machine.state()).toMatchObject({ status: 'failedNotSent', replaced: reason })
      expect(errorOf(machine.state())).toBe(replaced)
    })
  )

  it("lands a repriced replacement under the replacement's hash, and reverts under it where it reverted", async () => {
    const landed = await drive(
      'save',
      fakeSendPort({ value: TX_HASH }),
      fakeReceiptWait({ error: replacedBy('repriced', 1) })
    )
    expect(landed.machine.state()).toMatchObject({
      status: 'landed',
      transactionHash: REPLACEMENT_HASH
    })
    const reverted = await drive(
      'save',
      fakeSendPort({ value: TX_HASH }),
      fakeReceiptWait({ error: replacedBy('repriced', 0) })
    )
    expect(reverted.machine.state()).toMatchObject({
      status: 'failedReverted',
      transactionHash: REPLACEMENT_HASH
    })
  })

  it('keeps the hash in the error of a wait that failed after the broadcast, so the write keeps waiting under it', async () => {
    const failures = [new Error('The node is not reachable.'), waitTimedOut(TX_HASH)]
    await Promise.all(
      failures.map(async (failure) => {
        const { machine, run } = await drive(
          'submission',
          fakeSendPort({ value: TX_HASH }),
          fakeReceiptWait({ error: failure })
        )
        expect(machine.events[1]).toEqual({
          type: 'error',
          run,
          error: failure,
          transactionHash: TX_HASH
        })
        expect(errorOf(machine.events[1])).toBe(failure)
        expect(machine.state()).toMatchObject({ status: 'submitting', transactionHash: TX_HASH })
        expect(readingOf(machine.state())).not.toBe('notSent')
      })
    )
  })

  it('keeps the write submitting under its hash once the wait gives up on a hash the node never learned', async () => {
    jest.useFakeTimers()
    try {
      const machine = drivenMachine(submittingFor('save'))
      const { run } = machine.state()
      const driving = driveSend({
        dispatch: machine.dispatch,
        run,
        port: fakeSendPort({ value: TX_HASH }),
        receipts: receiptWaitNeverKnowing(),
        key: KEY,
        transaction: ownerTransaction('save')
      })
      await advanceTimersAsync(UNKNOWN_TRANSACTION_MS - BLOCK_EVERY_MS)
      expect(machine.events.map((event) => event.type)).toEqual(['sent'])
      await advanceTimersAsync(BLOCK_EVERY_MS * 2)
      await driving
      const [, gaveUp] = machine.events
      expect(gaveUp).toMatchObject({ type: 'error', run, transactionHash: TX_HASH })
      expect((errorOf(gaveUp) as Error).message).toContain(TX_HASH)
      expect(machine.state()).toMatchObject({
        status: 'submitting',
        transactionHash: TX_HASH,
        startBlock: START_BLOCK
      })
    } finally {
      jest.clearAllTimers()
      jest.useRealTimers()
    }
  })
})

describe('a receipt the write does not settle by', () => {
  it('ignores a receipt for a hash the run never announced, and keeps waiting under its own', async () => {
    const machine = drivenMachine(submittingFor('save'))
    const { run } = machine.state()
    await driveSend({
      dispatch: machine.dispatch,
      run,
      port: fakeSendPort({ value: TX_HASH }),
      receipts: fakeReceiptWait({ value: providerReceipt(OTHER_HASH, 1) }),
      key: KEY,
      transaction: ownerTransaction('save')
    })
    const announced = writeReducer(submittingFor('save'), {
      type: 'sent',
      run,
      transactionHash: TX_HASH,
      startBlock: START_BLOCK
    })
    expect(machine.events.map((event) => event.type)).toEqual(['sent', 'receipt'])
    expect(machine.state()).toEqual(announced)
  })

  it('keeps waiting under the hash on a receipt with no status, as before Byzantium', async () => {
    const { machine } = await drive(
      'save',
      fakeSendPort({ value: TX_HASH }),
      fakeReceiptWait({ value: providerReceipt(TX_HASH, null) })
    )
    expect(machine.events.map((event) => event.type)).toEqual(['sent'])
    expect(machine.state()).toMatchObject({ status: 'submitting', transactionHash: TX_HASH })
  })

  it('changes nothing in a new run with the answers of a run the holder left behind', async () => {
    const hashLater = deferred<Hex>()
    const machine = drivenMachine(submittingFor('cancel'))
    const driving = driveSend({
      dispatch: machine.dispatch,
      run: machine.state().run,
      port: fakeSendPort({ pending: hashLater.promise }),
      receipts: fakeReceiptWait({ value: providerReceipt(TX_HASH, 1) }),
      key: KEY,
      transaction: ownerTransaction('cancel')
    })
    machine.dispatch({ type: 'reset' })
    machine.dispatch({ type: 'start' })
    machine.dispatch({ type: 'gasChecked', run: machine.state().run, check: enoughCheck('cancel') })
    const current = machine.state()
    expect(current).toMatchObject({ status: 'submitting' })
    expect(current).not.toHaveProperty('transactionHash')

    hashLater.resolve(TX_HASH)
    await driving
    expect(machine.events.slice(-2).map((event) => event.type)).toEqual(['sent', 'receipt'])
    expect(machine.state()).toBe(current)
  })
})
