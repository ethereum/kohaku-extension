/**
 * The form of a backup the chain holds, in the SDK's layout: none for the
 * empty one, the sealed payload at its one fixed size, and the clear
 * configuration's serialization for bytes that decode as one. The SDK opens a
 * sealed backup alone; a clear one is read back here, so a holder who kept a
 * clear backup restores without the configuration in hand. Bytes that are
 * neither go to the SDK as sealed, which refuses them as it refuses a wrong
 * password.
 */
import { BACKUP_SEALED_PAYLOAD_SIZE, deserializeConfiguration } from '@kohaku-eth/social-recovery'
import type { BackupChoice, Configuration, Hex } from '@kohaku-eth/social-recovery'
import { isHex, size } from 'viem'

/** The empty backup: the setup keeps no copy of its configuration on chain. */
export const EMPTY_BACKUP: Hex = '0x'

/** Throws a `RangeError` for text that is not hex bytes, the metadata of a log another party wrote. */
export const backupFormOf = (payload: Hex): BackupChoice => {
  if (!isHex(payload, { strict: true }) || payload.length % 2 !== 0) {
    throw new RangeError('The backup is malformed: it is not hex bytes.')
  }
  if (payload === EMPTY_BACKUP) {
    return 'empty'
  }
  if (size(payload) === BACKUP_SEALED_PAYLOAD_SIZE) {
    return 'encrypted'
  }
  try {
    deserializeConfiguration(payload)
    return 'clear'
  } catch {
    return 'encrypted'
  }
}

/** The configuration a clear backup holds; throws a `RangeError` on bytes that are not one. */
export const openClearBackup = (payload: Hex): Configuration => deserializeConfiguration(payload)
