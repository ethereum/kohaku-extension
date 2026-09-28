/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "chrome-extension://cgjhdpkjghcgpplimocodhjgcceglpoj/tab.html#/social-recovery/ceremony"}
 */
import {
  carries,
  fakeAssertion,
  fakeAttestation,
  fakeMethod,
  fakeOrchestrator,
  generatePoint,
  hosts,
  installCredentials,
  P256Point,
  SYNCED_FLAGS
} from './harness'

let point: P256Point
let creds: ReturnType<typeof installCredentials>

beforeAll(async () => {
  point = await generatePoint()
})

afterEach(() => creds.restore())

/** The material every packaging call received, on the method or the orchestrator. */
const materials = (
  method: ReturnType<typeof fakeMethod>,
  orchestrator: ReturnType<typeof fakeOrchestrator>
) => [
  ...method.configFrom.mock.calls.map((c) => c[1]),
  ...orchestrator.configFrom.mock.calls.map((c) => c[2]),
  ...method.replyFrom.mock.calls.map((c) => c[2]),
  ...orchestrator.replyFrom.mock.calls.map((c) => c[2])
]

describe('enrollment', () => {
  it('calls navigator.credentials.create, never get', async () => {
    const attestation = fakeAttestation({ flags: SYNCED_FLAGS, point })
    creds = installCredentials({ create: async () => attestation.credential })
    const method = fakeMethod()
    await hosts.enroll({ method, orchestrator: fakeOrchestrator(method) })
    expect(creds.create).toHaveBeenCalledTimes(1)
    expect(creds.get).not.toHaveBeenCalled()
    expect(creds.create.mock.calls[0][0]).toHaveProperty('publicKey')
  })

  it('asks with its own 32-byte challenge and 16-byte user id where the method names none', async () => {
    const attestation = fakeAttestation({ flags: SYNCED_FLAGS, point })
    creds = installCredentials({ create: async () => attestation.credential })
    const method = fakeMethod()
    await hosts.enroll({ method, orchestrator: fakeOrchestrator(method) })
    const publicKey = creds.create.mock.calls[0][0]?.publicKey
    expect(publicKey?.challenge.byteLength).toBe(32)
    expect(publicKey?.user.id.byteLength).toBe(16)
  })

  it('hands the created credential to the method, after the ceremony', async () => {
    const attestation = fakeAttestation({ flags: SYNCED_FLAGS, point })
    creds = installCredentials({ create: async () => attestation.credential })
    const method = fakeMethod()
    const orchestrator = fakeOrchestrator(method)
    await hosts.enroll({ method, orchestrator })

    const packaged = materials(method, orchestrator)
    expect(packaged.length).toBeGreaterThan(0)
    const credentialReached = packaged.some((material) =>
      carries(material, {
        objects: [attestation.credential, attestation.credential.response],
        strings: [attestation.credential.id],
        bytes: [attestation.rawId, point.x]
      })
    )
    expect(credentialReached).toBe(true)

    const created = creds.create.mock.invocationCallOrder[0]
    const packagedAt = [
      ...method.configFrom.mock.invocationCallOrder,
      ...orchestrator.configFrom.mock.invocationCallOrder
    ]
    expect(Math.min(...packagedAt)).toBeGreaterThan(created)
  })
})
;(['testAccess', 'createClaim'] as const).forEach((host) =>
  describe(`the ${host} host`, () => {
    it('calls navigator.credentials.get, never create', async () => {
      const assertion = fakeAssertion({ r: BigInt(11), s: BigInt(12) })
      creds = installCredentials({ get: async () => assertion.credential })
      const method = fakeMethod()
      await hosts[host]({ method, orchestrator: fakeOrchestrator(method) })
      expect(creds.get).toHaveBeenCalledTimes(1)
      expect(creds.create).not.toHaveBeenCalled()
      expect(creds.get.mock.calls[0][0]).toHaveProperty('publicKey')
    })

    it('hands the assertion to the method, after the ceremony', async () => {
      const assertion = fakeAssertion({ r: BigInt(11), s: BigInt(12) })
      creds = installCredentials({ get: async () => assertion.credential })
      const method = fakeMethod()
      const orchestrator = fakeOrchestrator(method)
      await hosts[host]({ method, orchestrator })

      const packaged = materials(method, orchestrator)
      expect(packaged.length).toBeGreaterThan(0)
      const assertionReached = packaged.some((material) =>
        carries(material, {
          objects: [assertion.credential, assertion.credential.response],
          bytes: [assertion.authData, assertion.signature]
        })
      )
      expect(assertionReached).toBe(true)

      const asked = creds.get.mock.invocationCallOrder[0]
      const packagedAt = [
        ...method.replyFrom.mock.invocationCallOrder,
        ...orchestrator.replyFrom.mock.invocationCallOrder
      ]
      expect(Math.min(...packagedAt)).toBeGreaterThan(asked)
    })
  })
)
