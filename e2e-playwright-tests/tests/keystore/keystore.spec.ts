import { baParams, KEYSTORE_PASS } from 'constants/env'

import { test } from '../../fixtures/pageObjects'

test.describe('keystore', () => {
  test.beforeEach(async ({ pages }) => {
    await pages.initWithStorage(baParams)
  })

  test.afterEach(async ({ context }) => {
    await context.close()
  })

  test('should lock keystore', async ({ pages }) => {
    await pages.settings.lockKeystore()
  })

  test('should unlock keystore', async ({ pages }) => {
    await pages.settings.unlockKeystore()
  })

  test('should change keystore password', async ({ pages }) => {
    const newPass = 'B1234566'

    await test.step('go to Extension pass page', async () => {
      await pages.settings.openExtensionPassword()
    })
    await test.step('change current password', async () => {
      await pages.settings.changeKeystorePassword(KEYSTORE_PASS, newPass)
    })
  })
})
