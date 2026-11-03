# PT-055 The running-attempt band

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-10 |
| Round | 4 |
| Module (cut) | `ux/recovery/entry` |
| Module (this repository) | `src/web/modules/social-recovery/recovery/entry/` |
| Size | half-day |
| Risk | medium |
| Risk reason | A recoverer who lost their local session must not cancel their own attempt, and the band is what tells them it is theirs. |
| Depends on | PT-056, PT-066 |
| Interfaces | `IPolicyManagerInteractor` |
| Invariants | none |
| Design refs | D-202, D-306, D-371 |
| Readiness | free |
| Mock-first | completes against the SDK doubles alone |

## Done

Checks:

- check: build

Judgments:

- a lookup that finds an attempt already running shows a band naming it, compares the attempt's destination key with the keys this wallet holds and with the seed the fast track wrote on this device, reads this is your own recovery where they match and offers to import that key
- the band offers its cancel exit only to a reader who holds the account's key, read through isAuthority, and for anyone else reads wait it out, only the account's own key can stop this recovery

## Body

Write the running-attempt band of D-306 in `src/web/modules/social-recovery/recovery/entry/`, after PT-054. A lookup that finds an attempt already running shows a banner naming it, since the policy manager allows one attempt per account and action at a time. The band compares the attempt's destination key, decoded from the opening event in the committed action's layout through the SDK, with the keys this wallet holds and with the seed the fast track wrote down on this device through the records of PT-040. It reads this is your own recovery where they match and offers to import that key, since a recoverer who lost their local session must not cancel their own attempt.

The band offers its cancel exit only to a reader who holds the account's key, which the key read of D-371, `isAuthority`, tells. For anyone else it reads wait it out, only the account's own key can stop this recovery, with the cancel set line as a second-release sentence this release does not render. Where the setup is dormant the dormant reading of PT-054 wins and the band states that the attempt cannot execute until the account authorizes the action again.

## Deltas against the chapter at `bd8780f`

- D-312 (2026-09-23): no release gathers a cancel set; the cancel set line stays a reason line in every release, not only the second.
