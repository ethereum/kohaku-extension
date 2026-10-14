import type {
  ApproverRequest,
  DeploymentDescriptor,
  RequestDescription
} from '@web/modules/social-recovery/sdk-interfaces'
import type { PollFacts } from '@web/modules/social-recovery/recovery/checklist'
import type { RecoveryKitClient } from '@web/modules/social-recovery/shared/client'

/** The parts of the build's deployment a request's domain is compared with. */
export type DomainOfBuild = Pick<DeploymentDescriptor, 'chainId' | 'manager' | 'digestVersion'>

/** The request the link carries and what the methods orchestrator described of it. */
export interface DescribedRequest {
  request: ApproverRequest
  description: RequestDescription
}

/** The part of the recovery client the page reads the chain through. */
export type ApprovalKitClient = Pick<RecoveryKitClient, 'recovery' | 'action'>

/** One of the four values the lead shows: its label, and its text or null where it cannot be read. */
export interface ApprovalValueLine {
  name: 'accountBeingRecovered' | 'newKey' | 'keyBeingRemoved' | 'payment'
  label: string
  value: string | null
}

/** The lead's four values, and whether every one of them rendered. */
export interface ApprovalValues {
  lines: ApprovalValueLine[]
  rendered: boolean
}

/** The deadline as the details show it, or null where the request's deadline is no time. */
export interface DeadlineView {
  line: string
  passed: boolean
}

/**
 * The chain reads as the page holds them: nothing answered yet since the
 * client was built, the last round's answer, or a round that failed or ran
 * past its limit.
 */
export type ApprovalReads =
  | { status: 'pending' }
  | { status: 'answered'; facts: PollFacts }
  | { status: 'failed' }

/**
 * The client the page reads through, as the screen hands it to the view:
 * refused where the manager publishes a digest version this build does not
 * sign, which no retry changes.
 */
export type ApprovalClient =
  | { status: 'loading' }
  | { status: 'ready'; client: ApprovalKitClient }
  | { status: 'refused' }
  | { status: 'failed'; retry: () => void }

/** Why a request cannot be used any more: used where its own recovery ended, cancelled or executed. */
export type ApprovalDeath = 'expired' | 'void' | 'setup-changed' | 'used'

/**
 * What the page reads of the request in the place of the sign action:
 * - other-deployment: the request's domain is not this build's;
 * - reading: the client or the reads have not answered yet;
 * - failed: the client or a read failed;
 * - waiting: the recoverer submitted this request and its waiting period runs;
 * - dead: the request cannot be used any more;
 * - live: nothing stops a signature, the account authorizes the action or not.
 */
export type ApprovalReading =
  | { kind: 'other-deployment' }
  | { kind: 'reading' }
  | { kind: 'failed' }
  | { kind: 'waiting'; endsAt: number; authorized: boolean }
  | { kind: 'dead'; death: ApprovalDeath }
  | { kind: 'live'; authorized: boolean }

/** What enables the sign action. */
export interface SignGates {
  values: ApprovalValues
  deadline: DeadlineView | null
  reading: ApprovalReading
  acknowledged: boolean
}

export interface ApprovalReadsInput {
  client: ApprovalKitClient | null
  /** The link of the request the page shows: another link starts its own round. */
  link: string
  /** False once nothing is read any more, as after a decline. */
  enabled: boolean
}

export interface ApprovalReadsHook {
  reads: ApprovalReads
  retry: () => void
}

export interface ApproveViewProps {
  described: DescribedRequest
  /** Any reading but another deployment. */
  reading: ApprovalReading
  networkName: string
  /** Milliseconds since epoch, the page's clock as it last ticked. */
  now: number
  timeZone: string
  onClose: () => void
  onDecline: () => void
  onRetry: () => void
}

export interface LeadBlockProps {
  values: ApprovalValues
}

export interface DetailsBlockProps {
  described: DescribedRequest
  deadline: DeadlineView | null
  networkName: string
}

export interface SignBlockProps {
  acknowledged: boolean
  onAcknowledged: (value: boolean) => void
  enabled: boolean
  onDecline: () => void
}

/**
 * The states drawn while no answered reading stands: reading and failed in
 * place of the sign action, another deployment in place of the whole page.
 */
export interface StatusBlockProps {
  reading: ApprovalReading
  onRetry: () => void
}

/** The states drawn in place of the sign action: waiting and the deaths. */
export interface OutcomeBlockProps {
  reading: ApprovalReading
  /** Milliseconds since epoch, the page's clock as it last ticked. */
  now: number
  timeZone: string
  onClose: () => void
}

export interface DeclinedBlockProps {
  onClose: () => void
}
