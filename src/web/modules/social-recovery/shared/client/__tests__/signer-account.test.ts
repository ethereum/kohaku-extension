/**
 * The signer facade as a viem account for one key handle. Its two signing
 * members go through the facade's request queue, so each queues the facade's
 * own request and answers the signature the queue returns, with the facade's
 * refusals, wait and first-answer rule. It signs no transaction and never the
 * EIP-712 domain alone.
 *
 * The queue is the fake of harness.ts. Each signature a test pushes is made by
 * the background's own keystore signer over the request the facade queued, and
 * checked with viem's own verifiers against the key's address.
 */
import { Wallet } from 'ethers'
import { hexToBytes, verifyMessage, verifyTypedData } from 'viem'

import type { Key } from '@ambire-common/interfaces/keystore'
import type { PlainTextMessage, TypedMessage } from '@ambire-common/interfaces/userRequest'
import { KeystoreSigner } from '@ambire-common/libs/keystoreSigner/keystoreSigner'
import { addressOf } from '@web/modules/social-recovery/sdk-doubles'
import type { Address, Hex } from '@web/modules/social-recovery/sdk-interfaces'

import {
  accountFor,
  addedRequest,
  advance,
  basicAccount,
  DEFAULT_SIGN_TIMEOUT_MS,
  dispatched,
  flush,
  isSignerNotWired,
  isSignFlowFailure,
  KeyHandle,
  queueOver,
  queued,
  QueueWorld,
  SEPOLIA,
  SignFlowFailure,
  signedFor,
  thrownBy,
  track
} from './harness'

const WALLET = new Wallet(`0x${'11'.repeat(32)}`)
const KEY = WALLET.address as Address
const HANDLE: KeyHandle = { addr: KEY, type: 'internal' }
const MANAGER = addressOf('manager')

const BYTES = `0x${'22'.repeat(32)}` as Hex

const TYPED_DATA = {
  domain: { name: 'PolicyManager', version: '1', chainId: SEPOLIA, verifyingContract: MANAGER },
  types: {
    Approval: [
      { name: 'digest', type: 'bytes32' },
      { name: 'account', type: 'address' }
    ]
  },
  primaryType: 'Approval',
  message: { digest: `0x${'11'.repeat(32)}`, account: KEY }
} as const

const ADD = 'REQUESTS_CONTROLLER_ADD_USER_REQUEST'
const REMOVE = 'REQUESTS_CONTROLLER_REMOVE_USER_REQUEST'

/** The account of HANDLE over a fake queue that lists `listed` as basic accounts. */
const accountOver = (listed: Address[] = [KEY]) => {
  const q = queueOver(listed.map(basicAccount))
  return { q, account: accountFor(q.signer, HANDLE) }
}

/**
 * Signs the request the facade queued as the background's keystore signer
 * does, pushes the answer under the request's id, and returns it.
 */
const answerAsTheKeystore = async (q: QueueWorld): Promise<Hex> => {
  const { userRequest } = addedRequest(q.dispatch)
  const signer = new KeystoreSigner({ addr: KEY, type: 'internal' } as Key, WALLET.privateKey)
  const { action } = userRequest
  const signature = (
    action.kind === 'typedMessage'
      ? await signer.signTypedData(action as TypedMessage)
      : await signer.signMessage((action as PlainTextMessage).message as string)
  ) as Hex
  q.push(signedFor(userRequest.id, signature))
  return signature
}

// The facade's wait runs on fake timers, so no pending request outlives its test.
beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe('the account of a key handle', () => {
  it("carries the handle's address as a local account", () => {
    const { account } = accountOver()
    expect(account.address).toBe(KEY)
    expect(account.type).toBe('local')
  })

  it('has no member that signs a bare hash', () => {
    const { account } = accountOver()
    expect(account.sign).toBeUndefined()
  })
})

