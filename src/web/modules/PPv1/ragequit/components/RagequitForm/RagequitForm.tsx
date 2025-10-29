import React from 'react'
import { View } from 'react-native'

import ScrollableWrapper from '@common/components/ScrollableWrapper'
import Text from '@common/components/Text'
import Panel from '@common/components/Panel'
import TokenIcon from '@common/components/TokenIcon'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { formatEther, zeroAddress } from 'viem'
import { PoolInfo } from '@ambire-common/controllers/privacyPools/config'
import { PoolAccount } from '@web/contexts/privacyPoolsControllerStateContext'
import ErrorIcon from '@common/assets/svg/ErrorIcon'
import styles from './styles'

function RagequitForm({
  poolInfo,
  // totalPendingBalance,
  totalDeclinedBalance,
  ethPrice,
  chainId
}: {
  poolInfo?: PoolInfo
  // totalPendingBalance: { total: bigint; accounts: PoolAccount[] }
  totalDeclinedBalance: { total: bigint; accounts: PoolAccount[] }
  ethPrice: number
  chainId: bigint
}) {
  const { t } = useTranslation()

  const ragequitableAccounts = [
    // ...totalPendingBalance.accounts,
    ...totalDeclinedBalance.accounts
  ].filter((account) => !account.ragequit)

  if (!poolInfo) {
    return (
      <ScrollableWrapper contentContainerStyle={styles.container}>
        <View style={spacings.mbLg}>
          <Text appearance="secondaryText" fontSize={14} weight="regular" style={spacings.mbMi}>
            {t('No privacy pool available on this chain. Please switch to Sepolia testnet.')}
          </Text>
        </View>
      </ScrollableWrapper>
    )
  }

  if (ragequitableAccounts.length === 0) {
    return (
      <ScrollableWrapper contentContainerStyle={styles.container}>
        <View style={spacings.mbLg}>
          <Panel style={spacings.mtLg}>
            <Text appearance="secondaryText" fontSize={14} weight="regular">
              {t(
                'No accounts available to ragequit. Only pending or declined accounts can exit the pool.'
              )}
            </Text>
          </Panel>
        </View>
      </ScrollableWrapper>
    )
  }

  return (
    <ScrollableWrapper contentContainerStyle={styles.container}>
      {/* Rejected Status Banner */}
      <View
        style={[
          spacings.mbLg,
          spacings.pMd,
          {
            backgroundColor: '#fee',
            borderRadius: 8,
            borderWidth: 1,
            borderColor: '#fcc',
            padding: 8
          }
        ]}
      >
        <View style={[flexbox.directionRow, flexbox.alignStart]}>
          <View
            style={[
              {
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: '#fdd',
                marginRight: 12
              },
              flexbox.alignCenter,
              flexbox.justifyCenter
            ]}
          >
            <ErrorIcon width={24} height={24} color="#c33" />
          </View>
          <View style={flexbox.flex1}>
            <Text weight="semiBold" fontSize={16} style={spacings.mbMi}>
              {t('Rejected')}
            </Text>
            <Text appearance="secondaryText" fontSize={14} weight="regular">
              {t(
                'Funds have been declined. By public exiting back, funds will be publicly send back to your account.'
              )}
            </Text>
          </View>
        </View>
      </View>

      {/* Table Header */}
      <View
        style={[
          flexbox.directionRow,
          flexbox.justifySpaceBetween,
          flexbox.alignCenter,
          spacings.mbMd,
          spacings.phMi
        ]}
      >
        <View style={{ flex: 2 }}>
          <Text appearance="secondaryText" fontSize={12} weight="semiBold">
            {t('ASSET/AMOUNT')}
          </Text>
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text appearance="secondaryText" fontSize={12} weight="semiBold">
            {t('STATUS')}
          </Text>
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text appearance="secondaryText" fontSize={12} weight="semiBold">
            {t('USD VALUE')}
          </Text>
        </View>
      </View>

      {/* Asset Rows - One per account */}
      {ragequitableAccounts.map((account) => {
        const usdValue = Number(formatEther(account.balance)) * ethPrice
        const statusLabel = account.reviewStatus === 'pending' ? t('Pending') : t('Declined')
        const statusColor = account.reviewStatus === 'pending' ? '#f90' : '#c33'

        return (
          <View
            key={`${account.chainId}-${account.name}`}
            style={[
              flexbox.directionRow,
              flexbox.justifySpaceBetween,
              flexbox.alignCenter,
              spacings.pMi,
              spacings.mbMd
            ]}
          >
            <View style={[flexbox.directionRow, flexbox.alignCenter, { flex: 2 }]}>
              <TokenIcon
                chainId={chainId}
                address={zeroAddress}
                width={40}
                height={40}
                containerWidth={40}
                containerHeight={40}
                withContainer
                withNetworkIcon
                networkSize={14}
              />
              <View style={spacings.mlMi}>
                <Text weight="medium" fontSize={16}>
                  ETH #{account.name}
                </Text>
                <Text appearance="secondaryText" fontSize={14} weight="light">
                  {formatEther(account.balance)}
                </Text>
              </View>
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <View
                style={{
                  backgroundColor: `${statusColor}20`,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 4
                }}
              >
                <Text weight="medium" fontSize={12} style={{ color: statusColor }}>
                  {statusLabel}
                </Text>
              </View>
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end', paddingRight: 8 }}>
              <Text weight="medium" fontSize={16}>
                ${usdValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </Text>
            </View>
          </View>
        )
      })}
    </ScrollableWrapper>
  )
}

export default React.memo(RagequitForm)
