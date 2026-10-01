/**
 * The client's state where it is not ready: a spinner while it loads, and the
 * pair of lines with a retry where this wallet cannot read the account's setup
 * or could not reach the recovery kit.
 */
import React from 'react'
import { ActivityIndicator, View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'

import type { ClientStateProps } from './types'

const ClientStateLine = ({ client }: ClientStateProps) => {
  const { t } = useTranslation()
  if (client.status === 'ready') {
    return null
  }
  if (client.status === 'loading') {
    return <ActivityIndicator testID="enroll-client-loading" />
  }
  const refused = client.status === 'update-the-wallet'
  return (
    <View testID={`enroll-client-${client.status}`} style={spacings.mbSm}>
      <Text fontSize={14} weight="medium" appearance="errorText">
        {refused
          ? t('socialRecovery.client.updateTheWalletTitle')
          : t('socialRecovery.client.unavailableTitle')}
      </Text>
      <Text fontSize={14} appearance="secondaryText" style={spacings.mbTy}>
        {refused
          ? t('socialRecovery.client.updateTheWalletBody')
          : t('socialRecovery.client.unavailableBody')}
      </Text>
      <Button
        testID="enroll-client-retry"
        type="outline"
        text={t('socialRecovery.writes.tryAgain')}
        onPress={client.retry}
        hasBottomSpacing={false}
      />
    </View>
  )
}

export default React.memo(ClientStateLine)
