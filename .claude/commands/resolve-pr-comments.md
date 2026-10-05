Interactive workflow to fetch, validate, categorize, and plan fixes for unresolved PR review comments.

## Arguments

- `$ARGUMENTS` — The PR number (e.g., `488`).

## Overview

This command is designed for **plan mode** — it generates a phased fix plan that the user can review and execute separately. The workflow:

1. Fetches all unresolved review threads, standalone PR comments, and review summary bodies via GitHub GraphQL API
2. Explores codebase context for each commented file
3. Validates each comment against current code with user confirmation
4. Replies to false positives / already-fixed comments with technical explanations
5. Categorizes remaining valid comments by impact
6. Asks the user about each category in batches
7. Generates a dependency-ordered fix plan

---

## Phase 1: Fetch & Parse Review Threads

Accept `$ARGUMENTS` as the PR number. Extract the repository owner and name from the git remote:

```bash
git remote get-url origin
```

Fetch all review threads using the GitHub GraphQL API. Use pagination (`after` cursor) to handle PRs with many threads:

```bash
gh api graphql -f query='
{
  repository(owner: "OWNER", name: "REPO") {
    pullRequest(number: PR_NUMBER) {
      id
      reviewThreads(first: 100) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          subjectType
          comments(first: 50) {
            pageInfo { hasNextPage endCursor }
            nodes {
              body
              author { login __typename }
              path
              line
              originalLine
              startLine
              createdAt
              databaseId
            }
          }
        }
      }
    }
  }
}'
```

If `pageInfo.hasNextPage` is true, fetch the next page using `after: "CURSOR"`. Repeat until all threads are fetched.

Similarly, if a thread has more than 50 comments, paginate using the same `pageInfo` / `after` pattern on the `comments` connection.

**Filter** to only unresolved threads (`isResolved: false`).

### Fetch Standalone PR Comments

Also fetch standalone PR conversation comments (comments on the PR itself, not on specific code lines) using a second query:

```bash
gh api graphql -f query='
{
  repository(owner: "OWNER", name: "REPO") {
    pullRequest(number: PR_NUMBER) {
      comments(first: 100) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          body
          author { login __typename }
          createdAt
          databaseId
        }
      }
    }
  }
}'
```

Paginate if `pageInfo.hasNextPage` is true. Parse each standalone comment into the same structured record format with `subjectType: "ISSUE_COMMENT"` and `file`/`line` set to null. Exclude comments authored by the current user (the PR author).

### Fetch Review Summary Bodies

Reviewers sometimes leave substantive feedback in the **review summary body** — the text submitted alongside an Approve / Comment / Request-changes review (e.g. "holding approval until X is fixed"). This is a **third, separate location**: it is NOT a `reviewThread` and NOT an issue `comment`, so the two queries above miss it entirely. **Fetch it** so this feedback isn't silently dropped:

```bash
gh api graphql -f query='
{
  repository(owner: "OWNER", name: "REPO") {
    pullRequest(number: PR_NUMBER) {
      reviews(first: 100) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          author { login __typename }
          state
          body
          createdAt
        }
      }
    }
  }
}'
```

Paginate if `pageInfo.hasNextPage` is true. Skip only:

- reviews with an empty `body` (an Approve with no comment), and
- automated status output that isn't review feedback — CI check results, Terraform-plan posts, dependency/security bot notices, and the like (the same skip applies to the standalone-comments fetch above).

**Keep everything else**, including the **current user's own reviews** (a PR author's self-review notes are valid feedback — the already-answered pre-filter separately handles their "fixed in `abc1234`" *replies*) and **substantive bot reviews** like CodeRabbit's (they often surface real issues; treat them as a reviewer, with human comments taking priority on overlap).

Parse each surviving review into a record with `subjectType: "REVIEW_BODY"`, `file`/`line` set to null, and `author`/`body`/`state`/`createdAt` from the review. Use `state` to gauge urgency — `CHANGES_REQUESTED` / `COMMENTED` reviews are the ones holding approval; an `APPROVED` body is usually informational. A review's own node id is a `PRR_...` id (a Pull Request **Review**), which is **not** a replyable thread — to respond you post a top-level comment against the PR's `PR_...` node id (see Phase 4), so no `threadId` is stored for these.

