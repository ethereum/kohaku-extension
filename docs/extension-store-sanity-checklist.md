# Extension Store Sanity Checklist

Use this before uploading a release package to Chrome Web Store, Edge Add-ons, or Mozilla AMO.

## Release Build

1. Confirm version in `app.json`.
2. Build the extension:

   ```bash
   yarn build:extensions
   ```

3. Upload only the runtime package:
   - Chrome/Edge: `build/ambire-extension-v<version>-webkit.zip`
   - Firefox: `build/ambire-extension-v<version>-gecko.zip`

4. Do not upload `*-source-maps.zip` to extension stores.

## Store Listing

- Extension name: `UBAMM Wallet`
- Short description: `Privacy-focused Web3 wallet for secure transactions on Ethereum.`
- Category: wallet / productivity / developer tools, depending on the store choices available.
- Visibility for client distribution: unlisted/hidden/private first.
- Privacy policy URL: publish `docs/privacy-policy.md` on your own website and use that URL in the dashboard.
- Support contact: use an email or support page controlled by you.
- Developer identity: avoid Ethereum Foundation or Ambire branding unless you have explicit authorization.

## Permission Justifications

Use concise explanations like these in review notes.

- `storage`: stores encrypted wallet data, settings, connected dapps, network configuration, transaction state, and activity state locally.
- `unlimitedStorage`: wallet state and privacy protocol data can exceed default extension storage limits.
- `tabs`: opens wallet-controlled tabs/windows and detects active dapp tabs for wallet connection state.
- `activeTab`: grants temporary access to the active tab after user interaction.
- `scripting`: injects the Ethereum provider bridge into dapp pages so websites can request wallet connections and signatures.
- `alarms`: schedules auto-lock and background maintenance.
- `notifications`: alerts users about wallet lock and transaction-related events.
- `system.display`: positions extension windows on Chromium browsers.
- `host_permissions` for `http://*/*` and `https://*/*`: required for a browser wallet provider to work across dapps and for extension pages/background scripts to call RPC, relayer, token metadata, privacy protocol, and other wallet service endpoints.

## Privacy Review Notes

- Crash analytics are opt-in.
- Seed phrases, private keys, and passwords are not intentionally transmitted.
- Wallet addresses and transaction data may be sent to RPC providers, relayers, bundlers, paymasters, token metadata services, swap/bridge services, and privacy protocol providers when needed for requested wallet features.
- Public blockchain transactions are visible on-chain.
- Data is not sold, used for advertising, or used for creditworthiness.
- The privacy policy includes the Chrome Web Store Limited Use statement.

## Pre-Upload Checks

Run these after the build:

```bash
test ! -f build/webkit-prod/*.map
test ! -f build/gecko-prod/*.map
unzip -l build/ambire-extension-v$(node -p "require('./app.json').expo.version")-webkit.zip | grep manifest.json
unzip -l build/ambire-extension-v$(node -p "require('./app.json').expo.version")-gecko.zip | grep manifest.json
```

Then inspect the generated manifests:

```bash
sed -n '1,180p' build/webkit-prod/manifest.json
sed -n '1,180p' build/gecko-prod/manifest.json
```

Confirm:

- no `file://*/*` host permission;
- no `wss://*/*` host permission;
- no `externally_connectable` wildcard unless you intentionally need external extension messaging;
- no production `key` field unless you explicitly set `INCLUDE_EXTENSION_PUBLIC_KEY=true`;
- Firefox `browser_specific_settings.gecko.id` is set to your desired stable ID.

