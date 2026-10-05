# PT-037 The rule lines

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-6 |
| Round | 0 |
| Module (cut) | `ux/shared/rule-lines` |
| Module (this repository) | `src/web/modules/social-recovery/shared/rule-lines/` |
| Size | half-day |
| Risk | medium |
| Risk reason | The wallet's own verdict on a path's consequences, rendered in five places from one function, and a wrong line tells a holder a lockout is a rescue. |
| Depends on | none |
| Interfaces | none |
| Invariants | none |
| Design refs | D-305, D-312 |
| Readiness | free |
| Mock-first | completes against the SDK doubles alone |

## Done

Checks:

- check: build

Judgments:

- the lines are a pure function of the path's shape and every line D-305 states is produced for the shape that earns it, all N must answer, both must answer, the single-method warning, any N of these M, either one alone, any one of these M alone, together with your required methods and enough members of each other group to meet its threshold, every member must answer, and one failure domain
- a group of one member and a path of one row both produce the single-method warning with the second passkey or hardware key offer beside it, and a two item path as two required rows produces the sizing rule line
- the lines say nothing about the identity method's weight and nothing about raising a threshold when a secondary credential joins

## Body

Write `src/web/modules/social-recovery/shared/rule-lines/`, the pure function that turns a path's shape into the rule lines D-305 states. The wallet generates these lines from the holder's own path wherever the shape appears, on the recommended-path card, in the setup and management editors, on the review, on the recoverer's readout and on the done screen's exits, since the SDK returns no verdict on a rule and the lines are the wallet's own calls on rule quality. The function takes the path record the setup draft holds, required rows and groups with their thresholds and members with their kinds, and returns the lines in D-305's order.

A path with no group and N required rows carries all N must answer, losing any one locks you out, two rows read both must answer, losing either locks you out, and one row carries the single-method warning, that if you lose your key this one method is the only way back into the account, with the offer of a second passkey from another device or a hardware key and the line that two passkeys behind one platform account share its fate. A group of any N of M carries any N of these M recover this account, losing more than M minus N locks you out, with its threshold-one forms, either one alone can recover this account and either one alone can also take it at two members and any one of these M alone at more, and the together-with clause where required rows or a second group stand beside it. A group whose threshold equals its member count carries every member must answer, and a group of one member is one method. A group whose members all share one method family carries one failure domain, keyed on the family as D-312 rules, so a passport and an Aadhaar identity read as two domains. The setup line about keeping methods in different places and the sizing rule line at two items belong here too. The identity method's weight line and the words primary and offered are produced by nothing, D-312.

## Deltas against the chapter at `bd8780f`

- None found.