**A single review body often bundles several distinct points** (e.g. "1. this test fails … 2. naming is inconsistent … 3. handbook drift"). Decompose it into one finding per point so each is validated, categorized, and tracked separately in Phases 3/5/9 — do not treat the whole review as one opaque comment. Group `REVIEW_BODY` findings with the **"General Comments"** category (Phase 6) when a point has no specific code location.

**Parse each thread** into a structured record:

| Field          | Source                                                          |
| -------------- | --------------------------------------------------------------- |
| `threadId`     | `node.id`                                                       |
| `author`       | First comment's `author.login`                                  |
| `isBot`        | `author.__typename === "Bot"`                                   |
| `subjectType`  | `node.subjectType` (`LINE`, `FILE`, or `PR`)                    |
| `file`         | First comment's `path` (null for PR-level threads)              |
| `line`         | First comment's `line` (null for PR-level/file-level threads)   |
| `originalLine` | First comment's `originalLine` (fallback when code has shifted) |
| `startLine`    | First comment's `startLine` (for multi-line comments)           |
| `body`         | First comment's `body`                                          |
| `replies`      | Subsequent comments in the thread                               |

**Threads without `path`/`line`** (`subjectType: "PR"` or `"FILE"`): These are general discussion threads. Group them into a separate **"General Comments"** category presented after all code-level categories in Phase 6. Present them with their body text only (no file/line reference).

### Pre-filter: Auto-detect already-answered threads

Before presenting the summary, scan each thread's `replies` for responses from the PR author. If the PR author already replied indicating the issue is fixed (e.g., "Fixed in `abc1234`", "Done", "Addressed in commit...") **and** there is no subsequent follow-up from the original reviewer pushing back, auto-classify the thread as **"Already answered"** and separate it from the unresolved list.

**Present summary** to the user:

```text
Found N unresolved review threads (X human, Y bot) across Z files, plus M standalone PR comments and R review summary bodies.
Of these, A threads already have fix replies from the PR author with no reviewer pushback.
```

Then present the already-answered threads in a **single batch** for quick confirmation:

```text
The following A threads already have fix replies from the PR author with no reviewer pushback:

T1: "Reorder summary" — replied "Fixed in 52e868b2"
T2: "Thread organization" — replied "Yes, GraphQL handles this"
T3: "Filter answered threads" — replied with design rationale
...

Confirm all as "Already answered"? (yes / list any to reclassify)
```

After confirmation, **remove confirmed already-answered threads** from the working set. Only present the remaining truly-unresolved threads in the next question.

**Use `AskUserQuestion`** to ask (only if there are remaining threads after pre-filtering):

- "Here are the remaining N unresolved threads (after filtering A already-answered). Do you want to process all of them, or exclude specific ones? (List thread numbers to exclude, or say 'all')"

Do NOT proceed to Phase 2 until the user confirms which threads to include.

---

## Phase 2: Explore Codebase Context

**Use Explore subagents** (in parallel where possible) to read:

1. **Each file referenced by the comments** — read the full file, not just the commented line. Understand the surrounding context.
2. **Related patterns** — if a comment references an interface, provider, or pattern, read the exemplar files to understand what the reviewer expects.
3. **Existing conventions** — read `.claude/commands/social-recovery-coordinator.md`, `docs/social-recovery/design/ux-copy.md` and the task file under `docs/social-recovery/tasks/` to understand the conventions and the design sections that may be relevant to the comments.

Build a context map: for each thread, note:

- Current state of the code at the commented location
- Whether the comment references a pattern that exists elsewhere in the codebase
- Related files that would need to change if the comment is addressed

---

## Phase 3: Validate Comments Against Current Code

### Validation (remaining threads after Phase 1 pre-filter)

**Use subagents** to parallelize validation. Spawn one subagent per commented file (or group of threads on the same file) to:

1. Read the commented file and surrounding context
2. Classify each thread as Valid / Already fixed / False positive
3. Return compact results: `{threadId, file, line, classification, reasoning, codeSnippet}`

The main context receives the compact results and presents them to the user in batches via `AskUserQuestion` (see below). This keeps the main context window lean while subagents handle the heavy file-reading work.

For each **code-level thread** (has `file` + `line`), **read the commented file at the specific line** and classify the comment.

For **PR/file-level threads** (no specific line), classify based on the comment body and overall PR context — skip the code snippet section in the template below.

