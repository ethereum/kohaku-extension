/**
 * @jest-environment jsdom
 *
 * The hook's client takes the listed account's own facts when its caller
 * passes none: a smart account's creation record and associated keys, so the
 * removed-key read names the key; a basic or unlisted account gives none, as
 * before. The client is the real one, built over the stand-in's scripted
 * chain, with the extension's provider mocked over that chain.
 */
import * as React from 'react'
import { createRoot, Root } from 'react-dom/client'

import type { Account } from '@ambire-common/interfaces/account'
import { dedicatedToOneSAPriv } from '@ambire-common/interfaces/keystore'
import { getBasicAccount, getSmartAccount } from '@ambire-common/libs/account/account'
import { getRpcProvider } from '@ambire-common/services/provider/getRpcProvider'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import type { Address, CreationRecord } from '@web/modules/social-recovery/sdk-interfaces'
import { useRecoveryClient } from '@web/modules/social-recovery/shared/client/useRecoveryClient'

import {
  BuilderSpies,
  CONTROLLING_KEY,
  createWorld,
  creationRecordOf,
  HookState,
  lastArg,
  networkRecord,
  spyOnBuilder,
  WALLET_RECOVERY_CHAIN,
  World
} from '@web/modules/social-recovery/shared/client/__tests__/harness'

jest.mock('@ambire-common/services/provider/getRpcProvider', () => ({
  getRpcProvider: jest.fn()
}))
jest.mock('@web/hooks/useNetworksControllerState', () => ({ __esModule: true, default: jest.fn() }))
jest.mock('@web/hooks/useAccountsControllerState', () => ({ __esModule: true, default: jest.fn() }))
// viem builds a TextEncoder and a TextDecoder when either entry loads, which
// jsdom lacks: Node's own are installed first, whichever entry loads first.
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

// React 18.3.0 exports `act` only as `unstable_act`; the react-dom re-export warns on every call.
const act: typeof React.act =
  (React as unknown as { act?: typeof React.act }).act ??
  (React as unknown as { unstable_act: typeof React.act }).unstable_act
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const buildProvider = getRpcProvider as jest.Mock
const accountsState = useAccountsControllerState as jest.Mock
const networksState = useNetworksControllerState as jest.Mock

const BASIC = '0x00000000000000000000000000000000000ba51c' as Address
const STRANGER = '0x0000000000000000000000000000000000057a9e' as Address

let smart: Account
let basic: Account
let world: World
let builder: BuilderSpies
/** The accounts the wallet lists; undefined until the background pushed them. */
let listed: Account[] | undefined
let latest: HookState | undefined
let root: Root

const Probe = ({
  account,
  facts
}: {
  account: Address
  facts?: Parameters<typeof useRecoveryClient>[1]
}) => {
  latest = useRecoveryClient(account, facts)
  return null
}

/** Renders the hook for `account`, the stand-in's chain for it holding one key entry: the controlling key. */
const render = async (account: Address, facts?: Parameters<typeof useRecoveryClient>[1]) => {
  if (!world || world.account !== account) {
    world = createWorld({ account })
    world.chain.authorities = [CONTROLLING_KEY]
  }
  await act(async () => {
    root.render(React.createElement(Probe, { account, facts }))
  })
}

const removedKeyOf = async () => {
  if (latest?.status !== 'ready') {
    throw new Error(`The hook is ${latest?.status}, not ready.`)
  }
  return latest.client.walletReads.removedKey()
}

beforeAll(async () => {
  smart = await getSmartAccount([{ addr: CONTROLLING_KEY, hash: dedicatedToOneSAPriv }], [])
  basic = getBasicAccount(BASIC, [])
})

beforeEach(() => {
  listed = [basic, smart]
  accountsState.mockImplementation(() => ({ accounts: listed }))
  networksState.mockImplementation(() => ({ networks: [networkRecord(WALLET_RECOVERY_CHAIN)] }))
  buildProvider.mockImplementation(() => world.ethers)
  builder = spyOnBuilder()
  root = createRoot(document.createElement('div'))
  latest = undefined
})

afterEach(async () => {
  await act(async () => root.unmount())
  jest.restoreAllMocks()
  jest.clearAllMocks()
  world = undefined as unknown as World
})

describe('useRecoveryClient with no facts given', () => {
  it("builds a listed smart account's client with its creation record and associated keys", async () => {
    await render(smart.addr as Address)
    expect(latest?.status).toBe('ready')
    expect(lastArg(builder.config)).toMatchObject({
      creation: creationRecordOf(smart),
      candidateKeys: [CONTROLLING_KEY]
    })
  })

  it('names the controlling key from the removed-key read, no longer answering no-creation-record', async () => {
    await render(smart.addr as Address)
    await expect(removedKeyOf()).resolves.toEqual({ kind: 'named', key: CONTROLLING_KEY })
  })

  it('finds the listed account whatever the case of the address it is given', async () => {
    await render(smart.addr.toLowerCase() as Address)
    await expect(removedKeyOf()).resolves.toEqual({ kind: 'named', key: CONTROLLING_KEY })
  })

  it('answers no-creation-record for a basic account, as before', async () => {
    await render(BASIC)
    expect(lastArg(builder.config)).not.toHaveProperty('creation')
    await expect(removedKeyOf()).resolves.toEqual({
      kind: 'unavailable',
      cause: 'no-creation-record'
    })
  })

  it('answers no-creation-record for an account the wallet does not list', async () => {
    await render(STRANGER)
    expect(latest?.status).toBe('ready')
    await expect(removedKeyOf()).resolves.toEqual({
      kind: 'unavailable',
      cause: 'no-creation-record'
    })
  })

  it('stays loading and builds nothing until the wallet pushed its accounts, then builds with them', async () => {
    listed = undefined
    await render(smart.addr as Address)
    expect(latest?.status).toBe('loading')
    expect(buildProvider).not.toHaveBeenCalled()
    expect(builder.buildSetupClient).not.toHaveBeenCalled()

    listed = [basic, smart]
    await render(smart.addr as Address)
    expect(latest?.status).toBe('ready')
    expect(buildProvider).toHaveBeenCalledTimes(1)
    await expect(removedKeyOf()).resolves.toEqual({ kind: 'named', key: CONTROLLING_KEY })
  })

  it("builds once while the listed accounts change but the account's facts do not", async () => {
    await render(smart.addr as Address)
    listed = [smart, basic, getBasicAccount(STRANGER, [])]
    await render(smart.addr as Address)
    expect(buildProvider).toHaveBeenCalledTimes(1)
    expect(builder.buildSetupClient).toHaveBeenCalledTimes(1)
  })
})

describe('useRecoveryClient with facts given', () => {
  const OTHER: CreationRecord = {
    factory: '0x00000000000000000000000000000000000fac70',
    bytecode: '0x6001',
    salt: `0x${'01'.repeat(32)}`,
    block: 12
  }

  it("builds with the caller's facts, not the listed account's", async () => {
    await render(smart.addr as Address, { creation: OTHER, candidateKeys: [BASIC] })
    expect(lastArg(builder.config)).toMatchObject({ creation: OTHER, candidateKeys: [BASIC] })
  })

  it("keeps the caller's empty facts for a listed smart account, so the read answers no-creation-record", async () => {
    await render(smart.addr as Address, {})
    await expect(removedKeyOf()).resolves.toEqual({
      kind: 'unavailable',
      cause: 'no-creation-record'
    })
  })

  it('builds without waiting for the listed accounts', async () => {
    listed = undefined
    await render(smart.addr as Address, { creation: OTHER })
    expect(latest?.status).toBe('ready')
  })
})
