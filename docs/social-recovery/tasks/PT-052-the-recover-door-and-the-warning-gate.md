# PT-052 The recover door and the warning gate

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-8 |
| Round | 1 |
| Module (cut) | `ux/onboarding/recover` |
| Module (this repository) | `src/web/modules/social-recovery/onboarding/recover/` |
| Size | half-day |
| Risk | medium |
| Risk reason | I-36 is decided here, and an entry that accepts one input before the acknowledgment teaches a holder the act a support scammer asks for. |
| Depends on | PT-036 |
| Interfaces | none |
| Invariants | I-36 |
| Design refs | D-316 |
| Readiness | free |
| Mock-first | completes against the SDK doubles alone |

## Done

Checks:

- check: build

Judgments:

- the welcome screen offers three doors, create a new account, add an existing account and recover an account, and the recover door opens the warning screen whose acknowledgment, nobody claiming to be support asked me to do this, is taken before the fast track accepts any input
- the warning on the recover door carries the one pointer line, if you still have your recovery phrase, import it instead, and the two reset entries the extension already has, the password reset by email and the seed import, open the same warning with no step counter, take their own acknowledgment and carry no pointer line
- the seed keeps its product name recovery phrase and the recovery words are account recovery, recovery path and recovery password

## Body

Write `src/web/modules/social-recovery/onboarding/recover/`, the third door of D-316 and the warning gate every recovery entry of the extension shares. The welcome screen offers the two doors Kohaku has, create a new account and add an existing account, and the recover an account door this chapter adds. The recover door opens the warning screen, which takes the holder's acknowledgment, nobody claiming to be support asked me to do this, before the fast track accepts any input, I-36, and carries one pointer line, if you still have your recovery phrase, import it instead, the owner's ruling of 2026-09-08. The gate is a component the settings entry of PT-054 reuses in its condensed form.

The two reset entries the extension already has, the password reset by email and the seed import, sit behind the same warning. Each opens that warning screen with no step counter, since neither belongs to the fast track's three steps, takes its own acknowledgment and accepts no input until the holder gives it, and neither carries the pointer line, since a holder who opened the seed import is already at the screen the line would send them to. The seed keeps its product name, recovery phrase, and the chapter's recovery words are account recovery, recovery path and recovery password.

## Deltas against the chapter at `bd8780f`

- None found.