### Classification Rules

**Valid (needs fix):**

- The issue described in the comment is still present in the current code
- The code does not match the pattern or convention the reviewer is requesting

**Already fixed:**

- The code has already been changed to address the reviewer's concern (e.g., a subsequent commit fixed it)
- The line numbers may have shifted, so check by content, not just line number

**Unsure:**

- The agent cannot confidently classify the comment as valid, fixed, or false positive
- The comment is ambiguous, references unfamiliar context, or has multiple valid interpretations
- When unsure, present the thread to the user with extra context (related files, patterns) and **no pre-classification** — let the user decide. Subagents may retry with additional codebase context before escalating to the user.

**Defer (valid but do later):**

- The issue described in the comment is valid but not worth addressing in this PR
- The fix is non-trivial or out of scope for the current changes
- Track deferred threads separately in the checklist as "Deferred — valid, tracked for future PR"
- When replying to deferred threads, explain why it's deferred and note it will be addressed in a follow-up

**False positive:**

- The reviewer's suggestion is incorrect or based on a misunderstanding
- The code is already correct and follows the established pattern
- The comment requests something that conflicts with project conventions (e.g., CLAUDE.md rules)

**Present each comment individually** using `AskUserQuestion`. For **each** thread, show:

**For code-level threads:**

````text
Thread #N by {author} on `{file}:{line}`:
> {quoted comment body}

**Current code at that location:**
```{language}
{relevant code snippet around the commented line}
```

**My classification:** {Valid | Already fixed | Defer | Unsure | False positive}
**Reasoning:** {Explanation with code references}

Do you agree? (yes / reclassify as: valid | fixed | defer | false positive)
````

**For PR/file-level threads** (no specific line):

```text
Thread #N by {author} (PR-level / file-level):
> {quoted comment body}

**My classification:** {Valid | Already fixed | Defer | Unsure | False positive}
**Reasoning:** {Explanation referencing PR context}

Do you agree? (yes / reclassify as: valid | fixed | defer | false positive)
```

Do NOT batch these — ask about each comment individually so the user can inspect the code context and reasoning per thread. Collect all confirmed classifications before proceeding.

Do NOT proceed to Phase 4 until all threads have been individually confirmed.

---

## Phase 4: Reply to Invalid / Already-Fixed Comments

For each thread classified as **false positive**, **already fixed**, or **deferred**, draft a reply comment.

### Reply Format

**Technical explanation style** — concise, code-reference-heavy. Examples:

- False positive: "This follows the rule in `docs/social-recovery/design/ux.md` D-310 — records live in the extension's local storage and never in a background controller. See `src/web/extension-services/background/webapi/storage.ts` for the wrapper the module uses."
- Already fixed: "This was addressed in commit `abc1234` — `file.ts:42` now uses `symbol.toUpperCase()` to normalize the input before lookup."
- Deferred: "Valid point — this is out of scope for this PR but tracked for a follow-up. The current implementation works correctly; the improvement will be addressed in a dedicated PR."

### Approval Flow

For **each** draft reply, **use `AskUserQuestion`** to show:

```text

Thread #N by {author} on {file}:{line}:

> {quoted comment body}

Classification: {false positive | already fixed}

Draft reply:
"{reply text}"

Approve this reply? (yes / edit / skip)

```

- **yes** — post the reply via `gh api`
- **edit** — user provides edited text, then post
- **skip** — do not reply; track the thread separately for the final checklist, but do not include it in the fix list

### Posting Replies

Post approved replies using the GitHub GraphQL API:

```bash
gh api graphql \
  -F threadId="THREAD_ID" \
  -F body="REPLY_TEXT" \
  -f query='
mutation($threadId: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: {
    pullRequestReviewThreadId: $threadId,
    body: $body
  }) {
    comment { id }
  }
}'
```

Replace `THREAD_ID` with the thread's `id` field (e.g., `PRRT_kwDO...`). The `-F` flag handles escaping automatically.

For **standalone PR comments** (`subjectType: "ISSUE_COMMENT"`) **and review summary bodies** (`subjectType: "REVIEW_BODY"`), use the `addComment` mutation instead — a review body is not a thread, so `addPullRequestReviewThreadReply` does not apply to it:

