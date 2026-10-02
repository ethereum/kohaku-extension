/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "chrome-extension://cgjhdpkjghcgpplimocodhjgcceglpoj/tab.html#/social-recovery/ceremony"}
 */
/**
 * Byte 32 of the authenticator data holds the flags; BE (0x08) says the
 * credential is backup eligible, a multi-device (synced) credential, BS (0x10)
 * that it is backed up. A credential with neither is device bound.
 */
/* eslint-disable no-bitwise -- the flags are bits */
import i18n from '@common/config/localization'

import {
  APPLE_AAGUID,
  authenticatorData,
  browserDefaults,
  ceremony,
  DEVICE_BOUND_FLAGS,
  enrolledKind,
  fakeAttestation,
  fakeMethod,
  fakeOrchestrator,
  FLAGS,
  generatePoint,
  GOOGLE_AAGUID,
  hosts,
  installCredentials,
  kindFromAuthData,
  Outcome,
  P256Point,
  SYNCED_FLAGS,
  UNKNOWN_AAGUID,
  ZERO_AAGUID,
  zeroHash
} from '@web/modules/social-recovery/shared/ceremony/__tests__/harness'

let point: P256Point

beforeAll(async () => {
  point = await generatePoint()
})

describe('the kind read from authenticator data flags', () => {
  it('reads BE and BS set as synced', () => {
    expect(kindFromAuthData(authenticatorData({ flags: SYNCED_FLAGS }))).toBe('synced')
  })

  it('reads BE and BS clear as device bound', () => {
    expect(kindFromAuthData(authenticatorData({ flags: DEVICE_BOUND_FLAGS }))).toBe('device-bound')
  })

  it('reads the same flags the same way with attested credential data after them', () => {
    const rawId = new Uint8Array([9, 8, 7, 6])
    const synced = authenticatorData({ flags: SYNCED_FLAGS | FLAGS.AT, credentialId: rawId, point })
    const bound = authenticatorData({
      flags: DEVICE_BOUND_FLAGS | FLAGS.AT,
      credentialId: rawId,
      point
    })
    expect(kindFromAuthData(synced)).toBe('synced')
    expect(kindFromAuthData(bound)).toBe('device-bound')
  })

  it('reads the kind from BE and BS alone, whatever the other bits say', () => {
    // UP and UV clear, the rp id hash all zero: only BE and BS decide.
    expect(
      kindFromAuthData(authenticatorData({ flags: FLAGS.BE | FLAGS.BS, rpIdHash: zeroHash }))
    ).toBe('synced')
    expect(kindFromAuthData(authenticatorData({ flags: 0, rpIdHash: zeroHash }))).toBe(
      'device-bound'
    )
    expect(kindFromAuthData(authenticatorData({ flags: FLAGS.UV, rpIdHash: zeroHash }))).toBe(
      'device-bound'
    )
  })
})

describe('the kind an enrollment reports', () => {
  let creds: ReturnType<typeof installCredentials>

  afterEach(() => creds.restore())

  // The attachment is set against the flags each time: a phone's synced
  // passkey arrives cross-platform, and a platform authenticator can be device
  // bound. The kind follows the flags, never the attachment.
  it('reports synced from the flags of a cross-platform credential', async () => {
    creds = installCredentials({
      create: async () =>
        fakeAttestation({ flags: SYNCED_FLAGS, point, attachment: 'cross-platform' }).credential
    })
    const method = fakeMethod()
    const outcome = await hosts.enroll({ method, orchestrator: fakeOrchestrator(method) })
    expect(outcome).toMatchObject({ type: 'verdict', verdict: 'passed' })
    expect(enrolledKind(outcome)).toBe('synced')
  })

  it('reports device bound from the flags of a platform credential', async () => {
    creds = installCredentials({
      create: async () =>
        fakeAttestation({ flags: DEVICE_BOUND_FLAGS, point, attachment: 'platform' }).credential
    })
    const method = fakeMethod()
    const outcome = await hosts.enroll({ method, orchestrator: fakeOrchestrator(method) })
    expect(outcome).toMatchObject({ type: 'verdict', verdict: 'passed' })
    expect(enrolledKind(outcome)).toBe('device-bound')
  })
})

