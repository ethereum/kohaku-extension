# PT-050 The review's doors, stop block and save gate

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-7 |
| Round | 3 |
| Module (cut) | `ux/setup/review` |
| Module (this repository) | `src/web/modules/social-recovery/setup/review/` |
| Size | half-day |
| Risk | high |
| Risk reason | I-37 is decided here, the save disabled until every party has rendered, and a gate that lets a declaration read fail quietly saves a setup the holder never read the trust of. |
| Depends on | PT-049 |
| Interfaces | `IPolicyManagerInteractor`, `ISetupClient` |
| Invariants | I-37 |
| Design refs | D-105, D-108, D-110, D-111, D-202, D-317, D-319, D-371 |
| Readiness | blocked in part |
| Mock-first | completes against the SDK doubles alone |

## Done

Checks:

- check: build
- check: fuzz, budget: deep

Judgments:

- the save stays disabled until every party on the trust list has rendered, a declaration read that fails renders unavailable with retry and keeps the save disabled with that reason on screen
- the other doors render as the SDK returns them, the entry point's marker as code the account itself installed and every other code entry as a validator somebody bound, with the line that a recovery leaves them untouched and the account is only as safe as its weakest door, and a derivation that cannot complete renders the line that the wallet cannot see every door with the save still enabled
- a stream that cannot name the key a recovery would remove blocks the save with that reason on screen
- the security stop block carries one row per method of the path generated from its own declaration, the party that can stop it or that nobody can stop this method, the address one acceptance away from each of the two roles, the line where one party holds both roles, and the one sentence that this release ignores every stop, a stop on a method will not stop your recoveries and will not stop a forged one against you either

## Body

Write the rest of the review in `src/web/modules/social-recovery/setup/review/`, after PT-049, the account's other doors, the security stop block and the gate on the save. The review reads the account's other doors through the privilege read of D-371, the code entries contracts D-105 names and any key beside the one a recovery removes, derived over the privilege stream of contracts D-108. It reads each code entry for what it is, the entry point's marker as code the account itself installed when it activated 4337 and every other entry as a validator somebody bound to the account, contracts D-110, so a holder whose only code entry is the marker reads why it is there rather than learning to skip the line. The doors carry the line that a recovery leaves them untouched and the account is only as safe as its weakest door. The doors are the informational read, so a derivation that cannot complete renders the line that the wallet cannot see every door and leaves the save enabled, while the key a recovery would remove is the arming screen's disclosure and a stream that cannot name it blocks the save with that reason on screen, the two failure policies D-319 states once.

The security stop block sits under the trust list. Every method of the path takes a row from its own declaration, read through `trustedParties` and `paused` in every release, the party that method declares as able to stop it or that nobody can stop this method, which the passkey and guardian methods declare today, with the address one acceptance away from each of the two roles, the admin's under the admin row and the stop holder's in the block. Where a method's admin row and its stop row read the same address the block states in one line that one party holds both roles, contracts D-110. It states in one sentence that this release ignores every stop, a stop on a method will not stop your recoveries and it will not stop a forged one against you either, since the setup body the first release commits carries the opt-out, contracts D-111, and it offers no control for that choice. Every kit contract is immutable and the recovery registry and the recovery module carry no pause and no owner, which the block says.

## Deltas against the chapter at `bd8780f`

- The privilege read that lists the account's other doors has no SDK member; `sdk.md` D-203 and D-212 decline the list. Either the extension derives it over contracts D-108 through its own provider or the doors block is dropped. The save gate and the stop block stand.
- D-312 (2026-09-23): the review's stop-block sentence stands; the first release ignores stops.
