import CONFIG, { APP_VERSION } from '@common/config/env'
import * as Sentry from '@sentry/react'

export const CRASH_ANALYTICS_WEB_CONFIG = {
  dsn: CONFIG.SENTRY_DSN_BROWSER_EXTENSION,
  environment: CONFIG.APP_ENV as string,
  release: `extension-${process.env.WEB_ENGINE}@${APP_VERSION}`,
  // Disables sending personally identifiable information
  sendDefaultPii: false,
  integrations: []
}

export const captureException = Sentry.captureException
export const captureMessage = Sentry.captureMessage
export const setExtraContext = Sentry.setExtra
export const setUserContext = Sentry.setUser
export const ErrorBoundary = Sentry.ErrorBoundary

// Crash reporting is opt-in for privacy-focused extension builds.
export const CRASH_ANALYTICS_ENABLED_DEFAULT = false
