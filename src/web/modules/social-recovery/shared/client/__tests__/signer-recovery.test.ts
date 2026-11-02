/**
 * The key a relayed transaction names for an account: the signer of each
 * batch the account runs, read from the account's own signature over the
 * wallet's operation hash, and the transaction's sender where no batch names
 * one. The transactions are built and signed the way the wallet builds and
 * signs them, with throwaway keys, over a scripted provider.
 */
import { getAddress, slice } from 'viem'

import type { Address, BlockTag, Hex, RawTransaction } from '@kohaku-eth/social-recovery'
import { eachIt } from '@web/modules/social-recovery/shared/chrome/__fixtures__/table'
import {
  ACCOUNT_CODE,
  reverting,
  scriptedProvider,
  thrownBy
} from '@web/modules/social-recovery/shared/client/__fixtures__/scripted-provider'
import {
  deployAndExecuteInput,
  deployAndExecuteMultipleInput,
  executeInput,
  executeMultipleInput,
  NONCE_SELECTOR,
  nonceAnswer,
  OTHER_SIGNING_KEY,
  RELAYED_CHAIN_ID,
  relayedAccount,
  SIGNING_KEY,
  signedBatch
} from '@web/modules/social-recovery/shared/client/__fixtures__/relayed-save'
import type { RelayedAccount } from '@web/modules/social-recovery/shared/client/__fixtures__/types'
import {
  callFailureOf,
  providerReadFailure
} from '@web/modules/social-recovery/shared/client/provider-adapter'
import {
  createSignerRecovery,
  recoveredSignersOf,
  recoverSigner
} from '@web/modules/social-recovery/shared/client/signer-recovery'

const RELAYER: Address = '0xc6C6C6c6C6C6c6C6C6C6C6c6c6C6c6C6c6c6c6c6'
const STRANGER: Address = '0xc7c7C7C7c7c7C7C7C7c7c7C7C7C7C7c7C7C7c7c7'
const TX_BLOCK = 5_000
const SIGNER = getAddress(SIGNING_KEY.address)
const OTHER_SIGNER = getAddress(OTHER_SIGNING_KEY.address)

const relayed = (to: Address | null, input: Hex): RawTransaction => ({
  hash: `0x${'ab'.repeat(32)}`,
  from: RELAYER,
  to,
  input,
  blockNumber: TX_BLOCK,
  blockHash: `0x${'cd'.repeat(32)}`
})

/**
 * A node that holds the deployed account and answers its `nonce()` by the
 * block asked: `before` at the block before the transaction, one more at the
 * transaction's own block, and what `odd` returns where it returns anything:
 * an error the read rejects with, or bytes it answers.
 */
const deployedNode = (
  account: Address,
  before: bigint,
  odd?: (block: BlockTag) => Error | Hex | undefined
) => {
  const node = scriptedProvider()
  const askedAt: BlockTag[] = []
  node.setCode(account, ACCOUNT_CODE)
  node.provider.call.mockImplementation(
    async (to: Address, data: Hex, _from: Address, block: BlockTag) => {
      askedAt.push(block)
      const answer = odd?.(block)
      if (answer instanceof Error) {
        throw answer
      }
      if (answer !== undefined) {
        return answer
      }
      if (to.toLowerCase() !== account.toLowerCase() || slice(data, 0, 4) !== NONCE_SELECTOR) {
        throw new Error(`No answer for ${data} to ${to}.`)
      }
      return nonceAnswer(block === TX_BLOCK - 1 ? before : before + 1n)
    }
  )
  return { provider: node.provider, askedAt }
}

let account: RelayedAccount

beforeAll(async () => {
  account = await relayedAccount()
})

