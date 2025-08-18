import React, { FC, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { TouchableOpacity } from 'react-native'

import { Session } from '@ambire-common/classes/session'
import { UserRequest } from '@ambire-common/interfaces/userRequest'
import { SubmittedAccountOp } from '@ambire-common/libs/accountOp/submittedAccountOp'
import RepeatIcon from '@common/assets/svg/RepeatIcon'
import Text from '@common/components/Text'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import useBackgroundService from '@web/hooks/useBackgroundService'

type Props = {
  accountAddr: string
  chainId: bigint
  rawCalls: SubmittedAccountOp['calls']
  textSize: number
  iconSize: number
  text?: string
}

const RepeatTransaction: FC<Props> = ({
  text,
  accountAddr,
  chainId,
  rawCalls,
  textSize,
  iconSize
}) => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const { dispatch, windowId } = useBackgroundService()

  const handleRepeatTransaction = useCallback(() => {
    if (!rawCalls) return
    const userTx = {
      kind: 'calls' as const,
      calls: rawCalls
    }

    const userRequest: UserRequest = {
      id: new Date().getTime(),
      action: userTx,
      session: new Session({ windowId }),
      meta: {
        isSignAction: true,
        chainId,
        accountAddr
      }
    }

    dispatch({
      type: 'REQUESTS_CONTROLLER_ADD_USER_REQUEST',
      params: { userRequest }
    })
  }, [rawCalls, windowId, chainId, accountAddr, dispatch])

  return (
    <TouchableOpacity
      style={[flexbox.directionRow, flexbox.alignCenter]}
      onPress={handleRepeatTransaction}
    >
      <Text fontSize={textSize} appearance="secondaryText" weight="medium" style={spacings.mrMi}>
        {text || t('Repeat Transaction')}
      </Text>
      <RepeatIcon width={iconSize} height={iconSize} color={theme.secondaryText} strokeWidth={2} />
    </TouchableOpacity>
  )
}

export default RepeatTransaction
