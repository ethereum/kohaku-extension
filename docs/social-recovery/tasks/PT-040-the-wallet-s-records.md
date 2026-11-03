# PT-040 The wallet's records

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-6 |
| Round | 0 |
| Module (cut) | `ux/shared/records` |
| Module (this repository) | `src/web/modules/social-recovery/shared/records/` |
| Size | half-day |
| Risk | medium |
| Risk reason | The recovery session and the setup draft are what the SDK refuses to hold, and a record kept in a worker controller or read as a bare zero loses the holder's progress or reads a default as a fact. |
| Depends on | none |
| Interfaces | none |
| Invariants | none |
| Design refs | D-310, D-370, D-392, D-393 |
| Readiness | free |
| Mock-first | completes against the SDK doubles alone |

## Done

Checks:

- check: build

Judgments:

- the six setup records, the setup draft, the inventory, the path, the enrollments, the waiting period and the password-set flag, live in the extension's local storage with their age and are wiped by save or start over while platform credentials survive
- the recovery session holds the approvals and the predicted attempt id, exactly five events wipe both, the submission landing, the deadline passing, another attempt opening, the setup changing and the recoverer abandoning, and the wipe keeps one line of reason the death states render from
- the session survives the submission as the countdown's record holding the account address alone, the decrypted setup stays as this device's cache after the recovery executes, and no record is a bare boolean or zero

## Body

Write `src/web/modules/social-recovery/shared/records/`, the extension's storage of every record D-310 names, in the extension's local storage and never in a background controller, since the worker restarts and clears its controllers. The SDK holds no session state, D-370, so the setup draft, the recovery session and the backup set live here and the SDK sees them only as arguments.

Six records hold the setup before the save, the setup draft, the inventory, the path, the enrollments, the waiting period and the password-set flag, each showing its age when the holder resumes it, wiped by save or start over while platform credentials survive. The recovery session holds the approvals and the predicted attempt id, the attempt id the wallet built the request against, across pauses and resumes. Five events wipe both, the submission landing, the request's deadline passing, another attempt opening, the setup changing and the recoverer abandoning, and the wipe deletes both and keeps one line of reason on the session, from which the expired, void and setup changed states of D-392 and D-393 render and nothing else. A security stop wipes nothing, I-38, which the first release never meets. The session survives the submission as the countdown's record holding the account address alone, the attempt id coming from the attempt read. Once the recovery executes the setup the password unlocked stays as this device's cache, and the wallet's storage of the configuration values is a cache of the setup event's private field re-imported from the chain. No record is a bare boolean or zero, since the storage read returns the default for either.

## Deltas against the chapter at `bd8780f`

- `The inventory` is the second-release wizard's step (D-305); D-310 still lists it as a record, so keep it.
