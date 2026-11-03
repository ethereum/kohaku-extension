# PT-046 The passkey row and the guardian row

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-7 |
| Round | 2 |
| Module (cut) | `ux/setup/enroll` |
| Module (this repository) | `src/web/modules/social-recovery/setup/enroll/` |
| Size | half-day |
| Risk | medium |
| Risk reason | The guardian row is where a holder reads what a recovery publishes about a friend and where a stored name would leak a contact list, and the passkey row is where they learn which kind they hold. |
| Depends on | PT-038, PT-040, PT-041 |
| Interfaces | `IMethodsOrchestrator` |
| Invariants | I-23 |
| Design refs | D-206, D-302, D-305, D-311, D-312, D-314, D-372 |
| Readiness | risky |
| Mock-first | needs the real thing beyond the doubles |

## Done

Checks:

- check: build

Judgments:

- the passkey row creates the credential through the ceremony tab, offers its access test without enforcing it, records synced or device-bound from the ceremony's flags, and carries the kind line with its loss consequence and the line that the passkey works only from Kohaku in this browser
- the guardian row takes an address with a checksum, an advisory name resolution, a code detection through the extension's provider and a same-seed warning, stores no name, and offers the access test whose challenge the guardian's wallet signs on this device or through the offline block, the row reading not tested until the challenge comes back signed
- every guardian row carries the publication line, the conditional smart account sentence, the call precondition and the ask them first sentence in the words D-305 fixes, and the row renders before the address field the disclosure that a recovery publishes the whole path

## Body

Write `src/web/modules/social-recovery/setup/enroll/`, the enroll sheet and the two rows the demo path enrolls, the passkey and the guardian, D-305. The identity rows are PT-069's in the same lane, after this task.

The passkey row creates the credential through the ceremony tab of PT-041 on this device or through the browser's phone hand-off, offers its access test right after creation which the holder may skip, the row reading not tested until it runs, and records whether the credential is synced or device-bound from the ceremony's flags whatever the holder does with the test. It carries the kind line and its loss consequence, that a device-bound passkey lives only on this device so losing the device removes this method and the path with it where nothing else can recover, and that a synced passkey follows the Apple or Google account that syncs it, survives losing this device, lets whoever holds that account start a recovery and is gone if that account closes. It says the passkey works only from Kohaku in this browser, the relying party of D-314.

The guardian row takes an address with light checks only, a checksum, a name resolution shown as advisory since a resolved name is what the address's owner chose, a code detection through the extension's own provider since the SDK's makes no code read, and the same-seed warning where the wallet holds the seed, this address comes from the same seed as your key, so losing the seed loses both. The wallet stores no name for a guardian, I-23, and renders the address with its blockie or the resolved name under D-302's rules. No signature is demanded at setup, so the row reads not tested, and it offers the access test, a challenge the guardian's wallet signs on this device or through the same offline block the approval page has, the row reading tested once the challenge comes back signed. Every guardian row carries the publication line in its one form, that if a recovery ever uses this guardian their address goes on chain in the clear, that even unused anyone who can guess it can find it, and to ask them first, the conditional sentence that if this address is a smart account whoever controls it can approve for it whatever a test returned, and the call precondition, that a guardian who can call the holder back on a number they already hold completes the check the approval page imposes, stated for the holder to read and refusing no row, D-312. The row renders the disclosure that a recovery publishes the whole path before the address field, and no screen marks the holder's own key as theirs.

## Deltas against the chapter at `bd8780f`

- Same passkey findings as PT-041: full-origin rp id hash, one manifest key, high `s`, refused-provider note. The kind line reads the authenticator's flags and names no platform (D-305, D-372).
- D-314: the passkey screens support Chromium alone in the first release; the copy says the passkey works only from Kohaku on Chrome.
