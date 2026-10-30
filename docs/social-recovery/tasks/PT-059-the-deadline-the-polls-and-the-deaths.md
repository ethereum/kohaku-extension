# PT-059 The deadline, the polls and the deaths

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-8 |
| Round | 4 |
| Module (cut) | `ux/recovery/checklist` |
| Module (this repository) | `src/web/modules/social-recovery/recovery/checklist/` |
| Size | half-day |
| Risk | high |
| Risk reason | I-38 and I-44 are decided here, an approval that never outlives its request and a submission that publishes the fewest members, and a poll rendered from its last good state hides a death behind rows that still read complete. |
| Depends on | PT-058 |
| Interfaces | `IPolicyManagerInteractor`, `IRecoveryActionInteractor`, `IRecoveryClient` |
| Invariants | I-38, I-44 |
| Design refs | D-107, D-202, D-205, D-310, D-373, D-392 |
| Readiness | risky |
| Mock-first | completes against the SDK doubles alone |

## Done

Checks:

- check: build
- check: fuzz, budget: deep

Judgments:

- the request carries the wallet's own window of 24 hours from the checklist's opening, no screen asks for it, the deadline shows at the first row and as a countdown with the sentence that every approval dies together, dropped where one approval is the whole request, and the first row carries the line that anyone holding the request's bytes can submit it until the window ends
- the checklist polls the account's attempt, its setup nonce and the account's authorization of the action while open, a poll that fails or has not returned renders as a failed read with retry and never as the last good state, and each of the three deaths renders within one poll from the reason line the wipe keeps, the expired request regathered whole, the void set naming what the other attempt holds and who clears it with a watch offer and a slot-free state, and the changed setup voiding every approval
- once the rule is satisfied every row outside the smallest set reads not needed on the checklist and on the confirmation whether or not it holds a claim, and the recoverer stops gathering
- when the path cannot be satisfied on the chain facts read the checklist names the cause and generates every exit from the holder's own path, a method that did not answer this time reads so with retry and no abandon, and abandon wipes the approvals and the predicted attempt id as the recoverer's own act

## Body

Write the deadline, the polls and the deaths of D-392 in `src/web/modules/social-recovery/recovery/checklist/`, after PT-058. The request carries one validity window every claim signs, the wallet's own default of 24 hours from the moment the request is created, which is the checklist's opening, and no screen asks the recoverer for it, the owner's ruling of 2026-09-22. The wallet sets the width entry of the client configuration to that value so the SDK's window check never fires under it, D-205. The deadline shows at the first row and as a countdown with the sentence that every approval dies together, dropped where one approval is the whole request, and the first row carries the line that anyone holding the request's bytes can submit it until the window ends. The window cannot change once the first approval is in, contracts D-107, so the expired state says the whole set is gathered again.

The checklist polls the account's attempt, its setup nonce and the account's authorization of the action while it is open, and runs the SDK's progress arithmetic over the record it holds, D-373. A poll that fails or has not returned renders as a failed read with retry and never as the last good state, I-28's rule on this surface. The request dies in three ways and the checklist names each from the reason line the wipe of PT-040 keeps, I-38. The deadline passed, so the approvals are regathered whole. Another attempt opened, so the set is void, and the void state names what the other attempt holds and who clears it, that account's own key in the first release, offers watching that attempt, and reads that the slot is free and offers gathering again once the manager reports it ended, contracts D-103. The setup changed against the nonce the request was built under, so every approval given under the old setup is void. Once the rule is satisfied the wallet submits the smallest set that satisfies it and every row outside that set reads not needed on the checklist and on the confirmation alike whether or not it holds a claim, I-44, so the recoverer stops gathering.

## Deltas against the chapter at `bd8780f`

- The done entry names a watch offer; D-392 puts watching that attempt in the second release, the first release says the recoverer reopens the flow.
