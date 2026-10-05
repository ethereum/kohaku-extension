/**
 * The passkey row's kind line: "Synced passkey · {{provider}}"
 * or "Device-bound passkey · {{device}}", with the names of the
 * `socialRecovery.ceremony.providers` and `.devices` blocks of en.json.
 *
 * - The kind comes from the ceremony's own backup flags (`passkeyKindOf`).
 * - The provider of a synced passkey comes from the authenticator's own facts:
 *   its AAGUID. Apple's and Google's known AAGUIDs name Apple and Google; any
 *   other AAGUID, a zeroed one or none names "your password manager".
 * - The device of a device-bound passkey comes from the platform: a phone
 *   answering over the hybrid route is "this phone"; an authenticator on this
 *   device is "this Mac" on macOS, "this phone" on Android or iOS, and "this
 *   device" elsewhere; a security key or an unknown place is "this device".
 *
 * Pure: the platform is a parameter, read from `navigator` by the screen.
 */
import type { Translate } from '../display'
import type { KindLine, PasskeyDevice, PasskeyFacts, PasskeyProvider, Platform } from './types'

export const PASSKEY_PROVIDERS = ['apple', 'google', 'passwordManager'] as const

export const PASSKEY_DEVICES = ['thisDevice', 'thisMac', 'thisPhone'] as const

export const PLATFORMS = ['mac', 'phone', 'other'] as const

/**
 * The AAGUIDs that name a platform provider, from the community list of
 * passkey provider AAGUIDs (github.com/passkeydeveloper/passkey-authenticator-aaguids).
 */
export const PROVIDER_AAGUIDS: {
  readonly [aaguid: string]: Exclude<PasskeyProvider, 'passwordManager'>
} = {
  // Google Password Manager
  'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4': 'google',
  // iCloud Keychain
  'fbfc3007-154e-4ecc-8c0b-6e020557d7bd': 'apple',
  // iCloud Keychain (Managed)
  'dd4ec289-e01d-41c9-bb89-70fa845d4bf2': 'apple'
}

/** The provider that syncs a passkey, from its AAGUID. */
export const providerOf = (facts: Pick<PasskeyFacts, 'aaguid'>): PasskeyProvider =>
  (facts.aaguid && PROVIDER_AAGUIDS[facts.aaguid.toLowerCase()]) || 'passwordManager'

/**
 * The platform the browser runs on, from `navigator.userAgentData.platform`
 * where the browser has it and from `navigator.platform` and the user agent
 * otherwise.
 */
export const platformOf = (nav: {
  userAgentData?: { platform?: string; mobile?: boolean }
  platform?: string
  userAgent?: string
}): Platform => {
  const hint = nav.userAgentData?.platform ?? ''
  const platform = nav.platform ?? ''
  const agent = nav.userAgent ?? ''
  if (nav.userAgentData?.mobile || /android|ios/i.test(hint) || /android|iphone|ipad/i.test(agent))
    return 'phone'
  if (/mac/i.test(hint) || /^mac/i.test(platform)) return 'mac'
  return 'other'
}

/** The device a device-bound passkey lives on, from its place and the platform. */
export const deviceOf = (facts: Pick<PasskeyFacts, 'place'>, platform: Platform): PasskeyDevice => {
  if (facts.place === 'phone') return 'thisPhone'
  if (facts.place !== 'this-device') return 'thisDevice'
  if (platform === 'mac') return 'thisMac'
  if (platform === 'phone') return 'thisPhone'
  return 'thisDevice'
}

/** The kind line of a passkey's facts on `platform`. */
export const kindLineOf = (
  facts: Pick<PasskeyFacts, 'kind' | 'aaguid' | 'place'>,
  platform: Platform
): KindLine =>
  facts.kind === 'synced'
    ? {
        key: 'socialRecovery.ceremony.syncedKind',
        param: 'provider',
        nameKey: `socialRecovery.ceremony.providers.${providerOf(facts)}`
      }
    : {
        key: 'socialRecovery.ceremony.deviceBoundKind',
        param: 'device',
        nameKey: `socialRecovery.ceremony.devices.${deviceOf(facts, platform)}`
      }

/** The loss line under a kind. */
export const lossLineKeyOf = (facts: Pick<PasskeyFacts, 'kind'>): string =>
  facts.kind === 'synced'
    ? 'socialRecovery.ceremony.syncedLoss'
    : 'socialRecovery.ceremony.deviceBoundLoss'

/** The kind line rendered with `t`. */
export const renderKindLine = (
  facts: Pick<PasskeyFacts, 'kind' | 'aaguid' | 'place'>,
  platform: Platform,
  t: Translate
): string => {
  const line = kindLineOf(facts, platform)
  return t(line.key, { [line.param]: t(line.nameKey) })
}