/**
 * The provider comes from the authenticator's AAGUID; the device of a
 * device-bound passkey from where the authenticator sat and the platform the
 * browser runs on. The line is read through the real en.json.
 */
describe('the kind line of an enrollment', () => {
  let creds: ReturnType<typeof installCredentials>
  const saved = Object.getOwnPropertyDescriptor(navigator, 'platform')

  const setPlatform = (platform: string) =>
    Object.defineProperty(navigator, 'platform', { configurable: true, get: () => platform })

  afterEach(() => {
    creds.restore()
    if (saved) {
      Object.defineProperty(navigator, 'platform', saved)
    } else {
      delete (navigator as unknown as Record<string, unknown>).platform
    }
  })

  const enrollWith = async (attestation: Parameters<typeof fakeAttestation>[0]) => {
    creds = installCredentials({ create: async () => fakeAttestation(attestation).credential })
    const method = fakeMethod()
    const outcome: Outcome = await hosts.enroll({ method, orchestrator: fakeOrchestrator(method) })
    expect(outcome).toMatchObject({ type: 'verdict', verdict: 'passed' })
    const facts = (
      outcome.raw as {
        value: { facts: Parameters<ReturnType<typeof ceremony>['renderKindLine']>[0] }
      }
    ).value.facts
    // The line the screen renders: the page's own platform and the app's own strings.
    return ceremony().renderKindLine(facts, browserDefaults().pagePlatform(), i18n.t)
  }

  it("names Google for a synced passkey with Google Password Manager's AAGUID", async () => {
    setPlatform('MacIntel')
    const line = await enrollWith({
      flags: SYNCED_FLAGS,
      point,
      attachment: 'cross-platform',
      transports: ['hybrid'],
      aaguid: GOOGLE_AAGUID
    })
    expect(line).toBe('Synced passkey · Google')
  })

  it("names Apple for a synced passkey with iCloud Keychain's AAGUID", async () => {
    setPlatform('MacIntel')
    const line = await enrollWith({
      flags: SYNCED_FLAGS,
      point,
      attachment: 'platform',
      transports: ['internal', 'hybrid'],
      aaguid: APPLE_AAGUID
    })
    expect(line).toBe('Synced passkey · Apple')
  })

  it('names your password manager for an unknown AAGUID', async () => {
    setPlatform('MacIntel')
    const line = await enrollWith({ flags: SYNCED_FLAGS, point, aaguid: UNKNOWN_AAGUID })
    expect(line).toBe('Synced passkey · your password manager')
  })

  it('names your password manager for a zeroed AAGUID', async () => {
    setPlatform('MacIntel')
    const line = await enrollWith({ flags: SYNCED_FLAGS, point, aaguid: ZERO_AAGUID })
    expect(line).toBe('Synced passkey · your password manager')
  })

  it("reads a known provider's AAGUID with BE clear as device bound, never synced", async () => {
    setPlatform('MacIntel')
    const line = await enrollWith({
      flags: DEVICE_BOUND_FLAGS,
      point,
      attachment: 'platform',
      transports: ['internal'],
      aaguid: APPLE_AAGUID
    })
    expect(line).toBe('Device-bound passkey · this Mac')
  })

  it('names this phone for a device-bound passkey over the hybrid route', async () => {
    setPlatform('MacIntel')
    const line = await enrollWith({
      flags: DEVICE_BOUND_FLAGS,
      point,
      attachment: 'cross-platform',
      transports: ['hybrid']
    })
    expect(line).toBe('Device-bound passkey · this phone')
  })

  it('names this Mac for a device-bound platform authenticator on macOS', async () => {
    setPlatform('MacIntel')
    const line = await enrollWith({
      flags: DEVICE_BOUND_FLAGS,
      point,
      attachment: 'platform',
      transports: ['internal']
    })
    expect(line).toBe('Device-bound passkey · this Mac')
  })

  it('names this device for a device-bound platform authenticator elsewhere', async () => {
    setPlatform('Linux x86_64')
    const line = await enrollWith({
      flags: DEVICE_BOUND_FLAGS,
      point,
      attachment: 'platform',
      transports: ['internal']
    })
    expect(line).toBe('Device-bound passkey · this device')
  })
})
