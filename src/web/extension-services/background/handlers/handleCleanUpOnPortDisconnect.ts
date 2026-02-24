import { MainController } from '@ambire-common/controllers/main/main'
import { ONBOARDING_WEB_ROUTES } from '@common/modules/router/constants/common'
import { IS_FIREFOX } from '@web/constants/common'
import { Port } from '@web/extension-services/messengers'
import { SigningStatus } from '@ambire-common/controllers/signAccountOp/signAccountOp'

export const handleCleanUpOnPortDisconnect = async ({
  port,
  mainCtrl
}: {
  port: Port
  mainCtrl: MainController
}) => {
  if (!port.sender || !port.sender?.url) return

  const url = new URL(port.sender.url)

  if (port.sender.url?.includes('sessionId')) {
    const sessionId = url.searchParams.get('sessionId')!

    if (url.pathname.includes('swap-and-bridge')) {
      if (port.name === 'action-window') {
        mainCtrl.onOneClickSwapClose()
      } else {
        mainCtrl.swapAndBridge.unloadScreen(sessionId)
      }
    }

    if (url.pathname.includes('dashboard')) {
      mainCtrl.defiPositions.removeSession(sessionId)
    }

    if (url.pathname.includes('dashboard') || url.pathname.includes('transactions')) {
      mainCtrl.activity.resetAccountsOpsFilters(sessionId)
    }

    if (url.pathname.includes('signed-messages')) {
      mainCtrl.activity.resetSignedMessagesFilters(sessionId)
    }
  }

  if (url.pathname.includes('sign-account-op')) {
    mainCtrl.destroySignAccOp()
  }

  if (url.pathname.includes('sign-message')) {
    mainCtrl.signMessage.reset()
  }

  if (url.pathname.includes('privacy-pools')) {
    mainCtrl.privacyPools.unloadScreen()
  }

  if (url.pathname.includes('transfer') || url.pathname.includes('top-up-gas-tank')) {
    // Always unload the screen when the action window is closed
    const isActionWindow = port.name === 'action-window'

    if (isActionWindow) {
      mainCtrl.onOneClickTransferClose()
    } else {
      mainCtrl.transfer.unloadScreen()
    }

    // If the Transfer popup is closed during signing or broadcasting,
    // we don't want to show the tracking screen the next time the Transfer popup/screen is opened.
    // The tracking screen is shown based on the value of `transferController.latestAccountOp`,
    // which is set asynchronously when `mainCtrl.#broadcastSignedAccountOp` completes.
    // Therefore, if the popup is intentionally closed during signing or broadcasting, we don't want to enable tracking later,
    // and we need to prevent updating the `transferController.latestAccountOp` value.
    // That's why we introduced `shouldTrackLatestBroadcastedAccountOp` flag.
    //
    // Trezor Note: For Trezor, we always enable tracking and do not reset the form, because with the Trezor signer,
    // the Transfer popup is closed and all logic is handled in a new action window.
    // In that window, we have dedicated logic for clearing the form completely (e.g., if (isActionWindow) mainCtrl.onOneClickTransferClose()).
    // If we reset the form state here while opening the Trezor action window, the form will be re-initialized
    // and the current `signAccountOp` will be destroyed, which will break the Trezor signing process.
    //
    // Lattice Note: We bypass this logic for Lattice and always enable tracking, because Lattice may call
    // `LatticeController._getCreds` to retrieve credentials, which briefly opens a new window and causes the popup to close.
    // Since we can't distinguish between a `getCreds` call and a user intentionally closing the popup after signing,
    // we always enable tracking. This means that if the popup is closed immediately after signing with Lattice,
    // the next time you open the Transfer screen, you may see the transaction tracking screen.
    const shouldTrack =
      mainCtrl.transfer.signAccountOpController?.status?.type === SigningStatus.ReadyToSign ||
      mainCtrl.transfer.signAccountOpController?.accountOp?.signingKeyType === 'trezor' ||
      mainCtrl.transfer.signAccountOpController?.accountOp?.signingKeyType === 'lattice'
    // eslint-disable-next-line no-param-reassign
    mainCtrl.transfer.shouldTrackLatestBroadcastedAccountOp = shouldTrack

    // We reset the form state without destroying the signAccountOp,
    // since it's still needed for broadcasting. Once broadcasting completes, we destroy the signAccountOp.
    if (!shouldTrack) {
      mainCtrl.transfer.resetForm(false)
    }

    mainCtrl.activity.resetAccountsOpsFilters('transfer')
  }

  const isOnboardingRoute = ONBOARDING_WEB_ROUTES.some(
    (r) => url.pathname.includes(r) && port.name === 'tab'
  )

  // The logic below ensures that if the onboarding flow was forcefully closed,
  // the AccountsPersonalize screen will not be shown the next time the extension is opened.
  if (isOnboardingRoute) {
    // handles the case when the accountPicker is initialized
    if (mainCtrl.accountPicker.isInitialized) {
      await mainCtrl.accountPicker.reset()
    }

    // handles the case when the accountPicker is not initialized e.g. "import JSON" or "view-only" flows
    if (mainCtrl.accounts.accounts.filter((a) => a.newlyAdded).length) {
      await mainCtrl.accounts.resetAccountsNewlyAddedState()
    }
  }

  // In Firefox, we don't close the action window directly to avoid a bug where closing it also closes the extension popup.
  // Instead, we turn it into a blank, unfocused page. Later, when the popup gets disconnected, we clean up any such leftover blank pages.
  // The rest of the logic is in the remove func in window.ts
  if (IS_FIREFOX && port.name === 'popup') {
    const windows = await chrome.windows.getAll()
    const popupWindows = windows.filter((w) => w.type === 'popup')

    // eslint-disable-next-line no-restricted-syntax
    for (const w of popupWindows) {
      if (w && w.id) {
        // eslint-disable-next-line no-await-in-loop
        const tabs = await chrome.tabs.query({ windowId: w.id })
        if (tabs[0].url === 'about:blank' && tabs[0].status !== 'loading') {
          // eslint-disable-next-line no-await-in-loop
          await chrome.windows.remove(w.id)
        }
      }
    }
  }
}
