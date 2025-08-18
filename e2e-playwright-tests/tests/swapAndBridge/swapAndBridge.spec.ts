import { saParams } from 'constants/env'
import tokens from 'constants/tokens'
import { test } from 'fixtures/pageObjects'

import { expect } from '@playwright/test' // your extended test with authPage

test.describe('swapAndBridge Smart Account', () => {
  test.beforeEach(async ({ pages }) => {
    await pages.initWithStorage(saParams)
  })

  test.afterEach(async ({ context }) => {
    await context.close()
  })
  test('should accept amount starting with zeros like "00.01" with during Swap & Bridge with a Smart Account', async ({
    pages
  }) => {
    const fromToken = tokens.dai.optimism
    const toToken = tokens.usdce.optimism
    await pages.swapAndBridge.prepareSwapAndBridge(0.1, fromToken, toToken)
    await pages.swapAndBridge.enterNumber('00.01', true)
  })

  test('should accept amount starting with point like ".01" during Swap & Bridge with a Smart Account', async ({
    pages
  }) => {
    const fromToken = tokens.dai.optimism
    const toToken = tokens.usdce.optimism

    await pages.swapAndBridge.prepareSwapAndBridge(0.1, fromToken, toToken)
    await pages.swapAndBridge.enterNumber('.01', true)
  })

  test('should not accept chars as amount during Swap & Bridge with a Smart Account', async ({
    pages
  }) => {
    const fromToken = tokens.dai.optimism
    const toToken = tokens.usdce.optimism

    await pages.swapAndBridge.prepareSwapAndBridge(0.1, fromToken, toToken)
    await pages.swapAndBridge.enterNumber('abc', true)
  })

  test('should switch tokens during Swap & Bridge with a Smart Account', async ({ pages }) => {
    const fromToken = tokens.usdc.base
    const toToken = tokens.wallet.base

    await pages.swapAndBridge.openSwapAndBridge()
    await pages.swapAndBridge.prepareSwapAndBridge(null, fromToken, toToken)
    await pages.swapAndBridge.switchTokensOnSwapAndBridge()
  })

  test('should do MAX token "From" amount during Swap & Bridge with a Smart Account', async ({
    pages
  }) => {
    const dai = tokens.dai.optimism
    const usdc = tokens.usdc.base

    await pages.swapAndBridge.verifySendMaxTokenAmount(dai)
    await pages.swapAndBridge.verifySendMaxTokenAmount(usdc)
  })

  test('should find token that already exists within the "Receive" list during Swap & Bridge with a Smart Account', async ({
    pages
  }) => {
    const usdc = tokens.usdc.base
    const wallet = tokens.wallet.base
    const eth = tokens.eth.base

    await pages.swapAndBridge.verifyDefaultReceiveToken(usdc, wallet)
    await pages.swapAndBridge.verifyDefaultReceiveToken(eth, wallet)
  })

  test('should import a token by address that is NOT in the default "Receive" list during Swap & Bridge with a Smart Account', async ({
    pages
  }) => {
    const eth = tokens.eth.ethereum
    const wcres = tokens.wcres.ethereum
    await pages.swapAndBridge.verifyNonDefaultReceiveToken(eth, wcres)
  })

  test('should "reject" (ie cancel) Swap & Bridge from the Pending Route component with a Smart Account', async ({
    pages
  }) => {
    const usdc = tokens.usdc.base
    const wallet = tokens.wallet.base
    await pages.swapAndBridge.openSwapAndBridge()
    await pages.swapAndBridge.prepareSwapAndBridge(0.8, usdc, wallet)
    await pages.swapAndBridge.rejectTransaction()
  })

  test('should "proceed" Swap & Bridge from the Pending Route component with a Smart Account', async ({
    pages
  }) => {
    const usdc = tokens.usdc.base
    const wallet = tokens.wallet.base

    await test.step('assert no transaction on Activity tab', async () => {
      await pages.swapAndBridge.checkNoTransactionOnActivityTab()
    })

    await test.step('prepare swap and bridge transaction', async () => {
      await pages.swapAndBridge.openSwapAndBridge()
      await pages.swapAndBridge.prepareSwapAndBridge(0.005, usdc, wallet)
    })

    await test.step('proceed and sign the transaction', async () => {
      await pages.swapAndBridge.proceedTransaction()
    })

    await test.step('assert new transaction on Activity tab', async () => {
      await pages.swapAndBridge.checkSendTransactionOnActivityTab()
    })
  })

  test('should switch from token amount to USD value and vise-versa during Swap & Bridge with a Smart Account', async ({
    pages
  }) => {
    const usdce = tokens.usdce.optimism
    const dai = tokens.dai.optimism
    const usdc = tokens.usdc.base
    const xwallet = tokens.xwallet.ethereum

    await pages.swapAndBridge.switchUSDValueOnSwapAndBridge(usdce, 0.34)
    await pages.swapAndBridge.switchUSDValueOnSwapAndBridge(dai, 0.2)
    await pages.swapAndBridge.switchUSDValueOnSwapAndBridge(usdc, 0.02)
    await pages.swapAndBridge.switchUSDValueOnSwapAndBridge(xwallet, 1)
    await pages.swapAndBridge.switchUSDValueOnSwapAndBridge(dai, 0.51)
    await pages.swapAndBridge.switchUSDValueOnSwapAndBridge(xwallet, 0.9)
  })

  test('should auto-refresh active route after 60s during Swap & Bridge with a Smart Account', async ({
    pages
  }) => {
    const usdc = tokens.usdc.base
    const wallet = tokens.wallet.base

    await pages.swapAndBridge.prepareSwapAndBridge(0.009, usdc, wallet)
    await pages.swapAndBridge.verifyAutoRefreshRoute()
  })

  test('should select a different route when Swap & Bridge with a Smart Account', async ({
    pages
  }) => {
    const usdc = tokens.usdc.base
    const wallet = tokens.wallet.base

    await pages.swapAndBridge.prepareSwapAndBridge(0.009, usdc, wallet)
    await pages.swapAndBridge.clickOnSecondRoute()
  })

  test('should Bridge tokens with a Smart Account', async ({ pages }) => {
    const usdc = tokens.usdc.base
    const usdcOpt = tokens.usdc.optimism

    await test.step('assert no transaction on Activity tab', async () => {
      await pages.swapAndBridge.checkNoTransactionOnActivityTab()
    })

    await test.step('prepare bridge transaction', async () => {
      await pages.swapAndBridge.prepareBridgeTransaction(0.0063, usdc, usdcOpt)
    })

    await test.step('sign transaction', async () => {
      await pages.swapAndBridge.signTokens()
    })

    await test.step('assert new transaction on Activity tab', async () => {
      await pages.swapAndBridge.checkSendTransactionOnActivityTab()
    })
  })

  test('should batch Swap of ERC20 tokens and Native to ERC20 token with a Smart Account', async ({
    pages
  }) => {
    const usdc = tokens.usdc.base
    const wallet = tokens.wallet.base

    await test.step('start monitoring requests', async () => {
      await pages.swapAndBridge.monitorRequests()
    })

    await test.step('add a transaction swapping WALLET for USDC to the batch', async () => {
      await pages.swapAndBridge.prepareSwapAndBridge(0.003, wallet, usdc)
      await pages.swapAndBridge.batchAction()
    })

    await test.step('add a transaction swapping USDC for WALLET to the existing batch and sign', async () => {
      await pages.swapAndBridge.prepareSwapAndBridge(0.002, usdc, wallet)
      await pages.swapAndBridge.batchActionWithSign()
    })

    await test.step('stop monitoring requests and expect no uncategorized requests to be made', async () => {
      const { uncategorized } = pages.swapAndBridge.getCategorizedRequests()
      expect(uncategorized.length).toBeLessThanOrEqual(0)
    })
  })
})
