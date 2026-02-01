# Kohaku Wallet

<picture>
<source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/ethereum/kohaku/refs/heads/master/docs/public/kohaku_logo.svg">
<img alt="Kohaku logo" src="https://raw.githubusercontent.com/ethereum/kohaku/refs/heads/master/docs/public/kohaku_logo.svg" width="auto" height="60">
</picture>

The Kohaku Wallet is a reference implementation browser wallet that consumes the [Kohaku SDK](https://github.com/ethereum/kohaku). The goal is to embed onchain privacy directly into ethereum wallets.

Kohaku Wallet is a fork of [Ambire Wallet](https://github.com/AmbireTech/extension)

It's a work in progress and currently under active development. The only network it supports is Sepolia Testnet.

## Demo Kohaku Wallet

Today, it's still a somewhat manual process to configure and run the extension. Here are all the steps:

1. **Clone this repository**: Clone this repo and switch to the `demo/devconnect` branch.

2. **Initialize submodules**: Run `git submodule init` and then `git submodule update`.

3. **Create and fill in .env file**: Create a `.env` file in this repo root. See `.env-sample` for helpful example. E.g. run `cp .env .env.sample`

   | Variable                         | Description                                                                                             |
   |----------------------------------|---------------------------------------------------------------------------------------------------------|
   | **SEPOLIA_RPC_URL**              | Must be able to handle heavy requests load and read `eth_getLogs` requests with up to a 10 block range. |
   | **USE_HELIOS**                   | Keep `true` if you want to use the Helios light client.                                                 |
   | **PRIVACY_POOLS_ASP_URL**        | Already set.                                                                                           |
   | **PRIVACY_POOLS_RELAYER_URL**        | **NOTE: FOR NOW YOU NEED TO GET THIS ENDPOINT URL FROM SOMEONE WHO HAS IT FOR THE "PRIVATE ACCOUNT" TO LOAD SUCCESSFULLY**                                                                                        |
   | **HYPERSYNC_API_KEY**            | You can generate your API Key [here](https://envio.dev/app/api-tokens).                                 |
   | **RAILGUN_RELAYER_URL**          | Already set.                                                                                            |
   | **RELAYER_URL**                  | Already set.                                                                                            |
   | **VELCRO_URL**                   | Already set.                                                                                            |
   | **BROWSER_EXTENSION_PUBLIC_KEY** | For development, generate `key.pem` as explained [here](https://stackoverflow.com/a/46739698/1333836).  |
   | **REACT_APP_PIMLICO_API_KEY**    | You can generate your API Key [here](https://dashboard.pimlico.io).           |
   | **REACT_APP_ETHERSPOT_API_KEY**  | Can be filled with a dummy value.                                                                       |
   | **NFT_CDN_URL**                  | Already set.                                                                                            |
   | **LEGENDS_NFT_ADDRESS**          | Can also be filled with a dummy value.                                                                  |
   | **LI_FI_API_KEY**                | Can be filled with a dummy value as well.                                                               |

4. **Install dependencies**: Run `yarn install` to install all kohaku-extension dependencies.

5. **Build the extension**: Execute `yarn web:webkit` to build the kohaku-extension. Once you see the two “web compiled successfully” logs, you can stop the process (or keep it running if you prefer). Just open a new terminal tab for the next step.

6. **Load the unpacked extension**: Load the unpacked extension in Chrome (from inside the build/webkit-dev folder), and you’re good to go!

## Troubleshooting

Make sure your `SEPOLIA_RPC_URL` is a strong RPC that can handle heavy load. If using a free tier RPC, we recommend **Infura**.

`USE_HELIOS` env flag is set to true by default. If you're having issues with lag on the extension or with syncing chain data consider setting it to `false`

`PRIVACY_POOLS_RELAYER_URL` is needed if you want to test private withdrawals/transfers with privacy pools. You have to get this env secret out of band. Railgun mock relayer works out of the box.
