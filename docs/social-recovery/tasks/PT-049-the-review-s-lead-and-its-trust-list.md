# PT-049 The review's lead and its trust list

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-7 |
| Round | 2 |
| Module (cut) | `ux/setup/review` |
| Module (this repository) | `src/web/modules/social-recovery/setup/review/` |
| Size | half-day |
| Risk | medium |
| Risk reason | The trust list is where the holder reads who could act on their account, and a row generated from a method's kind rather than its declaration states a party the method does not name. |
| Depends on | PT-036, PT-037, PT-038 |
| Interfaces | `IPolicyManagerInteractor`, `ISetupClient` |
| Invariants | none |
| Design refs | D-202, D-305, D-311, D-317, D-371 |
| Readiness | risky |
| Mock-first | completes against the SDK doubles alone |

## Done

Checks:

- check: build

Judgments:

- the lead carries the path with its rule lines and its waiting period, the sentence that the recoverer's own key sends and pays for a recovery and the account pays nothing, the publication line once and the comparison that a spare key is the cheaper way to survive a lost key and no help against a stolen one, and the trust list sits under a verify the details expander
- the trust list names one row per method contract with the parties its declaration names, or audited, with no outside party where the declaration is empty and the words unknown outside parties for a module with no declaration, and it distinguishes an empty declaration from an absent one
- every guardian address carries the conditional smart account sentence, bold where detection fired, every identity method names its admin as a party that could approve for it and, where that method alone satisfies the rule, recover the account alone, and the action renders as the recovery module and its publisher from the extension's own table
- the list names the node by kind, states in one sentence that every declaration is self-attested, carries the line that a method whose provider stops working is dead for good, and guides toward thresholds a hostile minority cannot reach where a group has three or more members

## Body

Write `src/web/modules/social-recovery/setup/review/`, the review screen of D-317, its lead and its trust list. The lead carries the path with the rule lines of PT-037 and its waiting period, the sentence that in the first release the recoverer's own key sends and pays for a recovery and the account pays nothing, the publication line once, the test outcomes of every row under D-305's chips with the untested method's line, and the comparison for the holder that a spare key on this account is the cheaper way to survive a lost key and no help against a stolen one, the owner's ruling of 2026-09-08. The trust list sits under a verify the details expander so the holder reads the review rather than scrolling it, and every identity line and passkey kind line of the enrollment rows repeats here, D-311.

The trust list names one row per method contract of the kit, however many path rows use it, with the parties its declaration names read through `trustedParties` and `moduleInfo`, or audited, with no outside party where the declaration is empty and the words unknown outside parties for a third-party module that ships no declaration, the SDK's metadata telling an empty declaration on a kit method from the absence of one, D-371. For every guardian address it carries the conditional sentence, if this address is a smart account whoever controls it can approve for it, repeated in bold where detection fired. For an identity method it names the method's admin with the line that this party can change the key this method trusts so it could approve for this method, and where that method alone satisfies the whole rule, that this party could recover the account alone. It names the action with its author as the recovery module and its publisher from the table PT-038 holds. It names the node the wallet reads through by kind, a light client with its prover or a plain node, which sees the request before the chain does, carries the line that a method whose provider stops working is dead for good since methods ship immutable, and states in one sentence that every declaration is self-attested. Where a group has three or more members it guides toward thresholds a hostile minority cannot reach, and at a threshold of one it states that either one alone can take the account. The wallet recovers accounts with one signer, so the review offers no signer threshold control. The doors, the stop block and the save gate are PT-050's in the same lane.

## Deltas against the chapter at `bd8780f`

- None found.
