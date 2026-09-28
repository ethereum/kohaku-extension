/**
 * @jest-environment jsdom
 */
import * as React from 'react'
import { createRoot, Root } from 'react-dom/client'

import type { Network } from '@ambire-common/interfaces/network'
import { getRpcProvider } from '@ambire-common/services/provider/getRpcProvider'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import type { Address, IProvider } from '@web/modules/social-recovery/sdk-interfaces'
import { buildRecoveryClient } from '@web/modules/social-recovery/shared/client/build-client'
import { useRecoveryClient } from '@web/modules/social-recovery/shared/client/useRecoveryClient'

// The client build is stubbed: the SDK doubles need a TextEncoder that jsdom lacks,
// and these tests look at the provider the hook builds, not at the client.
jest.mock('@web/modules/social-recovery/shared/client/build-client', () => ({
  buildRecoveryClient: jest.fn(),
  isDigestVersionRefusal: () => false
}))
jest.mock('@ambire-common/services/provider/getRpcProvider', () => ({
  getRpcProvider: jest.fn()
}))
jest.mock('@web/hooks/useNetworksControllerState', () => ({
  __esModule: true,
  default: jest.fn()
}))
// viem builds a TextEncoder and a TextDecoder when either entry the client
// imports loads, which jsdom lacks: Node's own are installed first, whichever
// entry loads first.
jest.mock('viem', () => {
  // eslint-disable-next-line global-require
  const { TextDecoder, TextEncoder } = require('util')
  Object.assign(globalThis, { TextDecoder, TextEncoder })
  return jest.requireActual('viem')
})
jest.mock('viem/chains', () => {
  // eslint-disable-next-line global-require
  const { TextDecoder, TextEncoder } = require('util')
  Object.assign(globalThis, { TextDecoder, TextEncoder })
  return jest.requireActual('viem/chains')
})

const buildProvider = getRpcProvider as jest.Mock
const buildClient = buildRecoveryClient as jest.Mock
const networksState = useNetworksControllerState as jest.Mock

// React 18.3.0 exports `act` only as `unstable_act`; the react-dom re-export warns on every call.
const act: typeof React.act =
  (React as unknown as { act?: typeof React.act }).act ??
  (React as unknown as { unstable_act: typeof React.act }).unstable_act
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const SEPOLIA = 11155111
const ACCOUNT = '0x00000000000000000000000000000000000a11ce' as Address
const GAS_PRICE = 7n * 10n ** 9n

const sepolia = (overrides: Partial<Network> = {}): Network =>
  ({
    chainId: BigInt(SEPOLIA),
    name: 'Sepolia',
    rpcUrls: ['https://rpc.example/sepolia'],
    selectedRpcUrl: 'https://rpc.example/sepolia',
    rpcProvider: 'colibri',
    proverRpcUrl: 'https://prover.example/one',
    consensusRpcUrl: 'https://consensus.example/one',
    heliosCheckpoint: `0x${'01'.repeat(32)}`,
    ...overrides
  } as Network)

interface ProviderMock {
  send: jest.Mock
  destroy: jest.Mock
}

const providerMock = (): ProviderMock => ({
  send: jest.fn(async (method: string) => {
    if (method === 'eth_chainId') return `0x${SEPOLIA.toString(16)}`
    if (method === 'eth_gasPrice') return `0x${GAS_PRICE.toString(16)}`
    throw new Error(`The provider mock does not answer ${method}.`)
  }),
  destroy: jest.fn()
})

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

type HookState = ReturnType<typeof useRecoveryClient>

let built: ProviderMock[]
let network: Network
let latest: HookState | undefined
/** Every state the hook returned, one per render, in order. */
let seen: HookState[]
let root: Root

const clientOf = (state: HookState | undefined): unknown =>
  state?.status === 'ready' ? state.client : undefined

const readsOf = (state: HookState | undefined) => {
  if (state?.status !== 'ready') throw new Error(`The hook is ${state?.status}, not ready.`)
  return state.reads
}

const Probe = ({ account }: { account: Address }) => {
  latest = useRecoveryClient(account)
  seen.push(latest)
  return null
}

const render = async () => {
  await act(async () => {
    root.render(React.createElement(Probe, { account: ACCOUNT }))
  })
}

/** Hands the hook another network record, as the controller state pushes one. */
const pushNetwork = async (next: Network) => {
  network = next
  await render()
}

beforeEach(() => {
  built = []
  buildProvider.mockImplementation(() => {
    const provider = providerMock()
    built.push(provider)
    return provider
  })
  buildClient.mockImplementation(async ({ chain, account }) => ({ chain, account }))
  network = sepolia()
  networksState.mockImplementation(() => ({ networks: [network] }))
  root = createRoot(document.createElement('div'))
  latest = undefined
  seen = []
})

afterEach(async () => {
  await act(async () => root.unmount())
  jest.clearAllMocks()
})

