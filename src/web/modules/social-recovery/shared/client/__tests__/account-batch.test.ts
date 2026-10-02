/**
 * A batch the smart account runs on itself, beside its calls: the recovery
 * kit's mark the request that arms the kit carries, and the transaction the
 * account's key sends for the batch, which the gas check estimates.
 *
 * The mark is read on the request the send port queues (the fakes of
 * harness.ts). The transaction is decoded through the account library's own
 * contract interfaces, over an account the library itself builds.
 */
import { getAddress, Interface, Wallet } from 'ethers'

import { AMBIRE_ACCOUNT_FACTORY } from '@ambire-common/consts/deploy'
import type { Account } from '@ambire-common/interfaces/account'
import { dedicatedToOneSAPriv } from '@ambire-common/interfaces/keystore'
import { getBasicAccount, getSmartAccount, getSpoof } from '@ambire-common/libs/account/account'
import AmbireAccount from '@contracts/compiled/AmbireAccount.json'
import AmbireFactory from '@contracts/compiled/AmbireFactory.json'
import type { Address, Hex, PreparedCall } from '@web/modules/social-recovery/sdk-interfaces'

import {
  accountBatchTransactionOf,
  addedRequest,
  basicAccount,
  BATCH,
  CONTROLLING_KEY,
  deploymentDescriptor,
  dispatched,
  KeyHandle,
  networkRecord,
  onchainState,
  recoveryKitMarkOf,
  sendQueueOver,
  SendRequestAction,
  SMART_ACCOUNT,
  smartAccount,
  WALLET_RECOVERY_CHAIN
} from '@web/modules/social-recovery/shared/client/__tests__/harness'

const ADD = 'REQUESTS_CONTROLLER_ADD_USER_REQUEST'

const MANAGER = getAddress(`0x${'5a'.repeat(20)}`) as Address
const AUDITED = [
  getAddress(`0x${'a1'.repeat(20)}`),
  getAddress(`0x${'a2'.repeat(20)}`)
] as Address[]

/** A deployment whose manager and audited actions the test names. */
const DESCRIPTOR = {
  ...deploymentDescriptor(WALLET_RECOVERY_CHAIN),
  manager: MANAGER,
  auditedActions: AUDITED
}

/** A basic account the wallet lists, which sends its own transaction. */
const PAYER = new Wallet(`0x${'55'.repeat(32)}`).address as Address
const PAYER_KEY: KeyHandle = { addr: PAYER, type: 'internal' }
const PAYER_TRANSACTION = { from: PAYER, to: MANAGER, data: '0x1a2b3c4d' as Hex }

const LISTED = () => [smartAccount(SMART_ACCOUNT, CONTROLLING_KEY), basicAccount(PAYER)]

const addsOf = (dispatch: jest.Mock) =>
  dispatched<SendRequestAction>(dispatch).filter((action) => action.type === ADD)

describe("the recovery kit's mark", () => {
  // The port follows each request it queued on timers; fake ones end with the test.
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  it("is the descriptor's manager and its audited actions", () => {
    expect(recoveryKitMarkOf(DESCRIPTOR)).toEqual({ manager: MANAGER, auditedActions: AUDITED })
  })

  it("holds its own list of audited actions, not the descriptor's", () => {
    const descriptor = { ...DESCRIPTOR, auditedActions: [...AUDITED] }
    const mark = recoveryKitMarkOf(descriptor)
    descriptor.auditedActions.push(PAYER)
    expect(mark.auditedActions).toEqual(AUDITED)
  })

  it('rides one calls request of the batch, in its meta, beside what an unmarked batch carries', () => {
    const marked = sendQueueOver(LISTED())
    marked.sender
      .sendAccountBatch(SMART_ACCOUNT, BATCH, undefined, recoveryKitMarkOf(DESCRIPTOR))
      .catch(() => undefined)
    const plain = sendQueueOver(LISTED())
    plain.sender.sendAccountBatch(SMART_ACCOUNT, BATCH).catch(() => undefined)

    expect(addsOf(marked.dispatch)).toHaveLength(1)
    const { userRequest } = addedRequest(marked.dispatch)
    const unmarked = addedRequest(plain.dispatch).userRequest
    expect(userRequest.action).toEqual(unmarked.action)
    expect(userRequest.action.kind).toBe('calls')
    expect(userRequest.meta).toEqual({
      ...unmarked.meta,
      recoveryKit: { manager: MANAGER, auditedActions: AUDITED }
    })
  })

  it('rides the request as it stood when the batch was sent, whatever the caller does to it after', () => {
    const q = sendQueueOver(LISTED())
    const mark = { manager: MANAGER, auditedActions: [...AUDITED] }
    q.sender.sendAccountBatch(SMART_ACCOUNT, BATCH, undefined, mark).catch(() => undefined)
    mark.auditedActions.push(PAYER)
    expect(addedRequest(q.dispatch).userRequest.meta.recoveryKit).toEqual({
      manager: MANAGER,
      auditedActions: AUDITED
    })
  })

  it('is absent from a batch sent without it', () => {
    const q = sendQueueOver(LISTED())
    q.sender.sendAccountBatch(SMART_ACCOUNT, BATCH, jest.fn()).catch(() => undefined)
    expect(addsOf(q.dispatch)).toHaveLength(1)
    expect(addedRequest(q.dispatch).userRequest.meta).not.toHaveProperty('recoveryKit')
  })

  it("never rides a key's own transaction, even on a port that sent a marked batch before", () => {
    const q = sendQueueOver(LISTED())
    q.sender
      .sendAccountBatch(SMART_ACCOUNT, BATCH, undefined, recoveryKitMarkOf(DESCRIPTOR))
      .catch(() => undefined)
    q.sender.send(PAYER_KEY, PAYER_TRANSACTION).catch(() => undefined)
    const adds = addsOf(q.dispatch)
    expect(adds).toHaveLength(2)
    const own = adds[1]
    if (own.type !== ADD) {
      throw new Error('The second request is not an added request.')
    }
    expect(own.params.userRequest.meta.accountAddr).toBe(PAYER)
    expect(own.params.userRequest.meta).not.toHaveProperty('recoveryKit')
  })

  it('dispatches nothing for a marked batch of an account the port refuses', async () => {
    const q = sendQueueOver([basicAccount(PAYER)])
    await expect(
      q.sender.sendAccountBatch(PAYER, BATCH, undefined, recoveryKitMarkOf(DESCRIPTOR))
    ).rejects.toMatchObject({ name: 'SendRefusal', reason: 'not-smart-account' })
    expect(q.dispatch).not.toHaveBeenCalled()
  })
})

