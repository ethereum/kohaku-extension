# Kohaku Wallet

<picture>
<source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/ethereum/kohaku/refs/heads/master/docs/public/kohaku_logo.svg">
<img alt="Kohaku logo" src="https://raw.githubusercontent.com/ethereum/kohaku/refs/heads/master/docs/public/kohaku_logo.svg" width="auto" height="60">
</picture>

The Kohaku Wallet is a reference implementation browser wallet that consumes the [Kohaku SDK](https://github.com/ethereum/kohaku). The goal is to embed onchain privacy directly into ethereum wallets.

Kohaku Wallet is a fork of [Ambire Wallet](https://github.com/AmbireTech/extension)

It's a work in progress and currently under active development. The only network it supports is Sepolia Testnet.

## Demo

Demo a pre-built version (March 2026) of the Kohaku Wallet on sepolia testnet.

1. Download the zip file here: https://ipfs.io/ipfs/bafybeicf45pmqwoyoa7fdwpeg2tzfugchosbelwvkkg7dp6am6lguwzod4 and then unzip it (folder will be called `webkit-dev`)

2. Open Chrome browser and navigate to: `chrome://extensions/`

3. Select `Developer mode` in the upper right corner then click `Load unpacked` and select the `webkit-dev` folder to load the Kohaku Wallet Demo


## Develop

Here are the steps to build and run the kohaku extension yourself:

1. **Clone this repository**: Run `git clone <repo-url>`. Then enter the repo's root directory.

2. **Initialize submodules**: Run `git submodule init` and then `git submodule update`.

3. **Create and fill in .env file**: Run `cp .env-sample .env`. Then fill in vars on `.env` file. See below for description of REQUIRED vars to fill in:

   | Variable                         | Description                                                                                             |
   |----------------------------------|---------------------------------------------------------------------------------------------------------|
   | **SEPOLIA_RPC_URL**              | Must be able to handle heavy requests load and read `eth_getLogs` requests with up to a 10 block range. |
   | **ALCHEMY_API_KEY**              | An [alchemy](https://alchemy.com) api key that supports sepolia testnet (regardless of SEPOLIA_RPC_URL above - an alchemy url or not - you need to fill in this ALCHEMY_API_KEY var separately) |
   | **HYPERSYNC_API_KEY**            | You can generate your API Key [here](https://envio.dev/app/api-tokens).                                 |
   | **BROWSER_EXTENSION_PUBLIC_KEY** | For development, generate `key.pem` as explained [here](https://stackoverflow.com/a/46739698/1333836).  |
   | **REACT_APP_PIMLICO_API_KEY**    | You can generate your API Key [here](https://dashboard.pimlico.io).           |

4. **Install dependencies**: Run `yarn install` to install all kohaku-extension dependencies.

5. **Install submodule dependencies**: Run `cd src/ambire-common && npm install && ../..` to install the submodule deps.

6. **Build the extension**: Execute `yarn web:webkit` to build the kohaku-extension. Once you see the two “web compiled successfully” logs, you can stop the process (or keep it running if you prefer). Just open a new terminal tab for the next step.

7. **Load the unpacked extension**: Load the unpacked extension in Chrome (from inside the `build/webkit-dev` folder), and you’re good to go!

## Troubleshooting

Make sure your `SEPOLIA_RPC_URL` is a strong RPC that can handle heavy load. If using a free tier RPC, we recommend **Infura**.

`RPC_PROVIDER` defaults to `colibri`. If you're having any issues related to the rpc syncing chain data consider setting it to `rpc` (no lightclient)

## Account recovery: manual test against a fork

The account recovery setup (choose a recovery path, enroll guardians and passkeys, pick a privacy level, review, save on chain, download the Recovery Card) runs end to end against deployed recovery contracts. The contracts are not on public Sepolia yet: they live on a fork of Sepolia (a Tenderly virtual network). This section is the walkthrough for testing the setup by hand against that fork.

What you can test this way: the whole setup flow, up to a real save transaction and the Recovery Card. What you cannot test yet: recovering an account, approving or cancelling a recovery as a guardian, and viewing or editing a saved setup. Those screens belong to later milestones; the wallet's client refuses them as "not served" against real contracts.

### What you need

- Node `>=22.12 <23`, yarn `1.22`, Chrome, and SSH access to GitHub (the `src/ambire-common` submodule is fetched over SSH).
- A way to give test ETH to an address **on the fork**: the faucet in the Tenderly dashboard of the virtual network. ETH on public Sepolia does not reach the fork.
- The fork and the contracts on it. The fork used for this milestone was deployed on 2026-10-02 (forked from Sepolia at block 11829361, chain id 11155111). It is a shared test network: anyone with the RPC URL can send transactions to it.

  | | |
  | --- | --- |
  | RPC URL | `https://virtual.sepolia.us-east.rpc.tenderly.co/e326a9bd-73b2-43c1-8079-eb37dd576267` |
  | Explorer | `https://dashboard.tenderly.co/explorer/vnet/e326a9bd-73b2-43c1-8079-eb37dd576267` |

  | Contract | Address | Deployed at block |
  | --- | --- | --- |
  | Manager (`PolicyManager` 1.0.0) | `0x734B9Aa580d4A184Ea129E791C4C9Fb8734B3aC6` | 11829364 |
  | ECDSA method (`method-ecdsa` 1.0.0) | `0x2CEC192aEDBC3C7348e19eEE7CefE1f12dFA50f9` | 11829365 |
  | Passkey method (`method-passkey` 1.0.0) | `0xF6f15A5E84615644d09BdBBB23ecc67E804B6043` | 11829366 |
  | Recovery action (`AmbireRecoveryAction` 1.0.0) | `0x1e612c81087aaE64C31cb68953A480D06c5E4ac7` | 11829367 |

### 1. Build the extension for the fork

1. Follow steps 1 to 5 of [Develop](#develop) (clone, submodules, `.env`, `yarn install`, the submodule's `npm install`). Use plain `yarn install`; if it rewrites `yarn.lock`, discard that change with `git checkout -- yarn.lock`.
2. In `.env`, set these three values. The deployment value is one line of JSON inside single quotes:

   ```
   SEPOLIA_RPC_URL="https://virtual.sepolia.us-east.rpc.tenderly.co/e326a9bd-73b2-43c1-8079-eb37dd576267"
   RPC_PROVIDER="rpc"
   SOCIAL_RECOVERY_SEPOLIA_DEPLOYMENT='{"manager":"0x734B9Aa580d4A184Ea129E791C4C9Fb8734B3aC6","methodEcdsa":"0x2CEC192aEDBC3C7348e19eEE7CefE1f12dFA50f9","methodPasskey":"0xF6f15A5E84615644d09BdBBB23ecc67E804B6043","action":"0x1e612c81087aaE64C31cb68953A480D06c5E4ac7","deployedAt":11829364,"digestVersion":"1","managerVersion":"1.0.0","auditedActions":[{"action":"0x1e612c81087aaE64C31cb68953A480D06c5E4ac7","publisher":"ethereumFoundation"}],"explorerUrl":"https://dashboard.tenderly.co/explorer/vnet/e326a9bd-73b2-43c1-8079-eb37dd576267"}'
   ```

   - `RPC_PROVIDER` must be `rpc`. The light clients (`colibri`, `helios`) follow public Sepolia and cannot follow a fork.
   - `explorerUrl` is optional. It is the base that `/tx/<hash>` is appended to, so "View on explorer" opens the fork's own transaction page. For a Tenderly virtual network it has the form `https://dashboard.tenderly.co/explorer/vnet/<network id>`, as in the value above. Without it the link opens Sepolia's Etherscan, which does not know the fork's transactions.
   - Write the addresses with their checksum capitals as above, or all in lower case.
   - With `SOCIAL_RECOVERY_SEPOLIA_DEPLOYMENT` empty, the wallet builds its built-in stand-in client, which exists for development and for the unit tests: against a real node the setup does not complete. With a malformed value (a missing or unknown field, a bad address) most recovery screens fall to the wallet's "Something went wrong, but your funds are safe!" page. If you see that page on a recovery screen, check this value first.
3. Build: `yarn build:web:webkit` (about two minutes). The extension is in `build/webkit-prod`.

The build inlines the `.env` values. After any change to `.env`, build again and reload the extension.

Keep the same `BROWSER_EXTENSION_PUBLIC_KEY` for every build you test with. The extension's id derives from it, and every passkey you enroll is bound to that id: a build with another key cannot use the passkeys of the first.

### 2. Load it in a fresh Chrome profile

1. Create a new Chrome profile (or use one where Kohaku was never installed). The wallet stores the network's RPC the first time it starts; an old profile keeps talking to the old RPC.
2. Open `chrome://extensions`, turn on `Developer mode`, click `Load unpacked` and select `build/webkit-prod`.
3. Do not load `build/webkit-dev` in the same profile: both builds have the same extension id and Chrome refuses the second.
4. Keep exactly one Kohaku tab open while you go through onboarding. Two tabs race each other.

### 3. Create the wallet

Recovery protects a **smart account**. Only the create path gives you one.

1. On "Welcome to Kohaku" choose **Create new account**. Do not use "Import existing account": the import path lists basic accounts only, and no setting shows the smart accounts, so recovery cannot be set up for an imported phrase today.
2. Tick the three tips, press **Create recovery phrase**, write the 12 words down, press **I've saved the phrase**. Nothing checks the words afterwards.
3. "Set extension password": fill **Password** and **Repeat password**, tick the terms, press **Confirm**.
4. In the account picker keep the default selection: the basic account and, under **Smart accounts**, the account with the green "Smart Account" pill. Press **Import accounts** (about ten seconds), then **Complete**.
5. The smart account is the selected account. Lists show it with an "SA" badge.

6. Open the recovery setup. It always opens in a full tab. Any of these works:
   - Click the Kohaku icon in the toolbar, then the gear icon at the top right, then **Account recovery** in the menu.
   - In a full tab of the wallet, click the gear icon, then **Account recovery** in the settings sidebar.
   - Paste `chrome-extension://<extension id>/tab.html#/social-recovery/setup` in the address bar. The id is on the Kohaku card of `chrome://extensions` ("ID: …").

The wallet's dashboard may show "Something went wrong, but your funds are safe!" after onboarding. It comes and goes, and it is outside the recovery module: press **Reload**, restart the browser, or go straight to the recovery setup with one of the three ways above. Settings and the recovery screens are not affected.

### 4. Set up the recovery path

1. On the presets screen pick a preset card and press **Continue**, or press **Customize** to start from an empty path. With Customize: **Add a group**, then **Add member** for each member.
2. A guardian: in "Add to your path", under Guardians choose **New address**, paste an address you control, press **Add** (the checks take about six seconds), then **Save and continue**. A guardian's address becomes public on chain when it approves a recovery.
3. A passkey: **Add member**, under Passkeys choose **Enroll something new**, press **Create passkey**. The browser asks for Touch ID, the device PIN or a security key. Press **Run the test** (the browser asks again), then **Save and continue**. The passkey works only from this extension id on this browser.
4. Set how many members a group needs (for example "Require 1 of 2") and press **Continue**. The wallet checks the path against the contracts (one or two seconds).
5. Waiting period: choose one of the options and press **Continue**.
6. Privacy: choose a level. With **Private**, type a recovery password in **Password** and **Confirm password**. This is a second password, separate from the extension password; it goes on the Recovery Card.
7. Review: check the account address, "Key being removed" and the list under "Verify the details" (the two methods and the recovery module read from the fork, the module shown as audited). Press **Save recovery path**.

Do not choose the Passport or the Aadhaar identity methods. This deployment does not have them; the enrollment says they are not supported and a path that needs them cannot be saved.

### 5. Fund the account's key, then save

The save is one transaction. It is sent and paid by the smart account's own key (its controlling key), not by the basic account. That key is not listed anywhere else in the wallet.

1. After "Save recovery path" the wallet checks the gas. A new account's key holds nothing, so the screen says **Not enough gas on your account's key**, with the amount missing and the key's address (there is a **Copy** button).
2. Send at least that amount (0.001 ETH is plenty; a save cost about 0.0003 ETH in testing) to **that key address** on the fork, with the Tenderly faucet. Funding the basic account or the smart account does not help.
3. Press **Continue** on the gas screen. The sign window opens after a few seconds.
4. The sign window shows two calls: **Enable recovery module** for the recovery action's address, with no danger warning, and an interaction with the manager's address. Under "Pay fee with" keep the payer the wallet selected, **Key 1** with the key's address. Press **Sign**.
5. "Submitting" shows for a few seconds, then **Setup saved** with the transaction hash. **View on explorer** opens the transaction on the fork's explorer when `explorerUrl` is set.
6. Press **Continue**. The Recovery Card shows, with the recovery password hidden behind **Reveal**.

### 6. What to check

- Reload the Recovery Card's tab. The card must ask: "Enter your recovery password to show your Recovery Card. This is not your extension password." A wrong password is refused ("That is not your recovery password. Try again."); the right one shows the card again. The wallet opens the encrypted backup it reads from the fork to check it.
- Open the save page again (go back, or paste its address). It must say **Already set up**, "This account already has a recovery setup", and must not offer to save again.
- On the fork's explorer, the transaction is sent by the account's key to the account factory, and it contains the two calls: the grant to the recovery module, and `commitSetup` on the manager. The manager emits `SetupCommitted` for your account.
- Try the edges you care about: close the tab while "Submitting" shows and open the save page again (it must follow the same save, not offer a second one); open the save page in two tabs; reject the request in the sign window (the screen must say the save was not sent and offer to try again).

A reference run on 2026-10-05 saved a setup with one group (one guardian address and one passkey, any 1 of 2), a 48 hour waiting period and the Private level: transaction `0x6d17dcc6b7f51a1c54ca17b14044b5c530b6f1a645f7783925a4377c79c77d3d` in block 11829369, 280,141 gas ([on the fork's explorer](https://dashboard.tenderly.co/explorer/vnet/e326a9bd-73b2-43c1-8079-eb37dd576267/tx/0x6d17dcc6b7f51a1c54ca17b14044b5c530b6f1a645f7783925a4377c79c77d3d)). A simulated start of a recovery by that guardian succeeded against the saved setup.

### Caveats

- **One setup per account.** After a save, that account cannot save a second setup, and no screen edits a saved one yet. To run the flow again, create another wallet in another fresh profile (and fund the new account's key).
- **The entry still says "Not set up" after a save.** The "Account recovery" entry does not read the chain yet, so it offers the presets again for an account that has a setup. The review and the save refuse that account correctly. The view of a saved setup comes with a later milestone, and "Open your recovery path" leads to a page that does not exist yet.
- **The recovery password lives in memory only.** If the browser restarts, or the extension reloads, between the privacy step and the save, the save page sends you back to the privacy step to type it again.
- **Only a created wallet works.** An imported recovery phrase gets basic accounts only (see step 3).
- **The fork is not Sepolia, but it has Sepolia's chain id.** A transaction signed for the fork is also valid on public Sepolia for the same account nonce. Use a throwaway wallet, never a wallet you care about.
- **The fork does not follow Sepolia.** It mines one block per transaction and none in between. Balances and contracts from public Sepolia after the fork block are not there.
- **The wallet's dashboard fails now and then** with "Something went wrong, but your funds are safe!" (an animation error, seen in the full tab and in the popup). It is outside the recovery module and does not depend on the fork; see step 3 for the ways around it.
- **Guardians do not act yet.** Enrolling a guardian by address needs nothing from the guardian. The screens where a guardian approves, and the "Recover an account" entry, are not connected to the real contracts in this milestone.
- **A passkey stored by a password manager** (Google Password Manager, iCloud Keychain) shows as synced, not as bound to this device. Both work for the setup.
- **The sign window's fee estimate is high** (about a third above the fee that was paid in testing).
- **The Recovery Card shows your recovery password** when you press Reveal or download it. Treat a card from a test like any secret you would not paste in a chat.
- **Dev builds** (`yarn web:webkit`, `build/webkit-dev`) read the same `.env` and work the same way, but the dev server uses port 19006 and a stale server breaks the next build. The walkthrough above uses the production build.
