import { saParams } from 'constants/env'
import { test } from 'fixtures/pageObjects'

test.describe('dashboard', () => {
  test.beforeEach(async ({ pages }) => {
    await pages.initWithStorage(saParams)
  })

  test.afterEach(async ({ context }) => {
    await context.close()
  })

  test('should have balance on the dashboard', async ({ pages }) => {
    await pages.dashboard.checkBalanceInAccount()
  })

  test('should test if expected tokens are visible on the dashboard', async ({ pages }) => {
    await pages.dashboard.checkIfTokensExist()
  })

  test('should test if expected NFTs are visible on the dashboard', async ({ pages }) => {
    await pages.dashboard.checkCollectibleItem()
  })
})