```bash
gh api graphql \
  -F subjectId="PR_NODE_ID" \
  -F body="REPLY_TEXT" \
  -f query='
mutation($subjectId: ID!, $body: String!) {
  addComment(input: {
    subjectId: $subjectId,
    body: $body
  }) {
    commentEdge { node { id } }
  }
}'
```

Use the pull request's node ID as `subjectId` — captured by the `id` field on the `pullRequest(...)` selection in the Phase 1 review-threads query (e.g. `PR_kwDO...`). For an `ISSUE_COMMENT`, prefix the reply body with `> {quoted original comment}\n\n` to make the context clear. For a `REVIEW_BODY`, instead `@`-mention the reviewer and address each decomposed point in one consolidated comment (since the body bundled several), referencing the fix commit per point.

**Remove all false-positive/already-fixed/deferred threads** from the fix list. Track replied ones as "Replied as false positive"/"Replied as already fixed"/"Replied as deferred", and skipped ones as "Unreplied false positive"/"Unreplied already fixed"/"Unreplied deferred" for the final checklist.

---

## Phase 5: Categorize Valid Comments

Categorize the remaining valid comments into the following impact-ordered groups. **Only include categories that have at least one comment** — skip empty categories entirely. Process in priority order (highest impact first):

| Priority | Category          | Description                                                   | Example                                                |
| -------- | ----------------- | ------------------------------------------------------------- | ------------------------------------------------------ |
| 1        | Architecture      | Structural issues, circular deps, barrel exports, DI          | "Import from barrel instead of direct file"            |
| 2        | Error Handling    | Missing error types, unsafe messages, silent failures         | "Use ActionInputError, not ActionExecutionError"       |
| 3        | Performance       | Batching, rate limits, pagination, caching                    | "Batch API calls to avoid 429s"                        |
| 4        | Type Safety       | `any` types, missing Zod validation, unsafe casts             | "Use `unknown` instead of `any`"                       |
| 5        | Code Organization | File structure, naming, constants placement                   | "Move constant to constants.ts"                        |
| 6        | Testing           | Missing tests, weak assertions, test patterns                 | "Use toHaveBeenCalledWith instead of toHaveBeenCalled" |
| 7        | Documentation     | JSDoc, inline comments, README updates                        | "Add JSDoc to exported function"                       |
| 8        | Infrastructure    | CI/CD, env vars, manifest, build config                       | "Move the key to the build configuration"             |
| 9        | Style             | Formatting, naming conventions, cosmetic                      | "Rename variable for clarity"                          |
| 10       | General Comments  | PR-level or file-level threads without specific code location | "Consider splitting this PR into smaller changes"      |

### Merging Overlapping Comments

When **both a human reviewer and a bot** comment on the same issue:

- **Use the human reviewer's framing** as the primary description
- Note the bot's additional context as supplementary information
- Reference both thread IDs in the fix entry

---

## Phase 6: Interactive Decision-Making

For each category (in priority order), present the comments in **batches of 3-4** using `AskUserQuestion`.

### Batch Format

```text
## Category: {Category Name} ({N} comments)

### Comment 1 of N
**Thread #{id}** by {author} on `{file}:{line}`
> {quoted comment body}

**Impact analysis:** {Brief explanation of what this affects and why}

**Options:**
A) {Concrete fix description} — {tradeoff}
B) {Alternative approach} — {tradeoff}
C) Skip — {reason this might be acceptable}

---

### Comment 2 of N
...

### Comment 3 of N
...

What are your decisions for comments 1-3? (e.g., "1:A, 2:B, 3:C")
```

**Rules for presenting options:**

- Always include at least one concrete fix option with specific file paths
- Always include a "Skip" option with justification
- For comments that conflict with CLAUDE.md or project conventions, note the conflict explicitly
- For comments that require changes to multiple files, list all affected files

**After each batch**, collect the user's decisions before presenting the next batch.

---

## Phase 7: Dependency Analysis

After all decisions are collected, build a **dependency ordering graph** for the fixes:

1. **Group fixes by file** — changes to the same file should be in the same phase
2. **Order by dependency** — if fix A changes an interface that fix B depends on, A comes first
3. **Identify independent fixes** — fixes with no dependencies can be parallelized

Present the dependency analysis:

