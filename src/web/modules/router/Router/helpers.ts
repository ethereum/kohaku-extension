import { ActionsController } from '@ambire-common/controllers/actions/actions'
import { KeystoreController } from '@ambire-common/controllers/keystore/keystore'
import { SwapAndBridgeController } from '@ambire-common/controllers/swapAndBridge/swapAndBridge'
import { TransferController } from '@ambire-common/controllers/transfer/transfer'
import { getBenzinUrlParams } from '@ambire-common/utils/benzin'
import { AUTH_STATUS } from '@common/modules/auth/constants/authStatus'
import { ROUTES } from '@common/modules/router/constants/common'
import { getUiType } from '@web/utils/uiType'

const { isActionWindow } = getUiType()

const getInitialRoute = ({
  keystoreState,
  authStatus,
  actionsState,
  swapAndBridgeState,
  transferState
}: {
  keystoreState: KeystoreController
  authStatus: AUTH_STATUS
  actionsState: ActionsController
  swapAndBridgeState: SwapAndBridgeController
  transferState: TransferController
}) => {
  if (keystoreState.isReadyToStoreKeys && !keystoreState.isUnlocked) {
    return ROUTES.keyStoreUnlock
  }

  if (authStatus === AUTH_STATUS.NOT_AUTHENTICATED) {
    return ROUTES.getStarted
  }

  if (isActionWindow && actionsState.currentAction) {
    const actionType = actionsState.currentAction.type
    if (actionType === 'dappRequest') {
      const action = actionsState.currentAction

      if (action.userRequest.action.kind === 'dappConnect') {
        return ROUTES.dappConnectRequest
      }
      if (action.userRequest.action.kind === 'walletAddEthereumChain') {
        return ROUTES.addChain
      }
      if (action.userRequest.action.kind === 'walletWatchAsset') {
        return ROUTES.watchAsset
      }
      if (action.userRequest.action.kind === 'ethGetEncryptionPublicKey') {
        return ROUTES.getEncryptionPublicKeyRequest
      }
    }
    if (actionType === 'accountOp') return ROUTES.signAccountOp

    if (actionType === 'signMessage') return ROUTES.signMessage

    if (actionType === 'swapAndBridge') return ROUTES.swapAndBridge

    // TODO: This navigation occurs when signing with Trezor.
    // Currently, Gas Top-Ups are not supported by Trezor.
    // Once support is added, we need to introduce a new actionType specifically for Top-Up.
    if (actionType === 'transfer') return ROUTES.transfer

    if (actionType === 'benzin') {
      const benzinAction = actionsState.currentAction
      const link =
        ROUTES.benzin +
        getBenzinUrlParams({
          chainId: benzinAction.userRequest.meta?.chainId,
          isInternal: true,
          txnId: benzinAction.userRequest.meta?.txnId, // can be undefined
          identifiedBy: benzinAction.userRequest.meta?.identifiedBy
        })
      return link
    }

    if (actionType === 'switchAccount') return ROUTES.switchAccount
  } else if (!isActionWindow) {
    // TODO: Always redirects to Dashboard, which for initial extension load is okay, but
    // for other scenarios, ideally, it should be the last route before the keystore got locked.
    const hasSwapAndBridgePersistentSession = swapAndBridgeState.sessionIds.some(
      (id) => id === 'popup' || id === 'action-window'
    )

    if (hasSwapAndBridgePersistentSession) {
      return ROUTES.swapAndBridge
    }
    if (transferState?.hasPersistedState) {
      if (transferState.isTopUp) {
        return ROUTES.topUpGasTank
      }
      return ROUTES.transfer
    }
    return ROUTES.mainDashboard
  }

  return null
}

export { getInitialRoute }
