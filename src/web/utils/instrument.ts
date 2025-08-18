import {
  CRASH_ANALYTICS_ENABLED_DEFAULT,
  CRASH_ANALYTICS_WEB_CONFIG
} from '@common/config/analytics/CrashAnalytics.web'
import { SENTRY_DSN_BROWSER_EXTENSION } from '@env'
import * as Sentry from '@sentry/react'
import { isExtension } from '@web/constants/browserapi'

import { getUiType } from './uiType'

const { uiType } = getUiType()

// eslint-disable-next-line no-console
const consoleWarn = console.warn
const SUPPRESSED_WARNINGS = [
  // 2 <Routes > components are rendered in the tree at the same time to allow for lazy loading.
  'No routes matched location',
  'setNativeProps is deprecated. Please update props using React state instead.',
  'Animated: `useNativeDriver` is not supported because the native animated module is missing. Falling back to JS-based animation.'
]

// eslint-disable-next-line no-console
console.warn = function filterWarnings(msg, ...args) {
  if (!SUPPRESSED_WARNINGS.some((entry) => msg?.includes(entry))) {
    consoleWarn(msg, ...args)
  }
}

// Initialize Sentry conditionally based on the user's
// settings. The user preference will take effect after
// reloading the page or opening a new tab.
const initializeSentry = async () => {
  if (!isExtension) return

  if (!SENTRY_DSN_BROWSER_EXTENSION) {
    console.warn('Sentry DSN for browser extension is not defined. Sentry will not be initialized.')
    return
  }

  /**
   * Since v5.15.0, we enable anonymous crash reporting by default. To avoid respecting
   * outdated user preferences from v5.11.x–v5.14.x (where users may have manually disabled it),
   * we ignore stored values and always use the new default.
   */
  // const isEnabled = await storage.get('crashAnalyticsEnabled', CRASH_ANALYTICS_ENABLED_DEFAULT)
  const isEnabled = CRASH_ANALYTICS_ENABLED_DEFAULT

  if (!isEnabled) return

  Sentry.init({
    ...CRASH_ANALYTICS_WEB_CONFIG,
    initialScope: {
      tags: {
        content: 'ui',
        uiType
      }
    }
  })
}

initializeSentry()
