/**
 * The signer facade signs typed data or raw bytes for a key the keystore
 * holds, addressed by the keystore's own handle of address and key type, and
 * exposes no key export. It signs by adding its own request to the request
 * queue, which lands in the action window; the queue is a fake behind the
 * `SignRequestPort` (harness.ts), driven by hand.
 *
 * Every signature a test pushes is a real one, made with an ethers `Wallet`
 * the way the background's keystore signer makes it: EIP-191 over the bytes
 * (`signMessage(getBytes(hex))`) and EIP-712 v4 over the typed data, or made by
 * the keystore signer itself over the request the facade queued. The facade
 * verifies each one against its own content and the handle's address.
 *
 * Known limit, not a defect: the queue signs only for a key that is itself a
 * basic account the wallet lists. For any other key the facade refuses with
 * `SignerNotWired`, naming the missing background action
 * `KEYSTORE_CONTROLLER_SIGN_WITH_KEY`.
 */
import { getBytes, Signature, Wallet } from 'ethers'

import type { Key } from '@ambire-common/interfaces/keystore'
import type { TypedMessage } from '@ambire-common/interfaces/userRequest'
import { KeystoreSigner } from '@ambire-common/libs/keystoreSigner/keystoreSigner'
import { addressOf } from '@web/modules/social-recovery/sdk-doubles'
import type { Address, Hex } from '@web/modules/social-recovery/sdk-interfaces'

import {
  ABSENCE_GRACE_MS,
  addedRequest,
  advance,
  basicAccount,
  DEFAULT_SIGN_TIMEOUT_MS,
  dispatched,
  flush,
  isSignerNotWired,
  isSignFlowFailure,
  KeyHandle,
  listedIn,
  memberNamesOf,
  MISSING_BACKGROUND_ACTION,
  queued,
  queueOver,
  QueueWorld,
  SEPOLIA,
  SIGNER_MEMBERS,
  SignerNotWired,
  SignFlowFailure,
  signedFor,
  smartAccount,
  thrownBy,
  track,
  WINDOW_ID
} from './harness'

/** The key the tests sign with, a basic account the wallet lists. */
const WALLET = new Wallet(`0x${'11'.repeat(32)}`)
/** Another key, whose signatures the facade must never return for WALLET's handle. */
const OTHER_WALLET = new Wallet(`0x${'22'.repeat(32)}`)

const KEY = WALLET.address as Address
const OTHER_KEY = OTHER_WALLET.address as Address
const HANDLE: KeyHandle = { addr: KEY, type: 'internal' }

const TYPED = {
  domain: { name: 'PolicyManager', version: '1', chainId: SEPOLIA },
  types: { Approval: [{ name: 'digest', type: 'bytes32' }] },
  primaryType: 'Approval',
  message: { digest: `0x${'11'.repeat(32)}` }
}
const BYTES = `0x${'22'.repeat(32)}` as Hex
const OTHER_BYTES = `0x${'33'.repeat(32)}` as Hex
/** Bytes WALLET's signature over carries v = 27; over BYTES it carries v = 28. */
const V27_BYTES = `0x${'55'.repeat(32)}` as Hex

/** The order of the secp256k1 group. */
const CURVE_ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n

const vOf = (signature: Hex): number => parseInt(signature.slice(130), 16)

/** The signature with its last byte, v, set to `v`. */
const withV = (signature: Hex, v: number): Hex =>
  `${signature.slice(0, 130)}${v.toString(16).padStart(2, '0')}` as Hex

/** The other signature of the same digest by the same key: s' = n - s and the other v. */
const highS = (signature: Hex): Hex => {
  const s = BigInt(`0x${signature.slice(66, 130)}`)
  const flipped = (CURVE_ORDER - s).toString(16).padStart(64, '0')
  return withV(`${signature.slice(0, 66)}${flipped}00` as Hex, vOf(signature) === 27 ? 28 : 27)
}

/** The background's own keystore signer for WALLET's key. */
const keystoreSigner = () =>
  new KeystoreSigner({ addr: KEY, type: 'internal' } as Key, WALLET.privateKey)

/** The signatures the tests push, made before any fake timer runs. */
const SIG = {} as {
  /** WALLET over BYTES, EIP-191. */
  bytes: Hex
  /** WALLET over TYPED, EIP-712. */
  typed: Hex
  /** OTHER_WALLET over BYTES. */
  otherKeyBytes: Hex
  /** OTHER_WALLET over TYPED. */
  otherKeyTyped: Hex
  /** WALLET over OTHER_BYTES: the right key, another content. */
  otherContent: Hex
  /** WALLET over V27_BYTES. */
  v27Bytes: Hex
}

beforeAll(async () => {
  SIG.bytes = (await WALLET.signMessage(getBytes(BYTES))) as Hex
  SIG.typed = (await WALLET.signTypedData(TYPED.domain, TYPED.types, TYPED.message)) as Hex
  SIG.otherKeyBytes = (await OTHER_WALLET.signMessage(getBytes(BYTES))) as Hex
  SIG.otherKeyTyped = (await OTHER_WALLET.signTypedData(
    TYPED.domain,
    TYPED.types,
    TYPED.message
  )) as Hex
  SIG.otherContent = (await WALLET.signMessage(getBytes(OTHER_BYTES))) as Hex
  SIG.v27Bytes = (await WALLET.signMessage(getBytes(V27_BYTES))) as Hex
})

const ADD = 'REQUESTS_CONTROLLER_ADD_USER_REQUEST'
const REMOVE = 'REQUESTS_CONTROLLER_REMOVE_USER_REQUEST'

