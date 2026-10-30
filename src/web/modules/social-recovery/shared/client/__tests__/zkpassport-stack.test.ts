/**
 * The installed zkPassport stack builds the app library's client for the
 * domain the method names, as the SDK's own default does. A request and the
 * verifier parameters reach the library with the dev mode the method asks
 * for. The library is a fake module here, so the peer never loads.
 */
import type { ZkPassportRequestArgs } from '@kohaku-eth/social-recovery'
import { __importStar } from 'tslib'

import { zkPassportStackFor } from '@web/modules/social-recovery/shared/client/zkpassport-stack'

const mockLibrary = {
  constructed: [] as string[],
  requests: [] as unknown[],
  parameters: [] as unknown[],
  cancelled: [] as unknown[],
  bound: [] as [string, string][],
  answer: { version: 'v' }
}

/** The library's own builder: each `done` hands out a fresh request. */
const mockBuilder = (requestId: string) => ({
  bind: (key: string, value: string) => {
    mockLibrary.bound.push([key, value])
    return mockBuilder(requestId)
  },
  done: () => ({ url: `https://zkpassport.example/r?id=${requestId}`, requestId })
})

jest.mock(
  '@zkpassport/sdk',
  () => ({
    ZKPassport: class {
      readonly domain: string

      constructor(domain: string) {
        this.domain = domain
        mockLibrary.constructed.push(domain)
      }

      // Both members read `this`, as the library's own do.
      async request(args: unknown) {
        mockLibrary.requests.push({ domain: this.domain, args })
        return mockBuilder(`request-${mockLibrary.requests.length}`)
      }

      cancelRequest(requestId: string) {
        mockLibrary.cancelled.push({ domain: this.domain, requestId })
      }

      getSolidityVerifierParameters(args: unknown) {
        mockLibrary.parameters.push({ domain: this.domain, args })
        return mockLibrary.answer
      }
    }
  }),
  { virtual: true }
)

// The repository compiles with `noEmitHelpers`, so under Jest a dynamic import
// reaches for the interop helper as a global; the build's bundler needs none.
Object.assign(globalThis, { __importStar })

beforeEach(() => {
  mockLibrary.constructed = []
  mockLibrary.requests = []
  mockLibrary.parameters = []
  mockLibrary.cancelled = []
  mockLibrary.bound = []
})

const ARGS: ZkPassportRequestArgs = {
  scope: 'kohaku-recovery',
  name: 'Kohaku',
  purpose: 'Approve the recovery',
  mode: 'compressed-evm',
  devMode: false
}

describe('the installed zkPassport stack', () => {
  it('builds no library client until the method asks for one, then one for the domain it names', async () => {
    const stack = zkPassportStackFor()
    expect(mockLibrary.constructed).toEqual([])
    await stack('kohaku.example')
    expect(mockLibrary.constructed).toEqual(['kohaku.example'])
  })
  it('opens every request with the dev mode the method asks for, and changes nothing else', async () => {
    const client = await zkPassportStackFor()('kohaku.example')
    await client.request({ ...ARGS, devMode: false })
    await client.request({ ...ARGS, devMode: true })
    expect(mockLibrary.requests).toEqual([
      { domain: 'kohaku.example', args: { ...ARGS, devMode: false } },
      { domain: 'kohaku.example', args: { ...ARGS, devMode: true } }
    ])
  })

  it("hands back the library's own request, and cancels a request in the library", async () => {
    const client = await zkPassportStackFor()('kohaku.example')
    const request = (await client.request(ARGS)).done()
    expect(request).toMatchObject({
      url: 'https://zkpassport.example/r?id=request-1',
      requestId: 'request-1'
    })
    expect(mockLibrary.cancelled).toEqual([])
    client.cancelRequest(request.requestId)
    expect(mockLibrary.cancelled).toEqual([{ domain: 'kohaku.example', requestId: 'request-1' }])
  })

  it('passes the bind through', async () => {
    const client = await zkPassportStackFor()('kohaku.example')
    ;(await client.request(ARGS)).bind('custom_data', '0xabc').done()
    expect(mockLibrary.bound).toEqual([['custom_data', '0xabc']])
  })
  ;[true, false].forEach((devMode) =>
    it(`passes the verifier parameters through unchanged with dev mode ${devMode}`, async () => {
      const client = await zkPassportStackFor()('kohaku.example')
      const asked = {
        proof: { name: 'outer_evm_count_4' },
        domain: 'kohaku.example',
        scope: 'kohaku-recovery',
        devMode
      }
      expect(client.getSolidityVerifierParameters(asked)).toBe(mockLibrary.answer)
      expect(mockLibrary.parameters).toEqual([{ domain: 'kohaku.example', args: asked }])
    })
  )
})
