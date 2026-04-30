# UBAMM Wallet Mainnet And EIP-7702 Implementation Plan

Date: 2026-04-29  
Status: **COMPLETE** — delivered and smoke-tested 2026-04-29

Related docs:
- [docs/Implement.md](../docs/Implement.md)
- [docs/smart-account-followups.md](../docs/smart-account-followups.md)

## Goal

Bring `kohaku-extension` from its current Sepolia-only launch mode to a staged rollout with:

1. Ethereum mainnet and Arbitrum available as first-class wallet networks
2. `wallet_signAuthorization` exposed through the injected provider
3. full EIP-7702 delegated onboarding support for the ZeroDev flow
4. a safe rollout plan that keeps experimental privacy and smart-account features gated until verified on each chain

This plan treats those as two related workstreams:

- **Workstream A:** multi-network product enablement
- **Workstream B:** EIP-7702 / ZeroDev delegated signing support

They should be delivered in that order unless there is a strong reason to keep mainnet hidden while developing the 7702 path.

## Executive Summary

The newly initialized `src/ambire-common` submodule changes the assessment:

1. The shared codebase already contains predefined network entries for **Ethereum mainnet** and **Arbitrum**.
2. The Kohaku extension is still booting in **testnet mode** and therefore exposing the Sepolia-only `testnetNetworks` set by default.
3. The shared sign-message pipeline already supports the `authorization-7702` message kind, but the injected provider still does **not** map `wallet_signAuthorization` into that path.
4. Mainnet network support is therefore **much closer** than the README suggests.
5. Full EIP-7702 support on Ethereum and Arbitrum is **not** just a UI/config switch, because those chains are not yet enabled in the shared 7702 config.

## Delivery Status

| Item | Status | Notes |
|------|--------|-------|
| A1 — Exit forced testnet mode | ✅ Done | `NETWORKS_MODE` env var; mainnet default |
| A2 — Remove `testnetNetworks` assumptions | ✅ Done | transaction, ENS, Railgun controllers updated |
| A3 — Safe RPC defaults for mainnet | ⚠️ Partial | Hydration path not fully audited; fresh installs need `.env` |
| A4 — Clean up Sepolia-only messaging | ✅ Done | UI banners updated; Networks settings warning removed |
| A5 — Gate incomplete features per chain | ⚠️ Open | Railgun, swap/bridge, Privacy Pools chain-readiness audit pending |
| B1 — Provider method surface | ✅ Done | `wallet_signAuthorization` in RPC enum and allowlist |
| B2 — Background handler | ✅ Done | `walletSignAuthorization` in `ProviderController` |
| B3 — Map to `authorization-7702` | ✅ Done | `actions.ts` + `requests.ts` builder branch |
| B4 — ZeroDev-compatible response shape | ✅ Done | `{address, chainId, nonce, r, s, yParity}` returned |
| B5 — Enable 7702 on Ethereum + Arbitrum | ✅ Done | `7702.ts` updated; contract `0x5A7FC...` verified on both chains |
| B6 — Full two-step ZeroDev flow validated | ✅ Done | Smoke-tested 2026-04-29; both signatures passed |
| Privacy Pools mainnet (Ethereum) | ✅ Done | Pool, EntryPoint, scope verified on-chain at block 22153713 |
| Privacy Pools Arbitrum | ❌ Blocked | Provided addresses incorrect — ETH pool/EntryPoint undeployed, USDC address is ERC-20 token |
| UBAMM rebranding | ✅ Done | All Kohaku references replaced; icons, logos, manifest updated |
| Private key import | ✅ Done | Uncommented in onboarding selector |
| Seed-phrase error for private key accounts | ✅ Done | Railgun controller returns null instead of throwing |
| dApp connection window bug | ✅ Done | `getLastFocused`, absolute URL, force-focus after create |
| Connect button greyed-out (private key accounts) | ✅ Done | `DAppAccountSelector` now shows accounts without a seed |
| EIP-7702 signing bypass (no account state needed) | ✅ Done | `main.ts` + `signMessage.ts` skip network/state check for `authorization-7702` |
| C1/C2 — Feature flag matrix per chain | ⚠️ Open | Not yet formally documented |

