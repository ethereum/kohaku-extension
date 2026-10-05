import type { CeremonyResolver, ReportStore, ReportSubscribe, VisibilitySource } from '../types'

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
