/**
 * A committed setup on the stand-in's chain for the account the save's own
 * test harness builds, the client over it, records on an in-memory storage,
 * the edit session on that storage, and the seams a run sends through: a port
 * that lands the batch on the stand-in's chain as the wallet would, and the
 * receipt reads that answer for it.
 */
import { TextDecoder, TextEncoder } from 'util'

import type { Configuration, Hex, PreparedCall } from '@web/modules/social-recovery/sdk-interfaces'
import type { EstimationListener, SendPort } from '@web/modules/social-recovery/shared/client'

import type { EditWorld, LandingCase } from './types'

Object.assign(globalThis, { TextEncoder, TextDecoder })

jest.mock('@web/modules/social-recovery/shared/client/deployment-env', () => ({
  SEPOLIA_DEPLOYMENT_VARIABLE: 'SOCIAL_RECOVERY_SEPOLIA_DEPLOYMENT',
  sepoliaDeploymentVariable: () => undefined
}))

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const arm: typeof import('@web/modules/social-recovery/setup/arm/__tests__/harness') = require('@web/modules/social-recovery/setup/arm/__tests__/harness')
const {
  accountBatchRefusal,
  addressBookOf,
  buildRecoveryClient,
  descriptorOf,
  WALLET_RECOVERY_CHAIN
}: typeof import('@web/modules/social-recovery/shared/client') = require('@web/modules/social-recovery/shared/client')
const {
  sdkStandIn
}: typeof import('@web/modules/social-recovery/shared/client/stand-in') = require('@web/modules/social-recovery/shared/client/stand-in')
const {
  ecdsaConfigOf
}: typeof import('@web/modules/social-recovery/shared/client/kit/formats/credentials') = require('@web/modules/social-recovery/shared/client/kit/formats/credentials')
const {
  createWalletRecords
}: typeof import('@web/modules/social-recovery/shared/records') = require('@web/modules/social-recovery/shared/records')
const {
  makeStorage
}: typeof import('@web/modules/social-recovery/shared/records/__fixtures__/storage') = require('@web/modules/social-recovery/shared/records/__fixtures__/storage')
const {
  editSessionOf
}: typeof import('@web/modules/social-recovery/management/editor/session') = require('@web/modules/social-recovery/management/editor/session')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

export const { CHAIN_ID, KEY, TX_HASH } = arm
export const ADDRESS_BOOK = addressBookOf(WALLET_RECOVERY_CHAIN)
export const PASSWORD = 'card password'
export const NEW_PASSWORD = 'a new card password'
export const GUARDIAN = '0x00000000000000000000000000000000000B0b00' as const
export const SECOND_GUARDIAN = '0x00000000000000000000000000000000000c0c00' as const

export const guardianOf = (address: `0x${string}`) => ({
  method: ADDRESS_BOOK.methods.ecdsa,
  config: ecdsaConfigOf(address)
})

export const CONFIGURATION: Configuration = {
  clauses: [{ threshold: 1, credentials: [guardianOf(GUARDIAN)] }],
  wait: 172_800n,
  ignoresPause: true
}

/** A port whose account batch lands on the chain, or is refused before it reaches it. */
const portOver = (world: Pick<EditWorld, 'chain'>, landing: LandingCase): SendPort => ({
  send: jest.fn(async () => {
    throw new Error('the editor never sends from a key alone')
  }),
  sendAccountBatch: jest.fn(
    async (
      account: `0x${string}`,
      calls: readonly PreparedCall[],
      onEstimation?: EstimationListener
    ): Promise<Hex> => {
      if (onEstimation) {
        onEstimation(arm.feeReading({}))
      }
      if (landing === 'refused') {
        throw accountBatchRefusal('refused', account)
      }
      world.chain.land({ kind: 'batch', calls: [...calls] } as never)
      return arm.TX_HASH
    }
  )
})

export const worldOf = async (landing: LandingCase = 'lands'): Promise<EditWorld> => {
  const account = await arm.smartAccount()
  const address = account.addr as `0x${string}`
  sdkStandIn.reset()
  const chain = sdkStandIn.chainFor(descriptorOf(WALLET_RECOVERY_CHAIN, ADDRESS_BOOK), address)
  chain.commitSetup({ level: 'private', configuration: CONFIGURATION, password: PASSWORD })
  chain.setAuthorized(true)
  const client = await buildRecoveryClient({
    chain: WALLET_RECOVERY_CHAIN,
    account: address,
    addressBook: ADDRESS_BOOK,
    provider: sdkStandIn.providerFor(chain),
    codeRead: { code: async () => '0x' },
    transactionRead: async () => null
  })
  const storage = makeStorage()
  const world = {
    account: address,
    chain,
    client,
    storage,
    records: createWalletRecords({ storage }),
    session: editSessionOf(storage, arm.CHAIN_ID, address),
    facts: arm.factsOf(account),
    reads: arm.chainReadsFor('enough'),
    receipts: {
      blockNumber: jest.fn(async () => chain.blockAt('latest').number),
      transactionKnown: jest.fn(async () => 'known' as const),
      wait: jest.fn(async (hash: Hex) => arm.landedReceipt(hash))
    },
    requests: arm.requestsFake()
  } as unknown as EditWorld
  return { ...world, port: portOver(world, landing) }
}