describe('useRecoveryClient over the network record', () => {
  it('builds one provider for the network record and a ready client over it', async () => {
    await render()
    expect(buildProvider).toHaveBeenCalledTimes(1)
    expect(buildProvider.mock.calls[0][0]).toBe(network)
    expect(buildClient).toHaveBeenCalledTimes(1)
    expect(latest?.status).toBe('ready')
  })

  it('tears the provider down when the hook unmounts', async () => {
    await render()
    await act(async () => root.unmount())
    expect(built[0].destroy).toHaveBeenCalledTimes(1)
  })

  const INPUTS: [keyof Network, string][] = [
    ['proverRpcUrl', 'https://prover.example/two'],
    ['consensusRpcUrl', 'https://consensus.example/two']
  ]
  INPUTS.forEach(([input, value]) =>
    it(`builds a new provider and tears down the old one when only ${input} changes`, async () => {
      await render()
      const [first] = built
      await pushNetwork(sepolia({ [input]: value }))
      expect(buildProvider).toHaveBeenCalledTimes(2)
      expect(buildProvider.mock.calls[1][0]).toMatchObject({ [input]: value })
      expect(first.destroy).toHaveBeenCalledTimes(1)
      expect(built[1].destroy).not.toHaveBeenCalled()
      expect(buildClient).toHaveBeenCalledTimes(2)
      expect(latest?.status).toBe('ready')
    })
  )

  it('builds the new client and the new reads over the new provider alone', async () => {
    await render()
    const [first] = built
    await pushNetwork(sepolia({ proverRpcUrl: 'https://prover.example/two' }))
    const second = built[1]
    first.send.mockClear()

    const adapter = (buildClient.mock.calls[1][0] as { provider: IProvider }).provider
    await expect(adapter.chainId()).resolves.toBe(SEPOLIA)
    expect(second.send).toHaveBeenCalledWith('eth_chainId', [])

    await expect(readsOf(latest).gasPrice()).resolves.toBe(GAS_PRICE)
    expect(second.send).toHaveBeenCalledWith('eth_gasPrice', [])
    expect(first.send).not.toHaveBeenCalled()
  })

  it('reports loading on the render right after a key change, never the old client', async () => {
    await render()
    const old = clientOf(latest)
    expect(old).toBeDefined()
    const before = seen.length
    await pushNetwork(sepolia({ proverRpcUrl: 'https://prover.example/two' }))
    const after = seen.slice(before)
    expect(after[0].status).toBe('loading')
    expect(after.filter((state) => clientOf(state) === old)).toEqual([])
    expect(clientOf(latest)).toBeDefined()
    expect(clientOf(latest)).not.toBe(old)
  })

  it('drops a client whose build finishes after the network moved on', async () => {
    const firstBuild = deferred<object>()
    const firstClient = { build: 'first' }
    const secondClient = { build: 'second' }
    buildClient
      .mockImplementationOnce(() => firstBuild.promise)
      .mockImplementationOnce(async () => secondClient)
    await render()
    expect(latest?.status).toBe('loading')
    await pushNetwork(sepolia({ proverRpcUrl: 'https://prover.example/two' }))
    expect(clientOf(latest)).toBe(secondClient)

    await act(async () => {
      firstBuild.resolve(firstClient)
    })
    expect(clientOf(latest)).toBe(secondClient)
    expect(seen.filter((state) => clientOf(state) === firstClient)).toEqual([])
  })

  it('reports a provider build that throws as failed, and builds again on retry', async () => {
    const thrown = new Error('The RPC list is empty.')
    buildProvider.mockImplementationOnce(() => {
      throw thrown
    })
    await render()
    expect(latest?.status).toBe('failed')
    expect(latest?.status === 'failed' && latest.error).toBe(thrown)
    expect(buildClient).not.toHaveBeenCalled()

    await act(async () => latest?.retry())
    expect(buildProvider).toHaveBeenCalledTimes(2)
    expect(latest?.status).toBe('ready')
  })

  it('keeps the provider when only the light client checkpoint changes, since the background writes each new one', async () => {
    network = sepolia({ rpcProvider: 'helios' })
    await render()
    await pushNetwork(sepolia({ rpcProvider: 'helios', heliosCheckpoint: `0x${'02'.repeat(32)}` }))
    expect(buildProvider).toHaveBeenCalledTimes(1)
    expect(built[0].destroy).not.toHaveBeenCalled()
    expect(buildClient).toHaveBeenCalledTimes(1)
    expect(latest?.status).toBe('ready')
  })

  it('builds nothing new and tears nothing down when an equal network record arrives', async () => {
    await render()
    await pushNetwork(sepolia())
    await pushNetwork(sepolia())
    expect(buildProvider).toHaveBeenCalledTimes(1)
    expect(built[0].destroy).not.toHaveBeenCalled()
    expect(buildClient).toHaveBeenCalledTimes(1)
    expect(latest?.status).toBe('ready')
  })
})
