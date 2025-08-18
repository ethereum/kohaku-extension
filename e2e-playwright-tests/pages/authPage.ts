import { BA_PRIVATE_KEY, KEYSTORE_PASS } from 'constants/env'
import locators from 'constants/locators'
import selectors from 'constants/selectors'
import BootstrapContext from 'interfaces/bootstrapContext'

import mainConstants from '../constants/mainConstants'
import { BasePage } from './basePage'

export class AuthPage extends BasePage {
  extensionURL: string

  constructor(opts: BootstrapContext) {
    super(opts)
    this.extensionURL = opts.extensionURL
  }

  async goToDashboard() {
    await this.page.goto(`${this.extensionURL}${mainConstants.urls.dashboard}`)
  }

  async setExtensionPassword(): Promise<void> {
    await this.page.getByTestId(selectors.enterPassField).fill(KEYSTORE_PASS)
    await this.page.getByTestId(selectors.repeatPassField).fill(KEYSTORE_PASS)
    await this.page.getByTestId(selectors.createKeystorePassBtn).click()
  }

  async importViewOnlyAccount(account): Promise<void> {
    await this.page.locator(locators.watchAnAddress).click()
    await this.page.locator(locators.viewOnlyInputAddressField).pressSequentially(account)
    await this.page.locator(locators.importViewOnlyButton).click()
    await this.setExtensionPassword()
    await this.page.locator(locators.confirmationMessageForViewOnly).isVisible()
    await this.page.locator(locators.completeButton).click()
    await this.page.locator(locators.confirmationMessageAmbireWallet).isVisible()
    await this.page.locator(locators.openDashboardButton).click()
  }

  async verifyRecoveryPhraseScreen(): Promise<void> {
    const locator = this.page.getByTestId('info-0').locator('div').nth(3)
    if (
      await this.page
        .getByText('Page was restarted because')
        .isVisible()
        .catch(() => false)
    ) {
      await locator.waitFor({ state: 'visible' })
      await locator.click()
    }
    await this.page.locator(locators.recoveryPhraseHeader).isVisible()
    await this.page.locator(locators.copyRecoveryPhraseButton).click()
    await this.page.getByText('Recovery phrase copied to').isVisible()
    await this.page.getByText('Recovery phrase copied to').waitFor({ state: 'detached' })
    await this.page.locator(locators.savedPhraseButton).click()
  }

  async createNewAccount(): Promise<void> {
    await this.page.locator(locators.createNewAccountButton).click()
    for (let index = 0; index < 3; index++) {
      // eslint-disable-next-line no-await-in-loop
      await this.page.locator(`div[data-testid="checkbox"] >> nth = ${index}`).click()
    }
    await this.page.locator(locators.createRecoveryPhraseButton).click()
    await this.verifyRecoveryPhraseScreen()
    await this.setExtensionPassword()
    await this.page.locator(locators.confirmationMessageForViewOnly).isVisible()
    await this.page.locator(locators.addMoreAccountsButton).isVisible()
    await this.page.locator(locators.completeButton).click()
    await this.page.locator(locators.confirmationMessageAmbireWallet).isVisible()
    await this.page.locator(locators.openDashboardButton).click()
  }

  async importExistingAccount(): Promise<void> {
    await this.page.locator(locators.importExistingAccountButton).click()
    await this.page.locator(locators.importFromPrivateKeyButton).click()
    await this.typeTextInInputField(locators.inputPrivateKey, BA_PRIVATE_KEY)
    await this.page.locator(locators.warningCheckbox).click()
    await this.page.locator(locators.importConfirmButton).click()
    await this.setExtensionPassword()
    await this.page.locator(locators.confirmationMessageForViewOnly).isVisible()
    await this.page.locator(locators.addMoreAccountsButton).isVisible()
    await this.page.locator(locators.completeButton).click()
    await this.page.locator(locators.confirmationMessageAmbireWallet).isVisible()
    await this.page.locator(locators.openDashboardButton).click()
  }

  async importExistingAccountByRecoveryPhrase(passphrase: string): Promise<void> {
    await this.page.locator(locators.importExistingAccountButton).click()
    await this.page.locator(locators.importFromRecoveryPhraseButton).click()
    await this.typeTextInInputField(locators.inputSeetField, passphrase)
    await this.page.locator(locators.recoveryPhraseAdvancedModeToggle).isVisible()
    await this.page.locator(locators.recoveryPhraseAdvancedModeToggle).click()
    await this.typeTextInInputField(locators.inputPassphrase, passphrase)
    await this.page.locator(locators.importConfirmButton).click()
    await this.setExtensionPassword()
    await this.personalizeAccountName()
    await this.page.locator(locators.addMoreAccountsButton).isVisible()
    await this.page.locator(locators.completeButton).click()
    await this.page.locator(locators.confirmationMessageAmbireWallet).isVisible()
    await this.page.locator(locators.openDashboardButton).click()
  }

