/**
 * The manager's setup and attempt events and the Ambire account's privilege
 * event: their topics, filters and decoding, the chunked log scan they are
 * read through, and the events feed of one account's deployment over them.
 */
export {
  SETUP_COMMITTED_TOPIC,
  SETUP_CLEARED_TOPIC,
  decodeSetupLog,
  createSetupEvents
} from './setup-events'
export {
  PRIVILEGE_CHANGED_TOPIC,
  decodePrivilegeLog,
  createPrivilegeEvents
} from './privilege-events'
export {
  ATTEMPT_STARTED_TOPIC,
  ATTEMPT_CANCELLED_TOPIC,
  ATTEMPT_CONSUMED_TOPIC,
  decodeAttemptLog
} from './attempt-events'
export { createKitEventManager } from './event-manager'
export { LOG_CHUNK_BLOCKS, chunksOf, logsInChunks } from './log-scan'
export type {
  AttemptLog,
  CommitQuery,
  KitEventManagerInput,
  LogScan,
  PrivilegeChangedLog,
  PrivilegeEvents,
  SetupClearedLog,
  SetupCommittedLog,
  SetupEvents,
  SetupLog
} from './types'