// Every test runs on fake timers, so a request a test leaves pending never keeps
// the facade's ten-minute wait alive after the test.
beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe('the signer facade over the request queue', () => {
  it('signs typed data by adding its own sign request for the key given', async () => {
    const q = queueOver([basicAccount(KEY)])
    const signing = q.signer.signTypedData(HANDLE, TYPED)
    const { userRequest, allowAccountSwitch } = addedRequest(q.dispatch)
    expect(allowAccountSwitch).toBe(true)
    expect(userRequest.meta).toMatchObject({
      isSignAction: true,
      accountAddr: KEY,
      chainId: BigInt(SEPOLIA)
    })
    expect(userRequest.action).toMatchObject({
      kind: 'typedMessage',
      domain: TYPED.domain,
      primaryType: TYPED.primaryType,
      message: TYPED.message
    })
    expect(userRequest.session.windowId).toBe(WINDOW_ID)

    q.push(queued(userRequest.id))
    q.push(signedFor(userRequest.id, SIG.typed))
    await expect(signing).resolves.toBe(SIG.typed)
    expect(dispatched(q.dispatch).map((a) => a.type)).toEqual([ADD])
  })

  it('signs raw bytes by adding its own sign request for the key given', async () => {
    const q = queueOver([basicAccount(KEY)])
    const signing = q.signer.signBytes(HANDLE, BYTES)
    const { userRequest } = addedRequest(q.dispatch)
    expect(userRequest.meta.accountAddr).toBe(KEY)
    expect(userRequest.action).toEqual({ kind: 'message', message: BYTES })
    q.push(signedFor(userRequest.id, SIG.bytes))
    await expect(signing).resolves.toBe(SIG.bytes)
  })

  it('addresses each request by the address of its own handle, never a default key', async () => {
    const q = queueOver([basicAccount(KEY), basicAccount(OTHER_KEY)])
    const signing = q.signer.signBytes({ addr: OTHER_KEY, type: 'internal' }, BYTES)
    const { userRequest } = addedRequest(q.dispatch)
    expect(userRequest.meta.accountAddr).toBe(OTHER_KEY)
    q.push(signedFor(userRequest.id, SIG.otherKeyBytes))
    await expect(signing).resolves.toBe(SIG.otherKeyBytes)
  })

  it("carries the key type of the handle in the added request's meta, beside the address and chain", () => {
    const q = queueOver([basicAccount(KEY)])
    q.signer.signBytes({ addr: KEY, type: 'trezor' }, BYTES).catch(() => undefined)
    q.signer.signTypedData({ addr: KEY, type: 'internal' }, TYPED).catch(() => undefined)
    const requests = dispatched(q.dispatch).flatMap((a) =>
      a.type === ADD ? [a.params.userRequest] : []
    )
    expect(requests).toHaveLength(2)
    const [bytesRequest, typedRequest] = requests
    expect(bytesRequest.meta).toEqual({
      isSignAction: true,
      accountAddr: KEY,
      keyType: 'trezor',
      chainId: BigInt(SEPOLIA)
    })
    expect(typedRequest.meta).toEqual({
      isSignAction: true,
      accountAddr: KEY,
      keyType: 'internal',
      chainId: BigInt(SEPOLIA)
    })
  })

  it("names the listed account's checksum address for a handle given in lower case", async () => {
    const q = queueOver([basicAccount(KEY)])
    const lower = KEY.toLowerCase() as Address
    expect(lower).not.toBe(KEY)
    const signing = q.signer.signBytes({ addr: lower, type: 'internal' }, BYTES)
    const { userRequest } = addedRequest(q.dispatch)
    expect(userRequest.meta.accountAddr).toBe(KEY)
    q.push(signedFor(userRequest.id, SIG.bytes))
    await expect(signing).resolves.toBe(SIG.bytes)
  })

  describe('request ids', () => {
    it('gives each request an id of its own', () => {
      const q = queueOver([basicAccount(KEY)])
      q.signer.signBytes(HANDLE, BYTES).catch(() => undefined)
      q.signer.signBytes(HANDLE, BYTES).catch(() => undefined)
      const ids = dispatched(q.dispatch)
        .filter((a) => a.type === ADD)
        .map((a) => (a.type === ADD ? String(a.params.userRequest.id) : ''))
      expect(new Set(ids).size).toBe(2)
    })

    it('gives different ids to two facades created in the same millisecond, each in its own page', () => {
      jest.spyOn(Date, 'now').mockReturnValue(1_790_000_000_000)
      // Two extension pages load the client module apart, so each holds its own module state.
      const load = (): typeof import('@web/modules/social-recovery/shared/client/signer') => {
        let loaded: unknown
        jest.isolateModules(() => {
          // eslint-disable-next-line global-require
          loaded = require('@web/modules/social-recovery/shared/client/signer')
        })
        return loaded as typeof import('@web/modules/social-recovery/shared/client/signer')
      }
      const ids = [load(), load()].map((signerModule) => {
        const dispatch = jest.fn()
        const facade = signerModule.createSignerFacade(
          {
            dispatch,
            subscribe: () => () => undefined,
            accounts: () => [basicAccount(KEY)],
            windowId: () => WINDOW_ID
          },
          { chainId: SEPOLIA }
        )
        facade.signBytes(HANDLE, BYTES).catch(() => undefined)
        return String(addedRequest(dispatch).userRequest.id)
      })
      expect(ids[0]).not.toBe(ids[1])
    })
  })

  describe('the signature check', () => {
    it("accepts a signature that recovers, over the facade's own content, to the handle's address", async () => {
      const q = queueOver([basicAccount(KEY)])
      const typed = q.signer.signTypedData(HANDLE, TYPED)
      q.push(signedFor(addedRequest(q.dispatch).userRequest.id, SIG.typed))
      await expect(typed).resolves.toBe(SIG.typed)

      const r = queueOver([basicAccount(KEY)])
      const bytes = r.signer.signBytes(HANDLE, BYTES)
      r.push(signedFor(addedRequest(r.dispatch).userRequest.id, SIG.bytes))
      await expect(bytes).resolves.toBe(SIG.bytes)
    })

    const refusals: [string, 'bytes' | 'typed', keyof typeof SIG][] = [
      ['bytes signed by another key', 'bytes', 'otherKeyBytes'],
      ['typed data signed by another key', 'typed', 'otherKeyTyped'],
      ['another content signed by the right key', 'bytes', 'otherContent'],
      ['a typed-data signature pushed for a bytes request', 'bytes', 'typed']
    ]
    refusals.forEach(([title, kind, signature]) =>
      it(`refuses, under its own id, ${title}, and never returns it`, async () => {
        const q = queueOver([basicAccount(KEY)])
        const signing = track(
          kind === 'bytes'
            ? q.signer.signBytes(HANDLE, BYTES)
            : q.signer.signTypedData(HANDLE, TYPED)
        )
        const { userRequest } = addedRequest(q.dispatch)
        q.push(signedFor(userRequest.id, SIG[signature]))
        await flush()
        expect(signing.status).toBe('rejected')
        expect(signing.value).not.toBe(SIG[signature])
        expect(isSignFlowFailure(signing.value)).toBe(true)
        expect((signing.value as SignFlowFailure).reason).toBe('signer-mismatch')
        // A later correct signature cannot revive a refused request.
        q.push(signedFor(userRequest.id, kind === 'bytes' ? SIG.bytes : SIG.typed))
        await flush()
        expect(signing.status).toBe('rejected')
      })
    )

    const FORMS: [string, 'bytes' | 'typed'][] = [
      ['raw bytes', 'bytes'],
      ['typed data', 'typed']
    ]
    FORMS.forEach(([title, kind]) =>
      it(`takes the 65-byte signature over ${title} and refuses its 64-byte compact form as malformed`, async () => {
        const full = kind === 'bytes' ? SIG.bytes : SIG.typed
        const compact = Signature.from(full).compactSerialized as Hex
        expect(full).toHaveLength(2 + 2 * 65)
        expect(compact).toHaveLength(2 + 2 * 64)
        const sign = (q: QueueWorld) =>
          track(
            kind === 'bytes'
              ? q.signer.signBytes(HANDLE, BYTES)
              : q.signer.signTypedData(HANDLE, TYPED)
          )
        const taking = queueOver([basicAccount(KEY)])
        const taken = sign(taking)
        taking.push(signedFor(addedRequest(taking.dispatch).userRequest.id, full))
        const refusing = queueOver([basicAccount(KEY)])
        const refused = sign(refusing)
        refusing.push(signedFor(addedRequest(refusing.dispatch).userRequest.id, compact))
        await flush()
        expect(taken).toEqual({ status: 'resolved', value: full })
        expect(refused.status).toBe('rejected')
        expect(isSignFlowFailure(refused.value)).toBe(true)
        expect((refused.value as SignFlowFailure).reason).toBe('malformed-signature')
      })
    )

    const EIP155_V: [number, Hex, keyof typeof SIG][] = [
      [37, V27_BYTES, 'v27Bytes'],
      [38, BYTES, 'bytes']
    ]
    EIP155_V.forEach(([v, bytes, signature]) =>
      it(`refuses the signature with v = ${v}, the chain-id form of v = ${
        v - 10
      }, as malformed`, async () => {
        expect(vOf(SIG[signature])).toBe(v - 10)
        const q = queueOver([basicAccount(KEY)])
        const signing = track(q.signer.signBytes(HANDLE, bytes))
        q.push(signedFor(addedRequest(q.dispatch).userRequest.id, withV(SIG[signature], v)))
        await flush()
        expect(signing.status).toBe('rejected')
        expect((signing.value as SignFlowFailure).reason).toBe('malformed-signature')
      })
    )

    FORMS.forEach(([title, kind]) =>
      it(`takes the high-s form of a signature over ${title}, which recovers to the same key`, async () => {
        const low = kind === 'bytes' ? SIG.bytes : SIG.typed
        const high = highS(low)
        expect(BigInt(`0x${high.slice(66, 130)}`)).toBeGreaterThan(CURVE_ORDER / 2n)
        const q = queueOver([basicAccount(KEY)])
        const signing = track(
          kind === 'bytes'
            ? q.signer.signBytes(HANDLE, BYTES)
            : q.signer.signTypedData(HANDLE, TYPED)
        )
        q.push(signedFor(addedRequest(q.dispatch).userRequest.id, high))
        await flush()
        expect(signing).toEqual({ status: 'resolved', value: high })
      })
    )

    it('takes the signature the keystore makes over a domain type given in its own member order', async () => {
      const reordered = {
        domain: { ...TYPED.domain, verifyingContract: addressOf('manager') },
        types: {
          EIP712Domain: [
            { name: 'verifyingContract', type: 'address' },
            { name: 'chainId', type: 'uint256' },
            { name: 'version', type: 'string' },
            { name: 'name', type: 'string' }
          ],
          ...TYPED.types
        },
        primaryType: TYPED.primaryType,
        message: TYPED.message
      }
      const q = queueOver([basicAccount(KEY)])
      const signing = track(q.signer.signTypedData(HANDLE, reordered))
      const { userRequest } = addedRequest(q.dispatch)
      expect(userRequest.action).toMatchObject({ types: reordered.types })
      const signature = (await keystoreSigner().signTypedData(
        userRequest.action as TypedMessage
      )) as Hex
      q.push(signedFor(userRequest.id, signature))
      await flush()
      expect(signing).toEqual({ status: 'resolved', value: signature })
    })

    it('refuses a hex answer no address can be recovered from as malformed', async () => {
      const q = queueOver([basicAccount(KEY)])
      const signing = track(q.signer.signBytes(HANDLE, BYTES))
      const unrecoverable = `0x${'00'.repeat(65)}` as Hex
      q.push(signedFor(addedRequest(q.dispatch).userRequest.id, unrecoverable))
      await flush()
      expect(signing.status).toBe('rejected')
      expect((signing.value as SignFlowFailure).reason).toBe('malformed-signature')
    })
  })

  describe('a foreign message between the request and its result', () => {
    it('never yields a foreign signature to the facade', async () => {
      const q = queueOver([basicAccount(KEY)])
      const signing = track(q.signer.signTypedData(HANDLE, TYPED))
      const { userRequest } = addedRequest(q.dispatch)
      q.push(queued('dapp-request', userRequest.id))
      // A dApp request is signed in between, under its own id.
      q.push(signedFor('dapp-request', SIG.otherKeyTyped))
      q.push(signedFor(`${userRequest.id}-other`, SIG.typed))
      await flush()
      expect(signing.status).toBe('pending')
      q.push(signedFor(userRequest.id, SIG.typed))
      await flush()
      expect(signing).toEqual({ status: 'resolved', value: SIG.typed })
    })

    it('refuses rather than take a foreign signature when its own request leaves the queue unsigned', async () => {
      const q = queueOver([basicAccount(KEY)])
      const signing = track(q.signer.signBytes(HANDLE, BYTES))
      const { userRequest } = addedRequest(q.dispatch)
      q.push(queued('dapp-request', userRequest.id))
      q.push(signedFor('dapp-request', SIG.bytes))
      q.push(queued())
      await advance(ABSENCE_GRACE_MS)
      expect(signing.status).toBe('rejected')
      expect(isSignFlowFailure(signing.value)).toBe(true)
      expect((signing.value as SignFlowFailure).reason).toBe('refused')
    })

    it('ignores every update once it has its answer, and unsubscribes', async () => {
      const q = queueOver([basicAccount(KEY)])
      const signing = q.signer.signBytes(HANDLE, BYTES)
      const { userRequest } = addedRequest(q.dispatch)
      expect(q.listeners()).toBe(1)
      q.push(signedFor(userRequest.id, SIG.bytes))
      await expect(signing).resolves.toBe(SIG.bytes)
      expect(q.listeners()).toBe(0)
      q.push(signedFor(userRequest.id, SIG.otherKeyBytes))
      await expect(signing).resolves.toBe(SIG.bytes)
    })
  })

  describe('typed data the signature check cannot encode', () => {
    /** WALLET's address with every letter upper-cased: not checksummed, not lower case. */
    const UPPER = `0x${KEY.slice(2).toUpperCase()}` as Address
    const LOWER = KEY.toLowerCase() as Address

    const carrying = (where: 'message' | 'domain', account: Address) =>
      where === 'message'
        ? {
            ...TYPED,
            types: {
              Approval: [...TYPED.types.Approval, { name: 'account', type: 'address' }]
            },
            message: { ...TYPED.message, account }
          }
        : { ...TYPED, domain: { ...TYPED.domain, verifyingContract: account } }

    const PLACES: [string, 'message' | 'domain'][] = [
      ['an address in the message', 'message'],
      ['the verifying contract', 'domain']
    ]
    PLACES.forEach(([title, where]) => {
      it(`refuses at once ${title} in all upper case, before it queues anything`, async () => {
        expect(UPPER).not.toBe(KEY)
        const worlds = [queueOver([basicAccount(KEY)]), queueOver([])]
        const signings = worlds.map((q) =>
          track(q.signer.signTypedData(HANDLE, carrying(where, UPPER)))
        )
        worlds.forEach((q) => {
          expect(q.dispatch).not.toHaveBeenCalled()
          expect(q.listeners()).toBe(0)
        })
        await flush()
        signings.forEach((signing) => {
          expect(signing.status).toBe('rejected')
          expect(signing.value).toBeInstanceOf(Error)
          expect((signing.value as Error).message).toBe(
            'signTypedData takes valid EIP-712 typed data.'
          )
          expect(isSignFlowFailure(signing.value)).toBe(false)
          expect(isSignerNotWired(signing.value)).toBe(false)
        })
      })

      it(`queues ${title} checksummed or in lower case`, () => {
        ;[KEY, LOWER].forEach((account) => {
          const q = queueOver([basicAccount(KEY)])
          q.signer.signTypedData(HANDLE, carrying(where, account)).catch(() => undefined)
          expect(addedRequest(q.dispatch).userRequest.action).toMatchObject({
            kind: 'typedMessage'
          })
        })
      })
    })
  })

  describe('the first signature under its id', () => {
    it('is the answer: an answer pushed after it, while it is still being checked, changes nothing', async () => {
      const q = queueOver([basicAccount(KEY)])
      const signing = track(q.signer.signBytes(HANDLE, BYTES))
      const { id } = addedRequest(q.dispatch).userRequest
      q.push(signedFor(id, SIG.bytes))
      q.push(signedFor(id, 'not a signature'))
      await flush()
      expect(signing).toEqual({ status: 'resolved', value: SIG.bytes })
    })

    it('decides the request when it is wrong, though a correct signature follows it', async () => {
      const q = queueOver([basicAccount(KEY)])
      const signing = track(q.signer.signBytes(HANDLE, BYTES))
      const { id } = addedRequest(q.dispatch).userRequest
      q.push(signedFor(id, SIG.otherKeyBytes))
      q.push(signedFor(id, SIG.bytes))
      await flush()
      expect(signing.status).toBe('rejected')
      expect((signing.value as SignFlowFailure).reason).toBe('signer-mismatch')
    })

    it('stops the absence count of a request that left the queue before its signature came', async () => {
      const q = queueOver([basicAccount(KEY)])
      const signing = track(q.signer.signBytes(HANDLE, BYTES))
      const { id } = addedRequest(q.dispatch).userRequest
      q.push(queued(id))
      q.push(queued())
      await advance(ABSENCE_GRACE_MS - 1)
      q.push(signedFor(id, SIG.bytes))
      await advance(ABSENCE_GRACE_MS)
      expect(signing).toEqual({ status: 'resolved', value: SIG.bytes })
      expect(dispatched(q.dispatch).map((a) => a.type)).toEqual([ADD])
    })

    it('does not read the queue dropping its signed request as a refusal while the signature is checked', async () => {
      const q = queueOver([basicAccount(KEY)])
      const signing = track(q.signer.signTypedData(HANDLE, TYPED))
      const { id } = addedRequest(q.dispatch).userRequest
      q.push(queued(id))
      q.push(signedFor(id, SIG.typed))
      q.push(queued())
      await advance(ABSENCE_GRACE_MS)
      expect(signing).toEqual({ status: 'resolved', value: SIG.typed })
    })
  })

  describe('the queue guard', () => {
    it('does not refuse a request a queue state never held, before it was queued', async () => {
      const q = queueOver([basicAccount(KEY)])
      const signing = track(q.signer.signBytes(HANDLE, BYTES))
      const { userRequest } = addedRequest(q.dispatch)
      q.push(queued('dapp-request'))
      await advance(ABSENCE_GRACE_MS * 2)
      expect(signing.status).toBe('pending')
      q.push(signedFor(userRequest.id, SIG.bytes))
      await flush()
      expect(signing).toEqual({ status: 'resolved', value: SIG.bytes })
    })

    it('does not refuse a request that leaves the queue for less than the grace, as an account switch moves it', async () => {
      const q = queueOver([basicAccount(KEY)])
      const signing = track(q.signer.signBytes(HANDLE, BYTES))
      const { userRequest } = addedRequest(q.dispatch)
      q.push(queued(userRequest.id))
      q.push(queued())
      await advance(ABSENCE_GRACE_MS - 1)
      q.push({
        controller: 'requests',
        state: { userRequests: [], userRequestsWaitingAccountSwitch: [{ id: userRequest.id }] }
      })
      await advance(ABSENCE_GRACE_MS * 2)
      expect(signing.status).toBe('pending')
      q.push(signedFor(userRequest.id, SIG.bytes))
      await flush()
      expect(signing).toEqual({ status: 'resolved', value: SIG.bytes })
    })

    it('refuses a request the holder rejected, once it stays out of the queue, and withdraws nothing', async () => {
      const q = queueOver([basicAccount(KEY)])
      const signing = track(q.signer.signTypedData(HANDLE, TYPED))
      const { userRequest } = addedRequest(q.dispatch)
      q.push(queued(userRequest.id))
      q.push(queued())
      await advance(ABSENCE_GRACE_MS - 1)
      expect(signing.status).toBe('pending')
      await advance(1)
      expect(signing.status).toBe('rejected')
      expect((signing.value as SignFlowFailure).reason).toBe('refused')
      expect(dispatched(q.dispatch).map((a) => a.type)).toEqual([ADD])
    })
  })

  describe('the timeout', () => {
    it('withdraws its request and rejects once the default wait passes with no answer', async () => {
      const q = queueOver([basicAccount(KEY)])
      const signing = track(q.signer.signBytes(HANDLE, BYTES))
      const { userRequest } = addedRequest(q.dispatch)
      q.push(queued(userRequest.id))
      await advance(DEFAULT_SIGN_TIMEOUT_MS - 1)
      expect(signing.status).toBe('pending')
      await advance(1)
      expect(signing.status).toBe('rejected')
      expect(isSignFlowFailure(signing.value)).toBe(true)
      expect((signing.value as SignFlowFailure).reason).toBe('timeout')
      expect(dispatched(q.dispatch)).toEqual([
        expect.objectContaining({ type: ADD }),
        { type: REMOVE, params: { id: userRequest.id } }
      ])
      expect(q.listeners()).toBe(0)
    })

    it('takes a shorter wait from its options', async () => {
      const q = queueOver([basicAccount(KEY)], { timeoutMs: 1000 })
      const signing = track(q.signer.signTypedData(HANDLE, TYPED))
      await advance(1000)
      expect((signing.value as SignFlowFailure).reason).toBe('timeout')
    })

    it('does not time out after its answer came', async () => {
      const q = queueOver([basicAccount(KEY)])
      const signing = track(q.signer.signBytes(HANDLE, BYTES))
      const { userRequest } = addedRequest(q.dispatch)
      q.push(signedFor(userRequest.id, SIG.bytes))
      await flush()
      await advance(DEFAULT_SIGN_TIMEOUT_MS * 2)
      expect(signing).toEqual({ status: 'resolved', value: SIG.bytes })
      expect(dispatched(q.dispatch).map((a) => a.type)).toEqual([ADD])
    })
  })

  describe('a withdrawal by its caller', () => {
    const sign = (q: QueueWorld, kind: 'bytes' | 'typed', signal: AbortSignal) =>
      track(
        kind === 'bytes'
          ? q.signer.signBytes(HANDLE, BYTES, { signal })
          : q.signer.signTypedData(HANDLE, TYPED, { signal })
      )
    const KINDS: [string, 'bytes' | 'typed'][] = [
      ['raw bytes', 'bytes'],
      ['typed data', 'typed']
    ]

    KINDS.forEach(([title, kind]) => {
      it(`withdraws a queued request over ${title} once when its signal aborts, and ignores a later signature`, async () => {
        const q = queueOver([basicAccount(KEY)])
        const controller = new AbortController()
        const signing = sign(q, kind, controller.signal)
        const { userRequest } = addedRequest(q.dispatch)
        q.push(queued(userRequest.id))
        await flush()
        expect(signing.status).toBe('pending')

        controller.abort()
        await flush()
        expect(signing.status).toBe('rejected')
        expect(isSignFlowFailure(signing.value)).toBe(true)
        expect((signing.value as SignFlowFailure).reason).toBe('withdrawn')
        expect(dispatched(q.dispatch)).toEqual([
          expect.objectContaining({ type: ADD }),
          { type: REMOVE, params: { id: userRequest.id } }
        ])
        expect(q.listeners()).toBe(0)

        q.push(signedFor(userRequest.id, kind === 'bytes' ? SIG.bytes : SIG.typed))
        controller.abort()
        await advance(DEFAULT_SIGN_TIMEOUT_MS * 2)
        expect(signing.status).toBe('rejected')
        expect((signing.value as SignFlowFailure).reason).toBe('withdrawn')
        expect(dispatched(q.dispatch).filter((a) => a.type === REMOVE)).toHaveLength(1)
      })

      it(`refuses a signal over ${title} already aborted at the call and queues nothing`, async () => {
        const q = queueOver([basicAccount(KEY)])
        const controller = new AbortController()
        controller.abort()
        const signing = sign(q, kind, controller.signal)
        await flush()
        expect(signing.status).toBe('rejected')
        expect(isSignFlowFailure(signing.value)).toBe(true)
        expect((signing.value as SignFlowFailure).reason).toBe('withdrawn')
        expect(q.dispatch).not.toHaveBeenCalled()
        expect(q.listeners()).toBe(0)
      })

      it(`changes nothing when the signal over ${title} aborts after the answer came`, async () => {
        const q = queueOver([basicAccount(KEY)])
        const controller = new AbortController()
        const signing = sign(q, kind, controller.signal)
        const signature = kind === 'bytes' ? SIG.bytes : SIG.typed
        const { userRequest } = addedRequest(q.dispatch)
        q.push(queued(userRequest.id))
        q.push(signedFor(userRequest.id, signature))
        await flush()
        expect(signing).toEqual({ status: 'resolved', value: signature })

        controller.abort()
        await flush()
        expect(signing).toEqual({ status: 'resolved', value: signature })
        expect(dispatched(q.dispatch).map((a) => a.type)).toEqual([ADD])
      })
    })

    it('does not withdraw a request whose signal aborts while its signature is being checked', async () => {
      const q = queueOver([basicAccount(KEY)])
      const controller = new AbortController()
      const signing = sign(q, 'typed', controller.signal)
      const { userRequest } = addedRequest(q.dispatch)
      q.push(queued(userRequest.id))
      q.push(signedFor(userRequest.id, SIG.typed))
      controller.abort()
      await flush()
      expect(signing).toEqual({ status: 'resolved', value: SIG.typed })
      expect(dispatched(q.dispatch).map((a) => a.type)).toEqual([ADD])
    })

    it('withdraws only the request its signal was given to', async () => {
      const q = queueOver([basicAccount(KEY)])
      const controller = new AbortController()
      const aborted = sign(q, 'bytes', controller.signal)
      const kept = track(q.signer.signBytes(HANDLE, BYTES))
      const [abortedId, keptId] = dispatched(q.dispatch).flatMap((a) =>
        a.type === ADD ? [a.params.userRequest.id] : []
      )
      q.push(queued(abortedId, keptId))
      controller.abort()
      await flush()
      expect(aborted.status).toBe('rejected')
      expect(kept.status).toBe('pending')
      expect(dispatched(q.dispatch).filter((a) => a.type === REMOVE)).toEqual([
        { type: REMOVE, params: { id: abortedId } }
      ])
      q.push(signedFor(keptId, SIG.bytes))
      await flush()
      expect(kept).toEqual({ status: 'resolved', value: SIG.bytes })
    })

    it('still times out with options that carry no signal, and withdraws its request once', async () => {
      const q = queueOver([basicAccount(KEY)], { timeoutMs: 1000 })
      const signing = track(q.signer.signTypedData(HANDLE, TYPED, {}))
      const { userRequest } = addedRequest(q.dispatch)
      q.push(queued(userRequest.id))
      await advance(1000)
      expect(signing.status).toBe('rejected')
      expect((signing.value as SignFlowFailure).reason).toBe('timeout')
      expect(dispatched(q.dispatch).filter((a) => a.type === REMOVE)).toEqual([
        { type: REMOVE, params: { id: userRequest.id } }
      ])
    })

    it('does not withdraw twice when the signal aborts after the timeout', async () => {
      const q = queueOver([basicAccount(KEY)], { timeoutMs: 1000 })
      const controller = new AbortController()
      const signing = sign(q, 'bytes', controller.signal)
      q.push(queued(addedRequest(q.dispatch).userRequest.id))
      await advance(1000)
      controller.abort()
      await flush()
      expect((signing.value as SignFlowFailure).reason).toBe('timeout')
      expect(dispatched(q.dispatch).filter((a) => a.type === REMOVE)).toHaveLength(1)
    })

    it('lets one abort of a signal reused across two calls touch only the call still waiting', async () => {
      const q = queueOver([basicAccount(KEY)])
      const controller = new AbortController()
      const first = sign(q, 'bytes', controller.signal)
      const firstId = addedRequest(q.dispatch).userRequest.id
      q.push(queued(firstId))
      q.push(signedFor(firstId, SIG.bytes))
      await flush()
      expect(first).toEqual({ status: 'resolved', value: SIG.bytes })

      const second = sign(q, 'typed', controller.signal)
      const [, secondId] = dispatched(q.dispatch).flatMap((a) =>
        a.type === ADD ? [a.params.userRequest.id] : []
      )
      q.push(queued(secondId))
      await flush()
      expect(second.status).toBe('pending')

      controller.abort()
      await flush()
      expect(first).toEqual({ status: 'resolved', value: SIG.bytes })
      expect(second.status).toBe('rejected')
      expect((second.value as SignFlowFailure).reason).toBe('withdrawn')
      expect(dispatched(q.dispatch).filter((a) => a.type === REMOVE)).toEqual([
        { type: REMOVE, params: { id: secondId } }
      ])
    })

    it('reports an input error or an unwired key before a signal already aborted at the call', async () => {
      const controller = new AbortController()
      controller.abort()
      const { signal } = controller

      const q = queueOver([basicAccount(KEY)])
      const domainOnly = await thrownBy(
        q.signer.signTypedData(HANDLE, { ...TYPED, primaryType: 'EIP712Domain' }, { signal })
      )
      expect(isSignFlowFailure(domainOnly)).toBe(false)
      expect((domainOnly as Error).message).toContain('EIP712Domain alone')

      const unlisted = queueOver([])
      const unwired = await thrownBy(unlisted.signer.signBytes(HANDLE, BYTES, { signal }))
      expect(isSignerNotWired(unwired)).toBe(true)
      expect(isSignFlowFailure(unwired)).toBe(false)

      expect(q.dispatch).not.toHaveBeenCalled()
      expect(unlisted.dispatch).not.toHaveBeenCalled()
    })
  })

  describe('a withdrawal before the queue holds the request where it can be removed', () => {
    const WAIT_MS = ABSENCE_GRACE_MS * 4
    const removes = (q: QueueWorld) => dispatched(q.dispatch).filter((a) => a.type === REMOVE)
    const removeOf = (id: string | number) => ({ type: REMOVE, params: { id } })
    const started = (signal?: AbortSignal) => {
      const q = queueOver([basicAccount(KEY)], { timeoutMs: WAIT_MS })
      const signing = track(q.signer.signBytes(HANDLE, BYTES, { signal }))
      return { q, signing, id: addedRequest(q.dispatch).userRequest.id }
    }

    const LISTS: [string, (id: string | number) => ReturnType<typeof listedIn>, number][] = [
      ['the queue', (id) => listedIn([id], []), 0],
      ['the list waiting for an account switch', (id) => listedIn([], [id]), 1]
    ]
    LISTS.forEach(([where, listing, listenersAfter]) => {
      it(`rejects at once when aborted while the add is in flight, and removes the request once ${where} lists it`, async () => {
        const controller = new AbortController()
        const { q, signing, id } = started(controller.signal)
        controller.abort()
        await flush()
        expect(signing.status).toBe('rejected')
        expect((signing.value as SignFlowFailure).reason).toBe('withdrawn')
        expect(removes(q)).toEqual([])

        q.push(queued('dapp-request'))
        await flush()
        expect(removes(q)).toEqual([])

        q.push(listing(id))
        await flush()
        expect(removes(q)).toEqual([removeOf(id)])
        expect(q.listeners()).toBe(listenersAfter)
      })
    })

    it('removes a request present in the queue at the abort once, and stops listening at once', async () => {
      const controller = new AbortController()
      const { q, signing, id } = started(controller.signal)
      q.push(listedIn([id], []))
      controller.abort()
      await flush()
      expect((signing.value as SignFlowFailure).reason).toBe('withdrawn')
      expect(removes(q)).toEqual([removeOf(id)])
      expect(q.listeners()).toBe(0)
    })

    it('removes a request waiting for an account switch at the abort, and again once the accepted switch queues it', async () => {
      const controller = new AbortController()
      const { q, signing, id } = started(controller.signal)
      q.push(listedIn([], [id]))
      controller.abort()
      await flush()
      expect(signing.status).toBe('rejected')
      expect((signing.value as SignFlowFailure).reason).toBe('withdrawn')
      expect(removes(q)).toEqual([removeOf(id)])
      expect(q.listeners()).toBe(1)

      q.push(listedIn([], [id]))
      q.push(listedIn([], [id]))
      expect(removes(q)).toHaveLength(1)

      q.push(listedIn([id], []))
      expect(removes(q)).toEqual([removeOf(id), removeOf(id)])
      expect(q.listeners()).toBe(0)

      q.push(listedIn([id], []))
      q.push(signedFor(id, SIG.bytes))
      await advance(WAIT_MS * 2)
      expect(removes(q)).toHaveLength(2)
      expect(signing.status).toBe('rejected')
      expect((signing.value as SignFlowFailure).reason).toBe('withdrawn')
    })

    it('removes the request again when the switch moves it with a state between the two lists', async () => {
      const controller = new AbortController()
      const { q, id } = started(controller.signal)
      q.push(listedIn([], [id]))
      controller.abort()
      q.push(listedIn([], []))
      await advance(ABSENCE_GRACE_MS - 1)
      q.push(listedIn([id], []))
      expect(removes(q)).toEqual([removeOf(id), removeOf(id)])
      expect(q.listeners()).toBe(0)
    })

    it('stops listening once a withdrawn request stays out of both lists for the grace', async () => {
      const controller = new AbortController()
      const { q, id } = started(controller.signal)
      q.push(listedIn([], [id]))
      controller.abort()
      q.push(listedIn([], []))
      await advance(ABSENCE_GRACE_MS - 1)
      expect(q.listeners()).toBe(1)
      await advance(1)
      expect(q.listeners()).toBe(0)
      q.push(listedIn([id], []))
      expect(removes(q)).toEqual([removeOf(id)])
    })

    it('sends no removal for an add that never reaches either list, and stops listening at the wait', async () => {
      const controller = new AbortController()
      const { q, signing } = started(controller.signal)
      await advance(400)
      controller.abort()
      await flush()
      expect((signing.value as SignFlowFailure).reason).toBe('withdrawn')
      q.push(queued('dapp-request'))
      q.push(listedIn([], []))
      await advance(WAIT_MS - 1)
      expect(q.listeners()).toBe(1)
      await advance(1)
      expect(q.listeners()).toBe(0)
      expect(removes(q)).toEqual([])
    })

    it('stops watching a request still waiting for a switch once the wait passes after the abort', async () => {
      const controller = new AbortController()
      const { q, id } = started(controller.signal)
      q.push(listedIn([], [id]))
      await advance(400)
      controller.abort()
      await advance(WAIT_MS - 1)
      q.push(listedIn([], [id]))
      expect(q.listeners()).toBe(1)
      await advance(1)
      expect(q.listeners()).toBe(0)
      q.push(listedIn([id], []))
      expect(removes(q)).toEqual([removeOf(id)])
    })

    describe('on the timeout', () => {
      it('removes a request whose add the queue never listed once a state lists it', async () => {
        const { q, signing, id } = started()
        await advance(WAIT_MS)
        expect((signing.value as SignFlowFailure).reason).toBe('timeout')
        expect(removes(q)).toEqual([])
        q.push(listedIn([id], []))
        expect(removes(q)).toEqual([removeOf(id)])
        expect(q.listeners()).toBe(0)
      })

      it('removes a request waiting for a switch, and again once the switch queues it', async () => {
        const { q, signing, id } = started()
        q.push(listedIn([], [id]))
        await advance(WAIT_MS)
        expect((signing.value as SignFlowFailure).reason).toBe('timeout')
        expect(removes(q)).toEqual([removeOf(id)])
        q.push(listedIn([], [id]))
        expect(removes(q)).toHaveLength(1)
        q.push(listedIn([id], []))
        expect(removes(q)).toEqual([removeOf(id), removeOf(id)])
        expect(q.listeners()).toBe(0)
      })

      it('sends no removal for an add no state ever lists, and stops listening a wait after the timeout', async () => {
        const { q, signing } = started()
        await advance(WAIT_MS)
        expect((signing.value as SignFlowFailure).reason).toBe('timeout')
        await advance(WAIT_MS - 1)
        expect(q.listeners()).toBe(1)
        await advance(1)
        expect(q.listeners()).toBe(0)
        expect(removes(q)).toEqual([])
      })
    })
  })

  it('rejects an answer that is not a hex signature', async () => {
    const q = queueOver([basicAccount(KEY)])
    const signing = q.signer.signTypedData(HANDLE, TYPED)
    const { userRequest } = addedRequest(q.dispatch)
    q.push(signedFor(userRequest.id, 'not a signature'))
    const caught = await thrownBy(signing)
    expect(isSignFlowFailure(caught)).toBe(true)
    expect((caught as SignFlowFailure).reason).toBe('malformed-signature')
  })

  it('refuses bytes that are not hex and adds no request', async () => {
    const q = queueOver([basicAccount(KEY)])
    await expect(q.signer.signBytes(HANDLE, 'plain text' as Hex)).rejects.toBeDefined()
    expect(q.dispatch).not.toHaveBeenCalled()
  })

  it('exposes exactly its two signing members and none whose name contains export, private or seed', () => {
    const { signer } = queueOver()
    const names = memberNamesOf(signer)
    expect(names.sort()).toEqual([...SIGNER_MEMBERS].sort())
    expect(names.filter((n) => /export|private|seed/i.test(n))).toEqual([])
    expect(Object.isFrozen(signer)).toBe(true)
  })

  it('dispatches only the queue actions, and none that sends a key or a seed to the UI', async () => {
    const q = queueOver([basicAccount(KEY)])
    const first = q.signer.signTypedData(HANDLE, TYPED)
    q.push(signedFor(addedRequest(q.dispatch).userRequest.id, SIG.typed))
    await first
    const types = dispatched(q.dispatch).map((a) => a.type as string)
    types.forEach((t) => expect([ADD, REMOVE]).toContain(t))
    expect(types.filter((t) => /KEYSTORE|PRIVATE_KEY|SEED|EXPORT/.test(t))).toEqual([])
  })
})

