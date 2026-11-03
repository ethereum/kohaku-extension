/**
 * One live recovery on the home surface: the account being recovered, its
 * not submitted chip, its headline with the day it started where the client
 * can assess it, and the way to open it.
 */
import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { MethodRow, StatusChip } from '@web/modules/social-recovery/shared/chrome'
import { renderChip, renderShortAddress } from '@web/modules/social-recovery/shared/display'

import { dateOf } from './lines'
import type { HomeRecoveryLineProps } from './types'

const HOME = 'socialRecovery.home'

const HomeRecoveryLine = ({ item, timeZone, useHeadline, onOpen }: HomeRecoveryLineProps) => {
  const { t } = useTranslation()
  const headline = useHeadline(item)
  const id = item.account.toLowerCase()

  return (
    <MethodRow testID={`home-recovery-${id}`}>
      <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]}>
        <View style={[flexbox.flex1, spacings.mrSm]}>
          <Text fontSize={14} weight="semiBold" testID={`home-recovery-${id}-account`}>
            {t(`${HOME}.recovering`, { account: renderShortAddress(item.account) })}
          </Text>
          {!!headline && (
            <Text fontSize={12} appearance="secondaryText" testID={`home-recovery-${id}-progress`}>
              {t(`${HOME}.progress`, {
                done: headline.done,
                total: headline.total,
                date: dateOf(item.startedAt, timeZone)
              })}
            </Text>
          )}
        </View>
        <StatusChip
          testID={`home-recovery-${id}-chip`}
          text={renderChip('session', 'notSubmitted', t)}
          style={spacings.mrSm}
        />
        <Button
          testID={`home-recovery-${id}-open`}
          type="secondary"
          size="small"
          text={t(`${HOME}.open`)}
          onPress={onOpen}
          hasBottomSpacing={false}
        />
      </View>
    </MethodRow>
  )
}

export default React.memo(HomeRecoveryLine)
