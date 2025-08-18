import { KEYSTORE_PASS } from 'constants/env'
import mainConstants from 'constants/mainConstants'
import selectors from 'constants/selectors'

import { BrowserContext, chromium, Page } from '@playwright/test'

const buildPath = `build/${process.env.WEBPACK_BUILD_OUTPUT_PATH || 'webkit-prod'}`
const USER_DATA_DIR = '' // you can set a temp dir if needed

let currentContext: BrowserContext | null = null

const playwrightArgs = [
  `--disable-extensions-except=${__dirname}/../../${buildPath}/`,
  `--load-extension=${__dirname}/../${buildPath}/`,
  '--disable-features=DialMediaRouteProvider',
  '--clipboard-write=granted',
  '--clipboard-read=prompt',
  '--detectOpenHandles',
  '--start-maximized',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--font-render-hinting=none',
  '--ignore-certificate-errors',
  '--window-size=1920,1080',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--disable-software-rasterizer',
  '--disable-accelerated-2d-canvas',
  '--disable-gl-drawing-for-tests',
  '--use-gl=swiftshader'
]

async function initBrowser(namespace: string): Promise<{
  page: Page
  extensionURL: string
  serviceWorker: any
  context: BrowserContext
}> {
  // ✅ Close any previously opened context before creating a new one
  if (currentContext) {
    try {
      await currentContext.close()
    } catch (err) {
      console.warn('Failed to close previous context:', err)
    }
    currentContext = null
  }

  // 1. Launch persistent context with extension
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'chromium',
    slowMo: 10,
    ignoreHTTPSErrors: true,
    args: playwrightArgs, // make sure playwrightArgs is defined/imported
    env: process.env.DISPLAY ? { DISPLAY: process.env.DISPLAY } : undefined,
    viewport: null // explicitly set if not using default
  })

  currentContext = context

  if (!context) {
    throw new Error('Failed to create persistent browser context')
  }

  // 2. Wait for service worker to load
  let serviceWorker
  for (let i = 0; i < 50; i++) {
    serviceWorker = context
      .serviceWorkers()
      .find((sw) => sw.url().startsWith('chrome-extension://'))
    if (serviceWorker) break
    await new Promise((res) => setTimeout(res, 100))
  }

  if (!serviceWorker) {
    throw new Error('Service worker not found after waiting')
  }

  const extensionId = serviceWorker.url().split('/')[2]
  const extensionURL = `chrome-extension://${extensionId}`

  // 3. Open extension page
  const page = await context.newPage()
  page.setDefaultTimeout(120000)

  // 4. Attach console logging from service worker
  try {
    serviceWorker.on('console', (msg) => {
      console.log(`[service-worker] ${msg.text()}`)
    })
  } catch (err) {
    console.warn('Console logging for service worker not available:', err)
  }

  return { page, extensionURL, serviceWorker, context }
}

//----------------------------------------------------------------------------------------------
export async function bootstrap(namespace: string) {
  const { page, context, extensionURL, serviceWorker } = await initBrowser(namespace)
  await page.goto(`${extensionURL}${mainConstants.urls.getStarted}`)
  // Bypass the invite verification step
  await serviceWorker.evaluate(
    (invite) => chrome.storage.local.set({ invite, isE2EStorageSet: true }),
    JSON.stringify(mainConstants.inviteStorageItem)
  )
  return { page, context, extensionURL }
}

//----------------------------------------------------------------------------------------------
/**
 * Bootstraps the application with storage settings.
 *
 * @param {string} namespace - The namespace to be used.
 * @param {Object} storageParams - Parameters to configure storage.
 * @param {boolean} [shouldUnlockKeystoreManually=false] - If true, the keystore must be unlocked manually.
 *
 * @returns {Promise<void>} - A promise that resolves once the operation completes.
 */
export async function bootstrapWithStorage(
  namespace,
  storageParams,
  shouldUnlockKeystoreManually = false
) {
  // Initialize browser and page using bootstrap
  const { page, extensionURL, serviceWorker, context } = await initBrowser(namespace)

  const {
    parsedKeystoreAccounts: accounts,
    parsedNetworksWithAssetsByAccount: networksWithAssetsByAccount,
    parsedNetworksWithPositionsByAccount: networksWithPositionsByAccounts,
    parsedOnboardingState: onboardingState,
    parsedPreviousHints: previousHints,
    envSelectedAccount: selectedAccount,
    envTermState: termsState,
    invite,
    parsedKeystoreUID: keyStoreUid,
    parsedKeystoreKeys: keystoreKeys,
    parsedKeystoreSecrets: keystoreSecrets,
    parsedKeystoreSeeds: keystoreSeeds,
    ...rest
  } = storageParams

  const storageParamsMapped = {
    accounts,
    networksWithAssetsByAccount,
    networksWithPositionsByAccounts,
    onboardingState,
    previousHints,
    selectedAccount,
    termsState,
    invite,
    isE2EStorageSet: true,
    isPinned: 'true',
    isSetupComplete: 'true',
    ...(!shouldUnlockKeystoreManually && {
      keyStoreUid,
      keystoreKeys,
      keystoreSecrets
    }),
    ...rest
  }

  // Wait until chrome.storage.local becomes available
  let isReady = false
  for (let i = 0; i < 50; i++) {
    isReady = await serviceWorker.evaluate(() => {
      return typeof chrome !== 'undefined' && !!chrome.storage?.local
    })

    if (isReady) break
    await new Promise((res) => setTimeout(res, 100))
  }
  if (!isReady) {
    throw new Error('❌ chrome.storage.local was never available in service worker')
  }
  await serviceWorker.evaluate((params) => chrome.storage.local.set(params), storageParamsMapped)

  /**
   * If something goes wrong with any of the functions below, e.g., `typeSeedPhrase`,
   * this `bootstrapWithStorage` won't return the expected object (browser, recorder, etc.),
   * and the CI will hang for a long time as the recorder won't be stopped in the `afterEach` block and will continue recording.
   * This is the message we got in such a case in the CI:
   *
   * 'Jest did not exit one second after the test run has completed.
   *  This usually means that there are asynchronous operations that weren't stopped in your tests.
   *  Consider running Jest with `--detectOpenHandles` to troubleshoot this issue.'
   *
   * To prevent such long-lasting handles, we are catching the error and stopping the Jest process.
   */
  if (!shouldUnlockKeystoreManually) {
    try {
      // Navigate to a specific URL if necessary
      await page.goto(`${extensionURL}/tab.html#/`, { waitUntil: 'load' }) // removed '/keystore-unlock' because of wrong redirection to /keystore-setup

      await page.getByTestId(selectors.passphraseField).fill(KEYSTORE_PASS)
      await page.getByTestId(selectors.buttonUnlock).click()
    } catch (e) {
      console.log(e)
      process.exit(1)
    }
  }

  return { page, context, serviceWorker, extensionURL }
}
