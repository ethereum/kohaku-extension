# PT-068 The management editor and the review of changes

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-11 |
| Round | 4 |
| Module (cut) | `ux/management/editor` |
| Module (this repository) | `src/web/modules/social-recovery/management/editor/` |
| Size | half-day |
| Risk | medium |
| Risk reason | I-30 is decided here, every control that would cancel a running recovery saying so above the action, and an edit that lands without that line ends a recovery the holder meant to keep. |
| Depends on | PT-044, PT-049, PT-067 |
| Interfaces | `ISetupClient` |
| Invariants | I-30 |
| Design refs | D-102, D-202, D-302, D-305, D-309, D-317, D-371 |
| Readiness | free |
| Mock-first | completes against the SDK doubles alone |

## Done

Checks:

- check: build

Judgments:

- editing loads the path into the editor of PT-044, states which committed values change, states that a changed password or privacy level makes a printed card stale, offers changing the recovery password as one of those values, and marks a member the path still needs as still needed, blocking its removal with the fix, lower the threshold or add a replacement first
- saving while an attempt is pending carries the line saving will cancel the recovery in progress above the primary action, and removing recovery warns that the account will have no recovery path, asks the holder to type to confirm, and while an attempt is pending adds that removing recovery cancels it
- every change ends in a review of changes before one owner-signed transaction, the review carrying for every row the edit adds the trust list rows, the publication line and the security stop block, and the save runs prepare update, which reads the current setup from the chain and never from a client copy
- removal clears the setup and removes the action's authorization in one batch through prepare remove, and no separate methods list exists

## Body

Write `src/web/modules/social-recovery/management/editor/`, the management editor and the review of changes of D-309. The overview has no separate methods list, and every member and method change happens inside the path editor of PT-044 and ends in a review of changes before one owner-signed transaction. Editing loads the path into the editor, asking the recovery password where this device cannot read it, and states which committed values change. It states that a changed password or privacy level makes a printed card stale and offers changing the recovery password as one of those values, the exit the done screen of PT-062 points at. The editor blocks removing a member the path still needs in place, the member marked still needed under D-302, with the fix, lower the threshold or add a replacement first. The management editor and the overview's readout carry the rule lines of PT-037, since a holder reads a shape's consequences where they change that shape.

Saving while an attempt is pending carries the line saving will cancel the recovery in progress above the primary action, I-30. Removing recovery always warns that the account will have no recovery path, asks the holder to type to confirm, and while an attempt is pending adds that removing recovery cancels the recovery in progress. The review of changes carries, for every row the edit adds, the trust list rows of PT-049, the publication line and the security stop block, D-317. The save runs the prepare update of D-371, which takes the next path and reads the current setup from the chain itself and never from a client copy, an edit during a wait cancelling the running attempt as the same act. Removal runs the prepare remove, which clears the setup and zeroes the action's authorization in the privilege table in one batch since Kohaku's account can revoke it, contracts D-102, so neither write alone leaves a dormant setup or a dead authorization. Both writes run through the shared states and the gas check of PT-039 from the account's controlling key.

## Deltas against the chapter at `bd8780f`

- None found.
