# PT-035 The SDK doubles

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-6 |
| Round | 0 |
| Module (cut) | `ux/sdk-doubles` |
| Module (this repository) | `src/web/modules/social-recovery/sdk-doubles/` |
| Size | half-day |
| Risk | medium |
| Risk reason | Every ux screen is built and tested against these until the sdk lands, so a double that drifts from the chapter's shape teaches thirty screens the wrong seam. |
| Depends on | none |
| Interfaces | `IEventManager`, `IMethodsOrchestrator`, `IPolicyManagerInteractor`, `IProvider`, `IRecoveryActionArming`, `IRecoveryActionInteractor`, `IRecoveryClient`, `ISetupClient` |
| Invariants | none |
| Design refs | D-202, D-203, D-206, D-208, D-319, D-370, D-371, D-373, D-374, D-375 |
| Readiness | risky |
| Mock-first | completes against the SDK doubles alone |

## Done

Checks:

- check: build

Judgments:

- every member of the eight interfaces the task declares exists on its double with the parameter and return records D-202, D-203, D-206, D-207 and D-208 fix, hand-written from the chapter's TypeScript blocks and imported from no sdk package
- the scripted chain holds the states D-371 and D-373 name, a setup none or committed under each privacy level, an attempt none, pending, ready, cancelled by each canceller or executed, an authorization held or removed, code present or absent and one declaration per method
- every read can be scripted to fail and every prepare to refuse with a code, and a failed read is a thrown value the screens can tell from an empty result

## Body

Write `src/web/modules/social-recovery/sdk-doubles/`, in-memory implementations of the sdk interfaces the extension consumes, `ISetupClient`, `IRecoveryClient`, `IMethodsOrchestrator`, `IEventManager`, `IPolicyManagerInteractor`, `IProvider`, `IRecoveryActionInteractor` and `IRecoveryActionArming`, hand-written from the TypeScript blocks of D-201 to D-208 and from the reads D-371, D-373 and D-374 ask of them. By the owner's ruling the ux assumes doubles until the sdk lands and no ux task depends on an sdk task, so this module is what every screen of the cut builds and tests against, and the sdk's own vectors are where the two stacks meet later.

The doubles run over one scripted chain record. It holds the setup as none or committed with a body under one of the three privacy levels of D-375, the attempt as none, pending, ready, cancelled with its canceller among the account, a caller with proofs and nobody, or executed, the account's authorization of the action, whether the account holds code, each method's `trustedParties`, `paused` and `moduleInfo`, the manager's `stateOf`, `setupCommittedAtBlock` and `eip712Domain`, and the action's `supportsAccount`, `isAuthority` and `holdsAnyPrivilege`. The event manager double serves `AttemptStarted`, `AttemptCancelled`, `AttemptConsumed`, `SetupCommitted` and `TrustedKeysUpdated` from that record. The recovery client double runs `initRecoveryGathering`, `getApproverRequests`, `addApproverReply` with its three errors and `complete` over the requests it minted, and the orchestrator double answers `describeRequest`, `signingInput` and `replyFrom` from a request alone. The three members D-373, D-371 and D-319 ask the sdk chapter for and D-201 does not yet name, the verify per pasted reply, the read naming the key a recovery would remove and the fit check against the code the account will carry, are scripted here under the names cut-q-22 records, so the screens that need them build against one shape.

## Deltas against the chapter at `bd8780f`

- The `interfaces` list names eight of the twelve interfaces `sdk.md` D-201 declares. The builder hands an integrator `IMethodModuleReads` and never `IPolicyManagerInteractor`, and `IRecoveryActionInteractor` and never `IRecoveryActionArming` (sdk.md D-201, D-208). `IMethodModuleReads` and `IRecoveryMethod` (which PT-041 lists) are missing from the eight. Settle the member list before writing.
- Every TypeScript block of `sdk.md` is marked illustrative and nothing in `ux-interfaces.md` is frozen; record the `sdk.md` commit the doubles copy.
- The body scripts three privacy levels; cut-q-23 renders two until the sdk adopts the middle level.
- The three members scripted under cut-q-22 (verify per reply, removed-key read, fit check on code-to-be) have no SDK member today; decide whether the extension owns them.
