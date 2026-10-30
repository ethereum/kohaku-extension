# PT-070 The identity rows at recovery

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-12 |
| Round | 5 |
| Module (cut) | `ux/recovery/checklist` |
| Module (this repository) | `src/web/modules/social-recovery/recovery/checklist/` |
| Size | half-day |
| Risk | medium |
| Risk reason | A borrowed phone reads the account and the new key, and a row that does not say so hands a lender a fact the recoverer never meant to share. |
| Depends on | PT-059 |
| Interfaces | `IMethodsOrchestrator`, `IRecoveryClient` |
| Invariants | none |
| Design refs | D-202, D-206, D-372, D-392 |
| Readiness | risky |
| Mock-first | needs the real thing beyond the doubles |

## Done

Checks:

- check: build

Judgments:

- a passport row runs zkPassport's flow on the holder's phone through the ceremony tab with the same notes and hand-off the passkey row has, and every hand-off step states what the phone it reaches reads, the account and the new key
- an Aadhaar row takes the same QR the holder enrolled with and produces the full proof with progress, and both rows render their claim's typed causes as failed with retry and the browser's own dismissal as cancelled

## Body

Write the two identity rows of the checklist of D-392 in `src/web/modules/social-recovery/recovery/checklist/`, after PT-059. A passport row runs zkPassport's flow on the holder's phone with the same notes and the same hand-off the passkey row of PT-057 has, through the ceremony tab of PT-041 and the method host's create claim, which produces the proof for one place of the request with progress and cancellation, D-372. Every hand-off step states what the phone it reaches reads, the account and the new key, the disclosure the guardian message carries for its own link, so a recoverer who borrows a phone knows what its lender learns. An Aadhaar row takes the same QR the holder presented at enrollment and produces the full proof with progress. A claim that fails comes back as one of the method's typed causes and renders failed with retry, and a ceremony the holder dismisses returns before the method runs as cancelled.

The test seat drives both rows through a completed claim, a typed failure and a dismissal against the method doubles. The implementation seat writes the two rows inside the checklist.

## Deltas against the chapter at `bd8780f`

- Q-22 applies; the phone hand-off shares PT-057's implementation check.
