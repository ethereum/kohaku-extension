import type { EnrollInput, Input, Material, Verdict } from '@kohaku-eth/social-recovery'

import type {
  CeremonyCall,
  CeremonyStep,
  CeremonyView,
  ChainVerdict,
  DeviceCallContext,
  RunDeps,
  CeremonyStop,
  ReportIdentity
} from '@web/modules/social-recovery/shared/ceremony'
import type {
  MethodScript,
  Outcome
} from '@web/modules/social-recovery/shared/ceremony/__tests__/harness'
import type { Network } from '@ambire-common/interfaces/network'
import type { CeremonySource } from '@web/modules/social-recovery/shared/ceremony/screen'

/** One of a phone request's callbacks, as a test fires it. */
export type Callback = (...args: unknown[]) => unknown

/** A device call's context, and the steps and views it reported. */
export interface Watched {
  context: DeviceCallContext
  steps: CeremonyStep[]
  views: CeremonyView[]
}

/** How a host test sets up a run; each member has a default. */
export interface HostSetup {
  verdict?: Verdict
  chainVerdict?: ChainVerdict
  binding?: 'external-app' | 'in-browser-prover'
  deps?: RunDeps
  material?: Material
  script?: MethodScript
}

/** The part of the `qrcode` package a test draws a code with: the module grid of a text. */
export interface QrCodeLibrary {
  create(
    text: string,
    options?: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H' }
  ): { modules: { size: number; data: Uint8Array } }
}

/**
 * An image a test hands the decoder: its natural size and the RGBA pixels it
 * shows when drawn at a given size.
 */
export interface FakePicture {
  width: number
  height: number
  pixelsAt(width: number, height: number): Uint8ClampedArray
}

/** One draw the decoder made on its canvas: the size it drew the image at. */
export interface CanvasDraw {
  width: number
  height: number
}

/** Which of a phone request's optional callbacks the library offers. */
export interface PhoneRequestOffer {
  withResult?: boolean
  withBridge?: boolean
}

/** The device calls that open a phone request. */
export type PhoneCall = 'enroll' | 'sign'

/** An enrollment's input that opens no request, and what is wrong with it. */
export type UnopenedCase = [name: string, input: EnrollInput & Input]

/** A device call that opens a phone request, and the lifecycle call it serves. */
export type PhoneErrorCase = [device: PhoneCall, call: CeremonyCall]

/** A key or a case's name, and a value. */
export type NamedValue = [string, unknown]

/** A case's name and how a report's identity differs. */
export type OtherReportCase = [string, Partial<ReportIdentity>]

/** A case's name and what the delivery throws or answers. */
export type UndeliveredCase = [string, () => unknown]

/** The call a ceremony host runs. */
export type HostCall = 'enroll' | 'testAccess' | 'createClaim'

/** A run that stopped, and its stop. */
export type StoppedRun = { ok: false; stop: CeremonyStop }

/** A case's name and the stop it brings. */
export type StopCase = [string, () => CeremonyStop]

/** The resolving half of a pending read. */
export type ResolveSettle = { resolve: (v: Verdict) => void }

/** The rejecting half of a pending read. */
export type RejectSettle = { reject: (e: Error) => void }

/** Both halves of a pending read. */
export type Settle = { resolve: (value: Verdict) => void; reject: (error: Error) => void }

/** A verdict and the line it shows. */
export type VerdictLine = [Verdict, string]

/** A case's name and the step it reports. */
export type ProgressCase = [string, CeremonyStep | undefined]

/** A case's name and the signature's s value. */
export type LowSCase = [string, bigint]

/** What the canvas drew last: the picture and its size; none yet while null. */
export type DrawCall = { picture: FakePicture; width: number; height: number } | null

/** An image the canvas draws: its picture. */
export type DrawnImage = { picture: FakePicture }

/** A case's name and the enrollment input it builds. */
export type EnrollInputCase = [string, () => EnrollInput]

/** The ceremony source as an external store a test can change. */
export type SourceMock = { current: Record<string, unknown>; listeners: Set<() => void> }

/** The props of a stand-in that renders only its children. */
export type ChildrenProps = { children: unknown }

/** The props of the stand-in button. */
export type ButtonProps = { text: string; onPress?: () => void }

/** The arguments of a storage read: the key and an optional default. */
export type StoreGetArgs = [string, unknown?]

/** The arguments of a storage removal: the key. */
export type StoreKeyArgs = [string]

/** How a test opens the screen; each member has a default. */
export type ScreenOptions = { from?: string; strict?: boolean }

/** The abort signal a browser call saw. */
export type SeenSignal = { signal?: AbortSignal }

/** The networks as an external store a test can change. */
export type NetworksMock = { current: Network[]; listeners: Set<() => void> }

/** The props of the stand-in QR code. */
export type QrProps = { value: string }

/** A ceremony call a tab runs on an enrolled method. */
export type TabCall = 'testAccess' | 'createClaim'

/** A provider the tab built, with its destroy spy. */
export type ProviderMock = { destroy: jest.Mock }

/** How a test opens the tab; each member has a default. */
export type TabOptions = { provide?: CeremonySource; bare?: boolean; strict?: boolean }

/** An outcome that carries a verdict. */
export type VerdictOutcome = Outcome & { type: 'verdict' }
