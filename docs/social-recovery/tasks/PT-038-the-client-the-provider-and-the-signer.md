# PT-038 The client, the provider and the signer

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-6 |
| Round | 1 |
| Module (cut) | `ux/shared/client` |
| Module (this repository) | `src/web/modules/social-recovery/shared/client/` |
| Size | half-day |
| Risk | medium |
| Risk reason | Every chain read and every prepared call of the extension passes through what this task builds, and the digest-version check it runs is what refuses a client built against another deployment. |
| Depends on | PT-035 |
| Interfaces | `IProvider`, `IRecoveryClient`, `ISetupClient` |
| Invariants | none |
| Design refs | D-202, D-208, D-306, D-312, D-316, D-319, D-370, D-373 |
| Readiness | risky |
| Mock-first | completes against the SDK doubles alone |

## Done

Checks:

- check: build

Judgments:

- the extension builds one client from a configuration naming one chain, the address book of the manager, the methods and the action, and a provider adapter whose four reads route through the extension's own provider, and it hands the client no signer and no storage
- the signer facade signs typed data or raw bytes for a key the keystore holds, addressed by address and key type, and exposes no key export
- with no rail configured every prepared call is sent from a key the signer holds, and the digest version the manager publishes through its domain is checked when the client is built, a disagreement refusing the client before anything is prepared
- the table of the kit's audited actions with their publishers is the extension's own and is the only source of the action a screen offers or names

## Body

Write `src/web/modules/social-recovery/shared/client/`, the layer of D-370 between the extension and the SDK. It builds one recovery kit client from a configuration for the one chain the wallet reads, named as a fixed label with no switch per D-312, with the address book of the deployed manager, methods and action and the deployment descriptor of D-208. The provider adapter implements the SDK's `IProvider` over the extension's own provider, whose `send` may route through a light client and its prover, and the extension's own balance reads and gas estimates run beside it since the SDK's provider answers four reads and no balance, D-373. The SDK stores nothing and holds no signer, so the extension's storage and its signer stay outside the client.

The signer facade signs typed data or raw bytes for a key the keystore holds, addressed by the keystore's own handle of address and key type, and exposes no key export whatever the keystore's settings surfaces do. In the first release the extension configures no sponsor rail, so every prepared call, a setup write, a submission, an execution or a cancel, is sent from a key the signer holds, the account's controlling key for account operations and the recoverer's own key for the recovery calls. The client is built through the SDK's builder against the doubles of PT-035 until the sdk lands. When the wallet builds the client for an account it checks the digest version the manager publishes through its domain, and a disagreement refuses the client before anything is prepared, the state D-306's account step draws as update the wallet, D-319. The module also holds the extension's own table of the kit's audited actions and their publishers, the one source of the recovery module and its publisher every screen names, and the deployment descriptors of D-208 for the two chains.

## Deltas against the chapter at `bd8780f`

- The addresses of the manager, methods and action are owed under cut-q-7; use named placeholders.
- `IProvider`'s four reads are the one normative list in `sdk.md` (D-208).
