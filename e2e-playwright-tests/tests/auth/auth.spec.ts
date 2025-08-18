import { BA_PASSPHRASE, KEYSTORE_PASS, SA_PASSPHRASE } from 'constants/env'
import mainConstants from 'constants/mainConstants'
import selectors from 'constants/selectors'
import { test } from 'fixtures/pageObjects' // your extended test with auth

import { expect } from '@playwright/test'

import { emulatorOptions } from '../../constants/trezor'
import { getController, initTrezorConnect, setup } from '../../utils/trezorEmulator'

test.describe('auth', () => {
  test.beforeEach(async ({ pages }) => {
    await pages.initWithoutStorage()
  })

  test.afterEach(async ({ context }) => {
    await context.close()
  })

  test('should import view-only Basic account', async ({ pages }) => {
    await pages.auth.importViewOnlyAccount(mainConstants.addresses.basicAccount)
  })

  test('should import view-only Smart account', async ({ pages }) => {
    await pages.auth.importViewOnlyAccount(mainConstants.addresses.smartAccount)
  })

  test('create new basic account', async ({ pages }) => {
    await pages.auth.createNewAccount()
  })

  test('import basic account from private key', async ({ pages }) => {
    await pages.auth.importExistingAccount()
  })

  test('import one Basic Account from a 12 words seed phrase and personalize them', async ({
    pages
  }) => {
    await pages.auth.importExistingAccountByRecoveryPhrase(BA_PASSPHRASE)
  })

  test('import one Smart Account from a 12 words seed phrase and personalize them', async ({
    pages
  }) => {
    await pages.auth.importExistingAccountByRecoveryPhrase(SA_PASSPHRASE)
  })

  test('import a couple of view-only accounts (at once) and personalize some of them', async ({
    pages
  }) => {
    await pages.auth.importCoupleOfViewOnlyAccount(
      mainConstants.addresses.basicAccount,
      mainConstants.addresses.smartAccount
    )
  })

  test('create a new hot wallet (Smart Account) by setting up a default seed phrase first, and afterward create a couple of more hot wallets (Smart Accounts) out of the stored seed phrase and personalize some of them', async ({
    pages
  }) => {
    await pages.auth.createNewHotWalletAndPersonalizeName()
  })

  test('import account from different HD paths', async ({ pages }) => {
    await pages.auth.createAccountAndImportFromDifferentHDPath()
  })

  test('import account from JSON file', async ({ pages }) => {
    await pages.auth.importAccountFromJSONFile()
  })
})

test.describe('trezor', () => {
  const controller = getController()

  test.beforeAll(async () => {
    await setup(controller, emulatorOptions)
    await initTrezorConnect(controller)
  })

  test.beforeEach(async ({ pages }) => {
    await pages.initWithoutStorage()
  })

  test.afterEach(async ({ context }) => {
    await context.close()
  })

  test.afterAll(async () => {
    // Cleanup emulator and dispose of resources
    try {
      // Skip cleanup if WS is disconnected
      if (!controller.ws || controller.ws.readyState !== WebSocket.OPEN) {
        console.warn('TrezorUserEnvLink WS already disconnected. Skipping cleanup.')
        return
      }

      await controller.api.wipeEmu()
      await controller.api.stopBridge()
      await controller.api.stopEmu()
      controller.dispose()
    } catch (error) {
      console.error('Error during cleanup:', error)
    }
  })

  test('should successfully authenticate using Trezor and import existing accounts', async ({
    pages
  }) => {
    const page = pages.auth.page

    await test.step('start importing existing Trezor accounts in our Onboarding flow', async () => {
      await page.getByTestId(selectors.importExistingAccBtn).click()
      await page.getByTestId(selectors.importMethodTrezor).click()

      await page.getByTestId(selectors.enterPassField).fill(KEYSTORE_PASS)
      await page.getByTestId(selectors.repeatPassField).fill(KEYSTORE_PASS)
    })

    await test.step('allow importing accounts from Trezor Connect', async () => {
      const trezorPage = await pages.auth.handleNewPage(
        page.getByTestId(selectors.createKeystorePassBtn)
      )

      await trezorPage.content()

      // When the test is run in Chromium (in CI),
      // the Trezor page shows a "browser not supported" warning, which we need to explicitly confirm.
      // When running in headed mode (--ui or --debug flags enabled in Playwright),
      // this dialog doesn't appear, so we conditionally click it.
      const locator = trezorPage.getByRole('button', { name: /I acknowledge and wish to/i })
      await page.waitForTimeout(5000)
      if (await locator.isVisible()) {
        await locator.click()
      }

      // Confirm Trezor Terms dialog
      await trezorPage.getByTestId(selectors.trezorConnectConfirmTerms).click()

      await trezorPage.locator('button.list .wrapper .device-name').click()
      await trezorPage.getByRole('button', { name: 'Allow once for this session' }).click()
      await trezorPage.getByRole('button', { name: 'Export' }).click()
    })

    await test.step('import first 2 accounts', async () => {
      await page.getByTestId(`add-account-${mainConstants.addresses.trezorAccount1}`).click()
      await page.getByTestId(`add-account-${mainConstants.addresses.trezorAccount2}`).click()

      await page.getByTestId(selectors.buttonImportAccount).click()
      await page.getByTestId(selectors.saveAndContinueBtn).click()
    })

    await test.step('make sure accounts are imported', async () => {
      await pages.auth.goToDashboard()

      await page.getByTestId(selectors.accountSelectBtn).click()

      await expect(page.getByText(mainConstants.addresses.trezorAccount1)).toBeVisible()
      await expect(page.getByText(mainConstants.addresses.trezorAccount2)).toBeVisible()
    })
  })
})
