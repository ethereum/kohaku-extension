/* eslint-disable react/jsx-no-useless-fragment */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'

import { isDappRequestAction } from '@ambire-common/libs/actions/actions'
import { getDappIdFromUrl } from '@ambire-common/libs/dapps/helpers'
import wait from '@ambire-common/utils/wait'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import useWindowSize from '@common/hooks/useWindowSize'
import Header from '@common/modules/header/components/Header'
import { TabLayoutContainer } from '@web/components/TabLayoutWrapper/TabLayoutWrapper'
import eventBus from '@web/extension-services/event/eventBus'
import useActionsControllerState from '@web/hooks/useActionsControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import ActionFooter from '@web/modules/action-requests/components/ActionFooter'

import { openInTab } from '@web/extension-services/background/webapi/tab'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import DAppConnectBody from './components/DAppConnectBody'
import DAppConnectHeader from './components/DAppConnectHeader'
import getStyles from './styles'
import { DappAccount } from './components/interface'

// Screen for dApps authorization to connect to extension - will be triggered on dApp connect request
const DappConnectScreen = () => {
  const { t } = useTranslation()
  const { theme, styles } = useTheme(getStyles)
  const { dispatch } = useBackgroundService()
  const state = useActionsControllerState()
  const selectedAccount = useSelectedAccountControllerState()
  const [isAuthorizing, setIsAuthorizing] = useState(false)
  const { minHeightSize } = useWindowSize()
  const securityCheckCalled = useRef(false)
  const [securityCheck, setSecurityCheck] = useState<'BLACKLISTED' | 'NOT_BLACKLISTED' | 'LOADING'>(
    'LOADING'
  )
  const [confirmedRiskCheckbox, setConfirmedRiskCheckbox] = useState(false)
  const [dappAccount, setDappAccount] = useState<DappAccount | null>(null)

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

  const handleAuthorizeButtonPress = useCallback(
    (newAccount?: DappAccount) => {
      const account = newAccount || dappAccount
      if (!account || !dappAction) return

      const dappId = getDappIdFromUrl(userRequest?.session?.origin || '')

      setIsAuthorizing(true)
      const dappUrls = selectedAccount?.account?.associatedDappIDs || []
      dappUrls.push(dappId)
      dispatch({
        type: 'ACCOUNTS_CONTROLLER_SET_ASSOCIATED_DAPPS',
        params: {
          addr: account.address,
          dappUrls
        }
      })

      dispatch({
        type: 'MAIN_CONTROLLER_SELECT_ACCOUNT',
        params: { accountAddr: account.address }
      })
    },
    [dappAction, dappAccount?.address, dispatch]
  )

  const autoConnect = (account: DappAccount) => {
    setDappAccount(account)
    handleAuthorizeButtonPress(account)
  }

  // Automatically resolve the request once the dispatched `MAIN_CONTROLLER_SELECT_ACCOUNT`
  // from `handleAuthorizeButtonPress` has updated the selected account to match
  // the one chosen for the dApp connection.
  useEffect(() => {
    if (!isAuthorizing || !dappAction) return
    if (selectedAccount?.account?.addr !== dappAccount?.address) return

    dispatch({
      type: 'REQUESTS_CONTROLLER_RESOLVE_USER_REQUEST',
      params: { data: null, id: dappAction.id }
    })

    let timerId: NodeJS.Timeout

    if (dappAccount?.isNew) {
      timerId = setTimeout(() => {
        openInTab({
          url: `tab.html#/${WEB_ROUTES.pp1Transfer}?address=${dappAccount.address}&protocol=railgun&token=eth&fundBanner=1`,
          shouldCloseCurrentWindow: false
        })
      }, 450)
    }

    return () => {
      if (timerId) clearTimeout(timerId)
    }
  }, [isAuthorizing, selectedAccount?.account?.addr, dappAccount?.address, dappAction, dispatch])

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
            (securityCheck === 'BLACKLISTED' && !confirmedRiskCheckbox) ||
            dappAccount === null
          }
          resolveType={securityCheck === 'BLACKLISTED' ? 'error' : 'primary'}
          rejectButtonText={t('Deny')}
          resolveButtonTestID="dapp-connect-button"
        />
      }
    >
      <View style={[styles.container, { flex: 1, marginBottom: '20px' }]}>
        <View style={[styles.content, { flex: 1 }]}>
          <View style={{ flexShrink: 0 }}>
            <DAppConnectHeader
              name={userRequest?.session?.name}
              origin={userRequest?.session?.origin}
              icon={userRequest?.session?.icon}
              securityCheck={securityCheck}
              responsiveSizeMultiplier={responsiveSizeMultiplier}
            />
          </View>
          <DAppConnectBody
            securityCheck={securityCheck}
            responsiveSizeMultiplier={responsiveSizeMultiplier}
            confirmedRiskCheckbox={confirmedRiskCheckbox}
            setConfirmedRiskCheckbox={setConfirmedRiskCheckbox}
            origin={userRequest?.session?.origin}
            setSelectedAccount={setDappAccount}
            autoConnect={autoConnect}
          />
        </View>
      </View>
    </TabLayoutContainer>
  )
}

export default React.memo(DappConnectScreen)