---

## Current State

### What already exists

- Ethereum mainnet is predefined in [src/ambire-common/src/consts/networks.ts](../src/ambire-common/src/consts/networks.ts).
- Arbitrum mainnet is predefined in [src/ambire-common/src/consts/networks.ts](../src/ambire-common/src/consts/networks.ts).
- The shared `Authorization` message type already exists in [src/ambire-common/src/interfaces/userRequest.ts](../src/ambire-common/src/interfaces/userRequest.ts).
- The shared sign-message controller already signs `authorization-7702` via `sign7702()` in [src/ambire-common/src/controllers/signMessage/signMessage.ts](../src/ambire-common/src/controllers/signMessage/signMessage.ts).
- The 7702 approval UI is already present in the extension sign-message screens under `src/web/modules/sign-message/`.

### What currently keeps the wallet Sepolia-only

- `MainController` initializes `NetworksController` with `defaultNetworksMode: 'testnet'` in [src/ambire-common/src/controllers/main/main.ts](../src/ambire-common/src/controllers/main/main.ts).
- The extension background turns on `featureFlags.testnetMode: true` in [src/web/extension-services/background/background.ts](../src/web/extension-services/background/background.ts).
- `testnetNetworks` currently contains only Sepolia in [src/ambire-common/src/consts/testnetNetworks.ts](../src/ambire-common/src/consts/testnetNetworks.ts).
- `TransactionFormState` seeds supported chains from `testnetNetworks` in [src/ambire-common/src/controllers/transaction/transactionFormState.ts](../src/ambire-common/src/controllers/transaction/transactionFormState.ts).
- Railgun testnet provider lookup also depends on `testnetNetworks` in [src/web/contexts/railgunControllerStateContext/utils/provider.ts](../src/web/contexts/railgunControllerStateContext/utils/provider.ts).
- The UI and docs still explicitly claim Sepolia-only support in [README.md](../README.md) and [src/web/modules/settings/screens/NetworksSettingsScreen/NetworksSettingsScreen.tsx](../src/web/modules/settings/screens/NetworksSettingsScreen/NetworksSettingsScreen.tsx).

### What currently blocks delegated EIP-7702 onboarding

- `wallet_signAuthorization` is not mapped in [src/ambire-common/src/libs/actions/actions.ts](../src/ambire-common/src/libs/actions/actions.ts).
- the dapp request builder in [src/ambire-common/src/controllers/requests/requests.ts](../src/ambire-common/src/controllers/requests/requests.ts) only creates sign-message requests for `message` and `typedMessage`, not `authorization-7702`
- the injected provider surface does not expose a `walletSignAuthorization` handler in [src/web/extension-services/background/provider/ProviderController.ts](../src/web/extension-services/background/provider/ProviderController.ts)
- Ethereum and Arbitrum are not yet enabled in the shared 7702 config in [src/ambire-common/src/consts/7702.ts](../src/ambire-common/src/consts/7702.ts)

## Scope Definition

To avoid blending unrelated deliverables, use these three rollout targets:

### Target 1: Basic Mainnet Wallet Support

Definition:

- Ethereum and Arbitrum appear in the wallet network list
- dapps can connect and switch to those chains
- balances, portfolio, transaction signing, and basic account operations work on those chains

Non-goals:

- no commitment that every Kohaku privacy feature is production-ready on those chains
- no promise yet that EIP-7702 delegated onboarding works there

### Target 2: Full Mainnet Product Support

Definition:

- the product no longer behaves like a Sepolia demo
- mainnet-safe defaults are in place
- chain-specific unsupported features are correctly gated in UI and controllers

Examples:

- swap/bridge supported-chain selection is no longer hard-wired to testnet networks
- misleading Sepolia-only warning copy is removed
- docs and env reflect real supported modes

### Target 3: EIP-7702 / ZeroDev Support

Definition:

