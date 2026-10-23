import type { Material, Verdict } from '@kohaku-eth/social-recovery'

import type {
  CeremonyStep,
  CeremonyView,
  ChainVerdict,
  DeviceCallContext,
  RunDeps
} from '@web/modules/social-recovery/shared/ceremony'
import type { MethodScript } from '@web/modules/social-recovery/shared/ceremony/__tests__/harness'

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
