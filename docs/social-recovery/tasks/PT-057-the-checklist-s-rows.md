# PT-057 The checklist's rows

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-8 |
| Round | 2 |
| Module (cut) | `ux/recovery/checklist` |
| Module (this repository) | `src/web/modules/social-recovery/recovery/checklist/` |
| Size | half-day |
| Risk | medium |
| Risk reason | One row per required method with every member shown, resumed from a session that says what it still holds, and a row that folds a refused ceremony into an error reads as a dead method. |
| Depends on | PT-040, PT-041 |
| Interfaces | `IMethodsOrchestrator`, `IRecoveryClient` |
| Invariants | none |
| Design refs | D-202, D-206, D-302, D-310, D-373, D-392 |
| Readiness | risky |
| Mock-first | needs the real thing beyond the doubles |

## Done

Checks:

- check: build

Judgments:

- the checklist opens the gathering through the recovery client, shows one row per required method and for a group one header with its count against its threshold above one row per member with every member shown, and a group counts as one unit in every headline
- a passkey row completes on this device or through the browser's hand-off to a phone in a full tab, carries the cancelled, refused and failed notes with retry and unreachable where the hand-off never connects, and carries the line that a passkey enrolled in another browser cannot answer here
- the session persists locally and resumes through a dedicated recovery in progress screen the home surface points at, which says whether it still holds the decrypted recovery path or asks the password again

## Body

Write `src/web/modules/social-recovery/recovery/checklist/`, the checklist of D-392 as the recoverer collects one complete set of approvals for one exact recovery. It opens the gathering through `initRecoveryGathering` over the readout's path and the handover of PT-053 or PT-054, mints one request per place through `getApproverRequests`, and shows one row per required method, and for a group one header with its count against its threshold above one row per member, every member shown, a group counting as one unit in every headline with progress in numerals. Each row explains how to obtain its approval and takes it in place, under the collection chips of D-302, and every row's claim runs through the method host of PT-041.

A passkey row completes on this device or through the browser's QR hand-off to a phone, every ceremony in a full tab rather than the action popup, and carries the enrollment's notes, cancelled, refused and failed with retry, and unreachable where the hand-off never connects, with the line that a passkey enrolled in another browser cannot answer here. The identity rows are PT-070's in this lane. The guardian row, its message and the paste check are PT-058's, and the deadline, the polls and the deaths PT-059's. The session persists locally through the records of PT-040 and resumes through a dedicated recovery in progress screen the home surface points at, which says whether it still holds the decrypted recovery path or asks the password again. Off-chain gathering leaves no trace beyond that session.

## Deltas against the chapter at `bd8780f`

- The phone hand-off was run on Android by the proof of concept; the iPhone route is an implementation check (FR31-IMPL-CHECKS).