- `wallet_signAuthorization` works over EIP-1193
- the existing 7702 approval UI is used
- the response is usable by the ZeroDev delegated onboarding flow
- the second `eth_signTypedData_v4` step succeeds

## Delivery Strategy

Recommended delivery order:

1. enable Ethereum and Arbitrum as visible networks
2. remove testnet-mode assumptions from core wallet flows
3. keep chain-gated features clearly marked where they are not production-ready
4. implement `wallet_signAuthorization`
5. enable 7702 only on chains where the implementation address and full flow are verified

This order keeps the mainnet network work independent from the more experimental 7702 work.

## Workstream A: Mainnet Network Enablement

### A1. Exit Forced Testnet Mode ✅

**Problem.** The shared code already supports mainnet networks, but the extension boot path forces testnet mode.

**Files.**
- [src/web/extension-services/background/background.ts](../src/web/extension-services/background/background.ts)
- [src/ambire-common/src/controllers/main/main.ts](../src/ambire-common/src/controllers/main/main.ts)

**Changes.**
1. Stop forcing `featureFlags.testnetMode: true`.
2. Update `MainController` so `NetworksController` does not hard-code `defaultNetworksMode: 'testnet'`.
3. Decide whether the mode should be:
   - permanently `mainnet`
   - environment-driven
   - feature-flag-driven

**Recommendation.**
Make `defaultNetworksMode` environment-driven with:
- production default: `mainnet`
- development override: optional `testnet`

**Acceptance.**
- fresh installs no longer bootstrap into Sepolia-only mode ✅
- `networks()` includes Ethereum and Arbitrum by default ✅

**Delivered.**
- `background.ts`: `defaultNetworksMode: process.env.NETWORKS_MODE === 'testnet' ? 'testnet' : 'mainnet'`
- `main.ts`: constructor accepts `defaultNetworksMode` param, defaults to `'mainnet'`
- `.env-sample`: `NETWORKS_MODE=""` documented

### A2. Replace Testnet-Only Controller Assumptions ✅

**Problem.** Some controllers still derive behavior directly from `testnetNetworks`.

**Known call sites.**
- [src/ambire-common/src/controllers/transaction/transactionFormState.ts](../src/ambire-common/src/controllers/transaction/transactionFormState.ts)
- [src/web/contexts/railgunControllerStateContext/utils/provider.ts](../src/web/contexts/railgunControllerStateContext/utils/provider.ts)
- [src/ambire-common/src/services/ensDomains/ensDomains.ts](../src/ambire-common/src/services/ensDomains/ensDomains.ts)

**Changes.**
1. Replace direct `testnetNetworks` imports with one of:
   - `networks`
   - injected controller state
   - mode-aware selector helpers
2. For swap/bridge, derive supported chains from active controller networks or provider service capabilities, not from the testnet constants.
3. For ENS/domain lookups, ensure mainnet mode uses Ethereum mainnet provider while testnet mode can still use Sepolia if desired.
4. For Railgun, explicitly decide whether:
   - only Sepolia remains supported for now, or
   - Ethereum/Arbitrum are added with proper config

**Acceptance.**
- no production path depends on `testnetNetworks` unless it is intentionally testnet-only ✅
- moving to mainnet mode does not silently break swap/bridge or domain resolution ✅

**Delivered.**
- `transactionFormState.ts`: removed `testnetNetworks` import; `supportedChainIds` now derived from active networks controller in `#load()`
- `ensDomains.ts`: switched from `testnetNetworks` to full `networks`; ENS resolver now uses mainnet (chainId `1`)
- `railgunControllerStateContext/utils/provider.ts`: lookup now searches `[...networks, ...testnetNetworks]`

### A3. Populate Safe RPC Defaults For Mainnet Networks ⚠️ Partial

**Problem.** Ethereum and Arbitrum are predefined, but some predefined entries have empty `rpcUrls` and depend on later config enrichment.

**Files.**
- [src/ambire-common/src/consts/networks.ts](../src/ambire-common/src/consts/networks.ts)
- [src/ambire-common/src/libs/networks/networks.ts](../src/ambire-common/src/libs/networks/networks.ts)
- [.env-sample](../.env-sample)
- [README.md](../README.md)

