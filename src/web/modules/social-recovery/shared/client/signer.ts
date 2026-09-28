/**
 * The signer facade: typed data or raw bytes signed for a key the keystore
 * holds, addressed by the keystore's own handle of address and key type. It
 * exposes those two members and nothing else, so no key, seed or export
 * reaches a screen through it.
 *
 * The keystore and its signers live in the background and the UI reaches them
 * only by dispatch. Every signature goes through the action window for the
 * holder's confirmation, so the facade routes each one through the request
 * queue as a request of its own:
 *
 * 1. It dispatches `REQUESTS_CONTROLLER_ADD_USER_REQUEST` with a sign request
 *    under an id of its own: the key's address as the account, the recovery
 *    chain, the typed message or the plain message, an internal session and
 *    `allowAccountSwitch`.
 * 2. The queue opens the action window on that request. The window's own
 *    sign-message screen initialises the sign-message controller with the
 *    request's id, shows the holder the message, and signs only when the
 *    holder confirms. The facade dispatches nothing to that controller.
 * 3. The facade takes the signature from the `signMessage` controller state
 *    whose `signedMessage` carries its request's id, and accepts it only if
 *    it recovers, in this page, to the key's address over the facade's own
 *    content. A request that leaves the queue with no such signature (the
 *    holder rejected it or closed the window) is refused. A request with no
 *    answer in time is withdrawn.
 *
 * The queue signs for an account the wallet lists with that account's keys.
 * A key that is itself a basic account (an EOA the wallet lists, its own only
 * associated key) therefore gets its own plain signature: EIP-712 over typed
 * data, EIP-191 over bytes. Any other key, such as the smart account's
 * controlling key at the slot's index plus 100000, cannot sign through it, and
 * the facade refuses such a key with `SignerNotWired`. Raw bytes always carry
 * the EIP-191 prefix: the queue has no request that signs a bare digest.
 */
import { v4 as uuidv4 } from 'uuid'
import {
  hashTypedData,
  isHex,
  recoverMessageAddress,
  recoverTypedDataAddress,
  type TypedDataDomain
} from 'viem'

import { Session } from '@ambire-common/classes/session'
import type {
  PlainTextMessage,
  SignUserRequest,
  TypedMessage
} from '@ambire-common/interfaces/userRequest'
import type { Address, Hex } from '@web/modules/social-recovery/sdk-interfaces'

import { sameAddress } from './addresses'
import type {
  KeyHandle,
  ListedAccount,
  SignerFacade,
  SignerFacadeOptions,
  SignerMember,
  SignerNotWired,
  SignFlowFailure,
  SignFlowFailureReason,
  SignRequestPort,
  TypedDataToSign
} from './types'

export const SIGNER_MEMBERS = ['signTypedData', 'signBytes'] as const

/** The background action a `SignerNotWired` key needs. It does not exist yet. */
export const MISSING_BACKGROUND_ACTION = 'KEYSTORE_CONTROLLER_SIGN_WITH_KEY' as const

export const signerNotWired = (member: SignerMember, key: KeyHandle): SignerNotWired => {
  const error = new Error(
    `${member} is not wired for key ${key.addr} (${key.type}): the request queue signs only for a key that is itself a basic account the wallet lists. Missing background action: ${MISSING_BACKGROUND_ACTION} { requestId, keyAddr, keyType, content }, signing with KeystoreController.getSigner(keyAddr, keyType) and answering the UI.`
  ) as SignerNotWired
  error.name = 'SignerNotWired'
  error.member = member
  error.key = { ...key }
  error.missingAction = MISSING_BACKGROUND_ACTION
  return error
}

export const isSignerNotWired = (value: unknown): value is SignerNotWired =>
  value instanceof Error && value.name === 'SignerNotWired'

/**
 * Why a queued request returned no signature: it left the queue with none
 * (the holder rejected it or closed the action window), no answer came in
 * time (the facade then withdraws it), the answer was not a hex signature,
 * or the signature does not recover to the key's address over the facade's
 * own content.
 */
export const SIGN_FLOW_FAILURE_REASONS = [
  'refused',
  'timeout',
  'malformed-signature',
  'signer-mismatch'
] as const

export const signFlowFailure = (
  member: SignerMember,
  reason: SignFlowFailureReason
): SignFlowFailure => {
  const error = new Error(`${member} did not return a signature: ${reason}.`) as SignFlowFailure
  error.name = 'SignFlowFailure'
  error.member = member
  error.reason = reason
  return error
}

