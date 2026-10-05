# PT-047 The waiting period and the privacy step

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-7 |
| Round | 1 |
| Module (cut) | `ux/setup/privacy` |
| Module (this repository) | `src/web/modules/social-recovery/setup/privacy/` |
| Size | half-day |
| Risk | medium |
| Risk reason | The default wait is the whole protection of a holder without a watcher and the privacy lines are what a stranger is promised, so a wrong default or an overclaiming line is a security fact. |
| Depends on | PT-036, PT-040 |
| Interfaces | none |
| Invariants | I-25, I-33, I-34, I-46 |
| Design refs | D-107, D-110, D-305, D-318, D-375 |
| Readiness | blocked in part |
| Mock-first | completes against the SDK doubles alone |

## Done

Checks:

- check: build

Judgments:

- the picker offers 24 hours, 48 hours, 72 hours and 7 days with 48 hours the default and a custom entry of 24 hours or more, refuses under the floor with a wallet rule string that never says the chain rejects a shorter wait, and refuses past the picker's own ceiling first
- the waiting period step says the holder must open the browser during the wait to see a banner and names the gas the account's own key must hold outside the account to cancel
- the privacy step offers Private as the default and Public, each radio with one line stating what it reveals, the exposure line split by whether the path holds an address row, and no line claiming a level hides that a setup exists
- at the hidden levels the recovery password is required twice with both halves of the trade stated, at Public no password field renders and the line says the level sets no password and the card carries only the address, and the two passwords carry their two names everywhere

## Body

Write `src/web/modules/social-recovery/setup/privacy/`, the waiting period step of D-305 and the privacy step of D-318. The picker offers 24 hours, 48 hours, 72 hours and 7 days as chips with 48 hours the default and a custom entry that takes any value of 24 hours or more. Its ceiling is the largest wait the setup screen accepts, one of the six numbers contracts D-107 gives the SDK and the owner still owes under cut-q-13, and the floor is the wallet's own, so no copy says the contract rejects a shorter wait, I-46. The step says the holder must open the browser during the wait to see a banner until alerts ship, and states what the holder must hold to use the window they are pricing, gas on the account's own key held outside the account, since the cancel is a transaction that key sends. The default stands against the request window of 24 hours and a cancel gathering whose window the sdk chapter owes, and the wallet revisits the default and the floor once that number lands, which the body records rather than the screen.

The privacy step decides what a stranger can read about the setup. Private, the default, encrypts the shape and the values with the recovery password, so a stranger sees that this account has a recovery setup and nothing of what it is until a recovery runs, which publishes the whole rule in the clear. Public publishes everything and sets no password, so a fresh device rebuilds the setup from the chain alone and the card carries only the address. Shape visible ships when the sdk chapter adopts the middle level, cut-q-23, and this task renders its radio behind that adoption. Every level carries the exposure line in two halves, the guessability half for the address rows alone and the publication half for every row, and names the rows as every guardian of your path where the path holds an address row and every method of your path where it holds none, contracts D-110. No level hides that a setup exists and no copy says nobody can see you have one, I-34, and each radio states what a stranger can read, I-25. At the hidden levels the step requires the recovery password twice and states both halves of the trade, that anyone holding the card can read the path and still cannot recover, and that losing both the card and the password leaves a fresh device unable to begin. The extension password and the recovery password keep their two names and no field takes both, I-33.

## Deltas against the chapter at `bd8780f`

- cut-q-23: the step renders two radios, Private and Public, until the sdk adopts the middle level. I-25 still reads "one line for each of the three levels"; the chapter is the rule.
- The picker ceiling depends on cut-q-13.
