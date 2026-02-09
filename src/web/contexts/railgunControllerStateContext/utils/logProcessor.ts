/* eslint-disable no-console */
import type { Log } from 'ethers'
import { type RailgunLog } from '../types'

export function filterIncompleteLogs(logs: Log[]): {
  completeLogs: RailgunLog[]
  firstIncompleteLogsBlock: number | undefined
} {
  let firstIncompleteLogsBlock: number | undefined
  const completeLogs: RailgunLog[] = []

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
      if (
        firstIncompleteLogsBlock === undefined ||
        blockNum < firstIncompleteLogsBlock
      ) {
        firstIncompleteLogsBlock = blockNum
      }
      // Skip this log - don't process incomplete logs
      continue
    }

    completeLogs.push({
      blockNumber: Number(log.blockNumber),
      topics: [...log.topics],
      data: log.data,
      address: log.address
    })
  }

  return { completeLogs, firstIncompleteLogsBlock }
}