describe('a relayed deployment of the account', () => {
  it('names the key that signed its batch at nonce 0, never the relayer, and reads no nonce', async () => {
    const { provider } = scriptedProvider()
    const batch = await signedBatch(SIGNING_KEY, account.addr, 0n)
    const transaction = relayed(account.factory, deployAndExecuteInput(account, batch))
    await expect(
      recoverSigner(transaction, account.addr, RELAYED_CHAIN_ID, provider)
    ).resolves.toBe(SIGNER)
    await expect(
      recoveredSignersOf(transaction, account.addr, RELAYED_CHAIN_ID, provider)
    ).resolves.toEqual([SIGNER])
    expect(provider.call).not.toHaveBeenCalled()
  })

  it('names the signer of each batch of a multiple deployment, each at its own index', async () => {
    const { provider } = scriptedProvider()
    const batches = [
      await signedBatch(SIGNING_KEY, account.addr, 0n),
      await signedBatch(OTHER_SIGNING_KEY, account.addr, 1n)
    ]
    const transaction = relayed(account.factory, deployAndExecuteMultipleInput(account, batches))
    await expect(
      recoveredSignersOf(transaction, account.addr, RELAYED_CHAIN_ID, provider)
    ).resolves.toEqual([SIGNER, OTHER_SIGNER])
  })

  it('names each key once where one key signed every batch', async () => {
    const { provider } = scriptedProvider()
    const batches = [
      await signedBatch(SIGNING_KEY, account.addr, 0n),
      await signedBatch(SIGNING_KEY, account.addr, 1n)
    ]
    const transaction = relayed(account.factory, deployAndExecuteMultipleInput(account, batches))
    await expect(
      recoveredSignersOf(transaction, account.addr, RELAYED_CHAIN_ID, provider)
    ).resolves.toEqual([SIGNER])
  })

  it('names no key for a batch signed at another nonce than its index', async () => {
    const { provider } = scriptedProvider()
    const batches = [
      await signedBatch(SIGNING_KEY, account.addr, 0n),
      await signedBatch(OTHER_SIGNING_KEY, account.addr, 0n)
    ]
    const transaction = relayed(account.factory, deployAndExecuteMultipleInput(account, batches))
    const signers = await recoveredSignersOf(transaction, account.addr, RELAYED_CHAIN_ID, provider)
    expect(signers[0]).toBe(SIGNER)
    expect(signers).not.toContain(OTHER_SIGNER)
  })

  it('names the key that signed the bare operation hash in the unprotected mode', async () => {
    const { provider } = scriptedProvider()
    const batch = await signedBatch(SIGNING_KEY, account.addr, 0n, 'unprotected')
    const transaction = relayed(account.factory, deployAndExecuteInput(account, batch))
    await expect(
      recoverSigner(transaction, account.addr, RELAYED_CHAIN_ID, provider)
    ).resolves.toBe(SIGNER)
  })

  it('names the key that signed the bare operation hash with no mode byte', async () => {
    const { provider } = scriptedProvider()
    const batch = await signedBatch(SIGNING_KEY, account.addr, 0n, 'plain')
    const recovery = Number(slice(batch.signature, 64))
    expect([27, 28]).toContain(recovery)
    const transaction = relayed(account.factory, deployAndExecuteInput(account, batch))
    await expect(
      recoveredSignersOf(transaction, account.addr, RELAYED_CHAIN_ID, provider)
    ).resolves.toEqual([SIGNER])
  })

  it('names the key of a plain signature on a deployed account, at the nonce read before', async () => {
    const { provider } = deployedNode(account.addr, 4n)
    const batch = await signedBatch(SIGNING_KEY, account.addr, 4n, 'plain')
    const transaction = relayed(account.addr, executeInput(batch))
    await expect(
      recoverSigner(transaction, account.addr, RELAYED_CHAIN_ID, provider)
    ).resolves.toBe(SIGNER)
  })

  it('is what the signer recovery handed to the SDK names', async () => {
    const { provider } = scriptedProvider()
    const batch = await signedBatch(SIGNING_KEY, account.addr, 0n)
    const transaction = relayed(account.factory, deployAndExecuteInput(account, batch))
    await expect(
      createSignerRecovery(RELAYED_CHAIN_ID, provider).recoverSigner(transaction, account.addr)
    ).resolves.toBe(SIGNER)
  })
})

