# Social recovery board

Observed 2026-09-25 after the owner's and Astra's review of the stack. Not committed unless the owner says so.

Integration branch: `dev/wonderland` at `603d819d7` on `defi-wonderland/kohaku-extension`. Fork `main` equals upstream `main` at `72922ab25`. Nothing merged yet; every PR was marked ready for review on 2026-09-25 by the owner's instruction, with review fixes pending.

Commons: fork `defi-wonderland/kohaku-commons` has `main` and `dev/wonderland` at `29227cc` (pushed 2026-09-24 with the owner's approval). The extension's pointer stays at `29227cc`; `.gitmodules` on the setup branch points at the fork. No kohaku-commons PR was needed in M-6.

## The stack

| PR | Task | Head | Base | Lane tests | Full suite | Build | Review |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #4 | setup `chore/social-recovery-setup` | `c46f043cf` | `dev/wonderland` | 4 files, 117 | 146 at the last code commit `34ff01143`; later commits are strings only | 0 | fresh review, dispositions posted |
| #8 | PT-035 The SDK doubles | `3e8b141d5` | #4 | 16 files, 220 | 366 | 0 | fresh review (2 high, 5 medium, 10 low), all applied, verified |
| #6 | PT-036 Display rules and the status vocabulary | `f696af1d0` | #4 | 7 files, 79 | 233 | 0 | fresh review (2 medium, 7 low), all applied, verified |
| #7 | PT-037 The rule lines | `c785bb343` | #4 | 1 file, 121 | 267 | 0 | fresh review (1 high, 2 low), all applied, verified |
| #5 | PT-040 The wallet's records | `c1ea5c2ba` | #4 | 2 files, 127 | 271 | 0 | fresh review (1 high, 2 medium, 5 low), all applied, verified |
| #9 | PT-038 The client, the provider and the signer | `3ced0f790` | #8 | 7 files, 102 | 468 | 0 | fresh review (1 high, 2 medium, 3 low), all applied, verified |
| #10 | PT-041 The ceremony tab and the method hosts | `2b31d8244` | #8 (+ #6) | 13 files, 227 | 683 | 0 | fresh review (1 high, 3 medium, 8 low), all applied, verified |
| #11 | PT-039 The shared write states and the gas step | `0f89acd44` | #9 (+ #6) | 9 files, 429 | 984 | 0 | fresh review (1 high, 2 medium, 10 low), all applied, verified |

Every row's checks were observed by the coordinator in the installed task worktree: `yarn test` exit 0, `npx tsc --noEmit` with 499 errors all pre-existing and none under `src/web/modules/social-recovery`, ESLint on the lane exit 0, `yarn build:web:webkit` exit 0. No CI job on the fork runs Jest, tsc or the build; only CodeRabbit and Semantic PR report, so every check result rests on local runs recorded in the PR comments.

Setup revisions: `880c0bd13` first review base; `c40d5dabb`, `40fca1c2a`, `e01567961`, `fc9e1e080`, `8d54c758e`, `901bececa`, `6aaa7aab6`, `c46f043cf` add the strings the lanes reported missing (each recorded on PR #4); `34ff01143` applied the fresh review. The round 0 branches carry earlier setup revisions that differ only in `en.json` additions, so the stack merges cleanly in this order: #4, then #8, #6, #7, #5, then #9 and #10, then #11.

| Ready | Running | Awaiting review | Blocked | Merged |
| --- | --- | --- | --- | --- |
| | | #4 to #11: ready for review; the owner's 13 comments and Astra's 1 finding on #4 verified (plan in the coordinator's report); Astra's findings on #5 (1 high), #8 (3 medium), #9 (1 medium), #10 (2 medium), #11 (1 medium) await dispatch | The review round waits for the owner's go on the five working rules below | |
| | | | PT-042 to PT-051 (M-7): wait for the proof of concept; not started by rule | |
| | | | Follow-up (not an M-6 task): wire PT-041's ceremony resolver through PT-038's client; wire a send path for the writes of PT-039 | |

## Review round of 2026-09-25

The owner's comments on #4 set five working rules that touch every PR: no design-doc references in code, comments or test names; briefs do not ride the PRs; no lane or module READMEs, the rules go to `CLAUDE.md`; no overhead comments in shared files; tests test behaviour, not declarations. Rulings: keep the nested route registry; `Address` and `Hex` from viem; `ConfigurationSource` is `{ password } | Configuration` (Astra's finding). Tooling facts learned: `git grep -E` ignores `\b` on this machine (use `-P`); a tester's marker poll must use `--first-parent`, since the setup merge carries older markers.

| PR | Round state | Head | Checks | Review |
| --- | --- | --- | --- | --- |
| #4 setup | owner's review applied, pushed (+ two strings for PT-041 and PT-039) | `b0ad9acdc` | 97 tests, tsc clean, eslint 0, build 0 | fresh review applied and verified; 14 threads answered |
| #7 PT-037 | applied, pushed | `28d46bd12` | 218 tests, clean | fresh review applied and verified |
| #6 PT-036 | applied + CodeRabbit's 3 findings, pushed | `d889b9606` | 189 tests, clean | both rounds verified; 2 threads answered (+3 copies on #10/#11) |
| #8 PT-035 | applied + Astra's 3 + CodeRabbit's 10 findings, pushed | `92e9d136d` | 349 tests, clean | three rounds verified; 13 threads answered |
| #5 PT-040 | applied + Astra's finding (revision, compare-and-set, Web Locks), pushed | `92cf01db4` | 245 tests, clean | verified; 1 thread answered |
| #9 PT-038 | applied + Astra's finding + the bigint chain-id compare, pushed | `b011399a2` | 472 tests, clean | verified; 1 thread answered |
| #10 PT-041 | applied + Astra's 2 + CodeRabbit's finding, pushed | `81fc5a4d1` | 696 tests, clean | verified; 4 threads answered |
| #11 PT-039 | applied + Astra's finding + CodeRabbit's 2, pushed | `d96cbe7a2` | 1016 tests, clean | verified; 5 threads answered |

Merge order unchanged: #4, then #8, #6, #7, #5, then #9 and #10, then #11. Every stacked branch carries its bases' final revisions (PT-038, PT-041 and PT-039 hold PT-035 at `40607545b`; PT-041 and PT-039 hold PT-036 at `fb7b1513c`; PT-039 holds PT-038 at `8a331ca63`), so the stack merges cleanly in that order.

## Review round of 2026-09-28

The owner approved #4, #5 and #7 and left 18 threads on #5, #6, #8, #9, #10 and #11 (plus one CodeRabbit thread on #8): reuse what ethers or viem (or the repo) already provides, stop duplicating small helpers across lanes, and questions on the facades. A survey found 18 groups of repeated helpers (98 occurrences) and confirmed the display files in the #10 and #11 diffs are one file each (stacked-diff artifact, not duplication). Standard applied: viem for value helpers (address, hex, units, constants, typed-data checks; the module's `Address` and `Hex` already come from viem, the SDK depends on viem, the other Kohaku-added code uses viem), ethers at the provider boundary. Briefs at `docs/social-recovery/briefs/round3/`; the state file with every thread id is the scratchpad's `pr4/plan.md`.

| PR | Round state | Head | Checks | Review |
| --- | --- | --- | --- | --- |
| #4 setup | no change (approved) | `b0ad9acdc` | | |
| #7 PT-037 | no change (approved; its narrowed translate type is legitimate) | `28d46bd12` | | |
| #5 PT-040 | typed `Address` keeps only viem `isAddress` (loose); `react-fast-compare` over a richJson round trip for the deep equality; `isAddressEqual` behind an `isAddress` check that keeps the lane's error; `RecordStorage extends Storage`; `bytesToHex` revision; pushed | `7c237d929` | 260 tests, clean | verified (0 high, 2 medium, 7 low applied or accepted); 2 threads answered |
| #6 PT-036 | translate wrapper deleted (renderers default to `i18n.t`); viem `isAddress`, `isHex`, `zeroAddress`, `getAddress`, `formatUnits` with the same accept/refuse set; ethers caps dropped, decimals bounded at 255; pushed | `159f87397` | 206 tests, clean | verified (0 high, 2 medium, 4 low applied); 1 thread answered |
| #8 PT-035 | CodeRabbit's unanswered-read finding applied and widened to `prepareCommitSetup` (`unansweredRead` shared in scripts.ts); viem zero constants, `isHex`, `size`, `sepolia.id`; `distinctAddresses`; named defaults and `MANAGER_DOMAIN_FIELDS` exported through the barrel; pushed | `c59aafd27` | 376 tests, clean | verified (0 high, 3 medium, 8 low applied or accepted); 3 threads answered |
| #10 PT-041 | route comment one line; guards typed; channel no longer re-parses, subscribe path parses with richJson (fixes unrevived bigint there); one message reader, one record guard; DER via viem `numberToBytes`; `Translate` from display; #6 and #8 rounds merged; pushed | `6b76f52f3` | 764 tests, clean | verified (0 high, 1 medium, 6 low applied); 5 threads answered |
| #9 PT-038 | chain reads and adapter through the ethers provider's typed methods (`eth_chainId`, `eth_gasPrice` stay raw); signer facade kept, recovers with viem and refuses unencodable typed data before queuing; `sameAddress` via viem; `viem/chains` ids; barrel constants; #8 round merged; pushed | `4429d95f8` | 582 tests, clean | verified (0 high, 2 medium, 9 low applied or accepted); 4 threads answered |
| #11 PT-039 | STOPPED on the owner's word (2026-09-28): items 1, 2, 3, 5 done and reviewed (viem `etherUnits.wei`, `isHex` hash check, `i18n.t` defaults, tests on `i18n.t`); item 4 (client renames) after #9; #6 and #8 rounds merged locally at `5bc3c5c8d` | `a202b72cc` (wip) | 487 lane tests | reviewed (0 high/medium, 3 low applied); verification after item 4 |

Rulings taken by the coordinator (reversible): viem for value helpers; the typed `Address` parameter keeps a viem format check instead of the hand-written regex (the classifier refused the deletion of the bad-address tests; full removal is the owner's call); ethers' FixedNumber caps are not domain rules; `size` rounding of odd-length hex is named in #8's description; a class-instance `params` in the ceremony hosts yields `{}`.

Decisions for the owner from this round: a types convention for the module (records has `types.ts`, the other lanes inline; recommendation: no change); `addresses.ts` and the deployment facts wait on the SDK owner (D-208 says the SDK ships default descriptors; the interfaces do not expose them); a viem custom-account shape for the signer facade (not done); `__tests__/MANUAL-RUN.md` is markdown inside the module from an earlier round (does the no-README rule cover it); whether the account guard in the records goes entirely.

## Round 4 of 2026-09-28 (the owner's rulings on the round-3 decisions)

Rulings: (1) types live in a types file per folder (rule 6 in `CLAUDE.md`); (2) `addresses.ts` placeholders stay until the SDK owner answers; (3) no `unknown` parsing outside a real boundary (rule 7 in `CLAUDE.md`; the records' account format check stays); (4) the signer facade also presents a viem custom account (`accountFor`); (5) `__tests__/MANUAL-RUN.md` stays; (6) the client swap effects stay as they are. Both rules went into `CLAUDE.md` on the setup branch (`e74a4cc26`, pushed) and then into every lane through a fresh implementer, a reviewer, and a tester where a test changed.

| PR | Round 4 | Head | Full suite |
| --- | --- | --- | --- |
| #4 setup | the two rules in `CLAUDE.md`; pushed | `e74a4cc26` | 97 |
| #7 PT-037 | `types.ts`; no guard existed; pushed | `d59ae8820` | 218 |
| #6 PT-036 | `types.ts`, translate.ts gone; `Address`/`Hex` inputs; unused chip guard deleted; pushed | `afdff7a69` | 206 |
| #5 PT-040 | `types.ts` with an explicit `WalletRecords`; typed request comparison, typed revision and event (runtime checks and the unused wipe-event guard deleted; 17 cast tests deleted, the empty revision pinned); pushed | `bea78c7e0` | 244 |
| #8 PT-035 | `types.ts`; typed notifications and proof codec; `scripted` parameter gone; pushed | `104cc38bc` | 376 |
| #10 PT-041 | `types.ts` and `screen/types.ts`; typed `PageDevices` and `CeremonyValue`; a null method answer reads failed; #8 round 4 merged; pushed | `f9f2a8976` | 768 |
| #11 PT-039 | client renames adapted; `types.ts` and `components/types.ts`; ethers receipt shape, raw JSON receipt waits under its hash; #8 and #9 round 4 merged; pushed | `7f9dc6648` | 1193 |
| #9 PT-038 | `types.ts`; typed outcome and domain, hook facts from a ref; `accountFor` (viem `toAccount`) over the facade; domain-only typed data refused before queuing; #8 round 4 merged; pushed | `067de7ce5` | 600 |

Effects the owner approves with the PRs: a raw JSON receipt in a thrown value now waits in submitting (#11); a null method answer reads failed with the thrown cause (#10); the empty revision meets the conflict (#5); the unused guards `isChip`, `isWriteKind`, `isRecoveryWipeEvent` are gone; a domain-only EIP-712 request is refused before the holder sees it (#9).

## After round 4 (CodeRabbit on the round-4 pushes, 2026-09-28)

Three threads: #10 renderers "trailing newline passes viem" is not reproducible (JavaScript `$` never matches before a trailing newline; viem refuses it; the display tests pin it), answered; #4 the types rule now exempts `sdk-interfaces/` (types only, one file per SDK chapter), `d4b679c97` pushed and answered; #7 the rule line "together with one member of each other group" misdescribes a path whose other group needs more than one member: valid, the wording is D-305 design copy (ux.md:227) copied into the four `socialRecovery.ruleLines.togetherWith*Groups*` strings, no code-only fix exists, the owner chose (a): the four strings say "enough members of each other group to meet its threshold" (setup `b7b8fa66a`, ux.md updated on the coordinator's branch at `96995a79a`), #7 at `02f0a1c3a` with one pinning test; no code change.

## Owner decisions, by PR

- #4 setup: `passkeyOrigin` keeps "on Chrome"; `bothMustAnswer` without the frame's "Deliberately strict."; route names are door or action labels; `display.values` keeps the done-screen pair; the `recovery` route sits behind the keystore and account guards (holds only if the fast track leaves an authenticated account before D-01, check against PT-053 and PT-054); the sdk owner confirms the `ClientConfiguration` field names and the `Verdict` slugs; Jest maps `react-native` to `react-native-web` for every extension test; the cause sentences per kit error (`writes.causes.*`) were written from the D-205 table and need the ux owner's confirmation.
- #8 PT-035: `AccountNotArmed` and `AccountUnfit` are stand-in error names; a reply with no binding fields reads `version-unread`; an undeclared module answers `answered: true` with empty values plus `method.no-declaration`; the cut-q-22 seam overlaps two SDK surfaces and only `verifyReply` is truly outside the SDK; sdk-interfaces gaps for the sdk owner: `removedKey` causes, unanswered versus failed module read, the open-payee warning and any request warning on `PreparedCall`, a construction-refusal shape, `CodedError`.
- #6 PT-036: the countdown strings repeat three status words; `en-GB` renders most non-European zones as offsets; "1 more member"; the name cap as 24 in total.
- #7 PT-037: the chapter's clause "one member of each other group" is false when another group's threshold is above one; a 3-of-3 group loses the lockout clause; the all-guardian failure-domain line follows D-305 while frame C-04e draws none; the input type cannot hold empty preset slots; a 2-of-2 group gets no sizing line.
- #5 PT-040: the wiped record keeps the account and the deadline against I-38's "nothing else"; a new gathering cannot overwrite a landed session; PT-061 expects the countdown to hold the attempt id while D-310 says the account alone; the decrypted cache sits unencrypted in local storage.
- #9 PT-038: the background action `KEYSTORE_CONTROLLER_SIGN_WITH_KEY` for a key that is not a listed basic account; whether key certifications and access tests are exempt from the action window (D-316); the action window ignores the key type the facade carries; a request added while another sign-message request is visible is dropped until the timeout; `signBytes` always adds the EIP-191 prefix; `getRpcProvider` may start a second light client; Sepolia is fixed with no mainnet flag.
- #10 PT-041: the not-judged mapping to unavailable; the loss line for a phone-held device-bound passkey; "this Mac" from the platform against D-372's sentence; a manual Chrome run (`__tests__/MANUAL-RUN.md`) needs the resolver follow-up first.
- #11 PT-039: move funds after an executed attempt (frame D2-01 versus D-307); the generic not-sent and submitting lines; the network line on owner writes; the fast track's single route; the 20 percent headroom and rounding; `MethodVetoedSpend` and `WaitNotOver` reading "still ready" with a retry; a retry offered before the attempt read returns.

## Housekeeping for the owner

- Worktrees left in place: `chore-social-recovery-setup`, `PT-035` to `PT-041` (installed or symlinked), one probe worktree `agent-aca8f5ca496cb6bf1` with an untracked probe file, and one isolated worktree per agent (`agent-*`), each on a `worktree-agent-*` branch. Forced removal is blocked in this session; `git worktree remove --force` and `git branch -D` for the `agent-*` and `wip/*` entries are the owner's to run.
- Local branches `wip/<task>-impl` and `wip/<task>-tests` are merged into their task branches and can be deleted.
- The shared git config's `submodule.ambire-common.url` now points at the fork over SSH (changed by `git submodule sync` in the setup task).
- Known tooling facts: `yarn install --frozen-lockfile` fails on a clean checkout of `dev/wonderland` with yarn 1.22.17; installs ran without the flag and the lockfile was reverted; no PR touches `yarn.lock`.

Next owner action: mark ethereum/kohaku-extension#250 and defi-wonderland/kohaku-extension#13 ready when wanted; record the proof of concept D-316 schedules before M-7; forward the SDK questions to @0xAaCE.

## Merge train of 2026-09-28

- The owner approved all eight PRs in chat and instructed the coordinator to merge them (a PR author cannot approve on GitHub; the GitHub approvals on #4 to #9 are CodeRabbit's). Merge commits, in order: #4 1fce8322e, #7 08911da0e, #8 bf574d0f0, #6 b14af5188, #5 f835625f5, #9 e2aee67c1, #10 401751f78, #11 6f1bb020d. `dev/wonderland` is at 6f1bb020d.
- Before its merge each lane took `dev/wonderland` by a merge commit and ran its gate: #7 kept the tree of 02f0a1c3a (no gate needed); #8 7442bb626 (376 tests); #6 b185028f1 (206); #5 8df1a7e79 (244); #9 abd07407c (978); #10 4c61b9118 (1037); #11 9728fe76b (1745 tests, 70 suites, the integration gate). Every gate green: tsc 499 pre-existing, none in the module; eslint 0; sweep 0; build 0. The final `dev/wonderland` tree (c0907b236) equals #11's gated tree.
- The fork deletes head branches on merge and retargeted the stacked PRs by itself; the eight remote lane branches are gone; the local worktrees keep them.
- Delivery to ethereum/kohaku-extension: the owner asked for a PR that creates `dev/wonderland` there. The ref creation failed (HTTP 422) because that repo has a `dev` branch, and git cannot hold `dev` and `dev/wonderland` together. The owner named the branch `dev-wonderland` (2026-09-28); the coordinator created it at ethereum main 72922ab25 and opened the draft PR https://github.com/ethereum/kohaku-extension/pull/250 from the fork's `dev/wonderland`; the owner marks it ready and merges it at the milestone's end.
- M-6 items no PR covers: the ceremony resolver wired through the client and a send path for the writes (follow-ups); the manual Chrome run of the ceremony tab (waits on the resolver); the per-milestone persona replay is not needed for M-6, because no screen was added (owner, 2026-09-28); the D-305 wording fix, now the draft PR https://github.com/defi-wonderland/kohaku-extension/pull/13 (branch docs/rule-line-wording-board; #12 was its first form, closed; the owner chose a PR in this repo over the design repository first); the addresses and deployment descriptor placeholders; the sdk.md commit the doubles copy; who owns the cut-q-22 members.
- Squash history (owner, 2026-09-28): the owner wants one commit per task on `dev/wonderland`. The coordinator rebuilt the branch as eight squash commits from the same trees (4ef6e1a11 #4, 406a5c232 #7, aa2c4b196 #8, 5c6ba5daa #6, c8e51a6bb #5, 1b8ada28c #9, ac56fc01a #10, fb002e9be #11; final tree c0907b236, equal to the merge-commit history's). The owner force-pushed it on 2026-09-28 (the coordinator's session refuses force-pushes); `dev/wonderland` is at fb002e9be, nine commits ahead of ethereum main; the merge-commit history stays local as `backup/dev-wonderland-merge-train`. From now on every PR merges with `gh pr merge --squash`.
- The board rides PR #13 and stays on `dev/wonderland` until the milestone goes upstream, then it is removed (owner, 2026-09-28).
- The working rules and the coordinator command after M-6: draft PR https://github.com/defi-wonderland/kohaku-extension/pull/14 (branch chore/working-rules-after-m6). CLAUDE.md gains the squash rule, the upstream branch, the guard rules and the viem and ethers ruling; the command gains the merge train, the gate, the agent model per round, the board's PR and the persona rule.
