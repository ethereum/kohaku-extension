import React, { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useModalize } from 'react-native-modalize'

import PendingActionWindowIcon from '@common/assets/svg/PendingActionWindowIcon'
import BottomSheet from '@common/components/BottomSheet'
import DualChoiceModal from '@common/components/DualChoiceModal'
import spacings from '@common/styles/spacings'
import useActionsControllerState from '@web/hooks/useActionsControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import { getUiType } from '@web/utils/uiType'

const isPopup = getUiType().isPopup

const PendingActionWindowModal = () => {
  const { ref: sheetRef, close: closeBottomSheet } = useModalize()
  const { t } = useTranslation()
  const { dispatch } = useBackgroundService()
  const { actionWindow, currentAction } = useActionsControllerState()
  const onPrimaryButtonPress = useCallback(() => {
    dispatch({ type: 'ACTIONS_CONTROLLER_FOCUS_ACTION_WINDOW' })
  }, [dispatch])

  const title = useMemo(() => {
    if (!currentAction) return null

    if (currentAction.type === 'accountOp') return t('Finish your pending transaction(s)')
    if (currentAction.type === 'signMessage') return t('Finish your pending message signature')
    if (currentAction.type === 'switchAccount') return t('Finish switching accounts')
    if (currentAction.type === 'dappRequest') {
      if (currentAction.userRequest.action.kind === 'dappConnect')
        return t('Finish connecting to an app')
      if (currentAction.userRequest.action.kind === 'walletAddEthereumChain')
        return t('Finish adding a new network')
      if (currentAction.userRequest.action.kind === 'walletWatchAsset')
        return t('Finish adding a new token')
    }

    return null
  }, [currentAction, t])

  const description = useMemo(() => {
    if (!currentAction) return null

    if (currentAction.type === 'accountOp')
      return t(
        'One or more transactions are waiting for you to sign them. Would you like to open the active window?'
      )
    if (currentAction.type === 'signMessage')
      return t(
        'There is a message waiting for you to sign it. Would you like to open the active window?'
      )
    if (currentAction.type === 'switchAccount')
      return t(
        'You started switching accounts and never finished. Would you like to open the active window?'
      )
    if (currentAction.type === 'dappRequest') {
      if (currentAction.userRequest.action.kind === 'dappConnect')
        return t(
          'An app is waiting for you to connect to it. Would you like to open the active window?'
        )
      if (currentAction.userRequest.action.kind === 'walletAddEthereumChain')
        return t(
          'You started adding a new network and never finished. Would you like to open the active window?'
        )
      if (currentAction.userRequest.action.kind === 'walletWatchAsset')
        return t(
          'You started adding a new token and never finished. Would you like to open the active window?'
        )
    }

    return null
  }, [currentAction, t])

  if (
    isPopup &&
    actionWindow.windowProps &&
    currentAction &&
    !['benzin', 'unlock'].includes(currentAction.type) &&
    title &&
    description
  ) {
    return (
      <BottomSheet
        id="import-seed-phrase"
        sheetRef={sheetRef}
        closeBottomSheet={closeBottomSheet}
        backgroundColor="secondaryBackground"
        style={{ overflow: 'hidden', width: 496, ...spacings.ph0, ...spacings.pv0 }}
        type="modal"
        autoOpen
      >
        <DualChoiceModal
          title={title}
          description={description}
          Icon={PendingActionWindowIcon}
          primaryButtonText={t('Open Active Window')}
          onPrimaryButtonPress={onPrimaryButtonPress}
          onCloseIconPress={closeBottomSheet}
        />
      </BottomSheet>
    )
  }

  return null
}

export default React.memo(PendingActionWindowModal)
