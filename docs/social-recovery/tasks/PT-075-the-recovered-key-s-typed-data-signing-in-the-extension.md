# PT-075 The recovered key's typed-data signing in the extension

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-8 |
| Round | 0 |
| Module (cut) | `ux/signing` |
| Module (this repository) | `src/ambire-common/src/libs/signMessage/ (kohaku-commons submodule)` |
| Size |  |
| Risk | medium |
| Risk reason | A recovered key signs every later message through this path, and a signature the account does not accept strands the holder after a successful recovery. |
| Depends on | none |
| Interfaces | none |
| Invariants | I-21 |
| Design refs | D-105, D-108 |
| Readiness | blocked |
| Mock-first | needs the real thing beyond the doubles |

## Done

Checks:

- check: build

Judgments:

- on a fork of the pinned account, a key at privilege value 1 signs an ERC-2612 permit through the repaired path and the account's isValidSignature returns the magic value
- the recovered-signing-wrapper vector row replays against the extension's signing path

## Body

Repair `getEIP712Signature` in the account library's `src/ambire-common/src/libs/signMessage/signMessage.ts` (the kohaku-commons submodule) so a key at Ambire's privilege value `1` on a v2 account signs typed data through the existing `getTypedData` envelope and `wrapStandard`, as `getPlainTextSignature` already does. The envelope is Ambire's own, `AmbireOperation(address account, bytes32 hash)` under the domain `Ambire`, `1`, chain and account, which the account's `SignatureValidator` rebuilds and recovers; the SDK builds none of it.

## Deltas against the chapter at `bd8780f`

- The file lives in the kohaku-commons submodule, so this is a pull request there and a pointer bump here.
- PR #54 question 4 asks which signing paths fail for a key at privilege value 1.
- The `recovered-signing-wrapper` vector row has no blessed producer yet (cut-q-5).
