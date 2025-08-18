import { StabilityPage } from 'pages/stabilityPage'

import { test as base } from '@playwright/test'

import { PageManager } from '../pages/utils/page_instances'

type PageFixtures = {
  pages: PageManager
  stabilityPage: StabilityPage
}

export const test = base.extend<PageFixtures>({
  pages: async ({}, use) => {
    const pageManager = new PageManager()

    await use(pageManager)
  }
})
