# PT-067 The overview and the dormant states

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-11 |
| Round | 3 |
| Module (cut) | `ux/management/overview` |
| Module (this repository) | `src/web/modules/social-recovery/management/overview/` |
| Size | half-day |
| Risk | high |
| Risk reason | I-42 is decided here, the one repair that would complete a hostile recovery refused while it runs, and a re-authorize offered under a ready attempt hands the account over in the next block. |
| Depends on | PT-039, PT-040 |
| Interfaces | `IEventManager`, `IPolicyManagerInteractor`, `IRecoveryActionInteractor`, `ISetupClient` |
| Invariants | I-42 |
| Design refs | D-102, D-110, D-202, D-203, D-302, D-306, D-309, D-311, D-319, D-371 |
| Readiness | free |
| Mock-first | completes against the SDK doubles alone |

## Done

Checks:

- check: build
- check: fuzz, budget: deep

Judgments:

- the overview shows the status line as set up or not set up, the one recovery path, the recover an account entry, the Recovery Card action and a recovery in progress notice while an attempt runs, its empty state with set up recovery before a setup exists, and a path this device cannot read as set up with path locked asking the recovery password
- a committed setup whose action is no longer authorized shows as a warning with re-authorize and clear, the re-authorize control absent or disabled with a reason naming the wallet as the party that refuses while an attempt is open pending or ready, and clear carrying the sentence that clearing ends the recovery in progress while one is open
- an authorization the account holds with no setup behind it shows the mirror warning with one action, remove the authorization, and where a dormant setup and a running attempt would draw together the dormant reading wins and states the attempt cannot execute until the account authorizes the action again
- a method whose trusted keys moved shows a notice read from its key update event saying what the method's admin can now do, offering the method's own test beside a route into the editor and stating that a passing test does not clear the risk

## Body

Write `src/web/modules/social-recovery/management/overview/`, the settings overview of D-309 after setup. It shows the status line as set up or not set up under D-302, the one recovery path with its rule lines, the recover an account entry of PT-054, the Recovery Card action of PT-048 and a recovery in progress notice when an attempt runs, and before a setup exists its empty state with set up recovery leading into the presets. A path this device cannot read shows as set up with the path locked and asks for the recovery password to show it, through `getSetup`. The alerts action and the nudge ship in the second release.

A committed setup whose action is no longer authorized on the account, read through `isAuthorized` beside `stateOf`, shows as a warning state with two actions, re-authorize and clear, since another wallet or a manual act can produce that state and a setup a later authorization would revive under a rule the holder may no longer remember must not sit there without a repair. While an attempt is open on the account, pending or ready, the re-authorize control is absent or disabled with its reason on screen naming the wallet as the party that refuses, rather than offered and refused on tap, I-42, since the re-commit moves the setup nonce and re-authorizing under a ready attempt hands the account over in the next block. Re-authorize commits the same body again through the prepare of D-371, asks the recovery password where this device cannot read the path, shows the trust list of PT-049 first and saves the paired batch under one confirmation through the shared write states of PT-039. Clear sends the write that clears the setup, which cancels any attempt running against it, and carries the sentence that clearing ends the recovery in progress above it while an attempt is open, I-30's rule on this surface. The mirror state, an authorization the account still holds with no setup behind it, shows the same warning with one action, remove the authorization, since a later save would re-arm the kit with no account write, contracts D-110, the disclosure D-311 places here. Where a screen would draw a dormant setup and a running attempt together the dormant reading wins and states that the attempt cannot execute until the account authorizes the action again, D-319.

## Deltas against the chapter at `bd8780f`

- D-312 (2026-09-23): the re-authorize is refused while an attempt runs because the wallet keeps the cancel and the repair apart; the earlier reason in this task's `risk_reason` and body ("hands the account over in the next block") is false of the re-commit. Frame G-01 still states the earlier reason; the chapter is the rule.
- The body renders PT-048, PT-049 and PT-054, which the header does not declare.
