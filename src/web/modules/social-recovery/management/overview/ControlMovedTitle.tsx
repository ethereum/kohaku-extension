/**
 * The overview's title once a recovery moved control away from this device:
 * the account is no longer controlled from here, when control moved where the
 * watcher read it, and the transaction that moved it where the watcher kept
 * its hash.
 */
import React from 'react'

import Button from '@common/components/Button'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { PageTitle } from '@web/modules/social-recovery/shared/chrome'
import { renderDateTimeInZone } from '@web/modules/social-recovery/shared/display'

import { CONTROL_MOVED } from './constants'
import type { ControlMovedTitleProps } from './types'

const ControlMovedTitle = ({ notice, timeZone, onTransaction }: ControlMovedTitleProps) => {
  const { t } = useTranslation()
  const { at, transactionHash } = notice
  return (
    <PageTitle
      title={t(`${CONTROL_MOVED}.title`)}
      lead={
        at !== undefined
          ? t(`${CONTROL_MOVED}.lead`, { date: renderDateTimeInZone(at * 1000, timeZone).date })
          : t(`${CONTROL_MOVED}.noTime`)
      }
      titleTestID="overview-title"
      testID="overview-control-moved-title"
    >
      {!!transactionHash && (
        <Button
          testID="overview-control-moved-transaction"
          type="ghost"
          size="small"
          text={t(`${CONTROL_MOVED}.transaction`)}
          onPress={() => onTransaction(transactionHash)}
          hasBottomSpacing={false}
          style={[flexbox.alignSelfStart, spacings.mbTy]}
        />
      )}
    </PageTitle>
  )
}

export default React.memo(ControlMovedTitle)
