# PT-042 The create door's picker and the settings entry

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-7 |
| Round | 2 |
| Module (cut) | `ux/onboarding/create` |
| Module (this repository) | `src/web/modules/social-recovery/onboarding/create/` |
| Size | half-day |
| Risk | low |
| Risk reason | Two changes to Kohaku's own onboarding, the picker's default and a badge, and a door that arms nothing. |
| Depends on | PT-036, PT-038 |
| Interfaces | none |
| Invariants | none |
| Design refs | D-105, D-304, D-312, D-316 |
| Readiness | blocked |
| Mock-first | needs the real thing beyond the doubles |

## Done

Checks:

- check: build

Judgments:

- the picker selects the smart account by default and shows it beside the keys badged as controlled by the derived key's address, read from the account's privilege events and not from the slot displayed
- the door says that recovery covers the smart account and not the key that controls it and that this release recovers one ordinary key, and the create door arms no recovery
- the settings entry account recovery leads into the presets, and no question about a seed is asked at any door

## Body

Write `src/web/modules/social-recovery/onboarding/create/`, the changes D-316 asks of Kohaku's own create door. The create door derives an ordinary key for each account slot, derives the second key at that slot's index plus one hundred thousand which holds the privilege on the smart account, and derives the smart account itself, deployed counterfactually at its first operation, contracts D-105. The picker shows the smart account beside the keys, badged as controlled by the derived key's address, and reads that address from the account's own privilege events rather than from the slot it displays. It selects the smart account by default, which is work this chapter asks of the onboarding since the shipped picker hides smart accounts. The door says that recovery covers the smart account and not the key that controls it, and that this release recovers one ordinary key. Whether the key carries a seed backup is the onboarding's own matter and no door asks about a seed, D-312.

The create door arms no recovery. Setup enters from settings under account recovery, the one discovery of the first release since the nudge of D-304 ships in the second, and this task wires that entry to the presets of PT-043. The import door is unchanged.

The test seat asserts the default selection, the badge's source and the door's two sentences over a scripted privilege stream. The implementation seat edits the picker and the door and touches no setup screen.

## Deltas against the chapter at `bd8780f`

- D-316 (PR #54) schedules a proof of concept before this milestone; it has not run.
- The shipped create flow sends create to `createSeedPhrasePrepare` and the picker controller auto-adds the first non-smart account (ambire-common `accountPicker.ts` 970 to 975); the picker screen exists for the import flow and is skipped on create.
