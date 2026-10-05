/**
 * The save that landed but cannot be confirmed: the check after the landing
 * disagreed, or it did not answer. It never reads as saved. A check that
 * disagreed names itself and leads to removing the setup and saving it again;
 * a check that did not answer offers to read it again. Both show the landed
 * transaction under the saved-on-chain header, with its explorer page, where
 * the hash is known.
 */
import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import { renderHash } from '@web/modules/social-recovery/shared/display'

import { disagreedLineKeyOf } from './copy'
import { explorerTransactionUrlOf } from './saved'
import type { DisagreedViewProps } from './types'

const DISAGREED = 'socialRecovery.arm.disagreed'

const DisagreedView = ({
  transactionHash,
  chain,
  check,
  onReread,
  navigate,
  openUrl
}: DisagreedViewProps) => {
  const { t } = useTranslation()

  return (
    <View testID={check ? `arm-disagreed-${check}` : 'arm-unread'}>
      <Text fontSize={20} weight="semiBold" style={spacings.mbTy} testID="arm-disagreed-title">
        {t(`${DISAGREED}.title`)}
      </Text>
      <Text
        fontSize={14}
        appearance="secondaryText"
        style={spacings.mbLg}
        testID="arm-disagreed-body"
      >
        {t(`${DISAGREED}.body`)}
      </Text>

      {!!check && (
        <View style={spacings.mbLg}>
          <Text fontSize={12} weight="semiBold" appearance="secondaryText" style={spacings.mbTy}>
            {t(`${DISAGREED}.checkHeader`)}
          </Text>
          <Text fontSize={14} style={spacings.mbTy} testID="arm-disagreed-check">
            {t(disagreedLineKeyOf(check))}
          </Text>
          <Text fontSize={14} weight="medium" testID="arm-disagreed-do-not-rely">
            {t(`${DISAGREED}.doNotRely`)}
          </Text>
        </View>
      )}

      {!!transactionHash && (
        <View style={spacings.mbLg} testID="arm-disagreed-transaction">
          <Text fontSize={12} weight="semiBold" appearance="secondaryText" style={spacings.mbTy}>
            {t('socialRecovery.arm.savedOnChain')}
          </Text>
          <Text fontSize={14} weight="number_medium" selectable style={spacings.mbTy}>
            {renderHash(transactionHash)}
          </Text>
          <Button
            testID="arm-disagreed-explorer"
            type="ghost"
            size="small"
            text={t('socialRecovery.arm.explorer')}
            onPress={() => openUrl(explorerTransactionUrlOf(chain, transactionHash))}
            hasBottomSpacing={false}
          />
        </View>
      )}

      {check ? (
        <Button
          testID="arm-disagreed-remove-and-save"
          type="primary"
          text={t(`${DISAGREED}.removeAndSave`)}
          onPress={() => navigate(WEB_ROUTES.socialRecoveryManage)}
          hasBottomSpacing={false}
        />
      ) : (
        <Button
          testID="arm-unread-retry"
          type="primary"
          text={t('socialRecovery.writes.tryAgain')}
          onPress={onReread}
          hasBottomSpacing={false}
        />
      )}
    </View>
  )
}

export default React.memo(DisagreedView)
