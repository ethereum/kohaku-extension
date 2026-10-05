# PT-048 The Recovery Card

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-7 |
| Round | 1 |
| Module (cut) | `ux/setup/card` |
| Module (this repository) | `src/web/modules/social-recovery/setup/card/` |
| Size | half-day |
| Risk | medium |
| Risk reason | The card is what a fresh device starts from and what a thief photographs, so a seventh thing on it is a phishing map. |
| Depends on | PT-036, PT-040 |
| Interfaces | none |
| Invariants | I-32 |
| Design refs | D-302, D-318 |
| Readiness | free |
| Mock-first | completes against the SDK doubles alone |

## Done

Checks:

- check: build

Judgments:

- the card carries exactly six things, the account address whole with no grouping, the recovery password at the two hidden levels, a short guide to starting recovery on any device, the line that this card alone cannot move funds, the line to keep it away from the device that holds the wallet, and the line that a photograph plus the chain can read the path and still cannot recover
- the card names no method, no guardian address, no threshold and no waiting period
- the password renders hidden with a reveal action, the download offers a file, print and a hand-off to a second device with the line to keep the card off this device, and a re-download asks the extension password

## Body

Write `src/web/modules/social-recovery/setup/card/`, the Recovery Card screen of D-318 that the save of PT-051 routes to and the overview of PT-067 offers. The card carries six things and nothing else, the account address rendered whole with no grouping per D-302 and the owner's ruling of 2026-09-22, the recovery password at the two hidden levels, a short guide to starting recovery on any device, the line that this card alone cannot move funds, the line keep this card away from the device that holds your wallet, and the line that a photograph of this card plus the chain can read the recovery path and still cannot recover. It carries no method, no address of a guardian, no threshold and no waiting period, I-32, so a photographed card alone names nothing to phish. At Public the card carries only the address and its guide.

On the card screen the recovery password renders as a hidden value with a reveal action, so the holder reads back what the card will carry. The download offers a file, print and a hand-off to a second device, says to keep the card off this device, and a re-download asks the extension password. The card's readability is the demo's own concern and this task renders it for print and for the file.

## Deltas against the chapter at `bd8780f`

- Consistent with D-318 and D-312 (2026-09-22, the address whole with no grouping). "The two hidden levels" becomes one hidden level while cut-q-23 stands.
