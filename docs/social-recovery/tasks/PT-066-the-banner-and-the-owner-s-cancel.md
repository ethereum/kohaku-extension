# PT-066 The banner and the owner's cancel

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-10 |
| Round | 3 |
| Module (cut) | `ux/cancel` |
| Module (this repository) | `src/web/modules/social-recovery/cancel/` |
| Size | half-day |
| Risk | high |
| Risk reason | I-47 is decided here, a banner whose roads are generated from the holder's own rule, and a sentence that names guardians on a path without one sends a holder under attack after a rescue their rule cannot deliver. |
| Depends on | PT-039, PT-065 |
| Interfaces | `IRecoveryClient` |
| Invariants | I-47 |
| Design refs | D-202, D-302, D-307, D-309, D-312, D-313, D-319, D-370, D-373, D-393 |
| Readiness | free |
| Mock-first | completes against the SDK doubles alone |

## Done

Checks:

- check: build
- check: fuzz, budget: deep

Judgments:

- the banner is an ordinary dashboard banner naming the new key in full, the countdown to execution and the primary action it was not me, cancel it, with it is me beside it dismissing this one attempt under the sentence this hides the warning for this recovery only
- the banner's roads sentence is generated from the holder's saved rule, reads that only this account's own key can cancel this recovery before it finishes in the first release, and the word guardians never renders on a path without one
- the cancel sends the owner's cancel as the account's own operation from the account's key after the shared gas check, its failed state on a revert reading that the attempt is already gone and naming the account's controller as it now stands, and the cancelled terminal points at the editor and at moving funds since the triage ships in the third release
- the banner keeps the cancel alone and offers no path editor beside it

## Body

Write `src/web/modules/social-recovery/cancel/`, the banner and the owner's cancel of D-307 over the attempt the watcher of PT-065 hands it. When an attempt is open the dashboard shows a persistent banner, an ordinary dashboard banner whose two actions the shared library's action list gains, naming the new key in full under D-302, the countdown to execution and the primary action it was not me, cancel it. Beside it stands it is me, which dismisses this one attempt and warns again for the next, under the sentence this hides the warning for this recovery only. The banner keeps the cancel alone and offers no path editor beside it, the ux owner's ruling of 2026-09-17 in D-312.

Four roads cancel a running attempt and the banner names the ones that apply to the holder's own rule, I-47. The extension builds two of them in these releases, the owner's cancel and the setup write that cancels as a side effect, and gathers no cancel set and renders no veto control, so the other two reach the screens as reason lines and never as actions. The wallet generates the sentence from the rule and names the credentials each road takes, and in the first release the banner, the countdown and the cancelled terminal read that only this account's own key can cancel this recovery before it finishes, the extension's own statement about the cancel it offers, which the ux owner ruled stays as it reads on 2026-09-17. The word guardians never renders on a path without one. The owner's key cancels outright as the account's own operation through the cancel prepare of D-373, since `cancelByOwner` accepts the account alone, D-370, that key paying the gas in the first release under the shared gas check of PT-039 with both funding routes, and the kit pays for no transaction. Where that cancel reverts because the attempt was consumed or ended in the same block, the failed state reads the reverted case of D-319, names the attempt as already gone and names the account's controller as it now stands. Cancelling is not resolution, since the attacker still holds a working method, so the cancelled terminal points at the same two defenses the done screen of D-393 names, the editor and moving funds, until the triage of D-313 ships in the third release. Editing the setup cancels as the same act and removing recovery cancels too, which the management editor of PT-068 carries.

## Deltas against the chapter at `bd8780f`

- None found.
