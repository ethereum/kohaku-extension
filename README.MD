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
