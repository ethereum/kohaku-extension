/**
 * A row the checklist asks nothing: a method this wallet does not know, or a
 * passport or an Aadhaar identity the client cannot claim here. It shows its
 * kind name, or the method's address, and its chip, and offers no action.
 */
import React from 'react'

import { useTranslation } from '@common/config/localization'
import { renderShortAddress } from '@web/modules/social-recovery/shared/display'
import { kindNameOf } from '@web/modules/social-recovery/setup/review'

import RowFrame from './RowFrame'
import type { IdentityRowProps } from './types'

const IdentityRow = ({ row, state }: IdentityRowProps) => {
  const { t } = useTranslation()

  return (
    <RowFrame
      row={row}
      state={state}
      title={row.kind ? kindNameOf(row.kind, t) : renderShortAddress(row.gatheringPlace.method)}
      label={row.gatheringPlace.label?.trim() || undefined}
    />
  )
}

export default React.memo(IdentityRow)
