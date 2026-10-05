# PT-051 The arming save

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-7 |
| Round | 4 |
| Module (cut) | `ux/setup/arm` |
| Module (this repository) | `src/web/modules/social-recovery/setup/arm/` |
| Size | half-day |
| Risk | high |
| Risk reason | The one batch that commits a setup and writes the kit's authorization, and a save reported before the commitment is re-derived reports a dead setup as saved. |
| Depends on | PT-039, PT-040, PT-050 |
| Interfaces | `IRecoveryActionArming`, `IRecoveryActionInteractor`, `ISetupClient` |
| Invariants | I-31, I-35 |
| Design refs | D-102, D-105, D-110, D-111, D-202, D-319, D-371, D-375 |
| Readiness | blocked |
| Mock-first | needs the real thing beyond the doubles |

## Done

Checks:

- check: build
- check: fuzz, budget: deep

Judgments:

- before the confirmation the screen asks the SDK whether the action fits the account and which key a recovery would remove, shows that key as returned, renders a refusal as this release cannot recover this account yet with the wallet's own reason written from the code, and refuses a second setup with the words this account already has a recovery setup, edit it instead
- the save is one confirmation over one batch that writes the kit's authorization where it is not yet written and commits the setup with the opt-out, prepended with the account's deployment from the extension's own account library where the account holds no code, the cost line naming the deployment's gas
- after the batch lands the wallet re-derives the commitment it committed before the screen reports success, a disagreement rendering its own failure state after that landed transaction pointing at removing and saving again, and the screen never reports a dead setup as saved
- a key that cannot pay gets the shared blocker naming the shortfall and the key's address, the save offers no sponsor, and the six setup records are wiped when the save is reported

## Body

Write `src/web/modules/social-recovery/setup/arm/`, the arming step of D-319. Before the confirmation the screen asks the SDK whether the action fits this account and which key a recovery would remove, through `supportsAccount` and the read D-371 asks the sdk chapter for, scripted in the doubles under cut-q-22, and shows that key as returned. It names the action and its author as the party that will hold the account's authority, from the audited-actions table of PT-038, and offers the kit's audited actions and nothing else. A refusal returns a code and never a sentence, and the wallet writes the string, this release cannot recover this account yet, with its own reason. It refuses a second setup for the same account and action with the words this account already has a recovery setup, edit it instead, naming the rule as the wallet's own since the chain refuses no second setup, I-24, and it refuses a setup on the manager it is configured with while that manager holds one for this account.

Saving is one confirmation, one batch the account signs to itself through `prepareCommitSetup` over the encrypted path of D-375 and the waiting period, which writes the kit's authorization into the privilege table where it is not yet written and commits the setup with the opt-out the first release commits, contracts D-111. The account's controlling key sends it and pays its gas, so the shared gas check of PT-039 runs first and a key that cannot pay gets the blocker naming the shortfall and the key's address, with no sponsor offered. An account that has never transacted has no code yet, so the extension prepends the deployment from its own account library to the batch, which then deploys the account before it writes the authorization and commits the setup, contracts D-102 and D-105, and the cost line names the deployment's gas, the owner's rulings of 2026-09-09 and 2026-09-18. The batch gets the shared submitting and failed states. After the batch lands the wallet runs `confirmSetup`, the re-derivation of the commitment it committed, before the screen reports success, and a commitment that disagrees gets its own failure state after that landed transaction pointing at removing and saving the setup again, contracts D-103. The screen never reports a dead setup as saved, I-31, and the pairing of the authorization write with the commit is what I-35 rests on. The digest-version check ran when the client was built, PT-038, so no post-save state carries it. On success the six setup records are wiped and the screen routes to the card of PT-048.

## Deltas against the chapter at `bd8780f`

- FR13-ARMING-BATCH (fit check on a code-less account) is unanswered in `sdk.md`; PR #54 question 2 asks whether the extension deploys the counterfactual account inside the arming batch.
- `IRecoveryActionArming` is never handed to an integrator (sdk.md D-201); the arming write comes only beside `prepareCommitSetup`.
- The deployment prepend comes from ambire-common's account code, not from the SDK (D-312, 2026-09-18).
