import React, { FC, useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { Action } from '@ambire-common/libs/selectedAccount/errors'
import Select from '@common/components/Select'
import Text from '@common/components/Text'
import useToast from '@common/hooks/useToast'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'

type Props = Action & {
  closeBottomSheet: () => void
}

const BalanceAffectingErrorActions: FC<Props> = ({ actionName, meta, closeBottomSheet }) => {
  const { t } = useTranslation()
  const { dispatch } = useBackgroundService()
  const { networks, statuses } = useNetworksControllerState()
  const { addToast } = useToast()

  if (actionName === 'select-rpc-url') {
    const network = useMemo(() => {
      return networks.find((n) => n.chainId === meta?.network?.chainId)
    }, [meta?.network?.chainId, networks])

    useEffect(() => {
      if (statuses.updateNetwork === 'SUCCESS') {
        addToast(
          t('Successfully switched the RPC URL for {{network}}', {
            network: network?.name || 'Unknown network'
          })
        )
      }
    }, [addToast, network?.name, statuses.updateNetwork, t])

    const handleSelectRpcUrl = useCallback(
      ({ value }: any) => {
        if (network) {
          dispatch({
            type: 'SETTINGS_CONTROLLER_SET_NETWORK_TO_ADD_OR_UPDATE',
            params: { rpcUrl: value, chainId: BigInt(network.chainId) }
          })
          // dispatch on next tick
          setTimeout(() => {
            dispatch({
              type: 'MAIN_CONTROLLER_UPDATE_NETWORK',
              params: { network: { selectedRpcUrl: value }, chainId: network.chainId }
            })
          }, 1)
          closeBottomSheet()
          addToast(t('The RPC url will be updated shortly.', { type: 'info' }))
        }
      },
      [addToast, closeBottomSheet, dispatch, network, t]
    )

    const selectOptions = useMemo(() => {
      if (!network) return []
      return network?.rpcUrls.map((rpcUrl) => ({ value: rpcUrl, label: rpcUrl }))
    }, [network])

    return (
      <View key={actionName} style={[flexbox.directionRow, flexbox.alignCenter, spacings.mtSm]}>
        <Text fontSize={14} appearance="secondaryText" style={spacings.mrSm}>
          {t('Select RPC URL')}
        </Text>
        <Select
          key={actionName}
          value={{ value: network?.selectedRpcUrl || '', label: network?.selectedRpcUrl }}
          options={selectOptions}
          setValue={handleSelectRpcUrl}
          size="sm"
          containerStyle={{ ...flexbox.flex1, ...spacings.mb0 }}
        />
      </View>
    )
  }

  return null
}

export default BalanceAffectingErrorActions
