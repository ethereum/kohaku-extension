import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import common from '@common/styles/utils/common'
import { renderFullAddress } from '@web/modules/social-recovery/shared/display'

import type { OtherAccountNoticeProps } from './types'

const OtherAccountNotice = ({ account, onSwitch, testID }: OtherAccountNoticeProps) => {
  const { t } = useTranslation()
  const { theme } = useTheme()

  return (
    <View
      testID={testID}
      style={[
        common.borderRadiusPrimary,
        spacings.phSm,
        spacings.pvSm,
        spacings.mbLg,
        {
          borderWidth: 1,
          borderColor: theme.warningDecorative,
          backgroundColor: theme.warningBackground
        }
      ]}
    >
      <Text fontSize={14} weight="semiBold" style={spacings.mbTy}>
        {t('socialRecovery.chrome.otherAccount.title')}
      </Text>
      <Text fontSize={12} appearance="secondaryText" style={spacings.mbSm}>
        {t('socialRecovery.chrome.otherAccount.body', { account: renderFullAddress(account) })}
      </Text>
      <Button
        testID={testID ? `${testID}-switch` : undefined}
        type="secondary"
        size="small"
        text={t('socialRecovery.chrome.otherAccount.switchAction')}
        onPress={onSwitch}
        hasBottomSpacing={false}
      />
    </View>
  )
}

export default React.memo(OtherAccountNotice)
