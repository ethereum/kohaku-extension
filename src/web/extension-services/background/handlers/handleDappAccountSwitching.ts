import { MainController } from '@ambire-common/controllers/main/main'
import { getDappIdFromUrl } from '@ambire-common/libs/dapps/helpers'
import { browser } from '@web/constants/browserapi'

export const handleDappAccountSwitching = (mainCtrl: MainController) => {
    browser.tabs.onActivated.addListener(async ({ tabId }: chrome.tabs.TabActiveInfo) => {
        const tab = await browser.tabs.get(tabId)
        if (!tab.url) return

        await changeActiveAccount(mainCtrl, tabId, tab.url)
    })

    browser.windows.onFocusChanged.addListener(async (windowId: number) => {
        if (windowId === chrome.windows.WINDOW_ID_NONE) return

        const tabs = await browser.tabs.query({ active: true, windowId })
        if (tabs.length === 0) return

        const tab = tabs[0]
        if (!tab.id) return
        if (!tab.url) return

        await changeActiveAccount(mainCtrl, tab.id, tab.url)
    })
}

async function changeActiveAccount(mainCtrl: MainController, tabId: number, url: string) {
    try {
        const dappId = getDappIdFromUrl(url)
        if (!dappId) return

        const dapp = mainCtrl.dapps.getDapp(dappId)
        if (!dapp) return

        const account = dapp.account
        if (!account) return

        await mainCtrl.selectAccount(account)
    } catch (error) {
        console.error("Error handling dapp account switching:", error)
    }
}