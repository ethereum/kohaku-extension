/**
 * The external-app device: the zkPassport request the holder answers in the
 * zkPassport app on a phone.
 *
 * The method's input carries the request's opener. The device opens the
 * request, hands the screen its link to draw as a code the phone scans, and
 * follows the phone through the request's callbacks: received, generating,
 * result. An enrollment's material is the verified result with its unique
 * identifier and proofs; a signature's material is the proofs, the outer one
 * binding the digest's text.
 *
 * The phone's refusal is the refused note, an error the phone reported is a
 * failure with its message, and a request that does not open, or whose
 * library offers no result callback at an enrollment, is a device that did not
 * answer. A connection to the phone lost before any proof arrived is a phone
 * that never connected; lost after, it changes nothing. A page that cannot
 * draw the code runs no request. The device keeps no timer of its own: the
 * tab's expiry rules hold. After an abort no callback is honoured.
 */
import type { Input, Material, ZkPassportStackProof } from '@kohaku-eth/social-recovery'

import type {
  CeremonyDevice,
  CeremonyStop,
  DeviceCallContext,
  DeviceResult,
  ZkPassportRequestWithResult
} from './types'
import { dismissed, failed, notSupported, unavailable } from './verdicts'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const REQUEST_CALLBACKS = [
  'onRequestReceived',
  'onGeneratingProof',
  'onProofGenerated',
  'onSuccess',
  'onReject',
  'onError'
] as const

const OPTIONAL_CALLBACKS = ['onResult', 'onBridgeConnect', 'onBridgeConnectionLost'] as const

/** Whether the app library's answer is a request this device can follow. */
const isRequest = (value: unknown): value is ZkPassportRequestWithResult =>
  isRecord(value) &&
  typeof value.url === 'string' &&
  REQUEST_CALLBACKS.every((name) => typeof value[name] === 'function') &&
  OPTIONAL_CALLBACKS.every((name) => value[name] === undefined || typeof value[name] === 'function')

/** The opener the method's input carries, or undefined where it carries none. */
const openerOf = (input: Input): (() => Promise<unknown>) | undefined => {
  const open = input.openRequest
  return typeof open === 'function' ? () => Promise.resolve(open()) : undefined
}

const cancelled = (): DeviceResult => ({
  ok: false,
  stop: dismissed('cancelled', 'AbortError')
})

const stopped = (stop: CeremonyStop): DeviceResult => ({ ok: false, stop })

/**
 * The opener's answer, or undefined as soon as the signal aborts, so a Cancel
 * while the request is still opening answers at once. A request that opens
 * after the abort is dropped, and a rejection that lands after it is
 * consumed.
 */
const untilAborted = (opening: Promise<unknown>, signal: AbortSignal | undefined) =>
  signal
    ? new Promise<unknown>((resolve, reject) => {
        const onAbort = () => resolve(undefined)
        signal.addEventListener('abort', onAbort, { once: true })
        opening.then(
          (value) => {
            signal.removeEventListener('abort', onAbort)
            resolve(value)
          },
          (error: unknown) => {
            signal.removeEventListener('abort', onAbort)
            reject(error)
          }
        )
      })
    : opening

/**
 * Follows one opened request until the phone answers, refuses or errs, or the
 * signal aborts. `listen` registers the callback whose answer is the material.
 */
const follow = (
  request: ZkPassportRequestWithResult,
  context: DeviceCallContext,
  listen: (settle: (result: DeviceResult) => void, proofs: ZkPassportStackProof[]) => void
): Promise<DeviceResult> =>
  new Promise((resolve) => {
    const { signal } = context
    let settled = false
    let onAbort = () => {}
    const settle = (result: DeviceResult) => {
      if (settled) {
        return
      }
      settled = true
      signal?.removeEventListener('abort', onAbort)
      resolve(result)
    }
    onAbort = () => settle(cancelled())
    const whileOpen =
      <A extends unknown[]>(callback: (...args: A) => void) =>
      (...args: A) => {
        if (!settled && !signal?.aborted) {
          callback(...args)
        }
      }
    if (signal?.aborted) {
      settle(cancelled())
      return
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    const generated: ZkPassportStackProof[] = []
    request.onRequestReceived(whileOpen(() => context.onStep?.('requestReceived')))
    request.onGeneratingProof(whileOpen(() => context.onStep?.('generating')))
    request.onProofGenerated(
      whileOpen((proof: ZkPassportStackProof) => {
        generated.push(proof)
        context.onStep?.('resultReceived')
      })
    )
    request.onReject(whileOpen(() => settle(stopped(dismissed('refused')))))
    request.onError(
      whileOpen((message: string) =>
        settle(stopped(failed('phone-error', typeof message === 'string' ? message : undefined)))
      )
    )
    request.onBridgeConnectionLost?.(
      whileOpen(() => {
        if (generated.length === 0) {
          settle(stopped(unavailable('unreachable')))
        }
      })
    )
    listen(whileOpen(settle), generated)

    context.show?.({ kind: 'scanCode', url: request.url })
    context.onStep?.('waitingForPhone')
  })

/** Opens the request the input carries, or the stop of a request that does not open. */
const open = async (
  input: Input,
  context: DeviceCallContext
): Promise<ZkPassportRequestWithResult | DeviceResult> => {
  const opener = openerOf(input)
  if (!opener) {
    return stopped(unavailable('device-unavailable'))
  }
  let request: unknown
  try {
    request = await untilAborted(opener(), context.signal)
  } catch {
    return context.signal?.aborted ? cancelled() : stopped(unavailable('device-unavailable'))
  }
  if (context.signal?.aborted) {
    return cancelled()
  }
  return isRequest(request) ? request : stopped(unavailable('device-unavailable'))
}

const isDeviceResult = (value: ZkPassportRequestWithResult | DeviceResult): value is DeviceResult =>
  'ok' in value

/** The enrollment's material: the verified result the result callback delivers. */
const listenForResult =
  (onResult: NonNullable<ZkPassportRequestWithResult['onResult']>) =>
  (settle: (result: DeviceResult) => void): void => {
    onResult((response) => {
      settle(
        isRecord(response)
          ? { ok: true, material: { result: response } }
          : stopped(unavailable('device-unavailable'))
      )
    })
  }

const noCode = (): DeviceResult => stopped(notSupported('no-implementation'))

/** The signature's material: the proofs the success callback delivers, else those generated. */
const listenForProofs =
  (request: ZkPassportRequestWithResult) =>
  (settle: (result: DeviceResult) => void, generated: ZkPassportStackProof[]): void => {
    request.onSuccess(({ proofs }) => {
      const material: Material = {
        proofs: Array.isArray(proofs) && proofs.length > 0 ? proofs : [...generated]
      }
      settle({ ok: true, material })
    })
  }

/** The device of the `external-app` binding, the zkPassport app on the holder's phone. */
export const externalAppDevice = (): CeremonyDevice => ({
  enroll: async (input, context) => {
    if (context.signal?.aborted) {
      return cancelled()
    }
    if (!context.show) {
      return noCode()
    }
    const request = await open(input, context)
    if (isDeviceResult(request)) {
      return request
    }
    if (!request.onResult) {
      return stopped(unavailable('device-unavailable'))
    }
    return follow(request, context, listenForResult(request.onResult))
  },
  sign: async (input, context) => {
    if (context.signal?.aborted) {
      return cancelled()
    }
    if (!context.show) {
      return noCode()
    }
    const request = await open(input, context)
    if (isDeviceResult(request)) {
      return request
    }
    return follow(request, context, listenForProofs(request))
  }
})