export const isSignFlowFailure = (value: unknown): value is SignFlowFailure =>
  value instanceof Error && value.name === 'SignFlowFailure'

/**
 * How long the facade waits for the holder's confirmation, a hardware key's
 * included. The queue shows one sign-message request at a time and drops one
 * added while another is visible, so such a request ends here. It also skips a
 * request while a swap, bridge or transfer signs with a hardware wallet in the
 * action window, so that request times out too.
 *
 * The withdrawal reaches `userRequests` alone: a request still waiting for an
 * account switch stays until the action window closes. A holder who accepts
 * that switch after the timeout still sees the sign screen; the signature then
 * reaches no caller, but the activity records it.
 *
 * Each signature adds an entry to the account's activity and raises a "message
 * signed" notification, and an accepted switch changes the wallet's selected
 * account.
 */
export const DEFAULT_SIGN_TIMEOUT_MS = 10 * 60 * 1000

/** How long the request must stay out of the queue, with no signature, before it counts as refused. */
export const ABSENCE_GRACE_MS = 3000

const DOMAIN_MEMBERS = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
  { name: 'salt', type: 'bytes32' }
] as const

/** The typed message the queue takes, with `EIP712Domain` derived from the domain where absent. */
export const typedMessageOf = (typedData: TypedDataToSign): TypedMessage => {
  const { domain } = typedData
  const types = typedData.types.EIP712Domain
    ? { ...typedData.types }
    : {
        EIP712Domain: DOMAIN_MEMBERS.filter(
          (member) => domain[member.name] !== undefined && domain[member.name] !== null
        ).map((member) => ({ ...member })),
        ...typedData.types
      }
  return {
    kind: 'typedMessage',
    domain: typedData.domain,
    types,
    message: typedData.message,
    primaryType: typedData.primaryType
  }
}

/**
 * The basic account the wallet lists for a key: an account at the key's own
 * address, with no creation code, whose associated keys hold that address.
 * The one case the queue signs as the key. Undefined for any other key.
 */
export const listedBasicAccountOf = (
  accounts: readonly ListedAccount[],
  key: KeyHandle
): ListedAccount | undefined =>
  accounts.find(
    (account) =>
      sameAddress(account.addr, key.addr) &&
      !account.creation &&
      account.associatedKeys.some((associated) => sameAddress(associated, key.addr))
  )

/** Whether a key is itself a basic account the wallet lists, the one case the queue signs as the key. */
export const isListedBasicAccountKey = (
  accounts: readonly ListedAccount[],
  key: KeyHandle
): boolean => listedBasicAccountOf(accounts, key) !== undefined

/**
 * A request id no other page makes: the facade's prefix and a random UUID.
 * The queue takes a string id as it takes a number (`UserRequest['id']`).
 */
const nextRequestId = (): string => `social-recovery-signer:${uuidv4()}`

const sameId = (a: string | number | undefined, b: string | number): boolean =>
  a !== undefined && String(a) === String(b)

/** The typed message as viem's EIP-712 encoder takes it. */
const eip712Of = (typed: TypedMessage) => ({
  domain: typed.domain as TypedDataDomain,
  types: typed.types,
  primaryType: typed.primaryType,
  message: typed.message
})

/**
 * The address a signature recovers to over the facade's own content: EIP-712
 * over the typed message, EIP-191 over the bytes. Undefined where the
 * signature cannot be recovered at all.
 */
export const recoveredSignerOf = async (
  content: PlainTextMessage | TypedMessage,
  signature: Hex
): Promise<Address | undefined> => {
  try {
    return content.kind === 'typedMessage'
      ? await recoverTypedDataAddress({ ...eip712Of(content), signature })
      : await recoverMessageAddress({ message: { raw: content.message }, signature })
  } catch {
    return undefined
  }
}

/**
 * The sign request the facade adds to the queue for one key and one content.
 * `meta.keyType` carries the handle's key type beside the account address, so
 * the key type travels with the request. Today the action window does not read
 * it: it picks the key among the account's keys, which for a listed basic
 * account all sign as the same address. `key.addr` must be the listed
 * account's own address as the wallet holds it, since the queue and the
 * sign-message controller compare addresses with exact case.
 */
export const signRequestOf = (
  id: string,
  key: KeyHandle,
  chainId: bigint,
  content: PlainTextMessage | TypedMessage,
  windowId: number | undefined
): SignUserRequest => ({
  id,
  session: new Session({ windowId }),
  meta: { isSignAction: true, accountAddr: key.addr, keyType: key.type, chainId },
  action: content
})

