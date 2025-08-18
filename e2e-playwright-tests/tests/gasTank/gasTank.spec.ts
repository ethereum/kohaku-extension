import { baParams } from 'constants/env'

import { expect } from '@playwright/test'

import tokens from '../../constants/tokens'
import { test } from '../../fixtures/pageObjects'

test.describe('gasTank - Basic Account', () => {
  test.beforeEach(async ({ pages }) => {
    await pages.initWithStorage(baParams)
  })

  test.afterEach(async ({ context }) => {
    await context.close()
  })

  test('top up Gas Tank with 0.05$ on Base', async ({ pages }) => {
    const sendToken = tokens.usdc.base
    let oldBalance: number

    await test.step('assert no transaction on Activity tab', async () => {
      await pages.gasTank.checkNoTransactionOnActivityTab()
    })

    await test.step('get current gas tank balance', async () => {
      oldBalance = await pages.gasTank.getCurrentBalance()
    })

    await test.step('top up gas tank', async () => {
      await pages.gasTank.topUpGasTank(sendToken, '0.05')
    })

    await test.step('assert new gas tank balance', async () => {
      const newBalance = await pages.gasTank.refreshUntilNewBalanceIsVisible(oldBalance)

      expect(oldBalance).toBeLessThan(newBalance)
    })

    await test.step('assert new transaction on Activity tab', async () => {
      await pages.gasTank.checkSendTransactionOnActivityTab()
    })
  })
})