const ACCOUNT_OPERATIONS = new Interface(AmbireAccount.abi)
const FACTORY = new Interface(AmbireFactory.abi)

const KEY: KeyHandle = { addr: CONTROLLING_KEY, type: 'internal' }
const NETWORK = networkRecord(WALLET_RECOVERY_CHAIN)

/** Each call as the account runs it: its target, value and data. */
const tuplesOf = (calls: readonly PreparedCall[]) =>
  calls.map((call) => [getAddress(call.target), call.value, call.data])

/** The decoded calls of an account operation, in the same shape. */
const decodedTuples = (decoded: readonly unknown[]) =>
  (decoded as [string, bigint, string][]).map(([to, value, data]) => [getAddress(to), value, data])

describe("the transaction the account's key sends for the batch", () => {
  let account: Account

  beforeAll(async () => {
    account = await getSmartAccount([{ addr: CONTROLLING_KEY, hash: dedicatedToOneSAPriv }], [])
  })

  const sourceOf = (isDeployed: boolean, overrides = {}) => ({
    account,
    state: onchainState(account.addr, { isDeployed, ...overrides }),
    network: NETWORK
  })

  const VERSIONS: [string, boolean][] = [
    ['the current account version', true],
    ['the first account version', false]
  ]
  VERSIONS.forEach(([title, isV2]) =>
    describe(`for ${title}`, () => {
      it("runs the calls through the account's executeBySender, sent from the key to the account, where it has code", () => {
        const transaction = accountBatchTransactionOf(sourceOf(true, { isV2 }), KEY, BATCH)
        expect(transaction.from).toBe(KEY.addr)
        expect(transaction.to).toBe(account.addr)
        expect(transaction).not.toHaveProperty('value')
        const parsed = ACCOUNT_OPERATIONS.parseTransaction({ data: transaction.data })
        expect(parsed?.name).toBe('executeBySender')
        expect(decodedTuples(parsed?.args[0])).toEqual(tuplesOf(BATCH))
      })

      it('deploys the account through its factory and runs the calls in the same transaction, sent from the key, where it has none', () => {
        const transaction = accountBatchTransactionOf(sourceOf(false, { isV2 }), KEY, BATCH)
        expect(transaction.from).toBe(KEY.addr)
        expect(transaction.to).toBe(account.creation?.factoryAddr)
        expect(transaction.to).toBe(AMBIRE_ACCOUNT_FACTORY)
        const parsed = FACTORY.parseTransaction({ data: transaction.data })
        expect(parsed?.name).toBe('deployAndExecute')
        const [code, salt, calls] = parsed?.args ?? []
        expect(code).toBe(account.creation?.bytecode)
        expect(salt).toBe(BigInt(account.creation?.salt ?? -1))
        expect(decodedTuples(calls)).toEqual(tuplesOf(BATCH))
      })
    })
  )

  it("carries, for the undeployed account, the library's simulation signature naming the account's first key, not a signature of the key", () => {
    const transaction = accountBatchTransactionOf(sourceOf(false), KEY, BATCH)
    const signature = FACTORY.parseTransaction({ data: transaction.data })?.args[3] as string
    expect(signature).toBe(getSpoof(account))
    // The account's first key, then the spoof mode: 32 bytes and one.
    expect((signature.length - 2) / 2).toBe(33)
    expect(signature.endsWith('03')).toBe(true)
  })

  it('keeps the calls in the order given', () => {
    const reversed = [...BATCH].reverse()
    const parsed = ACCOUNT_OPERATIONS.parseTransaction({
      data: accountBatchTransactionOf(sourceOf(true), KEY, reversed).data
    })
    expect(decodedTuples(parsed?.args[0])).toEqual(tuplesOf(reversed))
  })

  it('sends from whichever key it is given', () => {
    const other: KeyHandle = { addr: PAYER, type: 'trezor' }
    expect(accountBatchTransactionOf(sourceOf(true), other, BATCH).from).toBe(PAYER)
    expect(accountBatchTransactionOf(sourceOf(false), other, BATCH).from).toBe(PAYER)
  })

  it('refuses a basic account with a TypeError naming it, whatever its state says', () => {
    const basic = getBasicAccount(PAYER, [])
    const run = (isDeployed: boolean) => () =>
      accountBatchTransactionOf(
        {
          account: basic,
          state: onchainState(PAYER, { isDeployed, isEOA: true }),
          network: NETWORK
        },
        { addr: PAYER, type: 'internal' },
        BATCH
      )
    expect(run(false)).toThrow(TypeError)
    expect(run(false)).toThrow(PAYER)
    expect(run(true)).toThrow(TypeError)
  })
})
