/**
 * The browser's own defaults of the ceremony tab: the extension's local
 * storage for the report, its change events for a caller that listens, and the
 * passkey device over `navigator.credentials` at this page's own origin.
 */
import { parse } from '@ambire-common/libs/richJson/richJson'
import { browser, isExtension } from '@web/constants/browserapi'
import { storage } from '@web/extension-services/background/webapi/storage'

import { platformOf } from '../kindLine'
import { createPasskeyDevice } from '../passkeyDevice'
import { passkeysServed } from '../run'
import type { PasskeyCeremonyDevice, Platform, ReportStore, ReportSubscribe } from '../types'
import { relyingPartyOf } from '../webauthn'

/** The extension's local storage, the web build's localStorage outside an extension. */
export const browserReportStore: ReportStore = storage

/**
 * Every key of the report store, for `sweepCeremonyReports`: the extension's
 * local storage, or the web build's localStorage outside an extension.
 */
export const browserReportKeys = async (): Promise<string[]> => {
  if (isExtension && browser?.storage?.local) {
    return Object.keys((await browser.storage.local.get(null)) ?? {})
  }
  if (typeof localStorage === 'undefined') return []
  return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter(
    (key): key is string => key !== null
  )
}

/**
 * Hands `onValue` a changed value as the store's own `get` reads it: stored
 * text parsed with richJson. Text that is not JSON is no report and reaches
 * no caller.
 */
const deliverParsed = (raw: unknown, onValue: (value: unknown) => void) => {
  if (typeof raw !== 'string') {
    onValue(raw)
    return
  }
  let value: unknown
  try {
    value = parse(raw)
  } catch {
    return
  }
  onValue(value)
}

/** Storage change events for one key: `storage.onChanged` in the extension, `storage` events outside. */
export const browserReportSubscribe: ReportSubscribe = (key, onValue) => {
  if (isExtension && browser?.storage?.onChanged) {
    const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === 'local' && changes[key] && changes[key].newValue !== undefined) {
        deliverParsed(changes[key].newValue, onValue)
      }
    }
    browser.storage.onChanged.addListener(listener)
    return () => browser.storage.onChanged.removeListener(listener)
  }
  const listener = (event: StorageEvent) => {
    if (event.key === key && event.newValue !== null) deliverParsed(event.newValue, onValue)
  }
  window.addEventListener('storage', listener)
  return () => window.removeEventListener('storage', listener)
}

/** Whether this page serves passkeys: a Chromium extension origin with `navigator.credentials`. */
export const pagePasskeysServed = (): boolean =>
  passkeysServed({
    protocol: window.location.protocol,
    hasCredentials: typeof navigator !== 'undefined' && !!navigator.credentials
  })

/**
 * The passkey device of this page, or undefined where the page serves no
 * passkey (a Gecko or Safari build, or the web dev server): the host then
 * reports not supported and the screen draws "passkeys need Kohaku on Chrome".
 */
export const browserPasskeyDevice = (): PasskeyCeremonyDevice | undefined =>
  pagePasskeysServed()
    ? createPasskeyDevice({
        credentials: navigator.credentials,
        relyingParty: relyingPartyOf(window.location)
      })
    : undefined

/** The platform this browser runs on, for the device-bound kind line. */
export const pagePlatform = (): Platform =>
  typeof navigator === 'undefined'
    ? 'other'
    : platformOf(
        navigator as Navigator & { userAgentData?: { platform?: string; mobile?: boolean } }
      )