describe('signMessage', () => {
  const MESSAGES: [
    string,
    Parameters<ReturnType<typeof accountFor>['signMessage']>[0]['message'],
    Hex
  ][] = [
    ['the UTF-8 bytes of a string', 'hello', '0x68656c6c6f'],
    ['raw hex bytes as given', { raw: BYTES }, BYTES],
    ['raw bytes in an array, as hex', { raw: hexToBytes(BYTES) }, BYTES]
  ]
  MESSAGES.forEach(([title, message, bytes]) =>
    it(`queues the facade's message request over ${title}, and answers the signature viem verifies`, async () => {
      const { q, account } = accountOver()
      const signing = track(account.signMessage({ message }))
      const { userRequest } = addedRequest(q.dispatch)
      expect(userRequest.action).toEqual({ kind: 'message', message: bytes })
      expect(userRequest.meta.accountAddr).toBe(KEY)
      const signature = await answerAsTheKeystore(q)
      await flush()
      expect(signing).toEqual({ status: 'resolved', value: signature })
      await expect(verifyMessage({ address: KEY, message, signature })).resolves.toBe(true)
      expect(dispatched(q.dispatch).map((a) => a.type)).toEqual([ADD])
    })
  )

  it('keeps the first answer under its id: a later answer changes nothing', async () => {
    const { q, account } = accountOver()
    const signing = track(account.signMessage({ message: { raw: BYTES } }))
    const signature = await answerAsTheKeystore(q)
    q.push(signedFor(addedRequest(q.dispatch).userRequest.id, 'not a signature'))
    await flush()
    expect(signing).toEqual({ status: 'resolved', value: signature })
  })

  it('withdraws its request and rejects once the default wait passes with no answer', async () => {
    const { q, account } = accountOver()
    const signing = track(account.signMessage({ message: 'hello' }))
    const { userRequest } = addedRequest(q.dispatch)
    q.push(queued(userRequest.id))
    await advance(DEFAULT_SIGN_TIMEOUT_MS)
    expect(signing.status).toBe('rejected')
    expect((signing.value as SignFlowFailure).reason).toBe('timeout')
    expect(dispatched(q.dispatch)).toEqual([
      expect.objectContaining({ type: ADD }),
      { type: REMOVE, params: { id: userRequest.id } }
    ])
  })

  it('refuses a key the wallet does not list as a basic account with SignerNotWired, queuing nothing', async () => {
    const { q, account } = accountOver([])
    const caught = await thrownBy(account.signMessage({ message: 'hello' }))
    expect(isSignerNotWired(caught)).toBe(true)
    expect(q.dispatch).not.toHaveBeenCalled()
  })
})

