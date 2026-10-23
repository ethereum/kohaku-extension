/**
 * The in-browser prover device: the Aadhaar secure QR code the holder uploads,
 * proven in this page.
 *
 * The device asks the screen for the QR image and returns at once with its
 * decoded data as the material: the method runs the prover inside its own
 * packaging, so the proof's progress reaches the screen through the
 * material's progress callback, and the ceremony's signal stops it. The
 * holder's Cancel at the upload is the cancelled note.
 */
import type { AadhaarMaterial } from '@kohaku-eth/social-recovery/recovery-methods'

import type { CeremonyDevice, CeremonyStep, DeviceCallContext, DeviceResult } from './types'
import { dismissed, notSupported } from './verdicts'

/** The step each of the prover's states shows; an error shows none, the method's failure follows. */
const PROVER_STEPS: Readonly<Record<string, CeremonyStep>> = {
  'fetching-wasm': 'fetchingFiles',
  'fetching-zkey': 'fetchingFiles',
  proving: 'proving',
  completed: 'checking'
}

const cancelled = (): DeviceResult => ({
  ok: false,
  stop: dismissed('cancelled', 'AbortError')
})

const proverMaterial = async (context: DeviceCallContext): Promise<DeviceResult> => {
  if (context.signal?.aborted) {
    return cancelled()
  }
  if (!context.ask) {
    return { ok: false, stop: notSupported('no-implementation') }
  }
  const answer = await context.ask({ kind: 'qrImage' })
  if (answer.kind === 'cancelled' || context.signal?.aborted) {
    return cancelled()
  }
  const material: AadhaarMaterial = {
    qrData: answer.qrData,
    onProgress: (state) => {
      const step = PROVER_STEPS[state]
      if (step) {
        context.onStep?.(step)
      }
    },
    ...(context.signal ? { signal: context.signal } : {})
  }
  return { ok: true, material }
}

/** The device of the `in-browser-prover` binding, the Aadhaar prover in this page. */
export const inBrowserProverDevice = (): CeremonyDevice => ({
  enroll: (_input, context) => proverMaterial(context),
  sign: (_input, context) => proverMaterial(context)
})
