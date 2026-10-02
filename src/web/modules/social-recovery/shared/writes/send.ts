/**
 * The driver of a write's send: it feeds the machine (machine.ts) the answers
 * of the client's send port and receipt wait, and nothing else. The machine
 * and the classification (classify.ts) decide every reading.
 *
 * 1. It reads the chain's block before the send, so the wait for the receipt
 *    scans for a replacement from before the broadcast.
 * 2. The send port puts the transaction, or the account's batch, through the
 *    request queue into the action window. Its hash arrives as `sent`, with
 *    that block; a refusal, or a block read that failed, arrives as `error` as
 *    it was thrown, which reads that nothing was sent.
 * 3. The receipt wait follows that hash. Its receipt arrives as `receipt`; an
 *    error arrives as `error` as ethers threw it, with the hash: a reverted
 *    receipt it carries reads as a revert, a replacement as replaced, and any
 *    other error keeps the write submitting under its hash.
 *
 * Every answer carries the run it was started for, so the machine drops the
 * answers of a run the holder left behind.
 */
import type { Hex } from '@web/modules/social-recovery/sdk-interfaces'

import { receiptOf } from './classify'
import type { AccountBatchDrive, DriveRun, SendDrive } from './types'

const drive = async (
  { dispatch, run, receipts }: DriveRun,
  send: () => Promise<Hex>
): Promise<void> => {
  let startBlock: number
  let transactionHash: Hex
  try {
    startBlock = await receipts.blockNumber()
    transactionHash = await send()
  } catch (error: unknown) {
    dispatch({ type: 'error', run, error })
    return
  }
  dispatch({ type: 'sent', run, transactionHash, startBlock })
  try {
    const receipt = receiptOf(await receipts.wait(transactionHash, startBlock))
    // A receipt with no status reads neither way, so the write keeps its hash.
    if (receipt) dispatch({ type: 'receipt', run, receipt })
  } catch (error: unknown) {
    dispatch({ type: 'error', run, error, transactionHash })
  }
}

export const driveSend = ({ port, key, transaction, ...rest }: SendDrive): Promise<void> =>
  drive(rest, () => port.send(key, transaction))

export const driveAccountBatch = ({
  port,
  account,
  calls,
  onEstimation,
  recoveryKit,
  requestId,
  ...rest
}: AccountBatchDrive): Promise<void> =>
  drive(rest, () => port.sendAccountBatch(account, calls, onEstimation, recoveryKit, requestId))
