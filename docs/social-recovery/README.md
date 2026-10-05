# Social recovery

The design and the task split of the social recovery feature of the Kohaku extension, copied into this repository so the people and the agents that implement it read the text beside the code.

## Where the text comes from

The design was written in `defi-wonderland/mast-social-recovery-2`. That repository stays the design tool. The implementation runs on the Wonderland fork `defi-wonderland/kohaku-extension`, on the branch `dev/wonderland`, one pull request per task. At the end `dev/wonderland` goes upstream to `ethereum/kohaku-extension` as one pull request. Changes to the account library go the same way through `defi-wonderland/kohaku-commons`.

The fork's branch `wonderland/recovery-v0` (June 2026) holds an earlier recovery prototype, an in-extension activate and recover GUI with account-library changes for a recovery controller. It is evidence for the proof of concept D-316 schedules and for the create door, the arming save and the signing repair. It is not a base for this work.

Every file under `design/` is a verbatim copy from branch `dev` of the design repository at commit `bd8780f7ad59a451035b15920c00015a2eee6e9b` (2026-09-24), with two exceptions. `design/ux.md` carries one extra paragraph in D-316, the proof-of-concept paragraph of pull request #54 of that repository, which was open at the time of the copy. `design/live-frame-strings.md` is that repository's `design-context/spec-v1/ux/research/live-frame-strings-2026-09-22-r30.md`, renamed. The design is frozen at that commit. A correction to the design is a change in that repository first and a fresh copy here second, so this folder never drifts silently.

Every file under `tasks/` comes from `design-context/spec-v1/cut-provisional.yaml` at commit `352f91a` (pull request #47 of that repository). The ids `PT-035` to `PT-070` and `PT-075` are provisional. The cut was never materialized, so a task is named by its id and its title together.

Only the files the implementation reads are here. The personas, the requirements, the stories, the scenarios, the PRD and the research notes stay in the design repository; the ux owner replays the persona journeys by hand once per milestone from there.

## How to read it

1. `design/ux.md` is the ux chapter, sections D-300 to D-399. D-312 is the decision record with dated entries. Where any other text and the chapter differ, the chapter is the rule.
2. `design/ux-interfaces.md` (D-370 to D-376) names what the extension consumes from the SDK. `design/sdk.md` (D-200s) is the SDK design those interfaces rest on; its D-201 declares the twelve SDK interfaces the doubles imitate. `design/contracts.md` (D-100s) is the contract design the tasks cite as D-102 to D-111.
3. `design/invariants.yaml` holds the ux invariants I-23 to I-48 the tasks list, and `design/open-questions.yaml` the questions that still gate a task (Q-13 for the watcher, Q-22 for the identity methods).
4. `design/ux-copy.md` is the copy rulebook every shipped string follows.
5. `design/frame-register.md` lists every wireframe with its code and band, and `design/live-frame-strings.md` holds every string of every frame, which is where a screen's copy comes from. The wireframe file itself is not copied. Where a frame and a chapter sentence differ, the chapter is the rule.
6. `tasks/README.md` lists the 37 tasks by start round and the open questions with their owners. Each task file holds the header, the done entries and the body verbatim, with `src/ux/...` rewritten to `src/web/modules/social-recovery/...`, and ends with the deltas found against the chapter at the commit above.

## Rules the implementation keeps

- Screens build and test against the SDK doubles of PT-035 until the SDK lands. Screens import the extension's own client layer (PT-038), never the doubles directly, so the swap to the real SDK touches one folder.
- The SDK interfaces the doubles imitate are the ones `design/sdk.md` D-201 declares. The builder hands an integrator `IMethodModuleReads`, never `IPolicyManagerInteractor`, and `IRecoveryActionInteractor`, never `IRecoveryActionArming`.
- Records live in the extension's local storage and never in a background controller (D-310).
- Ceremonies that die on focus loss run in a full tab, never in the action popup (D-316).
- Every holder-facing build carries one manifest public key (D-312, 2026-09-23), since the passkey relying party is the extension's own origin.
- Every shipped string follows `design/ux-copy.md`.
