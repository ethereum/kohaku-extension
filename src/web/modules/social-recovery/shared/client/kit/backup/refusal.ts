import type { BackupRefusal, BackupRefusalReason } from './types'

export const backupRefusal = (
  reason: BackupRefusalReason,
  message: string,
  values: Pick<BackupRefusal, 'plaintextSize' | 'paddedSize' | 'version'> = {}
): BackupRefusal => {
  const error = new Error(message) as BackupRefusal
  error.name = 'BackupRefusal'
  error.reason = reason
  Object.assign(error, values)
  return error
}
