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
import flexbox from '@common/styles/utils/flexbox'
import {
  ActionsRow,
  PageTitle,
  SectionCard,
  SectionLabel
} from '@web/modules/social-recovery/shared/chrome'
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
      <PageTitle title={t(`${DISAGREED}.title`)} titleTestID="arm-disagreed-title">
        <Text fontSize={14} appearance="secondaryText" testID="arm-disagreed-body">
          {t(`${DISAGREED}.body`)}
        </Text>
      </PageTitle>

      {!!check && (
        <SectionCard tone="muted">
          <SectionLabel>{t(`${DISAGREED}.checkHeader`)}</SectionLabel>
          <Text fontSize={14} style={spacings.mbTy} testID="arm-disagreed-check">
            {t(disagreedLineKeyOf(check))}
          </Text>
          <Text fontSize={14} weight="medium" testID="arm-disagreed-do-not-rely">
            {t(`${DISAGREED}.doNotRely`)}
          </Text>
        </SectionCard>
      )}

      {!!transactionHash && (
        <SectionCard testID="arm-disagreed-transaction">
          <SectionLabel>{t('socialRecovery.arm.savedOnChain')}</SectionLabel>
          <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.wrap]}>
            <Text fontSize={14} weight="number_medium" selectable style={spacings.mrSm}>
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
        </SectionCard>
      )}

      <ActionsRow
        primary={
          check ? (
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
          )
        }
      />
    </View>
  )
}

export default React.memo(DisagreedView)
