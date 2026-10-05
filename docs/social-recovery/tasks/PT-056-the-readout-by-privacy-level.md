# PT-056 The readout by privacy level

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-8 |
| Round | 3 |
| Module (cut) | `ux/recovery/entry` |
| Module (this repository) | `src/web/modules/social-recovery/recovery/entry/` |
| Size | half-day |
| Risk | medium |
| Risk reason | A wrong password degraded to hidden values, or a failed event read shown as no setup, sends a recoverer into a gathering they cannot complete or away from one they could. |
| Depends on | PT-054 |
| Interfaces | `IRecoveryClient`, `ISetupClient` |
| Invariants | none |
| Design refs | D-202, D-302, D-306, D-318, D-371, D-375 |
| Readiness | blocked in part |
| Mock-first | completes against the SDK doubles alone |

## Done

Checks:

- check: build

Judgments:

- at Private the readout is locked and reads we cannot show your setup yet, enter the recovery password from your Recovery Card, at Public the structure and the values render with no password and the recoverer proceeds to the checklist, and Shape visible renders its masked preview behind the sdk chapter's adoption of the level
- a wrong or absent password at a hidden level is a blocker stated plainly with retry and a pointer to the card and never a degrade to hidden values, a correct password whose read of the setup event fails has its own state naming the chain with retry, and a bundle this build cannot read renders update the wallet
- every state says the account is configured and never that no recovery exists, and the continue action carries the line to have every method within reach since the request lasts 24 hours from the moment the checklist opens

## Body

Write the readout of D-306 in `src/web/modules/social-recovery/recovery/entry/`, after PT-055. The readout has three states by the privacy level chosen at setup, read through `getSetup` and the setup read of D-371 which returns not configured, sealed, shape readable with values withheld or fully readable. At Private nothing renders first and the entry is locked, reading we cannot show your setup yet, enter the recovery password from your Recovery Card. At Public the structure and the values render from the setup event with no password and the recoverer proceeds to the checklist. At Shape visible the structure renders as a preview with the values masked as sixteen dots and collecting waits for the password, rendered behind the sdk chapter's adoption of the middle level, cut-q-23. The password revealed, the values render and the readout carries the rule lines of PT-037.

A wrong or absent password at a hidden level is a blocker the screen states plainly, with retry and a pointer to the card, and never a degrade to hidden values, since every claim needs the credential's configuration. A correct password whose read of the setup event fails has its own state naming the chain and offering retry, the event pinned to the block `setupCommittedAtBlock` names so no log range is scanned. That state offers no network change since the wallet reads one chain. A bundle this build cannot read has its own state, update the wallet, never the no setup sentence. Every state says the account is configured and never that no recovery exists. The continue action carries the line to have every method within reach before continuing, since the request lasts 24 hours from the moment the checklist opens.

## Deltas against the chapter at `bd8780f`

- cut-q-23: two states until the sdk adopts the middle level; the Shape visible state waits.
