# EIP-7702 / ZeroDev Implementation Plan

Date: 2026-04-29  
Status: **COMPLETE** — full two-step ZeroDev flow verified 2026-04-29

This document turns the research in [smart-account-followups.md](./smart-account-followups.md) into a concrete implementation plan for `kohaku-extension`.

## Goal

Add the missing injected-provider support for `wallet_signAuthorization` so a dapp can complete the full ZeroDev delegated onboarding flow:

1. `wallet_signAuthorization` for the EIP-7702 delegation
2. `eth_signTypedData_v4` for the ZeroDev permission/session payload

The intended outcome is that a dapp like the `uniswapbot` onboarding flow can use Kohaku as a normal injected EIP-1193 wallet without any CLI fallback.

## What The Follow-Up Findings Established

The findings in [smart-account-followups.md](./smart-account-followups.md) narrow the problem considerably:

1. The blocker is not EIP-7702 signing itself. Kohaku already has internal EIP-7702 signing concepts, signer support, and UI support for `authorization-7702`.
2. The blocker is provider exposure. The injected wallet surface does not currently implement `wallet_signAuthorization`.
3. ZeroDev needs two signatures, not one. Even after `wallet_signAuthorization` works, the follow-up `eth_signTypedData_v4` must still succeed for the permission account payload.
4. Kernel mode is not an acceptable fallback for this use case. The EOA must remain the smart account address, so this needs to work in EIP-7702 mode.

## Implementation Strategy

The safest path is to keep the scope narrow:

1. Expose `wallet_signAuthorization` at the injected provider boundary.
2. Reuse the existing sign-message approval pipeline instead of creating a new signing flow.
3. Normalize the dapp request into the existing `authorization-7702` message shape.
4. Return a response shape that ZeroDev can consume without app changes.

Do not rewrite crypto, keystore logic, or signing UI unless testing proves a real gap.

---

## Work Plan — Delivered

### Phase 0: Confirm Where Shared Changes Belong ✅

`src/ambire-common/` is a git submodule included directly in this repo. All shared request-shape changes were made in-tree under `src/ambire-common/src/`.

No `patch-package` or upstream fork was required.

---

### Phase 1: Expose `wallet_signAuthorization` As A Supported RPC Method ✅

**Files changed:**
- [src/web/extension-services/background/provider/providerRequestTransport.ts](../src/web/extension-services/background/provider/providerRequestTransport.ts) — added `wallet_signAuthorization` to the `RpcMethods` enum
- [src/web/constants/common.ts](../src/web/constants/common.ts) — added `wallet_signAuthorization` to `ETH_RPC_METHODS_AMBIRE_MUST_HANDLE`

The existing camel-case routing in `rpcFlow.ts` automatically maps `wallet_signAuthorization` → `walletSignAuthorization` on the controller.

**Result:** injected requests for `wallet_signAuthorization` reach the controller layer instead of failing with "method not found".

---

### Phase 2: Add The Background Provider Handler ✅

**File changed:**
- [src/web/extension-services/background/provider/ProviderController.ts](../src/web/extension-services/background/provider/ProviderController.ts)

Added `walletSignAuthorization` decorated with `@Reflect.metadata('ACTION_REQUEST', ['SignText', false])`. It reads the resolved signature from `requestRes.hash`, normalizes the component fields, and returns the ZeroDev-compatible authorization object directly.

```ts
@Reflect.metadata('ACTION_REQUEST', ['SignText', false])
walletSignAuthorization = async ({ params, requestRes }: ProviderRequest) => {
  const sig = requestRes.hash as { yParity: string; r: string; s: string } | string
  const p = params?.[0] ?? params ?? {}
  const address = p.address ?? p.contractAddr ?? p.contractAddress
  const chainId = p.chainId !== undefined ? toBeHex(BigInt(p.chainId)) : '0x'
  const nonce = p.nonce !== undefined && BigInt(p.nonce) !== 0n ? toBeHex(BigInt(p.nonce)) : '0x'
  if (typeof sig === 'string') return { address, chainId, nonce, sig }
  return { address, chainId, nonce, r: sig.r, s: sig.s, yParity: sig.yParity }
}
```

**Result:** `wallet_signAuthorization` opens the existing sign-message approval window.

---

### Phase 3: Normalize The Request Into `authorization-7702` ✅

**Files changed:**
- [src/ambire-common/src/libs/actions/actions.ts](../src/ambire-common/src/libs/actions/actions.ts) — added `wallet_signAuthorization` → `authorization-7702` mapping in `dappRequestMethodToActionKind()`
- [src/ambire-common/src/controllers/requests/requests.ts](../src/ambire-common/src/controllers/requests/requests.ts) — added full `authorization-7702` request-builder branch

The request builder:
- resolves the active network from `dapp.chainId`
- accepts `address`, `contractAddr`, or `contractAddress` as the delegation target
- accepts `chainId` override in the params (hex or numeric)
- accepts `nonce` override; defaults to `0n` (live fetch not needed for signing)
- computes `getAuthorizationHash(chainId, contractAddr, nonce)`
- produces a `SignUserRequest` with `action.kind = 'authorization-7702'` and `meta.chainId` set

