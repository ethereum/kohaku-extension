import { MainController } from '@ambire-common/controllers/main/main'
import { getDappIdFromUrl } from '@ambire-common/libs/dapps/helpers'
import { browser } from '@web/constants/browserapi'

export const handleDappAccountSwitching = (mainCtrl: MainController) => {
    console.log("Setting up dapp account switching handler")
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
    console.log("Checking for dapp account switching for tab:", tabId, "url:", url)
    try {
        const dappId = getDappIdFromUrl(url)
        if (!dappId) return

        console.log("Dapp ID identified:", dappId)

        const preferredAccount = mainCtrl.accounts.accounts.filter(
            acc => acc.associatedSessionIds?.includes(dappId)
        ).map(acc => acc.addr)
        console.log("Preferred account for dapp:", preferredAccount)

        if (
            preferredAccount &&
            preferredAccount.length === 1 &&
            preferredAccount[0] !== mainCtrl.selectedAccount?.account?.addr
        ) {
            console.log("Switching to preferred account for dapp:", preferredAccount)
            await mainCtrl.selectAccount(preferredAccount[0])
        }
    } catch (error) {
        console.error("Error handling dapp account switching:", error)
    }
}