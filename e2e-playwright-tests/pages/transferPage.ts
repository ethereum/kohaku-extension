import { baParams } from 'constants/env'
import selectors from 'constants/selectors'
import BootstrapContext from 'interfaces/bootstrapContext'
import Token from 'interfaces/token'

import { expect } from '@playwright/test'

import { BasePage } from './basePage'

export class TransferPage extends BasePage {
  extensionURL: string

  constructor(opts: BootstrapContext) {
    super(opts)
    this.extensionURL = opts.extensionURL
  }

  async navigateToTransfer() {
    await this.click(selectors.dashboard.sendButton)
  }

  async navigateToDashboard() {
    await this.navigateToURL(`${this.extensionURL}/tab.html#/`)
  }

  async openAddressBookPage() {
    await this.click(selectors.dashboard.hamburgerButton)

    // go to Address book page and assert url
    await this.page.locator('//div[contains(text(),"Address Book")]').first().click()
    await this.checkUrl('/settings/address-book')
  }

  async fillAmount(token: Token) {
    await this.page.waitForTimeout(2000) // script misses click due to modal animation sometimes
    await this.clickOnMenuToken(token)
    // Amount
    await this.page.waitForTimeout(2000) // script misses input due to modal animation sometimes
    await this.entertext(selectors.amountField, '0.001')
  }

  async fillRecipient(address: string, isUnknownAddress: boolean = true) {
    // clear input if any
    await this.clearFieldInput(selectors.addressEnsField)
    await this.entertext(selectors.addressEnsField, address)

    // if address is unknown checkbox has to be checked
    if (isUnknownAddress) {
      await this.click(selectors.recipientAddressUnknownCheckbox)
    }
  }

  async fillForm(token: Token, recipientAddress: string) {
    // Choose token
    await this.fillAmount(token)
    // Address
    await this.fillRecipient(recipientAddress)
  }

  async signAndValidate(feeToken: Token, payWithGasTank?: boolean) {
    // Proceed
    await this.expectButtonEnabled(selectors.proceedBtn)
    await this.click(selectors.proceedBtn)

    // Select Fee token and payer
    await this.clickOnMenuFeeToken(baParams.envSelectedAccount, feeToken, payWithGasTank)

    // Sign & Broadcast
    await this.expectButtonEnabled(selectors.signButton)
    await this.click(selectors.signButton)

    // Validate
    await this.compareText(selectors.txnStatus, 'Transfer done!')

    // Close page
    await this.click(selectors.closeProgressModalButton)
  }

  async addToBatch() {
    await this.click(selectors.batchBtn)
    await this.click(selectors.batchModalGotIt)
  }

  async addUnknownRecepientToAddressBook(recepientAddress: string, contactName: string) {
    await this.fillRecipient(recepientAddress)

    // open Add new contact form
    const addNewContactModal = await this.isVisible(selectors.formAddContactNameField)
    // work around; sometimes the one click does not open the modal
    if (!addNewContactModal) {
      await this.click(selectors.sendFormAddToAddresBook)
    }

    // add new contact
    await this.page.waitForTimeout(1000)
    await this.entertext(selectors.formAddContactNameField, contactName)
    await this.click(selectors.formAddToContactsButton)

    // assert snackbar notification
    await expect(this.page.locator(selectors.contactSuccessfullyAddedSnackbar)).toHaveText(
      'Contact added to Address Book'
    )
  }

  async assertAddedContact(contactName: string, contactAddress: string) {
    const addedContactName = this.page.locator(`//div[contains(text(),"${contactName}")]`)
    const addedContactAddress = this.page.locator(`//div[contains(text(),"${contactAddress}")]`)

    await expect(addedContactName).toContainText(contactName)
    await expect(addedContactAddress).toContainText(contactAddress)
  }

  // TODO: move to dashboard page once POM is refactored
  async checkNoTransactionOnActivityTab() {
    await this.click(selectors.dashboard.activityTabButton)
    await this.compareText(
      selectors.dashboard.noTransactionOnActivityTab,
      'No transactions history for Account '
    )
  }

  // TODO: move to dashboard page once POM is refactored
  async checkSendTransactionOnActivityTab() {
    await this.click(selectors.dashboard.activityTabButton)
    await expect(this.page.locator(selectors.dashboard.transactionSendText)).toContainText('Send')
    await expect(this.page.locator(selectors.dashboard.confirmedTransactionPill)).toContainText(
      'Confirmed'
    )
  }
}
