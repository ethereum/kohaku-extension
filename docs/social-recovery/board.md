# Social recovery board

The state of the work at the end of milestone M-7 (2026-10-05), written as the hand-off to the next coordinator session. It replaces the M-6 board. Read it with `CLAUDE.md`, the coordinator command (`.claude/commands/social-recovery-coordinator.md`) and `docs/social-recovery/tasks/README.md`. The running log of M-7 (every round, gate and ruling in order) stays in the M-7 coordinator's worktree, `.claude/worktrees/social-recovery-m7-b1d1ce/docs/social-recovery/board.md`, with its briefs under `briefs/m7/`; open it only for a detail this board does not carry.

## The board

| Column | What is in it |
| --- | --- |
| Ready | M-8's free tasks: PT-052 the recover door and the warning gate, PT-053 the fast track's three steps, PT-061 the wait and its endings, PT-062 the done screen (each once its dependencies merge). M-8's setup PR comes first. |
| Running | Nothing. |
| Awaiting review | Nothing on the fork. Upstream: ethereum/kohaku-extension#251 (M-6) and #253 (M-7), both drafts, the owner marks them ready. |
| Blocked | PT-058 (the reply's shape and its verify: questions 4 and 6, sdk owner); PT-075 (the recovered key's signing lives in kohaku-commons, and its test vector has no producer: question 17); PT-056 in part (the public shape note's format, sdk owner). |
| Merged | M-6 (13 commits) and M-7 (48 commits) on `dev/wonderland`, at f84abe36a before this board's own PR. |

Waiting on the owner at M-7's end: his manual test with the README's section "Account recovery: manual test against a fork", the persona replay, and marking #251 and #253 ready.

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
