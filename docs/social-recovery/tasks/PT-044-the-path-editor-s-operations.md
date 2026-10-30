# PT-044 The path editor's operations

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-7 |
| Round | 1 |
| Module (cut) | `ux/setup/editor` |
| Module (this repository) | `src/web/modules/social-recovery/setup/editor/` |
| Size | half-day |
| Risk | medium |
| Risk reason | The editor is the only gate between the holder and a setup that can never recover, and a move that drops an enrolled credential leaves a slot the save refuses. |
| Depends on | PT-035, PT-037, PT-040 |
| Interfaces | `ISetupClient` |
| Invariants | I-24 |
| Design refs | D-202, D-305, D-313, D-371 |
| Readiness | free |
| Mock-first | completes against the SDK doubles alone |

## Done

Checks:

- check: build

Judgments:

- the editor adds and removes required rows, members and groups, changes a threshold, grows a group past three, and moves a member between a required row and a group with one action, move to group or make required, with the enrolled credential surviving the move
- a duplicate of one enrolled credential across the path is refused with a reason that names the wallet as the party that refuses, never the chain, and offers no relaxation
- the editor renders the rule lines of PT-037 for the whole path as it stands and runs the SDK's path check at save

## Body

Write `src/web/modules/social-recovery/setup/editor/`, the setup editor of D-305 over the draft record of PT-040, which the management editor of PT-068 reuses. It adds and removes required rows, members and groups, remove group included since a shape the editor can add it must be able to remove, changes a group's threshold, grows a group past three, and moves a member between a required row and a group with one action, move to group or make required, the enrolled credential surviving the move. A multi-group path and a group built from a strict preset are both reachable here, while the advanced builder's free canvas ships later, D-313. Members mix freely, guardians, passkeys, passports and Aadhaar identities, and every group carries a threshold, two of three being the starting suggestion.

One enrolled method appears once across the path, never both as a required row and a member, and the editor refuses a duplicate with a reason that names the wallet as the party that refuses and never the chain, I-24, and offers no relaxation, since one key at two places of a group would let one signer fill both. The chain allows naming the same person twice, so this is the wallet's own policy and the string says so. The editor renders the rule lines of PT-037 for the path as it stands, since a holder reads a shape's consequences where they change that shape, and at save it runs the SDK's path check, the validate path of D-371, before the review opens. The refusals themselves and the rules panel are PT-045's.

## Deltas against the chapter at `bd8780f`

- None found.
