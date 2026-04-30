# Smart-Account Follow-Up Implementation Plan

Branch: `smartaccount-prework` (extend or split into `smartaccount-followups`)
Design refs: [roadplan/smart-account-session-key.md](smart-account-session-key.md), [docs/SMART_ACCOUNT_SESSION_KEY_HANDOFF.md](../docs/SMART_ACCOUNT_SESSION_KEY_HANDOFF.md)

Goal: close the v1 gaps identified in the post-implementation review. Five
ordered work items, each independently shippable. Each item lists scope, files,
acceptance criteria, and the test that proves it done.

---

## Session: EIP-7702 browser signing investigation & CLI solution (2026-04-28)

### Context

The onboarding flow (`/onboard`) requires two owner signatures:
1. **`wallet_signAuthorization`** — EIP-7702 code-delegation (delegates EOA to Kernel v3.3 implementation)
2. **`signMessage` / `signTypedData`** — ZeroDev `serializePermissionAccount` enable signature

The core constraint throughout: **the owner's private key must never reach the keeper**. The keeper only holds the session key; the owner key stays with the operator's wallet.

EIP-7702 (not kernel mode) is required because the smart account address must equal the owner's EOA. In kernel mode a separate counterfactual address is created — users would lose direct wallet control over funds at that address.

### Browser wallet compatibility findings

| Wallet | `wallet_signAuthorization` (step 1) | `signTypedData` / `signMessage` (step 2) | Usable? |
|---|---|---|---|
| MetaMask (extension) | ✅ works | ❌ blocks when `verifyingContract` = user's own EOA | No |
| Rabby (extension) | ❌ calls wrong method (`eth_sign7702Authorization`) | — | No |
| Ambire (extension) | ❌ no handler in injected provider (`code 4200`) | — | No |
| Ambire (mobile) | ✅ likely (blog post confirms EIP-7702 support) | unknown | Requires phone + WalletConnect |
| Frame (desktop) | ✅ likely | ✅ likely | Crashes on Mac (memory) |
| Ledger `hw-app-eth` v7.8.0 | ❌ `signEIP7702Authorization` not in npm yet | ✅ | No |
| Safe EIP-7702 | experimental / unaudited; no session key support | — | No |

**Root cause:** `wallet_signAuthorization` is a new EIP-1193 method added post-Pectra. Browser extension providers are only beginning to implement it. No production-ready browser wallet passes both signing steps simultaneously as of 2026-04.

**Why MetaMask blocks step 2:** `serializePermissionAccount` calls `eth_signTypedData_v4` with `domain.verifyingContract` = the Kernel account address. In EIP-7702 mode this equals the owner's EOA, which MetaMask refuses to use as a typed-data verifying contract (security guard against spoofing).

**Why kernel mode is not an alternative:** In kernel mode the smart account address differs from the EOA. Users can no longer withdraw funds or manage positions using a standard wallet (MetaMask, Rabby, etc.) — they need AA tooling. This is an unacceptable safety regression for a product managing real funds.

### Solution implemented: CLI offline signing

Since the private key constraint is about the *keeper* (not the browser), the operator can sign locally on their own machine and paste the result into the dashboard.

**Files added/changed:**

