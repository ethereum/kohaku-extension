import { BrowserContext, Page } from '@playwright/test'

interface BootstrapContext {
  page: Page
  context: BrowserContext
  serviceWorker?: any
  extensionURL?: string
}

export default BootstrapContext