describe('a relayed call to the deployed account', () => {
  it('names the key that signed the batch at the nonce the account held the block before', async () => {
    const { provider, askedAt } = deployedNode(account.addr, 7n)
    const batch = await signedBatch(SIGNING_KEY, account.addr, 7n)
    const transaction = relayed(account.addr, executeInput(batch))
    await expect(
      recoverSigner(transaction, account.addr, RELAYED_CHAIN_ID, provider)
    ).resolves.toBe(SIGNER)
    expect(askedAt).toEqual([TX_BLOCK - 1])
  })

  it('names the signer of each batch of a multiple call, from that nonce on by index', async () => {
    const { provider } = deployedNode(account.addr, 7n)
    const batches = [
      await signedBatch(SIGNING_KEY, account.addr, 7n),
      await signedBatch(OTHER_SIGNING_KEY, account.addr, 8n)
    ]
    const transaction = relayed(account.addr, executeMultipleInput(batches))
    await expect(
      recoveredSignersOf(transaction, account.addr, RELAYED_CHAIN_ID, provider)
    ).resolves.toEqual([SIGNER, OTHER_SIGNER])
  })

  eachIt<[string, () => Error | Hex]>([
    ['the node refuses the old block', () => new Error('missing trie node')],
    ['the node answers the history code', () => Object.assign(new Error('gone'), { code: 4444 })],
    [
      'the node has no historical state, as ethers wraps the call error',
      () =>
        callFailureOf(
          'call',
          Object.assign(new Error('missing revert data'), {
            code: 'CALL_EXCEPTION',
            action: 'call',
            data: null,
            reason: null,
            info: {
              error: {
                code: -32000,
                message: `historical state 0x${'73'.repeat(32)} is not available`
              }
            }
          })
        )
    ],
    ['the nonce read reverts', () => reverting()],
    ['the nonce read answers no bytes', () => '0x']
  ])('falls back to the sender where %s', async (_, odd) => {
    const { provider } = deployedNode(account.addr, 7n, () => odd())
    const batch = await signedBatch(SIGNING_KEY, account.addr, 7n)
    const transaction = relayed(account.addr, executeInput(batch))
    await expect(
      recoveredSignersOf(transaction, account.addr, RELAYED_CHAIN_ID, provider)
    ).resolves.toEqual([])
    await expect(
      recoverSigner(transaction, account.addr, RELAYED_CHAIN_ID, provider)
    ).resolves.toBe(RELAYER)
  })

  it('rejects with the failure where the nonce read fails on the network', async () => {
    const failure = providerReadFailure('call', new Error('timeout'))
    const { provider } = deployedNode(account.addr, 7n, () => failure)
    const batch = await signedBatch(SIGNING_KEY, account.addr, 7n)
    const transaction = relayed(account.addr, executeInput(batch))
    expect(
      await thrownBy(recoverSigner(transaction, account.addr, RELAYED_CHAIN_ID, provider))
    ).toBe(failure)
  })
})

