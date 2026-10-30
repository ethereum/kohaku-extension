# PT-043 The presets and the blank start

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-7 |
| Round | 1 |
| Module (cut) | `ux/setup/presets` |
| Module (this repository) | `src/web/modules/social-recovery/setup/presets/` |
| Size | half-day |
| Risk | low |
| Risk reason | Four shapes loaded into an editor with their slots empty and three cost lines, applied nowhere else. |
| Depends on | PT-040 |
| Interfaces | none |
| Invariants | none |
| Design refs | D-304, D-305, D-311, D-313 |
| Readiness | free |
| Mock-first | completes against the SDK doubles alone |

## Done

Checks:

- check: build

Judgments:

- the four presets, your device and your guardians, your device and your ID, either one works and guardians only, each load their whole shape into the editor with every member slot empty and refuse nothing until the holder saves, and the start from scratch card opens the editor empty
- the screen states the three costs before any enrollment, that saving is one transaction the account's key pays, that the recoverer's own key pays for a recovery in the first release, and that cancelling is a transaction the account's own key pays with gas held outside the account
- the screen carries the honesty note in the words D-304 fixes and says to a holder with one device that start from scratch builds a single-method path, and guide me is absent in the first release

## Body

Write `src/web/modules/social-recovery/setup/presets/`, the screen setup lands on under settings, D-305. It offers four cards, each a whole path the holder adopts and may edit, your device and your guardians as a required passkey and any two of three guardians, your device and your ID as a passkey and a passport both required and labeled deliberately strict, either one works as a passkey and a passport in one group of any one of two, and guardians only as any two of three guardians. A fifth card, start from scratch, opens the same editor empty. A preset loads its shape into the editor's draft record of PT-040 with its member slots empty, and the editor applies its rules at save rather than on arrival. Above the grid customize opens the blank editor, and guide me is absent, since the wizard and its education layer ship in the second release, D-313.

The screen states the three costs before any enrollment, D-311, that saving is one transaction the account's key pays, that the recoverer's own key pays for a recovery in the first release and the account pays nothing, and that cancelling a recovery is itself a transaction the account's own key pays for with gas that key holds outside the account. It carries the honesty note in the first release, recovery helps if you lose your key, it cannot stop someone who already has it, in the words D-304 fixes, and it says to a holder with one device that start from scratch builds a single-method path.

## Deltas against the chapter at `bd8780f`

- None found.
