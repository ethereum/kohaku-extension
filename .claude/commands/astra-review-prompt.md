---
description: Builds the prompt to hand to Astra, the independent reviewer, for one review pass over a set of pull requests, as one fixed-shape block. Use when the user asks for the prompt for Astra, for an independent or second review of the open PRs, or types /astra-review-prompt.
---


# The prompt for Astra's review pass

Astra is a separate reviewer session. It receives one message, the prompt, and then works alone: its own checkout, its own `gh`, one COMMENT review per pull request under the owner's login, one inline thread per finding. It knows nothing of this session, so the prompt is everything it has. A defect in this kind of code is an invariant that fails at one entry point: the page that arrives again, the answer that comes late, the account that changes under the run. A reviewer who walks every invariant through every entry point finds the cell where they meet and writes the test that shows it; a reviewer handed a checklist that restates the design confirms the design. This skill writes the prompt as a matrix per pull request, invariants down and entry points across, with a severity rubric so every cell is reported the same way, and with the posting format the coordinator's scripts and the merge criteria read.

## Step 1, gather the inputs

Before writing, collect, in this order:

1. The pull requests of the pass: `gh pr list` on the fork, then per PR `gh pr view <n> --json headRefOid,baseRefName,headRefName,title,body`. Settle the merge order and, for a stacked lane, the exact range of its own diff and the paths of the lanes below that a three-dot diff would show.
2. The previous Astra prompt, if one exists in the project's notes folder (`ASTRA-PROMPT-*.md`). Its rulings carry forward verbatim unless the owner changed one since. On a first pass there is none; the rulings come from the chat and the PR descriptions.
3. For a re-review: Astra's earlier threads per PR with their last reply (`gh api repos/<owner>/<repo>/pulls/<n>/comments`); each earlier finding names the cell it sat in, and that cell is the first to walk.
4. The owner's rulings given in chat since the previous prompt, each with its date (the chat's date, or the description's where the owner gave none), and the items the PR descriptions record as knowingly open. A choice a lane made and recorded "for the owner" is not a ruling: the reviewer may judge it.
5. The rules of the code: `CLAUDE.md` at the root, the design sections each task cites, the invariants file if the project keeps one, the owner's style wants.
6. The machine's limits that bind the reviewer: the test command, memory, a trap in the test runner's output, whether a node or a fork may be reached, the submodule pin at each head (a fact the reviewer needs, not a method).
7. Per PR: the invariants the task cites (by their identifiers where the project numbers them, else one sentence each) and the entry points its mechanism has (the events that start, restart, interrupt or re-enter it).

## Step 2, write the prompt

The prompt is one block of Markdown with these sections, in this order, under these headings. Nothing before the opening paragraph and nothing after the closing line.

**Opening paragraph (no heading).** "You are an independent reviewer of N open pull requests of <project>, <milestone or theme>." (or "of one open pull request"). For a re-review, one sentence on what happened since ("You reviewed them on <date>; since then every finding was fixed in a round of its lane or answered on its thread, and the owner took N decisions."). Then, verbatim: "You did not write, test or review this code. Review only; change no file, push nothing, approve nothing, merge nothing, resolve no thread."

**## The pull requests, in merge order.** A table: `#`, `PR`, `Title`, `Base`, `Head`, `Own diff` and, for a re-review, `What is new since your review of <date>`. The own diff is one plain `git diff <base>...<head>` command on the refs or the two commits. Where a lane carries the files of the lanes below, say in prose which paths to leave out, never with a shell variable, an exclude block or a code block inside the table: the owner pastes the prompt into a chat and that formatting breaks. Below the table: fetch first; confirm each head with `gh pr view <n> --json headRefOid` and state head, base and range in the summary; the submodule pin at the head, if the project has one; read each description first (the rounds, the rulings, what is knowingly open); read the existing threads and the gate comment so no answered point is repeated; for a PR whose row says nothing is new, post only the summary with its Still open list.

**## What to read before you judge.** One bullet for `CLAUDE.md` with the module's rules enumerated in one sentence. One bullet for the design texts by name and section, with the precedence rule ("the ux chapter is the rule where another text differs from it; the owner's rulings below override the chapter and the task file"). One bullet for the owner's style wants, with the line "a breach of one of these is a Low".

**## The facts you check against** (only when the pass has them). Contract facts, encodings, selectors, topic hashes, protocol constants: things settled by other means that the reviewer cannot derive from the repository.

**## The owner's rulings and the recorded gaps (do not report these as findings).** The rulings, verbatim from the previous prompt plus the new ones with their date; the stand-ins recorded as placeholders; the list "Known and recorded as open, not findings". A ruling left out comes back as a finding or a Still open line, so leave none out.

**## The severity rubric.** Three bullets, fixed: `High`: a write sent twice for one intent, a state reported as done that is not, a secret or a wipe where the condition does not hold, a wrong value signed. `Medium`: a run stuck with no way out, a step the holder must take that is skipped, a stale answer accepted, a failed read rendered as a result. `Low`: a rule of the code broken with no behaviour change, a test that proves less than it says, a string outside its rules.