| File | Change |
|---|---|
| [`dashboard/generate-session-approval.mjs`](../dashboard/generate-session-approval.mjs) | New CLI script — signs EIP-7702 auth + session key locally using `privateKeyToAccount` (viem native, no browser wallet needed), outputs JSON |
| [`dashboard/app/onboard/page.js`](../dashboard/app/onboard/page.js) | Added "CLI offline signing" full-width section: paste area, parsed preview, submit button |
| [`keeper/src/server.js`](../keeper/src/server.js) | `processSessionBootstrap`: handle `env:`-backed secret refs by updating `process.env` in-process instead of calling Secrets Manager |
| [`keeper/src/server.js`](../keeper/src/server.js) | `resolveSmartSessionSecretRef`: also accept `SESSION_KEY_SECRET_REF` env var (was only checking `SESSION_SECRET_REF`) |
| [`dashboard/app/utils/smartAccountOnboarding.js`](../dashboard/app/utils/smartAccountOnboarding.js) | `walletClientToOwnerAccount`: `signAuthorization` calls `wallet_signAuthorization` RPC directly (not viem's high-level action which rejects JSON-RPC accounts); full debug logging |

**CLI usage:**
```bash
cd dashboard
OWNER_PRIVATE_KEY=0x… node generate-session-approval.mjs --keeper-url http://localhost:5059
# Copy JSON output → paste into /onboard "CLI offline signing" section → Submit
```

**Why this satisfies the constraint:** `privateKeyToAccount` signs entirely in Node.js — the key is never transmitted anywhere. The keeper receives only the approval blob and session public address, identical to what a browser wallet would produce.

### Env-backed secret ref caveats

When `SESSION_KEY_SECRET_REF=env:SESSION_PRIVATE_KEY` (local dev), the keeper updates `process.env.SESSION_PRIVATE_KEY` in-process on bootstrap. **The key is not written to disk.** On container restart it is lost. Operator must manually update `.env.sepolia` with the `sessionPrivateKey` from the CLI JSON output for persistence.

In production: use `SESSION_KEY_SECRET_REF=json:<secret-arn>#SESSION_PRIVATE_KEY` or a standalone ARN. The CLI script works identically — only the storage destination changes.

### Future browser wallet path

When wallet support matures, the existing `walletClientToOwnerAccount.signAuthorization` handler in `smartAccountOnboarding.js` is already wired to call `wallet_signAuthorization`. No architecture change needed — just switch from the CLI section to the browser wallet section on the onboarding page once a compatible wallet is available. Candidates to watch:
- Ambire browser extension (most likely — mobile already works)
- Ledger `hw-app-eth` npm release with `signEIP7702Authorization`
- WalletConnect v2 + Ambire mobile (requires configuring session namespace to include `wallet_signAuthorization`)

---

Goal: close the v1 gaps identified in the post-implementation review. Five
ordered work items, each independently shippable. Each item lists scope, files,
acceptance criteria, and the test that proves it done.

---

## 1. UserOp failure tracking (small, ~half day)

**Problem.** `recordUserOpFailure` is defined in
[session-key-manager.js](../keeper/src/session-key-manager.js) but never invoked.
Reverted/dropped userOps remain `status='pending'` forever, polluting the
`user_operations` table and breaking any future "recent userOps" UI.

**Scope.**
- [keeper/src/v4-position-service.js](../keeper/src/v4-position-service.js) — wrap the
  `signer.sendUserOp` / `waitForInclusion` paths in `_sendWrite` (and
  `_sendTransaction`, line ~986) with a try/catch that calls `onUserOpFailed`.
- [keeper/src/server.js](../keeper/src/server.js) — extend `recordUserOperationEvent`
  to handle a `failure` shape: `{ userOpHash, errorReason }` → calls
  `sessionKeyManager.recordUserOpFailure`.
- Add `onUserOpFailed` to the `V4PositionService` constructor wiring at
  [server.js:797](../keeper/src/server.js#L797).
- Boot-time sweeper: on keeper startup, mark any rows with `status='pending'`
  older than 30 minutes as `'dropped'`. Run inside the existing schema-init
  block in `server.js`.

**Acceptance.**
- Forced revert (e.g. set `MAX_VALUE_PER_TX_WEI=1` and try a mint with `value > 1`)
  produces a row with `status='failed'` and a non-null `errorReason`.
- After a `kill -9` of the keeper between submit and inclusion, the next boot
  flips orphaned rows to `'dropped'`.

**Test.**
```bash
docker compose exec keeper sqlite3 /data/keeper.db \
  "SELECT status, COUNT(*) FROM user_operations GROUP BY status;"
# Expect: included, failed, dropped — never long-lived 'pending'.
```

---

## 2. Session rotate + revoke endpoints (~1.5 days)

**Problem.** Roadplan v1 promised `POST /api/session/rotate` and
`/api/session/revoke`. Without them there is no operational path to recover
from a leaked session key short of redeploying.

**Scope.**

### 2a. `POST /api/session/rotate` (auth: `API_KEY` + HMAC)
- Same payload shape as `/bootstrap` but the keeper also accepts an optional
  `previousSessionId`.
- Behaviour:
  1. Validate exactly like `/bootstrap` (policy hash, owner match, etc.).
  2. Insert the new session as `status='active'`.
  3. Mark the previous active session as `status='rotated'` (keeper already
     has `markAllSessionsInactive(_, 'rotated')` — reuse it).
  4. Activate in-memory via `activateSmartSession(expectedHash)`.
  5. Keep the rotated session's row + secret intact for a configurable grace
     window (`SESSION_ROTATION_GRACE_HOURS`, default 24) so an in-flight userOp
     signed under the old key can still resolve. After the grace window, a
     daily cron job purges the old `secretRef` (Secrets Manager
     `PutSecretValue` with `null`/empty for that JSON field).

### 2b. `POST /api/session/revoke` (auth: `API_KEY` + HMAC)
- Payload: `{ sessionId, ownerSignature, message }` where `message` is a
  fixed-format string (`"revoke session <id> on chain <id> at <unix-ts>"`)
  signed by `OWNER_ADDRESS` via `personal_sign`.
- Behaviour:
  1. Verify signature recovers to `OWNER_ADDRESS`.
  2. Reject if `ts` older than 5 minutes (replay guard).
  3. Mark session `'revoked'`, `revokedAt = now`.
  4. Wipe the secret value at `secretRef` (best-effort; if KMS denies, log).
  5. If revoked session was active, drop the in-memory `smartAccountSigner`
     and re-init `uniswapService` with `signer=null` (read-only).
- Note: this is an **off-chain revoke**. On-chain revoke (sending a userOp
  that uninstalls the permission validator) is Phase 4 work — out of scope.

### 2c. Browser support
- Add a "Rotate" button to `/onboard` (already shows the warning when an
  active session exists). Reuse `runOnboarding()` and add a `mode: 'rotate'`
  branch that POSTs to `/rotate` instead.
- Revoke button lives on `/account` (item 3).

**Files.**
- [keeper/src/server.js](../keeper/src/server.js) — two new route handlers, one Zod
  schema for revoke, share validation helpers with `/bootstrap`.
- [keeper/src/session-key-manager.js](../keeper/src/session-key-manager.js) — add
  `getSessionsPendingPurge(graceMs)` and `purgeRotatedSessionSecret(id)`.
- New cron in `server.js` (alongside the hourly cron) that purges expired
  grace-window secrets daily.
- [dashboard/app/onboard/page.js](../dashboard/app/onboard/page.js) — rotate
  branch.

**Acceptance.**
- Successful rotate: new session active, old marked `'rotated'`, both rows
  present, in-flight ops signed under old key still settle for the grace
  window.
- Revoke: keeper drops to read-only, `/api/status` returns
  `sessionExpiresAt: null`, write attempts return a clear "no active session"
  error.

**Test.**
- Onboard → rotate → confirm `SELECT status, sessionAddress FROM session_keys`
  shows one `active` and one `rotated`.
- Sign revoke message in MetaMask, POST it, confirm session row goes
  `'revoked'`, write API returns 503.
- Replay the same revoke payload after 6 minutes → 400.

---

## 3. `/account` admin page + supporting API (~1.5 days)

**Problem.** No surface for the operator to see session expiry, recent
userOps, or trigger rotate/revoke without curl.

**Scope.**

### 3a. New keeper endpoints (read-only, public)
- `GET /api/userops/recent?limit=20&status=` — returns last N rows from
  `user_operations` joined to `session_keys.sessionAddress` for display.
  Default limit 20, max 100.
- Extend `GET /api/session/status` to also return:
  - `policyJson` (already stored — just expose it; the dashboard parses to
    render the human policy table).
  - `policy` (the parsed object, for convenience).
  - `gracePeriodEndsAt` for rotated sessions.

### 3b. New page `dashboard/app/account/page.js`
- `SessionStatusBadge` component (header widget):
  - green: `validUntil - now > 7d`
  - amber: `< 7d`
  - red: expired/revoked/none
- Sections:
  1. **Account** — address, balances (reuse `/api/status` data),
     `accountMode`, kind.
  2. **Session** — sessionAddress, policy hash, expiry countdown,
     human-readable policy table (reuse the renderer from `/onboard`).
  3. **Recent userOps** — table: time, intent, status, tx link, gas cost.
  4. **Actions** — "Rotate session key" → routes to `/onboard?mode=rotate`.
     "Revoke" → opens a modal that asks for MetaMask `personal_sign` of the
     revoke message and POSTs to `/api/session/revoke`.

### 3c. Header link
- Add nav entry "Account →" in [dashboard/app/page.js](../dashboard/app/page.js)
  next to "Strategy Visualizer" / "Report".
- Mount `SessionStatusBadge` on the main dashboard header.

**Files.**
- New: `dashboard/app/account/page.js`,
  `dashboard/app/components/SessionStatusBadge.js`.
- [keeper/src/server.js](../keeper/src/server.js) — `/api/userops/recent`, expand
  `/api/session/status`.
- [dashboard/app/page.js](../dashboard/app/page.js) — nav + badge mount.

**Acceptance.**
- Page renders policy correctly for both `eip7702` and `kernel` accounts.
- Recent userOps show `status` transitions live (refresh via SWR every 15s).
- Rotate button hands off cleanly to onboarding flow.
- Revoke modal blocks until MetaMask returns a signature; surfaces keeper
  errors verbatim.

**Test.**
- Manual: walk through onboard → see badge green → make a position → see
  userOp listed → rotate → badge stays green with new sessionAddress →
  revoke → badge red.

---

## 4. Session-expiry CloudWatch alarm (~half day, infra-only)

**Problem.** Roadplan §"instance-stack.ts" required SNS/Discord alerts when a
session expires within 72h. Not present in
[infra/lib/instance-stack.ts](../infra/lib/instance-stack.ts).

**Scope.**
- Keeper emits a custom CloudWatch metric `SessionHoursToExpiry` per chain on
  every hourly cron tick. Use the existing AWS SDK already imported for
  Secrets Manager; add `@aws-sdk/client-cloudwatch` to `keeper/package.json`.
  Skip the metric publish if `AWS_REGION` is unset (local dev).
- In [instance-stack.ts](../infra/lib/instance-stack.ts):
  - Grant `cloudwatch:PutMetricData` to the task role.
  - Create a `Metric` + `Alarm`:
    - Threshold: `SessionHoursToExpiry < 72`
    - 1 datapoint, evaluation period 1h.
    - Alarm action: SNS topic (existing `alertsTopic` if present, otherwise
      create one and subscribe `props.alertEmail`).
- Pipe the same SNS topic to the existing Discord webhook flow used by
  [keeper/src/alerts.js](../keeper/src/alerts.js) (out-of-band — keeper
  publishes a Discord message itself when it crosses the 72h boundary, so
  even users without SNS get notified).

**Files.**
- [infra/lib/instance-stack.ts](../infra/lib/instance-stack.ts).
- [infra/lib/types.ts](../infra/lib/types.ts) — add optional `alertEmail` prop.
- [keeper/src/server.js](../keeper/src/server.js) — extend the existing hourly
  cron with `publishSessionExpiryMetric()`.
- New: `keeper/src/cloudwatch-publisher.js`.

**Acceptance.**
- `cdk diff` shows alarm + metric + IAM addition only; no breaking diffs.
- Manual ECS: set `validUntil` of an active session to `now + 1h`, wait one
  cron, see CloudWatch metric, alarm transitions to ALARM, Discord receives
  the keeper-side notification.

**Test.**
- Local: run with `AWS_REGION=us-east-1` and a test profile, confirm the
  metric API call is attempted (check logs); no fatal error if creds missing.
- Staging: shorten the threshold to 1h temporarily and verify alarm fires.

---

## 5. Atomic rebalance userOp (~2 days, highest correctness win)

**Problem.** Rebalance still calls `_sendWrite` per step (decrease, collect,
burn, swap, mint). A failure mid-sequence strands tokens between contracts.
ERC-4337 supports `calls[]` per userOp — collapse them.

**Scope.**

### 5a. Refactor write entrypoints
- Introduce `_sendWriteBatch(publicClient, walletClient, writeArgsArray, intent)`
  in [v4-position-service.js](../keeper/src/v4-position-service.js):
  - Smart-mode: encode each `writeArgs` to `{to, data, value}` using
    `encodeFunctionData` (viem) and dispatch a single
    `signer.sendUserOp(calls)`.
  - EOA-mode fallback: execute sequentially (preserves today's behaviour;
    log a warning that atomicity is unavailable in EOA mode).
- Keep `_sendWrite` as a thin wrapper that calls `_sendWriteBatch([writeArgs])`.

### 5b. Rebalance workflow rewrite
- In `rebalanceTokens()` (v4-position-service.js:3245) and the close+open
  workflow used by `position-closure-service.js`, build the full `calls[]`
  array up front:
  1. Permit2 approve(s) (only if `allowance < amount`)
  2. PositionManager `modifyLiquidities` (decrease + collect + burn — already
     a single multicall in many paths; verify all)
  3. UniversalRouter `execute` (swap)
  4. PositionManager `modifyLiquidities` (mint)
- Single userOp dispatch. Single inclusion wait.
- Feature flag `ATOMIC_REBALANCE` (default `true` in smart mode, `false`
  forced in EOA mode). Roadplan called this out as a fallback switch.

### 5c. Failure mode handling
- If the bundled userOp reverts: the validator/CallPolicy returns a structured
  reason — surface it through the `errorReason` recorded by item 1.
- Add a debug helper: when atomic rebalance reverts, log the decoded inner
  call that failed. Reuse `_decodeSwapRevert` plumbing if the failing call is
  the swap.

### 5d. Gas estimation
- ZeroDev's `estimateUserOperationGas` covers the bundle. Add a 25% buffer
  (per roadplan risk table). Record both estimated and actual in
  `user_operations.gasCostWei` for tuning.

**Files.**
- [keeper/src/v4-position-service.js](../keeper/src/v4-position-service.js).
- [keeper/src/position-closure-service.js](../keeper/src/position-closure-service.js).
- [keeper/src/server.js](../keeper/src/server.js) — read `ATOMIC_REBALANCE` env,
  thread into service constructor.
- [.env.example](../.env.example) — document `ATOMIC_REBALANCE`.

**Acceptance.**
- Rebalance produces exactly **one** row in `user_operations` per cycle in
  smart mode (was 3–5).
- Setting `ATOMIC_REBALANCE=false` reverts to per-step userOps with no
  behavioural change vs today's smart-mode flow.
- Forced-revert test (e.g. tighten `MAX_VALUE_PER_TX_WEI`): all four inner
  calls roll back atomically — no orphan approvals, no half-burned position.

**Test.**
- Testnet rebalance with `ATOMIC_REBALANCE=true`:
  ```bash
  docker exec keeper sqlite3 /data/keeper.db \
    "SELECT userOpHash, intent, status, txHash FROM user_operations \
     WHERE intent='rebalance' ORDER BY submittedAt DESC LIMIT 1;"
  # Expect exactly one row, status='included'.
  ```
- Compare same flow with `ATOMIC_REBALANCE=false` → 3–5 rows.
- Forced-failure test: tighten value cap → confirm zero state mutation
  (position unchanged, balances unchanged).

---

## Sequencing

```
Week 1
  Day 1     : (1) UserOp failure tracking
  Day 2-3   : (2) Rotate + revoke endpoints + browser rotate branch
  Day 4-5   : (3) /account page + /api/userops/recent

Week 2
  Day 1     : (4) CloudWatch alarm + Discord wiring
  Day 2-4   : (5) Atomic rebalance userOp + feature flag
  Day 5     : Hardening — full Phase C testnet pass from
              [docs/SMART_ACCOUNT_SESSION_KEY_HANDOFF.md] revision
```

Each item lands as its own commit + PR. Items 1–4 are independent; item 5
depends on item 1 (`recordUserOpFailure` wiring is needed to surface the
single-userOp revert reasons cleanly).

## Out of scope (defer to Phase 4 hardening)

- KMS-only signing path (session key never plaintext on disk).
- On-chain `revoke` (uninstall validator userOp).
- Per-token spend caps / pool-id-scoped policy.
- Paymaster billing model.
- Multi-sig owner.
- Local mock bundler in docker-compose.
