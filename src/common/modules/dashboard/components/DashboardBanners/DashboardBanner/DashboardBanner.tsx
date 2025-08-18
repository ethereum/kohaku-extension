import React, { useCallback, useMemo } from 'react'
import { useModalize } from 'react-native-modalize'

import {
  Action,
  Banner as BannerType,
  BannerType as NonMarketingBannerType
} from '@ambire-common/interfaces/banner'
import BatchIcon from '@common/assets/svg/BatchIcon'
import PendingToBeConfirmedIcon from '@common/assets/svg/PendingToBeConfirmedIcon'
import SuccessIcon from '@common/assets/svg/SuccessIcon'
import Banner, { BannerButton } from '@common/components/Banner'
import useNavigation from '@common/hooks/useNavigation'
import useToast from '@common/hooks/useToast'
import DashboardBannerBottomSheet from '@common/modules/dashboard/components/DashboardBanners/DashboardBannerBottomSheet'
import { ROUTES } from '@common/modules/router/constants/common'
import useActionsControllerState from '@web/hooks/useActionsControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useRequestsControllerState from '@web/hooks/useRequestsControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'

const ERROR_ACTIONS = [
  'reject-accountOp',
  'reject-bridge',
  'dismiss-email-vault',
  'dismiss-7702-banner'
]

