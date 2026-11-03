/** The account being recovered as one line, in its short form, with the network it lives on. */
import React from 'react'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { renderShortAddress } from '@web/modules/social-recovery/shared/display'

import type { AccountLineProps } from './types'

const LINE = 'socialRecovery.entry.accountLine'

const AccountLine = ({ account, networkName, testID }: AccountLineProps) => {
  const { t } = useTranslation()

  return (
    <Text fontSize={14} appearance="secondaryText" style={spacings.mbSm} testID={testID}>
      {t(`${LINE}.label`)}{' '}
      <Text fontSize={14} weight="number_medium" testID={`${testID}-address`}>
        {renderShortAddress(account)}
      </Text>{' '}
      <Text fontSize={14} appearance="secondaryText" testID={`${testID}-network`}>
        {t(`${LINE}.network`, { network: networkName })}
      </Text>
    </Text>
  )
}

export default React.memo(AccountLine)
