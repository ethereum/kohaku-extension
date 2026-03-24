/* eslint-disable no-console */
import type { RailgunAccount } from '@kohaku-eth/railgun'

export function logNotesBeforeSync(account: RailgunAccount, weth: string): number {
  const notesBeforeSync = account.getSerializedState().notebooks
  const allNotesBefore = notesBeforeSync.flat().filter((n) => n !== null && n !== undefined)
  const notesCountBefore = allNotesBefore.length
  const notesBeforeByToken = allNotesBefore.reduce((acc: any, note: any) => {
    const tokenAddr = note?.tokenData?.tokenAddress?.toLowerCase() || 'unknown'
    if (!acc[tokenAddr]) {
      acc[tokenAddr] = { count: 0, totalValue: 0n }
    }
    acc[tokenAddr].count += 1
    acc[tokenAddr].totalValue += BigInt(note?.value?.toString() || '0')
    return acc
  }, {})
  console.log('[RailgunContext - LPA] ========== NOTES BEFORE SYNC ==========')
  console.log('[RailgunContext - LPA] Total notebooks:', notesBeforeSync.length)
  console.log('[RailgunContext - LPA] Total notes count:', notesCountBefore)
  console.log(
    '[RailgunContext - LPA] Notes by token:',
    Object.keys(notesBeforeByToken).map((tokenAddr) => ({
      tokenAddress: tokenAddr,
      isWETH: tokenAddr === weth?.toLowerCase(),
      count: notesBeforeByToken[tokenAddr].count,
      totalValue: notesBeforeByToken[tokenAddr].totalValue.toString()
    }))
  )
  console.log('[RailgunContext - LPA] ===========================================')
  return notesCountBefore
}

export function logNotesAfterSync(
  account: RailgunAccount,
  zkAddress: string,
  weth: string,
  notesCountBefore: number
): void {
  const notes = account.getSerializedState().notebooks

  const allNotes = notes.flat().filter((n) => n !== null && n !== undefined)
  const notesCountAfter = allNotes.length
  const notesAfterByToken = allNotes.reduce((acc: any, note: any) => {
    const tokenAddr = note?.tokenData?.tokenAddress?.toLowerCase() || 'unknown'
    if (!acc[tokenAddr]) {
      acc[tokenAddr] = { count: 0, totalValue: 0n }
    }
    acc[tokenAddr].count += 1
    acc[tokenAddr].totalValue += BigInt(note?.value?.toString() || '0')
    return acc
  }, {})

  console.log('[RailgunContext - LPA] ========== ALL NOTES AFTER SYNC ==========')
  console.log('[RailgunContext - LPA] Account zkAddress:', zkAddress)
  console.log('[RailgunContext - LPA] Total notebooks:', notes.length)
  console.log('[RailgunContext - LPA] Total notes count:', notesCountAfter)
  console.log('[RailgunContext - LPA] Notes count BEFORE sync:', notesCountBefore)
  console.log('[RailgunContext - LPA] Notes count AFTER sync:', notesCountAfter)
  console.log('[RailgunContext - LPA] Notes added/removed:', notesCountAfter - notesCountBefore)
  console.log(
    '[RailgunContext - LPA] Notes by token:',
    Object.keys(notesAfterByToken).map((tokenAddr) => ({
      tokenAddress: tokenAddr,
      isWETH: tokenAddr === weth?.toLowerCase(),
      count: notesAfterByToken[tokenAddr].count,
      totalValue: notesAfterByToken[tokenAddr].totalValue.toString()
    }))
  )

  console.log('[RailgunContext - LPA] ===========================================')
}