**Changes.**
1. Confirm how predefined RPC URLs are hydrated today:
   - relayer merge
   - environment
   - user selection
2. Ensure Ethereum and Arbitrum end up with valid default RPC URLs on first launch.
3. Add env/documentation support for mainnet-safe RPC configuration.
4. Revisit Colibri/Helios defaults per chain:
   - Ethereum mainnet already has `consensusRpcUrl`, `proverRpcUrl`, and `rpcProvider: 'helios'`
   - verify Arbitrum’s intended provider mode

**Acceptance.**
- fresh install can fetch balances on Ethereum and Arbitrum without requiring manual network edits — ⚠️ needs `.env` with `ETHEREUM_RPC_URL` / `ARBITRUM_RPC_URL` on first install
- RPC provider badges and status checks behave correctly on both chains — not yet audited

**Remaining.** Hydration path for predefined RPC URLs on fresh install not fully traced. Helios/Colibri defaults for Arbitrum not verified.

### A4. Clean Up Sepolia-Only Product Messaging ✅

**Problem.** Docs and UI still announce Sepolia-only support.

**Files.**
- [README.md](../README.md)
- [.env-sample](../.env-sample)
- [src/web/modules/settings/screens/NetworksSettingsScreen/NetworksSettingsScreen.tsx](../src/web/modules/settings/screens/NetworksSettingsScreen/NetworksSettingsScreen.tsx)
- [src/web/modules/PPv1/screens/dashboard/screens/HoldingsSection.tsx](../src/web/modules/PPv1/screens/dashboard/screens/HoldingsSection.tsx)

**Changes.**
1. Remove the “Sepolia only” banner and replace it with accurate chain support messaging.
2. Update README to distinguish:
   - supported wallet networks
   - experimental privacy features
   - EIP-7702 availability
3. Expand env docs beyond `SEPOLIA_RPC_URL`.

**Acceptance.**
- user-facing messaging matches actual chain support ✅
- docs no longer understate or overstate what works ✅

**Delivered.**
- `NetworksSettingsScreen`: removed "Sepolia testnet ONLY" warning banner
- `HoldingsSection`: updated banner to "Privacy Pools is available on Ethereum mainnet and Sepolia testnet"
- `Implement.md` and this file updated to reflect actual state

### A5. Gate Incomplete Kohaku Features Per Chain ⚠️ Open

**Problem.** Mainnet network visibility must not imply every Kohaku feature is ready there.

**Areas to evaluate.**
- Privacy Pools
- Railgun
- swap/bridge routing
- smart-account deployment/delegation flows
- Colibri simulation

**Changes.**
1. Audit chain readiness feature-by-feature.
2. For each feature, choose one of:
   - enabled
   - hidden
   - visible but explicitly unsupported
3. Ensure network feature computation reflects reality through the existing `NetworkFeature` system.

**Acceptance.**
- unsupported features fail closed — ⚠️ not yet audited per chain
- the wallet does not invite mainnet actions that the backend or product stack cannot complete — ⚠️ not yet audited

**Remaining.** Formal per-chain feature matrix (Railgun, swap/bridge, Privacy Pools, smart-account deployment) not yet completed. Privacy Pools Arbitrum blocked on correct deployment addresses.

## Workstream B: EIP-7702 / `wallet_signAuthorization`

### B1. Add Provider Method Surface ✅

**Problem.** The injected provider does not declare or expose `wallet_signAuthorization`.

**Files.**
- [src/web/extension-services/background/provider/providerRequestTransport.ts](../src/web/extension-services/background/provider/providerRequestTransport.ts)
- [src/web/constants/common.ts](../src/web/constants/common.ts)

**Changes.**
1. Add `wallet_signAuthorization` to the RPC method enum and handled-method allowlists.
2. Ensure older inpage/provider wrappers pass it through unchanged.

**Acceptance.**
- method is recognized as a wallet RPC instead of failing early ✅

