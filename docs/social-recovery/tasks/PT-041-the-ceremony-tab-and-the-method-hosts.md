# PT-041 The ceremony tab and the method hosts

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-6 |
| Round | 1 |
| Module (cut) | `ux/shared/ceremony` |
| Module (this repository) | `src/web/modules/social-recovery/shared/ceremony/` |
| Size | half-day |
| Risk | medium |
| Risk reason | A ceremony run in the action popup dies on focus loss and a verdict folded into a skip reads a failed method as an untested one. |
| Depends on | PT-035, PT-036 |
| Interfaces | `IMethodsOrchestrator`, `IRecoveryMethod` |
| Invariants | none |
| Design refs | D-206, D-305, D-314, D-316, D-372, D-392 |
| Readiness | risky |
| Mock-first | needs the real thing beyond the doubles |

## Done

Checks:

- check: build

Judgments:

- every ceremony that dies on focus loss runs in a full tab and never in the action popup, a hidden tab dispatches nothing to the background until it is shown again, and a hand-off to a phone reports its result when the tab returns
- the extension calls the authenticator itself, create at enrollment and get at a claim, hands the result to the method, and reads the synced or device-bound kind from the ceremony's own flags
- every test reports exactly one of four verdicts, passed, failed with its cause, unavailable with retry and not supported without one, and a ceremony the holder dismissed or the browser refused returns before the method runs as its own note

## Body

Write `src/web/modules/social-recovery/shared/ceremony/`, the full tab every focus-sensitive ceremony runs in and the hosts that drive a method's four calls, enroll, test access, create claim and health check, D-372. D-316 states the rule once, that a ceremony that dies on focus loss, the passkey's among them, runs in a full tab rather than the action popup, that a hidden tab dispatches nothing to the background until it is shown again, and that a hand-off to a phone through the browser's own QR hand-off and the vendor's tunnel reports its result when the tab returns. Every enrollment row of D-305 and every checklist row of D-392 opens its ceremony through this module.

The extension calls the authenticator itself, `navigator.credentials.create` at enrollment and `navigator.credentials.get` at a claim, and hands the result to the method implementation, which packages it. The synced or device-bound fact is read from the flags the ceremony returns, since the method answers a kind alone through `deviceBinding` and names no platform, and the platform that syncs it is named from the browser and the operating system. Each host renders progress, abort and failure and returns one of the four verdicts every test reports, passed, failed with the cause the test reported, unavailable with retry where a node or a service did not answer, and not supported with no retry where the method cannot serve the document. A ceremony the holder dismisses or the browser refuses returns before the method runs, read from the browser's own error, as the cancelled or refused note the row renders in place of an error, and a hand-off that never connects reads unreachable. The passkey works only from the extension's own origin, D-314, and the host reports a relying-party mismatch as the method's enrollment failure.

## Deltas against the chapter at `bd8780f`

- After the passkey proof of concept (D-312 and D-314, 2026-09-23): every holder-facing build carries one manifest public key; the rp id hash the config commits is `sha256("chrome-extension://<id>")`, the full origin string, never the bare id; a Google Password Manager assertion returned a high `s`, so the signature is normalized before a verifier that rejects high `s`; a provider that refuses the extension relying party (1Password did) is its own enrollment note.
- The health-check host serves a third-release feature (D-313); the other three hosts are first release.
- The iPhone hybrid routes were not run by the proof (FR31-IMPL-CHECKS).
