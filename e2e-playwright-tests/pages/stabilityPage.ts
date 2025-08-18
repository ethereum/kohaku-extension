import { bootstrapWithStorage } from 'common-helpers/bootstrap'
import BootstrapContext from 'interfaces/bootstrapContext'

import { BrowserContext } from '@playwright/test'

// import { BrowserContext, Page } from '@playwright/test'
import { baParams, KEYSTORE_PASS } from '../constants/env'
import selectors from '../constants/selectors'
import Token from '../interfaces/token'
import { categorizeRequests } from '../utils/requests'
import { BasePage } from './basePage'

export class StabilityPage extends BasePage {
  serviceWorker: any

  extensionURL: string

  constructor(opts: BootstrapContext) {
    super(opts)
    this.context = opts.context
    this.extensionURL = opts.extensionURL
    this.serviceWorker = opts.serviceWorker
  }

  collectedRequests: string[] = []

  async unlock() {
    const {
      parsedKeystoreUID: keyStoreUid,
      parsedKeystoreKeys: keystoreKeys,
      parsedKeystoreSecrets: keystoreSecrets
    } = baParams

    await this.serviceWorker.evaluate((params) => chrome.storage.local.set(params), {
      keyStoreUid,
      keystoreKeys,
      keystoreSecrets
    })

    await this.navigateToURL(`${this.extensionURL}/tab.html#/`)
    await this.entertext(selectors.passphraseField, KEYSTORE_PASS)
    await this.click(selectors.buttonUnlock)
  }

  async blockRouteAndUnlock(blockedRoute: string) {
    await this.context.route(blockedRoute, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'mocked' })
      })
    })

    await this.unlock()
  }

  getDashboardTokenSelector(token: Token) {
    return this.page.getByTestId(`token-balance-${token.address}.${token.chainId}`)
  }

  async monitorRequests() {
    await this.context.route('**/*', async (route, request) => {
      if (request.resourceType() === 'fetch' && request.method() !== 'OPTIONS') {
        this.collectedRequests.push(request.url())
      }
      await route.continue()
    })
  }

  getCategorizedRequests() {
    return categorizeRequests(this.collectedRequests)
  }
}