describe('the known limit: a key that is not itself a listed basic account', () => {
  const controllingKey = addressOf('controlling-key-at-index-plus-100000')
  const smart = smartAccount(addressOf('smart-account'), controllingKey)

  SIGNER_MEMBERS.forEach((member) =>
    it(`${member} throws SignerNotWired naming KEYSTORE_CONTROLLER_SIGN_WITH_KEY and dispatches nothing`, async () => {
      const q = queueOver([smart])
      const key: KeyHandle = { addr: controllingKey, type: 'internal' }
      const caught = await thrownBy(
        member === 'signTypedData'
          ? q.signer.signTypedData(key, TYPED)
          : q.signer.signBytes(key, BYTES)
      )
      expect(isSignerNotWired(caught)).toBe(true)
      const refusal = caught as SignerNotWired
      expect(MISSING_BACKGROUND_ACTION).toBe('KEYSTORE_CONTROLLER_SIGN_WITH_KEY')
      expect(refusal.missingAction).toBe('KEYSTORE_CONTROLLER_SIGN_WITH_KEY')
      expect(refusal.message).toContain('KEYSTORE_CONTROLLER_SIGN_WITH_KEY')
      expect(refusal.member).toBe(member)
      expect(refusal.key).toEqual(key)
      expect(q.dispatch).not.toHaveBeenCalled()
      expect(q.listeners()).toBe(0)
    })
  )

  it('refuses a key whose account the wallet does not list the same way', async () => {
    const q = queueOver([])
    const caught = await thrownBy(q.signer.signBytes(HANDLE, BYTES))
    expect(isSignerNotWired(caught)).toBe(true)
    expect(q.dispatch).not.toHaveBeenCalled()
  })
})
