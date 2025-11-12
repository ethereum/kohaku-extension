# Kohaku Wallet

<picture>
<source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/ethereum/kohaku/refs/heads/master/docs/public/kohaku_logo.svg">
<img alt="Kohaku logo" src="https://raw.githubusercontent.com/ethereum/kohaku/refs/heads/master/docs/public/kohaku_logo.svg" width="auto" height="60">
</picture>

The Kohaku Wallet is a reference implementation browser wallet that consumes the [Kohaku SDK](https://github.com/ethereum/kohaku). The goal is to embed onchain privacy directly into ethereum wallets.

Kohaku Wallet is a fork of [Ambire Wallet](https://github.com/AmbireTech/extension)

It's a work in progress and currently under active development. Today, the only network it supports is Sepolia Testnet.

## Demo Kohaku Wallet

Today, it's still a somewhat manual process to configure the extension for a successful demo

1. Clone the [Kohaku SDK](https://github.com/ethereum/kohaku).

2. From the kohaku repo root, run `pnpm install` then `pnpm build`.

3. Clone this repo and switch to the `demo/devconnect` branch.

4. Run `git submodule init` and then `git submodule update`.

5. Verify that the `@kohaku-eth/railgun` dependency in package.json points to your local filepath.

6. Create and fill in a `.env` file in this repo root. See `.env-sample` for an example

7. Run `yarn install` to install all extension dependencies.

8. Run `yarn web:webkit` to build the extension. Once you see the two “web compiled successfully,” logs you can stop the process (or keep it running if you prefer, just open a new terminal tab for the next step).

9. Run `npm run copy:circuit-artifacts` in the extension root after the build completes (this injects the railgun zk proving artifacts).

10. Load the unpacked extension in Chrome (inside the build folder), and you’re good to go!

## Troubleshooting

Make sure your `SEPOLIA_RPC_URL` is a strong RPC that can handle heavy load. If using a free tier RPC, we recommend Infura.

`PRIVACY_POOLS_RELAYER_URL` and `RAILGUN_RELAYER_URL` are required. Reach out if you don't have them.

`USE_HELIOS` env flag is set to true by default. If you're having issues with lag on the extension or with syncing chain data consider setting it to `false`
