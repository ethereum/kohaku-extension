# PT-069 The passport and Aadhaar rows at enrollment

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-12 |
| Round | 3 |
| Module (cut) | `ux/setup/enroll` |
| Module (this repository) | `src/web/modules/social-recovery/setup/enroll/` |
| Size | half-day |
| Risk | medium |
| Risk reason | Two rows whose tests verify against the deployed method's pinned key and whose lines carry the demonstration limit, and a test that folds not supported into failed tells a holder to retry what will never change. |
| Depends on | PT-046 |
| Interfaces | `IMethodsOrchestrator` |
| Invariants | none |
| Design refs | D-104, D-206, D-305, D-311, D-312, D-372, D-375 |
| Readiness | risky |
| Mock-first | needs the real thing beyond the doubles |

## Done

Checks:

- check: build

Judgments:

- the passport row runs zkPassport's flow on the holder's phone through the ceremony tab with progress, abort and a failed state offering retry, verifies against the on-chain verifier's pinned key, names the hand-off to the phone and says that renewing the passport ends this credential
- the Aadhaar row takes a QR image the holder uploads and runs a test proof against the pinned authority key, is listed last and badged, carries the line that current documents may not verify against the deployed key so this method is discouraged until that is fixed, and says the holder presents the same QR again at recovery
- both rows carry the line that this method shows the details on the document and not that the holder is the one using it now and the publication line for the identifier the document produces, and both render the four verdicts, passed, failed with cause, unavailable with retry and not supported without one

## Body

Write the two identity rows of D-305 in `src/web/modules/social-recovery/setup/enroll/`, after PT-046. A passport runs zkPassport's own flow on the holder's phone, a phone able to read the document's chip, through the ceremony tab of PT-041 with progress, abort and a failed state that offers retry, and verifies against the on-chain verifier's pinned key, contracts D-104, so the wallet's verdict and the chain's agree and no test runs against an authority's current key the chain does not hold. The row names the hand-off to the phone and says that renewing the passport ends this credential, since the identifier is derived from the document, D-375, and the four facts that derivation depends on are the sdk chapter's to pin. An Aadhaar identity is a QR image the holder uploads and a test proof against the pinned authority key, with the same states, listed last in the inventory and badged. Its row carries the line the idea draft asks for while the liveness finding stands, that current documents may not verify against the deployed key so this method is discouraged until that is fixed, and says the holder presents the same QR again at recovery.

Both rows carry the line that this method shows the details on the document and not that the holder is the one using it now, the identity demonstration limit of D-311, and the publication line for the identifier the document produces, since a recovery publishes it beside the account and every later setup with the same document is correlatable to it. Both render the four verdicts of D-372, passed, failed with the cause the test reported, unavailable with retry and not supported with no retry since the answer will not change, and a skipped test reads not tested, never blocking the save, D-312. The identity method's weight line stays off the screens.

## Deltas against the chapter at `bd8780f`

- Q-22: the Aadhaar pinned key is the 2021 certificate and current documents fail; zkPassport's four facts are handed to the integrator by `sdk.md` D-206 rather than pinned by the sdk.
