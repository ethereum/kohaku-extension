import locators from 'constants/locators'
import selectors from 'constants/selectors'

import { expect } from '@playwright/test'

import Token from '../interfaces/token'
import { BasePage } from './basePage'

export class DashboardPage extends BasePage {
  // TODO: should be refactored
  async checkBalanceInAccount(): Promise<void> {
    await this.page.waitForSelector(locators.fullAmountDashboard)
    expect(this.page.url()).toContain('/dashboard')
    const amountText = await this.page.locator(locators.fullAmountDashboard).innerText()
    const amountNumber = parseFloat(amountText.replace(/[^\d.]/g, ''))
    expect(amountNumber).toBeGreaterThan(0)
  }

  // TODO: should be refactored
  async checkIfTokensExist(): Promise<void> {
    const TOKEN_SYMBOLS = ['BTC', 'ETH', 'USDT']
    // await this.page.waitForFunction(() => window.location.href.includes('/dashboard'))
    await this.page.waitForSelector(locators.fullAmountDashboard)
    expect(this.page.url()).toContain('/dashboard')
    const innerTextOfTheWholePage = await this.page.innerText('body')
    const foundToken = TOKEN_SYMBOLS.find((token) => innerTextOfTheWholePage.includes(token))
    expect(foundToken).toBeTruthy()
  }

  // TODO: should be refactored
  async checkCollectibleItem(): Promise<void> {
    // await this.page.waitForFunction(() => window.location.href.includes('/dashboard'))
    await this.page.click(locators.tabNft)
    expect(this.page.url()).toContain('/dashboard')
    await this.page.waitForSelector(locators.collectionItem)
    const firstCollectiblesItem = await this.page.$$eval(
      locators.collectionItem,
      (elements) => elements[0]?.textContent ?? ''
    )
    await this.page.waitForSelector(locators.collectiblePicture)
    const collectiblePicture = await this.page.$(locators.collectiblePicture)
    if (collectiblePicture) {
      await collectiblePicture.click()
    } else {
      throw new Error('Collectible picture not found')
    }
    await this.page.waitForSelector(locators.collectibleRow)
    const modalText = await this.page.$eval(locators.collectibleRow, (el) => el.textContent)
    if (modalText) {
      expect(modalText).toContain(firstCollectiblesItem)
    } else {
      throw new Error('Modal text not found')
    }
  }

  async getCurrentBalance() {
    const amountText = await this.page.getByTestId(selectors.dashboardGasTankBalance).innerText()
    const amountNumber = parseFloat(amountText.replace(/[^\d.]/g, ''))

    return amountNumber
  }

  async checkTokenBalance(token: Token) {
    const key = `${token.symbol}-${token.chainId}`
    const balanceThresholds: Record<string, number> = {
      'WALLET-8453': 400,
      'USDC-8453': 5,
      'USDC-10': 5,
      'USDC.E-10': 2,
      'DAI-10': 2,
      'xWALLET-1': 2
    }

    const minBalance = balanceThresholds[key] ?? 0
    const tokenBalance = await this.getDashboardTokenBalance(token)

    let error: string | undefined

    try {
      expect(tokenBalance).toBeGreaterThanOrEqual(minBalance)
    } catch (e) {
      error = `${token.symbol} balance is only: ${tokenBalance}.`
    }
    return { token, error }
  }

  // TODO: use this method to check activity tab after POM refactor
  async checkNoTransactionOnActivityTab() {
    await this.click(selectors.dashboard.activityTabButton)
    await this.compareText(
      selectors.dashboard.noTransactionOnActivityTab,
      'No transactions history for Account '
    )
  }

  // TODO: use this method to check activity tab after POM refactor
  async checkSendTransactionOnActivityTab() {
    await this.click(selectors.dashboard.activityTabButton)
    await expect(this.page.locator(selectors.dashboard.transactionSendText)).toContainText('Send')
    await expect(this.page.locator(selectors.dashboard.confirmedTransactionPill)).toContainText(
      'Confirmed'
    )
  }
}
