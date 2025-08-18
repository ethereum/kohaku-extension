/* eslint-disable @typescript-eslint/no-floating-promises */
import { formatUnits, ZeroAddress } from 'ethers'
import React, { FC, useCallback, useEffect, useState } from 'react'
import { TouchableOpacity, View } from 'react-native'

import gasTankFeeTokens from '@ambire-common/consts/gasTankFeeTokens'
import { Network } from '@ambire-common/interfaces/network'
import { SubmittedAccountOp } from '@ambire-common/libs/accountOp/submittedAccountOp'
import { AccountOpStatus } from '@ambire-common/libs/accountOp/types'
import { resolveAssetInfo } from '@ambire-common/services/assetInfo'
import { getBenzinUrlParams } from '@ambire-common/utils/benzin'
import formatDecimals from '@ambire-common/utils/formatDecimals/formatDecimals'
import LinkIcon from '@common/assets/svg/LinkIcon'
import SkeletonLoader from '@common/components/SkeletonLoader'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import useToast from '@common/hooks/useToast'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { createTab } from '@web/extension-services/background/webapi/tab'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import { sizeMultiplier } from '@web/modules/sign-account-op/components/TransactionSummary'

import RepeatTransaction from './RepeatTransaction'
import StatusBadge from './StatusBadge'
import getStyles from './styles'
import SubmittedOn from './SubmittedOn'

type Props = {
  network: Network
  size: 'sm' | 'md' | 'lg'
  rawCalls?: SubmittedAccountOp['calls']
} & Pick<
  SubmittedAccountOp,
  'txnId' | 'identifiedBy' | 'accountAddr' | 'gasFeePayment' | 'status' | 'timestamp'
>

const Footer: FC<Props> = ({
  network,
  txnId,
  rawCalls,
  identifiedBy,
  accountAddr,
  gasFeePayment,
  status,
  size,
  timestamp
}) => {
  const { styles } = useTheme(getStyles)
  const { addToast } = useToast()
  const { networks } = useNetworksControllerState()
  const { account: selectedAccount } = useSelectedAccountControllerState()
  const { t } = useTranslation()
  const textSize = 14 * sizeMultiplier[size]
  const iconSize = 26 * sizeMultiplier[size]
  const iconSizeSm = 14 * sizeMultiplier[size]

  const canViewFee =
    status !== AccountOpStatus.Rejected &&
    status !== AccountOpStatus.BroadcastButStuck &&
    status !== AccountOpStatus.UnknownButPastNonce
  const { chainId } = network

  const [feeFormattedValue, setFeeFormattedValue] = useState<string>()

  const handleViewTransaction = useCallback(async () => {
    if (!chainId) {
      const message = t(
        "Can't open the transaction details because the network information is missing."
      )
      addToast(message, { type: 'error' })

      return
    }

    const link = `https://explorer.ambire.com/${getBenzinUrlParams({
      txnId,
      chainId: Number(chainId),
      identifiedBy
    })}`

    try {
      await createTab(link)
    } catch (e: any) {
      addToast(e?.message || 'Error opening explorer', { type: 'error' })
    }
  }, [txnId, identifiedBy, addToast, chainId, t])

  useEffect((): void => {
    const feeTokenAddress = gasFeePayment?.inToken
    const nChainId =
      gasFeePayment?.feeTokenChainId ||
      // the rest is support for legacy data (no chainId recorded for the fee)
      (feeTokenAddress === ZeroAddress && chainId) ||
      gasTankFeeTokens.find((constFeeToken: any) => constFeeToken.address === feeTokenAddress)
        ?.chainId ||
      chainId

    // did is used to avoid tokenNetwork being Network | undefined
    // the assumption is that we cant pay the fee with token on network that is not present
    const tokenNetwork = networks.filter((n: Network) => n.chainId === nChainId)[0]

    const feeTokenAmount = gasFeePayment?.amount
    if (!feeTokenAddress || !tokenNetwork || !feeTokenAmount) return

    resolveAssetInfo(feeTokenAddress, tokenNetwork, ({ tokenInfo }) => {
      if (!tokenInfo || !gasFeePayment?.amount) return

      const fee = parseFloat(formatUnits(feeTokenAmount, tokenInfo.decimals))

      setFeeFormattedValue(`${formatDecimals(fee)} ${tokenInfo.symbol}`)
    }).catch((e) => {
      console.error(e)
      setFeeFormattedValue('Unknown. Please check the explorer.')
    })
  }, [
    networks,
    chainId,
    gasFeePayment?.feeTokenChainId,
    gasFeePayment?.amount,
    gasFeePayment?.inToken,
    addToast
  ])

  return (
    <View style={spacings.phMd}>
      <View style={styles.footer}>
        <StatusBadge status={status} textSize={textSize} />
        {canViewFee && (
          <View style={spacings.mrMd}>
            <Text fontSize={textSize} appearance="secondaryText" weight="semiBold">
              {t('Fee')}:
            </Text>

            {gasFeePayment?.isSponsored ? (
              <Text fontSize={12} appearance="successText" weight="semiBold">
                {t('Sponsored')}
              </Text>
            ) : (
              <Text fontSize={textSize} appearance="secondaryText">
                {feeFormattedValue || <SkeletonLoader width={80} height={21} />}
              </Text>
            )}
          </View>
        )}
        <SubmittedOn
          fontSize={textSize}
          iconSize={iconSize}
          chainId={network.chainId}
          timestamp={timestamp}
          numberOfLines={2}
        />
        <View style={[flexbox.alignEnd]}>
          <TouchableOpacity
            style={[flexbox.directionRow, flexbox.alignCenter, spacings.mbMi]}
            onPress={handleViewTransaction}
          >
            <Text
              fontSize={textSize}
              appearance="secondaryText"
              weight="medium"
              style={spacings.mrMi}
              underline
            >
              {t('View transaction')}
            </Text>
            <LinkIcon width={iconSizeSm} height={iconSizeSm} />
          </TouchableOpacity>
          {rawCalls?.length && selectedAccount?.addr === accountAddr ? (
            <RepeatTransaction
              accountAddr={accountAddr}
              chainId={network.chainId}
              rawCalls={rawCalls}
              textSize={textSize}
              iconSize={iconSizeSm}
            />
          ) : (
            <View />
          )}
        </View>
      </View>
    </View>
  )
}

export default Footer
