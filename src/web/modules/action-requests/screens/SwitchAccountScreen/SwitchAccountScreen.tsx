import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { isDappRequestAction } from '@ambire-common/libs/actions/actions'
import DownArrowLongIcon from '@common/assets/svg/DownArrowLongIcon'
import ManifestFallbackIcon from '@common/assets/svg/ManifestFallbackIcon'
import AmbireLogoHorizontal from '@common/components/AmbireLogoHorizontal'
import SkeletonLoader from '@common/components/SkeletonLoader'
import Text from '@common/components/Text'
import useTheme from '@common/hooks/useTheme'
import useToast from '@common/hooks/useToast'
import useWindowSize from '@common/hooks/useWindowSize'
import spacings, { SPACING_LG, SPACING_SM } from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import text from '@common/styles/utils/text'
import ManifestImage from '@web/components/ManifestImage'
import { TabLayoutContainer } from '@web/components/TabLayoutWrapper/TabLayoutWrapper'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useActionsControllerState from '@web/hooks/useActionsControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import ActionFooter from '@web/modules/action-requests/components/ActionFooter'

import Account from './components/Account'
import getStyles from './styles'

const SwitchAccountScreen = () => {
  const { t } = useTranslation()
  const { theme, styles } = useTheme(getStyles)
  const { addToast } = useToast()
  const { account } = useSelectedAccountControllerState()
  const { dispatch } = useBackgroundService()
  const state = useActionsControllerState()
  const { accounts } = useAccountsControllerState()
  const [isAuthorizing, setIsAuthorizing] = useState(false)
  const { minHeightSize } = useWindowSize()
  const dAppAction = useMemo(
    () => (isDappRequestAction(state.currentAction) ? state.currentAction : null),
    [state.currentAction]
  )

  const userRequest = useMemo(() => {
    if (dAppAction?.userRequest?.action?.kind !== 'switchAccount') return null

    return dAppAction.userRequest
  }, [dAppAction])

  const nextAccount = userRequest?.action.params?.switchToAccountAddr
  const nextRequestType = userRequest?.action.params?.nextRequestType
  const nextAccountData = useMemo(() => {
    if (!nextAccount) return null

    return accounts.find((acc) => acc.addr === nextAccount) || null
  }, [accounts, nextAccount])
  const nextRequestLabel = useMemo(() => {
    if (nextRequestType === 'calls') return 'transaction signature'
    if (nextRequestType === 'message') return 'message signature'

    return 'unknown request'
  }, [nextRequestType])

  const dAppData = useMemo(() => userRequest?.session, [userRequest?.session])

  const handleDenyButtonPress = useCallback(() => {
    if (!dAppAction) return

    dispatch({
      type: 'REQUESTS_CONTROLLER_REJECT_USER_REQUEST',
      params: { err: t('User rejected the request.'), id: dAppAction.id }
    })
  }, [dAppAction, t, dispatch])

  const handleAuthorizeButtonPress = useCallback(() => {
    if (!dAppAction) return

    if (!nextAccount) {
      addToast(
        t(
          'We are unable to switch to that account. Please reinitate the app request or contact support if the issue persists.'
        ),
        {
          type: 'error'
        }
      )
      return
    }

    setIsAuthorizing(true)

    dispatch({
      type: 'MAIN_CONTROLLER_SELECT_ACCOUNT',
      params: { accountAddr: nextAccount }
    })
  }, [addToast, dAppAction, dispatch, nextAccount, t])

  const responsiveSizeMultiplier = useMemo(() => {
    if (minHeightSize('s')) return 0.85
    if (minHeightSize('m')) return 0.95

    return 1
  }, [minHeightSize])

  // Resolve the request
  useEffect(() => {
    if (account?.addr !== nextAccount || !userRequest || !dAppAction) return

    dispatch({
      type: 'REQUESTS_CONTROLLER_RESOLVE_USER_REQUEST',
      params: { data: null, id: dAppAction.id }
    })
  }, [account?.addr, dAppAction, dispatch, nextAccount, userRequest])

  return (
    <TabLayoutContainer
      width="full"
      backgroundColor={theme.secondaryBackground}
      footer={
        <ActionFooter
          onReject={handleDenyButtonPress}
          onResolve={handleAuthorizeButtonPress}
          resolveButtonText={isAuthorizing ? t('Switching...') : t('Switch Account')}
          resolveDisabled={isAuthorizing}
          rejectButtonText={t('Deny')}
          resolveButtonTestID="switch-account-button"
        />
      }
    >
      <View
        style={[
          styles.container,
          {
            paddingVertical: SPACING_LG * responsiveSizeMultiplier,
            width: responsiveSizeMultiplier * 530
          }
        ]}
      >
        <AmbireLogoHorizontal
          style={{ marginBottom: SPACING_LG * responsiveSizeMultiplier, minHeight: 28 }}
        />
        {!isAuthorizing ? (
          <View style={styles.content}>
            <View
              style={{
                height: 60,
                ...flexbox.center,
                backgroundColor: theme.tertiaryBackground
              }}
            >
              <Text fontSize={20} weight="medium">
                {t('Switch Account Request')}
              </Text>
            </View>
            <View
              style={{
                backgroundColor: theme.primaryBackground,
                ...flexbox.alignCenter,
                ...spacings.pv,
                ...spacings.phLg,
                ...spacings.pbLg
              }}
            >
              {!!dAppData && (
                <View
                  style={[
                    flexbox.center,
                    {
                      marginBottom: SPACING_SM * responsiveSizeMultiplier
                    }
                  ]}
                >
                  <ManifestImage
                    uri={dAppData.icon}
                    size={responsiveSizeMultiplier * 56}
                    containerStyle={{
                      backgroundColor: theme.secondaryBackground
                    }}
                    iconScale={0.85}
                    imageStyle={{
                      backgroundColor: theme.secondaryBackground
                    }}
                    fallback={() => (
                      <ManifestFallbackIcon
                        width={responsiveSizeMultiplier * 56}
                        height={responsiveSizeMultiplier * 56}
                      />
                    )}
                  />
                </View>
              )}
              {!!dAppData && (
                <Text appearance="secondaryText" style={[spacings.mbSm, text.center]} fontSize={16}>
                  <Text appearance="primaryText" fontSize={16} weight="medium">
                    {dAppData.name}
                  </Text>{' '}
                  {t(`requires a ${nextRequestLabel} from `)}
                  <Text appearance="primaryText" fontSize={16} weight="medium">
                    {nextAccountData?.preferences.label ||
                      nextAccountData?.addr ||
                      'Unknown Account'}
                  </Text>
                </Text>
              )}

              {account && <Account style={spacings.mbSm} {...account} />}
              <DownArrowLongIcon
                style={[spacings.mbSm]}
                color={theme.secondaryText}
                width={16}
                height={16}
              />
              {nextAccountData ? (
                <Account
                  addr={nextAccountData?.addr || ''}
                  creation={nextAccountData?.creation || null}
                  preferences={
                    nextAccountData?.preferences || {
                      pfp: '',
                      label: ''
                    }
                  }
                  style={spacings.mbLg}
                />
              ) : (
                <Text appearance="errorText" style={spacings.mbLg} fontSize={16}>
                  {t('Invalid account data')}
                </Text>
              )}
              <Text style={text.center} appearance="secondaryText" fontSize={16}>
                {t(
                  'Would you like to switch to this account now to continue with the signing process?'
                )}
              </Text>
            </View>
          </View>
        ) : (
          <SkeletonLoader
            style={{
              ...styles.container,
              paddingVertical: SPACING_LG * responsiveSizeMultiplier
            }}
            width={responsiveSizeMultiplier * 450}
            height={responsiveSizeMultiplier * 450}
            appearance="primaryBackground"
          />
        )}
      </View>
    </TabLayoutContainer>
  )
}

export default SwitchAccountScreen
