# PT-063 The approval page's reading

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-9 |
| Round | 2 |
| Module (cut) | `ux/guardian-page` |
| Module (this repository) | `src/web/modules/social-recovery/guardian-page/` |
| Size | half-day |
| Risk | medium |
| Risk reason | The page renders whatever its link says and its three chain reads are the only ground it has, so a failed read shown as a live request or a death is a signature over the wrong fact. |
| Depends on | PT-036, PT-038 |
| Interfaces | `IMethodsOrchestrator`, `IPolicyManagerInteractor` |
| Invariants | none |
| Design refs | D-202, D-206, D-302, D-308, D-312, D-319, D-374, D-376, D-392 |
| Readiness | risky |
| Mock-first | completes against the SDK doubles alone |

## Done

Checks:

- check: build

Judgments:

- the page is the extension's own at a relative path opened in a browser that has the extension, it holds no client of the recoverer's and turns the request its link carries into what it renders through describeRequest, and the link carries the hash of the setup body and never the body
- the lead says who asks, what approving does and what it removes, with the account, the new key in full, the key being removed and the words no payment, and a verify the details expander holds the deadline, the setup number, the attempt number, the chain as a fixed label and the manager deployment
- the lead carries the publication line, the line that approving links accounts where the same method serves several, the line that a recovery publishes the whole path so a guessable address is readable even where this approval was never used, the line that anyone holding this request can submit it until the deadline, and the line that the link reveals the account and the new key and nothing of the path so it is not forwarded
- the page makes three chain reads, the attempt's state, the setup number and the account's authorization, renders the three deaths and a submitted request as waiting with its end time in place of the sign action, renders a dormant setup's reading, renders a failed read as we could not read this request with retry and never as a death or a live request, refuses a request whose domain disagrees with the manager's with no retry, and re-reads when it opens and once a minute

## Body

Write `src/web/modules/social-recovery/guardian-page/`, the reading half of the approval page of D-308, the one surface the ux side exposes, D-376. The page is the extension's own, ships at a relative path and opens in a browser that has the extension, the guardian pasting the link into the address bar since an extension page does not open from a click in another site, D-312. It consumes the methods orchestrator's `describeRequest` over the request its link carries and holds no client of the recoverer's, and the link carries the hash of the setup body and never the body, D-374, so the page derives the digest from the values it renders and that hash and reads nothing of the holder's rows, thresholds and wait.

The page leads in plain words, who asks, what approving does and what it removes, with the account, the new key rendered in full and never as a hash, the key being removed and the payment, which reads the words no payment in this release. A verify the details expander holds the deadline, the setup number, the attempt number, the chain as a fixed label and the manager deployment it is aimed at, the owner's rulings of 2026-09-18 and 2026-09-22, and the purpose, the place and the action stay off the page. The lead carries the publication line, approving puts your address on chain in the clear and permanently public, the line that where the same method serves several accounts approving links them visibly, the line that a recovery on this account publishes the whole recovery path so a reader who can guess this address reads it from the chain even where this approval was never used, the line that anyone holding this request can submit it until the deadline, and the line that the link reveals the account being recovered and the new key and nothing of the recovery path, so the guardian does not forward it. It tells the guardian to compare the account and the new key with what the owner read on the call.

The page makes three chain reads through the provider, the attempt's state, the setup number and whether the account still authorizes the action, and reads no `paused()`. It renders the three deaths, expired, another attempt opened and setup changed, in place of the sign action, and in that same place renders a request the recoverer already submitted as the recovery now waiting with the time that wait ends, never as void, since a guardian who reopens the link is the tripwire that warns them. Where the account no longer authorizes the action it reads that the attempt cannot execute until the account authorizes it again, the dormant reading of D-319. A read that fails or has not returned renders as we could not read this request with retry, never as a death and never as a live request, I-28. A request whose domain disagrees with the manager's `eip712Domain()` renders as this request is aimed at another deployment and this page cannot sign it, with no retry. The page re-reads the request when it opens and once a minute until the guardian signs. The signing half is PT-064's in this lane.

## Deltas against the chapter at `bd8780f`

- The page's three chain reads have no sanctioned route: the builder hands out `IMethodModuleReads` alone (sdk.md D-208).
- D-312 (2026-09-23): the page does not show the extension id a guardian should expect in the wallet's prompt.