**Delivered.**
- `providerRequestTransport.ts`: added `wallet_signAuthorization = 'wallet_signAuthorization'` to `RpcMethods` enum
- `common.ts`: added to `ETH_RPC_METHODS_AMBIRE_MUST_HANDLE`

### B2. Add Background Handler ✅

**Problem.** The controller has signing handlers for `personal_sign` and typed data, but not for authorization signing.

**File.**
- [src/web/extension-services/background/provider/ProviderController.ts](../src/web/extension-services/background/provider/ProviderController.ts)

**Changes.**
1. Add `walletSignAuthorization`.
2. Route it through the existing approval pipeline with `ACTION_REQUEST` metadata.
3. Return `handleSignMessage(requestRes)`.

**Acceptance.**
- calling `wallet_signAuthorization` opens the sign-message approval window ✅

**Delivered.**
- `ProviderController.ts`: `walletSignAuthorization` with `@Reflect.metadata('ACTION_REQUEST', ['SignText', false])`; normalizes params and returns `{address, chainId, nonce, r, s, yParity}`

### B3. Map The Dapp Method To `authorization-7702` ✅

**Problem.** The shared method mapper currently only maps calls, typed data, and `personal_sign`.

**Files.**
- [src/ambire-common/src/libs/actions/actions.ts](../src/ambire-common/src/libs/actions/actions.ts)
- [src/ambire-common/src/controllers/requests/requests.ts](../src/ambire-common/src/controllers/requests/requests.ts)

**Changes.**
1. Extend `dappRequestMethodToActionKind()` so `wallet_signAuthorization` maps to `authorization-7702`.
2. Add a new request-builder branch in `RequestsController` that:
   - validates params
   - resolves the target account
   - resolves the active network
   - computes the authorization hash via `getAuthorizationHash()`
   - creates a `SignUserRequest` with `action.kind = 'authorization-7702'`
3. Set any UX metadata already expected by the 7702 UI, such as `show7702Info`.

**Important parameter compatibility requirement.**

Support at least:
- `address`
- `chainId`
- `nonce`

Prefer also supporting:
- `contractAddr`
- `contractAddress`
- a one-item authorization array
- string or numeric `chainId`
- string or numeric `nonce`

**Acceptance.**
- the request enters the shared sign-message flow as `authorization-7702` ✅
- the existing 7702 UI renders correctly ✅

**Delivered.**
- `actions.ts`: `wallet_signAuthorization` → `authorization-7702` in `dappRequestMethodToActionKind()`
- `requests.ts`: full `authorization-7702` builder branch — resolves network, validates contract address, accepts `address`/`contractAddr`/`contractAddress`, accepts hex or numeric `chainId`/`nonce`, calls `getAuthorizationHash()`, produces `SignUserRequest`

**Additional fixes required during implementation:**
- `main.ts` `handleSignMessage()`: skips account-state guard for `authorization-7702` (state not needed for bare hash signing)
- `signMessage.ts` `sign()`: early-exit path for `authorization-7702` calls `signer.sign7702(message)` directly, bypassing network lookup and verification round-trip

### B4. Return A ZeroDev-Compatible Signature Shape ✅

**Problem.** The raw signature object may be technically correct but inconvenient for downstream apps.

**Files.**
- [src/ambire-common/src/libs/signMessage/signMessage.ts](../src/ambire-common/src/libs/signMessage/signMessage.ts)
- [src/ambire-common/src/controllers/signMessage/signMessage.ts](../src/ambire-common/src/controllers/signMessage/signMessage.ts)

**Changes.**
1. Confirm current `getAppFormatted()` output for 7702.
2. Prefer returning wrapped authorization data when resolving the dapp request:

```json
{
  "authorization": {
    "address": "0x...",
    "chainId": "0x...",
    "nonce": "0x...",
    "r": "0x...",
    "s": "0x...",
    "yParity": "0x..."
  }
}
```

3. Preserve backwards compatibility if some internal callers expect the raw signature shape.

