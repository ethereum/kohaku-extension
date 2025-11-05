// Define the environment variables types here, so that the ts imports don't complain
// {@link https://github.com/goatandsheep/react-native-dotenv/issues/52#issuecomment-673218479|
declare module '@env' {
  // eslint-disable-next-line global-require
  const log = require('loglevel')

  export type EnvTypes = {
    RELAYER_URL: string
    VELCRO_URL: string
    SOCKET_API_KEY: string
    LI_FI_API_KEY: string
    SENTRY_DSN?: string
    ENVIRONMENT: string
    DEFAULT_KEYSTORE_PASSWORD_DEV: string
    NFT_CDN_URL: string
    LEGENDS_NFT_ADDRESS: string
    SENTRY_DSN_LEGENDS?: string
    SENTRY_DSN_BROWSER_EXTENSION?: string
    ALCHEMY_API_KEY: string
    PRIVACY_POOLS_ASP_URL: string
    PRIVACY_POOLS_RELAYER_URL: string
    HYPERSYNC_API_KEY: string
  }

  /**
   * The Ambire relayer for all EVM chains. Responsible for managing on-chain
   * Identities (called "Ambire accounts") and relaying gasless transactions
   * to the Ethereum network. It is not intended to be blockchain-agnostic,
   * and it is Ethereum-specific.
   */
  export const RELAYER_URL: EnvTypes['RELAYER_URL']

  /**
   * Alternative to Zapper, developed by Ambire. Serves the same purpose.
   */
  export const VELCRO_URL: EnvTypes['VELCRO_URL']

  /**
   * Sentry is application monitoring and error tracking app used by the mobile app.
   */
  export const SENTRY_DSN: EnvTypes['SENTRY_DSN'] | undefined

  /**
   * The URL for the Ambire NFT proxy service, responsible for resolving NFT images from the passed parameters.
   * Takes in RPC url, contract address and token Id so we can use the complete proxy URL as source for image components.
   */
  export const NFT_CDN_URL: EnvTypes['NFT_CDN_URL']

  /**
   * This value can be used to control the state of the controller logs.
   * If set to "true", the logs will be displayed only for the controller which is updated.
   * Due to the high volume of logs causing memory leak on FF, it is recommended to use this only for debugging purposes.
   */
  export const BROWSER_EXTENSION_LOG_UPDATED_CONTROLLER_STATE_ONLY: string

  /**
   * This value can be used to control the unique ID of an extension, when it is
   * loaded during development. In prod, the ID is generated in Chrome Web Store
   * and can't be changed (could be retrieved from Chrome Web Store).
   * In DEV, it is generated based on a key.pem using the following method:
   * {@link https://stackoverflow.com/a/46739698/1333836}
   */
  export const BROWSER_EXTENSION_PUBLIC_KEY: string

  export const ENVIRONMENT: string

  /**
   * Auto-Fill Keystore Password during development
   */
  export const DEFAULT_KEYSTORE_PASSWORD_DEV: EnvTypes['DEFAULT_KEYSTORE_PASSWORD_DEV']

  /**
   * Are we running the E2E tests?
   * The accepted value is 'true'.
   * Note that we don't have a dedicated testing environment (APP_ENV).
   * E2E tests can be run against both DEV and PROD environments.
   */
  export const IS_TESTING: string

  /**
   * Socket API is part of the Bungee API. It allows developers to easily transfer
   * liquidity across chains, access aggregated liquidity and information from
   * hundreds of on-chain and off-chain decentralized exchange networks, bridges,
   * across multiple blockchains. Access is restricted and requires an API key.
   */
  export const SOCKET_API_KEY: EnvTypes['SOCKET_API_KEY']

  /**
   * Socket API is part of the Bungee API. It allows developers to easily transfer
   * liquidity across chains, access aggregated liquidity and information from
   * hundreds of on-chain and off-chain decentralized exchange networks, bridges,
   * across multiple blockchains. Access is restricted and requires an API key.
   */
  export const LI_FI_API_KEY: EnvTypes['LI_FI_API_KEY']

  /**
   * The address of the Legends NFT contract (same on PROD and STAGING)
   */
  export const LEGENDS_NFT_ADDRESS: EnvTypes['LEGENDS_NFT_ADDRESS']

  /**
   * Sentry is application monitoring and error tracking app
   */
  export const SENTRY_DSN_LEGENDS: EnvTypes['SENTRY_DSN_LEGENDS']

  /**
   * Sentry is application monitoring and error tracking app
   */
  export const SENTRY_DSN_BROWSER_EXTENSION: EnvTypes['SENTRY_DSN_BROWSER_EXTENSION']

  /**
   * The API key for Alchemy
   */
  export const ALCHEMY_API_KEY: EnvTypes['ALCHEMY_API_KEY']

  /**
   * The PrivacyPools ASP API endpoint
   */
  export const PRIVACY_POOLS_ASP_URL: EnvTypes['PRIVACY_POOLS_ASP_URL']

  /**
   * The API key for Alchemy
   */
  export const PRIVACY_POOLS_RELAYER_URL: EnvTypes['PRIVACY_POOLS_RELAYER_URL']

  /**
   * The API key for sdk RPC (Hypersync from Envio)
   */
  export const HYPERSYNC_API_KEY: EnvTypes['HYPERSYNC_API_KEY']
}
