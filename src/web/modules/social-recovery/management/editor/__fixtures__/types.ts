import type { EditSessionAccessor } from '@web/modules/social-recovery/management/editor/types'
import type {
  ChainReads,
  ListedAccountFacts,
  ReceiptReads,
  RecoveryKitClient,
  SendPort,
  SendRequestPort
} from '@web/modules/social-recovery/shared/client'
import type { sdkStandIn as StandIn } from '@web/modules/social-recovery/shared/client/stand-in'
import type { RecordStorage, WalletRecords } from '@web/modules/social-recovery/shared/records'

/** Whether the port lands the batch it is handed, or refuses it before it reaches the chain. */
export type LandingCase = 'lands' | 'refused'

/** A committed setup on the stand-in's chain, a client over it, records in memory and the seams a run sends through. */
export interface EditWorld {
  account: `0x${string}`
  chain: ReturnType<typeof StandIn.nodeFor>
  client: RecoveryKitClient
  storage: RecordStorage
  records: WalletRecords
  session: EditSessionAccessor
  facts: ListedAccountFacts
  reads: ChainReads
  receipts: ReceiptReads
  requests: SendRequestPort
  port: SendPort
}

/** The seams the screens read, each given by the test. */
export interface ScreensWorld {
  client: unknown
  reads: unknown
  facts: unknown
  run: { start: jest.Mock } & Record<string, unknown>
  trust: unknown
  accountReads: unknown
}

/** The client seam as the edit tests reach into it, with the setup check a test drives. */
export interface ValidatingClientSeam {
  client: { setup: { validateSetup: jest.Mock } }
}

/** The two seams the edit screen's test sets before it mounts the screen. */
export type ClientAndReadsSeams = Pick<ScreensWorld, 'client' | 'reads'>

/** Whether the holder typed a new recovery password, and the value the review shows for it. */
export interface PasswordValueCase {
  changed: boolean
  value: string
}
