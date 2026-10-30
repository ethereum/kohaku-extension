# PT-054 The recovery entry and the account step

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-8 |
| Round | 2 |
| Module (cut) | `ux/recovery/entry` |
| Module (this repository) | `src/web/modules/social-recovery/recovery/entry/` |
| Size | half-day |
| Risk | high |
| Risk reason | I-28 is decided here, the one sentence that says no setup was found rendering only on an absent commitment, and a failed read shown as no setup sends a keyless holder away from an account that has recovery. |
| Depends on | PT-036, PT-038, PT-040 |
| Interfaces | `IPolicyManagerInteractor`, `IRecoveryActionInteractor`, `IRecoveryClient` |
| Invariants | I-28 |
| Design refs | D-105, D-202, D-306, D-312, D-319, D-371, D-373 |
| Readiness | risky |
| Mock-first | completes against the SDK doubles alone |

## Done

Checks:

- check: build
- check: fuzz, budget: deep

Judgments:

- the logged-in entry sits in the settings overview behind the condensed warning with its acknowledgment, asks which account receives control when the wallet holds several, names the address it installs and says that after recovery this key controls two accounts publicly linked by it, and numbers its five stages
- the account step accepts an address or a name, names the one chain as a fixed label with no switch, says where the address is, renders an error per cause with retry and the hint that the address is on the card, and never renders an empty local list as the answer
- the sentence that no recovery setup was found for this account on this chain under the recovery this wallet knows renders only when the commitment is absent, names the chain and the action, offers another address and says a setup committed by another wallet may sit under an action this build does not read
- the step runs the fit check through supportsAccount and the request builder's refusal before any approval is gathered and renders a refusal as this release cannot recover this account yet with the reason the builder gives, reads the authorization and renders a dormant setup as not active on the account, and renders a refused client as update the wallet

## Body

Write `src/web/modules/social-recovery/recovery/entry/`, the two entries into recovery and the account step of D-306. A logged-in wallet offers recover an account from the settings overview behind the condensed anti-scam warning of PT-052 with its acknowledgment, asks which of the wallet's accounts receives control when it holds several, and names the address it installs, the chosen account's own key, saying that after recovery this key controls two accounts publicly linked by it and sharing one fate, D-312. Recovering into an existing account creates nothing and merges nothing. That route numbers five stages, the owner, the account, the readout, the collection and the submission, and a stage keeps its number across every screen it spans. The fast track of PT-053 reaches the same account step with no step number.

The account step identifies the lost account by address or name. It says where the address is, printed on the Recovery Card, resolvable from a name or on any explorer or wallet the holder sent funds from, and never renders an empty local list as the answer. It names the one chain as a fixed label and offers no switch, the owner's ruling of 2026-09-22. A name that does not resolve or a read that fails gets an error per cause with retry and the hint that the address is on the card, never the no setup sentence, and every chain read has a loading state and a failed state with retry, since a failed read is not the absence of a setup, I-28. Only a lookup that finds no setup commitment says so, that no recovery setup was found for this account on this chain under the recovery this wallet knows, naming the chain and the action it searched under, offering another address and saying that a setup committed by another wallet may sit under an action this build does not read. A found account renders a confirm screen with the address, its blockie and its name, this is my account.

After the confirmation the step reads whether the account still authorizes the action and renders a dormant setup as this setup is not active on the account and only the account's own key can re-activate it, with the dormant reading winning where an attempt also runs, D-319. It runs the action's fit check itself through `supportsAccount` and asks the request builder whether this release recovers the account and which key a recovery would remove, D-373 and D-371, and a refusal renders as this release cannot recover this account yet with the reason the builder gives, written by the wallet from the code, before any approval is gathered, the owner's ruling of 2026-09-08. A client the digest-version check refused, PT-038, renders here as update the wallet. The running-attempt band and the readout are PT-055's and PT-056's in this lane.

## Deltas against the chapter at `bd8780f`

- The read naming the key a recovery would remove is not an SDK member (cut-q-22); the four-state setup read of D-371 has no member either, `sdk.md` offers `setupState()` and `getSetup()`.
- D-312 (2026-09-22): the chain is a fixed label with no switch, already in the body.
