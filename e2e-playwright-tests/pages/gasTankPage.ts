import selectors from 'constants/selectors'

import { expect } from '@playwright/test'

import Token from '../interfaces/token'
import { BasePage } from './basePage'

export class GasTankPage extends BasePage {
  async getCurrentBalance() {
    const amountText = await this.page.getByTestId(selectors.dashboardGasTankBalance).innerText()
    const amountNumber = parseFloat(amountText.replace(/[^\d.]/g, ''))

    return amountNumber
  }

  async topUpGasTank(token: Token, amount: string) {
    await this.page.getByTestId(selectors.dashboardGasTankButton).click()
    await this.page.getByTestId(selectors.topUpButton).click()

    await this.clickOnMenuToken(token)

    // Switch to dollar
    await this.page.getByTestId(selectors.flipIcon).click()

    // Switching to dollars takes a few milliseconds for the controller to update,
    // and if the amount is filled at the same time, sometimes the amount is not set in the UI or in the controller.
    await this.page.waitForTimeout(1000)

    // Amount
    await this.page.waitForTimeout(1000) // script misses input due to modal animation sometimes
    const amountField = this.page.getByTestId(selectors.amountField)
    await amountField.fill(amount)

    await this.signAndValidate()
  }

  async signAndValidate() {
    // Proceed
    const proceedButton = this.page.getByTestId(selectors.proceedBtn)
    await this.expectButtonEnabled(selectors.proceedBtn)
    await proceedButton.click()

    // Sign & Broadcast
    const sign = this.page.getByTestId(selectors.signButton)
    await sign.click()

    // Validate
    const txnStatus = await this.page.getByTestId(selectors.txnStatus).textContent()
    expect(txnStatus).toEqual('Top up ready!')

    await this.page.getByTestId(selectors.closeProgressModalButton).click()
  }

  async refreshUntilNewBalanceIsVisible(balance: number) {
    let retries = 10
    const oldBalance = balance
    let newBalance = await this.getCurrentBalance()

    while (newBalance <= oldBalance && retries > 0) {
      await this.page.getByTestId(selectors.refreshButton).click()
      await this.page.waitForTimeout(5000)

      newBalance = await this.getCurrentBalance()

      retries--
    }
    return newBalance
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
    await expect(this.page.locator(selectors.dashboard.fuelGasTankTransactionPill)).toContainText(
      'Fuel gas tank with'
    )
    await expect(this.page.locator(selectors.dashboard.confirmedTransactionPill)).toContainText(
      'Confirmed'
    )
  }
}
