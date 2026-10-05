/**
 * The client's state where it is not ready: a spinner while it loads, and the
 * pair of lines with a retry where this wallet cannot read the account's setup
 * or could not reach the recovery kit.
 */
import React from 'react'
import { ActivityIndicator, View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'

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
    <Alert
      testID={`enroll-client-${client.status}`}
      type="error"
      size="sm"
      style={spacings.mbSm}
      title={
        refused
          ? t('socialRecovery.client.updateTheWalletTitle')
          : t('socialRecovery.client.unavailableTitle')
      }
      text={
        refused
          ? t('socialRecovery.client.updateTheWalletBody')
          : t('socialRecovery.client.unavailableBody')
      }
    >
      <View style={[flexbox.directionRow, spacings.mtTy]}>
        <Button
          testID="enroll-client-retry"
          type="secondary"
          size="small"
          text={t('socialRecovery.writes.tryAgain')}
          onPress={client.retry}
          hasBottomSpacing={false}
        />
      </View>
    </Alert>
  )
}

export default React.memo(ClientStateLine)
