/**
 * The ceremony a tab runs, from its params and what the caller's record
 * resolves to, and the two gates the tab keeps before it runs anything.
 * Pure: no React, no `navigator`, no storage.
 */
import { createClaimHost, enrollHost, healthCheckHost, testAccessHost } from './hosts'
import type {
  CeremonyOutcome,
  CeremonyParams,
  CeremonyValue,
  ResolvedCeremony,
  RunDeps
} from './types'
import { failed } from './verdicts'

/** Runs the host of `params.call` and returns its one outcome. */
export const runCeremony = async (
  params: CeremonyParams,
  resolved: ResolvedCeremony,
  deps: RunDeps = {}
): Promise<CeremonyOutcome<CeremonyValue>> => {
  const context = {
    orchestrator: resolved.orchestrator,
    method: resolved.method,
    device: resolved.device,
    devices: deps.devices,
    handOff: params.handOff,
    signal: deps.signal,
    onStep: deps.onStep
  }
  switch (params.call) {
    case 'enroll':
      if (!resolved.methodAddress) return failed('thrown', 'The ceremony names no method address.')
      return enrollHost({
        ...context,
        methodAddress: resolved.methodAddress,
        params: resolved.params
      })
    case 'testAccess':
      if (!resolved.request) return failed('thrown', 'The ceremony names no request.')
      return testAccessHost({ ...context, request: resolved.request, params: resolved.params })
    case 'createClaim':
      if (!resolved.request) return failed('thrown', 'The ceremony names no request.')
      return createClaimHost({ ...context, request: resolved.request, params: resolved.params })
    case 'healthCheck':
    default:
      return healthCheckHost(context)
  }
}

/**
 * Whether this surface may run a ceremony: a full tab, never the action popup
 * and never the action window, since a ceremony dies when its page loses
 * focus. TabOnlyRoute already moves the popup to a tab; it keeps an action
 * window that holds a current action, so the screen keeps this gate too.
 */
export const ceremonyMayRun = (ui: {
  isTab: boolean
  isPopup: boolean
  isActionWindow: boolean
}): boolean => ui.isTab && !ui.isPopup && !ui.isActionWindow

/**
 * Whether this page can serve a passkey: a Chromium extension origin with a
 * credentials container. Any other build draws the one state "passkeys need
 * Kohaku on Chrome" and runs no passkey ceremony.
 */
export const passkeysServed = (page: { protocol: string; hasCredentials: boolean }): boolean =>
  page.protocol === 'chrome-extension:' && page.hasCredentials
