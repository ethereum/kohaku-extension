/**
 * The page's signing: the wallet's own key signs the typed data in the
 * wallet's sign window, or a signature made off this device is pasted back;
 * either way the approving side packages it into the reply and judges it
 * before the page keeps the approval line. One signing runs at a time, so a
 * second press while one runs does nothing, and nothing runs once the
 * approval exists. Where the approving side cannot judge the wallet's own
 * signature, as for a smart account's, the chain's verdict decides: only its
 * satisfied keeps the approval, its rejected reads as the wrong key, and any
 * other answer, a read that fails or one that does not answer in time reads
 * as unread with a retry; a pasted signature is
 * judged by the approving side alone. The state belongs to the request the
 * page shows: another link opened in the same tab starts with none, the sign request of the
 * request it replaced is withdrawn from the request queue, as it is when the
 * page goes away, and an answer for a replaced request is dropped. The page
 * withdraws the signing of a request the guardian declined or that ended:
 * its sign request leaves the queue, any later answer of the wallet or of
 * the approving side is dropped, and nothing signs for that request again.
 * An approval that arrives once the request no longer takes one is dropped
 * too, and the page shows why. Nothing here holds a key.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import type { ApproverRequest, Hex } from '@kohaku-eth/social-recovery'
import { replyLineOf } from '@web/modules/social-recovery/recovery/checklist'
import { signatureOf } from '@web/modules/social-recovery/setup/enroll/guardian'
import { ACCOUNT_CHECK_LIMIT_MS, within } from '@web/modules/social-recovery/shared/client'
import type { KeyHandle, TypedDataToSign } from '@web/modules/social-recovery/shared/client'

import { offlineVerdictFailure, signingFailureOf, walletVerdictFailure } from './signing'
import type {
  ApprovalOutcome,
  GuardianSigning,
  GuardianSigningInput,
  OfflineFailure,
  SignedApproval,
  SigningFailure,
  SigningState
} from './types'

const idleFor = (request: ApproverRequest | null): SigningState => ({
  request,
  busy: false,
  failure: null,
  offlineFailure: null,
  approval: null
})

const useGuardianSigning = ({
  approving,
  chainVerdict,
  request,
  signTypedData,
  ended
}: GuardianSigningInput): GuardianSigning => {
  const [state, setState] = useState<SigningState>(() => idleFor(request))
  const current = state.request === request ? state : idleFor(request)
  const requestRef = useRef(request)
  requestRef.current = request
  // The request whose signing runs, the request that has its approval, and
  // the request whose signing was withdrawn for good.
  const running = useRef<ApproverRequest | null>(null)
  const approved = useRef<ApproverRequest | null>(null)
  const withdrawn = useRef<ApproverRequest | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // The running sign request, withdrawn once the page no longer shows its
  // request: another link in the same tab, or the page going away.
  const withdrawal = useRef<AbortController | null>(null)
  useEffect(
    () => () => {
      withdrawal.current?.abort()
      withdrawal.current = null
    },
    [request]
  )

  // A signing's answer counts only while the page still shows its request.
  const update = useCallback((owner: ApproverRequest, change: Partial<SigningState>) => {
    if (!mounted.current || requestRef.current !== owner) {
      return
    }
    setState((prev) => ({ ...(prev.request === owner ? prev : idleFor(owner)), ...change }))
  }, [])

  // The reply the approving side packages from a signature, judged for the
  // request's own place.
  const outcomeOf = useCallback(
    async (
      owner: ApproverRequest,
      typedData: TypedDataToSign,
      signature: Hex
    ): Promise<ApprovalOutcome> => {
      if (!approving) {
        return 'unpackaged'
      }
      const reply = await approving.replyFrom(owner, { ...typedData }, { signature })
      if (reply.kind === 'reply-failure') {
        return 'unpackaged'
      }
      const verdict = await approving.verify(owner, owner.place, reply.proof)
      return { approval: { line: replyLineOf(reply), proof: reply.proof }, verdict, reply }
    },
    [approving]
  )

  // Runs one signing to its end: the approval is kept, a failure is shown.
  const runOnce = useCallback(
    <F extends string>(
      owner: ApproverRequest,
      work: () => Promise<F | SignedApproval>,
      failureOf: (f: F) => Partial<SigningState>
    ) => {
      running.current = owner
      update(owner, { busy: true })
      work()
        .then((result) => {
          if (requestRef.current !== owner || withdrawn.current === owner) {
            return
          }
          // An approval the request no longer takes is dropped, and the page
          // shows the reading that ended it.
          if (typeof result === 'string') {
            update(owner, failureOf(result))
          } else if (!ended()) {
            approved.current = owner
            update(owner, { approval: result })
          }
        })
        .finally(() => {
          if (running.current === owner) {
            running.current = null
          }
          update(owner, { busy: false })
        })
    },
    [update, ended]
  )

  const idle = useCallback(
    (owner: ApproverRequest | null): owner is ApproverRequest =>
      !!owner &&
      running.current !== owner &&
      approved.current !== owner &&
      withdrawn.current !== owner,
    []
  )

  const withdraw = useCallback(() => {
    const owner = requestRef.current
    if (!owner) {
      return
    }
    withdrawn.current = owner
    withdrawal.current?.abort()
    withdrawal.current = null
    update(owner, { busy: false })
  }, [update])

  const sign = useCallback(
    (key: KeyHandle, typedData: TypedDataToSign) => {
      const owner = requestRef.current
      if (!idle(owner)) {
        return
      }
      update(owner, { failure: null })
      const controller = new AbortController()
      withdrawal.current = controller
      runOnce<SigningFailure>(
        owner,
        async () => {
          let signature: Hex
          try {
            signature = await signTypedData(key, typedData, { signal: controller.signal })
          } catch (error: unknown) {
            return signingFailureOf(error)
          } finally {
            if (withdrawal.current === controller) {
              withdrawal.current = null
            }
          }
          let outcome: ApprovalOutcome
          try {
            outcome = await outcomeOf(owner, typedData, signature)
          } catch {
            return 'failed'
          }
          if (outcome === 'unpackaged') {
            return 'failed'
          }
          if (outcome.verdict !== 'not-judged' || !chainVerdict) {
            return walletVerdictFailure(outcome.verdict) ?? outcome.approval
          }
          // The chain decides here: only its satisfied keeps the approval.
          const onChain = await within(
            () => chainVerdict(owner, outcome.reply),
            ACCOUNT_CHECK_LIMIT_MS
          )
          if (onChain === 'satisfied') {
            return outcome.approval
          }
          return onChain === 'rejected' ? 'wrongKey' : 'unread'
        },
        (failure) => ({ failure })
      )
    },
    [idle, update, signTypedData, outcomeOf, chainVerdict, runOnce]
  )

  const addSignature = useCallback(
    (typedData: TypedDataToSign, text: string) => {
      const owner = requestRef.current
      if (!idle(owner)) {
        return
      }
      const signature = signatureOf(text)
      if (!signature) {
        update(owner, { offlineFailure: 'notASignature' })
        return
      }
      update(owner, { offlineFailure: null })
      runOnce<OfflineFailure>(
        owner,
        async () => {
          try {
            const outcome = await outcomeOf(owner, typedData, signature)
            if (outcome === 'unpackaged') {
              return 'notASignature'
            }
            return offlineVerdictFailure(outcome.verdict) ?? outcome.approval
          } catch {
            return 'notASignature'
          }
        },
        (offlineFailure) => ({ offlineFailure })
      )
    },
    [idle, update, outcomeOf, runOnce]
  )

  const { busy, failure, offlineFailure, approval } = current
  return { busy, failure, offlineFailure, approval, sign, addSignature, withdraw }
}

export default useGuardianSigning
