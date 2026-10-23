/**
 * The installed zkPassport stack builds the app library's client for the
 * domain the method names, as the SDK's own default does, and changes one
 * thing: a request opens in the library's dev mode exactly where the chain's
 * parameters ask for the test certificate tree. The verifier parameters pass
 * through unchanged. The library is a fake module here, so the peer never
 * loads.
 */
import type { ZkPassportRequestArgs } from '@kohaku-eth/social-recovery'
import { __importStar } from 'tslib'

import type { ZkPassportRequestWithResult } from '@web/modules/social-recovery/shared/ceremony'
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
    const stack = zkPassportStackFor({ testnetTree: true })
    expect(mockLibrary.constructed).toEqual([])
    await stack('kohaku.example')
    expect(mockLibrary.constructed).toEqual(['kohaku.example'])
  })
  ;[true, false].forEach((testnetTree) =>
    it(`opens every request with dev mode ${testnetTree} where the chain's test-tree switch is ${testnetTree}, and changes nothing else`, async () => {
      const client = await zkPassportStackFor({ testnetTree })('kohaku.example')
      ;[false, true].forEach((asked) => {
        // The SDK asks for dev mode off; the switch decides either way.
        client
          .request({ ...ARGS, devMode: asked } as unknown as ZkPassportRequestArgs)
          .catch(() => undefined)
      })
      await Promise.resolve()
      expect(mockLibrary.requests).toEqual([
        { domain: 'kohaku.example', args: { ...ARGS, devMode: testnetTree } },
        { domain: 'kohaku.example', args: { ...ARGS, devMode: testnetTree } }
      ])
    })
  )

  it("hands back the library's own request, whose close cancels that request in the library", async () => {
    const client = await zkPassportStackFor({ testnetTree: true })('kohaku.example')
    const request: ZkPassportRequestWithResult = (await client.request(ARGS)).done()
    expect(request).toMatchObject({
      url: 'https://zkpassport.example/r?id=request-1',
      requestId: 'request-1'
    })
    expect(mockLibrary.cancelled).toEqual([])
    request.close?.()
    expect(mockLibrary.cancelled).toEqual([{ domain: 'kohaku.example', requestId: 'request-1' }])
  })

  it('keeps the close on a request built after a bind, and passes the bind through', async () => {
    const client = await zkPassportStackFor({ testnetTree: true })('kohaku.example')
    const request: ZkPassportRequestWithResult = (await client.request(ARGS))
      .bind('custom_data', '0xabc')
      .done()
    expect(mockLibrary.bound).toEqual([['custom_data', '0xabc']])
    request.close?.()
    expect(mockLibrary.cancelled).toEqual([{ domain: 'kohaku.example', requestId: 'request-1' }])
  })
  ;[true, false].forEach((testnetTree) =>
    it(`passes the verifier parameters through unchanged with the switch ${testnetTree}`, async () => {
      const client = await zkPassportStackFor({ testnetTree })('kohaku.example')
      const asked = {
        proof: { name: 'outer_evm_count_4' },
        domain: 'kohaku.example',
        scope: 'kohaku-recovery',
        devMode: false as const
      }
      expect(client.getSolidityVerifierParameters(asked)).toBe(mockLibrary.answer)
      expect(mockLibrary.parameters).toEqual([{ domain: 'kohaku.example', args: asked }])
    })
  )

  it("does not leak one stack's switch into another's", async () => {
    const test = await zkPassportStackFor({ testnetTree: true })('a.example')
    const production = await zkPassportStackFor({ testnetTree: false })('b.example')
    await production.request(ARGS)
    await test.request(ARGS)
    expect(mockLibrary.requests).toEqual([
      { domain: 'b.example', args: { ...ARGS, devMode: false } },
      { domain: 'a.example', args: { ...ARGS, devMode: true } }
    ])
  })
})