/** Builds the signer facade over the request queue. */
export const createSignerFacade = (
  port: SignRequestPort,
  options: SignerFacadeOptions
): SignerFacade => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_SIGN_TIMEOUT_MS
  const chainId = BigInt(options.chainId)

  const run = (
    member: SignerMember,
    key: KeyHandle,
    content: PlainTextMessage | TypedMessage
  ): Promise<Hex> => {
    const listed = listedBasicAccountOf(port.accounts(), key)
    if (!listed) {
      return Promise.reject(signerNotWired(member, key))
    }
    // The queue and the sign-message controller compare addresses with exact
    // case, so the request carries the listed account's own (checksum-cased) address.
    const requestKey: KeyHandle = { addr: listed.addr as Address, type: key.type }
    const id = nextRequestId()
    return new Promise<Hex>((resolve, reject) => {
      let done = false
      let answered = false
      let queued = false
      let unsubscribe: () => void = () => {}
      let timer: ReturnType<typeof setTimeout> | undefined
      let absence: ReturnType<typeof setTimeout> | undefined

      const end = (withdraw: boolean): boolean => {
        if (done) return false
        done = true
        if (timer !== undefined) clearTimeout(timer)
        if (absence !== undefined) clearTimeout(absence)
        unsubscribe()
        if (withdraw)
          port.dispatch({ type: 'REQUESTS_CONTROLLER_REMOVE_USER_REQUEST', params: { id } })
        return true
      }
      const succeed = (signature: Hex) => {
        if (end(false)) resolve(signature)
      }
      const fail = (reason: SignFlowFailureReason, withdraw = false) => {
        if (end(withdraw)) reject(signFlowFailure(member, reason))
      }

      timer = setTimeout(() => fail('timeout', true), timeoutMs)

      unsubscribe = port.subscribe((update) => {
        // The first signature under the request's id is its answer; nothing
        // pushed after it counts.
        if (done || answered) return
        if (update.controller === 'signMessage') {
          const signed = update.state.signedMessage
          if (!signed || !sameId(signed.fromActionId, id)) return
          const { signature } = signed
          const malformed = () => fail('malformed-signature')
          if (!isHex(signature)) {
            malformed()
            return
          }
          answered = true
          if (absence !== undefined) clearTimeout(absence)
          absence = undefined
          // Verified in this page: the signature must recover to the key over
          // the facade's own content, whatever the background reports.
          recoveredSignerOf(content, signature).then((recovered) => {
            if (recovered === undefined) {
              malformed()
            } else if (!sameAddress(recovered, key.addr)) {
              fail('signer-mismatch')
            } else {
              succeed(signature)
            }
          }, malformed)
          return
        }
        const present = [
          ...(update.state.userRequests ?? []),
          ...(update.state.userRequestsWaitingAccountSwitch ?? [])
        ].some((request) => sameId(request.id, id))
        if (present) {
          queued = true
          if (absence !== undefined) clearTimeout(absence)
          absence = undefined
        } else if (queued && absence === undefined) {
          // The queue moves a request between its two lists after an account
          // switch and may push a state between the two moves, so an absence
          // counts only once it lasts.
          absence = setTimeout(() => fail('refused'), ABSENCE_GRACE_MS)
        }
      })

      port.dispatch({
        type: 'REQUESTS_CONTROLLER_ADD_USER_REQUEST',
        params: {
          userRequest: signRequestOf(id, requestKey, chainId, content, port.windowId()),
          allowAccountSwitch: true
        }
      })
    })
  }

  return Object.freeze({
    signTypedData(key: KeyHandle, typedData: TypedDataToSign): Promise<Hex> {
      // A domain alone carries no message for the holder to read.
      if (typedData.primaryType === 'EIP712Domain') {
        return Promise.reject(
          new Error('signTypedData signs a message, never the EIP712Domain alone.')
        )
      }
      const content = typedMessageOf(typedData)
      // Typed data the signature check could not encode is refused before the
      // holder is asked to sign it.
      try {
        hashTypedData(eip712Of(content))
      } catch {
        return Promise.reject(new Error('signTypedData takes valid EIP-712 typed data.'))
      }
      return run('signTypedData', key, content)
    },
    signBytes(key: KeyHandle, bytes: Hex): Promise<Hex> {
      if (!isHex(bytes)) {
        return Promise.reject(new Error('signBytes takes 0x-prefixed hex bytes.'))
      }
      return run('signBytes', key, { kind: 'message', message: bytes })
    }
  })
}
