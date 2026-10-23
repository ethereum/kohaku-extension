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

import { zkPassportStackFor } from '@web/modules/social-recovery/shared/client/zkpassport-stack'

const mockLibrary = {
  constructed: [] as string[],
  requests: [] as unknown[],
  parameters: [] as unknown[],
  builder: { done: () => 'request' },
  answer: { version: 'v' }
}

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
        return mockLibrary.builder
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

  it("hands back the library's own request builder", async () => {
    const client = await zkPassportStackFor({ testnetTree: true })('kohaku.example')
    await expect(client.request(ARGS)).resolves.toBe(mockLibrary.builder)
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