describe('a transaction whose signatures name nobody', () => {
  it('never names the signer for a typed signature stripped of its mode byte', async () => {
    const { provider } = scriptedProvider()
    const batch = await signedBatch(SIGNING_KEY, account.addr, 0n)
    const bare = { ...batch, signature: slice(batch.signature, 0, 65) }
    const transaction = relayed(account.factory, deployAndExecuteInput(account, bare))
    await expect(
      recoveredSignersOf(transaction, account.addr, RELAYED_CHAIN_ID, provider)
    ).resolves.not.toContain(SIGNER)
    await expect(
      recoverSigner(transaction, account.addr, RELAYED_CHAIN_ID, provider)
    ).resolves.not.toBe(SIGNER)
  })

  eachIt<[string, Hex]>([
    ['00', '0x00'],
    ['01', '0x01']
  ])(
    'answers the sender for a 65-byte signature whose last byte is %s, no recovery value',
    async (_, last) => {
      const { provider } = scriptedProvider()
      const batch = await signedBatch(SIGNING_KEY, account.addr, 0n, 'plain')
      const signature: Hex = `${slice(batch.signature, 0, 64)}${last.slice(2)}`
      const transaction = relayed(
        account.factory,
        deployAndExecuteInput(account, { ...batch, signature })
      )
      await expect(
        recoveredSignersOf(transaction, account.addr, RELAYED_CHAIN_ID, provider)
      ).resolves.toEqual([])
      await expect(
        recoverSigner(transaction, account.addr, RELAYED_CHAIN_ID, provider)
      ).resolves.toBe(RELAYER)
    }
  )

  it('answers the sender for a signature in a mode other than the standard or the unprotected one', async () => {
    const { provider } = scriptedProvider()
    const batch = await signedBatch(SIGNING_KEY, account.addr, 0n)
    const other: Hex = `${slice(batch.signature, 0, 65)}02`
    const transaction = relayed(
      account.factory,
      deployAndExecuteInput(account, { ...batch, signature: other })
    )
    await expect(
      recoverSigner(transaction, account.addr, RELAYED_CHAIN_ID, provider)
    ).resolves.toBe(RELAYER)
  })

  it('answers the sender for a transaction with no input', async () => {
    const { provider } = scriptedProvider()
    await expect(
      recoverSigner(relayed(account.factory, '0x'), account.addr, RELAYED_CHAIN_ID, provider)
    ).resolves.toBe(RELAYER)
    await expect(
      recoverSigner(relayed(account.addr, '0x'), account.addr, RELAYED_CHAIN_ID, provider)
    ).resolves.toBe(RELAYER)
    expect(provider.call).not.toHaveBeenCalled()
  })

  it('answers the sender for a contract creation', async () => {
    const { provider } = scriptedProvider()
    const batch = await signedBatch(SIGNING_KEY, account.addr, 0n)
    await expect(
      recoverSigner(
        relayed(null, deployAndExecuteInput(account, batch)),
        account.addr,
        RELAYED_CHAIN_ID,
        provider
      )
    ).resolves.toBe(RELAYER)
  })

  it("answers the sender for the account's call sent to another address, reading no nonce", async () => {
    const { provider } = scriptedProvider()
    const batch = await signedBatch(SIGNING_KEY, account.addr, 0n)
    await expect(
      recoverSigner(
        relayed(STRANGER, executeInput(batch)),
        account.addr,
        RELAYED_CHAIN_ID,
        provider
      )
    ).resolves.toBe(RELAYER)
    expect(provider.call).not.toHaveBeenCalled()
  })

  it("answers the sender for the account's deployment sent to another factory", async () => {
    const { provider } = scriptedProvider()
    const batch = await signedBatch(SIGNING_KEY, account.addr, 0n)
    await expect(
      recoverSigner(
        relayed(STRANGER, deployAndExecuteInput(account, batch)),
        account.addr,
        RELAYED_CHAIN_ID,
        provider
      )
    ).resolves.toBe(RELAYER)
  })

  it('answers the sender for a deployment that creates another account', async () => {
    const { provider } = scriptedProvider()
    const another = await relayedAccount(OTHER_SIGNING_KEY)
    const batch = await signedBatch(SIGNING_KEY, account.addr, 0n)
    const transaction = relayed(account.factory, deployAndExecuteInput(another, batch))
    await expect(
      recoverSigner(transaction, account.addr, RELAYED_CHAIN_ID, provider)
    ).resolves.toBe(RELAYER)
  })

  it('never names the signer for a batch signed for another chain', async () => {
    const { provider } = scriptedProvider()
    const batch = await signedBatch(SIGNING_KEY, account.addr, 0n, 'standard', undefined, 1)
    const transaction = relayed(account.factory, deployAndExecuteInput(account, batch))
    await expect(
      recoveredSignersOf(transaction, account.addr, RELAYED_CHAIN_ID, provider)
    ).resolves.not.toContain(SIGNER)
  })
})
