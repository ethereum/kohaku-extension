# PT-060 The submission confirmation

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-8 |
| Round | 5 |
| Module (cut) | `ux/recovery/submit` |
| Module (this repository) | `src/web/modules/social-recovery/recovery/submit/` |
| Size | half-day |
| Risk | medium |
| Risk reason | The confirmation leads with the three values a phisher forges and a submit enabled before every approval verified spends gas on a set the chain refuses. |
| Depends on | PT-039, PT-059 |
| Interfaces | `IRecoveryClient` |
| Invariants | none |
| Design refs | D-103, D-202, D-302, D-311, D-373, D-393 |
| Readiness | risky |
| Mock-first | completes against the SDK doubles alone |

## Done

Checks:

- check: build

Judgments:

- the confirmation leads with the account with the name caveat on its account line, the new key in full and the key being removed as the request builder returned it, and holds under verify the details the words no payment, the waiting period as a duration and never an absolute end, that the owner can cancel, the node named by kind, what the submission publishes and on the logged-in route that the installed key controls two accounts
- the submit action stays disabled until the account, the new key, the key being removed and the words no payment have rendered and every approval has verified again before the confirmation
- the submission runs the gas check on the sending key, sends prepareStartAttempt from the recoverer's own key, renders a failed submission as a plain error with retry, a submission rejected because an attempt already runs with its own copy that says retrying cannot help, and the uncertified-key warning as one line where the SDK raises it

## Body

Write `src/web/modules/social-recovery/recovery/submit/`, the submission confirmation of D-393. It leads with the three values a phisher would forge, the account with the caveat of D-302 on its account line since its own words ask the reader to check the account, the new key in full and the key being removed as the wallet's request builder returned it. Under a verify the details expander it holds the words no payment since the first release names no order, the waiting period as a duration and never an absolute end since the end renders from the attempt the manager reports and nowhere before it, contracts D-103, that the current owner can cancel during it, the node the wallet sends through named by kind as on the review, and what the submission publishes, the whole setup in the clear with every method used and unused, the used methods' readable configuration, an approving guardian's address and a document's identifier public and permanent, and a method reused across accounts visibly shared. On the logged-in route it says the installed key now controls two accounts and shares one fate. Where the SDK warns that the key this request installs came without the deriving wallet's certification the expander carries that warning as one line, D-373.

The submit action stays disabled until the account being recovered, the new key, the key being removed and the words no payment have rendered and every approval has verified through the same static call again before the confirmation, the copy claiming a check and never a refund. The gas check of PT-039 runs on the sending key, the fresh key of the fast track or the chosen account's key, with the deposit step naming its address and the amount, both routes offered on the logged-in route. The submission is one transaction the recoverer's own key sends through `prepareStartAttempt` with the smallest set. A failed submission gets a plain error and retry, and a submission rejected because an attempt already runs gets its own copy, since retrying cannot help. The two payment warnings the SDK raises land on no screen of this release and the wallet suppresses both, D-311.

## Deltas against the chapter at `bd8780f`

- `sdk.md` defines no key certification and raises no uncertified-key warning; drop that clause or ask the sdk owner for the member.
