# PT-036 Display rules and the status vocabulary

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-6 |
| Round | 0 |
| Module (cut) | `ux/shared/display` |
| Module (this repository) | `src/web/modules/social-recovery/shared/display/` |
| Size | half-day |
| Risk | medium |
| Risk reason | Every screen renders a value through these, so a second truncation or a second status word here appears everywhere at once. |
| Depends on | none |
| Interfaces | none |
| Invariants | I-26, I-41 |
| Design refs | D-302 |
| Readiness | free |
| Mock-first | completes against the SDK doubles alone |

## Done

Checks:

- check: build

Judgments:

- each value type of D-302 renders in exactly one form, the short address as four and four hex digits, the full address whole with no grouping, the name ellipsized past twenty four characters, the hash as twelve and six, the approval as twelve and eight, the hidden value as sixteen dots beside a chip, the member list as three then a count, the payment order as symbol, amount and payee or the words no payment
- a resolved name beside a full address the reader is asked to check carries the caveat that the name can change hands and the full address is what to check, and a name rendered alone for an address the reader acts on carries the same caveat
- the status chips are exactly the words D-302 lists for a method in setup, a row in collection, an attempt and the recovery status, and the string Protected appears nowhere
- every kit noun renders under the screen word D-302 fixes, recovery registry, recovery module, publisher, security stop, setup number and attempt number, and the words policy, proof, relayer, atomic and EIP-712 appear in no string

## Body

Write `src/web/modules/social-recovery/shared/display/`, the value renderers and the status vocabulary of D-302 that every recovery surface of the extension calls. One renderer per value type, the address in its short and its full form, the resolved name with its ellipsis and its caveat under I-41, the transaction hash or challenge, the approval blob, the hidden value, the member list with its count, the user-typed method name capped at twenty four characters, the payment order and the deadline as a date and time in the reader's zone with the zone named and a countdown beside it. The four guardian values keep their one name each, new key, key being removed, payment or the words no payment, and deadline, with the done screen's controlled by and removed as the one exception D-302 states.

The chip vocabulary is a closed set. A method in setup is not started, in progress, tested, not tested, test failed, test unavailable, not supported, not yet active, saved or live. A row in collection is not asked, waiting, declined, unanswered, complete, not needed, did not answer or stopped. An attempt reads recovery in progress, waiting, execution due, stopped or cancelled, and the recovery status reads set up or not set up with path locked, not active and cannot recover beside it. The module exports the screen word for every kit noun and the two password names, extension password and recovery password, so no screen spells either on its own. The label Protected and any sentence saying recovery protects the account are absent, I-26, and the reviewer reads the string table for them.

## Deltas against the chapter at `bd8780f`

- The chips `stopped` and `did not answer` and the payment-order renderer are second-release words (D-302, D-393).
- The extension's string table is meant to be the copy-lint surface (D-300); `en.json` holds five keys today and the UI uses literals as keys, so this task also defines how strings are registered.
