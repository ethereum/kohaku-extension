# Kohaku Wallet

<picture>
<source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/ethereum/kohaku/refs/heads/master/docs/public/kohaku_logo.svg">
<img alt="Kohaku logo" src="https://raw.githubusercontent.com/ethereum/kohaku/refs/heads/master/docs/public/kohaku_logo.svg" width="auto" height="60">
</picture>

The Kohaku Wallet is a reference implementation browser wallet that consumes the [Kohaku SDK](https://github.com/ethereum/kohaku). The goal is to embed onchain privacy directly into ethereum wallets.

Kohaku Wallet is a fork of [Ambire Wallet](https://github.com/AmbireTech/extension)

It's a work in progress and currently under active development. The only network it supports is Sepolia Testnet.

## Demo Kohaku Wallet

Here are the steps to build and run the kohaku extension yourself:

1. **Clone this repository**: Copy this repo's url and run `git clone <url>`

2. **Initialize submodules**: Run `git submodule init` and then `git submodule update`.

3. **Create and fill in .env file**: Create a `.env` file in this repo root e.g. run `cp .env-sample .env`. See below for description of env vars you have to fill in yourself:

   | Variable                         | Description                                                                                             |
   |----------------------------------|---------------------------------------------------------------------------------------------------------|
   | **SEPOLIA_RPC_URL**              | Must be able to handle heavy requests load and read `eth_getLogs` requests with up to a 10 block range. |
   | **HYPERSYNC_API_KEY**            | You can generate your API Key [here](https://envio.dev/app/api-tokens).                                 |
   | **BROWSER_EXTENSION_PUBLIC_KEY** | For development, generate `key.pem` as explained [here](https://stackoverflow.com/a/46739698/1333836).  |
   | **REACT_APP_PIMLICO_API_KEY**    | You can generate your API Key [here](https://dashboard.pimlico.io).           |
   | **RPC_PROVIDER**                 | Choose the RPC provider type: `rpc`, `helios`, or `colibri`. (default is `colibri` lightclient) |

4. **Install dependencies**: Run `yarn install` to install all kohaku-extension dependencies.

5. **Build the extension**: Execute `yarn web:webkit` to build the kohaku-extension. Once you see the two “web compiled successfully” logs, you can stop the process (or keep it running if you prefer). Just open a new terminal tab for the next step.

6. **Load the unpacked extension**: Load the unpacked extension in Chrome (from inside the `build/webkit-dev` folder), and you’re good to go!

## Troubleshooting

Make sure your `SEPOLIA_RPC_URL` is a strong RPC that can handle heavy load. If using a free tier RPC, we recommend **Infura**.

`PRIVACY_POOLS_RELAYER_URL` is needed if you want to test private withdrawals/transfers. You have to get this env secret out of band.

`RPC_PROVIDER` defaults to `colibri`. If you're having any issues related to the rpc syncing chain data consider setting it to `rpc`
