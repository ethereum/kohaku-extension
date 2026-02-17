import { Checkpoint } from '../types'

let _checkpointPromise: Promise<{ default: any }> | null = null

export async function loadSepoliaCheckpoint() {
  if (!_checkpointPromise) {
    // This splits the 4MB file into a separate chunk and defers parsing.
    _checkpointPromise = import('../sepolia-checkpoint.json')
  }
  const m = await _checkpointPromise
  return m.default as Checkpoint
}