**## The invariants and the entry points.** The core of the prompt. One subsection `### #n, <title>` per PR. First, the invariants as a numbered list, one line each: the identifier the project gives it (`I-24`) or none, then the sentence with its "never", "only" or "exactly once" ("the setup records are wiped only after the receipt landed and the after-save read says landed and authorized for the same run"). Then the entry points as a lettered list, one line each, written as events in the imperative with the refusal expected: the arrival from the previous step; a reload; a typed URL; back and forward; a remount; an account switch and back while the first account's run is loading or in flight; a second tab; a second press while the first send can still land; a retry; an effect that runs twice; a late answer of an earlier run; a read that fails; a read that never answers; a transaction the node forgets and later mines; a reading at a lower block; a replaced transaction; a wait that sits inside another step, so its own limit never starts; a second account that must never see the first one's secret. Keep the ones the mechanism has and add the ones it invites. Then one sentence: "Walk every invariant through every entry point. Report each cell that fails as one thread, named `<invariant> at <entry point>`; where one defect shows at several cells, one thread names them all. For a cell you could not take to evidence, say so under Could not verify, with the cell's name." For a re-review, add: "Your <severity> of <date> sat in cell <invariant> at <entry point>; round N answers it by <how>. Walk that cell first, then its neighbours (the same invariant at the other entry points)."

Then `**Everywhere.**` as one bullet: behaviour the design does not allow; a banned word in a string (list them); a rule of `CLAUDE.md` broken, and for the test files a pass of their own (a type declared in a test file instead of the harness or fixtures; a relative import where the alias is the rule; a test that restates the implementation or would pass without the code; a table whose rows cannot reach the case its header names); code outside the PR's own folders; a shared file changed outside a setup PR; a screen importing the doubles (static, dynamic or `require`); a claim in a PR description that the code or the tests do not support; a secret, a seed, a password, an RPC URL or a contract address in a log, an error text, a record, a test or a URL.

**## How to check.** The targeted test command and how many at a time; the runner's trap and its workaround; whether a node may be reached (and that no test may). "A cell is checked by a test that drives the entry point at the head, or by the code read from the entry point to the invariant with `file:line` at each step. An independent test that fails at the head is the strongest evidence: write it in a temporary copy of the head, never in the PR's tree, and name its command and its result in the review body. Do not report a finding you did not check against the PR's current head."

**## What to post.** Verbatim, adjusted only in the names:

- On each PR, one review in COMMENT state (never approve, never request changes).
- One inline thread per finding on the line it concerns. The first line of the thread is the severity alone, by the rubric: `High`, `Medium` or `Low`. Then the cell (`<invariant> at <entry point>`); the scenario in which it fails, in plain steps; the rule or design text it breaks, with `file:line`; the correction you suggest. One finding per thread. No praise and no restating of the code.
- The review body starts with `Independent Codex review.` and gives: the scope (head, base, the own-diff range you used); the cells walked, as `<count> of <count>`, with the ones not walked named; the checks you ran with their results; a line `New findings: High N, Medium N, Low N`; a `Still open` list of earlier threads whose reply did not close the point (say why, with evidence; do not repeat the owner's rulings above); and a `Could not verify` list of cells.
- If a PR has no finding, post the review body alone with `New findings: High 0, Medium 0, Low 0`.

**Closing line (no heading).** "Review in the table's order. If time runs short, the order of importance is: <the PRs whose first invariant costs the most if broken, first; for a single PR, its invariants in that order>."

Rules for the content:

- An invariant is a sentence with "never", "only" or "exactly once". A sentence without one is a description, not an invariant; leave it out.
- An entry point is an event, not a state. "A reload" is an entry point; "the page after a reload" is not. An entry point that confirms the design ("the batch is sent once") is not one either; "press Save twice while the first can still land" is.
- Keep each PR's lists short enough to walk: at most eight invariants and twelve entry points. Merge or drop the rest.
- Severity is the rubric's, never the prompt's guess: the prompt names no severity for any cell and hints at no finding.
- Rulings verbatim. Heads at nine hex digits, PR numbers exact, dates absolute.
- One prompt per pass. Save it in the project's notes folder as `ASTRA-PROMPT-<tag>.md`, so the next pass carries its rulings forward.

## Step 3, hand it over

Print the block inside one fenced code block, then one line: "Paste this to Astra as its first message." Then the path where the copy was saved. Nothing else.

## What not to do

- No working-state paragraphs (PROJECT, RULES, the coordinator's method): Astra does not coordinate this session, and a prompt in that shape produced rule-breach Lows and repeated the rulings as Still open.
- No instruction on how Astra sets up its checkout or runs its subagents: its own harness decides that. A fact it needs (the submodule pin, the test command) is not a method.
- No checklist that restates the design or the PR description as things to confirm: the lists are events and invariants, not claims.
- No shell variable, exclude block or code block inside a table.
- No suggested finding and no hint of which cell the author fears, except the re-review's earlier cells.
