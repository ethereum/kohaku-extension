// Stands in for @common/config/env: the real module loads Expo's ESM native modules, which Jest cannot run.
export const isTesting = process.env.IS_TESTING === 'true'
export const isDev = process.env.APP_ENV === 'development'
export const isProd = process.env.APP_ENV === 'production'
export const isStaging = process.env.APP_ENV === 'staging'
export const APP_ID = 'N/A'
export const APP_VERSION = 'N/A'
export const BUILD_NUMBER = 'N/A'
export const RELEASE_CHANNEL = 'N/A'
export const RUNTIME_VERSION = 'N/A'
export const EXPO_SDK = 'N/A'
export const isiOS = false
export const isAndroid = false
export const isWeb = true
export const isRelayerless = !process.env.RELAYER_URL

export default {
  APP_ENV: 'development',
  ENVIRONMENT: 'development'
}
