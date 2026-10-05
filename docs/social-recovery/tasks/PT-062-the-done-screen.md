# PT-062 The done screen

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-8 |
| Round | 7 |
| Module (cut) | `ux/recovery/done` |
| Module (this repository) | `src/web/modules/social-recovery/recovery/done/` |
| Size | half-day |
| Risk | medium |
| Risk reason | The screen that tells a recovered holder what became public and what a synced passkey on the lost device still allows, in an order that revoking first would make worse. |
| Depends on | PT-037, PT-061 |
| Interfaces | `IEventManager` |
| Invariants | none |
| Design refs | D-105, D-110, D-203, D-302, D-305, D-309, D-312, D-393 |
| Readiness | free |
| Mock-first | completes against the SDK doubles alone |

## Done

Checks:

- check: build

Judgments:

- the done screen renders on the consume event on the extension's own account, names the key that now controls the account as controlled by and what was removed as removed, one fresh key with no redundancy on the fast track or the chosen account's key shared by two accounts on the logged-in route, and on the fast track adds the recovered account to the wallet
- it says the recovery published the whole path in the clear naming the methods it used, names two sets and never every method, every guardian of your path where the path holds an address row and the methods this recovery used, says reconfiguring with a changed rule and members makes the next setup unlinkable while nothing unpublishes the past, and names the passport as the one method a later release never unlinks where the path holds one
- it says authorities outside the recovery action may still exist, offers edit or replace your recovery path, points at changing the recovery password as one transaction where the card may have been on the lost device, and states the installed key's one limit, that the account cannot sign ordinary typed data until the wallet wraps it
- for a synced passkey it renders the repair in one order, sign the lost device out of the platform account, add a fresh method that does not sync to it, then remove the old row, points a holder who cannot reach the platform account at removing the row, and for a device-bound passkey points at editing the path with the single-method warning where one row would remain and add a method first where none would

## Body

Write `src/web/modules/social-recovery/recovery/done/`, the done screen of D-393. It renders on the consume event on the extension's own account and on no read of the signer state, the ux owner's ruling of 2026-09-16 in D-312. It names the key that now controls the account and what the recovery removed under the done screen's two words, controlled by and removed, D-302, on the fast track a fresh key with no redundancy and on the logged-in route the chosen account's key now shared by two accounts, and on the fast track it adds the recovered account to this wallet beside that key so the overview, the nudge and the banner have something to render. It says that the recovery published the whole path on chain in the clear, the rule with its waiting period and every method in it, and names the ones it used. The discoverability line names two sets and never every method of the path, every guardian of your path where the path holds an address row and the methods this recovery used whose readable configuration the submission published, since an unused passkey or identity row stays unguessable, contracts D-110. It says that reconfiguring with a changed rule and changed members makes the next setup unlinkable while nothing unpublishes the past, that unlinking without a rule change comes in a later release, and where the path holds an identity method that the passport is the one method that release never unlinks.

The screen names what the recovery did not settle. It says authorities outside the recovery action may still exist since the wallet cannot see them all, offers edit or replace your recovery path since the setup survives the recovery and the wallet refuses a second one, and where the Recovery Card may have been on the lost device points at changing the recovery password in the editor, one transaction the account's key signs and pays for under the shared gas check rather than a setting the wallet flips. It claims no exclusivity for the key it names and states its one limit, that the account transacts with it at once while it cannot sign ordinary typed data until the wallet wraps that data the way it wraps a plain message, a limit of the grant value this recovery wrote, contracts D-105.

## Deltas against the chapter at `bd8780f`

- Consistent with D-312 (2026-09-16 and 2026-09-23): the screen renders on the consume event and names the key as that event reports it.