```text
Dependency order:
1. Architecture fixes (barrel exports, interfaces) — must be first, other fixes depend on import paths
2. Error handling fixes — may affect test expectations
3. Performance fixes — standalone, can parallel with 4-5
4. Type safety fixes — may affect test types
5. Code organization fixes — standalone
6. Testing fixes — must come after code changes they test
7. Documentation fixes — standalone, can be last
8. Infrastructure fixes — independent of code changes
9. Style fixes — cosmetic, always last
```

---

## Phase 8: Command Gap Analysis (Optional)

**Use `AskUserQuestion`** to ask:

```text
All comment decisions are collected. Would you like me to check if any of the
review comments reveal gaps in `.claude/commands/` files?

For example, if reviewers flagged import paths that the coordinator command
doesn't enforce, I'll identify which command files need updates.

(yes / no)
```

If the user says **yes**:

1. **Use an Explore subagent** to read all `.claude/commands/*.md` files
2. For each valid comment that was accepted for fixing, check if the relevant convention is documented in the commands
3. If a convention is missing, note it as a gap:

```text
## Command Gaps Found

| Gap | Command File | Missing Rule | From Thread |
|-----|-------------|-------------|-------------|
| 1   | social-recovery-coordinator.md | Screens import the client layer, never the doubles | T1, T29 |
| 2   | social-recovery-coordinator.md | Every shipped string follows design/ux-copy.md | T22 |
```

4. Add a "Command Updates" section to the generated plan

---

## Phase 9: Generate Phased Fix Plan

Write the plan to the plan file. Structure it as follows:

### Plan Template

````markdown
# Fix Plan: PR #<N> Review Comments

## Summary

- Total threads: N
- Valid (fixing): X
- Replied (false positive/already fixed): Y
- Skipped: Z

## Phase 1: {Category Name}

### Fix 1.1: {Brief description} (Thread #{id})

