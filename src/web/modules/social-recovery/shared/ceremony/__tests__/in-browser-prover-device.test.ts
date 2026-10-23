/**
 * The in-browser prover device asks the screen for the Aadhaar QR image and
 * returns at once with its decoded data as the material, with a progress
 * callback that turns the prover's states into the tab's steps and the
 * ceremony's signal that stops the proof. The holder's Cancel at the upload,
 * and an abort, are the cancelled note; a screen that cannot ask for an image
 * serves no such device.
 */
import type { EnrollInput, Input } from '@kohaku-eth/social-recovery'
import type { AadhaarMaterial } from '@kohaku-eth/social-recovery/recovery-methods'

import type {
  CeremonyAnswer,
  CeremonyStep,
  DeviceCallContext,
  DeviceResult
} from '@web/modules/social-recovery/shared/ceremony'
import { inBrowserProverDevice } from '@web/modules/social-recovery/shared/ceremony/inBrowserProverDevice'

const QR_DATA = '2374971804270526477833002468783965837992554564899874087591661303561346432389'
const INPUT = { kind: 'aadhaar-enroll' } as unknown as EnrollInput & Input
const CANCELLED = {
  ok: false,
  stop: { kind: 'dismissed', note: 'cancelled', detail: 'AbortError' }
}

const answering = (answer: CeremonyAnswer) => async (): Promise<CeremonyAnswer> => answer

const materialOf = (result: DeviceResult): AadhaarMaterial => {
  if (!result.ok) {
    throw new Error(`the device stopped: ${JSON.stringify(result.stop)}`)
  }
  return result.material as AadhaarMaterial
}

;(['enroll', 'sign'] as const).forEach((call) =>
  describe(`the in-browser prover device at ${call}`, () => {
    it('asks the holder for the QR image, once', async () => {
      const ask = jest.fn(answering({ kind: 'qrData', qrData: QR_DATA }))
      await inBrowserProverDevice()[call](INPUT, { ask })
      expect(ask).toHaveBeenCalledTimes(1)
      expect(ask).toHaveBeenCalledWith({ kind: 'qrImage' })
    })

    it("hands the decoded QR data and the ceremony's signal to the method", async () => {
      const controller = new AbortController()
      const material = materialOf(
        await inBrowserProverDevice()[call](INPUT, {
          signal: controller.signal,
          ask: answering({ kind: 'qrData', qrData: QR_DATA })
        })
      )
      expect(material.qrData).toBe(QR_DATA)
      expect(material.signal).toBe(controller.signal)
      expect(typeof material.onProgress).toBe('function')
    })

    it('hands no signal where the ceremony has none', async () => {
      const material = materialOf(
        await inBrowserProverDevice()[call](INPUT, {
          ask: answering({ kind: 'qrData', qrData: QR_DATA })
        })
      )
      expect(material).not.toHaveProperty('signal')
    })

    const PROGRESS: [string, CeremonyStep | undefined][] = [
      ['fetching-wasm', 'fetchingFiles'],
      ['fetching-zkey', 'fetchingFiles'],
      ['proving', 'proving'],
      ['completed', 'checking'],
      ['error', undefined],
      ['an unknown state', undefined]
    ]
    PROGRESS.forEach(([state, step]) =>
      it(`shows ${step ?? 'no step'} for the prover's ${state}`, async () => {
        const steps: CeremonyStep[] = []
        const material = materialOf(
          await inBrowserProverDevice()[call](INPUT, {
            onStep: (shown) => steps.push(shown),
            ask: answering({ kind: 'qrData', qrData: QR_DATA })
          })
        )
        material.onProgress?.(state as never)
        expect(steps).toEqual(step ? [step] : [])
      })
    )

    it("reads the holder's Cancel at the upload as the cancelled note", async () => {
      await expect(
        inBrowserProverDevice()[call](INPUT, { ask: answering({ kind: 'cancelled' }) })
      ).resolves.toEqual(CANCELLED)
    })

    it('reads an abort while the upload waits as the cancelled note, whatever the holder then picks', async () => {
      const controller = new AbortController()
      let pick: (answer: CeremonyAnswer) => void = () => undefined
      const context: DeviceCallContext = {
        signal: controller.signal,
        ask: () =>
          new Promise((resolve) => {
            pick = resolve
          })
      }
      const running = inBrowserProverDevice()[call](INPUT, context)
      controller.abort()
      pick({ kind: 'qrData', qrData: QR_DATA })
      await expect(running).resolves.toEqual(CANCELLED)
    })

    it('asks nothing for an already aborted signal', async () => {
      const controller = new AbortController()
      controller.abort()
      const ask = jest.fn(answering({ kind: 'qrData', qrData: QR_DATA }))
      await expect(
        inBrowserProverDevice()[call](INPUT, { signal: controller.signal, ask })
      ).resolves.toEqual(CANCELLED)
      expect(ask).not.toHaveBeenCalled()
    })

    it('is not supported, with no retry, on a screen that cannot ask for an image', async () => {
      await expect(inBrowserProverDevice()[call](INPUT, {})).resolves.toEqual({
        ok: false,
        stop: {
          kind: 'verdict',
          verdict: 'notSupported',
          retry: false,
          cause: 'no-implementation'
        }
      })
    })
  })
)
