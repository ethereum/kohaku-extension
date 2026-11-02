# Social recovery board

The state of the work after the QA round's fourth pass of 2026-11-02: three more pull requests merged on `dev/wonderland`, which stands at 36df338ed4 (submodule 211a00f526): #165 FU-BR (the preset copy on the identity methods, from reviewer feedback), #166 FU-BT (Linear EFI-1049, reopened: the paste field's helper line) and #167 FU-BS (Linear EFI-1054: the key a relayed save signed). Every report under Linear EFI-1038 is Done or Canceled. The freeze `dev-wonderland-m12` moves to this board's merge commit on ethereum/kohaku-extension and the fork; ethereum/kohaku-extension#258 follows it.

## The board (the QA round, fourth pass)

| Column | What is in it |
| --- | --- |
| Reviewed | Each PR by a fresh reviewer, every taken finding fixed in a round and confirmed (FU-BR: six Lows, five taken, the card's publication sentence declined since the disclosure sits on the enrollment row and the review step; FU-BT: two Lows in the test file; FU-BS: one Medium, the history refusal missing the "historical state is not available" wording, and two Lows in round 2). The owner's thread on #167 (the refusal's remedy is useless to a recoverer, who has no access to the account) taken as round 3. The independent review pass of 2026-11-02 on #167 (98 of 98 cells; High 0, Medium 2, Low 0): the bare 65-byte unprotected signature taken as round 4; the SDK adapter's single answer declined with evidence and recorded below. CodeRabbit's one thread on #166 (an accessible description linking the helper line to the input) verified and not confirmed: no input in the module or the wallet links a helper line, and the React Native types lack the prop. Every thread answered, none resolved by the coordinator. |
| Merged | On `dev/wonderland`, one squash per PR after a fresh gate with the integration branch merged in, each on the owner's approval and CodeRabbit's: #165 FU-BR 66b35bd076 (gate at f1640ef324: 7862 tests, tsc 499 pre-existing errors and 0 under the module, eslint the one pre-existing error, the sweep 0, the build green), #166 FU-BT 818c71a32b (gate at 8c9f6a374f: 7867 tests, the rest the same), #167 FU-BS 36df338ed4 (gate at 465dc1e2df: 7906 tests, the rest the same). The owner's docs #164 (f1bafde1a2) sits between them. Linear EFI-1049 and EFI-1054 Done with a comment each. |
| Walked | FU-BR on both builds (before 0b55d2e43a, after 5411900bec): the two identity cards show the line after the rule line, the three others do not, the passport lead and the disclosure read as merged; the screenshots went to the owner. FU-BT and FU-BS: the checklist was not reached, since the tester's public account keeps a private setup and its readout asks the recovery password, and no recorded throwaway wallet has a path on the deployment in force; the relayed-save case needs a fresh smart account whose save the relayer sends (a Sepolia send, not made); both PR bodies carry the human walkthrough. The FU-BS recipe was checked read-only on Sepolia against the tester's save transaction: the recovered key is the one whose privilege the creation code wrote. |
| Held | FU-BB, FU-BC and FU-BI as before (the QA round's rows below). |
| Blocked | Nothing. |

## Rulings of the fourth pass (2026-10-30 to 2026-11-02)

- The preset copy says the ID details stay on the device that reads them, on every card with an identity method (reviewer feedback the owner took on 2026-11-02); the publication disclosure stays on the enrollment row and the review step.
- EFI-1054 is the feature's own defect and fixed in `shared/client`: the recovery entry recovers the signing key from the relayed save's own signature. A typed-key field on the account step (the SDK's supplied route) is a design change and stays the owner's question below.
- The refusal for an account whose key cannot be named offers no remedy, since a recoverer has no access to the account (the owner, 2026-11-02).
- EFI-1049's reopened point taken: the guidance moves to a helper line under the paste field and the placeholder is short.
- EFI-1053 (the OS notification's Ambire icon) is the wallet's own notification helper, there before the recovery work; Canceled as pre-existing (the owner, 2026-10-30).
- The editor's no-members message with unenrolled guardian slots, and the Sepolia walk with a smart-account guardian, dismissed by the owner on 2026-10-30.
- #166 merged on the owner's word with CodeRabbit's review recorded as a comment, its one thread answered.

## Open with the owner

| Question | What the code does meanwhile |
| --- | --- |
| A typed-key field on the account step for a recoverer whose key the chain does not name (the SDK's supplied route; a design change) | The entry refuses with the no-remedy text |
| An accessibility pass over the module's helper lines (the lookup hint, the privacy mismatch line, the threshold line, the paste field's lines, the wallet Input's bottom labels), a task of its own | No input links a helper line, as in the wallet |
| The SDK adapter answers the first recovered signer only, so the SDK's own inference can lose a second signer, or the sender where the first signer lost authority; no wallet screen reads that inference (the independent reviewer, 2026-11-02) | The checklist supplies the wallet's named key |
| A Sepolia send (a fresh smart account with a relayed save) to show FU-BS on a real build | The Sepolia read probe and the fake-node tests cover it |

## Facts the next session should not rediscover

- The wallet's relayer sends a first save as the factory's `deployAndExecute`; the signature is the wallet's standard envelope (the typed data of `getSignableHash` with the mode byte 01). The deployed Sepolia implementation accepted it although the submodule's `AmbireAccount.sol` at 211a00f526 checks `execute` against a newer hash.
- An `eth_call` node error reaches the module through ethers as a CALL_EXCEPTION with the node's message under `info.error.message`; the history refusal reads the nested messages, now also "historical state is not available".
- The Colibri prover answers 503 ("must be updated to v3 to verify Glamsterdam blocks"), so a build whose `.env` selects the Colibri provider fails every read; a walk sets the throwaway profile's Sepolia network to unverified. The public node without a key prunes two of three `eth_getLogs` over the 10,000-block range and refuses old state; the readout needed up to 35 retries.
- The gate removes `build/` at its end, so a walk's build is made in the lane worktree after the gate. The gate queue can consume a line and run nothing; start a gate directly when none runs.
- ethereum/kohaku-extension#258's base moved from `dev-wonderland` to `main` on 2026-11-02: `dev-wonderland` was a branch we created from `main` on 2026-09-28, never advanced, still identical to `main` (72922ab25c), and the ethereum team merges every pull request into `main`; the PR keeps its number, comments and head.

---

# Social recovery board

The state of the work after the alpha swap of 2026-11-02: defi-wonderland/kohaku-extension#163 swapped the SDK to the published package `@kohaku-eth/social-recovery@0.0.1-alpha.1` (FU-AN) and merged as 86dba6613c on `dev/wonderland`. The freeze `dev-wonderland-m12` moved to 86dba6613c on ethereum/kohaku-extension and the fork; ethereum/kohaku-extension#258 follows it.

## The board (the published SDK package)

| Column | What is in it |
| --- | --- |
| Reviewed | One implementation round, verified read-only by an independent agent (every item passed; one Low, a docblock line longer than its neighbours, left as is); CodeRabbit approved with no thread; the owner approved. |
| Merged | #163 on `dev/wonderland` at 86dba6613c (2026-11-02, "FU-AN the published SDK package 0.0.1-alpha.1 for the local build"), after the gate on the lane worktree with the npm tarball installed: 7852 tests, tsc 499 pre-existing errors and 0 under the module, eslint the one pre-existing error, the sweep 0, the build green. It carries: `package.json` pins `@kohaku-eth/social-recovery` at 0.0.1-alpha.1 (the placeholder 0.0.1 is gone); `yarn.lock` carries the package's entry, written by hand (the registry's `resolved` and `integrity`, the dependencies `ox ^0.12.0` and `viem ^2.51.3`, the latter resolving to the 2.54.1 copy the repository already holds), because a `yarn install` rewrites this repository's lockfile wholesale; the README's rule on building the package from a local checkout is gone (the package comes from npm at the pinned version and `yarn install` brings it; the manual-test build step says so); the two optional Lows of the SDK-adoption review: the watcher's hook answers the failed state for a stored reading of another deployment whose record carries a `failed` mark, so the banner shows the failure the badge already counted (one hook test), and the `restoreCountdown` docblock names the deployment it keeps a live session for. No code under the module changed for the swap itself. |

## Rulings of the alpha swap (2026-11-02)

- The swap PR carries the two optional Lows.
- #163 merged on the owner's word after his review and CodeRabbit's approval.
- The board PR merges once CodeRabbit approves it.

## Open with the owner

Nothing new; the QA round's rows below stand.

## Open with others

| Question | Owner | What the code does meanwhile |
| --- | --- | --- |
| The review of ethereum/kohaku-commons#81 and ethereum/kohaku-extension#258 | ethereum team | The extension's submodule URL points at the fork |
| The two GitGuardian incidents on #258 | owner (his GitGuardian dashboard) | Nothing |

Nothing is open with the SDK team or the contracts team.

## Recorded, not started

The four rows of the pin section stand: the page-side comparison of the passport reply's circuit version; `ceremony.noMatchCause`; the two identity walks, not needed now by the owner's word; the submodule URL move back after ethereum/kohaku-commons#81.

## Facts the next session should not rediscover

- `@kohaku-eth/social-recovery@0.0.1-alpha.1` was published on 2026-10-30 from ethereum/kohaku#371, which cherry-picked the four `wonderland/dev` commits after alpha.0 (e762781, 1a3b36d, 26519bf, 616efa1) onto master with their five changesets; the "Version Packages (alpha)" PR #372 cut the version.
- A branch merge of `wonderland/dev` into master does not work: ethereum/kohaku#338 landed as a squash, so git sees the package as two independent additions and reports add/add conflicts in 71 files; later `wonderland/dev` commits reach master the same way, by cherry-pick.
- The release's `dist` is byte-identical to the local build of `wonderland/dev` at 616efa1, both entries carry the `default` export condition, and the peers are `@anon-aadhaar/core` 2.4.3 and `@zkpassport/sdk` 0.17.1 (the versions the repository pins).
- Every name the module imports (179 from the core entry, 18 from `recovery-methods`, across 398 files at 0b55d2e43a) exists in the release's declarations; `CreationRecord` is absent, as intended, since the extension owns that type.
- The shared install of the lanes (the `chore-social-recovery-setup` worktree's `node_modules`) now holds the npm tarball of 0.0.1-alpha.1; a lane that links it tests against the published package.

---

The state of the work after the SDK pin move of 2026-10-29: defi-wonderland/kohaku-extension#153 moved the SDK pin to the fork's `wonderland/dev` 616efa1, adopted the identity methods' dev and test modes and committed the Sepolia deployment, and merged as 191bd8dccc on `dev/wonderland`. The freeze `dev-wonderland-m12` moved to 191bd8dccc on ethereum/kohaku-extension and the fork; ethereum/kohaku-extension#258 follows it.

## The board (the SDK pin at 616efa1)

| Column | What is in it |
| --- | --- |
| Walked | No identity walk on the committed deployment: the owner's word of 2026-10-29 ("no need for the walks"); the README's "Manual test on Sepolia" section is how the two walks run. |
| Reviewed | Five implementation rounds, each verified read-only by an independent agent; the owner's review and approval; CodeRabbit's three threads and the independent reviewer's one Low (its body: 12 of 14 applicable cells walked, no High, no Medium), all four verified, confirmed and fixed. |
| Merged | #153 on `dev/wonderland` at 191bd8dccc (2026-10-29, "move the SDK pin to 616efa1, adopt its dev and test modes, and commit the Sepolia deployment"), after the merge gate on the lane with the QA round merged in: 293 suites, 7778 tests, tsc 499 pre-existing errors and 0 under the module, eslint the one pre-existing error, the sweep 0, the build green. It carries: the SDK pin at 616efa1 (after 08480f5: c3cf8dd the dev and test modes of the identity methods, e762781 the extension follow-ups, 1a3b36d the digest place as uint256 and `ClientConfiguration.creation` dropped, 26519bf the Aadhaar artifacts from the bucket by default and `credential.config-malformed`, 616efa1 the ordering verdict and `SetupDescription.action`); the zkPassport factory's `devMode` from the chain's testnet-tree fact; `cancel()` on the SDK's request record; the deployment-line field `aadhaarTestMode`; `account.not-deployed` and `credential.config-malformed` with their sentences in the editor's refusals (an undeployed account whose implementation-to-be does not fit reads as unsupported, never "deploy first"); the Jest module mapper for the package gone (the package's `default` export condition); the scripted Aadhaar stack's `signedAt`, so a stale QR is refused before proving; the committed Sepolia deployment (`shared/client/deployments-sepolia.ts`); the README's "Manual test on Sepolia" section with everything a tester needs for the two identity walks; `docs/social-recovery/manual-test/gen-test-qr.js`. |

## Rulings of the pin move (2026-10-29)

- The Sepolia deployment is committed in the table ("I don't care about previous users").
- The README carries everything for the walks in #153; no second PR.
- No identity walk is needed now ("no need for the walks").
- The planned rows FU-AP, FU-AQ, FU-AR and FU-AS are dismissed.
- FU-AB, FU-AL and FU-AO are done and FU-M is moot; a read-only verifier confirmed each against the code at 121d2dee43: the recoverer's record and the row notes exist in `shared/records`; the submission in flight is kept on the live session with its request id, start block and hash and dropped by a new gathering, every wipe and the landing; the SDK at 08480f5 already encodes the attempt id and the setup nonce and part E's removal landed with the two-argument form; the privilege replay finds the creation block itself and no create-door badge exists.

## Open with the owner

Nothing new; the QA round's rows below stand.

## Open with others

| Question | Owner | What the code does meanwhile |
| --- | --- | --- |
| The review of ethereum/kohaku-commons#81 and ethereum/kohaku-extension#258 | ethereum team | The extension's submodule URL points at the fork |
| The two GitGuardian incidents on #258 | owner (his GitGuardian dashboard) | Nothing |
| An alpha.1 of `@kohaku-eth/social-recovery` from `wonderland/dev` (the ask of 2026-10-29: merge `wonderland/dev` into master so the changesets cut alpha.1) | sdk team | Done: alpha.1 published 2026-10-30 from ethereum/kohaku#371 (cherry-picks, since #338 was a squash); FU-AN swapped to it in #163 |

Nothing is open with the contracts team: the key move and the deployment are done.

## Recorded, not started

- The page-side comparison of the passport reply's circuit version with the module's trusted key (the SDK's `zkPassportVersionOf` is there).
- `ceremony.noMatchCause` has no caller until the SDK gives a separate mismatch cause.
- The two identity walks on the committed deployment: not needed now by the owner's word; the README is how they run.
- The submodule URL move back to ethereum/kohaku-commons after ethereum/kohaku-commons#81 merges.

## Facts the next session should not rediscover

- The committed Sepolia deployment (`shared/client/deployments-sepolia.ts`) holds the six contracts of ethereum/kohaku-contracts#15 (deployed 2026-10-29, the zkPassport method's trusted keys at circuit 0.21.1, the Aadhaar method trusting UIDAI's current "DS UIDAI 06" key; read back from the chain the same day; the manager at block 12019037, version 1.0.0, typed-data domain version 1) and this wallet's own identity parameters (the zkPassport domain `social-recovery.kohaku.test` and scope `kohaku-social-recovery` on the testnet certificate tree, the Aadhaar nullifier seed 11155111, the DS UIDAI 06 certificate whose public-key hash a unit test checks against the module's key).
- A build with no variable runs Sepolia on the committed deployment and mainnet on the stand-in; the variable `SOCIAL_RECOVERY_SEPOLIA_DEPLOYMENT` is an override, and the `.env-sample` and the README say an empty variable means the committed deployment.
- The contracts team moved the zkPassport route to 0.21.1 in ethereum/kohaku-contracts (its #6) and deployed Sepolia again (#15, every address new, the implementation unchanged). The record ships no test-only Aadhaar module; the 2026-10-21 test-only module is standalone, and a test build names it through the override variable with `aadhaarTestMode: true`. Every setup of the earlier walks lives on a retired manager.
- `docs/social-recovery/manual-test/gen-test-qr.js` turns the official UIDAI V1 sample into a fresh V2 code signed with Anon Aadhaar's public test key pair, taken by path, with one fixed other identity for the mismatch test. The previous fixture through the peer's helper made codes the circuit refuses (a double `V2` prefix), which walk B had hit on 2026-10-22; CodeRabbit found it again and it is fixed.
- The peer `@anon-aadhaar/core` 2.4.3 knows UIDAI's 2021 key only, so a real QR signed by the current key reads `not-judged` locally and the chain decides; the SDK's local verdict is `satisfied` only in test mode with a test QR.
- The SDK release `@kohaku-eth/social-recovery@0.0.1-alpha.0` (ethereum/kohaku master 3f5960b, 2026-10-28) is the tree of `wonderland/dev` 4e3cc94, before e762781: no `default` export condition, no `account.not-deployed`, no `signedAt`, no `zkPassportVersionOf`, the `METHOD_AADHAAR_*` constants on the core entry only, and the Aadhaar local check still refusing a real QR signed by UIDAI's current key. Alpha.1 (2026-10-30) carries them, and FU-AN swapped to it (#163, 2026-11-02).
- Of the nine items sent to the SDK team on 2026-10-26: 1, 2, 3, 4, 6 (the decoder `zkPassportVersionOf`; the page-side comparison is ours) and 8 landed in c3cf8dd and e762781; 5 (a separate mismatch cause; the timestamp check before the prover, which e762781 gave through `signedAt`) half; 7 upstream with zkPassport; 9 answered by alpha.0 without EXT-1.

---

The state of the work after the QA round of 2026-10-27, which followed milestone M-12 (delivered 2026-10-23, frozen as `dev-wonderland-m12` at b51e7f0498, the upstream draft ethereum/kohaku-extension#258). The QA team's nine findings (Linear EFI-1038, EFI-1039 to EFI-1047, plus EFI-1048 filed during the round) each became a follow-up task, FU-BB to FU-BK, with one pull request per finding against `dev/wonderland` (515da91b1c at the round's start). The round's log, briefs, investigations, reviews and the walk report live in the coordinator's worktree `.claude/worktrees/social-recovery-bugs-0e439b` under `docs/social-recovery/briefs/qa/`.

## The board (the QA round)

| Column | What is in it |
| --- | --- |
| Merged (round 3) | #161 FU-BQ ea99530470 on `dev/wonderland` (2026-10-30), squashed on the owner's approval after the gate at 4c282259f9 (the integration branch unchanged since it at 5353fc4b80: 7851 tests, tsc 499 pre-existing errors and 0 under the module, eslint the one pre-existing error, the sweep 0, the build green): EFI-1052's two taken items in one PR, every loading line of the module in the primary text colour through the shared loading block, and five inputs with a placeholder read by key (the guardian address field "Address or ENS name", the account lookup "Address or ENS name of the account", the recovery password on the recovery entry, the Recovery Card and the management overview's locked path "Recovery password"; the fifth input came from the fresh review). Reviewed by a fresh reviewer (no High, no Medium, two Lows fixed in a round and confirmed) and approved by CodeRabbit and the owner; walked on the build over a real Sepolia read (three loading lines measured in the primary colour, the two address placeholders shown; the two password fields need a setup saved on the deployment in force and are covered by their unit tests). The submodule stays at 211a00f526. Linear EFI-1052 Done. |
| Merged (round 2) | The train of 2026-10-29 (21:12 to 21:35 UTC) on `dev/wonderland`, one squash per PR after a fresh gate with the integration branch merged in, after the owner's approval of each PR and the SDK pin move (#153): #155 FU-BN 1e34f353da (EFI-1049: the paste field says any guardian's approval can go there and a cross-row paste says where it counted; the matching by signer is the design), #156 FU-BM bd17a55ed5 (the owner's two rulings on the review pass's small items: the import scan goes on past a page used only through its smart account or key, and one helper reads the listed account's kind in the five screens), #157 FU-BP 2e3f7a221b (EFI-1051: the recoverer's band on both views of main-dashboard and in the popup, one mount line in the dashboard's page area on the attempt banner's precedent, the band capped at the content width), #158 FU-BO fcdd88cb13 (EFI-1050, the owner's option A: a deployed smart-account guardian this wallet controls signs on the approval page, the answer checked by the account's ERC-1271 with a bounded read, an undeployed one refused with the reason; a Sepolia read probe at block 12020183 proved the wallet's standard envelope passes the account's check). Each reviewed by a fresh reviewer with every finding taken and confirmed; the independent review pass of 2026-10-29 (High 0 everywhere, one Low on #155 and one on #158, both confirmed and fixed in a round) and CodeRabbit's threads (two on #155 and one on #158 verified and not confirmed, three on #159 taken) answered on every thread. `dev/wonderland` at fcdd88cb13 with the submodule at 211a00f526. Linear EFI-1049, EFI-1050 and EFI-1051 Done. |
| Held | FU-BB (EFI-1039 the scrollbar in the password form), FU-BC (EFI-1040 the Ambire terms), FU-BI (EFI-1046 the Ambire uninstall survey): pre-existing wallet behaviour outside the recovery work on the owner's rule of 2026-10-27; EFI-1039, EFI-1040 and EFI-1046 canceled in Linear; the three lanes are gated and kept locally. |
| Blocked | The Sepolia checks that need a send: FU-BF's deposit of the asked amount then Continue, and the sign window's fee against the module's estimate. |
| Walked | The consolidated branch `qa/consolidated` (faab32c966, the two commons lanes merged in its submodule) on the headless build over the fake node: FU-BD (the rows, the heights, the one-column wrap near 480 px), FU-BF (the blocker's strings), FU-BE (the refusal at step 1 and on a typed save route), FU-BH's entry read, FU-BJ (with one Kohaku tab the import lists and restores the smart account and its key; with a second tab the known onboarding race finishes the picker early and the stored-seed add restores them). The same branch built with the Sepolia deployment in force, walked on a throwaway profile with a standing setup and no send (2026-10-27, `briefs/qa/investigations/WALK-SEPOLIA-REPORT.md`): FU-BG's Reject reaches the failed state in about 0.2 s against about 3.1 s on the pre-fix background, twice, with the cross-icon close at about 6.2 s as expected; FU-BH's "Already set up" block on the setup route after the connecting and lookup lines, with no counter, presets, resume card or chip, and "Open your recovery path" into the overview; the basic key's refusal as on the fake node. The results are in #148's and #149's descriptions. |
| Reviewed | The independent review pass of 2026-10-27 on the eight PRs (High 0 everywhere; one Medium on #147, one on kohaku-commons#13) and CodeRabbit's seven threads: nine threads verified read-only, four confirmed and fixed in rounds (#147 round 3, kohaku-commons#13 round 2 with #148's pointer, #151's copy), five answered as not confirmed or pre-existing; every thread has its reply and none is resolved by the coordinator. |
| Merged | The train of 2026-10-28 (02:15 to 02:58 UTC) on `dev/wonderland`, one squash per PR after a fresh gate with the integration branch merged in: #145 FU-BD c6ef5e8d5c, #146 FU-BF d55d449071, #147 FU-BE 5365b0936f (four rounds), #149 FU-BH 118334afa4 (stacked; its five files resolved by the train rule), kohaku-commons#13 ad49c956d8 then #148 FU-BG 4437ba2eee, kohaku-commons#14 211a00f526 then #150 FU-BJ bb460dfda9, #151 FU-BK 4d6ee99b19, #154 FU-BL 928e148fb5. `dev/wonderland` at 928e148fb5 with the submodule at 211a00f526 (both commons changes). Linear EFI-1041 to EFI-1045, EFI-1047 and EFI-1048 Done. |

## Rulings of the third item (2026-10-29)

- EFI-1052: the sidebar's grey items and the logo's contrast are the wallet's own screens, there before the recovery work, and dismissed; the loaders and the placeholders taken in one PR (FU-BQ).

## Rulings of round 2 (2026-10-29)

- The two small items of the review pass fixed in one PR: the scan's advance rule and the shared listed-account helper (FU-BM); the theoretical stored-save Low and the outside-setup EOA edge dismissed.
- EFI-1050: option A, the chapter's promise for a deployed smart account (it signs through its own wallet on the approval page); a counterfactual smart-account guardian cannot approve in this release, a limit of the implementation rather than of the versioned contract design: ERC-1271 needs code at the address, and the SDK reads the guardian's code flag once when the recovery starts, so the page refuses it with the reason and the paste repair says the request must be started again.
- The one mount line of the recoverer's band in the main-dashboard page area follows the owner's precedent for the attempt banner (M-10).
- The module's status lines keep no live region (CodeRabbit's point on #155's paste notice): no status line of the module or the wallet declares one, and the convention stays as it is.
- Recorded, pre-existing: the recoverer's band reads storage at mount only, so an ended session's line stays until a remount; a cross-row paste that completes the guardian group turns the pasted-into row to "Not needed" with no line.

## Rulings of the round (2026-10-27)

- A finding in wallet behaviour that was there before the social recovery work is kept as it was and its report dismissed (the terms, the uninstall URL; the scrollbar awaits the owner's word).
- FU-BJ option 1: the seed import lists the slot's smart account and its controlling key as the create door does, since the holder must get back the account they used for funding; the chapter's "the import door is unchanged" (D-316) is lifted for the seed import.
- The coordinator's decisions approved: Customize beside Continue under the cards at the regular height (the chapter's "above the grid" line amended); the basic account refused at step 1 with the existing cannot-recover block and the gate's cannot-recover verdicts before the unreadable removed key; the gas step's two headrooms (asked 50 %, pass 10 %) with "at least" and the fee note; the commons records the user-rejected request ids and the port fails at once when nothing signed; step 1 blocks an account with a setup and keeps the presets for an authorized account with no setup.
- The owner's word of 2026-10-27 for the commons push of FU-BG (kohaku-commons#13).

## Open with the owner

| Question | What the code does meanwhile |
| --- | --- |
| A Sepolia deposit of the asked amount then Continue for FU-BF's full path, and the sign window's fee against the module's estimate (the owner, 2026-10-27: skipped; the unit tests cover both; his manual test may run one send) | Unit tests cover it |
| The cross-icon close of the action window still takes about 6 s (the wallet keeps a calls request on a window close; the owner, 2026-10-27: keep it) | As before |
| The done screen's question "did you lose a device" (option (b) of FU-BK) would lift D-393's unconditional block and touch the ruling that defers the question to the cleanup release (the owner, 2026-10-27: the copy hedge stays; the question is a design item of the cleanup release) | The copy hedge of FU-BK |
| The import's independent switches (a key switched off goes to the keystore with no account row), the stored-seed add now able to remove imported smart-account rows, and the one-smart-account-per-page rule (a smart account at slot 2 to 5 is restored only through the relayer's linked search) | As built by FU-BJ |
| The create door's one-time relayer failure with no message, and the two-tab onboarding race that finishes the import picker early (upstream) | Recorded |
| The About screen's Ambire social links, the help.ambire.com links across the wallet, the explorer link, the Trezor manifest; kohaku.xyz is a parked domain | Pre-existing; recorded |

## Open with others

| Question | Owner | What the code does meanwhile |
| --- | --- | --- |
| The eight upstream PRs: ethereum/kohaku-commons#81 first, then ethereum/kohaku-extension #251, #253, #254, #255, #256, #257, #258 in order | ethereum team | The extension's submodule URL points at the fork |
| The zkPassport method's Safe moves its trusted keys to circuit 0.21.1 (part C; passed by the owner on 2026-10-23) | contracts team | Done 2026-10-29: the contracts team deployed Sepolia again at 0.21.1 (ethereum/kohaku-contracts#15) |
| A standing watch on zkPassport's registry root on both chains (zkPassport ships circuits about monthly; each release blocks the passport method until the Safe moves) | contracts team | Nothing; the check runs before a deployment only |
| A repeat chain read of the Aadhaar modules' trusted keys and the zkPassport method's accepted version before the showcase (the owner took the showcase date off his list on 2026-10-26; the read stays with the contracts team) | contracts team | Done: read 2026-10-29 |
| 1. `onResult`, `onBridgeConnect`, `onBridgeConnectionLost` and a cancel declared on `ZkPassportRequest` | sdk team | Landed in c3cf8dd and e762781; `cancel()` on the SDK's request record since #153 |
| 2. A `devMode` option on `zkPassportMethod` and a test-mode option on `anonAadhaarMethod`, one later task | sdk team | Landed in c3cf8dd and e762781; the zkPassport factory's `devMode` from the chain's testnet-tree fact and the deployment-line field `aadhaarTestMode` since #153 |
| 3. The `METHOD_AADHAAR_*` constants exported from the `recovery-methods` entry | sdk team | Landed in c3cf8dd and e762781 |
| 4. `validateSetup` refuses a counterfactual account with its own cause | sdk team | Landed in c3cf8dd and e762781; `account.not-deployed` in the editor's refusals since #153 |
| 5. A distinct cause for an Aadhaar nullifier mismatch, and the timestamp check before the prover | sdk team | Half: the timestamp check before the prover landed in e762781 through `signedAt`, so a stale QR is refused before proving; the separate mismatch cause is still open and `ceremony.noMatchCause` waits unused |
| 6. The proof's circuit version on the reply or the material, and a decoder of the accepted version, or a typed unsupported-version refusal | sdk team | Landed in c3cf8dd and e762781 (the decoder `zkPassportVersionOf`); the page-side comparison is ours, recorded, not started |
| 7. The peer's bridge refuses a second handshake by a reference comparison (to report upstream), and the SDK subscribes the bridge's error | sdk team | Upstream with zkPassport; the wait ends 180 s after the handshake with retry; the scan-once line |
| 8. A `default` condition on both entries of the exports map | sdk team | Landed in c3cf8dd and e762781; the Jest module mapper for the package gone since #153 |
| 9. The publish of 0.0.2-alpha.0 from `wonderland/dev` at 08480f5, with a date | sdk team | Answered by alpha.0 (2026-10-28) without EXT-1; the pin at 616efa1; the alpha swap (FU-AN) waits for an alpha that carries `wonderland/dev`; alpha.1 of 2026-10-30 carries EXT-1, and FU-AN swapped to it in #163 |
| The part C rerun after the Safe move (the access test, the save, the claim, the submission and the execution with a real passport; whether a testnet-tree request passes the Sepolia verifier) | sdk owner | Closed by the owner's word of 2026-10-29 (no walks) |
| The freeze `dev-wonderland-m12` (at b51e7f0498) and ethereum/kohaku-commons#81 (at c163fd9fb2) moved to the new heads, aca263344b and 5cf1d8d9f6 | owner | Done: `dev-wonderland-m12` at 191bd8dccc (2026-10-29); ethereum/kohaku-commons#81's head `dev-wonderland` at 211a00f526, which equals the fork's current commons head (the pointer `dev/wonderland` carries), so the commons part is moved too; its review by the ethereum team stays open (the first row) |

## Recorded, not started

- `ceremony.noMatchCause` has no caller until the SDK gives a separate mismatch cause (item 5 of the SDK message).
- The version comparison before the verify view call, once the SDK exposes the proof's version and the accepted one (item 6 of the SDK message).
- Two passkeys of one path on one device collide.
- The walks' Lows as designed: a Tested row keeps "Access test / Recommended" with no passed note (part B); the waiting-period chips stay in hours in a build with the minutes floor (part B); a 5-minute test wait ends between the watcher's 30-minute polls, so the band does not show (part B).
- A brand-new session already past its deadline at its first mount can ask one extra chain read whose answer is dropped.
- The submit and wait screens do not refuse a same-account entry (the checklist refuses it first).
- A removal keeps an unset group's threshold at the member count until the next add or move.
- The guardian row test's "no owner answer" half rests on the exact-text checks before and after Add, which do not run after the test.
- The same retry-on-refusal pattern on the wait, submit and cancel screens.
- The destination reads still run in the background on the same-account refusal.
- The submodule URL move back to ethereum/kohaku-commons, in a setup PR once ethereum/kohaku-commons#81 merges.

## Facts the next session should not rediscover

- The SDK proves a stale Aadhaar QR before it refuses it (the freshness check runs after the proving step).
- The Aadhaar artifacts download in about 42 s per profile (under a second once cached); a proof takes 15 to 18 s; the chain's verify view under a second.
- A zkPassport circuit release blocks every passport test and recovery until the method's Safe moves the trusted keys; committed configs name no version, so an enrolled passport keeps working after the move with no rebuild.
- The zkPassport app proves with the latest circuits whatever SDK version made the request.
- The per-page fake node empties on a reload; a walk that reloads re-seeds it by hand and can read a landed save as a mismatch.
- A rebase can mis-merge an import line with no conflict marker; the restack rounds run tsc before the hand-back.
- A cleanup removes a walk worktree's `.env`; keep a copy of the walk's deployment line in the notes folder at mode 600 before a cleanup.
- Since 2026-10-23 the Tenderly gateway does not answer a TCP connect from this Mac. The public Sepolia node prunes the manager's logs (code 4444), so the editor's Continue fails; drpc caps a log range at 10,000 blocks, 1rpc and nodies at 50; Alchemy serves the full range.
- The wallet's Add RPC form checks the node through the background, which waits on a dead node; a walk sets the node by a storage write.
- A removal on Sepolia costs about 77,371 gas.
- A Chromium profile copied for a walk keeps its `Default/Service Worker` cache, and the extension runs the old background from it although the preferences name the new build; a walk that reuses a profile on a new build clears that folder first, or it measures the old code.
- The Tenderly gateway of the walks' credentials file still does not answer from this Mac on 2026-10-27; Alchemy with the worktree's own key does.
- The gate times out under a machine load (other suites or another worktree's export beside it); a red gate under load is rerun alone before it is read as a defect.
- In React 18.3 a child's passive effects run before its parent's, so a ref a child reads at mount is written in a layout effect.
- The permission classifier refuses the train script's merge ("Merge Without Review"); the owner runs it from his terminal, or the one `gh pr merge --squash` runs alone on his word.
- CodeRabbit cannot approve on the fork (no write permission); its pass with no new thread is the approval.

## The board (the SDK adoption)

| Column | What is in it |
| --- | --- |
| Ready | M-12 delivered; the alpha swap (FU-AN) done in #163 (2026-11-02); the follow-ups recorded below. |
| Running | Nothing. |
| Awaiting review | This board's docs PR (`docs/social-recovery-sdk-adoption`). |
| Blocked | Nothing: FU-AO was done by the SDK pin at 08480f5 in #137 and confirmed on Sepolia by part E on 2026-10-23 (the rulings of 2026-10-29). |
| Walked | Part A twice on the headless build over the fake node (the passkey enrollment, the approval page's key and the fake node's attempt wait found and fixed; the per-page node and the watcher's need of a deployment recorded) and part B on Sepolia on the 2026-10-20 deployment (the setup, the waiting-period edit, the attempt's start from a second wallet with the guardian's reply verified locally, the 10-minute wait, the execution and the done screen; the holder's notice, band and watcher banner; four transactions signed by the owner; two High findings fixed in round 9, B3 built as FU-AM). Part C on the fake node for FU-AM (the terminal state with and without the watcher's ending, the editor gates, the transaction link, the moved-keys notice; one Medium fixed in round 4). |
| Merged | #130 the SDK adoption on `dev/wonderland` at 226dcf1437 (2026-10-21, one train after the owner's approval): the extension imports `@kohaku-eth/social-recovery` (the builder, the policy manager, the action, the event manager, the setup and recovery clients, the methods orchestrator, the backup, the revert decoder) and deletes `sdk-interfaces/`, `sdk-doubles/` and `shared/client/kit/`; the host adapters, the records and the screens stay; a fake node implementing the SDK's provider interface serves the build with no deployment and the unit tests; viem 2.54.1; ten rounds, three independent-review passes (ten threads, all fixed or ruled), the CodeRabbit review waived (542 files over its limit). #131 FU-AM on `dev/wonderland` at daddc48eeb (2026-10-21, one train after #130): the overview's terminal state after an executed recovery, the editor gated behind it, the consume transaction's hash on the watcher's ending; five rounds, verified, gated, walked on the fake node (part C); CodeRabbit approved; the independent review's one Medium (the open overview did not re-read on the watcher's ending or a tab return) fixed in round 5. |

## Rulings of the SDK adoption (2026-10-20 and 2026-10-21)

- The dependency: the real package over a scripted provider and a scripted signer; no SDK class is doubled (a very simple mock of the methods one test needs is allowed); the alpha publish asked of the SDK team for later, the placeholder version 0.0.1 and a README note on the local build until then.
- The fake node lives in production code (`shared/client/scripted`) behind the absent deployment and serves the unit tests; it implements the provider interface only.
- The backup format is the SDK's (2,501 bytes, no salt) with no reader for the extension's earlier format; every setup saved before sits on the retired deployment.
- No kohaku-commons change: the library's kit slot and binding formulas equal the SDK's, so the sign screen's exemptions match the SDK's batches.
- The viem bump and the Jest shape for the ESM-only package ride the one PR (the lockfile entries by hand).
- The walk on the memory file's wallets; the keyed gateway kept; no split of the PR.
- The review passes: a module verify that reverts stays a rejection, as the contract reads it; the wait, done and submit harnesses keep their bare method mocks; a lowered setup nonce or attempt counter is a failed poll with a record floor; records a device wrote under one deployment are never read as another deployment's (the floors, the resumes and the readers scope by the manager and the action); a thrown storage read fails a read, never reads as absence.
- B3 of the Sepolia walk (the former holder's overview after an executed recovery) built as FU-AM with three rulings: control reads as moved only where the last attempt is consumed and no key this wallet's keystore holds is an authority; the banner's "It is me" dismissal stays as built; the "See the transaction" link ships with the consume hash on the watcher's ending.

## Open with others

| Question | Owner | What the code does meanwhile |
| --- | --- | --- |
| The attempt-id ABI of `cancelByOwner` and `clearSetup` and its schedule (asked 2026-10-20) | sdk owner | The owner's cancel, the clear and the removal revert on Sepolia; the screens show the reverted state |
| The npm alpha publish with a `default` export condition, the viem range note | sdk owner | Published as alpha.1 on 2026-10-30 with the `default` condition and `viem ^2.51.3`; swapped in #163 |
| The pin move's schedule, the parameter order of `PolicyManager_ActionDoesNotServeAccount`, `logChunkSize`'s default | sdk owner | The SDK's values at 479252c |

## Recorded, not started

The follow-ups of the walks and the review passes, as rows FU-AN to FU-AS of the tasks README. Lows recorded in #130: the sign window names only the arming call beside a commit; "Submitting" shows while the sign window waits; the wallet opens its transaction tab after a send (upstream); the cancel screen's Go back lands on the dashboard; the entry's Continue gives no hint while no account is picked; a foreign watcher reading with a failed mark reads as not polled on the banner until the next good poll; two docblocks. Lows recorded in #131: the gated screens draw their title and lead for one read before the gate sends the reader back; the link carries no arrow glyph; the ended notice in the terminal state was not staged.

---

The state of the work at the end of milestone M-11 round 1 (the management overview and the management editor), 2026-10-20; M-11 started from `dev/wonderland` 3d9f1b7477 (M-10 round 1, the board, the design-text edits, the M-10 follow-ups). This milestone's log is `briefs/m11/LOG.md` beside its briefs in the coordinator's worktree (`.claude/worktrees/social-recovery-m11-overview-7dcee1`); the M-10 log stays in the M-10 coordinator's worktree under `briefs/m10/LOG.md`.

## The board (M-11 round 1)

| Column | What is in it |
| --- | --- |
| Ready | The next milestone on the owner's word; the SDK-types adoption task once scheduled; the follow-ups recorded below. |
| Running | Nothing. |
| Awaiting review | This board's docs PR (`docs/social-recovery-m11`). Upstream: the freeze `dev-wonderland-m11` at 267acb65c1 is pushed to ethereum/kohaku-extension and the fork, and ethereum/kohaku-extension#257 (M-11) is open as a draft on `dev-wonderland-m10`; #251 to #257 are drafts the owner marks ready and merges in order. |
| Blocked | Nothing. |
| Walked | Part A twice on the doubles (the save gate High found and fixed; the removal's endings and the stored-write blocks reached through the chain double) and part B on Sepolia (the overview, the ended-attempt notice of attempt 4, the signed edit through gas check, submitting, saved; the removal screen; the chain's nonce). Not reached: the sending's rejected and reverted states; the dormant and mirror states on the real chain. |
| Merged | M-11 round 1 on `dev/wonderland` at 267acb65c1 (2026-10-20, one train): #126 the setup (2174b0f510, eight rounds), #127 PT-067 (080b11e77c, nine rounds), #128 PT-068 (267acb65c1, sixteen rounds); kohaku-commons#11 (c163fd9fb2) under them. Two review passes (Astra and CodeRabbit) and the owner's comments answered on every thread; three screen walks (`briefs/m11/walk/a`, `b`, `c`), the last on Sepolia with the owner's signed waiting-period edit (the SETUP2 setup's nonce 1 to 2). The final tree equals the last gated lane's. |

## Rulings of M-11 (2026-10-19)

- The round plan's five recommendations: the library's revoke exemption as a kohaku-commons PR (kohaku-commons#11) with the pointer bump in the setup PR; the settings sidebar's "Account recovery" opens the overview, whose empty state leads into the presets; the editor composed from the setup editor's exported pieces with maximum reuse (small optional props on the setup editor's view where needed); the ended-attempt notice in PT-067; the walk read only on Sepolia, the dormant states on the doubles.
- No re-read of the setup state before the removal's send: the removal removes whatever stands (concurrent use is not expected).
- The editor's save is refused while the setup is dormant and a recovery is in progress, since the save is the re-commit I-42 refuses; the removal is not affected.
- A 1-of-1 group's member is not held as still needed; empty slots are never marked.
- The doubles' `prepareClearSetup` is the manager's clear alone, as the chapter says (applied as a conformance fix).
- The owner's four calls of 2026-10-20: the moved-keys notice ships without a test action; a committed row reads live in the editor (built); the row the path still needs offers one tap that lowers the threshold and removes (built); the security stop block stays absent from both reviews.
- The review pass rulings: fixes ride the same pull request, strings included; a management write never follows a plain save; the kept recovery password follows the write that landed; the attempt is read again right before every management send.

## Open with others

| Question | Owner | What the code does meanwhile |
| --- | --- | --- |
| The deployed method ABI's `TrustedKeysUpdated` event | sdk owner | The kit decodes none; the moved-keys notice runs on the doubles only |
| The parameter order of `PolicyManager_ActionDoesNotServeAccount`, the shape of `ISignerRecovery`, the pin move to a5f86fa | sdk owner | Stand-ins |

## Recorded, not started

The follow-ups of the review passes and the walks, none blocking: the arm's re-read acts on an unread check only (the editor re-reads a disagreed removal itself); the save screen's block for a failed read of the stored write has no title; the cache check's second state read is not counted toward the three-disagreement bound; a 3-of-3 group needs two taps to reach 1-of-2; the runtime verdict list sits in the records' types file (pre-existing); the card's lost-password link opens the setup privacy stage; the review's "another device changed this setup" words also cover this device's other tab; the review reads Submitting while the sign window waits; the wallet opens its transaction tab after a send (upstream). The notices read spans from the setup's commit block to the head on every open (a later lane carries the scanned block in a record); the edit's gate for an edit that adds no member lists the setup gate's required reads itself; the doubles client reads logs from block 0 through the real node and refuses a clear backup (doubles-only effects seen in the walk); the Recovery Card opened from the overview keeps the setup flow's counter and Continue; "What changes" lists members as counts.

---

# Social recovery board

The state of the work at the end of milestone M-10 round 1 (the watcher, the banner and the owner's cancel, the running-attempt band), 2026-10-16; M-10 started from `dev/wonderland` cf4f8facfe (M-9 round 1, the board, FU-AT, FU-AU, FU-AV). This milestone's log is `briefs/m10/LOG.md` beside its briefs in the coordinator's worktree; the M-9 log stays in the M-9 coordinator's worktree under `briefs/m9/LOG.md`.

## The board (M-10 round 1)

| Column | What is in it |
| --- | --- |
| Ready | The next milestone on the owner's word; the follow-ups below and the SDK-types adoption task once scheduled. |
| Running | Nothing. |
| Awaiting review | #124 this board with the design-text edits of the SDK reply and the rulings (`docs/social-recovery-m10`). #125 the M-10 follow-ups in one PR by the owner's word (`fix/social-recovery-m10-followups` at 5a7462e435: the deployed error names with four cause strings, the plain-JSON reply line, the ECDSA known-answer test, the removed-key values, the watcher's log lines, the wait route; two rounds, verified; gate green; one open question for the sdk owner on the parameter order of `PolicyManager_ActionDoesNotServeAccount`). Upstream: #251 (M-6), #253 (M-7), #254 (M-8), #255 (M-9 from `dev-wonderland-m9` at 56699ceb4b), drafts the owner marks ready; the M-10 freeze `dev-wonderland-m10` and its upstream draft on the owner's word. |
| Blocked | Nothing. |
| Walked | Part A twice on the doubles (the save gate High found and fixed; the removal's endings and the stored-write blocks reached through the chain double) and part B on Sepolia (the overview, the ended-attempt notice of attempt 4, the signed edit through gas check, submitting, saved; the removal screen; the chain's nonce). Not reached: the sending's rejected and reverted states; the dormant and mirror states on the real chain. |
| Walked | The Sepolia walk of 2026-10-15/16 on a build of #123's head with #119's head merged (`briefs/m10/walk/`, four reports): attempt 4 opened by a fresh recoverer wallet and cancelled by the owner's key, two transactions signed by the owner; the watcher's record, badge and banner, the three bands and the cancel's terminal all as designed, with 23 findings recorded (the three under investigation named in the log). |
| Merged | M-10 round 1 on `dev/wonderland` at 0704c9293d (2026-10-16, one train after the owner's #121 9b102a0d9c, the hierarchy pass): #122 the strings round 3 (508272a8c1), #119 PT-065 the watcher (e3ab5c9ccf), #120 PT-066 the banner and the owner's cancel (281b19ffd4), #123 PT-055 the running-attempt band (0704c9293d). Before them: #117 the M-10 setup (4c8a7c291c), the owner's #116 (28b27b83fb), #118 the strings round 2 (f26405e42f). The final tree equals the last gated lane's. |

## Rulings of M-10 (2026-10-15)

- The banner is the module's own component in the dashboard banner's look, mounted by one line in `DashboardBanners.tsx`; the library's action list does not change.
- Each lane adds its one mount line in a shared file (`background.ts` for the watcher's start, `DashboardBanners.tsx` for the banner), as the Route line.
- The poll reads the registry's state and the authorization per smart account at the latest block, every 30 minutes by the later ruling below, and fetches the opening and ending events only for the attempt in question.
- The cancelled terminal names the editor in a line until the management overview (M-11) ships; "Move funds" is its action.
- The unlock screen's sentence of the frame is not built this milestone.
- The watcher's alarm fires every 30 minutes, not every minute (the owner on #119, 2026-10-15): a design change to D-307, I-29 and the frame D2-01's note, to carry into the design repository before the next copy.
- The cancel's run holds the wallet's session state and stays in the extension (D-370, D-373, D-307); two new questions for the sdk owner: a read naming the attempt a given transaction ended, and the state read without the removed-key scan.
- The cheap attempt-state read without the removed key is the extension's own in `shared/client`, the placeholder for the SDK question.
- An attempt whose waiting period has elapsed does not end; the strings say it "can execute from {{date}}", never that it finishes then (the coordinator, on CodeRabbit's thread of 2026-10-15).
- The owner's ruling (2026-10-16): the chapter names the deployed action's two errors, `RecoveryAction_NotAKey` and `RecoveryAction_AlreadyPrivileged`, in place of the one `ReservedAuthority` the texts had; the kit's decoder and the SDK interfaces still fold both into one name (a code follow-up, with the follow-ups lane).
- Open for the owner from the design-text round (2026-10-16): the read-range row of the privilege replay in the SDK chapter is dead now that the SDK names the removed key from the attempt and setup events (a row for those reads, or none); the `request.window-wide` warning has no ceiling to compare against since 2026-10-01 (a question for the sdk owner); the wireframes' D2-01 note and the generated frame-strings copy still say the poll runs every minute.
- The owner's rule (2026-10-16): every fix found from now on in this milestone rides one PR, #120 (the PT-066 lane); the stacked #123 takes it through the train.
- The owner's ruling (2026-10-15, on #123's folder thread): `restoreCountdown`, its types and its test stay in `shared/records` inside PT-055's lane, an exception to the folder rule of the same shape as the watcher's exported queue helper in #119; the restore belongs under the records' own write queues, and no setup PR carries it.

## The walk's follow-ups (2026-10-16)

From `briefs/m10/walk/investigation-m10-walk.md`; the owner's rulings of 2026-10-16 in each line:

- The recovery banner on the wallet's main dashboard (`#/main-dashboard`, the PPv1 dashboard the wallet opens after unlock and on the popup): one more mount line of the same prop-less component in the PPv1 `DashboardBanners`, beside the common mount that `#/dashboard` and the public view render. XS, lane #120 (a second mount line in a shared file, by the owner's word: built in round 7 before the train).
- The countdowns derived from the registry's date: `useCountdownClock` counts ticks from mount off the poll block's time, so the banner ran about 2.5 minutes late and the wait screen about 21 s; the M-8 rule "the device clock never moves it" is deliberate. The owner chooses: the clock on every tick with due at zero (recommended; the wait screen's chain re-poll at zero stays the check before execute), or the block time plus the time since the poll. Ruled: it stays as it is (the chain's time, never the device clock); no follow-up.
- The watcher's two info lines (the no-deployment return, a poll with no account to watch) and a walk step that checks the alarm right after a start. Ruled: the missing alarm was a cached worker of an earlier build under the same extension id (a walk artefact); no debug round; the walk recipe gains a check of the alarm after each start; the two info lines stay a note.
- The wait screen's loading state with a title and a line during the removed-key scan (today a bare spinner for 12 to 40 s); optionally drop that scan as #116 did for the guardian page. Ruled: dismissed for now; the owner fixes every loading state later.
- Recorded, no change: the "yours" band's seed sentence wins when the fresh-install entry stands (the walk's recoverer had moved to the logged-in route); the band's finish line reads "can execute from {{date}}" since the strings round 5; the settings' recovery screen reads "Not set up" for an on-chain setup (viewing a saved setup is out of this release); the cancel screen names no attempt number, start date, sending key or fee line (the frame's call); the banner rendered once per dashboard tab (three hidden); the wait route without an account in the search goes to Step 1.

## The SDK team's reply to batch 2 (2026-10-15)

The text is filed at `briefs/m10/SDK-REPLY-2026-10-15.md` (the coordinator's worktree). What it decides and what it leaves:

- Decided, nothing to build now: the domain, the raw-digest ECDSA signature and the verify word agree with the walk's facts; a guardian holding code is judged by its own ERC-1271 check and the SDK passes its bytes through. `KEY_VALUE` is `bytes32(1)`, a compile-time constant. The SDK prices nothing and sends nothing (six provider reads, no fee read). The cheap state read is `stateOf` on the manager part (what the watcher built as its own read); no attempt-by-id read exists, a past attempt's fate lives in the logs. A failed removed-key read yields `'unread'` and does not fail the poll; only a hanging read can hold a screen.
- Ruled by the sdk owner (cut-q-39): the SDK names one removed key and refuses nothing when a second candidate exists; the extension's four-source rule and the blocked save stay on the extension's side.
- The removed-key values are now `Address | 'no-source' | 'not-a-key' | 'unread'`; they replace the four values of 2026-09-30 and the extension's `'no-creation-triple'` placeholder. Follow-up FU-U: align the doubles and the screens' readings of the unnamed values.
- The action's error `0x3f6b40e3` is `RecoveryAction_AccountNotServed(address)` and the manager's `0xa1844eb2` is `PolicyManager_ActionDoesNotServeAccount(address,address)`; the SDK's pin moves to a5f86fa and names both (not yet scheduled on their side). Follow-up: the kit's error tables name both selectors, with the reading "this account is not one the action serves".
- The reply line: the SDK ships no serializer; the ruling is `JSON.stringify` of the Reply record with its keys in record order, one line, and a parser that `JSON.parse`s and shape-checks. Follow-up: the checklist's paste codec and the guardian page's reply line move from base64url to plain JSON (one task, both sides, before the guardian milestone's next round).
- The ECDSA signing vector is blessed (`tests/kat/vectors/method-ecdsa-proof.json`, row `deterministic-test-key`). Follow-up: a known-answer test in the kit's ECDSA method against that row.
- `ClientConfiguration.logChunkSize` has no default and no ceiling; the sample page uses 2,000 for free nodes. The watcher's own chunk width stays the extension's choice.
- The big ruling: the extension adopts the SDK's exported types (`@kohaku-eth/social-recovery` at wonderland/dev 40bc4ad) and drops its doubles before the guardian milestone. The record shapes to adopt: `credentialHoldsCode` on the approver request and every gathering place; the purpose unions; `AddResult` as `filed | refused` with five causes; `RequestWindowBounds { default, floor }`; `chainId` as a decimal string on the request, reply and gathering records. This is its own task; the owner schedules it.
- Still with the sdk owner (the reply's owner-only block): a timeout or an inference-free `recoveryState` (recommended no), an attempt-N status convenience (recommended no), the `KEY_VALUE` naming (cosmetic); the parameter names and order of `PolicyManager_ActionDoesNotServeAccount(address,address)` and which manager functions raise it (the kit's ABI carries stand-ins); the shape of `ISignerRecovery.recoverSigner`, the integrator interface the removed-key walk names, absent from the chapter's list of the interfaces a stranger implements (a fourth entry changes that list, so it waits for the shape). The chapter drifts the reply lists are edited in #124.

---

# The board at the end of M-9 round 1 (kept)

The state of the work at the end of milestone M-9 round 1 (the guardian page), 2026-10-14, written as the hand-off to the next coordinator session; M-9 started 2026-10-13 from `dev/wonderland` f6b43bd52c and ended at ff60f6a256. The M-8 running log stays in the M-8 coordinator's worktree under `briefs/m8/LOG.md`; this milestone's log is `briefs/m9/LOG.md` beside its briefs.

## The board

| Column | What is in it |
| --- | --- |
| Ready | The follow-ups below as the next tasks; the next milestone (M-10, the watcher, PT-065 and PT-066) on the owner's word. |
| Running | Nothing. |
| Awaiting review | Nothing on the fork but this board. Upstream: #251 (M-6), #253 (M-7), #254 (M-8) and the M-9 draft from `dev-wonderland-m9` at ff60f6a256, drafts the owner marks ready. |
| Blocked | Nothing. |
| Walked | Part A twice on the doubles (the save gate High found and fixed; the removal's endings and the stored-write blocks reached through the chain double) and part B on Sepolia (the overview, the ended-attempt notice of attempt 4, the signed edit through gas check, submitting, saved; the removal screen; the chain's nonce). Not reached: the sending's rejected and reverted states; the dormant and mirror states on the real chain. |
| Merged | M-9 round 1 on `dev/wonderland` at ff60f6a256 (2026-10-14, one train): #104 the setup (the strings, the unlock return, the signer facade's bigint fix), #106 the kit's ECDSA method, #107 the page's reading, #108 the page's signing and reply; beside them the owner's #105, #109 and #111. The final tree equals the last gated lane's. |

Follow-ups recorded, not started: a fallback at the manager's deployment block when the archive code read is refused on a pruning RPC (part E); a read of the request's attempt-started event for a link reopened after a later attempt; the payload text and file helpers shared with the enroll lane; the enroll lane's unused bigint replacer; a clock read inside the late-approval check; the reply script's verify compare against the 32-byte answer; the upstream switch-account window that cannot read a `switchAccount` action; the Colibri verifier of the shared build failing on a fresh install (outside the module).

## Rulings of M-9 (2026-10-13)

- The guardian signs with a key imported into Kohaku; no injected wallet and no WalletConnect route in this milestone.
- The kit's ECDSA local verify follows the SDK's rule: a signature by another signer reads not judged, the chain's own check decides.
- The page's three chain reads go through the kit client built for the account the link names.
- The `DEPLOYED_ACTION` constant in the two kit test files stays.

## Open with others

| Question | Owner | What the code does meanwhile |
| --- | --- | --- |
| The reply text format and the signing vector | sdk owner (asked 2026-10-13) | The extension's `recovery-proof-reply` record as a base64url line; a test vector from a throwaway key |
| The removed-key premise (a key the creation code wrote has no privilege log) | sdk owner | The creation-block scan of part E |
| The action's unnamed error `0x3f6b40e3(address)` | contracts author | Decoded as unknown |
| Which object the page's three reads go through (question 21) | sdk owner | The kit client for the request's account |

## What M-7 delivered

A holder of a smart account sets up account recovery end to end: the presets or a custom path, guardians by address and passkeys, the waiting period, three privacy levels, the review against the chain, the save with one transaction, the Recovery Card. With no deployment in the build the flow runs on the doubles; with the deployed contracts' addresses it runs against the chain through the extension's own client (`shared/client/kit`).

| Area | Fork pull requests |
| --- | --- |
| The create door's picker and the settings entry | #30 |
| The presets | #18, #47 |
| The path editor, its refusals and the rules panel | #19, #22 |
| The enrollment's passkey and guardian rows | #27, #36, #37 |
| The waiting period and the privacy step, three levels | #24, #32, #56 |
| The Recovery Card and its password ask | #23, #21, #58 |
| The review | #26, #28, #38 |
| The save, one at a time across pages, and a dropped save | #41, #29, #40, #35, #57 |
| The sign screen's own-key payer | #43 |
| The real client for the deployed contracts | #53, #59, #55, #60, #52, #63 |
| The styling pass | #54, #62, #64 |
| Fixes, the test pass, the chain id guard | #20, #25, #49, #61 |
| Setup rounds and docs | #17, #31, #34, #39, #42, #44, #45, #48, #50, #51, #33, #65 |

Library changes on `defi-wonderland/kohaku-commons` (branch `dev/wonderland`, f92467327): #3 the account's own privilege grant on the sign screen, #4 the create flow selects the slot's smart account, #5 the recovery kit mark on the wallet's request, #6 the smart account's own keys as fee payers, #8 the deployed `commitSetup` signature. `.gitmodules` points at the fork; before anything goes to `main` these must reach `ethereum/kohaku-commons` and `.gitmodules` must point back.

The gate at f84abe36a: 5051 tests in 176 suites; `tsc` 499 older errors, none in the module; the one older ESLint error in `routesConfig/index.ts`; the sweep empty; the webkit build passes with no bigint exponent in the bundle. When the fork's #46 (another session's TypeScript repair) merges, the older `tsc` count becomes 23 and the gate's expected number changes with it.

## The run against the deployed contracts (2026-10-05)

The contracts live on a fork of Sepolia (a Tenderly virtual network; its RPC, explorer, addresses and the `.env` line are in the README section). The built extension, pointed at it, saved a setup with one transaction: `0x6d17dcc6b7f51a1c54ca17b14044b5c530b6f1a645f7783925a4377c79c77d3d`, block 11829369, 280,141 gas, sent and paid by the account's own key. Checked after it: the manager's commitment equals one built by hand from the editor's input; the account is authorized; the sealed backup in the commit's log opens with the recovery password; a simulated `startAttempt` by the guardian succeeds, and fails with a wrong proof or a wrong body. Facts the experiments settled, which the SDK's documents did not: the setup body is three top-level values `abi.encode(uint48, bool, (uint8, bytes32[])[])`; the commitment is `keccak256(abi.encode(account, action, nonce, body))` with the stored nonce plus one; the arming call is `setAddrPrivilege(KIT_SLOT, BINDING)`; `commitSetup` never receives the body, so a wrong encoding saves and fails only at recovery; the action's reads revert on an address with no code; `isAuthorized` on a deployed, unarmed account answers false.

The test wallet (owner's rule, 2026-10-05): the same keys in every run, and the owner funds them; a fork's balance cheat method is never used. The save is sent by the smart account's controlling key, which is not a listed account; a new account's key must be funded before its first save.

## Rulings that stand

- Three privacy levels ship; the privacy step always offers the three radios; a setup with an empty path is never saved (2026-10-02).
- The account's own key pays every recovery write of the account, and the shortfall screen names that key (2026-09-30).
- One recovery path per account: the save screen sends nothing for an account that already has a setup; replacing a setup is the management editor's (later milestone).
- The save's property: the screen never shows a setup as saved, and never wipes the setup records, unless the receipt landed and the after-save read says landed and authorized for that run; it never sends twice for one intent; it never says "nothing was sent" for a send that can still land. A page claims the save in flight before it sends; a page that finds a claim follows that save; a claim older than 40 seconds at its last read does not send; a follower voids a dead claim only on a reading that began after the grace period.
- At the hidden privacy levels the card asks for the recovery password again when it is not in memory, and checks it by opening the saved setup (2026-10-02).
- The setup entry keeps reading "Not set up" after a save in M-7; the view of a saved setup is the management overview's, M-11 (owner, 2026-10-05).
- Strings: the coordinator chooses the text, ships it in a setup PR and lists it in the report; the owner is not asked to confirm wording (2026-10-02).
- Review: every comment (the owner's, the second reviewer's, CodeRabbit's) is verified by a read-only verifier before any change; a pull request with no finding and the owner's "Approved" merges; a pull request changed after his approval needs his word again (2026-10-05).
- Upstream: one frozen branch and one stacked draft PR per milestone (see the coordinator command).

## Open with others

| Question | Owner | What the code does meanwhile |
| --- | --- | --- |
| The backup's format, the default salt, the iteration count, whether the chain id belongs in the associated data | sdk owner | The extension's own first format: a versioned plaintext, PBKDF2 with 600,000 iterations, AES-256-GCM, 2457 bytes padded and 2502 sealed |
| The public shape note's format at the middle privacy level | sdk owner | The extension's present bytes |
| What `landed` means in the confirmation | sdk owner | The extension's client also requires the manager's present nonce and commitment; the SDK text says "the event was found" |
| The reply's shape and the verify per pasted reply (questions 4 and 6) | sdk owner | Blocks PT-058 |
| The recovered key's typed-data signing and its vector (question 17) | sdk owner and ux owner | Blocks PT-075 |
| The verify gas bound behind the rule-width check | contracts' authors | A placeholder cost table |
| The creation block of an account, for the privilege replay (FU-M) | sdk owner | A stand-in of 0; the kit's removed key avoids the replay |
| `AlreadyPrivileged` and `NotAKey` as one `ReservedAuthority` or two names | owner (a design change) | One name |

## Recorded, not started

Small repairs from M-7's reviews and walks, one follow-up (FU-Z in the tasks' table): the save path decodes no landing revert, so a wrong setup nonce and an invalid commitment are not told apart; a malformed deployment variable throws during render in five screens instead of reading "unavailable"; two refs are written during render (`setup/card/useCardPassword.ts`, `setup/arm/ArmScreen.tsx`); the setup chrome's spacer sidebar is not hidden from accessibility tools (the wallet's own settings chrome does the same); the gas card has no "Not enough gas" heading; the resume block's "not yet active" row has no title; the module reads and the action's info read at the latest block, not the pinned one; the test pass never swept `setup/arm` and `setup/presets` as its own round.

For M-8 itself: the recovery side of the real client. Today the client refuses the recovery members as "not served" and the approving side runs on the method doubles; M-8's screens build on the doubles first, then a follow-up serves them from the chain, as the setup's real client did.

Outside the module, recorded and not brought as decisions: the import door and "Add account" list basic accounts only, so a holder who imports a recovery phrase has no smart account to protect; the wallet's dashboard fails now and then with an animation error (`inputRange must be monotonically non-decreasing`), on the dashboard route only.

## Facts the next session should not rediscover

- The gate scripts, the merge train, the thread reply and the agent-worktree init live in the coordinator's scratchpad and, inline, in its memory note; a reboot wipes the scratchpad.
- The merge train and stacked lanes: a lane first merges its base lane's final head, then `dev/wonderland`; a conflict after the base's squash is resolved per file (a file the lane never changed takes `dev/wonderland`'s copy; a file whose `dev/wonderland` copy equals the base's takes the lane's); after each step the lane's diff against `dev/wonderland` must equal the pull request's own diff. A lane cut before its base's last round once lost that round's tests this way; it was caught before the merge.
- At most three test-running agents beside one gate; more crashed the desktop app. A stopped agent resumes by a message to its id and keeps its worktree.
- Jest runs every file under `__tests__`, so test-only types go to a harness or `__fixtures__/types.ts`; a failure that prints "Do not know how to serialize a BigInt" hides the real diff (run in band); the repository's Jest types reject `it.each`; Babel turns `**` on a bigint into a throwing `Math.pow`.
- The wallet reads `SEPOLIA_RPC_URL` and `RPC_PROVIDER` at build time and stores the network at first start, so a build for another node needs a fresh browser profile; the light clients cannot follow a fork; dev and prod builds share one extension id; onboarding needs exactly one wallet tab.
- A fork that keeps Sepolia's chain id accepts transactions that are also valid on Sepolia: test wallets only.