**File(s):** `path/to/file.ts`
**Change:** {Specific description of what to change}
**Rationale:** {Why, referencing the reviewer's comment}

### Fix 1.2: ...

## Phase 2: {Category Name}

...

## Manual Steps (requires developer action)

- [ ] Update the `.env` file (prohibited for Claude — `.env*` except `.env-sample`)
- [ ] {Any other changes Claude cannot make per CLAUDE.md}

> **Note:** `.env-sample` is safe for Claude to modify directly in fix phases. Only the secret-bearing `.env` requires manual developer action.

## Command Updates (if gap analysis was performed)

- [ ] Update `social-recovery-coordinator.md`: add rule for {gap description}
- [ ] Update the task file under `docs/social-recovery/tasks/`: add the delta for {gap description}

## Thread Coverage Checklist

| Thread | Author | File      | Status                    | Phase |
| ------ | ------ | --------- | ------------------------- | ----- |
| T1     | reviewer | foo.ts:18 | Fix in Phase 1.1          | 1     |
| T2     | bot    | bar.ts:42 | Replied as already fixed  | —     |
| T3     | bot    | baz.ts:7  | Replied as false positive | —     |
| T4     | reviewer | qux.ts:5  | Skipped (user decision)   | —     |
| T5     | reviewer | baz.ts:12 | Deferred (future PR)      | —     |

## Validation

After each fix phase, run:

```bash
yarn test && npx tsc --noEmit && npx eslint <changed files> --ext .ts,.tsx
```

After all phases complete, run the full suite:

```bash
yarn build:web:webkit && yarn test && npx tsc --noEmit && npx eslint ./src/web/modules/social-recovery --ext .ts,.tsx
```
````

### Plan Rules

- Every thread from Phase 1 MUST appear in the Thread Coverage Checklist — no thread should be silently dropped
- Fix phases follow the dependency order from Phase 7
- Each fix entry references the specific thread ID(s) it addresses
- `.env` changes are ALWAYS in "Manual Steps", never in fix phases. `.env-sample` changes are allowed in fix phases.

---

## Phase 9.5: Commit Strategy

Before executing the fix plan, **use `AskUserQuestion`** to ask:

```text
Would you like to create a separate commit for each fix? This allows referencing
specific commit hashes in replies to reviewers. (yes / no)
```

- **yes** — After implementing each fix, create a commit with a descriptive message (e.g., `fix(*): use ActionInputError for input validation`). Store each commit hash for use in Phase 12 replies.
- **no** — The user will commit all fixes together as a single commit after all phases are complete.

---

## Phase 10: Validation

After the plan is generated:

1. **Verify completeness** — count threads in the checklist and confirm it matches the total from Phase 1
2. **Verify no orphans** — every thread has a status (fix, replied, or skipped)
3. **Verify dependency order** — fixes that depend on other fixes come later in the plan
4. **Verify `.env` prohibition** — no fix phase directly modifies `.env*` files (except `.env-sample`)

Present the plan to the user for final review.

---

## Phase 11: Reply to Fixed Threads

After implementing the fixes from the plan and pushing the commits, reply to the threads that were addressed.

### Step 1: Confirm Push

**Use `AskUserQuestion`** to ask:

```text
All fixes have been implemented. Ready to push and reply to reviewers? (yes / not yet)
```

Do NOT proceed until the user confirms the commits have been pushed.

### Step 2: Draft Replies

For each thread classified as **valid** that was included in the fix plan (not threads marked "Skipped"), draft a reply referencing the fix. Use the commit hash and a brief description of what changed.

**Reply format example:**

- "Fixed in [`abc1234`](https://github.com/OWNER/REPO/commit/abc1234) — switched from `ActionExecutionError` to `ActionInputError` for input validation in `factory.ts:42`."
- "Fixed in [`def5678`](https://github.com/OWNER/REPO/commit/def5678) — added barrel export to `external.ts` and updated import in `service.ts:18`."

Construct the commit URL from the repository remote parsed in Phase 1 (e.g., `https://github.com/{owner}/{repo}/commit/{hash}`).

### Step 3: Approval Flow

Present draft replies in **batches of 3-4** using `AskUserQuestion`:

```text
### Batch N of M

**Thread #{id}** by {author} on `{file}:{line}`:
> {quoted comment body}

**Draft reply:** "{reply text}"

---

**Thread #{id}** by {author} on `{file}:{line}`:
> {quoted comment body}

**Draft reply:** "{reply text}"

---

Approve these replies? (all / edit #N / skip #N)
```

- **all** — post all replies in the batch
- **edit #N** — user provides edited text for thread N, then post
- **skip #N** — do not reply to thread N

### Step 4: Post Replies

Post approved replies using the GitHub GraphQL API:

```bash
gh api graphql \
  -F threadId="THREAD_ID" \
  -F body="REPLY_TEXT" \
  -f query='
mutation($threadId: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: {
    pullRequestReviewThreadId: $threadId,
    body: $body
  }) {
    comment { id }
  }
}'
```

For findings sourced from a **review summary body** (`REVIEW_BODY`) or a standalone comment (`ISSUE_COMMENT`), use the `addComment` mutation from Phase 4 instead (`subjectId` = PR node id) — `addPullRequestReviewThreadReply` only works for actual review threads.

Do NOT resolve threads — only post reply comments.

### Step 5: Summary

Present a final summary:

```text
Posted replies to X fixed threads, Y threads skipped.
```

---

## Conventions

- Human reviewer comments take priority over bot comments when both address the same issue
- Reply tone: technical explanation, concise, code-reference-heavy
- Batched questions: 3-4 per batch with author, file, quoted body, impact analysis, and concrete options

---

## Context Management Strategy

For PRs with many threads (>25), the conversation context can overflow. Use the following strategy to keep the main context lean:

### Scratch File

Write intermediate state to a scratch file at `/tmp/pr-{number}-state.md`. The file tracks:

- Thread records (parsed from Phase 1)
- File context map (from Phase 2 Explore subagents)
- Classification results (from Phase 3 subagents)
- User decisions per thread (from Phase 6)

Each phase reads from and writes to the scratch file. The main context only holds: current phase state, user interaction prompts, and compact summaries.

### Subagent Delegation

- **Phase 2:** Explore subagents write their file context findings to the scratch file
- **Phase 3:** Validation subagents write classification results (`{threadId, classification, reasoning, codeSnippet}`) to the scratch file; main context reads compact results and presents to the user
- **Phase 6:** Read decision state from the scratch file instead of relying on conversation history
- **Phase 9:** Read all accumulated state from the scratch file to generate the fix plan

### When to Activate

If Phase 1 finds **25 or fewer** threads, the scratch file is optional — the main context can handle it directly. For **>25 threads**, always use the scratch file to avoid context overflow.