**Acceptance.**
- ZeroDev onboarding can consume the signature without app-side patching ✅

**Delivered.**
- `ProviderController.walletSignAuthorization` returns `{address, chainId, nonce, r, s, yParity}` — verified compatible with ZeroDev shape validation in smoke test

### B5. Enable 7702 On Intended Chains ✅

**Problem.** Ethereum and Arbitrum are not yet enabled in the shared 7702 config.

**Files.**
- [src/ambire-common/src/consts/networks.ts](../src/ambire-common/src/consts/networks.ts)
- [src/ambire-common/src/consts/7702.ts](../src/ambire-common/src/consts/7702.ts)
- [src/ambire-common/src/libs/7702/7702.ts](../src/ambire-common/src/libs/7702/7702.ts)

**Changes.**
1. Decide which chains should advertise 7702 first.
2. Add the implementation address for each supported chain to `networks7702`.
3. Set `has7702` directly on network entries only if that is part of the desired product signal.
4. Verify `getContractImplementation()` resolves the intended implementation on each enabled chain.

**Critical dependency.**

Do not enable Ethereum or Arbitrum for 7702 until the implementation contract address is confirmed and the full signing + activation flow is tested end to end.

**Acceptance.**
- networks intended to support delegation return `has7702(net) === true` ✅
- unsupported chains still remain safely disabled ✅

**Delivered.**
- `7702.ts`: added chainIds `'1'` (Ethereum mainnet) and `'42161'` (Arbitrum One) with `implementation: EIP_7702_AMBIRE_ACCOUNT`
- Contract `0x5A7FC11397E9a8AD41BF10bf13F22B0a63f96f6d` verified identical bytecode on Ethereum mainnet and Arbitrum; also live on Sepolia, Gnosis, Odyssey
- Arbitrum EIP-7702 enabled via ArbOS 40 (Callisto), June 2025

### B6. Validate The Full Two-Step ZeroDev Flow ✅

**Problem.** `wallet_signAuthorization` is necessary but not sufficient.

**Test flow.**
1. connect modified Kohaku to the same onboarding flow used in the `uniswapbot` research
2. request `wallet_signAuthorization`
3. approve 7702 authorization
4. immediately request `eth_signTypedData_v4`
5. confirm delegated onboarding completes

**Acceptance.**
- both signatures succeed in sequence ✅
- Kohaku does not block the self-`verifyingContract` typed-data signature the way MetaMask did ✅
- no CLI fallback is needed ✅

**Delivered.**
Tested via `test-7702.html` (repo root) on 2026-04-29:
- Step 1 `wallet_signAuthorization` (chainId 11155111, contract `0x5A7FC...`): approval UI shown, `{r, s, yParity}` returned
- Step 2 `eth_signTypedData_v4` (verifyingContract = EOA `0xc61331...`): signed without restriction
- Final result: "wallet_signAuthorization — works, ZeroDev-compatible shape returned" + "eth_signTypedData_v4 (verifyingContract = EOA) — not blocked"

## Workstream C: Safety And Rollout Controls

### C1. Separate Mainnet Visibility From 7702 Availability

Do not couple these two switches.

Recommended rollout flags:

1. `mainnetNetworksEnabled`
2. `walletSignAuthorizationEnabled`
3. `eip7702EnabledChainIds`

This allows:
- Ethereum and Arbitrum wallet support to ship first
- 7702 to remain disabled until contract/config validation is complete

### C2. Keep Experimental Features Gated Per Chain

For each chain, explicitly record readiness for:
- basic wallet use
- smart accounts
- ERC-4337 sponsorship/bundlers
- 7702 delegation
- Privacy Pools
- Railgun
- swap/bridge

This can live as:
- code comments near network config
- a lightweight matrix in docs
- feature-flag config if the team prefers runtime gating

## Validation Plan

### Automated Checks

Add or extend tests for:

1. `dappRequestMethodToActionKind('wallet_signAuthorization')`
2. `RequestsController.build()` for authorization requests
3. `getAuthorizationHash()` request-shape integration
4. `has7702()` behavior on enabled and disabled chains
5. network bootstrap in mainnet mode vs testnet mode

