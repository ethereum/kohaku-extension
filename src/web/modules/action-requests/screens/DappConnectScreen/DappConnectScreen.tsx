/* eslint-disable react/jsx-no-useless-fragment */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'

import { isDappRequestAction } from '@ambire-common/libs/actions/actions'
import wait from '@ambire-common/utils/wait'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import useWindowSize from '@common/hooks/useWindowSize'
import Header from '@common/modules/header/components/Header'
import { TabLayoutContainer } from '@web/components/TabLayoutWrapper/TabLayoutWrapper'
import eventBus from '@web/extension-services/event/eventBus'
import useActionsControllerState from '@web/hooks/useActionsControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import ActionFooter from '@web/modules/action-requests/components/ActionFooter'

import DAppConnectBody from './components/DAppConnectBody'
import DAppConnectHeader from './components/DAppConnectHeader'
import getStyles from './styles'

// Screen for dApps authorization to connect to extension - will be triggered on dApp connect request
const DappConnectScreen = () => {
  const { t } = useTranslation()
  const { theme, styles } = useTheme(getStyles)
  const { dispatch } = useBackgroundService()
  const state = useActionsControllerState()
  const [isAuthorizing, setIsAuthorizing] = useState(false)
  const { minHeightSize } = useWindowSize()
  const securityCheckCalled = useRef(false)
  const [securityCheck, setSecurityCheck] = useState<'BLACKLISTED' | 'NOT_BLACKLISTED' | 'LOADING'>(
    'LOADING'
  )
  const [confirmedRiskCheckbox, setConfirmedRiskCheckbox] = useState(false)

  const dappAction = useMemo(
    () => (isDappRequestAction(state.currentAction) ? state.currentAction : null),
    [state.currentAction]
  )

  const userRequest = useMemo(() => {
    if (!dappAction) return undefined
    if (dappAction.userRequest.action.kind !== 'dappConnect') return undefined

    return dappAction.userRequest
  }, [dappAction])

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    ;(async () => {
      if (!userRequest?.session?.origin) return
      if (securityCheckCalled.current) return

      // slow down the res a bit for better UX
      await wait(1000)

      securityCheckCalled.current = true
      dispatch({
        type: 'PHISHING_CONTROLLER_GET_IS_BLACKLISTED_AND_SEND_TO_UI',
        params: { url: userRequest.session.origin }
      })
    })()
  }, [dispatch, userRequest?.session?.origin])

  useEffect(() => {
    const onReceiveOneTimeData = (data: any) => {
      if (!data.hostname) return

      setSecurityCheck(data.hostname)
    }

    eventBus.addEventListener('receiveOneTimeData', onReceiveOneTimeData)

    return () => eventBus.removeEventListener('receiveOneTimeData', onReceiveOneTimeData)
  }, [])

  const handleDenyButtonPress = useCallback(() => {
    if (!dappAction) return

    dispatch({
      type: 'REQUESTS_CONTROLLER_REJECT_USER_REQUEST',
      params: { err: t('User rejected the request.'), id: dappAction.id }
    })
  }, [dappAction, t, dispatch])

  const handleAuthorizeButtonPress = useCallback(() => {
    if (!dappAction) return

    setIsAuthorizing(true)
    dispatch({
      type: 'REQUESTS_CONTROLLER_RESOLVE_USER_REQUEST',
      params: { data: null, id: dappAction.id }
    })
  }, [dappAction, dispatch])

  const responsiveSizeMultiplier = useMemo(() => {
    if (minHeightSize(690)) return 0.75
    if (minHeightSize(720)) return 0.8
    if (minHeightSize(750)) return 0.85
    if (minHeightSize(780)) return 0.9
    if (minHeightSize(810)) return 0.95

    return 1
  }, [minHeightSize])

  const resolveButtonText = useMemo(() => {
    if (securityCheck === 'LOADING') return t('Loading...')
    if (isAuthorizing) return t('Connecting...')
    if (securityCheck === 'BLACKLISTED') return t('Continue anyway')

    return t('Connect')
  }, [isAuthorizing, securityCheck, t])

  return (
    <TabLayoutContainer
      width="full"
      backgroundColor={theme.quinaryBackground}
      header={
        <Header
          mode="custom-inner-content"
          withAmbireLogo
          backgroundColor={theme.quinaryBackground as string}
        />
      }
      footer={
        <ActionFooter
          onReject={handleDenyButtonPress}
          onResolve={handleAuthorizeButtonPress}
          resolveButtonText={resolveButtonText}
          resolveDisabled={
            isAuthorizing ||
            securityCheck === 'LOADING' ||
            (securityCheck === 'BLACKLISTED' && !confirmedRiskCheckbox)
          }
          resolveType={securityCheck === 'BLACKLISTED' ? 'error' : 'primary'}
          rejectButtonText={t('Deny')}
          resolveButtonTestID="dapp-connect-button"
        />
      }
    >
      <View style={[styles.container]}>
        <View style={styles.content}>
          <DAppConnectHeader
            name={userRequest?.session?.name}
            origin={userRequest?.session?.origin}
            icon={userRequest?.session?.icon}
            securityCheck={securityCheck}
            responsiveSizeMultiplier={responsiveSizeMultiplier}
          />
          <DAppConnectBody
            securityCheck={securityCheck}
            responsiveSizeMultiplier={responsiveSizeMultiplier}
            confirmedRiskCheckbox={confirmedRiskCheckbox}
            setConfirmedRiskCheckbox={setConfirmedRiskCheckbox}
          />
        </View>
      </View>
    </TabLayoutContainer>
  )
}

export default React.memo(DappConnectScreen)
