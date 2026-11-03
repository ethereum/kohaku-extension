# PT-061 The wait and its endings

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-8 |
| Round | 6 |
| Module (cut) | `ux/recovery/wait` |
| Module (this repository) | `src/web/modules/social-recovery/recovery/wait/` |
| Size | half-day |
| Risk | high |
| Risk reason | The countdown reads its end from the chain and polls three causes a keyless recoverer cannot otherwise learn of, and a number that keeps counting over a cancel has them fund an execution that reverts. |
| Depends on | PT-060 |
| Interfaces | `IPolicyManagerInteractor`, `IRecoveryActionInteractor`, `IRecoveryClient` |
| Invariants | none |
| Design refs | D-202, D-306, D-307, D-312, D-371, D-373, D-393 |
| Readiness | free |
| Mock-first | completes against the SDK doubles alone |

## Done

Checks:

- check: build
- check: fuzz, budget: deep

Judgments:

- the countdown reads its end from the attempt the manager reports and resumes from the home surface through the countdown record, a poll that fails or has not returned renders as a failed read with retry and never as a live wait carried on, and the wait polls the account's authorization, the action's fit and the handover's two keys beside the attempt
- the countdown ends in one of five ways, each its own screen naming the next act, cancelled by the account's own key which may be the lost device, cancelled by a full set signed for cancel with the threshold-one sentence, cancelled by a setup change or removal, the wait elapsed reading execution due, and the recovery cannot execute with the cause the wallet read, who clears the slot and no retry
- the recoverer's own submitted attempt carries the note that in the first release only this account's own key can cancel this recovery before it finishes
- execute now sends prepareExecuteHandover from the recoverer's own key after the same gas check the submission had, an elapsed wait is a state and not an ending, and the cannot-execute screen keeps moving funds and a new setup on screen while saying a keyless recoverer can take neither exit

## Body

Write `src/web/modules/social-recovery/recovery/wait/`, the wait and its endings of D-393. The countdown reads its end from the attempt the manager reports through the attempt read of D-371, the wallet computing ready from `consumableAfter` against the pinned block's time, D-202, so every timer on this side has a chain source, and the session of PT-040 keeps the account and the attempt id as the countdown's record so the countdown resumes from the home surface and prompts at execution due where the browser is open. A poll that fails or has not returned renders as a failed read with retry, never as a live wait carried on from the last good read, I-28's rule on the recoverer's side. During the wait the countdown polls three reads besides the attempt, the account's authorization through `isAuthorized`, the action's fit through `supportsAccount` and the handover against the account, the removed authority still holding a key value through `isAuthority` and the new key still holding nothing through `holdsAnyPrivilege`, contracts D-108, so no holder spends gas to learn of the fifth ending.

The countdown ends in one of five ways and every ending names the next act. The account's own key cancelled it, which may be the lost device, pointing at starting again. A full set of approvals signed for cancel stopped it, and where the rule's threshold is one the screen says the same credential can cancel again and only the account's key repairs that, pointing at moving funds and at setting up recovery again. The account's authority changed or removed the setup, pointing at a new recovery. The wait elapsed, a state and not an ending, reading execution due with execute now, which sends `prepareExecuteHandover` from the recoverer's own key after the same gas check the submission had, a key that holds too little getting the deposit step again. The recovery can no longer execute, which the wallet reads from the account rather than the attempt, an authorization the account no longer holds, an account upgraded away from the action, a cause built and exercised on no demo account since Ambire's account cannot be upgraded in place, contracts D-102, or an authority the account moved. That screen names the cause, says the approvals die with the attempt, states that only the account's own key ends this attempt in the first release so recovery on this deployment is closed until somebody holds that key, offers neither a retry nor a new recovery, keeps moving funds and a new setup on screen for a holder who holds that key while saying a keyless recoverer can take neither, and where the cause is a missing authorization names the repair D-306 states. The attempt read names the canceller, so the three cancels are distinct screens each saying every approval was wiped. A recoverer's own submitted attempt carries the note that in the first release only this account's own key can cancel this recovery before it finishes, D-314, the sentence the ux owner ruled stays on 2026-09-17 per D-312.

## Deltas against the chapter at `bd8780f`

- The cancel-by-proofs terminal is drawn for a road no release of the extension gathers (D-312, 2026-09-23); it renders only when another client cancelled that way.
