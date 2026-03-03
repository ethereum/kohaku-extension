/* eslint-disable no-console */
import type { Log } from 'ethers'
import { type RailgunLog } from '../types'

export function filterIncompleteLogs(logs: Log[]): {
  completeLogs: RailgunLog[]
  firstIncompleteLogsBlock: number | undefined
} {
  // First pass: find the earliest block containing an incomplete log
  let firstIncompleteLogsBlock: number | undefined
  for (const log of logs) {
    const hasTopics = log.topics && log.topics.length > 0
    const hasData = log.data && log.data !== '0x' && log.data !== ''

    if (!hasTopics || !hasData) {
      const blockNum = Number(log.blockNumber)
      console.log(
        '[RailgunContext - LPA] incomplete log detected at block:',
        blockNum,
        '{ hasTopics:',
        hasTopics,
        ', hasData:',
        hasData,
        '}'
      )
      if (firstIncompleteLogsBlock === undefined || blockNum < firstIncompleteLogsBlock) {
        firstIncompleteLogsBlock = blockNum
      }
    }
  }

  // Second pass: only include complete logs from blocks strictly before the
  // first incomplete block.  This ensures the local Merkle tree state is
  // consistent with the on-chain state at (firstIncompleteLogsBlock - 1).
  const completeLogs: RailgunLog[] = []
  for (const log of logs) {
    const blockNum = Number(log.blockNumber)
    if (firstIncompleteLogsBlock !== undefined && blockNum >= firstIncompleteLogsBlock) {
      continue
    }

    const hasTopics = log.topics && log.topics.length > 0
    const hasData = log.data && log.data !== '0x' && log.data !== ''
    if (!hasTopics || !hasData) continue

    completeLogs.push({
      blockNumber: blockNum,
      topics: [...log.topics],
      data: log.data,
      address: log.address
    })
  }

  return { completeLogs, firstIncompleteLogsBlock }
}
