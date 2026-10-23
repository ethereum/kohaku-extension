# Social recovery board

The state of the work at the end of milestone M-12 (the two identity methods, zkPassport and Anon Aadhaar: PT-069 the rows at enrollment, PT-070 the rows at recovery), 2026-10-23; M-12 started from `dev/wonderland` 2a8a8fa8f3 (the SDK adoption, FU-AM and their board) and ended at 22124ff2ff. This milestone's log is `briefs/m12/LOG.md` beside its briefs in the coordinator's worktree (`.claude/worktrees/social-recovery-m12-identity-0f1653`); the SDK adoption's log stays in that task's coordinator worktree under `briefs/sdk-adoption/LOG.md`. The SDK adoption and FU-AM ride M-12's freeze and upstream draft.

## The board (M-12)

| Column | What is in it |
| --- | --- |
| Ready | The freeze `dev-wonderland-m12` and its upstream draft on `dev-wonderland-m11` (#257), on the owner's word; the part C rerun once the zkPassport method's Safe moves its trusted keys; the alpha swap (FU-AN) once `@kohaku-eth/social-recovery` 0.0.2-alpha.0 is on npm; the follow-ups recorded below. |
| Running | Nothing. |
| Awaiting review | This board's docs PR (`docs/social-recovery-m12`). Upstream: #251 to #257 are drafts the owner marks ready and merges in order. |
| Blocked | The passport access test and the passport recovery on Sepolia and mainnet: the deployed zkPassport method accepts circuit 0.21.0 and the app proves with 0.21.1 since 2026-10-22, so the method's verify view reverts until its Safe moves the trusted keys to 0.21.1 (the contracts team; passed by the owner on 2026-10-23). The owner's cancel, the clear and the removal on Sepolia until a walk confirms them on the base 08480f5, which carries the SDK's PR #42 write fixes (FU-AO). |
| Walked | Part A on the headless build over the fake node and the scripted stacks (`briefs/m12/walk/a/`): both rows at enrollment with the four verdicts, both claims on the checklist, the submission's re-verify; nine findings: four Mediums fixed in the lanes' round 3 (PT-069 three, PT-070 one), two copy Lows fixed in the round-4 restack (the stopped note, the identifier items of the privacy aside), one the owner's ruling (no discouraged line), two Lows recorded. Part B on Sepolia with the Aadhaar identity alone against the test-only method (`walk/b/`): the setup, the claim with the real prover, the submission, the wait and the execution end to end, three transactions signed by the owner, the done screen; nine findings: four built as FU-AW (#138: the recover door, the add menu, the start-over note, the threshold clamp), one as designed within the SDK's limit (another identity's QR reads the method's own check, a batch-6 question), four as designed (the watcher's 30-minute poll, the Tested row's lines, the stopped note, the chips in hours). Part C on Sepolia with a real passport by the SDK owner (`walk/c/`): the enrollment passed (35 s from the handshake); every access test was refused because the deployed method accepts circuit 0.21.0 and the app proves with 0.21.1 since 2026-10-22; the recovery steps were not reached; six findings and two plan gaps: C1 to the contracts team, C2 to C5 to FU-AY, C6 not confirmed in the tab (the app sends no accept in this flow), the plan's install steps corrected on `walk/m12-b`. Part D on the fake node with the reads slowed (`walk/d/`, 247 captures): twelve findings and four missed waits: two Highs (Execute and the checklist's decisions open during a later poll), seven Mediums and four Lows fixed in FU-AX round 6 (#139), one Low not confirmed, one reload mismatch read as the walk's own artefact. |
| Merged | #133 the M-12 setup on `dev/wonderland` at 692c30c3fb (2026-10-21, the train): the two peers and the QR decoder as pinned dependencies with the lockfile by hand, the Jest mapper for the second entry, the five deployment-line fields, 49 strings; two CodeRabbit findings and the independent review's confirmation fixed before the merge. #137 the SDK base move at bc7a6ffba5 (2026-10-22, the train): `wonderland/dev` 08480f5 packed into the install, the three-word Aadhaar config with the 24-hour freshness window, the zero address as the absent-method value, the fresh-QR lines, the stopped note and the Aadhaar identifier items; two rounds; the independent review's one Low (the PR description) fixed. Then the train of 2026-10-23, in order: #134 the identity hosts at 97c7f979c3 (the per-chain method parameters read from the deployment line, the installed stacks with the testnet-tree switch, the per-page scripted stacks, the fake node's identity verdicts, the access test judged by the deployed method's verify view, the phone device and the in-page prover device of the ceremony tab, the QR image decoder with capped passes, the tab's blocks split out of `CeremonyScreen`, `methodKindIn` in place of five copies; five rounds, four tester rounds, three independent-review threads, two CodeRabbit threads and two of the owner's, all fixed). #136 PT-069 at 8ee6ade659 (the passport and Aadhaar rows at enrollment: the four verdicts, the rejected cause line, the declined note, the disclosures and the publication line, the review path's publication line, the credential to replace read at the launch, the report checked for liveness before it is consumed; seven rounds, four threads fixed). #135 PT-070 at 3e7d02e4fa (the two rows at recovery on the checklist: the claims through the ceremony tab, the cause line only for a refused check or material, a reply bound to its stored request, one request per retry; seven rounds, two threads fixed). #138 FU-AW at 9f6b9fc366 (the walk's four follow-ups: the recover door sends a wallet with a keystore to the logged-in entry while a fast-track install keeps the account step, the add menu's entry disabled with its line where the deployment names no method, the start-over note's passkey sentence only with a passkey, the threshold clamped on the holder's Remove, one acknowledgment tick on every route, the plain removal kept in the management editor; five rounds, one thread fixed). #139 FU-AX at 22124ff2ff (the loading states: `LoadingBlock` and `RefreshingLine`, the `socialRecovery.loading` keys, the last known value kept with the decisions held and a refreshing line, the wait record's executable time, the chapter lines amended; eight rounds, part D's fixes, three independent-review threads fixed). The final tree equals the last gated lane's. #140 FU-AY on `dev/wonderland` at 37c66995d7 (2026-10-23, the train): the zkPassport walk's follow-ups in the ceremony tab: a revert of the verify view with its own cause and line; a limit of 180 s after the phone's handshake that reads "did not answer" with retry; the scan-once line under the code; the access test's own purpose string; the bridge closed on Cancel and after a result; four new strings under `socialRecovery.ceremony`). Not yet open as a PR; two rounds each verified, the independent review found nothing, one CodeRabbit nitpick. |

## Rulings of M-12 (2026-10-21 to 2026-10-23)

- The split (2026-10-21): a setup PR, an identity-hosts PR, PT-069 and PT-070 stacked on it, a board PR.
- The two peers as direct pinned dependencies with the lockfile written by hand; webpack resolves the SDK's dynamic imports at build time, so they cannot stay optional (2026-10-21).
- The phone device is a new adapter of the ceremony tab (the passkey's hybrid hand-off does not serve zkPassport's bridge); the tab runs in the holder's own full tab (2026-10-21).
- The access test of an identity method is judged by the deployed method's verify view (an eth_call through the extension's own read) when the SDK's local verdict is not a judgement; a test that cannot be read stays unavailable with retry (2026-10-21).
- The Aadhaar method stays; the chapter's discouraged line and badge are dropped (the Sepolia module holds the authority's current key, read on chain on 2026-10-21).
- The scripted stacks and the fake node's identity verdicts live in production code behind the absent deployment, like the fake node; they never run on a deployed chain (2026-10-21).
- The per-chain method parameters ride the deployment line (`zkPassportDomain`, `zkPassportScope`, `zkPassportTestnetTree`, `aadhaarNullifierSeed`, `aadhaarCertificate`, each pair given together); a Sepolia test sets the testnet-tree switch so a real passport's proof carries the root the Sepolia verifier holds (2026-10-21).
- The SDK's exports map gains a `default` condition (option (a), the owner to the SDK team, 2026-10-21).
- Every rejected identity proof reads "did not pass the method's own check" (the SDK answers one cause for a failure, a refused local check and a mismatch) (2026-10-21).
- The SDK base move (the owner, 2026-10-22): "move the base to 08480f5", its own PR ahead of the task PRs; the two string Lows of part A ride the open PRs; part B after the independent review and before the merges.
- The owner's answers to the SDK team's batch 4 and batch 5 owner blocks (2026-10-22): a manual publish of 0.0.2-alpha.0 from `wonderland/dev`; the `default` condition on both entries; `onResult`, the two bridge members and `cancelRequest` declared on the zkPassport request; one later task for a dev-mode option on `zkPassportMethod` and a test-mode option on `anonAadhaarMethod`; the `METHOD_AADHAAR_*` constants exported from the second entry; the kit hosts no artifacts; the prover's worker accepted as a chapter delta ("the abort answers at once and the computation ends on its own. No task."); Q-22's re-check party is the contracts team, before the showcase.
- The cause line only for a refused check or material (2026-10-22, on CodeRabbit's thread of #135): the cause line shows "only for check-rejected and material-rejected"; a thrown read and the other failures keep their own chip with no cause line.
- The parameters from the deployment line, never a record (2026-10-22, on the independent review of #134): the resolver reads the method parameters "from the client in the tab, refuse when absent"; the passkey keeps its stored parameters.
- A claim's reply is bound to its stored request (place, method, config, attempt, account, chain); a reply that does not match is refused as a failed check with retry, never dropped in silence (2026-10-22, on the independent review of #135).
- The walk's four follow-ups in one PR (the owner, 2026-10-22): the recover door, the add menu, the copy, the threshold clamp, as FU-AW. The one tick (2026-10-22): "the logged-in entry accepts the door's acknowledgment (one tick on every route; the chapter line about 501 amended)"; the arrival state is read once and dropped on a reload.
- The plain removal through a prop (2026-10-22, on the independent review of #138): the management editor's Remove stays a plain removal through a `plainRemoval` prop on the shared `EditorView`; the clamp is the setup holder's Remove only.
- The loading rule (the owner, 2026-10-22): "no bare spinner; optimistic UI where the last state can stay while refetching; else a centred spinner with a message of what it does". The owner's pattern everywhere a last known value exists ("the content stays, the decision buttons disabled, a refreshing line"), "including the three chapter places (the checklist's first load, the cancel's arrival read, the guardian page: the chapter lines amended)"; "the wait record stores the execution time"; one PR, stacked on the last PR of the train, which became linear (#134, #136, #135, #138, then FU-AX).
- The later polls (2026-10-22): the later polls of the wait, the checklist and the band gain the refreshing line, and their decisions are held until the poll answers (the walk's two Highs and the third review's band thread, settled by the chapter's lines on the checklist and the wait).
- Abandon stays open during a poll (2026-10-22): it is not a decision on the read's answer.
- The overview's notices read gets its own line and holds the path actions while it reads (2026-10-22).
- The manage editor's Cancel like the setup editor's Back (2026-10-22): "match S5, Cancel enabled" during the editor's check; the Change buttons are held.
- The merge word (the owner, 2026-10-23): the five-lane train runs.
- The zkPassport walk's follow-ups (the owner, 2026-10-23): the revert's own line, the limit after the handshake and the scan-once line in one PR after the train (FU-AY), and the access test's purpose and the bridge's close ride it too; the limit is 180 s after the handshake (the passkey hand-off's precedent), restarted by each step from the phone, with no limit before the handshake; the preparing line needs no code (the plan corrected); the version comparison goes to the SDK team; the accepted circuit version goes to the contracts team.

## Open with others

| Question | Owner | What the code does meanwhile |
| --- | --- | --- |
| The zkPassport request type: `onResult`, the bridge members and `cancelRequest` declared (batch 5, item 1; the owner's answer of 2026-10-22) | sdk owner | A local widening of the request type; FU-AY closes the bridge through the library's own `cancelRequest` |
| A dev-mode option on `zkPassportMethod` and a test-mode option on `anonAadhaarMethod`, one later task (batch 5, items 3b and 4) | sdk owner | The stack wrapper passes the testnet-tree flag to the request; the chain decides a test-key proof |
| The `METHOD_AADHAAR_*` constants exported from the second entry (batch 5, item 6) | sdk owner | The extension names the project's artifact server, chunked |
| Batch 6: `validateSetup` and counterfactual accounts; a separate cause for a mismatched identity (part B); a stale Aadhaar QR refused before the proving step | sdk owner | The wallet's own fit check; one material-rejected cause reads the method's own check; the SDK proves a stale QR and then refuses it |
| Batch 7: the proof's circuit version on the reply or the material, and a decoder of the accepted version from the trusted keys, or a typed unsupported-version refusal | sdk owner | FU-AY reads a revert of the verify view as its own line; no version comparison before the call |
| The peer's bridge refuses a second handshake by a reference comparison of the keys, and the SDK does not subscribe the bridge's error event, so the refusal reaches no callback (to report upstream) | sdk owner | FU-AY's limit after the handshake ends the wait with retry; the scan-once line |
| The zkPassport method's Safe moves its trusted keys to circuit 0.21.1 (part C, C1; passed by the owner on 2026-10-23) | contracts team | Every passport access test and recovery is refused on Sepolia and mainnet |
| A standing watch on zkPassport's registry root on both chains (zkPassport ships circuits about monthly; each release blocks the passport method until the Safe moves) | contracts team, owner | Nothing; the check runs before a deployment only |
| The part C rerun after the Safe move (the access test, the save, the claim, the submission and the execution with a real passport; whether a testnet-tree request passes the Sepolia verifier, batch 5 item 3a) | owner, sdk owner | The passport path is unwalked past the enrollment on a real chain |
| The alpha publish (0.0.2-alpha.0, after PR #42) and the attempt-id writes (FU-AN, FU-AO) | sdk owner, owner | The packed local build at 08480f5 carries the SDK's PR #42 write fixes; the owner's cancel, the clear and the removal on Sepolia wait for a walk that confirms them (FU-AO) |
| The pre-showcase repeat read of the Aadhaar modules' keys (Q-22), now with the zkPassport method's accepted circuit version | contracts team | The Sepolia Aadhaar module holds the DS UIDAI 06 key (read 2026-10-21) |

## Recorded, not started

- The unified private credential guard: `isStoredCredential` in `shared/records/records.ts` and the private guard of `management/editor/session.ts` become one.
- The unread keys `disclosures.items.passport` and `disclosures.itemsLead.passport` dropped in a setup PR.
- `ceremony.noMatchCause` has no caller until the SDK gives a separate mismatch cause (batch 6).
- `IDENTITY_SLUGS` in `shared/client` repeats `IDENTITY_KINDS` of `recovery/done/constants.ts` (`shared/client` must not import a screen folder).
- The guardian page maps a permanent `DeploymentRefusal` to the failed state with a retry that cannot succeed (`ApproveScreen.tsx`, from before M-12).
- Two older inline test types: `edit-screen.test.tsx:365`, `running-attempt.test.tsx:531`.
- The fast-track tests compare literal English.
- `attempt-read.test` mounts two probes in parallel.
- The `firstReadFrom` ref takes the view's render clock, a few ms after the read's own clock; a deadline in that window waits for the next period.
- `gathering` as a dependency asks one extra coalesced read.
- `pathSetup.current` is written during render.
- Two passkeys of one path on one device collide.
- The version comparison before the verify view call, once the SDK exposes the proof's version and the accepted one (batch 7).
- `takeCeremonyReport` has no production caller left in the module (the tests and the harness use it).
- The band's handler early returns are untested (a disabled button never calls its press).
- The walks' Lows: a phone error at the access test reads failed where the chapter reads a test that could not run as unavailable (part A); about one to two seconds of the generic in-progress chip before the tab's first line (parts A and C); a Tested row keeps "Access test / Recommended" with no passed note (part B, as designed); the waiting-period chips stay in hours in a build with the minutes floor (part B, as designed); a 5-minute test wait ends between the watcher's 30-minute polls, so the band does not show (part B, as designed).

## Facts the next session should not rediscover

- The SDK proves a stale Aadhaar QR before it refuses it (the freshness check runs after the proving step).
- The Aadhaar artifacts download in about 42 s per profile (under a second once cached); a proof takes 15 to 18 s; the chain's verify view under a second.
- A zkPassport circuit release blocks every passport test and recovery until the method's Safe moves the trusted keys; committed configs name no version, so an enrolled passport keeps working after the move with no rebuild.
- The zkPassport app proves with the latest circuits whatever SDK version made the request.
- The per-page fake node empties on a reload; a walk that reloads re-seeds it by hand and can read a landed save as a mismatch.
- A rebase can mis-merge an import line with no conflict marker; the restack rounds run tsc before the hand-back.

---

The state of the work after the SDK adoption (FU-U, outside the milestones), 2026-10-21; it started from `dev/wonderland` c483d0d223 (M-11 round 1 and its board). This task's log is `briefs/sdk-adoption/LOG.md` beside its briefs in the coordinator's worktree (`.claude/worktrees/social-recovery-sdk-adoption-297429`); the M-11 log stays in the M-11 coordinator's worktree under `briefs/m11/LOG.md`. The next milestone is M-12 (zkPassport and Aadhaar, PT-069 and PT-070), on the owner's word; this task gets no freeze or upstream draft of its own and rides M-12's.

## The board (the SDK adoption)

| Column | What is in it |
| --- | --- |
| Ready | M-12 on the owner's word; the alpha swap (FU-AN) once `@kohaku-eth/social-recovery` is on npm; the follow-ups recorded below. |
| Running | Nothing. |
| Awaiting review | This board's docs PR (`docs/social-recovery-sdk-adoption`). |
| Blocked | The owner's cancel, the clear and the removal on Sepolia: the deployed `cancelByOwner` and `clearSetup` take an attempt id and the SDK at 479252c still encodes the address alone, so the three writes revert until the SDK changes (FU-AO). |
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
| The npm alpha publish with a `default` export condition, the viem range note | sdk owner | The placeholder 0.0.1 and the local build (the module's README) |
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
