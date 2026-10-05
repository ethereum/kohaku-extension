# Social recovery ux tasks

One file per task, cut from `design-context/spec-v1/cut-provisional.yaml` at `352f91a` of `defi-wonderland/mast-social-recovery-2` (PR #47), which is not copied here. Ids are provisional; the cut was never materialized, so a task is named by id and title together. Bodies are verbatim, with `src/ux/...` rewritten to `src/web/modules/social-recovery/...`. Each file ends with the deltas found against the chapter at `bd8780f`; where a body and the chapter differ, the chapter is the rule.

Round is the half-day in which the task can start, from `depends_on` alone. Within one round every module path is distinct, so a round runs in parallel. The longest chain is eight half-days: PT-035, PT-041, PT-057, PT-058, PT-059, PT-060, PT-061, PT-062. The M-7 tasks (PT-042 to PT-051) wait on the proof of concept D-316 schedules.

| Round | Task | Milestone | Readiness | File |
| --- | --- | --- | --- | --- |
| 0 | PT-035 The SDK doubles | M-6 | risky | [PT-035-the-sdk-doubles.md](PT-035-the-sdk-doubles.md) |
| 0 | PT-036 Display rules and the status vocabulary | M-6 | free | [PT-036-display-rules-and-the-status-vocabulary.md](PT-036-display-rules-and-the-status-vocabulary.md) |
| 0 | PT-037 The rule lines | M-6 | free | [PT-037-the-rule-lines.md](PT-037-the-rule-lines.md) |
| 0 | PT-040 The wallet's records | M-6 | free | [PT-040-the-wallet-s-records.md](PT-040-the-wallet-s-records.md) |
| 0 | PT-075 The recovered key's typed-data signing in the extension | M-8 | blocked | [PT-075-the-recovered-key-s-typed-data-signing-in-the-extension.md](PT-075-the-recovered-key-s-typed-data-signing-in-the-extension.md) |
| 1 | PT-038 The client, the provider and the signer | M-6 | risky | [PT-038-the-client-the-provider-and-the-signer.md](PT-038-the-client-the-provider-and-the-signer.md) |
| 1 | PT-041 The ceremony tab and the method hosts | M-6 | risky | [PT-041-the-ceremony-tab-and-the-method-hosts.md](PT-041-the-ceremony-tab-and-the-method-hosts.md) |
| 1 | PT-043 The presets and the blank start | M-7 | free | [PT-043-the-presets-and-the-blank-start.md](PT-043-the-presets-and-the-blank-start.md) |
| 1 | PT-044 The path editor's operations | M-7 | free | [PT-044-the-path-editor-s-operations.md](PT-044-the-path-editor-s-operations.md) |
| 1 | PT-047 The waiting period and the privacy step | M-7 | blocked in part | [PT-047-the-waiting-period-and-the-privacy-step.md](PT-047-the-waiting-period-and-the-privacy-step.md) |
| 1 | PT-048 The Recovery Card | M-7 | free | [PT-048-the-recovery-card.md](PT-048-the-recovery-card.md) |
| 1 | PT-052 The recover door and the warning gate | M-8 | free | [PT-052-the-recover-door-and-the-warning-gate.md](PT-052-the-recover-door-and-the-warning-gate.md) |
| 2 | PT-039 The shared write states and the gas step | M-6 | free | [PT-039-the-shared-write-states-and-the-gas-step.md](PT-039-the-shared-write-states-and-the-gas-step.md) |
| 2 | PT-042 The create door's picker and the settings entry | M-7 | blocked | [PT-042-the-create-door-s-picker-and-the-settings-entry.md](PT-042-the-create-door-s-picker-and-the-settings-entry.md) |
| 2 | PT-045 The editor's refusals and the rules panel | M-7 | risky | [PT-045-the-editor-s-refusals-and-the-rules-panel.md](PT-045-the-editor-s-refusals-and-the-rules-panel.md) |
| 2 | PT-046 The passkey row and the guardian row | M-7 | risky | [PT-046-the-passkey-row-and-the-guardian-row.md](PT-046-the-passkey-row-and-the-guardian-row.md) |
| 2 | PT-049 The review's lead and its trust list | M-7 | risky | [PT-049-the-review-s-lead-and-its-trust-list.md](PT-049-the-review-s-lead-and-its-trust-list.md) |
| 2 | PT-054 The recovery entry and the account step | M-8 | risky | [PT-054-the-recovery-entry-and-the-account-step.md](PT-054-the-recovery-entry-and-the-account-step.md) |
| 2 | PT-057 The checklist's rows | M-8 | risky | [PT-057-the-checklist-s-rows.md](PT-057-the-checklist-s-rows.md) |
| 2 | PT-063 The approval page's reading | M-9 | risky | [PT-063-the-approval-page-s-reading.md](PT-063-the-approval-page-s-reading.md) |
| 2 | PT-065 The watcher | M-10 | risky | [PT-065-the-watcher.md](PT-065-the-watcher.md) |
| 3 | PT-050 The review's doors, stop block and save gate | M-7 | blocked in part | [PT-050-the-review-s-doors-stop-block-and-save-gate.md](PT-050-the-review-s-doors-stop-block-and-save-gate.md) |
| 3 | PT-053 The fast track's three steps | M-8 | free | [PT-053-the-fast-track-s-three-steps.md](PT-053-the-fast-track-s-three-steps.md) |
| 3 | PT-056 The readout by privacy level | M-8 | blocked in part | [PT-056-the-readout-by-privacy-level.md](PT-056-the-readout-by-privacy-level.md) |
| 3 | PT-058 The guardian row, its message and the paste check | M-8 | blocked | [PT-058-the-guardian-row-its-message-and-the-paste-check.md](PT-058-the-guardian-row-its-message-and-the-paste-check.md) |
| 3 | PT-064 The approval page's signing and reply | M-9 | blocked | [PT-064-the-approval-page-s-signing-and-reply.md](PT-064-the-approval-page-s-signing-and-reply.md) |
| 3 | PT-066 The banner and the owner's cancel | M-10 | free | [PT-066-the-banner-and-the-owner-s-cancel.md](PT-066-the-banner-and-the-owner-s-cancel.md) |
| 3 | PT-067 The overview and the dormant states | M-11 | free | [PT-067-the-overview-and-the-dormant-states.md](PT-067-the-overview-and-the-dormant-states.md) |
| 3 | PT-069 The passport and Aadhaar rows at enrollment | M-12 | risky | [PT-069-the-passport-and-aadhaar-rows-at-enrollment.md](PT-069-the-passport-and-aadhaar-rows-at-enrollment.md) |
| 4 | PT-051 The arming save | M-7 | blocked | [PT-051-the-arming-save.md](PT-051-the-arming-save.md) |
| 4 | PT-055 The running-attempt band | M-10 | free | [PT-055-the-running-attempt-band.md](PT-055-the-running-attempt-band.md) |
| 4 | PT-059 The deadline, the polls and the deaths | M-8 | risky | [PT-059-the-deadline-the-polls-and-the-deaths.md](PT-059-the-deadline-the-polls-and-the-deaths.md) |
| 4 | PT-068 The management editor and the review of changes | M-11 | free | [PT-068-the-management-editor-and-the-review-of-changes.md](PT-068-the-management-editor-and-the-review-of-changes.md) |
| 5 | PT-060 The submission confirmation | M-8 | risky | [PT-060-the-submission-confirmation.md](PT-060-the-submission-confirmation.md) |
| 5 | PT-070 The identity rows at recovery | M-12 | risky | [PT-070-the-identity-rows-at-recovery.md](PT-070-the-identity-rows-at-recovery.md) |
| 6 | PT-061 The wait and its endings | M-8 | free | [PT-061-the-wait-and-its-endings.md](PT-061-the-wait-and-its-endings.md) |
| 7 | PT-062 The done screen | M-8 | free | [PT-062-the-done-screen.md](PT-062-the-done-screen.md) |

## Open questions

Questions the tasks leave open, with the owner of the answer. They are not answered here. The ux owner is @FiboApe; the sdk owner is @0xAaCE.

| # | Tasks | Question | Owner |
| --- | --- | --- | --- |
| 1 | PT-035 | Which interfaces the doubles imitate: the cut lists eight, `sdk.md` D-201 declares twelve, and the builder never hands out `IPolicyManagerInteractor` or `IRecoveryActionArming`; `IMethodModuleReads` and `IRecoveryMethod` are missing from the eight | sdk owner with ux owner |
| 2 | PT-035 | Which commit of `sdk.md` the doubles freeze against, since every TypeScript block is illustrative | sdk owner |
| 3 | PT-047, PT-056, PT-035, PT-048, I-25 | cut-q-23: whether a middle privacy level exists; until then two radios, and I-25 still says three | sdk owner for the level, ux owner for the invariant |
| 4 | PT-050, PT-051, PT-054, PT-058, PT-060 | cut-q-22: the verify per pasted reply, the removed-key read and the fit check on code-to-be, none an SDK member today | sdk owner |
| 5 | PT-050 | The "other doors" privilege read has no SDK member and `sdk.md` declines the list; extension-derived or dropped | sdk owner and ux owner |
| 6 | PT-058, PT-060 | `addApproverReply` shape (typed result with five refusals in `sdk.md` D-207, three thrown errors in D-374) and the nonexistent uncertified-key warning | sdk owner |
| 7 | PT-042 and every M-7 task | The four questions of the proof of concept D-316 schedules; the shipped create flow auto-adds an EOA and never shows the picker | ux owner |
| 8 | PT-051 | Which account-library call prepends the deployment, and whether the SDK fit check accepts a code-less account (FR13-ARMING-BATCH) | sdk owner, design owner confirms |
| 9 | PT-038 | cut-q-7: the addresses of the manager, methods and action on the test network | contracts owner and design owner |
| 10 | PT-047, PT-045 | cut-q-13: the waiting-period numbers of contracts D-107 | contracts owner |
| 11 | PT-064 | Which WalletConnect package, none being a dependency; typed data over MetaMask's port and WalletConnect from an extension origin are untested | ux owner |
| 12 | PT-041, PT-046, PT-057 | The iPhone hybrid routes are untested, 1Password refused the extension relying party, and who normalizes a high `s` | ux owner and sdk owner |
| 13 | PT-041, PT-046 | Which manifest key is "the store listing's", with three extension ids in play today | ux owner with the publisher |
| 14 | PT-036 and every screen | The i18n table as the copy-lint surface: `en.json` holds five keys and the UI uses literals as keys | ux owner |
| 15 | PT-050, 051, 053, 054, 058, 059, 061, 064, 065, 066, 067 | What `check: fuzz, budget: deep` and `check: build` run for the extension; the budgets were Foundry profiles | ux owner |
| 16 | every task | Jest (node, no alias mapper, not run in CI) or Playwright (needs a prod build and secrets) per test seat, and how the persona replay is recorded | ux owner |
| 17 | PT-075 | The file lives in the kohaku-commons submodule; the `recovered-signing-wrapper` vector row has no blessed producer (cut-q-5) | ux owner and sdk owner |
| 18 | PT-041 | Whether the health-check host is built now, for a third-release feature | ux owner |
| 19 | PT-059 | The second-release "watch offer" in its done entry | ux owner |
| 20 | PT-069, PT-070 | Q-22's re-check party and date; the four zkPassport facts `sdk.md` hands to the integrator | sdk owner for the facts, design owner for Q-22 |
| 21 | PT-063 | Which object the page's three chain reads go through, when the builder hands out `IMethodModuleReads` alone | sdk owner |
| 22 | all | The task bodies predate the chapter by three rounds (the cut consumed R-29); the deltas in each file are the reconciliation and need the ux owner's confirmation | ux owner |
| 23 | setup | The setup task that owns the shared files: the interfaces file mirroring D-201, the module folder, routes, string keys, the Jest alias mapper, `.gitmodules` pointed at the fork | ux owner |

## Which sdk task builds each interface

From the same cut, for the doubles of PT-035 and the client layer of PT-038. The sdk milestones are M-3 (the pure core), M-4 (the approving side) and M-5 (the chain-facing parts and clients).

| Interface | Real implementation | Sdk task |
| --- | --- | --- |
| all twelve declarations | `sdk/interfaces` | PT-017 (M-3), value records PT-071 |
| `ISetupClient` | `SetupClient` | PT-025 (M-5); validation PT-021, description PT-073, encryption PT-019 (M-3) |
| `IRecoveryClient` | `RecoveryClient` | PT-026 and PT-074 (M-5); gathering arithmetic PT-020, formats PT-018 and PT-072 (M-3) |
| `IMethodsOrchestrator` | `MethodsOrchestrator` | PT-027 (M-4) |
| `IRecoveryMethod` | wallet, passkey, zkPassport, Aadhaar methods | PT-028, PT-029, PT-031, PT-032 (M-4) |
| `IPolicyManagerInteractor`, `IMethodModuleReads` | `PolicyManager` | PT-022 (M-5) |
| `IRecoveryActionInteractor`, `IRecoveryActionArming`, `IActionCodec` | `AmbireRecoveryAction` and its codec | PT-024 (M-5) |
| `IEventManager` | `EventManager` | PT-023 (M-5) |
| `IProvider` | none in the SDK; the extension's adapter (PT-038) | declared in PT-017 |
| the builder and deployment descriptors (D-208) | `RecoveryKitBuilder` | PT-030 (M-5) |