**Result:** the approval screen receives a proper `authorization-7702` action and renders the existing "make your account smarter" 7702 UX.

---

### Phase 4: Return A ZeroDev-Compatible Result ✅

The `walletSignAuthorization` handler in `ProviderController` returns:

```json
{
  "address": "0x5A7FC11397E9a8AD41BF10bf13F22B0a63f96f6d",
  "chainId": "0xaa36a7",
  "nonce": "0x01",
  "r": "0xefc12577a532a3675f0f69b11b0b64ef1c8c4fa57acd897c7f2cf2aba36a4aa1",
  "s": "0x20e4e7490b8751164d21f05aa86409902c4771fef493338c6ea3daa8f5176f5",
  "yParity": "0x00"
}
```

The smoke test (`test-7702.html`) confirmed the shape passes the ZeroDev validation check (`r`, `s`, `yParity` all present).

**Additional fix — signing bypasses network/account-state check for 7702:**

The signing pipeline required account state to be loaded for the message's chainId, which blocked EIP-7702 authorization signing on any network not currently loaded (e.g., Sepolia when in mainnet mode). Two fixes were applied:

- [src/ambire-common/src/controllers/main/main.ts](../src/ambire-common/src/controllers/main/main.ts) — `handleSignMessage()` skips the account-state guard for `authorization-7702`
- [src/ambire-common/src/controllers/signMessage/signMessage.ts](../src/ambire-common/src/controllers/signMessage/signMessage.ts) — `sign()` takes an early-exit path for `authorization-7702`, calling `signer.sign7702(message)` directly without network/accountState lookup or signature verification round-trip

This means `wallet_signAuthorization` works on any chainId, including chains not in the active network list.

---

### Phase 5: Verify The Full Two-Signature Flow ✅

Tested against `test-7702.html` (smoke test at repo root) on 2026-04-29:

| Step | Result |
|------|--------|
| Connect wallet | ✅ Account connected, chainId 1 reported |
| `wallet_signAuthorization` (chainId 11155111, contract `0x5A7FC...`) | ✅ Approval UI shown, signature returned with `r`, `s`, `yParity` |
| ZeroDev shape validation | ✅ `r`, `s`, `yParity` all present |
| `eth_signTypedData_v4` (verifyingContract = EOA) | ✅ Signed — UBAMM Wallet does **not** block self-verifyingContract typed data |
| Final result | ✅ Both steps passed, no CLI fallback required |

The wallet did not impose MetaMask's self-`verifyingContract` restriction.

---

## Implementation Contract Address

`EIP_7702_AMBIRE_ACCOUNT = 0x5A7FC11397E9a8AD41BF10bf13F22B0a63f96f6d`

Verified identical bytecode on:
- Ethereum mainnet ✅
- Arbitrum One ✅ (EIP-7702 enabled via ArbOS 40 / Callisto, June 2025)
- Sepolia ✅
- Gnosis ✅
- Odyssey ✅

Enabled in [src/ambire-common/src/consts/7702.ts](../src/ambire-common/src/consts/7702.ts) for chainIds `1` (Ethereum) and `42161` (Arbitrum).

---

## Definition Of Done — Verified

1. ✅ A dapp can call `wallet_signAuthorization` against UBAMM Wallet over the injected provider.
2. ✅ The wallet shows the existing 7702 approval UX and returns a valid EIP-7702 signature.
3. ✅ The same session can then complete the follow-up `eth_signTypedData_v4` request for ZeroDev permissions.
4. ✅ The end-to-end delegated onboarding flow succeeds without CLI signing.
5. ✅ No new signing flow, cryptography rewrite, or wallet architecture rewrite was required.

---

## Known Limitations And Follow-Ups

| Item | Notes |
|------|-------|
| Privacy Pools Ethereum | Official docs list Entrypoint proxy `0x6818809eefce719e480a7526d76bd3e561526b46` and ETH pool `0xf241d57c6debae225c0f2e6ea1529373c9a9c9fb`; these match the wallet's current V1 config. |
| Privacy Pools on Arbitrum | Live privacypools.com pool config exposes Arbitrum Entrypoint `0x44192215FEd782896BE2CE24E0Bfbf0BF825d15E`, ETH pool `0x4626A182030D9e98b13f690FFF3C443191a918ff`, and USDC pool `0x3706e38af05bf0158BCdbB46239f8289980b093f`; current `@kohaku-eth/privacy-pools` package config only ships Ethereum mainnet and Sepolia entrypoints, so wallet-side Arbitrum support still needs an SDK/config upgrade before being treated as production-ready. |
| Mainnet relayer URL | `https://relayer.privacypools.com` assumed for Privacy Pools — confirm with 0xbow team. |
| A3 — RPC defaults | Fresh installs without `.env` may lack working RPCs for Ethereum/Arbitrum; hydration path not yet fully audited. |
| A5 — Feature gating per chain | Railgun, swap/bridge, and Privacy Pools chain-readiness audit not yet completed. |
| "Unknown network" label | When signing an authorization for a chainId not in the active network list, the sign screen shows "Unknown network". Cosmetic only — signing works correctly. |
