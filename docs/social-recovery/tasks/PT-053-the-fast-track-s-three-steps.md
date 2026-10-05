# PT-053 The fast track's three steps

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-8 |
| Round | 3 |
| Module (cut) | `ux/onboarding/fast-track` |
| Module (this repository) | `src/web/modules/social-recovery/onboarding/fast-track/` |
| Size | half-day |
| Risk | high |
| Risk reason | I-43 is decided here, the key that will control the account derived by the wallet at the account's index plus the offset, and a key derived any other way leaves the recovered holder with an account this wallet cannot find. |
| Depends on | PT-039, PT-040, PT-052 |
| Interfaces | none |
| Invariants | I-43 |
| Design refs | D-105, D-303, D-312 |
| Readiness | free |
| Mock-first | completes against the SDK doubles alone |

## Done

Checks:

- check: build
- check: fuzz, budget: deep

Judgments:

- the fast track opens with three numbered steps, the warning, the extension password and the key with its seed backup kept in the flow, and the key that will control the recovered account is derived from that entry at the account's index plus the extension's offset and shown as the address that will control it
- the step takes no pasted address, the copy says the account stays at the same address and this new key will control it, and the sending key is the ordinary key of the seed entry and not the derived key the recovery installs
- the fresh-install route carries one plain header, the extension's name and recover an account, with no settings breadcrumb and no step counter from the account lookup through the done screen, and the gas step follows the readout with no step number and is skipped when the key already holds enough

## Body

Write `src/web/modules/social-recovery/onboarding/fast-track/`, the fast track of D-303, the ordinary first run shortened into a second keystore entry. Three numbered steps open it, the warning of PT-052, the extension password set here like on any first run since the recoverer may never have installed the extension, and the key created as a new seed entry with its backup ceremony kept in the flow rather than deferred. The key the recovery installs is the one derived from that entry at the account's index plus the extension's offset, contracts D-105, and the step shows that derived address as the key that will control the account, since a key derived any other way leaves the recovered holder with an account this wallet cannot find. The destination key is always one the wallet holds and the step takes no pasted address, I-43 and the owner's ruling of 2026-09-08. The copy at key creation says that the account stays at the same address and that this new key will control it, true on Kohaku's account since a recovery rewrites one privileged key and never the address.

The sending key is the ordinary key of the seed entry created here and not the derived key the recovery installs, and it sends the request and the execution and pays their gas in the first release. The account step and the readout of PT-054 to PT-056 follow with no step number, and the gas step of PT-039 follows them, after the readout so a recovery the account step refuses costs no gas, D-312, skipped when the key already holds gas. The fresh-install route carries one plain header, the extension's name and the words recover an account, with no settings breadcrumb and no step counter from the account lookup through the done screen, while the logged-in route of PT-054 keeps its breadcrumb and its five-stage counter.

## Deltas against the chapter at `bd8780f`

- None found.
