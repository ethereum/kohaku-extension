import React, { useCallback, useMemo } from 'react'
import { View } from 'react-native'

import { isDappRequestAction } from '@ambire-common/libs/actions/actions'
import ManifestFallbackIcon from '@common/assets/svg/ManifestFallbackIcon'
import Button from '@common/components/Button'
import Panel from '@common/components/Panel'
import ScrollableWrapper from '@common/components/ScrollableWrapper'
import Text from '@common/components/Text'
import Title from '@common/components/Title'
import { Trans, useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import flexboxStyles from '@common/styles/utils/flexbox'
import textStyles from '@common/styles/utils/text'
import HeaderAccountAndNetworkInfo from '@web/components/HeaderAccountAndNetworkInfo'
import ManifestImage from '@web/components/ManifestImage'
import useActionsControllerState from '@web/hooks/useActionsControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'

import styles from './styles'

const GetEncryptionPublicKeyRequestScreen = () => {
  const { t } = useTranslation()
  const { dispatch } = useBackgroundService()
  const state = useActionsControllerState()
  const { theme } = useTheme()
  const dappAction = useMemo(
    () => (isDappRequestAction(state.currentAction) ? state.currentAction : null),
    [state.currentAction]
  )

  const userRequest = useMemo(() => {
    if (!dappAction) return null

    return dappAction?.userRequest || null
  }, [dappAction])

  const handleDeny = useCallback(() => {
    if (!dappAction) return

    dispatch({
      type: 'REQUESTS_CONTROLLER_REJECT_USER_REQUEST',
      params: { err: t('User rejected the request.'), id: dappAction.id }
    })
  }, [dappAction, t, dispatch])

  return (
    <>
      <HeaderAccountAndNetworkInfo />
      <ScrollableWrapper hasBottomTabNav={false}>
        <Panel>
          <View style={[spacings.pvSm, flexboxStyles.alignCenter]}>
            <ManifestImage
              uri={userRequest?.session?.icon}
              size={64}
              fallback={() => <ManifestFallbackIcon />}
            />
          </View>

          <Title style={[textStyles.center, spacings.phSm, spacings.pbLg]}>
            {userRequest?.session?.origin ? new URL(userRequest.session.origin).hostname : ''}
          </Title>

          <View>
            <Trans>
              <Text style={[textStyles.center, spacings.phSm, spacings.mbLg]}>
                <Text fontSize={14} weight="regular">
                  {'The App '}
                </Text>
                <Text fontSize={14} weight="regular" color={theme.primaryLight}>
                  {userRequest?.session?.name || ''}
                </Text>
                <Text fontSize={14} weight="regular">
                  {
                    ' wants to get your public encryption key. This method is deprecated and Ambire does not support it.'
                  }
                </Text>
              </Text>
            </Trans>
          </View>

          <View style={styles.buttonsContainer}>
            <View style={styles.buttonWrapper}>
              <Button type="outline" onPress={handleDeny} text={t('Okay')} />
            </View>
          </View>
        </Panel>
      </ScrollableWrapper>
    </>
  )
}

export default React.memo(GetEncryptionPublicKeyRequestScreen)
