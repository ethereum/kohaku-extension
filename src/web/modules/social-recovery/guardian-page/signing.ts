/**
 * The signing half of the approval page, as pure functions: the key the
 * request names and how this wallet holds it, the typed data the approving
 * side hands over, and how an answer of the signer or of the approving side
 * reads.
 */
import { isAddress } from 'viem'

import type { Address, ApproverRequest, Verdict } from '@kohaku-eth/social-recovery'
import { isObject } from '@web/modules/social-recovery/recovery/checklist/codec'
import { isSignFlowFailure, sameAddress } from '@web/modules/social-recovery/shared/client'
import type { RecoveryKitClient, TypedDataToSign } from '@web/modules/social-recovery/shared/client'
import type { Translate } from '@web/modules/social-recovery/shared/display'

import { ECDSA_SLUG } from './constants'
import type { KeyReading, KeystoreFacts, OfflineFailure, SigningFailure } from './types'

/**
 * The address the request's credential names: the wallet method's own codec
 * decodes the config, for a request whose method is the one the wallet
 * method serves; the codec names the address `signer`. Null where the request
 * names another method or the config does not decode to an address.
 */
export const requestKeyOf = (
  client: Pick<RecoveryKitClient, 'methodFor' | 'descriptor'>,
  request: ApproverRequest
): Address | null => {
  const method = client.methodFor(ECDSA_SLUG)
  if (!method || !method.modules(client.descriptor).some((m) => sameAddress(m, request.method))) {
    return null
  }
  try {
    const fields: unknown = method.codec.decodeConfig(request.config)
    return isObject(fields) && typeof fields.signer === 'string' && isAddress(fields.signer)
      ? fields.signer
      : null
  } catch {
    return null
  }
}

/**
 * How this wallet holds the key: a wallet with no keystore reads as missing,
 * a locked one as locked, then held where the keystore has an entry for the
 * address and missing where it has none.
 */
export const keyReadingOf = (address: Address | null, keystore: KeystoreFacts): KeyReading => {
  if (!address) {
    return { kind: 'unreadable' }
  }
  if (!keystore.hasPasswordSecret) {
    return { kind: 'missing', address }
  }
  if (!keystore.isUnlocked) {
    return { kind: 'locked', address }
  }
  const held = (keystore.keys ?? []).find((key) => sameAddress(key.addr, address))
  return held
    ? { kind: 'held', key: { addr: address, type: held.type } }
    : { kind: 'missing', address }
}

/** Whether the sign action can be pressed for this key reading: a held key, or a locked one to unlock. */
export const keyAllowsSign = (reading: KeyReading): boolean =>
  reading.kind === 'held' || reading.kind === 'locked'

/**
 * The typed data the approving side hands over for the request, or null
 * where it refuses the request or hands over anything else.
 */
export const typedDataOf = (
  signingInput: (request: ApproverRequest) => unknown,
  request: ApproverRequest
): TypedDataToSign | null => {
  let input: unknown
  try {
    input = signingInput(request)
  } catch {
    return null
  }
  if (
    !isObject(input) ||
    !isObject(input.domain) ||
    !isObject(input.types) ||
    typeof input.primaryType !== 'string' ||
    !isObject(input.message)
  ) {
    return null
  }
  return input as unknown as TypedDataToSign
}

/**
 * Why the wallet's sign request brought no signature: the guardian refused
 * it in the sign window, the signature the window returned recovers to
 * another key, or anything else that stopped it.
 */
export const signingFailureOf = (error: unknown): SigningFailure => {
  if (isSignFlowFailure(error)) {
    if (error.reason === 'refused') {
      return 'refused'
    }
    if (error.reason === 'signer-mismatch') {
      return 'wrongKey'
    }
  }
  return 'failed'
}

/**
 * Whether the approving side's verdict lets a signature from the wallet's
 * own key through: anything but rejected passes, since the chain's own check
 * decides a verdict the page cannot reach.
 */
export const walletVerdictFailure = (verdict: Verdict): SigningFailure | null =>
  verdict === 'rejected' ? 'wrongKey' : null

/**
 * Whether the verdict lets a pasted signature through. The offline route
 * signs with an ordinary key, so only a satisfied verdict passes; a verdict
 * the page could not reach means the key that signed is not the one named.
 */
export const offlineVerdictFailure = (verdict: Verdict): OfflineFailure | null => {
  if (verdict === 'satisfied') {
    return null
  }
  return verdict === 'rejected' ? 'notASignature' : 'wrongSigner'
}

/** The message a guardian who declined sends the owner. */
export const declineMessageOf = (account: string, newKey: string, t: Translate): string =>
  t('socialRecovery.guardianPage.declined.message', { account, newKey })

/** The message around the approval line. */
export const approvalMessageOf = (account: string, line: string, t: Translate): string =>
  t('socialRecovery.guardianPage.signed.message', { account, line })
