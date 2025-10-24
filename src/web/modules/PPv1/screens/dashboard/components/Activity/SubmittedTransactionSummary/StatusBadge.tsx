import React, { FC } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { AccountOpStatus } from '@ambire-common/libs/accountOp/types'
import Badge from '@common/components/Badge'
import Text from '@common/components/Text'
import useWindowSize from '@common/hooks/useWindowSize'
import spacings from '@common/styles/spacings'

type Props = { status?: AccountOpStatus; textSize: number }

const StatusBadge: FC<Props> = ({ status, textSize }) => {
  const { t } = useTranslation()
  const { maxWidthSize } = useWindowSize()

  switch (status) {
    case AccountOpStatus.Failure:
      return <Badge type="error" weight="medium" text={t('Failed')} withRightSpacing />

    case AccountOpStatus.Success:
      return <Badge type="success" weight="medium" text={t('Confirmed')} withRightSpacing />

    case AccountOpStatus.BroadcastButStuck:
      return (
        <View style={spacings.mrMd}>
          <Text fontSize={textSize} appearance="errorText" weight="semiBold">
            {maxWidthSize(1000)
              ? t('Dropped or stuck in mempool with fee too low')
              : t('Dropped or stuck in\nmempool with fee too low')}
          </Text>
        </View>
      )

    case AccountOpStatus.UnknownButPastNonce:
      return (
        <View style={spacings.mrMd}>
          <Text fontSize={textSize} appearance="errorText" weight="semiBold">
            {t('Replaced by fee (RBF)')}
          </Text>
        </View>
      )

    case AccountOpStatus.Rejected:
      return (
        <View style={spacings.mrMd}>
          <Text fontSize={textSize} appearance="errorText" weight="semiBold">
            {t('Failed to send')}
          </Text>
        </View>
      )

    default:
      return null
  }
}

export default StatusBadge
