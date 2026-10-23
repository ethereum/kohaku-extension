import type { DeviceBinding } from '@kohaku-eth/social-recovery'

import type {
  CeremonyOutcome,
  CeremonyParams,
  CeremonyResolver,
  CeremonyStep,
  CeremonyValue,
  ReportStore,
  ReportSubscribe,
  VisibilitySource
} from '../types'

export interface CeremonySource {
  /** Finds the ceremony a request id names. */
  resolve?: CeremonyResolver
  /** Where the tab writes its report; the extension's local storage by default. */
  store?: ReportStore
  /** How a caller listens for a report; storage change events by default. */
  subscribe?: ReportSubscribe
  /** The document the visibility gate reads; `document` by default. */
  visibility?: VisibilitySource
}

export type Phase = 'resolving' | 'running' | 'reporting' | 'undelivered' | 'done' | 'nothing'

export interface UploadBlockProps {
  /** The latest picked image held no code the prover reads. */
  noQrFound: boolean
  onChoose: () => void
  onCancel: () => void
}

export interface ScanBlockProps {
  /** The request the phone scans; absent while the method has yet to show it. */
  url?: string
  step: CeremonyStep
  /** The phone reads the holder's document for a claim. */
  phoneReads: boolean
  onCancel: () => void
}

export interface ProverBlockProps {
  step: CeremonyStep
  onStop: () => void
}

export interface OutcomeBlockProps {
  outcome: CeremonyOutcome<CeremonyValue>
  params: CeremonyParams
  binding: DeviceBinding | null
  phase: Phase
  /** The report waits for the tab to be shown before it is written. */
  reportHeld: boolean
  onBack: () => void
  /** Writes the same report again and runs no second ceremony. */
  onDeliverAgain: () => void
  onTryAgain: () => void
}