const DashboardBanner = ({
  banner
}: {
  banner: Omit<BannerType, 'type'> & { type: NonMarketingBannerType }
}) => {
  const { type, category, title, text, actions = [] } = banner
  const { dispatch } = useBackgroundService()
  const { addToast } = useToast()
  const { navigate } = useNavigation()
  const { visibleActionsQueue, actionsQueue } = useActionsControllerState()
  const { statuses } = useRequestsControllerState()
  const { account, portfolio } = useSelectedAccountControllerState()
  const { ref: sheetRef, close: closeBottomSheet, open: openBottomSheet } = useModalize()

  const Icon = useMemo(() => {
    if (category === 'pending-to-be-signed-acc-op') return BatchIcon
    if (category === 'pending-to-be-confirmed-acc-op') return PendingToBeConfirmedIcon
    if (category === 'successful-acc-op') return SuccessIcon

    return null
  }, [category])

  const handleActionPress = useCallback(
    (action: Action) => {
      switch (action.actionName) {
        case 'open-pending-dapp-requests': {
          if (!visibleActionsQueue) break
          const dappActions = visibleActionsQueue.filter((a) => a.type !== 'accountOp')
          dispatch({
            type: 'ACTIONS_CONTROLLER_SET_CURRENT_ACTION_BY_ID',
            params: { actionId: dappActions[0].id }
          })
          break
        }

        case 'open-accountOp':
          dispatch({
            type: 'ACTIONS_CONTROLLER_SET_CURRENT_ACTION_BY_ID',
            params: action.meta
          })
          break

        case 'reject-accountOp':
          dispatch({
            type: 'MAIN_CONTROLLER_REJECT_ACCOUNT_OP',
            params: action.meta
          })
          break

        case 'open-external-url': {
          if (type !== 'success') break

          window.open(action.meta.url, '_blank')
          break
        }

        case 'sync-keys': {
          if (type !== 'info') break
          dispatch({
            type: 'EMAIL_VAULT_CONTROLLER_REQUEST_KEYS_SYNC',
            params: { email: action.meta.email, keys: action.meta.keys }
          })
          break
        }

        case 'backup-keystore-secret':
          navigate(ROUTES.devicePasswordRecovery)
          break

        case 'view-bridge': {
          openBottomSheet()
          break
        }

        case 'open-swap-and-bridge-tab':
          navigate(ROUTES.swapAndBridge)
          break

        case 'reject-bridge':
        case 'close-bridge':
          action.meta.activeRouteIds.forEach((activeRouteId) => {
            dispatch({
              type: 'MAIN_CONTROLLER_REMOVE_ACTIVE_ROUTE',
              params: { activeRouteId }
            })
          })
          break

        case 'proceed-bridge':
          dispatch({
            type: 'REQUESTS_CONTROLLER_SWAP_AND_BRIDGE_ACTIVE_ROUTE_BUILD_NEXT_USER_REQUEST',
            params: { activeRouteId: action.meta.activeRouteId }
          })
          break

        case 'open-first-cashback-modal': {
          if (!account) break
          dispatch({
            type: 'SELECTED_ACCOUNT_CONTROLLER_UPDATE_CASHBACK_STATUS',
            params: 'cashback-modal'
          })
          break
        }

        case 'hide-activity-banner':
          dispatch({
            type: 'ACTIVITY_CONTROLLER_HIDE_BANNER',
            params: action.meta
          })
          break

        // The "Reload" handler was removed since v5.16.1, because `browser.runtime.reload()`
        // was causing some funky Chrome glitches, see the deprecation notes in
        // ExtensionUpdateController.applyUpdate() for more details.
        // case 'update-extension-version': {
        //   const shouldPrompt =
        //     actionsQueue.filter(({ type: actionType }) => actionType !== 'benzin').length > 0

        //   if (shouldPrompt) {
        //     openBottomSheet()
        //     break
        //   }

        //   dispatch({
        //     type: 'EXTENSION_UPDATE_CONTROLLER_APPLY_UPDATE'
        //   })

        //   break
        // }

        case 'reload-selected-account':
          dispatch({
            type: 'MAIN_CONTROLLER_RELOAD_SELECTED_ACCOUNT'
          })
          break

        case 'dismiss-email-vault':
          dispatch({
            type: 'EMAIL_VAULT_CONTROLLER_DISMISS_BANNER'
          })
          addToast(
            'Password recovery can be enabled anytime in Settings. We’ll remind you in a week.',
            {
              type: 'info'
            }
          )
          break

        case 'enable-networks':
          dispatch({
            type: 'MAIN_CONTROLLER_UPDATE_NETWORKS',
            params: { network: { disabled: false }, chainIds: action.meta.networkChainIds }
          })
          break

        case 'dismiss-defi-positions-banner':
          dispatch({ type: 'DISMISS_DEFI_POSITIONS_BANNER' })
          break

        default:
          break
      }
    },
    [
      dispatch,
      navigate,
      addToast,
      visibleActionsQueue,
      type,
      account,
      actionsQueue,
      openBottomSheet
    ]
  )

  const dismissAction = actions.find((action: Action) => action.label === 'Dismiss')

  const renderButtons = useMemo(
    () =>
      actions
        .filter((action: Action) => action.label !== 'Dismiss')
        .map((action: Action) => {
          const isReject =
            ERROR_ACTIONS.includes(action.actionName) ||
            ('meta' in action && 'isHideStyle' in action.meta && action.meta.isHideStyle)
          let actionText = action.label
          let isDisabled = false

          if (action.actionName === 'proceed-bridge') {
            if (statuses.buildSwapAndBridgeUserRequest !== 'INITIAL') {
              actionText = 'Preparing...'
              isDisabled = true
            }
          } else if (action.actionName === 'reload-selected-account' && !portfolio.isAllReady) {
            isDisabled = true
            actionText = 'Retrying...'
          }

          return (
            <BannerButton
              testID={`banner-button-${actionText.toLowerCase()}`}
              key={action.actionName}
              isReject={isReject}
              text={actionText}
              disabled={isDisabled}
              type={type}
              onPress={() => handleActionPress(action)}
            />
          )
        }),
    [actions, type, handleActionPress, portfolio.isAllReady, statuses.buildSwapAndBridgeUserRequest]
  )

  return (
    <>
      <Banner
        CustomIcon={Icon}
        title={title}
        type={type}
        text={text}
        renderButtons={renderButtons}
        onClosePress={dismissAction ? () => handleActionPress(dismissAction) : undefined}
      />
      <DashboardBannerBottomSheet
        id={String(banner.id)}
        sheetRef={sheetRef}
        closeBottomSheet={closeBottomSheet}
      />
    </>
  )
}

export default React.memo(DashboardBanner)
