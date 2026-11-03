/**
 * A read in front of an editor screen that this wallet's version cannot
 * answer: the wallet needs an update.
 */
import React from 'react'

import Alert from '@common/components/Alert'
import { useTranslation } from '@common/config/localization'

import type { ReadsBlockProps } from './types'

const ReadsUpdateTheWallet = ({ testID }: ReadsBlockProps) => {
  const { t } = useTranslation()
  return (
    <Alert
      testID={testID}
      type="error"
      size="sm"
      title={t('socialRecovery.client.updateTheWalletTitle')}
      text={t('socialRecovery.client.updateTheWalletHow')}
    />
  )
}

export default React.memo(ReadsUpdateTheWallet)