describe('signTypedData', () => {
  it("queues the facade's typed-data request and answers the signature viem verifies", async () => {
    const { q, account } = accountOver()
    const signing = track(account.signTypedData(TYPED_DATA))
    const { userRequest } = addedRequest(q.dispatch)
    expect(userRequest.action).toMatchObject({
      kind: 'typedMessage',
      domain: TYPED_DATA.domain,
      types: TYPED_DATA.types,
      primaryType: 'Approval',
      message: TYPED_DATA.message
    })
    expect(userRequest.meta.accountAddr).toBe(KEY)
    const signature = await answerAsTheKeystore(q)
    await flush()
    expect(signing).toEqual({ status: 'resolved', value: signature })
    await expect(verifyTypedData({ address: KEY, ...TYPED_DATA, signature })).resolves.toBe(true)
  })

  it('hands the facade an empty domain for a definition that names none, and answers the signature viem verifies', async () => {
    const { q, account } = accountOver()
    const { types, primaryType, message } = TYPED_DATA
    const signing = track(account.signTypedData({ types, primaryType, message }))
    const { userRequest } = addedRequest(q.dispatch)
    expect(userRequest.action).toMatchObject({
      kind: 'typedMessage',
      domain: {},
      types: { EIP712Domain: [], ...types },
      primaryType,
      message
    })
    const signature = await answerAsTheKeystore(q)
    await flush()
    expect(signing).toEqual({ status: 'resolved', value: signature })
    await expect(
      verifyTypedData({ address: KEY, types, primaryType, message, signature })
    ).resolves.toBe(true)
  })

  it('refuses a key the wallet does not list as a basic account with SignerNotWired, queuing nothing', async () => {
    const { q, account } = accountOver([])
    const caught = await thrownBy(account.signTypedData(TYPED_DATA))
    expect(isSignerNotWired(caught)).toBe(true)
    expect(q.dispatch).not.toHaveBeenCalled()
  })

  it('refuses an answer that is not a hex signature with a SignFlowFailure', async () => {
    const { q, account } = accountOver()
    const signing = track(account.signTypedData(TYPED_DATA))
    q.push(signedFor(addedRequest(q.dispatch).userRequest.id, 'not a signature'))
    await flush()
    expect(signing.status).toBe('rejected')
    expect(isSignFlowFailure(signing.value)).toBe(true)
    expect((signing.value as SignFlowFailure).reason).toBe('malformed-signature')
  })

  it('refuses typed data the signature check cannot encode before it queues anything', async () => {
    const { q, account } = accountOver()
    const upper = `0x${MANAGER.slice(2).toUpperCase()}` as Address
    expect(upper.toLowerCase()).not.toBe(upper)
    const caught = await thrownBy(
      account.signTypedData({
        ...TYPED_DATA,
        domain: { ...TYPED_DATA.domain, verifyingContract: upper }
      })
    )
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toBe('signTypedData takes valid EIP-712 typed data.')
    expect(isSignFlowFailure(caught)).toBe(false)
    expect(q.dispatch).not.toHaveBeenCalled()
    expect(q.listeners()).toBe(0)
  })
})

describe("typed data whose primary type is 'EIP712Domain'", () => {
  const DOMAIN = { name: 'PolicyManager', version: '1', chainId: SEPOLIA } as const
  const DOMAIN_TYPE = [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' }
  ]

  const ROUTES: [string, (q: QueueWorld) => Promise<Hex>][] = [
    [
      'through the account',
      (q) =>
        accountFor(q.signer, HANDLE).signTypedData({
          domain: DOMAIN,
          types: {},
          primaryType: 'EIP712Domain'
        })
    ],
    [
      'through the facade',
      (q) =>
        q.signer.signTypedData(HANDLE, {
          domain: DOMAIN,
          types: { EIP712Domain: DOMAIN_TYPE },
          primaryType: 'EIP712Domain',
          message: {}
        })
    ]
  ]
  const KEYS: [string, Address[]][] = [
    ['a key the wallet lists', [KEY]],
    ['a key the queue cannot sign for', []]
  ]
  ROUTES.forEach(([route, sign]) =>
    KEYS.forEach(([keyTitle, listed]) =>
      it(`is refused ${route} for ${keyTitle} with a plain error, before anything is queued`, async () => {
        const q = queueOver(listed.map(basicAccount))
        const signing = track(sign(q))
        expect(q.dispatch).not.toHaveBeenCalled()
        expect(q.listeners()).toBe(0)
        await flush()
        expect(signing.status).toBe('rejected')
        expect(signing.value).toBeInstanceOf(Error)
        expect((signing.value as Error).message).toBe(
          'signTypedData signs a message, never the EIP712Domain alone.'
        )
        expect(isSignFlowFailure(signing.value)).toBe(false)
        expect(isSignerNotWired(signing.value)).toBe(false)
      })
    )
  )
})

describe('signTransaction', () => {
  it('rejects every transaction with a plain error and dispatches nothing', async () => {
    const { q, account } = accountOver()
    const caught = await thrownBy(
      account.signTransaction({ chainId: SEPOLIA, to: MANAGER, value: 0n, data: '0x' })
    )
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toBe(
      'The extension never signs a transaction through this account.'
    )
    expect(isSignFlowFailure(caught)).toBe(false)
    expect(isSignerNotWired(caught)).toBe(false)
    expect(q.dispatch).not.toHaveBeenCalled()
    expect(q.listeners()).toBe(0)
  })
})