### Manual QA Matrix

#### Mainnet Wallet QA

- fresh install shows Ethereum and Arbitrum
- `eth_requestAccounts` works
- `wallet_switchEthereumChain` works
- balances and activity load
- send transaction flow completes on both chains

#### 7702 QA

- `wallet_signAuthorization` request opens the correct UI
- approval renders readable chain/account context
- signature resolves back to the dapp
- follow-up typed-data signing succeeds
- ZeroDev delegated onboarding completes

#### Regression QA

- Sepolia still works when testnet mode is intentionally enabled
- existing typed-data and `personal_sign` flows are unchanged
- unsupported chains still fail with clear messaging

## PR Breakdown

Recommended PRs:

### PR 1: Mainnet mode bootstrap

Scope:
- remove forced testnet mode
- expose Ethereum and Arbitrum
- clean up obvious Sepolia-only messaging

### PR 2: Controller/testnet cleanup

Scope:
- replace `testnetNetworks` assumptions in transaction, ENS, and Railgun paths
- verify core wallet flows on mainnet chains

### PR 3: `wallet_signAuthorization` provider support

Scope:
- provider method enum
- background handler
- shared dapp-method mapping
- request building

### PR 4: 7702 chain enablement

Scope:
- add validated chain implementations
- gate enabled chain set
- verify contract implementation lookups

### PR 5: End-to-end ZeroDev validation

Scope:
- manual repro guide or test harness
- final compatibility fixes
- doc refresh

## Risks

1. **Mainnet support is broader than network visibility.**
   Enabling chains in the selector is easy; ensuring every product surface behaves well is the real work.

2. **7702 config is chain-specific.**
   The biggest risk is enabling a chain before the implementation address and end-to-end flow are verified.

3. **Shared code changes can affect more than the extension.**
   `src/ambire-common` changes will likely affect tests and assumptions outside the Kohaku web extension entrypoints.

4. **Feature availability is not uniform across chains.**
   Ethereum and Arbitrum may be ready for core wallet use before Privacy Pools or Railgun are.

5. **Typed-data step remains a real compatibility gate.**
   Even with `wallet_signAuthorization` working, the ZeroDev follow-up signature still needs confirmation on the actual onboarding flow.

## Estimated Complexity

- **Basic Ethereum + Arbitrum wallet visibility:** small-to-medium
- **Removing testnet-mode assumptions across flows:** medium
- **Provider + shared plumbing for `wallet_signAuthorization`:** medium
- **Full 7702 enablement on Ethereum/Arbitrum:** medium-to-large, depending on implementation-address readiness and QA findings

## Definition Of Done

1. ✅ the extension boots in mainnet mode by default
2. ✅ Ethereum and Arbitrum are available and usable as wallet networks
3. ✅ Sepolia-only warnings and docs are replaced with accurate support messaging
4. ✅ `wallet_signAuthorization` works over the injected provider
5. ✅ the shared request pipeline turns that method into `authorization-7702`
6. ✅ intended chains advertise 7702 only after implementation config is verified
7. ✅ the full ZeroDev delegated onboarding flow succeeds without CLI signing

---

## Remaining Open Items

These were out of scope for this initiative or blocked on external information:

| Item | Blocker / Next Step |
|------|---------------------|
| A3 — RPC defaults on fresh install | Audit `networks.ts` hydration path; verify Alchemy/Helios bootstrap without `.env` |
| A5 — Per-chain feature gating | Formal audit of Railgun, swap/bridge, Privacy Pools readiness per chain |
| Privacy Pools Arbitrum | Correct EntryPoint + pool addresses needed from 0xbow team; current addresses undeployed or incorrect |
| Privacy Pools mainnet relayer URL | Confirm `https://relayer.privacypools.com` is correct with 0xbow team |
| C1/C2 — Feature flag matrix | Document per-chain readiness (basic wallet, smart accounts, 7702, Privacy Pools, Railgun, swap/bridge) |
