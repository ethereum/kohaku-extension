# PT-065 The watcher

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-10 |
| Round | 2 |
| Module (cut) | `ux/watcher` |
| Module (this repository) | `src/web/modules/social-recovery/watcher/` |
| Size | half-day |
| Risk | high |
| Risk reason | I-29 is decided here, the extension's first browser alarm reading the chain every minute while locked, and a failed poll read as no attempt leaves a holder under attack with a clean dashboard. |
| Depends on | PT-038, PT-040 |
| Interfaces | `IEventManager`, `IPolicyManagerInteractor` |
| Invariants | I-29 |
| Design refs | D-202, D-203, D-302, D-307, D-312, D-371, D-374, D-376 |
| Readiness | risky |
| Mock-first | completes against the SDK doubles alone |

## Done

Checks:

- check: build
- check: fuzz, budget: deep

Judgments:

- the watcher is a browser alarm running every minute while the browser is open whether the popup is closed or not, runs while the extension is locked and badges then, polls the attempt read for every account the wallet holds on the one deployment its address book names, and reads at the latest block tag and never the finalized one
- a poll that fails renders as a badge and never as no attempt, an attempt a reorganization dropped drops its banner on the next poll that no longer reads it, and the watcher decodes the opening event in the committed action's layout before it names a key, rendering the countdown and no key until the decode returns
- the owner's surfaces carry the two last readings, that the recovery can execute at any moment and the account's own key still cancels it until the spend lands where the wait ended with nobody executing, and one terminal notice with no action where the recovery executed, that this account is no longer controlled from this device and when control moved

## Body

Write `src/web/modules/social-recovery/watcher/`, the watcher role of D-307 and D-376, which the extension owns whole since the kit ships no watcher service. The extension has no periodic alarm today and polls only the selected account on timers the worker keeps alive, so the watcher is its first browser alarm, its own loop running every minute while the browser is open whether the popup is closed or not, I-29. It runs while the extension is locked too, badges then and shows the banner on unlock. It watches every account the wallet holds on the one deployment the wallet reads, through the attempt read of D-371 or the manager's events through the event manager, and watch this account for an address without a key ships in the second release, D-312.

It reads at the latest block tag and never at the finalized one the sdk's filters default to, since a finalized read arrives about thirteen minutes after the opening and I-29 promises one minute, at the cost that a reorganization can drop an attempt the banner already named, which the watcher drops on the next poll that no longer reads the attempt. A poll that fails renders as a badge, never as no attempt, I-28's rule on this side, and the badge is set whenever an attempt is open. The attempt record holds the payload as a hash alone, so the watcher fetches the opening event and decodes it in the committed action's layout through the SDK before it names a key, D-374, and a banner whose decode has not returned renders the countdown and no key rather than a key it guessed. The banner itself and the cancel are PT-066's, and this task hands them the attempt, its countdown from the event's execution time in the clear and the decoded new key. The owner's surfaces carry two last readings the watcher supplies, where the wait ended and nobody executed, that the recovery can execute at any moment and the account's own key still cancels it until the spend lands, contracts D-103, and where the recovery executed, one terminal notice on the old device that this account is no longer controlled from this device and when control moved, with no action since its key no longer signs. The notification permission and the alerts opt-in are second-release work.

## Deltas against the chapter at `bd8780f`

- `browser.alarms` is already used by `auto-lock.ts`; copy that pattern rather than introduce the API.
- Reading at `latest` is a stated override of the sdk's `finalized` default (D-307, sdk.md D-208).
