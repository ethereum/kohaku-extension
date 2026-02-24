/* eslint-disable no-console */
import type { RailgunAccount } from '@kohaku-eth/railgun'

export function logNotesBeforeSync(account: RailgunAccount, weth: string): number {
  const notesBeforeSync = account.getSerializedState().notebooks
  const notesCountBefore = notesBeforeSync
    .flat()
    .filter((n) => n !== null && n !== undefined).length
  const notesBeforeByToken = notesBeforeSync
    .flat()
    .filter((n) => n !== null && n !== undefined)
    .reduce((acc: any, note: any) => {
      const tokenAddr = note?.tokenData?.tokenAddress?.toLowerCase() || 'unknown'
      if (!acc[tokenAddr]) acc[tokenAddr] = []
      acc[tokenAddr].push({
        value: note?.value?.toString(),
        blockNumber: note?.blockNumber,
        noteHash: note?.noteHash
      })
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
      count: notesBeforeByToken[tokenAddr].length,
      totalValue: notesBeforeByToken[tokenAddr]
        .reduce((sum: bigint, n: any) => sum + BigInt(n.value || '0'), 0n)
        .toString()
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

  // Log ALL notes after syncing - this is critical for debugging missing change notes
  const allNotes = notes.flat().filter((n) => n !== null && n !== undefined)
  const notesCountAfter = allNotes.length
  const notesAfterByToken = allNotes.reduce((acc: any, note: any) => {
    const tokenAddr = note?.tokenData?.tokenAddress?.toLowerCase() || 'unknown'
    if (!acc[tokenAddr]) acc[tokenAddr] = []
    acc[tokenAddr].push({
      value: note?.value?.toString(),
      blockNumber: note?.blockNumber,
      noteHash: note?.noteHash,
      nullifier: note?.nullifier,
      commitment: note?.commitment
    })
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
      count: notesAfterByToken[tokenAddr].length,
      totalValue: notesAfterByToken[tokenAddr]
        .reduce((sum: bigint, n: any) => sum + BigInt(n.value || '0'), 0n)
        .toString(),
      notes: notesAfterByToken[tokenAddr]
    }))
  )

  console.log('[RailgunContext - LPA] ===========================================')
}
