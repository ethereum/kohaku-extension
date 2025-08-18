import { saParams } from 'constants/env'

import { test } from '../../fixtures/pageObjects'

test.describe('network management', () => {
  test.beforeEach(async ({ pages }) => {
    await pages.initWithStorage(saParams)
  })

  test.afterEach(async ({ context }) => {
    await context.close()
  })

  test('adding network manually', async ({ pages }) => {
    await pages.settings.addNetworkManually('FLR')
  })

  test('add, edit and disable network from Chainlist', async ({ pages }) => {
    await pages.settings.addNetworkFromChainlist('FLOW')
    await pages.settings.editNetwork('FLOW')
    await pages.settings.disableNetwork()
  })
})
