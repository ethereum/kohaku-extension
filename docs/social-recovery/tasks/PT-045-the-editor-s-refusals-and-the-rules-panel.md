# PT-045 The editor's refusals and the rules panel

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-7 |
| Round | 2 |
| Module (cut) | `ux/setup/editor` |
| Module (this repository) | `src/web/modules/social-recovery/setup/editor/` |
| Size | half-day |
| Risk | medium |
| Risk reason | A panel that lists five of the six refusals teaches the holder a shape the save then refuses, and a refusal that credits the chain with the wallet's rule breaks I-24. |
| Depends on | PT-044 |
| Interfaces | none |
| Invariants | none |
| Design refs | D-103, D-107, D-305 |
| Readiness | risky |
| Mock-first | completes against the SDK doubles alone |

## Done

Checks:

- check: build

Judgments:

- the editor refuses an empty clause, a threshold outside its members, a threshold below one, a threshold above two hundred fifty five, a waiting period past the width the kit's field holds and a rule wider than a block can evaluate, and each refusal names the wallet as the party that refuses and whose limit it applies
- the rules panel lists every refusal the editor applies, the zero-clause refusal the chain shares stated beside the upper one, and the panel states that on a path with a second clause that refusal is the wallet's alone
- the three waiting period strings read as D-305 writes them, past the width the kit's field holds, past the longest this picker offers, and cannot check a path this large in one block

## Body

Write the refusals of the setup editor and its rules panel in `src/web/modules/social-recovery/setup/editor/`, after PT-044. The editor refuses a path whose shape cannot be satisfied, an empty clause, a threshold outside its members, a threshold below one which sits outside its members like one above them, and a threshold above the two hundred fifty five its own field can count, contracts D-103. It refuses a waiting period past the width the kit's field holds and a rule wider than a block can evaluate, contracts D-107. This check is the only gate between the holder and a setup that can never recover. Each refusal names the wallet as the party that refuses and names whose limit it applies, in the three waiting period strings D-305 fixes, this wallet cannot save a waiting period past the width the kit's field holds, past the longest this picker offers, and this wallet cannot check a path this large in one block. The picker's own ceiling refuses first at every value a holder can type, so the field-width string is copy no holder reaches through the picker and stays for a value that arrives by another door.

The threshold's field bounds how many credentials a clause requires and never how many it lists, so a ceiling on how many members a group holds is the wallet's own rule wherever the editor applies one and its refusal names the wallet, I-24. The rules panel carries every refusal the editor applies, the two hundred fifty five included, since a panel that lists five of the six teaches the holder a shape the save then refuses. The chain refuses one rule shape of its own, the rule whose every clause is zero, so on a one-group path the editor's refusal repeats an enforcement the chain has and on a path with a second clause the refusal is the wallet's alone, which the string says, and the panel states this refusal beside the upper one since a panel that states one side alone reads as permission for the other.

## Deltas against the chapter at `bd8780f`

- The waiting-period width refusal depends on cut-q-13 (contracts D-107 numbers).