  async personalizeAccountName(): Promise<void> {
    await this.page.locator(locators.editAccountButton).click()
    // TODO: Parametrization
    await this.typeTextInInputField(locators.editAccountNameField, 'Name 1')
    await this.page.locator(locators.saveMessageText).isVisible()
  }

  async importCoupleOfViewOnlyAccount(account1: string, account2: string): Promise<void> {
    await this.page.locator(locators.watchAnAddress).click()
    await this.page.locator(locators.viewOnlyInputAddressField).pressSequentially(account1)
    await this.page.locator(locators.addMoreAdressesButton).click()
    await this.page.locator(locators.viewOnlySecondInputAddressField).pressSequentially(account2)
    await this.page.locator(locators.importViewOnlyButton).click()
    await this.setExtensionPassword()
    await this.page.locator(locators.confirmationMessageForViewOnly).isVisible()
    await this.personalizeAccountName()
    await this.page.locator(locators.completeButton).click()
    await this.page.locator(locators.confirmationMessageAmbireWallet).isVisible()
    await this.page.locator(locators.openDashboardButton).click()
  }

  async createNewHotWalletAndPersonalizeName(): Promise<void> {
    await this.page.locator(locators.createNewAccountButton).click()
    for (let index = 0; index < 3; index++) {
      // eslint-disable-next-line no-await-in-loop
      await this.page.locator(`div[data-testid="checkbox"] >> nth = ${index}`).click()
    }
    await this.page.locator(locators.createRecoveryPhraseButton).click()
    await this.verifyRecoveryPhraseScreen()
    await this.setExtensionPassword()
    await this.page.locator(locators.addMoreAccountsButton).click()
    await this.page.locator(locators.smartAccountPicker).click()
    await this.page.locator(locators.importAccountButton).click()
    await this.page.locator(locators.confirmationMessageForViewOnly).isVisible()
    await this.personalizeAccountName()
    await this.page.locator(locators.addMoreAccountsButton).isVisible()
    await this.page.locator(locators.completeButton).click()
    await this.page.locator(locators.confirmationMessageAmbireWallet).isVisible()
    await this.page.locator(locators.openDashboardButton).click()
  }

  async selectHDPath(path: string): Promise<void> {
    await this.page.locator(locators.changeHDPathButton).click()
    await this.page.locator(path).click()
    await this.page.locator(locators.hdPathConfirmButton).click()
  }

  async createAccountAndImportFromDifferentHDPath(): Promise<void> {
    await this.page.locator(locators.createNewAccountButton).click()
    for (let index = 0; index < 3; index++) {
      // eslint-disable-next-line no-await-in-loop
      await this.page.locator(`div[data-testid="checkbox"] >> nth = ${index}`).click()
    }
    await this.page.locator(locators.createRecoveryPhraseButton).click()
    await this.verifyRecoveryPhraseScreen()
    await this.setExtensionPassword()
    await this.page.locator(locators.addMoreAccountsButton).click()
    await this.selectHDPath(locators.hdPathLegerLive)
    await this.page.locator(locators.smartAccountPicker).click()
    await this.page.locator(locators.importAccountButton).click()
    await this.page.locator(locators.confirmationMessageForViewOnly).isVisible()
    await this.page.locator(locators.addMoreAccountsButton).click()
    await this.selectHDPath(locators.hdPathLegerLive)
    await this.page.locator(locators.smartAccountPickerForHDPath).click()
    await this.page.locator(locators.importAccountButton).click()
    await this.page.locator(locators.addMoreAccountsButton).isVisible()
    await this.page.locator(locators.completeButton).click()
    await this.page.locator(locators.confirmationMessageAmbireWallet).isVisible()
    await this.page.locator(locators.openDashboardButton).click()
  }

  async importAccountFromJSONFile(): Promise<void> {
    const saAccounts = JSON.parse(process.env.SA_ACCOUNT_JSON || '{}')
    const jsonBuffer = Buffer.from(JSON.stringify(saAccounts))
    await this.page.locator(locators.importExistingAccountButton).click()
    await this.page.locator(locators.showMoreButton).click()
    await this.page.locator(locators.importJSONBackupFileButton).click()
    const fileInput = this.page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'sa.json',
      mimeType: 'application/json',
      buffer: jsonBuffer
    })
    await this.setExtensionPassword()
    await this.page.locator(locators.completeButton).click()
    await this.page.locator(locators.confirmationMessageAmbireWallet).isVisible()
    await this.page.locator(locators.openDashboardButton).click()
  }
}
