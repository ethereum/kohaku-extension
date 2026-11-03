# PT-058 The guardian row, its message and the paste check

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-8 |
| Round | 3 |
| Module (cut) | `ux/recovery/checklist` |
| Module (this repository) | `src/web/modules/social-recovery/recovery/checklist/` |
| Size | half-day |
| Risk | high |
| Risk reason | I-48 is decided here, the one window where the account and the new key are not yet public carried in a link and a message that names its install's source, and the paste check is where every approval counts or fails. |
| Depends on | PT-057 |
| Interfaces | `IMethodsOrchestrator`, `IRecoveryClient` |
| Invariants | I-48 |
| Design refs | D-104, D-202, D-206, D-302, D-308, D-374, D-392 |
| Readiness | blocked |
| Mock-first | completes against the SDK doubles alone |

## Done

Checks:

- check: build
- check: fuzz, budget: deep

Judgments:

- the guardian row renders the account above the new key and the new key, the key being removed and the words no payment under it, above its three carriers of the link, copy the link, copy a message with the link and show the QR code, each disabled until all four values have rendered, beside open the approval page and the setup and attempt numbers
- the message is fixed copy naming the deadline, the install, the source the extension is installed from and the publisher to check on that source, telling the guardian to call the owner back on a number they already hold and compare the account and the new key before they sign, saying the link reveals the account and the new key so it is not forwarded, and saying how the approval comes back as one line pasted into the row
- the row tells the recoverer to ask the guardian for the call rather than to place it and to send the message over a channel they already use, and records declined or unanswered as a note the recoverer clears with one tap
- a pasted approval validates at once through addApproverReply with four written errors, this text is not an approval, this approval matches no method of this path, this approval is already in the list and this approval has expired, the unmatched error naming its three causes with a repair for each and no warning firing for an address that holds no code, and every approval counts or fails on paste

## Body

Write the guardian row and the paste check of D-392 in `src/web/modules/social-recovery/recovery/checklist/`, after PT-057. A guardian row shows one artifact, the link to the approval page of PT-063, which the extension serves from the first release. The row renders the account above the new key, and renders the new key, the key being removed and the words no payment under it, above its three carriers of the link, copy the link, copy a message with the link and show the QR code, each disabled until all four have rendered, I-27's rule on this surface. Beside them it offers open the approval page, since a recoverer who holds a row's key answers it through the page like any guardian, and renders the setup number and the attempt number for the paste check and the page's reads. The link carries the request with the hash of the setup body and never the body, D-374, so the guardian reads that row's values and nothing of the path.

The message is fixed copy the frames draw. It names the deadline, the install, the source the extension is installed from and the publisher to check on that source, since a guardian who follows it into a search result otherwise installs whatever a phisher listed there, I-48. It tells the guardian to call the owner back on a number they already hold and to compare the account and the new key on that call before they sign, says that the link reveals the account and the new key so the guardian does not forward it, says the guardian opens the link in a browser that has Kohaku and signs on the page with the wallet that holds the key or through the page's offline block, and says how the approval comes back, one line pasted into the row. The row tells the recoverer to ask the guardian for that call rather than to place it, to read the account and the new key when the guardian calls, and to send the message over a channel they already use. The recoverer marks a guardian who declines or never answers as declined or unanswered and clears the note with one tap.

## Deltas against the chapter at `bd8780f`

- `sdk.md` D-207: `addApproverReply` returns a typed result with five refusals and never throws, and judges no proof; D-374 says three thrown errors and a static call per reply. Build against one shape after the sdk owner rules (cut-q-22, FR23-SDK-VERIFY).
- The row links to the page of PT-063, which the header does not declare.
