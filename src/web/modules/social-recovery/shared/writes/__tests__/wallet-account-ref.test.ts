/**
 * The account a write's gas check names as the one the key operates, filled
 * from the facts the wallet holds for the listed account: its address, its
 * label, whether it has code and the factory its creation record names.
 */
import { Wallet } from 'ethers'

import type { Account } from '@ambire-common/interfaces/account'
import { dedicatedToOneSAPriv } from '@ambire-common/interfaces/keystore'
import type { Network } from '@ambire-common/interfaces/network'
import { getBasicAccount, getSmartAccount } from '@ambire-common/libs/account/account'
import type { Address } from '@web/modules/social-recovery/sdk-interfaces'
import {
  accountBatchTransactionOf,
  accountFactsOf,
  CHAIN_IDS,
  type ListedAccountFacts,
  WALLET_RECOVERY_CHAIN
} from '@web/modules/social-recovery/shared/client'

import {
  ACCOUNT_FACTORY,
  KEY,
  mockReads,
  runGasCheck,
  SAVE,
  walletAccountRefOf
} from '@web/modules/social-recovery/shared/writes/__tests__/harness'

const CHAIN = String(CHAIN_IDS[WALLET_RECOVERY_CHAIN])
const NETWORK = {
  chainId: BigInt(CHAIN_IDS[WALLET_RECOVERY_CHAIN]),
  name: 'Sepolia',
  nativeAssetSymbol: 'ETH'
} as Network
const OTHER_FACTORY: Address = '0xfa00000000000000000000000000000000000fac'
const BASIC = new Wallet(`0x${'77'.repeat(32)}`).address as Address

let smart: Account
let otherFactory: Account
let basic: Account

beforeAll(async () => {
  smart = {
    ...(await getSmartAccount([{ addr: KEY.addr, hash: dedicatedToOneSAPriv }], [])),
    preferences: { label: 'Savings', pfp: KEY.addr }
  }
  otherFactory = { ...smart, creation: { ...smart.creation!, factoryAddr: OTHER_FACTORY } }
  basic = { ...getBasicAccount(BASIC, []), preferences: { label: 'Spending', pfp: BASIC } }
})

/** The wallet's facts for a listed account, with or without code on the recovery chain. */
const factsOf = (account: Account, isDeployed: boolean): ListedAccountFacts => {
  const reading = accountFactsOf(account.addr as Address, {
    accounts: [account],
    accountStates: {
      [account.addr]: {
        [CHAIN]: {
          accountAddr: account.addr,
          isDeployed,
          isEOA: !account.creation,
          isV2: true,
          isSmarterEoa: false,
          nonce: 0n,
          balance: 0n,
          currentBlock: 7_000_000n
        }
      }
    } as never,
    keys: [{ addr: KEY.addr, type: 'internal' }],
    networks: [NETWORK]
  })
  if (reading.status !== 'ready') {
    throw new Error(`The facts read as ${reading.status}`)
  }
  return reading.facts
}

describe("the ref of a listed account, from the wallet's facts", () => {
  it("names a deployed smart account by its address and label, with code, and its creation record's factory", () => {
    expect(walletAccountRefOf(factsOf(smart, true))).toEqual({
      address: smart.addr,
      name: 'Savings',
      deployed: true,
      factory: ACCOUNT_FACTORY
    })
  })

  it('names a smart account with no code yet as not deployed, with the same factory', () => {
    expect(walletAccountRefOf(factsOf(smart, false))).toEqual({
      address: smart.addr,
      name: 'Savings',
      deployed: false,
      factory: ACCOUNT_FACTORY
    })
  })

  it('names the factory the creation record names where it is not the library one', () => {
    expect(walletAccountRefOf(factsOf(otherFactory, false)).factory).toBe(OTHER_FACTORY)
  })

  it("lets the gas check take a batch to that account's own factory, with no factory filled in by hand", async () => {
    const facts = factsOf(otherFactory, false)
    const transaction = accountBatchTransactionOf(facts, KEY, SAVE.calls)
    expect(transaction.to).toBe(OTHER_FACTORY)
    const reads = mockReads({ balance: 10n ** 18n, gas: 310_000n })
    const check = await runGasCheck({
      write: 'save',
      prepared: SAVE,
      transaction,
      operates: walletAccountRefOf(facts),
      reads
    })
    expect(check.kind).toBe('enough')
  })

  it('carries no factory for an account with no creation record', () => {
    const ref = walletAccountRefOf(factsOf(basic, true))
    expect(ref).toEqual({ address: basic.addr, name: 'Spending', deployed: true })
    expect('factory' in ref).toBe(false)
  })
})
